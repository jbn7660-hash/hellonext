/**
 * Pose Data Types
 *
 * Type definitions for MediaPipe BlazePose analysis results.
 *
 * @module types/pose
 */

/** Single 2D keypoint from MediaPipe */
export interface Keypoint {
  readonly x: number;
  readonly y: number;
  readonly visibility: number;
  readonly name: string;
}

/** Joint angles computed from keypoints */
export interface JointAngles {
  readonly leftShoulder: number;
  readonly rightShoulder: number;
  readonly leftElbow: number;
  readonly rightElbow: number;
  readonly leftHip: number;
  readonly rightHip: number;
  readonly leftKnee: number;
  readonly rightKnee: number;
  readonly spine: number;
}

/** Swing metrics derived from pose analysis */
export interface SwingMetrics {
  readonly tempo: number;
  readonly backswingDuration: number;
  readonly downswingDuration: number;
  readonly tempoRatio: number;
  readonly hipRotation: number;
  readonly shoulderRotation: number;
  readonly xFactor: number;
}

/** Frame-level pose data */
export interface PoseFrame {
  readonly frameIndex: number;
  readonly timestamp: number;
  readonly keypoints: readonly Keypoint[];
  readonly angles: JointAngles;
}
