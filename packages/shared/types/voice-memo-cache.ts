import type { FsmState } from '../constants/fsm-states';

/** Voice Memo Cache Record (DC-5, Patent 4) */
export interface VoiceMemoCacheRecord {
  memo_id: string;
  coach_profile_id: string;
  target_id: string | null; // NULL in UNBOUND, PREPROCESSED
  state: FsmState;
  transcription_job_id: string | null;
  audio_blob_ref: string;
  transcript: string | null;
  created_at: string;
  updated_at: string;
}

/** State transition log entry */
export interface FsmTransitionLog {
  id: string;
  memo_id: string;
  from_state: FsmState;
  to_state: FsmState;
  transitioned_at: string;
  metadata: Record<string, unknown> | null;
}
