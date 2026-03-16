/**
 * Member Coupon Redeem Page (F-012)
 *
 * Enhanced form for members to redeem coupon codes with:
 * - Auto-formatting (XXXX-XXXX pattern)
 * - Real-time validation feedback
 * - Character counter display
 * - Confetti celebration animation on success
 * - Deep link support (?code=XXXX-XXXX)
 * - Pro profile display on success
 * - Network error retry functionality
 * - Full accessibility (aria-labels, focus management)
 *
 * @page /redeem
 * @feature F-012
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

type RedeemState = 'idle' | 'loading' | 'success' | 'error';

interface RedeemResult {
  pro_name: string;
  pro_image_url?: string | null;
  specialization?: string | null;
  expires_at: string;
  message: string;
}

const COUPON_CODE_LENGTH = 8;
const COUPON_DISPLAY_LENGTH = 9; // includes dash

// Simple confetti animation
function createConfetti() {
  if (typeof window === 'undefined') return;

  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.position = 'fixed';
    confetti.style.width = '8px';
    confetti.style.height = '8px';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.top = '-10px';
    confetti.style.backgroundColor = (['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#C7CEEA'] as string[])[
      Math.floor(Math.random() * 5)
    ] ?? '#FF6B6B';
    confetti.style.borderRadius = '50%';
    confetti.style.pointerEvents = 'none';
    confetti.style.zIndex = '9999';

    document.body.appendChild(confetti);

    const startX = Math.random() * 100 - 50;
    const duration = 2000 + Math.random() * 1000;

    let startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        confetti.remove();
        return;
      }

      const top = progress * 100;
      const left = 50 + startX * Math.sin(progress * Math.PI * 4);
      const opacity = Math.max(0, 1 - progress);

      confetti.style.transform = `translate(${left}px, ${top}vh)`;
      confetti.style.opacity = opacity.toString();

      requestAnimationFrame(animate);
    };

    animate();
  }
}

export default function RedeemPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState('');
  const [state, setState] = useState<RedeemState>('idle');
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [networkRetryCount, setNetworkRetryCount] = useState(0);

  // Support deep link ?code=XXXX-XXXX
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam) {
      const clean = codeParam.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (clean.length === COUPON_CODE_LENGTH) {
        const formatted = `${clean.slice(0, 4)}-${clean.slice(4)}`;
        setCode(formatted);
        // Auto-focus and announce to screen readers
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [searchParams]);

  // Format input: auto-uppercase, insert dash, clear on invalid characters
  const handleCodeChange = (value: string) => {
    // Clear error message when user starts typing
    if (state === 'error' && errorMsg) {
      setErrorMsg('');
      setState('idle');
    }

    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length <= COUPON_CODE_LENGTH) {
      const formatted = clean.length > 4
        ? `${clean.slice(0, 4)}-${clean.slice(4)}`
        : clean;
      setCode(formatted);
    }
  };

  const cleanCode = code.replace(/-/g, '').trim();
  const isCodeValid = cleanCode.length === COUPON_CODE_LENGTH;

  const handleRedeem = useCallback(async () => {
    if (!isCodeValid) {
      setErrorMsg('정확한 8자리 쿠폰 코드를 입력하세요.');
      setState('error');
      return;
    }

    setState('loading');
    setErrorMsg('');
    setIsValidating(true);

    try {
      const res = await fetch(`/api/coupons/${cleanCode}/redeem`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? '쿠폰 활성화에 실패했습니다.');
        setState('error');
        setNetworkRetryCount(0);
        return;
      }

      setResult({
        pro_name: data.pro_name,
        pro_image_url: data.pro_image_url,
        specialization: data.specialization,
        expires_at: data.expires_at,
        message: data.message,
      });
      setState('success');
      createConfetti();

      // Announce success to screen readers
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');
      announcement.className = 'sr-only';
      announcement.textContent = `쿠폰 활성화 완료. ${data.pro_name} 프로님의 레슨에 연결되었습니다.`;
      document.body.appendChild(announcement);
      setTimeout(() => announcement.remove(), 1000);
    } catch (err) {
      const isNetworkError = err instanceof TypeError && err.message.includes('fetch');

      if (isNetworkError) {
        setErrorMsg('네트워크 연결을 확인해주세요.');
        setNetworkRetryCount((prev) => prev + 1);
      } else {
        setErrorMsg('예상치 못한 오류가 발생했습니다. 다시 시도해주세요.');
        setNetworkRetryCount(0);
      }

      setState('error');
      logger.error('Coupon redeem error', {
        error: err,
        code: cleanCode,
        isNetworkError,
        retryCount: networkRetryCount,
      });
    } finally {
      setIsValidating(false);
    }
  }, [cleanCode, isCodeValid, networkRetryCount]);

  const handleReset = () => {
    setCode('');
    setState('idle');
    setResult(null);
    setErrorMsg('');
    setNetworkRetryCount(0);
    inputRef.current?.focus();
  };

  // Success state with pro info
  if (state === 'success' && result) {
    return (
      <div className="px-5 pt-8 pb-12 flex flex-col items-center text-center">
        {/* Success icon */}
        <div className="w-20 h-20 rounded-full bg-calm-surface flex items-center justify-center mb-6 animate-scale-in">
          <svg
            className="w-10 h-10 text-calm"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
        </div>

        {/* Success message */}
        <h2 className="text-xl font-extrabold tracking-[-0.3px] text-ink mb-2">쿠폰 활성화 완료!</h2>
        <p className="text-sm text-ink-3 mb-6">{result.message}</p>

        {/* Pro profile card */}
        <div className="bg-card border border-border rounded-2xl shadow-card p-4 mb-6 w-full">
          <div className="flex items-center gap-3 mb-3">
            {result.pro_image_url ? (
              <img
                src={result.pro_image_url}
                alt={result.pro_name}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-warmth-surface flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-semibold text-warmth">
                  {result.pro_name.charAt(0)}
                </span>
              </div>
            )}
            <div className="text-left">
              <p className="font-semibold text-ink">{result.pro_name} 프로</p>
              {result.specialization && (
                <p className="text-xs text-ink-3">{result.specialization}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-ink-4">
            유효기간: ~{new Date(result.expires_at).toLocaleDateString('ko-KR')}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 w-full">
          <button
            type="button"
            onClick={() => router.push('/practice')}
            className="w-full py-3 rounded-xl bg-ink text-dawn text-sm font-semibold"
          >
            연습 시작하기
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="bg-card border border-border rounded-2xl shadow-card py-3 text-center text-sm font-medium text-ink-3 hover:bg-dawn transition-colors"
          >
            다른 쿠폰 입력
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 pb-12">
      {/* Header */}
      <h2 className="text-lg font-extrabold tracking-[-0.4px] text-ink mb-2">쿠폰 등록</h2>
      <p className="text-sm text-ink-3 mb-8">
        프로님에게 받은 쿠폰 코드를 입력하세요
      </p>

      {/* Input section */}
      <div className="mb-6">
        <div className="relative mb-2">
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && isCodeValid && handleRedeem()}
            placeholder="XXXX-XXXX"
            maxLength={COUPON_DISPLAY_LENGTH}
            autoFocus
            autoComplete="off"
            disabled={state === 'loading'}
            aria-label="쿠폰 코드 입력"
            aria-describedby="code-hint"
            aria-invalid={state === 'error'}
            className={cn(
              'w-full text-center text-2xl font-mono font-bold tracking-[0.3em] py-4 px-6',
              'border-2 rounded-2xl outline-none transition-all',
              'placeholder:text-ink-4/30 placeholder:tracking-[0.3em]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              state === 'error'
                ? 'border-tension bg-tension-surface focus:ring-2 focus:ring-tension/30 text-ink'
                : 'border-border focus:border-ink-4 focus:ring-2 focus:ring-ink/10 bg-card text-ink'
            )}
          />

          {/* Clear button */}
          {code && state !== 'loading' && (
            <button
              type="button"
              onClick={() => {
                setCode('');
                setErrorMsg('');
                setState('idle');
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink transition-colors"
              aria-label="쿠폰 코드 지우기"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </button>
          )}
        </div>

        {/* Character counter and validation feedback */}
        <div className="flex items-center justify-between px-1">
          <p
            id="code-hint"
            className={cn(
              'text-xs font-medium',
              isCodeValid ? 'text-calm' : 'text-ink-4'
            )}
          >
            {cleanCode.length}/{COUPON_CODE_LENGTH}자
          </p>
          {isCodeValid && (
            <p className="text-xs text-calm flex items-center gap-1">
              <span>✓</span> 올바른 형식입니다
            </p>
          )}
        </div>
      </div>

      {/* Error message with retry option */}
      {state === 'error' && errorMsg && (
        <div className="mb-4 p-3 bg-tension-surface border border-tension/20 rounded-2xl animate-fade-in">
          <p className="text-sm text-tension text-center mb-2">{errorMsg}</p>
          {networkRetryCount > 0 && (
            <p className="text-xs text-ink-4 text-center">
              재시도: {networkRetryCount}회
            </p>
          )}
        </div>
      )}

      {/* Submit button */}
      <button
        type="button"
        onClick={handleRedeem}
        disabled={!isCodeValid || state === 'loading'}
        aria-busy={state === 'loading'}
        className={cn(
          'w-full py-3.5 text-base font-semibold rounded-2xl transition-all',
          'bg-ink text-dawn',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink',
          state !== 'loading' && 'hover:opacity-90'
        )}
      >
        {state === 'loading' ? (
          <span className="inline-flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth={2} opacity={0.25} />
              <path d="M4 12a8 8 0 0 1 16 0" strokeWidth={2} strokeLinecap="round" />
            </svg>
            확인 중...
          </span>
        ) : (
          '쿠폰 활성화'
        )}
      </button>

      {/* Help text */}
      <p className="text-xs text-ink-4 text-center mt-6">
        쿠폰은 활성화 후 90일간 유효합니다.
        <br />
        <span className="block mt-1">문제가 있으신가요? <button type="button" className="text-sky hover:underline">지원팀에 문의</button></span>
      </p>
    </div>
  );
}
