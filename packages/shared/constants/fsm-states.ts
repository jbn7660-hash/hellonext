/**
 * Voice Memo FSM States (DC-5, Patent 4)
 * 4-state strict FSM: UNBOUND → PREPROCESSED → LINKED → FINALIZED
 */
export const FSM_STATES = {
  UNBOUND: 'UNBOUND',
  PREPROCESSED: 'PREPROCESSED',
  LINKED: 'LINKED',
  FINALIZED: 'FINALIZED',
} as const;

export type FsmState = typeof FSM_STATES[keyof typeof FSM_STATES];

/** Valid state transitions (DC-5: no skips allowed) */
export const VALID_TRANSITIONS: Record<FsmState, FsmState[]> = {
  UNBOUND: ['PREPROCESSED'],
  PREPROCESSED: ['LINKED'],
  LINKED: ['FINALIZED'],
  FINALIZED: [],
};

/** Recovery logic cases (Patent 4 Claim 1(e)) */
export const RECOVERY_CASES = {
  UNBOUND_NO_JOB: 'Create new transcription job',
  UNBOUND_WITH_JOB: 'Check job completion, retry if incomplete',
  PREPROCESSED: 'Skip transcription, wait for target_id binding',
  LINKED: 'Resume from report generation',
  FINALIZED: 'No action needed',
} as const;
