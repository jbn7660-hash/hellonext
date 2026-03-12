import type { ConfidenceState } from '../constants/confidence-thresholds';

/** Measurement State (Patent 3 Claims 1(b)-(c)) */
export interface MeasurementState {
  id: string;
  measurement_id: string;
  session_id: string;
  state: ConfidenceState;
  confidence_score: number;
  predicted_value: Record<string, unknown> | null;
  review_state: 'pending' | 'reviewed';
  issued_at: string;
}
