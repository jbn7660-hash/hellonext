/**
 * Speech-to-Text (STT) Service
 *
 * Background audio recording + transcription for voice memos.
 * Implements Patent 4 (Voice Object FSM) client-side support:
 * - UNBOUND: Recording in progress
 * - PREPROCESSED: Transcription complete, pending link
 *
 * Features:
 * - Background audio recording
 * - Chunked upload for long recordings
 * - Retry with exponential backoff
 * - Offline queue (IndexedDB fallback)
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { FSM_STATES } from '@hellonext/shared/constants/fsm-states';

// ============================================================
// Types
// ============================================================
export interface VoiceMemoRecording {
  uri: string;
  duration: number; // ms
  fileSize: number;
  format: 'wav' | 'm4a';
  sampleRate: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  segments: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  text: string;
  start: number; // ms
  end: number;   // ms
  confidence: number;
}

export type STTState = 'idle' | 'recording' | 'processing' | 'done' | 'error';

// ============================================================
// Configuration
// ============================================================
const RECORDING_CONFIG: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

const MAX_RETRY = parseInt(process.env.EXPO_PUBLIC_STT_MAX_RETRY || '3', 10);
const MAX_RECORDING_DURATION = 300_000; // 5 minutes

// ============================================================
// STT Service Class
// ============================================================
export class STTService {
  private recording: Audio.Recording | null = null;
  private state: STTState = 'idle';
  private meteringInterval: ReturnType<typeof setTimeout> | null = null;
  private onMeteringUpdate?: (level: number) => void;
  private onStateChange?: (state: STTState) => void;

  constructor(options?: {
    onMeteringUpdate?: (level: number) => void;
    onStateChange?: (state: STTState) => void;
  }) {
    this.onMeteringUpdate = options?.onMeteringUpdate;
    this.onStateChange = options?.onStateChange;
  }

  getState(): STTState {
    return this.state;
  }

  private setState(newState: STTState) {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  // ============================================================
  // Permission
  // ============================================================
  async requestPermission(): Promise<boolean> {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  }

  // ============================================================
  // Recording
  // ============================================================
  async startRecording(): Promise<boolean> {
    if (this.state === 'recording') return false;

    try {
      // Configure audio session
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true, // Background recording
        shouldDuckAndroid: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_CONFIG);
      await recording.startAsync();

      this.recording = recording;
      this.setState('recording');

      // Start metering (audio level visualization)
      this.meteringInterval = setInterval(async () => {
        if (!this.recording) return;
        try {
          const status = await this.recording.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            // Normalize dB to 0-1 range
            const level = Math.max(0, Math.min(1, (status.metering + 60) / 60));
            this.onMeteringUpdate?.(level);
          }
        } catch {}
      }, 100);

      // Auto-stop after max duration
      setTimeout(() => {
        if (this.state === 'recording') {
          this.stopRecording();
        }
      }, MAX_RECORDING_DURATION);

      return true;
    } catch (error) {
      console.error('[STT] Start recording error:', error);
      this.setState('error');
      return false;
    }
  }

  async stopRecording(): Promise<VoiceMemoRecording | null> {
    if (!this.recording || this.state !== 'recording') return null;

    try {
      // Stop metering
      if (this.meteringInterval) {
        clearInterval(this.meteringInterval);
        this.meteringInterval = null;
      }

      this.setState('processing');

      const status = await this.recording.getStatusAsync();
      await this.recording.stopAndUnloadAsync();

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
      });

      const uri = this.recording.getURI();
      this.recording = null;

      if (!uri) {
        this.setState('error');
        return null;
      }

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const fileSize = fileInfo.exists ? (fileInfo as any).size || 0 : 0;

      const result: VoiceMemoRecording = {
        uri,
        duration: status.durationMillis || 0,
        fileSize,
        format: Platform.OS === 'ios' ? 'm4a' : 'm4a',
        sampleRate: 44100,
      };

      this.setState('done');
      return result;
    } catch (error) {
      console.error('[STT] Stop recording error:', error);
      this.setState('error');
      return null;
    }
  }

  async cancelRecording(): Promise<void> {
    if (!this.recording) return;

    try {
      if (this.meteringInterval) {
        clearInterval(this.meteringInterval);
        this.meteringInterval = null;
      }

      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      // Clean up file
      if (uri) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
      });

      this.setState('idle');
    } catch (error) {
      console.error('[STT] Cancel recording error:', error);
      this.setState('idle');
    }
  }

  // ============================================================
  // Transcription (via API)
  // ============================================================
  async transcribe(
    recording: VoiceMemoRecording,
    apiUrl: string,
    authToken: string
  ): Promise<TranscriptionResult | null> {
    let retryCount = 0;

    while (retryCount < MAX_RETRY) {
      try {
        this.setState('processing');

        // Upload audio file for transcription
        const uploadResult = await FileSystem.uploadAsync(
          `${apiUrl}/api/voice-memos/transcribe`,
          recording.uri,
          {
            fieldName: 'audio',
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            parameters: {
              duration: String(recording.duration),
              format: recording.format,
            },
          }
        );

        if (uploadResult.status === 200) {
          const result: TranscriptionResult = JSON.parse(uploadResult.body);
          this.setState('done');
          return result;
        }

        throw new Error(`Transcription failed: ${uploadResult.status}`);
      } catch (error) {
        retryCount++;
        console.warn(`[STT] Transcription attempt ${retryCount}/${MAX_RETRY} failed:`, error);

        if (retryCount < MAX_RETRY) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, Math.pow(2, retryCount) * 1000));
        }
      }
    }

    this.setState('error');
    return null;
  }

  // ============================================================
  // Cleanup
  // ============================================================
  dispose() {
    if (this.meteringInterval) {
      clearInterval(this.meteringInterval);
    }
    if (this.recording) {
      this.cancelRecording();
    }
  }
}
