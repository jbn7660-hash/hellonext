/**
 * LoadingSpinner Component - Sprint 7 UX Polish
 *
 * Enhanced animated spinner with:
 *  - Multiple variants (ring, dots, bars, pulse, golf ball)
 *  - Overlay mode with backdrop blur
 *  - Progress/determinate mode (0-100%)
 *  - Rotating loading messages
 *  - Enhanced accessibility
 *
 * @module components/ui/loading-spinner
 * @example
 * <LoadingSpinner variant="ring" size="lg" label="로딩 중..." />
 * <LoadingSpinner variant="golf-ball" size="md" />
 * <LoadingSpinner variant="progress" progress={65} label="65% 완료" />
 */

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Spinner variant */
  variant?: 'ring' | 'dots' | 'bars' | 'pulse' | 'golf-ball' | 'progress';
  /** Optional label text displayed below spinner */
  label?: string;
  /** For progress variant: 0-100 */
  progress?: number;
  /** Show full-screen overlay */
  overlay?: boolean;
  /** Rotating messages for long waits */
  messages?: string[];
  /** Additional CSS classes */
  className?: string;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

const sizeBorderMap = {
  sm: 'border-2',
  md: 'border-2',
  lg: 'border-3',
};

export function LoadingSpinner({
  size = 'md',
  variant = 'ring',
  className,
  label,
  progress,
  overlay = false,
  messages,
  ...props
}: LoadingSpinnerProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const displayLabel = messages ? messages[messageIndex] : label;

  // Rotate messages every 3 seconds
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3000);

    return () => clearInterval(timer);
  }, [messages]);

  const spinnerContent = (
    <div
      className={cn('flex flex-col items-center gap-3', className)}
      role="status"
      aria-live="polite"
      aria-label={displayLabel ?? 'Loading'}
    >
      {/* Spinner variants */}
      {variant === 'ring' && (
        <div
          className={cn(
            sizeMap[size],
            sizeBorderMap[size],
            'rounded-full border-brand-primary/30 border-t-brand-primary animate-spin'
          )}
          aria-hidden="true"
        />
      )}

      {variant === 'dots' && (
        <div
          className={cn('flex gap-1', sizeMap[size])}
          aria-hidden="true"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      )}

      {variant === 'bars' && (
        <div
          className={cn('flex items-end gap-1', sizeMap[size])}
          aria-hidden="true"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex-1 bg-brand-primary rounded-t animate-pulse"
              style={{
                height: `${(i + 1) * 33}%`,
                animationDelay: `${i * 200}ms`,
              }}
            />
          ))}
        </div>
      )}

      {variant === 'pulse' && (
        <div
          className={cn(
            sizeMap[size],
            'rounded-full bg-brand-primary/30 animate-pulse'
          )}
          aria-hidden="true"
        />
      )}

      {variant === 'golf-ball' && (
        <div
          className={cn(
            sizeMap[size],
            'relative rounded-full bg-white border-2 border-brand-primary shadow-md overflow-hidden'
          )}
          aria-hidden="true"
        >
          {/* Golf ball dimples */}
          <svg
            className="absolute inset-0 w-full h-full animate-spin"
            viewBox="0 0 100 100"
          >
            <circle cx="25" cy="25" r="3" fill="#d1d5db" />
            <circle cx="75" cy="25" r="3" fill="#d1d5db" />
            <circle cx="50" cy="50" r="3" fill="#d1d5db" />
            <circle cx="25" cy="75" r="3" fill="#d1d5db" />
            <circle cx="75" cy="75" r="3" fill="#d1d5db" />
          </svg>
        </div>
      )}

      {variant === 'progress' && progress !== undefined && (
        <div className={cn('relative', sizeMap[size])}>
          <svg
            className="w-full h-full -rotate-90"
            viewBox="0 0 36 36"
          >
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="#f0f0f0"
              strokeWidth="2"
            />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${progress} ${100 - progress}`}
              strokeLinecap="round"
              className="text-brand-primary transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text-primary">
            {progress}%
          </div>
        </div>
      )}

      {/* Label with fade animation for message changes */}
      {displayLabel && (
        <p className="text-sm text-text-secondary animate-fade-in">
          {displayLabel}
        </p>
      )}

      {/* Screen reader text */}
      <span className="sr-only">
        {variant === 'progress'
          ? `${progress}% 완료`
          : `${displayLabel ?? 'Loading...'}. 잠시 기다려 주세요.`}
      </span>
    </div>
  );

  // Overlay mode
  if (overlay) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center animate-fade-in">
        <div className="bg-surface-primary rounded-3xl p-6 shadow-lg">
          {spinnerContent}
        </div>
      </div>
    );
  }

  return spinnerContent;
}
