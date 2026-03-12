/**
 * Swing Camera Component
 *
 * Full-screen camera view for recording golf swings.
 * Features:
 * - Timer countdown (3, 5, 10s)
 * - Recording indicator with duration
 * - Camera flip + flash toggle
 * - Gallery picker
 * - Haptic feedback on start/stop
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { CameraView, CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SwingRecorder,
  requestCameraPermission,
  pickVideoFromGallery,
} from '@/services/camera-service';
import { colors } from '@/components/ui/theme';

// ============================================================
// Props
// ============================================================
interface SwingCameraProps {
  onRecordingComplete: (uri: string, duration: number) => void;
  onClose: () => void;
  maxDuration?: number;
}

// ============================================================
// Component
// ============================================================
export function SwingCamera({
  onRecordingComplete,
  onClose,
  maxDuration = 30,
}: SwingCameraProps) {
  const cameraRef = useRef<CameraView>(null);
  const recorder = useRef(new SwingRecorder({ maxDuration }));

  const [hasPermission, setHasPermission] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timerMode, setTimerMode] = useState<0 | 3 | 5 | 10>(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Permission ──────────────────────────────────
  useEffect(() => {
    requestCameraPermission().then(setHasPermission);
    return () => {
      if (durationTimer.current) clearInterval(durationTimer.current);
    };
  }, []);

  // ── Recording pulse animation ────────────────────
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // ── Start Recording ──────────────────────────────
  const startRecording = useCallback(async () => {
    if (timerMode > 0) {
      // Countdown
      setCountdown(timerMode);
      for (let i = timerMode; i > 0; i--) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRecording(true);
    setDuration(0);

    // Start duration counter
    durationTimer.current = setInterval(() => {
      setDuration((d) => {
        if (d >= maxDuration - 1) {
          stopRecording();
          return maxDuration;
        }
        return d + 1;
      });
    }, 1000);

    await recorder.current.startRecording();
  }, [timerMode, maxDuration]);

  // ── Stop Recording ──────────────────────────────
  const stopRecording = useCallback(async () => {
    if (!isRecording) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRecording(false);

    if (durationTimer.current) {
      clearInterval(durationTimer.current);
      durationTimer.current = null;
    }

    const result = await recorder.current.stopRecording();
    if (result?.uri) {
      onRecordingComplete(result.uri, duration);
    }
  }, [isRecording, duration, onRecordingComplete]);

  // ── Camera Flip ──────────────────────────────
  const toggleFacing = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, []);

  // ── Timer Cycle ──────────────────────────────
  const cycleTimer = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimerMode((t) => {
      const cycle: (0 | 3 | 5 | 10)[] = [0, 3, 5, 10];
      const idx = cycle.indexOf(t);
      return cycle[(idx + 1) % cycle.length];
    });
  }, []);

  // ── Gallery ──────────────────────────────
  const handleGallery = useCallback(async () => {
    const uri = await pickVideoFromGallery();
    if (uri) {
      onRecordingComplete(uri, 0);
    }
  }, [onRecordingComplete]);

  // ── Format Duration ──────────────────────────
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>카메라 권한이 필요합니다</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={onClose}>
          <Text style={styles.permissionButtonText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="video"
      >
        {/* Top bar */}
        <SafeAreaView style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.iconButton}>
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>

          <View style={styles.topCenter}>
            {isRecording && (
              <View style={styles.recordingBadge}>
                <Animated.View
                  style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]}
                />
                <Text style={styles.recordingTime}>{formatDuration(duration)}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={cycleTimer} style={styles.iconButton}>
            <Ionicons
              name={timerMode === 0 ? 'timer-outline' : 'timer'}
              size={24}
              color="white"
            />
            {timerMode > 0 && (
              <Text style={styles.timerText}>{timerMode}s</Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>

        {/* Countdown overlay */}
        {countdown !== null && (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {/* Gallery */}
          <TouchableOpacity onPress={handleGallery} style={styles.sideButton}>
            <Ionicons name="images-outline" size={28} color="white" />
          </TouchableOpacity>

          {/* Record button */}
          <TouchableOpacity
            onPress={isRecording ? stopRecording : startRecording}
            style={styles.recordButtonOuter}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.recordButtonInner,
                isRecording && styles.recordButtonStop,
              ]}
            />
          </TouchableOpacity>

          {/* Flip camera */}
          <TouchableOpacity onPress={toggleFacing} style={styles.sideButton}>
            <Ionicons name="camera-reverse-outline" size={28} color="white" />
          </TouchableOpacity>
        </View>

        {/* Max duration indicator */}
        {isRecording && (
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(duration / maxDuration) * 100}%` },
              ]}
            />
          </View>
        )}
      </CameraView>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topCenter: { flex: 1, alignItems: 'center' },
  iconButton: { padding: 8, alignItems: 'center' },
  timerText: { color: 'white', fontSize: 10, fontWeight: '700', marginTop: 2 },

  // Recording badge
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  recordingTime: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // Countdown
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  countdownText: {
    fontSize: 120,
    fontWeight: '900',
    color: 'white',
    opacity: 0.9,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  sideButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ef4444',
  },
  recordButtonStop: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },

  // Progress bar
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.brand,
  },

  // Permission
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: 'white',
    fontSize: 16,
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: colors.brand,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: 'white',
    fontWeight: '700',
  },
});
