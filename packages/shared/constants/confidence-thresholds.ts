/**
 * Measurement Confidence Thresholds (DC-2, Patent 3)
 *
 * measurement_confidence = keypoint_visibility × camera_angle_penalty
 *   × motion_blur_penalty × occlusion_penalty × K
 */

/** T1: Threshold for confirmed state (>=T1) */
export const CONFIDENCE_T1 = 0.7;

/** T2: Threshold for hidden state (<T2) */
export const CONFIDENCE_T2 = 0.4;

/** K: System calibration constant (adjustable per measurement type) */
export const DEFAULT_CONFIDENCE_K = 1.0;

/** Confidence states (Patent 3 Claim 1(b)) */
export const CONFIDENCE_STATES = {
  CONFIRMED: 'confirmed',
  PENDING_VERIFICATION: 'pending_verification',
  HIDDEN: 'hidden',
} as const;

export type ConfidenceState = typeof CONFIDENCE_STATES[keyof typeof CONFIDENCE_STATES];

/** Classify measurement confidence into 3-tier state */
export function classifyConfidence(score: number): ConfidenceState {
  if (score >= CONFIDENCE_T1) return CONFIDENCE_STATES.CONFIRMED;
  if (score >= CONFIDENCE_T2) return CONFIDENCE_STATES.PENDING_VERIFICATION;
  return CONFIDENCE_STATES.HIDDEN;
}

/** Daily verification queue limit per pro (F-016 NFR) */
export const VERIFICATION_DAILY_LIMIT_PER_PRO = 50;
