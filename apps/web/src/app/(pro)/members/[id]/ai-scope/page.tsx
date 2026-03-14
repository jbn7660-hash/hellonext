/**
 * AI Scope Settings Page (F-013)
 *
 * Pro controls which error patterns are visible/hidden for a member,
 * and sets the AI observation tone level.
 *
 * @page /members/[id]/ai-scope
 * @feature F-013
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ERROR_PATTERNS } from '@hellonext/shared/constants/error-patterns';
import { getSwingPosition } from '@hellonext/shared/constants/swing-positions';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

type ToneLevel = 'observe_only' | 'gentle_suggest' | 'specific_guide';

const TONE_OPTIONS: { value: ToneLevel; label: string; description: string; example: string }[] = [
  {
    value: 'observe_only',
    label: '관찰만',
    description: '변화를 관찰합니다',
    example: '"팔로스루 범위에 변화가 보이기 시작합니다"',
  },
  {
    value: 'gentle_suggest',
    label: '부드러운 제안',
    description: '방향성 제시',
    example: '"다음 연습 때 팔로스루를 조금 더 크게 해보세요"',
  },
  {
    value: 'specific_guide',
    label: '구체적 가이드',
    description: '드릴 추천 포함',
    example: '"스텝 드릴 10회를 먼저 한 뒤 풀스윙을 시도해보세요"',
  },
];

export default function AIScopePage() {
  const params = useParams();
  const router = useRouter();
  const memberId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hiddenPatterns, setHiddenPatterns] = useState<Set<string>>(new Set());
  const [toneLevel, setToneLevel] = useState<ToneLevel>('observe_only');
  const [memberName, setMemberName] = useState('');

  // Fetch current settings
  useEffect(() => {
    const fetchData = async () => {
      if (!memberId) return;

      try {
        const [scopeRes, memberRes] = await Promise.all([
          fetch(`/api/ai-scope?member_id=${memberId}`),
          fetch(`/api/members`),
        ]);

        if (scopeRes.ok) {
          const { data } = await scopeRes.json();
          setHiddenPatterns(new Set(data?.hidden_patterns ?? []));
          setToneLevel(data?.tone_level ?? 'observe_only');
        } else {
          logger.warn('Failed to fetch AI scope settings', { memberId, status: scopeRes.status });
        }

        if (memberRes.ok) {
          const { data } = await memberRes.json();
          const member = data?.find((m: { id: string }) => m.id === memberId);
          if (member) setMemberName(member.display_name);
        }
      } catch (err) {
        logger.error('AI scope page fetch error', { memberId, error: err });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [memberId]);

  const togglePattern = useCallback((code: string) => {
    setHiddenPatterns((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberId,
          hidden_patterns: Array.from(hiddenPatterns),
          tone_level: toneLevel,
        }),
      });

      if (!res.ok) {
        logger.error('Failed to save AI scope settings', { memberId, status: res.status });
        alert('설정 저장에 실패했습니다. 다시 시도해주세요.');
        return;
      }

      logger.info('AI scope settings saved', { memberId, tonelevel: toneLevel, hiddenCount: hiddenPatterns.size });
      router.back();
    } catch (err) {
      logger.error('AI scope save error', { memberId, error: err });
      alert('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }, [memberId, hiddenPatterns, toneLevel, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="설정 로딩 중..." />
      </div>
    );
  }

  // Group patterns by position
  const patternsByPosition = ERROR_PATTERNS.reduce(
    (acc, pattern) => {
      const pos = pattern.position;
      if (!acc[pos]) acc[pos] = [];
      acc[pos] = [...(acc[pos] ?? []), pattern];
      return acc;
    },
    {} as Record<string, typeof ERROR_PATTERNS[number][]>
  );

  return (
    <div className="px-5 pt-safe-top pb-24">
      {/* Back + Header */}
      <div className="pt-4 pb-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-text-secondary mb-3"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="15,18 9,12 15,6" />
          </svg>
          돌아가기
        </button>
        <h1 className="text-xl font-bold text-text-primary">AI 피드백 범위 설정</h1>
        <p className="text-sm text-text-secondary mt-1">
          {memberName}님에게 표시되는 AI 관찰 항목과 톤을 설정합니다
        </p>
      </div>

      {/* Tone Level Selection */}
      <section className="mt-6">
        <h2 className="text-base font-semibold text-text-primary mb-3">AI 톤 레벨</h2>
        <div className="space-y-2">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setToneLevel(opt.value)}
              className={cn(
                'w-full text-left card p-4 transition-colors',
                toneLevel === opt.value
                  ? 'border-brand-primary bg-brand-primary/5'
                  : 'hover:border-gray-300'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-text-primary">{opt.label}</span>
                {toneLevel === opt.value && (
                  <span className="text-xs bg-brand-primary text-white px-2 py-0.5 rounded-full">
                    선택됨
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary">{opt.description}</p>
              <p className="text-xs text-text-tertiary mt-1 italic">{opt.example}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Error Pattern Visibility */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary">교정 항목 공개/비공개</h2>
          <span className="text-xs text-text-tertiary">
            비공개 {hiddenPatterns.size}개
          </span>
        </div>

        {Object.entries(patternsByPosition).map(([position, patterns]) => {
          const posInfo = getSwingPosition(position);
          return (
            <div key={position} className="mb-4">
              <h3 className="text-xs font-medium text-text-tertiary uppercase mb-2">
                {posInfo?.nameKo ?? position} ({position})
              </h3>
              <div className="space-y-1">
                {patterns.map((pattern) => {
                  const isHidden = hiddenPatterns.has(pattern.code);
                  return (
                    <button
                      key={pattern.code}
                      type="button"
                      onClick={() => togglePattern(pattern.code)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-text-tertiary w-14">
                          {pattern.code}
                        </span>
                        <span className={cn(
                          'text-sm',
                          isHidden ? 'text-text-tertiary line-through' : 'text-text-primary'
                        )}>
                          {pattern.nameKo}
                        </span>
                      </div>
                      <div className={cn(
                        'w-10 h-6 rounded-full transition-colors flex items-center px-0.5',
                        isHidden ? 'bg-gray-200' : 'bg-brand-primary'
                      )}>
                        <div className={cn(
                          'w-5 h-5 rounded-full bg-white shadow transition-transform',
                          isHidden ? 'translate-x-0' : 'translate-x-4'
                        )} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Save Button (sticky) */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-surface-primary border-t border-gray-100 safe-area-bottom">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full py-3 text-sm font-medium"
        >
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </div>
  );
}
