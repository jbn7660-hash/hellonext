/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type FSMState = 'UNBOUND' | 'PREPROCESSED' | 'LINKED' | 'FINALIZED';
type Operation = 'initCache' | 'bindTarget' | 'finalize' | 'recover';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

interface FSMCacheRecord {
  memo_id: string;
  coach_profile_id: string | null;
  state: FSMState;
  target_id: string | null;
  transcription_job_id: string | null;
  audio_blob_ref: string;
  transcript: string | null;
  created_at: string;
  updated_at: string;
}

interface FSMControllerRequest {
  operation: Operation;
  memo_id: string;
  target_id?: string;
  audio_blob_ref?: string;
}

interface FSMRecoveryResult {
  current_state: FSMState;
  transcription_job_id: string | null;
  action: string;
  recovered: boolean;
}

const STATE_TRANSITIONS: Record<FSMState, FSMState[]> = {
  UNBOUND: ['PREPROCESSED'],
  PREPROCESSED: ['LINKED'],
  LINKED: ['FINALIZED'],
  FINALIZED: [],
};

function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'https://hellonext.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function isValidTransition(currentState: FSMState, nextState: FSMState) {
  return STATE_TRANSITIONS[currentState].includes(nextState);
}

async function getMemoOwnerProfileId(supabase: SupabaseAdmin, memoId: string): Promise<string> {
  const { data, error } = await supabase
    .from('voice_memos')
    .select('pro_id')
    .eq('id', memoId)
    .single();

  if (error || !data?.pro_id) {
    throw new Error(`Voice memo not found: ${memoId}`);
  }

  return data.pro_id as string;
}

async function getCache(supabase: SupabaseAdmin, memoId: string): Promise<FSMCacheRecord | null> {
  const { data, error } = await supabase
    .from('voice_memo_cache')
    .select('*')
    .eq('memo_id', memoId)
    .maybeSingle();

  if (error) throw error;
  return (data as FSMCacheRecord | null) ?? null;
}

async function initCache(supabase: SupabaseAdmin, memoId: string, audioBlobRef?: string): Promise<FSMCacheRecord> {
  const existing = await getCache(supabase, memoId);
  if (existing) return existing;

  const { data: memo, error: memoError } = await supabase
    .from('voice_memos')
    .select('pro_id, audio_url')
    .eq('id', memoId)
    .single();

  if (memoError || !memo?.pro_id) {
    throw memoError ?? new Error(`Voice memo not found: ${memoId}`);
  }

  const coachProfileId = memo.pro_id as string;
  const resolvedAudioBlobRef = audioBlobRef ?? memo.audio_url;

  if (!resolvedAudioBlobRef) {
    throw new Error('audio_blob_ref is required to initialize cache');
  }

  const { data, error } = await supabase
    .from('voice_memo_cache')
    .insert({
      memo_id: memoId,
      coach_profile_id: coachProfileId,
      state: 'UNBOUND',
      target_id: null,
      transcription_job_id: null,
      audio_blob_ref: resolvedAudioBlobRef,
      transcript: null,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Failed to initialize cache');
  return data as FSMCacheRecord;
}

async function bindTarget(supabase: SupabaseAdmin, memoId: string, targetId: string): Promise<FSMCacheRecord> {
  const cache = await getCache(supabase, memoId);
  if (!cache) throw new Error(`Cache not found for memo ${memoId}`);
  if (!isValidTransition(cache.state, 'LINKED')) {
    throw new Error(`Invalid state transition: ${cache.state} → LINKED`);
  }

  const { data, error } = await supabase
    .from('voice_memo_cache')
    .update({ state: 'LINKED', target_id: targetId, updated_at: new Date().toISOString() })
    .eq('memo_id', memoId)
    .select('*')
    .single();

  if (error || !data) {
    const errMsg = error ? (typeof error === 'object' ? JSON.stringify(error) : String(error)) : 'No data returned';
    throw new Error(`Failed to bind target: ${errMsg}`);
  }
  return data as FSMCacheRecord;
}

async function finalize(supabase: SupabaseAdmin, memoId: string): Promise<FSMCacheRecord> {
  const cache = await getCache(supabase, memoId);
  if (!cache) throw new Error(`Cache not found for memo ${memoId}`);
  if (!isValidTransition(cache.state, 'FINALIZED')) {
    throw new Error(`Invalid state transition: ${cache.state} → FINALIZED`);
  }
  if (!cache.target_id) {
    throw new Error('Target ID must be set before finalization');
  }

  const { data, error } = await supabase
    .from('voice_memo_cache')
    .update({ state: 'FINALIZED' })
    .eq('memo_id', memoId)
    .select('*')
    .single();

  if (error || !data) {
    const errMsg = error ? (typeof error === 'object' ? JSON.stringify(error) : String(error)) : 'No data returned';
    throw new Error(`Failed to finalize cache: ${errMsg}`);
  }
  return data as FSMCacheRecord;
}

async function recover(supabase: SupabaseAdmin, memoId: string): Promise<FSMRecoveryResult> {
  const cache = await getCache(supabase, memoId);

  if (!cache) {
    return {
      current_state: 'UNBOUND',
      transcription_job_id: null,
      action: 'INITIALIZE_CACHE',
      recovered: false,
    };
  }

  switch (cache.state) {
    case 'UNBOUND':
      return {
        current_state: cache.state,
        transcription_job_id: cache.transcription_job_id,
        action: 'WAIT_FOR_TRANSCRIPTION_OR_TRIGGER_TRANSCRIBE',
        recovered: false,
      };
    case 'PREPROCESSED':
      return {
        current_state: cache.state,
        transcription_job_id: cache.transcription_job_id,
        action: cache.target_id ? 'READY_TO_LINK' : 'WAIT_FOR_TARGET_BINDING',
        recovered: true,
      };
    case 'LINKED':
      return {
        current_state: cache.state,
        transcription_job_id: cache.transcription_job_id,
        action: 'READY_TO_FINALIZE',
        recovered: true,
      };
    case 'FINALIZED':
      return {
        current_state: cache.state,
        transcription_job_id: cache.transcription_job_id,
        action: 'ALREADY_COMPLETE',
        recovered: true,
      };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true });
  }

  try {
    const body = (await req.json()) as FSMControllerRequest;
    const { operation, memo_id, target_id, audio_blob_ref } = body;

    if (!operation || !memo_id) {
      return json({ error: 'operation and memo_id are required' }, 400);
    }

    const supabase = createSupabaseAdmin();

    switch (operation) {
      case 'initCache':
        return json({ success: true, operation, result: await initCache(supabase, memo_id, audio_blob_ref) });
      case 'bindTarget':
        if (!target_id) return json({ error: 'target_id is required for bindTarget' }, 400);
        return json({ success: true, operation, result: await bindTarget(supabase, memo_id, target_id) });
      case 'finalize':
        return json({ success: true, operation, result: await finalize(supabase, memo_id) });
      case 'recover':
        return json({ success: true, operation, result: await recover(supabase, memo_id) });
      default:
        return json({ error: 'Unknown operation', operation }, 400);
    }
  } catch (error) {
    console.error('[voice-fsm-controller] Error:', error);
    const message = error instanceof Error
      ? error.message
      : (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error));
    return json(
      {
        error: 'FSM operation failed',
        message,
      },
      500
    );
  }
});
