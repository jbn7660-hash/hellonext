import { FSM_STATES, VALID_TRANSITIONS, type FsmState } from '../constants/fsm-states';

/**
 * Validate FSM state transition (DC-5)
 * Throws if transition is invalid
 */
export function validateFsmTransition(from: FsmState, to: FsmState): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `DC-5 VIOLATION: Invalid FSM transition from ${from} to ${to}. ` +
      `Allowed transitions from ${from}: [${allowed.join(', ')}]`
    );
  }
}

/**
 * Validate target_id NULL invariant (Patent 4 Claim 2)
 * target_id must be NULL in UNBOUND and PREPROCESSED
 */
export function validateTargetIdInvariant(
  state: FsmState,
  targetId: string | null
): void {
  if (
    (state === FSM_STATES.UNBOUND || state === FSM_STATES.PREPROCESSED) &&
    targetId !== null
  ) {
    throw new Error(
      `DC-5 VIOLATION: target_id must be NULL in ${state} state (Patent 4 Claim 2)`
    );
  }
  if (
    (state === FSM_STATES.LINKED || state === FSM_STATES.FINALIZED) &&
    targetId === null
  ) {
    throw new Error(
      `DC-5 VIOLATION: target_id must NOT be NULL in ${state} state`
    );
  }
}

/**
 * Determine recovery action based on state + job_id (Patent 4 Claim 1(e))
 */
export function getRecoveryAction(
  state: FsmState,
  jobId: string | null
): string {
  switch (state) {
    case FSM_STATES.UNBOUND:
      return jobId === null
        ? 'CREATE_NEW_JOB'
        : 'CHECK_JOB_COMPLETION';
    case FSM_STATES.PREPROCESSED:
      return 'WAIT_TARGET_BINDING';
    case FSM_STATES.LINKED:
      return 'RESUME_REPORT_GENERATION';
    case FSM_STATES.FINALIZED:
      return 'NO_ACTION';
    default:
      throw new Error(`Unknown FSM state: ${state}`);
  }
}
