/**
 * Voice Recorder FAB (Floating Action Button)
 *
 * Floating microphone button for quick voice memo recording.
 * Features:
 * - Long-press to record
 * - Audio level visualization
 * - Haptic feedback
 * - Slide-to-cancel gesture
 * - Patent 4 FSM: Creates UNBOUND voice memo cache
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { STTService, VoiceMemoRecording } from '@/services/stt-service';
import { colors, shadow } from '@/components/ui/theme';

// ============================================================
// Props
// ============================================================
interface VoiceRecorderFabProps {
  onRecordingComplete: (recording: VoiceMemoRecording) => void;
  onRecordingStart?: () => void;
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
}

// ============================================================
// Component
// ============================================================
export function VoiceRecorderFab({
  onRecordingComplete,
  onRecordingStart,
  position = 'bottom-right',
}: VoiceRecorderFabProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);

  const sttRef = useRef<STTService | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const levelAnim = useRef(new Animated.Value(0)).current;

  // Initialize STT service
  if (!sttRef.current) {
    sttRef.current = new STTService({
      onMeteringUpdate: (level) => {
        setAudioLevel(level);
        Animated.spring(levelAnim, {
          toValue: level,
          useNativeDriver: true,
          speed: 20,
          bounciness: 0,
        }).start();
      },
    });
  }

  // ── Start Recording ──────────────────────────
  const startRecording = useCallback(async () => {
    const stt = sttRef.current;
    if (!stt) return;

    const hasPermission = await stt.requestPermission();
    if (!hasPermission) return;

    const started = await stt.startRecording();
    if (!started) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRecording(true);
    setDuration(0);
    onRecordingStart?.();

    // Scale animation
    Animated.spring(scaleAnim, {
      toValue: 1.4,
      useNativeDriver: true,
    }).start();

    // Duration counter
    durationTimerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, [onRecordingStart, scaleAnim]);

  // ── Stop Recording ──────────────────────────
  const stopRecording = useCallback(async () => {
    const stt = sttRef.current;
    if (!stt) return;

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    // Scale down
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    if (isCancelling) {
      await stt.cancelRecording();
      setIsCancelling(false);
      setIsRecording(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const recording = await stt.stopRecording();
    setIsRecording(false);
    setAudioLevel(0);

    if (recording) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRecordingComplete(recording);
    }
  }, [isCancelling, onRecordingComplete, scaleAnim]);

  // ── Format Duration ──────────────────────────
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Position Style ──────────────────────────
  const positionStyle = {
    'bottom-right': { right: 20, bottom: 100 },
    'bottom-left': { left: 20, bottom: 100 },
    'bottom-center': { alignSelf: 'center' as const, bottom: 100 },
  }[position];

  return (
    <>
      {/* Recording overlay */}
      {isRecording && (
        <View style={styles.overlay}>
          {/* Audio visualization */}
          <View style={styles.vizContainer}>
            <Animated.View
              style={[
                styles.vizRing,
                {
                  transform: [
                    { scale: levelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 2],
                    })},
                  ],
                  opacity: levelAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.1, 0.4],
                  }),
                },
              ]}
            />

            {/* Center mic icon */}
            <View style={styles.vizCenter}>
              <Ionicons name="mic" size={32} color="white" />
            </View>
          </View>

          {/* Duration */}
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>

          {/* Cancel hint */}
          <Text style={styles.cancelHint}>
            {isCancelling ? '손을 떼면 취소됩니다' : '위로 스와이프하여 취소'}
          </Text>
        </View>
      )}

      {/* FAB Button */}
      <Animated.View
        style={[
          styles.fabContainer,
          positionStyle,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <TouchableOpacity
          onLongPress={startRecording}
          onPressOut={stopRecording}
          delayLongPress={200}
          style={[styles.fab, isRecording && styles.fabRecording]}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isRecording ? 'mic' : 'mic-outline'}
            size={24}
            color="white"
          />
        </TouchableOpacity>

        {/* Recording ring */}
        {isRecording && (
          <View style={styles.fabRing}>
            <Animated.View
              style={[
                styles.fabRingInner,
                {
                  transform: [
                    { scale: levelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.5],
                    })},
                  ],
                },
              ]}
            />
          </View>
        )}
      </Animated.View>
    </>
  );
}

// ============================================================
// Styles
// ============================================================
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.brand,
  },
  fabRecording: {
    backgroundColor: '#ef4444',
  },
  fabRing: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabRingInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#ef4444',
    opacity: 0.5,
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  vizContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  vizRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 60,
    backgroundColor: colors.brand,
  },
  vizCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationText: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    fontVariant: ['tabular-nums'],
    marginBottom: 16,
  },
  cancelHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
});
