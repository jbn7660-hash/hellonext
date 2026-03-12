/**
 * Confidence Indicator Component
 *
 * Visual badge/indicator showing measurement confidence state (Patent 3, DC-2).
 * - Confirmed (확정): green check badge
 * - Pending verification (검토 필요): yellow clock with animation
 * - Hidden: not rendered
 *
 * Features:
 * - Compact and full display modes
 * - Tooltip with confidence score on hover
 * - Animated transitions between states
 * - Multiple size options
 *
 * @module components/member/confidence-indicator
 * @feature DC-2
 * @patent Patent 3 Claim 1(b)
 */

'use client';

import { useState } from 'react';
import { getConfidenceDisplayProps } from '@/lib/patent/state-classifier';
import type { ConfidenceState } from '@/lib/patent/state-classifier';

interface ConfidenceIndicatorProps {
  state: ConfidenceState;
  score?: number;
  showLabel?: boolean;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceIndicator({
  state,
  score,
  showLabel = true,
  showScore = false,
  size = 'md',
}: ConfidenceIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Hidden measurements are not rendered (Patent 3 Claim 1(b))
  if (state === 'hidden') {
    return null;
  }

  const displayProps = getConfidenceDisplayProps(state);

  const sizeClasses = {
    sm: {
      indicator: 'h-2 w-2',
      text: 'text-xs',
    },
    md: {
      indicator: 'h-3 w-3',
      text: 'text-sm',
    },
    lg: {
      indicator: 'h-4 w-4',
      text: 'text-base',
    },
  };

  // Pending verification: dashed border with animation
  const borderStyle = state === 'pending_verification'
    ? 'border-2 border-dashed animate-pulse'
    : 'border-2 border-solid';

  const backgroundColor = state === 'confirmed' ? 'bg-green-600' : 'bg-yellow-500';

  return (
    <div
      className="flex items-center gap-2 relative"
      onMouseEnter={() => score !== undefined && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Indicator circle with state-specific styling */}
      <div
        className={`${sizeClasses[size].indicator} rounded-full ${backgroundColor} ${borderStyle} border-gray-300 transition-all duration-200`}
        title={displayProps.label}
      />

      {/* Label */}
      {showLabel && (
        <span className={`font-medium ${displayProps.color} ${sizeClasses[size].text} transition-colors duration-200`}>
          {displayProps.label}
        </span>
      )}

      {/* Score display */}
      {showScore && score !== undefined && (
        <span className={`text-gray-600 ${sizeClasses[size].text}`}>
          {Math.round(score * 100)}%
        </span>
      )}

      {/* Tooltip with confidence score on hover */}
      {showTooltip && score !== undefined && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none animate-fade-in">
          신뢰도: {Math.round(score * 100)}%
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

/**
 * Inline confidence badge for use within measurement displays.
 * Compact icon-only or full label badge.
 *
 * @param state - Confidence state
 * @param score - Optional confidence score for tooltip
 * @param compact - If true, show icon only; otherwise show label
 */
export function ConfidenceBadge({
  state,
  score,
  compact = false,
}: {
  state: ConfidenceState;
  score?: number;
  compact?: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Hidden measurements are not rendered (Patent 3 Claim 1(b))
  if (state === 'hidden') {
    return null;
  }

  const displayProps = getConfidenceDisplayProps(state);
  const scorePercent = score ? Math.round(score * 100) : null;

  const backgroundMap: Record<ConfidenceState, string> = {
    confirmed: 'bg-green-100 text-green-800',
    pending_verification: 'bg-yellow-100 text-yellow-800',
    hidden: 'bg-gray-100 text-gray-800',
  };

  const containerClass = `inline-block rounded font-medium transition-colors duration-200 relative ${
    compact ? 'px-2 py-1 text-xs' : 'px-3 py-1 rounded-full text-sm'
  } ${backgroundMap[state]}`;

  return (
    <span
      className={containerClass}
      onMouseEnter={() => score && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title={scorePercent ? `신뢰도: ${scorePercent}%` : displayProps.label}
    >
      {compact ? (
        displayProps.icon
      ) : (
        <>
          {displayProps.label}
          {scorePercent && <span className="ml-1 font-normal">({scorePercent}%)</span>}
        </>
      )}

      {/* Score tooltip on hover */}
      {showTooltip && scorePercent && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-20 pointer-events-none animate-fade-in">
          신뢰도: {scorePercent}%
        </div>
      )}
    </span>
  );
}
