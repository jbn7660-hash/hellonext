/**
 * Pro Onboarding Page
 *
 * Collects studio_name and specialty from new pro users.
 * Shown when a pro signs up and has no studio_name set yet.
 *
 * @page (pro)/onboarding
 * @feature F-007 가입/인증
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { TablesUpdate } from '@/lib/supabase/types';
import { useAuth } from '@/hooks/use-auth';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const SPECIALTIES = [
  '드라이버',
  '아이언',
  '숏게임',
  '퍼팅',
  '코스 매니지먼트',
  '피팅',
  '종합',
] as const;

export default function ProOnboardingPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [studioName, setStudioName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!studioName.trim()) {
        setError('스튜디오/레슨장 이름을 입력해주세요.');
        return;
      }

      if (!user) {
        setError('로그인이 필요합니다.');
        return;
      }

      setSaving(true);

      try {
        const updateData: TablesUpdate<'pro_profiles'> = {
          studio_name: studioName.trim(),
          specialty: specialty || null,
        };
        const { error: updateError } = await supabase
          .from('pro_profiles')
          .update(updateData as never)
          .eq('user_id', user.id);

        if (updateError) {
          setError('프로필 저장에 실패했습니다. 다시 시도해주세요.');
          return;
        }

        router.replace('/dashboard');
        router.refresh();
      } catch {
        setError('알 수 없는 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
    },
    [supabase, user, studioName, specialty, router]
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="로딩 중..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dawn px-4 py-safe-top pb-safe-bottom">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-warm">
            <span className="text-2xl">⛳</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">환영합니다!</h1>
          <p className="mt-2 text-sm text-ink-3">
            레슨 프로 프로필을 완성해주세요
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Studio Name */}
          <div>
            <label
              htmlFor="studioName"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              스튜디오/레슨장 이름 <span className="text-tension">*</span>
            </label>
            <input
              id="studioName"
              type="text"
              value={studioName}
              onChange={(e) => {
                setStudioName(e.target.value);
                setError(null);
              }}
              placeholder="예: 그린힐 골프 아카데미"
              required
              maxLength={100}
              className="input-field"
              disabled={saving}
            />
          </div>

          {/* Specialty */}
          <div>
            <label
              htmlFor="specialty"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              전문 분야
            </label>
            <select
              id="specialty"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="input-field"
              disabled={saving}
            >
              <option value="">선택하세요 (선택사항)</option>
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !studioName.trim()}
            className="btn-primary w-full"
          >
            {saving ? '저장 중...' : '프로필 완성하기'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div
            className="mt-4 rounded-xl border border-tension/20 bg-tension-surface px-4 py-3 text-sm text-tension"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
