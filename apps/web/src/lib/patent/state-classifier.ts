/**
 * Confidence State Classifier
 *
 * Classifies confidence scores into 3-tier states for UI display.
 * Maps confidence levels to user-facing labels and visual properties.
 *
 * Single Source of Truth: @hellonext/shared의 ConfidenceState, classifyConfidence를 사용.
 * 이 파일은 UI 표시 로직(label, color, icon)만 담당.
 *
 * @module lib/patent/state-classifier
 * @feature DC-2
 */

import {
  type ConfidenceState,
  CONFIDENCE_STATES,
  classifyConfidence,
} from '@hellonext/shared';

// Re-export for backward compatibility (이 파일을 import하는 consumer 유지)
export { type ConfidenceState, CONFIDENCE_STATES, classifyConfidence };

/**
 * Complete display properties for confidence state (all visual aspects).
 */
export interface ConfidenceDisplayProps {
  label: string;
  color: string;
  icon: string;
  background: string;
  border: string;
}

/**
 * Get complete display properties for a confidence state.
 * Note: shared의 ConfidenceState 값은 'confirmed' | 'pending_verification' | 'hidden'
 *
 * @param state - Confidence state (from shared package)
 * @returns Display properties with label, color, icon, background, and border
 * @throws Never throws; default case handled with never check
 */
export function getConfidenceDisplayProps(state: ConfidenceState): ConfidenceDisplayProps {
  switch (state) {
    case 'confirmed':
      return {
        label: '확정',
        color: 'text-green-600',
        icon: '✓',
        background: 'bg-green-50',
        border: 'border-green-200',
      };
    case 'pending_verification':
      return {
        label: '검토 필요',
        color: 'text-yellow-600',
        icon: '⚠',
        background: 'bg-yellow-50',
        border: 'border-yellow-200',
      };
    case 'hidden':
      return {
        label: '숨김',
        color: 'text-gray-500',
        icon: '◯',
        background: 'bg-gray-50',
        border: 'border-gray-200',
      };
    default:
      const _exhaustiveCheck: never = state;
      return _exhaustiveCheck;
  }
}

/**
 * Get background color class for confidence state.
 * Deprecated: Use getConfidenceDisplayProps().background instead.
 * @param state - Confidence state
 * @returns Tailwind background color class
 */
export function getConfidenceBackgroundColor(state: ConfidenceState): string {
  return getConfidenceDisplayProps(state).background;
}

/**
 * Get border color class for confidence state.
 * Deprecated: Use getConfidenceDisplayProps().border instead.
 * @param state - Confidence state
 * @returns Tailwind border color class
 */
export function getConfidenceBorderColor(state: ConfidenceState): string {
  return getConfidenceDisplayProps(state).border;
}

/**
 * Batch classify multiple confidence scores.
 * Useful for processing arrays of measurements efficiently.
 *
 * @param scores - Array of confidence scores (0-1)
 * @returns Array of classified states
 */
export function classifyConfidenceBatch(scores: number[]): ConfidenceState[] {
  return scores.map(score => classifyConfidence(score));
}

/**
 * Convert confidence score (0-1) to progress percentage (0-100).
 * For visual progress bars and percentage displays.
 *
 * @param score - Confidence score (0-1)
 * @returns Progress percentage (0-100)
 */
export function getConfidenceProgress(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
