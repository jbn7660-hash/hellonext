import type { Keypoint } from './pose';

/** Layer A: Raw Measurement (DC-1, DC-3 — Immutable) */
export interface RawMeasurement {
  readonly id: string;
  readonly session_id: string;
  readonly frame_index: number;
  readonly spatial_data: SpatialData;
  readonly measurement_confidence: number | null;
  readonly source_model: string;
  readonly source_version: string;
  readonly created_at: string;
}

/** Keypoint extended with optional z-axis for 3D data */
export interface Keypoint3D extends Keypoint {
  z?: number;
}

export interface SpatialData {
  keypoints: Keypoint3D[];
  joint_angles: Record<string, number>;
  visibility_scores: Record<string, number>;
}
