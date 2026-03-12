/**
 * Client-side Preliminary Confidence Calculator
 *
 * Implements DC-2: preliminary confidence calculation using 5-factor formula (Patent 3).
 * Final K-adjusted score comes from server after reviewing edit history.
 *
 * Formula: Confidence = V_c × (1 - P_a) × (1 - P_m) × (1 - P_o) × K
 *
 * @module lib/patent/confidence-calculator
 * @feature DC-2
 */

import { classifyConfidence, CONFIDENCE_T1, CONFIDENCE_T2 } from '@hellonext/shared';
import type { Keypoint } from '@hellonext/shared/types/pose';

// Keypoints essential for golf swing analysis
const GOLF_KEYPOINTS = new Set([
  'nose', 'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
]);

export interface ConfidenceFactors {
  visibility: number;
  cameraAngle: number;
  motionBlur: number;
  occlusion: number;
  K: number;
}

export interface ConfidenceResult {
  score: number;
  factors: ConfidenceFactors;
  classification: 'confirmed' | 'pending_verification' | 'hidden';
}

/**
 * Get K factor from environment or use default (0.85)
 */
function getKFactor(): number {
  const envK = typeof window !== 'undefined'
    ? (window as any).__CONFIG__?.CONFIDENCE_K_FACTOR
    : process.env.NEXT_PUBLIC_CONFIDENCE_K_FACTOR;

  if (envK) {
    const parsed = parseFloat(envK);
    return isNaN(parsed) ? 0.85 : parsed;
  }
  return 0.85;
}

/**
 * Calculate average visibility of golf-relevant keypoints
 */
export function calculateKeypointVisibility(keypoints: Array<Keypoint & { name: string }>): number {
  const golfKeypoints = keypoints.filter((kp) => GOLF_KEYPOINTS.has(kp.name));

  if (golfKeypoints.length === 0) return 0;

  const totalVisibility = golfKeypoints.reduce((sum, kp) => sum + (kp.visibility ?? 0), 0);
  return Math.max(0, Math.min(1, totalVisibility / golfKeypoints.length));
}

/**
 * Estimate camera angle penalty based on shoulder/hip symmetry deviation
 * Optimal angle is 0° (perfect 90° side view). Penalty increases with deviation.
 */
export function estimateCameraAnglePenalty(keypoints: Array<Keypoint & { name: string }>): number {
  const leftShoulder = keypoints.find((kp) => kp.name === 'left_shoulder');
  const rightShoulder = keypoints.find((kp) => kp.name === 'right_shoulder');
  const leftHip = keypoints.find((kp) => kp.name === 'left_hip');
  const rightHip = keypoints.find((kp) => kp.name === 'right_hip');

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return 0.5; // Default penalty if keypoints missing
  }

  // Calculate shoulder and hip asymmetry
  const shoulderAsymmetry = Math.abs(leftShoulder.x - rightShoulder.x);
  const hipAsymmetry = Math.abs(leftHip.x - rightHip.x);
  const asymmetryRatio = shoulderAsymmetry / Math.max(1, hipAsymmetry);

  // Expected ratio is ~1.0 for good side view. Deviation increases penalty.
  const deviation = Math.abs(asymmetryRatio - 1.0);
  return Math.max(0, Math.min(1, deviation / 2.0));
}

/**
 * Estimate motion blur penalty based on keypoint displacement between frames
 */
export function estimateMotionBlurPenalty(
  currentFrame: Array<Keypoint & { name: string }>,
  previousFrame: Array<Keypoint & { name: string }> | null
): number {
  if (!previousFrame || previousFrame.length === 0) {
    return 0; // No previous frame to compare, assume no blur
  }

  const golfKeypoints = currentFrame.filter((kp) => GOLF_KEYPOINTS.has(kp.name));

  let totalDisplacement = 0;
  let count = 0;

  for (const currentKp of golfKeypoints) {
    const prevKp = previousFrame.find((kp) => kp.name === currentKp.name);
    if (prevKp) {
      const displacement = Math.sqrt(
        (currentKp.x - prevKp.x) ** 2 + (currentKp.y - prevKp.y) ** 2
      );
      totalDisplacement += displacement;
      count++;
    }
  }

  if (count === 0) return 0;

  const avgDisplacement = totalDisplacement / count;
  // Normalize: 0.5 pixel displacement = 0, 2.0+ pixels = 1.0 penalty
  // (Motion blur threshold depends on video resolution and frame rate)
  return Math.max(0, Math.min(1, (avgDisplacement - 0.5) / 1.5));
}

/**
 * Estimate occlusion penalty based on missing/low-visibility critical points
 * Critical points: shoulders, hips, elbows, knees, wrists
 */
export function estimateOcclusionPenalty(keypoints: Array<Keypoint & { name: string }>): number {
  const criticalPoints = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip',
                          'left_elbow', 'right_elbow', 'left_knee', 'right_knee',
                          'left_wrist', 'right_wrist'];

  let occludedCount = 0;

  for (const point of criticalPoints) {
    const keypoint = keypoints.find((kp) => kp.name === point);
    if (!keypoint || keypoint.visibility < 0.5) {
      occludedCount++;
    }
  }

  return Math.max(0, Math.min(1, occludedCount / criticalPoints.length));
}

/**
 * Calculate full 5-factor confidence score (Patent 3)
 *
 * Score = V_c × (1 - P_a) × (1 - P_m) × (1 - P_o) × K
 */
export function calculateConfidence(
  keypoints: Array<Keypoint & { name: string }>,
  previousFrame: Array<Keypoint & { name: string }> | null = null
): ConfidenceResult {
  // Clamp all factors to [0, 1]
  const visibility = Math.max(0, Math.min(1, calculateKeypointVisibility(keypoints)));
  const cameraAngle = Math.max(0, Math.min(1, estimateCameraAnglePenalty(keypoints)));
  const motionBlur = Math.max(0, Math.min(1, estimateMotionBlurPenalty(keypoints, previousFrame)));
  const occlusion = Math.max(0, Math.min(1, estimateOcclusionPenalty(keypoints)));
  const K = getKFactor();

  // Apply 5-factor formula: V_c × (1 - P_a) × (1 - P_m) × (1 - P_o) × K
  const score = visibility * (1 - cameraAngle) * (1 - motionBlur) * (1 - occlusion) * K;
  const finalScore = Math.max(0, Math.min(1, score));

  // Classify using shared thresholds (DC-2 compliance)
  // T1=0.7 for confirmed, T2=0.4 for pending_verification vs hidden
  const classification = classifyConfidence(finalScore);

  return {
    score: finalScore,
    factors: {
      visibility,
      cameraAngle,
      motionBlur,
      occlusion,
      K,
    },
    classification,
  };
}
