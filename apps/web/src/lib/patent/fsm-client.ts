/**
 * Client-side FSM Helpers for Voice Memo Pipeline
 *
 * Provides client-side helpers for calling the voice-fsm-controller Edge Function.
 * Manages FSM state transitions and display logic for the voice memo recording pipeline.
 *
 * @module lib/patent/fsm-client
 * @feature F-001 (Voice Memo)
 */

import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import {
  type FsmState as SharedFsmState,
  FSM_STATES,
  VALID_TRANSITIONS,
  validateTargetIdInvariant,
  getRecoveryAction,
} from '@hellonext/shared';

/**
 * FSM state enumeration.
 * Shared FsmState(DB 4상태) + 클라이언트 전용 ERROR 상태 확장.
 */
export type FsmState = SharedFsmState | 'ERROR';

// Re-export shared constants and validators for convenience
export { FSM_STATES, VALID_TRANSITIONS, validateTargetIdInvariant, getRecoveryAction };

/**
 * FSM action types.
 */
export type FsmAction = 'initCache' | 'startTranscription' | 'bindTarget' | 'finalize' | 'recover';

/**
 * FSM action parameters.
 */
export interface FsmActionParams {
  initCache?: {
    sessionId: string;
    cacheKey: string;
  };
  startTranscription?: {
    audioBlob: Blob;
    language: string;
  };
  bindTarget?: {
    targetMeasurementId: string;
    targetType: string;
  };
  finalize?: {
    edits: Record<string, any>;
  };
  recover?: {
    previousStateId: string;
  };
}

/**
 * FSM state display properties.
 */
export interface FsmStateDisplay {
  label: string;
  progress: number; // 0-100
  description: string;
}

/**
 * Call an FSM action via the voice-fsm-controller Edge Function.
 * Includes retry logic (1 retry with exponential backoff) and request timeout.
 *
 * @param action - FSM action to perform
 * @param params - Action-specific parameters
 * @param maxRetries - Maximum number of retries (default: 1)
 * @returns FSM response with new state
 */
export async function callFsmAction(
  action: FsmAction,
  params: Record<string, any>,
  maxRetries: number = 1
): Promise<{ state: FsmState; data: Record<string, any> }> {
  const getTimeout = (action: FsmAction): number => {
    // Longer timeout for transcription (may involve Whisper API)
    if (action === 'startTranscription') {
      return 120000; // 120 seconds
    }
    // Standard 30 second timeout for other operations
    return 30000; // 30 seconds
  };

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const supabase = createClient();
      const timeout = getTimeout(action);

      // Wrap in AbortController for timeout enforcement
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await Promise.race([
          supabase.functions.invoke('voice-fsm-controller', {
            body: {
              action,
              params,
            },
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`FSM action ${action} timeout after ${timeout}ms`)), timeout)
          ),
        ]);

        clearTimeout(timeoutId);

        if (response?.error) {
          throw new Error(`FSM action failed: ${response.error.message}`);
        }

        logger.info(`FSM action ${action} completed`, { state: response?.data?.state, attempt });

        return {
          state: response?.data?.state,
          data: response?.data,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error as Error;
      attempt++;

      if (attempt <= maxRetries) {
        // Exponential backoff: 1s, 2s, etc.
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        logger.warn(`FSM action ${action} failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${delayMs}ms`, {
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  logger.error(`FSM action ${action} failed after ${maxRetries + 1} attempts`, { error: lastError });
  throw lastError || new Error(`FSM action ${action} failed`);
}

/**
 * Get display properties for an FSM state.
 * Maps FSM state to user-facing label, progress percentage, and description.
 *
 * Progress mapping:
 * - UNBOUND: 0%
 * - PREPROCESSED: 33%
 * - LINKED: 66%
 * - FINALIZED: 100%
 *
 * @param state - FSM state
 * @returns Display properties
 */
export function getFsmStateDisplay(state: FsmState): FsmStateDisplay {
  const displayMap: Record<FsmState, FsmStateDisplay> = {
    UNBOUND: {
      label: '대기 중',
      progress: 0,
      description: '음성 메모 준비 중...',
    },
    PREPROCESSED: {
      label: '전처리 완료',
      progress: 33,
      description: '음성을 처리하는 중...',
    },
    LINKED: {
      label: '링크됨',
      progress: 66,
      description: '데이터를 연결하는 중...',
    },
    FINALIZED: {
      label: '완료',
      progress: 100,
      description: '음성 메모가 저장되었습니다.',
    },
    ERROR: {
      label: '오류',
      progress: 0,
      description: '처리 중 오류가 발생했습니다.',
    },
  };

  return displayMap[state] || displayMap.ERROR;
}

/**
 * Initialize FSM cache for a new session.
 *
 * @param sessionId - Session ID
 * @param cacheKey - Cache key for storage
 * @returns FSM response
 */
export async function initFsmCache(
  sessionId: string,
  cacheKey: string
): Promise<{ state: FsmState; data: Record<string, any> }> {
  return callFsmAction('initCache', {
    initCache: { sessionId, cacheKey },
  });
}

/**
 * Start transcription in FSM.
 *
 * @param audioBlob - Audio data blob
 * @param language - Language code (e.g., 'ko', 'en')
 * @returns FSM response
 */
export async function startFsmTranscription(
  audioBlob: Blob,
  language: string = 'ko'
): Promise<{ state: FsmState; data: Record<string, any> }> {
  return callFsmAction('startTranscription', {
    startTranscription: { audioBlob, language },
  });
}

/**
 * Bind FSM to a target measurement.
 *
 * @param targetMeasurementId - Measurement ID to bind to
 * @param targetType - Type of measurement
 * @returns FSM response
 */
export async function bindFsmTarget(
  targetMeasurementId: string,
  targetType: string
): Promise<{ state: FsmState; data: Record<string, any> }> {
  return callFsmAction('bindTarget', {
    bindTarget: { targetMeasurementId, targetType },
  });
}

/**
 * Finalize FSM with provided edits.
 *
 * @param edits - Edit deltas to apply
 * @returns FSM response
 */
export async function finalizeFsm(
  edits: Record<string, any>
): Promise<{ state: FsmState; data: Record<string, any> }> {
  return callFsmAction('finalize', {
    finalize: { edits },
  });
}

/**
 * Recover FSM to a previous state.
 *
 * @param previousStateId - ID of previous FSM state to recover
 * @returns FSM response
 */
export async function recoverFsm(
  previousStateId: string
): Promise<{ state: FsmState; data: Record<string, any> }> {
  return callFsmAction('recover', {
    recover: { previousStateId },
  });
}

/**
 * Get the current FSM state from cache without triggering transitions.
 * Fetches directly from voice_memo_cache to inspect recovery options.
 *
 * @param memoId - Voice memo ID
 * @returns Current FSM state and metadata or null if cache not found
 */
export async function getCurrentFsmState(
  memoId: string
): Promise<{
  state: FsmState;
  targetId: string | null;
  jobId: string | null;
  transcript: string | null;
  recoveryAction: string;
} | null> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('voice_memo_cache')
      .select('state, target_id, transcription_job_id, transcript')
      .eq('memo_id', memoId)
      .single();

    if (error || !data) {
      logger.warn(`FSM cache not found for memo ${memoId}`, { error });
      return null;
    }

    const state = data.state as FsmState;
    const recoveryAction = getRecoveryAction(state, data.transcription_job_id);

    logger.info(`Current FSM state retrieved`, {
      memoId,
      state,
      recoveryAction,
    });

    return {
      state,
      targetId: data.target_id,
      jobId: data.transcription_job_id,
      transcript: data.transcript,
      recoveryAction,
    };
  } catch (error) {
    logger.error(`Failed to get current FSM state`, { error, memoId });
    return null;
  }
}
