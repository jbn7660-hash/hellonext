/**
 * FeelCheck Component
 *
 * Post-swing feeling survey. MUST appear before AI observation (AI Principle 4).
 *
 * Options:
 *  - good (😊) — "좋았어요"
 *  - unsure (😐) — "잘 모르겠어요"
 *  - off (😟) — "뭔가 이상했어요"
 *
 * @module components/practice/feel-check
 * @feature F-005 AC-2
 */

'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

type Feeling = 'good' | 'unsure' | 'off';

interface FeelCheckProps {
  videoId: string;
  onComplete: (feelCheckId: string, feeling: Feeling) => void;
}

const FEELINGS: { value: Feeling; emoji: string; label: string }[] = [
  { value: 'good', emoji: '😊', label: '좋았어요' },
  { value: 'unsure', emoji: '😐', label: '잘 모르겠어요' },
  { value: 'off', emoji: '😟', label: '뭔가 이상했어요' },
];

export function FeelCheck({ videoId, onComplete }: FeelCheckProps) {
  const [selected, setSelected] = useState<Feeling | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSelect = useCallback((feeling: Feeling) => {
    setSelected(feeling);
    setSubmitError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selected) {
      setSubmitError('기분을 선택해주세요');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/feel-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swing_video_id: videoId,
          feeling: selected,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Feel check submission failed');
      }

      const { data } = await res.json();
      onComplete(data.id, selected);
      logger.info('Feel check submitted', { feeling: selected, videoId, hasNotes: notes.trim().length > 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Feel check 저장에 실패했습니다.';
      setSubmitError(message);
      logger.error('Feel check error', { error: err, videoId });
    } finally {
      setSubmitting(false);
    }
  }, [selected, notes, videoId, onComplete]);

  return (
    <div className="px-5 py-8">
      <h2 className="text-lg font-bold text-text-primary text-center mb-2">
        방금 스윙, 어떤 느낌이었나요?
      </h2>
      <p className="text-sm text-text-secondary text-center mb-8">
        느낌을 먼저 기록해야 AI 관찰을 볼 수 있어요
      </p>

      {/* Feeling Options */}
      <div className="flex justify-center gap-4 mb-6">
        {FEELINGS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => handleSelect(f.value)}
            className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all w-24 active:scale-95',
              selected === f.value
                ? 'border-brand-primary bg-brand-primary/5 scale-105'
                : 'border-gray-200 hover:border-gray-300'
            )}
            aria-pressed={selected === f.value}
            aria-label={`기분: ${f.label}`}
          >
            <span className="text-3xl" role="img" aria-hidden="true">{f.emoji}</span>
            <span className={cn(
              'text-xs font-medium text-center',
              selected === f.value ? 'text-brand-primary' : 'text-text-secondary'
            )}>
              {f.label}
            </span>
          </button>
        ))}
      </div>

      {/* Optional notes */}
      {selected && (
        <div className="mb-6 animate-fade-in">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="더 자세히 말해주세요 (선택사항)"
            className="input-field w-full h-20 resize-none text-sm"
            maxLength={200}
          />
        </div>
      )}

      {/* Error message */}
      {submitError && (
        <div className="mb-4 p-3 rounded-lg bg-status-error/10 border border-status-error/20">
          <p className="text-sm text-status-error">{submitError}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selected || submitting}
        className={cn(
          'btn-primary w-full py-3 text-sm transition-opacity',
          (!selected || submitting) && 'opacity-50 cursor-not-allowed'
        )}
        aria-busy={submitting}
      >
        {submitting ? '저장 중...' : '기록 완료'}
      </button>
    </div>
  );
}
