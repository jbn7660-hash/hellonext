/** Verification Queue Entry (Patent 3 Claims 1(c), 1(e)) */
export interface VerificationQueueEntry {
  id: string;
  measurement_state_id: string;
  token: string;
  review_state: 'pending' | 'confirmed' | 'corrected' | 'rejected';
  reviewer_id: string | null;
  reviewed_at: string | null;
  response_type: 'confirm' | 'correct' | 'reject' | null;
  created_at: string;
}

/** Verification response from pro (Patent 3 Claim 1(e)) */
export interface VerificationResponse {
  token: string;
  response_type: 'confirm' | 'correct' | 'reject';
  corrected_value?: Record<string, unknown>;
}
