/**
 * useVoiceRecorder Hook
 *
 * Manages voice recording via MediaRecorder API.
 * Provides recording state, audio blob, and duration tracking.
 *
 * @module hooks/use-voice-recorder
 * @feature F-001
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '@/lib/utils/logger';
import { MAX_MEMO_DURATION_SEC, MIN_MEMO_DURATION_SEC } from '@hellonext/shared/validators/voice-memo';

export interface VoiceRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  audioLevel: number; // 0-100 for visual feedback
}

export interface VoiceRecorderActions {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
}

export function useVoiceRecorder(): VoiceRecorderState & VoiceRecorderActions {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Setup audio level monitoring
  const setupAudioLevel = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] ?? 0;
        }
        const average = sum / dataArray.length;
        const level = Math.min(100, Math.round((average / 255) * 100));
        setAudioLevel(level);

        if (isRecording && !isPaused) {
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        }
      };

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    } catch (err) {
      logger.error('Failed to setup audio level monitoring', { error: err });
    }
  }, [isRecording, isPaused]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setAudioLevel(0);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100 },
        },
      });

      streamRef.current = stream;

      // Setup audio level monitoring
      setupAudioLevel(stream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setIsRecording(false);
        setIsPaused(false);
        setAudioLevel(0);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }

        logger.info('Recording stopped', { durationSec: duration, blobSize: blob.size });
      };

      recorder.onerror = (event) => {
        setError('녹음 중 오류가 발생했습니다.');
        logger.error('MediaRecorder error', { error: event.error });
      };

      recorder.start(1000); // Collect data every second
      setIsRecording(true);
      setDuration(0);

      // Duration timer with auto-stop at max
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1;
          if (next >= MAX_MEMO_DURATION_SEC) {
            mediaRecorderRef.current?.stop();
          }
          return next;
        });
      }, 1000);

      logger.info('Recording started');
    } catch (err) {
      const message = err instanceof Error && err.name === 'NotAllowedError'
        ? '마이크 접근 권한이 필요합니다. 브라우저 설정에서 허용해주세요.'
        : '녹음을 시작할 수 없습니다.';

      setError(message);
      logger.error('Failed to start recording', { error: err });
    }
  }, [setupAudioLevel]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
      setAudioLevel(0);
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      setAudioLevel(0);
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1;
          if (next >= MAX_MEMO_DURATION_SEC) {
            mediaRecorderRef.current?.stop();
          }
          return next;
        });
      }, 1000);
      // Resume audio level monitoring
      if (animationFrameRef.current === null) {
        const updateLevel = () => {
          if (!analyserRef.current) return;
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] ?? 0;
          }
          const average = sum / dataArray.length;
          const level = Math.min(100, Math.round((average / 255) * 100));
          setAudioLevel(level);
          if (isRecording && !isPaused) {
            animationFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      }
    }
  }, [isRecording, isPaused]);

  const resetRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setError(null);
    setAudioLevel(0);
    chunksRef.current = [];
  }, [audioUrl]);

  return {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    error,
    audioLevel,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
  };
}
