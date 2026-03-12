/**
 * Voice FSM Controller Edge Function
 *
 * Manages the 4-state finite state machine for voice memo processing.
 * States: UNBOUND → PREPROCESSED → LINKED → FINALIZED
 *
 * Per Patent 4 Claim 1: Voice memos with inline target binding, state recovery,
 * and transcript caching to prevent duplicate processing.
 *
 * @edge-function voice-fsm-controller
 * @feature F-017, DC-5
 * @patent Patent 4 Claim 1(e)
 * @dependencies Supabase client, Sentry
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Types ───────────────────────────────────────────────────────

type FSMState = 'UNBOUND' | 'PREPROCESSED' | 'LINKED' | 'FINALIZED';

interface FSMCacheRecord {
  id: string;
  memo_id: string;
  state: FSMState;
  target_id: string | null;
  job_id: string | null;
  transcript: string | null;
  created_at: string;
  updated_at: string;
}

interface FSMControllerRequest {
  operation: 'initCache' | 'startTranscription' | 'bindTarget' | 'finalize' | 'recover';
  memo_id: string;
  target_id?: string;
  job_id?: string;
}

interface FSMRecoveryResult {
  current_state: FSMState;
  job_id: string | null;
  action: string;
  recovered: boolean;
}

// ─── Constants ───────────────────────────────────────────────────

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const STATE_TRANSITIONS: Record<FSMState, FSMState[]> = {
  UNBOUND: ['PREPROCESSED'],
  PREPROCESSED: ['LINKED'],
  LINKED: ['FINALIZED'],
  FINALIZED: [],
};

// ─── Helpers ─────────────────────────────────────────────────────

function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

function getOpenAIKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('Missing OPENAI_API_KEY');
  return key;
}

function getSentryDSN(): string {
  const dsn = Deno.env.get('SENTRY_DSN');
  return dsn || '';
}

/**
 * Validates state transition against FSM rules.
 */
function validateStateTransition(currentState: FSMState, targetState: FSMState): boolean {
  return STATE_TRANSITIONS[currentState].includes(targetState);
}

/**
 * Checks target_id NULL invariant: Only LINKED and FINALIZED states may have non-NULL target_id.
 */
function validateTargetIdInvariant(state: FSMState, targetId: string | null): boolean {
  if (state === 'UNBOUND' || state === 'PREPROCESSED') {
    return targetId === null;
  }
  // LINKED and FINALIZED can have any target_id
  return true;
}

/**
 * Reports DC-5 violation to Sentry.
 */
async function reportDC5Violation(
  violationType: string,
  details: Record<string, unknown>
): Promise<void> {
  const sentryDSN = getSentryDSN();
  if (!sentryDSN) {
    console.warn('[voice-fsm-controller] Sentry DSN not configured');
    return;
  }

  try {
    await fetch('https://sentry.io/api/123/store/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: crypto.randomUUID(),
        message: `DC-5 Violation: ${violationType}`,
        level: 'error',
        logger: 'voice-fsm-controller',
        extra: details,
      }),
    });
    console.info(`[voice-fsm-controller] DC-5 violation reported: ${violationType}`);
  } catch (error) {
    console.error('[voice-fsm-controller] Failed to report DC-5 violation:', error);
  }
}

/**
 * Log FSM state transition to audit table.
 */
async function logStateTransition(
  supabase: ReturnType<typeof createClient>,
  memoId: string,
  fromState: FSMState | null,
  toState: FSMState,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('voice_memo_state_log').insert({
      memo_id: memoId,
      from_state: fromState || 'NONE',
      to_state: toState,
      metadata: metadata || null,
    });
    console.info(`[voice-fsm-controller] State transition logged: ${fromState || 'NONE'} → ${toState}`);
  } catch (error) {
    console.warn(`[voice-fsm-controller] Failed to log state transition:`, error);
    // Don't throw - logging failure should not block FSM operations
  }
}

/**
 * Initialize FSM cache record with UNBOUND state and NULL target_id.
 */
async function initCache(
  supabase: ReturnType<typeof createClient>,
  memoId: string
): Promise<FSMCacheRecord> {
  console.info(`[voice-fsm-controller] initCache: ${memoId}`);

  const { data, error } = await supabase
    .from('voice_fsm_cache')
    .insert({
      memo_id: memoId,
      state: 'UNBOUND',
      target_id: null,
      job_id: null,
      transcript: null,
    })
    .select()
    .single();

  if (error) {
    await reportDC5Violation('INIT_CACHE_FAILED', { memo_id: memoId, error: error.message });
    throw error;
  }

  // Log initial state creation
  await logStateTransition(supabase, memoId, null, 'UNBOUND', {
    action: 'initCache',
  });

  console.info(`[voice-fsm-controller] Cache initialized: ${data.id}`);
  return data;
}

/**
 * Start transcription: UNBOUND → PREPROCESSED
 * Assigns job_id and initiates Whisper transcription.
 */
async function startTranscription(
  supabase: ReturnType<typeof createClient>,
  memoId: string,
  audioUrl: string
): Promise<{ cache: FSMCacheRecord; jobId: string }> {
  console.info(`[voice-fsm-controller] startTranscription: ${memoId}`);

  // Fetch current cache
  const { data: cache, error: fetchError } = await supabase
    .from('voice_fsm_cache')
    .select('*')
    .eq('memo_id', memoId)
    .single();

  if (fetchError || !cache) {
    await reportDC5Violation('CACHE_NOT_FOUND', { memo_id: memoId });
    throw new Error(`Cache not found for memo ${memoId}`);
  }

  // Guard: Validate UNBOUND state
  if (cache.state !== 'UNBOUND') {
    await reportDC5Violation('INVALID_STATE_TRANSITION', {
      memo_id: memoId,
      current_state: cache.state,
      expected_state: 'UNBOUND',
    });
    throw new Error(`Invalid state transition: ${cache.state} → PREPROCESSED`);
  }

  // Guard: Validate target_id NULL invariant
  if (!validateTargetIdInvariant(cache.state, cache.target_id)) {
    await reportDC5Violation('TARGET_ID_INVARIANT_VIOLATION', {
      memo_id: memoId,
      state: cache.state,
      target_id: cache.target_id,
    });
    throw new Error('Target ID invariant violated');
  }

  // Generate job_id
  const jobId = `whisper-${memoId}-${Date.now()}`;

  // Start Whisper transcription (async, will complete separately)
  // For now, queue the job
  const { error: transcribeError } = await supabase
    .from('transcription_jobs')
    .insert({
      job_id: jobId,
      memo_id: memoId,
      audio_url: audioUrl,
      status: 'queued',
    });

  if (transcribeError) {
    await reportDC5Violation('TRANSCRIPTION_JOB_INSERT_FAILED', {
      memo_id: memoId,
      error: transcribeError.message,
    });
    throw transcribeError;
  }

  // Update cache: UNBOUND → PREPROCESSED, assign job_id
  const { data: updated, error: updateError } = await supabase
    .from('voice_fsm_cache')
    .update({
      state: 'PREPROCESSED',
      job_id: jobId,
    })
    .eq('memo_id', memoId)
    .select()
    .single();

  if (updateError) {
    await reportDC5Violation('STATE_TRANSITION_FAILED', {
      memo_id: memoId,
      from: 'UNBOUND',
      to: 'PREPROCESSED',
      error: updateError.message,
    });
    throw updateError;
  }

  // Log state transition
  await logStateTransition(supabase, memoId, 'UNBOUND', 'PREPROCESSED', {
    action: 'startTranscription',
    job_id: jobId,
    audio_url: audioUrl,
  });

  console.info(`[voice-fsm-controller] Transitioned to PREPROCESSED: job_id=${jobId}`);
  return { cache: updated, jobId };
}

/**
 * Bind target: PREPROCESSED → LINKED
 * Sets target_id and transitions state.
 */
async function bindTarget(
  supabase: ReturnType<typeof createClient>,
  memoId: string,
  targetId: string
): Promise<FSMCacheRecord> {
  console.info(`[voice-fsm-controller] bindTarget: ${memoId} → ${targetId}`);

  // Fetch current cache
  const { data: cache, error: fetchError } = await supabase
    .from('voice_fsm_cache')
    .select('*')
    .eq('memo_id', memoId)
    .single();

  if (fetchError || !cache) {
    await reportDC5Violation('CACHE_NOT_FOUND', { memo_id: memoId });
    throw new Error(`Cache not found for memo ${memoId}`);
  }

  // Guard: Validate PREPROCESSED state
  if (cache.state !== 'PREPROCESSED') {
    await reportDC5Violation('INVALID_STATE_TRANSITION', {
      memo_id: memoId,
      current_state: cache.state,
      expected_state: 'PREPROCESSED',
    });
    throw new Error(`Invalid state transition: ${cache.state} → LINKED`);
  }

  // Guard: Validate target_id NULL invariant before transition
  if (!validateTargetIdInvariant('PREPROCESSED', cache.target_id)) {
    await reportDC5Violation('TARGET_ID_INVARIANT_VIOLATION', {
      memo_id: memoId,
      state: 'PREPROCESSED',
      target_id: cache.target_id,
    });
    throw new Error('Target ID invariant violated before transition');
  }

  // Update cache: PREPROCESSED → LINKED, set target_id
  const { data: updated, error: updateError } = await supabase
    .from('voice_fsm_cache')
    .update({
      state: 'LINKED',
      target_id: targetId,
    })
    .eq('memo_id', memoId)
    .select()
    .single();

  if (updateError) {
    await reportDC5Violation('STATE_TRANSITION_FAILED', {
      memo_id: memoId,
      from: 'PREPROCESSED',
      to: 'LINKED',
      error: updateError.message,
    });
    throw updateError;
  }

  // Log state transition
  await logStateTransition(supabase, memoId, 'PREPROCESSED', 'LINKED', {
    action: 'bindTarget',
    target_id: targetId,
    job_id: cache.job_id,
  });

  console.info(`[voice-fsm-controller] Transitioned to LINKED: target_id=${targetId}`);
  return updated;
}

/**
 * Finalize: LINKED → FINALIZED
 * Reuses cached transcript, marks as complete.
 */
async function finalize(
  supabase: ReturnType<typeof createClient>,
  memoId: string
): Promise<FSMCacheRecord> {
  console.info(`[voice-fsm-controller] finalize: ${memoId}`);

  // Fetch current cache
  const { data: cache, error: fetchError } = await supabase
    .from('voice_fsm_cache')
    .select('*')
    .eq('memo_id', memoId)
    .single();

  if (fetchError || !cache) {
    await reportDC5Violation('CACHE_NOT_FOUND', { memo_id: memoId });
    throw new Error(`Cache not found for memo ${memoId}`);
  }

  // Guard: Validate LINKED state
  if (cache.state !== 'LINKED') {
    await reportDC5Violation('INVALID_STATE_TRANSITION', {
      memo_id: memoId,
      current_state: cache.state,
      expected_state: 'LINKED',
    });
    throw new Error(`Invalid state transition: ${cache.state} → FINALIZED`);
  }

  // Guard: Validate target_id is NOT NULL in LINKED state
  if (cache.target_id === null) {
    await reportDC5Violation('TARGET_ID_NULL_IN_LINKED', {
      memo_id: memoId,
      state: 'LINKED',
    });
    throw new Error('Target ID must be set before finalization');
  }

  // Reuse cached transcript
  const transcript = cache.transcript;
  if (!transcript) {
    console.warn(`[voice-fsm-controller] No cached transcript for memo ${memoId}`);
  }

  // Update cache: LINKED → FINALIZED
  const { data: updated, error: updateError } = await supabase
    .from('voice_fsm_cache')
    .update({
      state: 'FINALIZED',
    })
    .eq('memo_id', memoId)
    .select()
    .single();

  if (updateError) {
    await reportDC5Violation('STATE_TRANSITION_FAILED', {
      memo_id: memoId,
      from: 'LINKED',
      to: 'FINALIZED',
      error: updateError.message,
    });
    throw updateError;
  }

  // Log state transition
  await logStateTransition(supabase, memoId, 'LINKED', 'FINALIZED', {
    action: 'finalize',
    target_id: cache.target_id,
    transcript_cached: !!transcript,
    transcript_length: transcript?.length || 0,
  });

  console.info(`[voice-fsm-controller] Transitioned to FINALIZED: cached transcript reused`);
  return updated;
}

/**
 * Recover: Inspect state + job_id and determine recovery action.
 * Per Patent 4 Claim 1(e): Determine recovery strategy based on FSM state.
 */
async function recover(
  supabase: ReturnType<typeof createClient>,
  memoId: string
): Promise<FSMRecoveryResult> {
  console.info(`[voice-fsm-controller] recover: ${memoId}`);

  // Fetch current cache
  const { data: cache, error: fetchError } = await supabase
    .from('voice_fsm_cache')
    .select('*')
    .eq('memo_id', memoId)
    .single();

  if (fetchError || !cache) {
    return {
      current_state: 'UNBOUND' as FSMState,
      job_id: null,
      action: 'INITIALIZE_CACHE',
      recovered: false,
    };
  }

  let action = 'UNKNOWN';
  let recovered = false;

  // Determine recovery action per Patent 4 Claim 1(e)
  switch (cache.state) {
    case 'UNBOUND':
      action = 'RESTART_TRANSCRIPTION';
      break;

    case 'PREPROCESSED':
      if (cache.job_id) {
        // Check if transcription job is still running
        const { data: job } = await supabase
          .from('transcription_jobs')
          .select('status')
          .eq('job_id', cache.job_id)
          .single();

        if (job?.status === 'completed') {
          action = 'CONTINUE_TO_BIND_TARGET';
          recovered = true;
        } else if (job?.status === 'failed') {
          action = 'RETRY_TRANSCRIPTION';
        } else {
          action = 'WAIT_FOR_TRANSCRIPTION';
          recovered = true;
        }
      } else {
        action = 'RESTART_TRANSCRIPTION';
      }
      break;

    case 'LINKED':
      action = 'CONTINUE_TO_FINALIZE';
      recovered = true;
      break;

    case 'FINALIZED':
      action = 'ALREADY_COMPLETE';
      recovered = true;
      break;
  }

  console.info(`[voice-fsm-controller] Recovery: state=${cache.state}, action=${action}`);

  return {
    current_state: cache.state,
    job_id: cache.job_id,
    action,
    recovered,
  };
}

// ─── Main Handler ────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'https://hellonext.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as FSMControllerRequest;
    const { operation, memo_id } = body;

    if (!memo_id) {
      return new Response(
        JSON.stringify({ error: 'memo_id is required', error_code: 'MISSING_MEMO_ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`[voice-fsm-controller] Operation: ${operation} on memo ${memo_id}`);
    const supabase = createSupabaseAdmin();

    let result: unknown;

    switch (operation) {
      case 'initCache':
        result = await initCache(supabase, memo_id);
        break;

      case 'startTranscription': {
        const { data: memo } = await supabase
          .from('voice_memos')
          .select('audio_url')
          .eq('id', memo_id)
          .single();

        if (!memo?.audio_url) {
          return new Response(
            JSON.stringify({ error: 'Audio URL not found in memo' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await startTranscription(supabase, memo_id, memo.audio_url);
        break;
      }

      case 'bindTarget': {
        const { target_id } = body;
        if (!target_id) {
          return new Response(
            JSON.stringify({ error: 'target_id is required for bindTarget', error_code: 'MISSING_TARGET_ID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await bindTarget(supabase, memo_id, target_id);
        break;
      }

      case 'finalize':
        result = await finalize(supabase, memo_id);
        break;

      case 'recover':
        result = await recover(supabase, memo_id);
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown operation', error_code: 'UNKNOWN_OPERATION', operation }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, operation, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[voice-fsm-controller] Error:', error);

    const isValidationError = error instanceof Error && error.message.includes('DC-5');
    const statusCode = isValidationError ? 409 : 500;
    const errorCode = isValidationError ? 'DC5_VIOLATION' : 'INTERNAL_ERROR';

    return new Response(
      JSON.stringify({
        error: 'FSM operation failed',
        error_code: errorCode,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
