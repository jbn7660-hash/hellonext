/**
 * Member Practice Tab Page (F-005)
 *
 * Main practice flow:
 *  1. Camera → Record swing
 *  2. Feel Check → Record feeling (MUST come before AI)
 *  3. AI Observation → Show analysis results
 *  4. Save to SwingBook
 *
 * @page /practice
 * @feature F-005
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SwingCamera } from '@/components/swing/swing-camera';
import { FeelCheck } from '@/components/practice/feel-check';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

type PracticePhase = 'idle' | 'recording' | 'uploading' | 'feel_check' | 'analyzing' | 'result';

interface AIObservation {
  position: string;
  observation: string;
  error_pattern_code: string | null;
  coach_consultation_flag: boolean;
  visible: boolean;
}

interface AnalysisResult {
  observations: AIObservation[];
  feel_accuracy_note: string;
  summary: string;
}

export default function PracticePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<PracticePhase>('idle');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [poseFrames, setPoseFrames] = useState<unknown[]>([]);
  const [feelCheckId, setFeelCheckId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Recording complete
  const handleRecordingComplete = useCallback(
    async (blob: Blob, frames: unknown[], durationSec: number) => {
      setVideoBlob(blob);
      setPoseFrames(frames);
      setPhase('uploading');

      try {
        // Upload video
        const formData = new FormData();
        formData.append('video', blob, 'swing.webm');
        formData.append('source', 'camera');

        const res = await fetch('/api/swing-videos', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error('Video upload failed');

        const { data } = await res.json();
        setVideoId(data.id);
        setPhase('feel_check'); // AI Principle 4: Feel Check BEFORE AI
      } catch (err) {
        setError('영상 업로드에 실패했습니다.');
        setPhase('idle');
        logger.error('Practice upload error', { error: err });
      }
    },
    []
  );

  // Step 2: Feel Check complete → trigger AI analysis
  const handleFeelCheckComplete = useCallback(
    async (fCheckId: string, feeling: string) => {
      if (!videoId) {
        setError('영상 ID가 없습니다.');
        return;
      }

      setFeelCheckId(fCheckId);
      setPhase('analyzing');

      try {
        // Validate pose frames exist
        if (!poseFrames || poseFrames.length === 0) {
          throw new Error('Pose data is empty');
        }

        // Trigger swing analysis Edge Function
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !anonKey) {
          throw new Error('Missing Supabase configuration');
        }

        const res = await fetch(`${supabaseUrl}/functions/v1/swing-analysis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            video_id: videoId,
            member_id: 'current', // Edge function will resolve from auth
            pose_data: poseFrames,
            feel_check_id: fCheckId,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Analysis failed with status ${res.status}`);
        }

        const { observation_id } = await res.json();

        // Fetch the observation result
        const obsRes = await fetch(`/api/swing-videos/${videoId}?include=observation`);
        if (obsRes.ok) {
          const { data } = await obsRes.json();
          setResult(data.observation);
        }

        setPhase('result');
        logger.info('Swing analysis completed', { videoId, observationId: observation_id });
      } catch (err) {
        setError('AI 분석에 실패했습니다. 다시 시도해주세요.');
        setPhase('result');
        logger.error('Swing analysis error', { error: err, videoId });
      }
    },
    [videoId, poseFrames]
  );

  // Phase: Idle
  if (phase === 'idle') {
    return (
      <div className="px-5 pt-4">
        <h2 className="text-lg font-bold text-text-primary mb-2">연습</h2>
        <p className="text-sm text-text-secondary mb-8">
          스윙을 촬영하고 AI 관찰을 받아보세요
        </p>

        {/* Start Recording CTA */}
        <button
          type="button"
          onClick={() => setPhase('recording')}
          className="w-full bg-brand-primary text-white rounded-2xl p-8 flex flex-col items-center gap-3 hover:bg-brand-primary/90 transition-colors"
        >
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <CameraIcon className="w-8 h-8 text-white" />
          </div>
          <span className="text-base font-semibold">스윙 촬영 시작</span>
          <span className="text-xs text-white/70">최대 60초 · AI가 자동으로 분석합니다</span>
        </button>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-status-error/10 text-status-error text-sm rounded-xl">
            {error}
          </div>
        )}

        {/* Recent practice stats (placeholder for feel accuracy) */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-text-primary mb-3">연습 기록</h3>
          <div className="card p-4 text-center">
            <p className="text-sm text-text-secondary">촬영된 스윙이 스윙북에 자동 저장됩니다</p>
          </div>
        </div>
      </div>
    );
  }

  // Phase: Recording
  if (phase === 'recording') {
    return (
      <SwingCamera
        onRecordingComplete={handleRecordingComplete}
        onCancel={() => setPhase('idle')}
      />
    );
  }

  // Phase: Uploading
  if (phase === 'uploading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" label="영상 업로드 중..." />
      </div>
    );
  }

  // Phase: Feel Check (MUST come before AI — AI Principle 4)
  if (phase === 'feel_check' && videoId) {
    return <FeelCheck videoId={videoId} onComplete={handleFeelCheckComplete} />;
  }

  // Phase: Analyzing
  if (phase === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <LoadingSpinner size="lg" label="AI가 스윙을 관찰하고 있어요..." />
        <p className="text-xs text-text-tertiary mt-4">약 10초 소요됩니다</p>
      </div>
    );
  }

  // Phase: Result
  if (phase === 'result') {
    return (
      <div className="px-5 pt-4 pb-24">
        <h2 className="text-lg font-bold text-text-primary mb-4">AI 관찰 결과</h2>

        {error && !result && (
          <div className="card p-4 border-status-error/30 mb-4">
            <p className="text-sm text-status-error">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="card p-4 bg-brand-primary/5">
              <p className="text-sm text-text-primary leading-relaxed font-medium">{result.summary}</p>
            </div>

            {/* Observations */}
            {result.observations && result.observations.length > 0 ? (
              result.observations
                .filter((obs) => obs.visible)
                .map((obs, idx) => (
                  <div key={idx} className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full font-medium">
                        {obs.position}
                      </span>
                      {obs.error_pattern_code && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                          {obs.error_pattern_code}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">{obs.observation}</p>
                    {obs.coach_consultation_flag && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-brand-primary font-medium hover:text-brand-primary/80 transition-colors"
                        onClick={() => {
                          // F-005 AC-4: Notify pro for consultation
                          logger.info('Coach consultation requested', { videoId, position: obs.position });
                        }}
                      >
                        프로님에게 물어보기
                      </button>
                    )}
                  </div>
                ))
            ) : (
              <div className="card p-4 text-center">
                <p className="text-sm text-text-tertiary">관찰된 패턴이 없습니다</p>
              </div>
            )}

            {/* Hidden observations indicator */}
            {result.observations && result.observations.some((obs) => !obs.visible) && (
              <div className="card p-4 bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔒</span>
                  <p className="text-sm text-text-secondary">
                    일부 패턴은 다음 레슨에서 프로님이 직접 확인합니다
                  </p>
                </div>
              </div>
            )}

            {/* Feel accuracy note */}
            {result.feel_accuracy_note && (
              <div className="card p-4 border-l-4 border-brand-primary bg-brand-primary/2">
                <p className="text-xs text-text-tertiary font-medium mb-1">Feel vs Real</p>
                <p className="text-sm text-text-secondary">{result.feel_accuracy_note}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={() => router.push('/swingbook')}
            className="flex-1 card py-3 text-center text-sm font-medium text-text-primary"
          >
            스윙북 보기
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase('idle');
              setVideoId(null);
              setResult(null);
              setError(null);
            }}
            className="flex-1 btn-primary py-3 text-sm"
          >
            다시 촬영
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
