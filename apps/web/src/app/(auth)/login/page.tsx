/**
 * Login Page
 *
 * Supports multiple authentication methods:
 * 1. Kakao OAuth (primary)
 * 2. Google OAuth (secondary)
 * 3. Email + Password (fallback for development)
 *
 * Features:
 * - Role selection for signup (pro/member)
 * - Error display from URL params (?error=...)
 * - Loading states during auth
 * - Mobile-first design with Tailwind
 * - HelloNext branding (golf-themed, green colors)
 *
 * @page (auth)/login
 * @feature F-007 가입/인증
 */

'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';

type AuthMode = 'login' | 'signup';
type UserRole = 'pro' | 'member';

const ERROR_MESSAGES: Record<string, string> = {
  no_auth_code: '인증 코드를 받지 못했습니다. 다시 시도해주세요.',
  auth_exchange_failed: '인증 실패. 다시 로그인해주세요.',
  user_fetch_failed: '사용자 정보를 가져올 수 없습니다. 다시 시도해주세요.',
  profile_check_failed: '프로필 확인에 실패했습니다. 다시 시도해주세요.',
  unexpected_error: '예상치 못한 오류가 발생했습니다. 다시 시도해주세요.',
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('next') ?? '/';
  const errorParam = searchParams.get('error');

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('pro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Display error from URL params on mount
  useEffect(() => {
    if (errorParam) {
      const decodedError = decodeURIComponent(errorParam);
      const message = ERROR_MESSAGES[decodedError] || decodedError;
      setError(message);
    }
  }, [errorParam]);

  const handleOAuthLogin = useCallback(
    async (provider: 'kakao' | 'google') => {
      setLoading(true);
      setError(null);

      try {
        const { error: authError } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${window.location.origin}/callback?next=${encodeURIComponent(redirectTo)}`,
          },
        });

        if (authError) {
          logger.error(`${provider} OAuth failed`, { error: authError.message });
          setError(`${provider === 'kakao' ? '카카오' : '구글'} 로그인에 실패했습니다. 다시 시도해주세요.`);
        }
      } catch (err) {
        logger.error(`${provider} login unexpected error`, { error: err });
        setError('알 수 없는 오류가 발생했습니다. 다시 시도해주세요.');
      } finally {
        setLoading(false);
      }
    },
    [supabase, redirectTo]
  );

  const handleKakaoLogin = useCallback(
    () => handleOAuthLogin('kakao'),
    [handleOAuthLogin]
  );

  const handleGoogleLogin = useCallback(
    () => handleOAuthLogin('google'),
    [handleOAuthLogin]
  );

  const handleEmailAuth = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      // Validate inputs
      if (!email || !password) {
        setError('이메일과 비밀번호를 입력해주세요.');
        setLoading(false);
        return;
      }

      if (password.length < 6 && mode === 'signup') {
        setError('비밀번호는 최소 6자 이상이어야 합니다.');
        setLoading(false);
        return;
      }

      try {
        if (mode === 'signup') {
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                role,
                display_name: email.split('@')[0],
              },
              emailRedirectTo: `${window.location.origin}/callback?next=${encodeURIComponent(redirectTo)}`,
            },
          });

          if (signUpError) {
            logger.error('Email signup failed', { error: signUpError.message });
            setError(
              signUpError.message === 'User already registered'
                ? '이미 등록된 이메일입니다. 로그인을 시도해주세요.'
                : '회원가입에 실패했습니다.'
            );
            return;
          }

          setError(null);
          alert('확인 이메일을 발송했습니다. 이메일을 확인해주세요.');
        } else {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (signInError) {
            logger.error('Email login failed', { error: signInError.message });
            setError('이메일 또는 비밀번호가 올바르지 않습니다.');
            return;
          }

          logger.info('Email login success', { email });
          router.push(redirectTo);
          router.refresh();
        }
      } catch (err) {
        logger.error('Email auth unexpected error', { error: err });
        setError('알 수 없는 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [supabase, email, password, mode, role, redirectTo, router]
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-secondary px-4 py-safe-top pb-safe-bottom">
      <div className="w-full max-w-sm">
        {/* Logo & Branding */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
            <span className="text-2xl">⛳</span>
          </div>
          <h1 className="text-3xl font-bold text-brand-700">HelloNext</h1>
          <p className="mt-2 text-sm text-text-secondary">
            AI 골프 코칭 플랫폼
          </p>
        </div>

        {/* Role Selection (signup only) */}
        {mode === 'signup' && (
          <div className="mb-6">
            <p className="mb-3 text-sm font-semibold text-text-primary">
              가입 유형을 선택하세요
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setRole('pro');
                  setError(null);
                }}
                className={`rounded-2xl border-2 px-4 py-3 text-sm font-medium transition-all ${
                  role === 'pro'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-text-secondary hover:border-brand-300'
                }`}
              >
                <span className="block text-lg">⛳</span>
                골프 프로
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole('member');
                  setError(null);
                }}
                className={`rounded-2xl border-2 px-4 py-3 text-sm font-medium transition-all ${
                  role === 'member'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-text-secondary hover:border-brand-300'
                }`}
              >
                <span className="block text-lg">🏌️</span>
                골프 회원
              </button>
            </div>
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="space-y-2">
          {/* Kakao Login — Primary */}
          <button
            type="button"
            onClick={handleKakaoLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] px-6 py-3 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#FADA0A] active:bg-[#F5D400] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                fill="#191919"
                d="M9 1C4.58 1 1 3.79 1 7.21c0 2.17 1.45 4.08 3.64 5.18-.16.55-.58 2-.66 2.31-.11.39.14.38.3.28.12-.08 1.93-1.31 2.71-1.84.65.09 1.32.14 2.01.14 4.42 0 8-2.79 8-6.21S13.42 1 9 1"
              />
            </svg>
            카카오로 {mode === 'login' ? '로그인' : '시작하기'}
          </button>

          {/* Google Login — Secondary */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-300 bg-surface px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary active:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google로 {mode === 'login' ? '로그인' : '시작하기'}
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-surface-secondary px-2 text-text-tertiary">또는</span>
          </div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="이메일"
              required
              autoComplete="email"
              className="input-field"
              disabled={loading}
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="비밀번호"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="input-field"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn-primary w-full"
          >
            {loading ? '처리중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        {/* Error Alert */}
        {error && (
          <div
            className="mt-4 rounded-xl border border-status-error/20 bg-status-error/5 px-4 py-3 text-sm text-status-error"
            role="alert"
          >
            <p className="font-medium">오류 발생</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {/* Toggle Auth Mode */}
        <div className="mt-6 text-center text-sm text-text-secondary">
          {mode === 'login' ? (
            <>
              계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setEmail('');
                  setPassword('');
                }}
                className="font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                회원가입
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setEmail('');
                  setPassword('');
                }}
                className="font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                로그인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
