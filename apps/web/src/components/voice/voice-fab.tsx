/**
 * VoiceFAB — Floating Action Button for Voice Recording
 *
 * Primary entry point for the voice memo flow (F-001).
 * States: idle → recording → processing → done/error
 *
 * When recording completes:
 *  - If member is selected → creates memo + triggers pipeline
 *  - If no member selected → creates orphan memo (F-003)
 *
 * @module components/voice/voice-fab
 * @feature F-001, F-003
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { formatDuration } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';
import { MIN_MEMO_DURATION_SEC } from '@hellonext/shared/validators/voice-memo';

interface VoiceFABProps {
  /** Pre-selected member ID (from dashboard context) */
  selectedMemberId?: string | null;
  /** Callback when memo is successfully created */
  onMemoCreated?: (memoId: string, isOrphan: boolean) => void;
}

type FabState = 'idle' | 'recording' | 'uploading' | 'done' | 'error';

export function VoiceFAB({ selectedMemberId, onMemoCreated }: VoiceFABProps) {
  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    error: recorderError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
  } = useVoiceRecorder();

  const [fabState, setFabState] = useState<FabState>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFabPress = useCallback(async () => {
    if (fabState === 'idle') {
      setUploadError(null);
      await startRecording();
      setFabState('recording');
    } else if (fabState === 'recording') {
      // Validate minimum duration before stopping
      if (duration < MIN_MEMO_DURATION_SEC) {
        setUploadError(`최소 ${MIN_MEMO_DURATION_SEC}초 이상 녹음해주세요.`);
        return;
      }
      stopRecording();
      setFabState('uploading');
    }
  }, [fabState, duration, startRecording, stopRecording]);

  // Upload when audioBlob becomes available after stop
  const handleUpload = useCallback(async () => {
    if (!audioBlob) return;

    setFabState('uploading');
    setUploadError(null);

    try {
      // Upload audio blob to storage and get URL
      const formData = new FormData();
      formData.append('audio', audioBlob, 'memo.webm');

      const uploadRes = await fetch('/api/upload/audio', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const uploadBody = await uploadRes.json().catch(() => ({}));
        throw new Error(uploadBody.error ?? `Upload failed (${uploadRes.status})`);
      }

      const { url: audioUrl } = await uploadRes.json();

      // Create memo record with audio URL
      const memoRes = await fetch('/api/voice-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: audioUrl,
          duration_sec: duration,
          member_id: selectedMemberId ?? null,
        }),
      });

      if (!memoRes.ok) {
        const memoBody = await memoRes.json().catch(() => ({}));
        throw new Error(memoBody.error ?? `Create memo failed (${memoRes.status})`);
      }

      const { data } = await memoRes.json();
      const isOrphan = !selectedMemberId;

      logger.info('Voice memo created', {
        memoId: data.id,
        isOrphan,
        durationSec: duration,
      });

      setFabState('done');
      onMemoCreated?.(data.id, isOrphan);

      // Reset after brief delay
      setTimeout(() => {
        resetRecording();
        setFabState('idle');
        setUploadError(null);
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '업로드에 실패했습니다.';
      setUploadError(message);
      setFabState('error');
      logger.error('Voice memo upload failed', { error: err });
    }
  }, [audioBlob, duration, selectedMemberId, onMemoCreated, resetRecording]);

  // Auto-upload when recording stops and blob is ready
  useEffect(() => {
    if (fabState === 'uploading' && audioBlob) {
      handleUpload();
    }
  }, [fabState, audioBlob, handleUpload]);

  const handleRetry = useCallback(() => {
    resetRecording();
    setFabState('idle');
    setUploadError(null);
  }, [resetRecording]);

  const error = recorderError ?? uploadError;

  return (
    <div className="fixed bottom-6 right-5 z-40 flex flex-col items-end gap-3 safe-area-bottom">
      {/* Status Indicator */}
      {fabState === 'recording' && (
        <div className="bg-surface-primary rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 animate-fade-in">
          {/* Pulse dot */}
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-error opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-status-error" />
          </span>

          {/* Duration */}
          <span className="text-sm font-mono font-medium text-text-primary tabular-nums">
            {formatDuration(duration)}
          </span>

          {/* Pause/Resume */}
          <button
            type="button"
            onClick={isPaused ? resumeRecording : pauseRecording}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
            aria-label={isPaused ? '녹음 재개' : '녹음 일시정지'}
          >
            {isPaused ? (
              <PlayIcon className="w-4 h-4 text-text-secondary" />
            ) : (
              <PauseIcon className="w-4 h-4 text-text-secondary" />
            )}
          </button>
        </div>
      )}

      {/* Orphan indicator */}
      {fabState === 'recording' && !selectedMemberId && (
        <div className="bg-status-warning/10 text-status-warning text-xs px-3 py-1.5 rounded-full">
          회원 미지정 — 고아 메모로 저장됩니다
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-status-error/10 text-status-error text-xs px-3 py-1.5 rounded-xl max-w-[240px]">
          {error}
          {fabState === 'error' && (
            <button
              type="button"
              onClick={handleRetry}
              className="ml-2 underline"
            >
              다시 시도
            </button>
          )}
        </div>
      )}

      {/* Done indicator */}
      {fabState === 'done' && (
        <div className="bg-brand-primary/10 text-brand-primary text-xs px-3 py-1.5 rounded-full animate-fade-in">
          메모 저장 완료
        </div>
      )}

      {/* FAB Button */}
      <button
        type="button"
        onClick={handleFabPress}
        disabled={fabState === 'uploading' || fabState === 'done'}
        className={cn(
          'w-14 h-14 rounded-full shadow-lg flex items-center justify-center',
          'transition-all duration-200 active:scale-95 touch-manipulation',
          fabState === 'idle' && 'bg-brand-primary hover:bg-brand-primary/90 active:bg-brand-primary/80',
          fabState === 'recording' && 'bg-status-error hover:bg-status-error/90 active:bg-status-error/80 animate-pulse-soft',
          fabState === 'uploading' && 'bg-gray-400 cursor-not-allowed',
          fabState === 'done' && 'bg-brand-primary/60 cursor-not-allowed',
          fabState === 'error' && 'bg-status-error hover:bg-status-error/90 active:bg-status-error/80'
        )}
        aria-label={
          fabState === 'idle'
            ? '음성 녹음 시작'
            : fabState === 'recording'
              ? '녹음 중지'
              : '처리 중'
        }
      >
        {fabState === 'idle' && <MicIcon className="w-6 h-6 text-white" />}
        {fabState === 'recording' && <StopIcon className="w-6 h-6 text-white" />}
        {fabState === 'uploading' && (
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {fabState === 'done' && <CheckIcon className="w-6 h-6 text-white" />}
        {fabState === 'error' && <MicIcon className="w-6 h-6 text-white" />}
      </button>
    </div>
  );
}

/* ---------- Inline SVG Icons ---------- */

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}
