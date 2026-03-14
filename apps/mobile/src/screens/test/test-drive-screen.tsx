/**
 * Test Drive Screen (no auth required)
 *
 * Goal: quickest way for survey users to record and review a voice memo
 * inside the native app without signing in.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

import { STTService, STTState, VoiceMemoRecording } from '@/services/stt-service';

export function TestDriveScreen() {
  const [recorderState, setRecorderState] = useState<STTState>('idle');
  const sttRef = useRef(new STTService({ onStateChange: setRecorderState }));
  const soundRef = useRef<Audio.Sound | null>(null);
  const [lastMemo, setLastMemo] = useState<VoiceMemoRecording | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      sttRef.current.dispose();
      soundRef.current?.unloadAsync();
    };
  }, []);

  const toggleRecording = async () => {
    if (recorderState === 'recording') {
      const memo = await sttRef.current.stopRecording();
      if (memo) {
        setLastMemo(memo);
      }
      return;
    }

    const hasPermission = await sttRef.current.requestPermission();
    if (!hasPermission) {
      Alert.alert('마이크 권한 필요', '설정 > 권한에서 마이크를 허용해주세요.');
      return;
    }

    setPlaybackError(null);
    setLastMemo(null);
    await sttRef.current.startRecording();
  };

  const togglePlayback = async () => {
    if (!lastMemo) return;

    try {
      // Stop if already playing
      if (isPlaying && soundRef.current) {
        await soundRef.current.stopAsync();
        setIsPlaying(false);
        return;
      }

      if (!soundRef.current) {
        const sound = new Audio.Sound();
        await sound.loadAsync({ uri: lastMemo.uri });
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          setIsPlaying(Boolean(status.isPlaying));
          if (status.didJustFinish) {
            setIsPlaying(false);
          }
        });
        soundRef.current = sound;
      }

      await soundRef.current.replayAsync();
    } catch (error) {
      setPlaybackError('재생에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const resetMemo = async () => {
    if (lastMemo) {
      try {
        await FileSystem.deleteAsync(lastMemo.uri, { idempotent: true });
      } catch {}
    }
    setLastMemo(null);
    setIsPlaying(false);
    setPlaybackError(null);
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const primaryLabel = {
    idle: '녹음 시작',
    recording: '녹음 종료',
    processing: '정리 중',
    done: '다시 녹음',
    error: '다시 시도',
  }[recorderState];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>음성 메모 빠른 테스트</Text>
        <Text style={styles.subtitle}>
          로그인 없이도 녹음 → 즉시 재생. 설문 사용자에게 이 흐름만 공유하세요.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1단계 · 녹음</Text>
        <TouchableOpacity
          style={[styles.recordButton, recorderState === 'recording' && styles.recording]}
          onPress={toggleRecording}
          activeOpacity={0.85}
        >
          {recorderState === 'processing' ? (
            <ActivityIndicator color="white" />
          ) : (
            <Ionicons
              name={recorderState === 'recording' ? 'stop' : 'mic'}
              size={28}
              color="white"
            />
          )}
          <Text style={styles.recordLabel}>{primaryLabel}</Text>
          <Text style={styles.hint}>
            {recorderState === 'recording'
              ? '버튼을 다시 누르면 저장됩니다'
              : '짧게 눌러 바로 녹음 시작'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>2단계 · 확인</Text>
        {lastMemo ? (
          <View style={styles.memoRow}>
            <View style={styles.memoMeta}>
              <Text style={styles.memoLabel}>길이 {formatDuration(lastMemo.duration)}</Text>
              <Text style={styles.memoSub}>{Math.round(lastMemo.fileSize / 1024)} KB · {lastMemo.format}</Text>
              {playbackError && <Text style={styles.error}>{playbackError}</Text>}
            </View>
            <View style={styles.memoActions}>
              <TouchableOpacity style={styles.iconButton} onPress={togglePlayback}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#0f172a" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={resetMemo}>
                <Ionicons name="refresh" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.placeholder}>녹음 후 여기에 미리듣기가 나타납니다.</Text>
        )}
      </View>

      <View style={styles.helpCard}>
        <Text style={styles.helpTitle}>테스터 전달 메모</Text>
        <Text style={styles.helpText}>1) 앱 설치 → "테스트 드라이브" → 녹음 버튼 탭</Text>
        <Text style={styles.helpText}>2) 저장된 음성을 바로 재생해 확인</Text>
        <Text style={styles.helpText}>3) 문제 발생 시 화면 하단 오류 메시지 캡처</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#475569', lineHeight: 20 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  recordButton: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
  },
  recording: { backgroundColor: '#ef4444' },
  recordLabel: { fontSize: 18, fontWeight: '800', color: 'white' },
  hint: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  memoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memoMeta: { flex: 1 },
  memoLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  memoSub: { fontSize: 13, color: '#475569', marginTop: 2 },
  memoActions: { flexDirection: 'row', gap: 10, marginLeft: 12 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  placeholder: { fontSize: 14, color: '#94a3b8' },
  error: { color: '#ef4444', marginTop: 6, fontSize: 12 },
  helpCard: {
    marginTop: 8,
    backgroundColor: '#ecfdf3',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  helpTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 6 },
  helpText: { fontSize: 13, color: '#166534', lineHeight: 18 },
});
