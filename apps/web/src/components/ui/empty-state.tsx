/**
 * EmptyState Component - Sprint 7 UX Polish
 *
 * Enhanced empty state with:
 *  - Different context variants (no-data, error, first-time)
 *  - Multiple action buttons
 *  - Animated icon with bounce/float
 *  - Size variants (compact, default, full)
 *  - Contextual tips and suggestions
 *  - Smooth animations
 *
 * @module components/ui/empty-state
 * @example
 * <EmptyState
 *   title="데이터 없음"
 *   description="첫 항목을 생성해보세요."
 *   variant="first-time"
 *   size="default"
 *   icon="📋"
 *   actions={[
 *     { label: '생성', onClick: () => {} },
 *     { label: '더보기', onClick: () => {} }
 *   ]}
 * />
 */

'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  icon?: string;
}

interface EmptyStateProps {
  /** Icon or emoji (string or ReactNode) */
  icon?: ReactNode;
  /** Main title text */
  title: string;
  /** Descriptive text below title */
  description?: string;
  /** Single action button (legacy) */
  action?: ReactNode;
  /** Multiple action buttons */
  actions?: EmptyStateAction[];
  /** Contextual variant for styling */
  variant?: 'no-data' | 'error' | 'first-time';
  /** Size of the empty state */
  size?: 'compact' | 'default' | 'full';
  /** Contextual tips/suggestions */
  tips?: string[];
  /** Dismiss button (for inline empty states) */
  dismissible?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses = {
  compact: 'py-6 px-4',
  default: 'py-12 px-6',
  full: 'py-24 px-6',
};

const iconAnimationMap = {
  'no-data': 'animate-float',
  'error': 'animate-bounce-soft',
  'first-time': 'animate-bounce-soft',
};

const iconColorMap = {
  'no-data': 'opacity-75',
  'error': 'text-status-error',
  'first-time': 'opacity-75',
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  actions,
  variant = 'no-data',
  size = 'default',
  tips,
  dismissible = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center animate-fade-in',
        sizeClasses[size],
        className
      )}
      role="status"
    >
      {/* Icon */}
      {icon && (
        <div className={cn(
          'mb-4 text-4xl transition-transform duration-300',
          iconAnimationMap[variant] || 'animate-float',
          iconColorMap[variant]
        )}>
          {typeof icon === 'string' ? <span>{icon}</span> : icon}
        </div>
      )}

      {/* Title */}
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-sm text-text-secondary max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {/* Tips/Suggestions */}
      {tips && tips.length > 0 && (
        <div className="mb-6 p-3 rounded-lg bg-gray-50 border border-gray-200 text-left w-full max-w-sm">
          <p className="text-xs font-semibold text-text-primary mb-2">💡 팁</p>
          <ul className="space-y-1">
            {tips.map((tip, idx) => (
              <li key={idx} className="text-xs text-text-secondary flex gap-2">
                <span className="text-brand-primary">·</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {(action || actions) && (
        <div className={cn(
          'mt-4 flex gap-2 flex-wrap justify-center',
          actions && actions.length > 1 ? 'flex-col' : ''
        )}>
          {actions ? (
            actions.map((btn, idx) => (
              <button
                key={idx}
                type="button"
                onClick={btn.onClick}
                className={cn(
                  btn.variant === 'secondary' ? 'btn-secondary' : 'btn-primary',
                  'text-sm',
                  actions.length > 1 && 'w-full'
                )}
              >
                {btn.icon && <span className="mr-2">{btn.icon}</span>}
                {btn.label}
              </button>
            ))
          ) : (
            action
          )}
        </div>
      )}

      {/* Dismiss button */}
      {dismissible && (
        <button
          type="button"
          className="mt-4 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          onClick={() => {
            // Parent should handle actual dismissal
          }}
        >
          닫기
        </button>
      )}
    </div>
  );
}
