import {
  CONFIDENCE_T1,
  CONFIDENCE_T2,
  classifyConfidence,
  type ConfidenceState,
} from '../constants/confidence-thresholds';

/**
 * Validate measurement confidence score is in valid range [0, 1].
 *
 * @param score - Confidence score to validate
 * @throws Error if score is outside [0, 1]
 */
export function validateConfidenceScore(score: number): void {
  if (!Number.isFinite(score)) {
    throw new Error(
      `Invalid confidence score: ${score}. Must be a finite number.`
    );
  }
  if (score < 0 || score > 1) {
    throw new Error(
      `Invalid confidence score: ${score}. Must be between 0 and 1.`
    );
  }
}

/**
 * Calculate composite measurement confidence using 5-factor formula (DC-2, Patent 3).
 *
 * Formula: Confidence = V_c × (1 - P_a) × (1 - P_m) × (1 - P_o) × K
 *
 * Where:
 * - V_c: Keypoint visibility (0-1)
 * - P_a: Camera angle penalty (0-1)
 * - P_m: Motion blur penalty (0-1)
 * - P_o: Occlusion penalty (0-1)
 * - K: System calibration constant (default 0.85)
 *
 * @param params - 5-factor confidence parameters
 * @returns Normalized confidence score [0, 1]
 * @throws Error if any parameter is outside valid range
 */
export function calculateMeasurementConfidence(params: {
  keypoint_visibility: number;
  camera_angle_penalty: number;
  motion_blur_penalty: number;
  occlusion_penalty: number;
  K: number;
}): number {
  // Validate all inputs are in [0, 1]
  const { keypoint_visibility, camera_angle_penalty, motion_blur_penalty, occlusion_penalty, K } =
    params;

  if (
    !Number.isFinite(keypoint_visibility) ||
    keypoint_visibility < 0 ||
    keypoint_visibility > 1
  ) {
    throw new Error(
      `Invalid keypoint_visibility: ${keypoint_visibility}. Must be between 0 and 1.`
    );
  }
  if (
    !Number.isFinite(camera_angle_penalty) ||
    camera_angle_penalty < 0 ||
    camera_angle_penalty > 1
  ) {
    throw new Error(
      `Invalid camera_angle_penalty: ${camera_angle_penalty}. Must be between 0 and 1.`
    );
  }
  if (
    !Number.isFinite(motion_blur_penalty) ||
    motion_blur_penalty < 0 ||
    motion_blur_penalty > 1
  ) {
    throw new Error(
      `Invalid motion_blur_penalty: ${motion_blur_penalty}. Must be between 0 and 1.`
    );
  }
  if (!Number.isFinite(occlusion_penalty) || occlusion_penalty < 0 || occlusion_penalty > 1) {
    throw new Error(
      `Invalid occlusion_penalty: ${occlusion_penalty}. Must be between 0 and 1.`
    );
  }
  if (!Number.isFinite(K) || K <= 0) {
    throw new Error(`Invalid K parameter: ${K}. Must be positive.`);
  }

  // Apply 5-factor formula: V_c × (1 - P_a) × (1 - P_m) × (1 - P_o) × K
  const score =
    keypoint_visibility *
    (1 - camera_angle_penalty) *
    (1 - motion_blur_penalty) *
    (1 - occlusion_penalty) *
    K;

  // Clamp result to [0, 1]
  return Math.max(0, Math.min(1, score));
}

/**
 * Classify confidence score into 3-tier state using shared thresholds (Patent 3 Claim 1(b)).
 * Uses classifyConfidence from shared constants.
 *
 * @param score - Confidence score [0, 1]
 * @returns State: 'confirmed' (>=T1), 'pending_verification' (T2..T1), or 'hidden' (<T2)
 * @see CONFIDENCE_T1 (0.7) - Threshold for confirmed
 * @see CONFIDENCE_T2 (0.4) - Threshold for pending_verification vs hidden
 */
export function classifyMeasurementConfidence(score: number): ConfidenceState {
  validateConfidenceScore(score);
  return classifyConfidence(score);
}

/**
 * Determine if verification queue token should be issued (Patent 3 Claim 4).
 * Only pending_verification state gets verification tokens for pro review.
 *
 * @param state - Confidence state
 * @returns true if token should be issued (pending_verification), false otherwise
 */
export function shouldIssueVerificationToken(state: ConfidenceState): boolean {
  return state === 'pending_verification';
}
