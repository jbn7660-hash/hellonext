/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

interface TranscriptionJob {
  id: string;
  voice_memo_id: string;
  user_id: string;
  status: JobStatus;
  audio_url: string | null;
  audio_duration: number | null;
  audio_format: string | null;
  transcript: string | null;
  confidence: number | null;
  language: string | null;
  segments: unknown[] | null;
  provider: string | null;
  model: string | null;
  processing_ms: number | null;
  retry_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface VoiceMemoRow {
  id: string;
  pro_id: string;
  audio_url: string;
  transcript: string | null;
  structured_json: unknown;
  status: string;
}

const GROQ_WHISPER_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

function createSupabaseAdmin() {
  const url =
    Deno.env.get('EDGE_SUPABASE_URL') ||
    Deno.env.get('SUPABASE_URL') ||
    Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
  const key =
    Deno.env.get('EDGE_SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

function getGroqKey(): string {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('Missing GROQ_API_KEY');
  return key;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function parseBoolean(value: string | null | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

async function fetchJobById(supabase: SupabaseAdmin, jobId: string): Promise<TranscriptionJob | null> {
  const { data, error } = await supabase
    .from('transcription_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  return (data as TranscriptionJob | null) ?? null;
}

async function claimNextJob(supabase: SupabaseAdmin): Promise<TranscriptionJob | null> {
  const { data, error } = await supabase
    .from('transcription_jobs')
    .select('*')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) throw error;

  const jobs = (data as TranscriptionJob[] | null) ?? [];
  for (const candidate of jobs) {
    if (!candidate.audio_url) continue;

    const { data: claimed, error: claimError } = await supabase
      .from('transcription_jobs')
      .update({
        status: 'processing',
        retry_count: (candidate.retry_count ?? 0) + 1,
        error_message: null,
      })
      .eq('id', candidate.id)
      .eq('updated_at', candidate.updated_at)
      .select('*')
      .maybeSingle();

    if (claimError) throw claimError;
    if (claimed) return claimed as TranscriptionJob;
  }

  return null;
}

async function loadVoiceMemo(supabase: SupabaseAdmin, memoId: string): Promise<VoiceMemoRow> {
  const { data, error } = await supabase
    .from('voice_memos')
    .select('id, pro_id, audio_url, transcript, structured_json, status')
    .eq('id', memoId)
    .single();

  if (error || !data) throw error ?? new Error(`Voice memo not found: ${memoId}`);
  return data as VoiceMemoRow;
}

async function downloadStoredAudio(supabase: SupabaseAdmin, storagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('audio').download(storagePath);
  if (error || !data) {
    const errMsg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error ?? 'unknown'));
    throw new Error(`Failed to download audio from storage: ${storagePath} — ${errMsg}`);
  }
  return data;
}

interface TranscribeResult {
  text: string;
  language?: string;
  segments?: unknown[];
  provider: 'groq';
}

async function transcribeAudio(audioBlob: Blob, filename: string, _mimeType: string): Promise<TranscribeResult> {
  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'ko');
  formData.append('response_format', 'verbose_json');

  const response = await fetch(GROQ_WHISPER_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getGroqKey()}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq Whisper API error: ${response.status} - ${body}`);
  }

  const json = await response.json();
  return {
    ...json,
    provider: 'groq',
  };
}

function inferMimeType(format: string | null): string {
  switch ((format ?? '').toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'webm':
      return 'audio/webm';
    case 'ogg':
      return 'audio/ogg';
    case 'mp4':
    case 'm4a':
    default:
      return 'audio/mp4';
  }
}

async function markFailure(supabase: SupabaseAdmin, job: TranscriptionJob, message: string) {
  await supabase
    .from('transcription_jobs')
    .update({
      status: 'failed',
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id);
}

async function processJob(supabase: SupabaseAdmin, job: TranscriptionJob) {
  const startedAt = Date.now();
  const memo = await loadVoiceMemo(supabase, job.voice_memo_id);
  const storagePath = job.audio_url ?? memo.audio_url;

  if (!storagePath) {
    throw new Error('Missing audio storage path on job and memo');
  }

  const audioBlob = await downloadStoredAudio(supabase, storagePath);
  const transcription = await transcribeAudio(
    audioBlob,
    `${job.id}.${job.audio_format ?? 'm4a'}`,
    inferMimeType(job.audio_format)
  );

  const transcript = typeof transcription?.text === 'string' ? transcription.text : '';
  const language = typeof transcription?.language === 'string' ? transcription.language : 'ko';
  const segments = Array.isArray(transcription?.segments) ? transcription.segments : [];
  const provider = 'groq';
  const confidence = null;
  const completedAt = new Date().toISOString();
  const processingMs = Date.now() - startedAt;

  const { error: jobUpdateError } = await supabase
    .from('transcription_jobs')
    .update({
      status: 'completed',
      transcript,
      language,
      segments,
      confidence,
      provider,
      model: 'whisper-large-v3',
      processing_ms: processingMs,
      completed_at: completedAt,
      error_message: null,
      audio_url: storagePath,
    })
    .eq('id', job.id);

  if (jobUpdateError) throw jobUpdateError;

  const { error: memoUpdateError } = await supabase
    .from('voice_memos')
    .update({
      transcript,
      status: 'transcribing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', memo.id);

  if (memoUpdateError) throw memoUpdateError;

  const { data: cache, error: cacheReadError } = await supabase
    .from('voice_memo_cache')
    .select('memo_id, state')
    .eq('memo_id', memo.id)
    .maybeSingle();

  if (cacheReadError) throw cacheReadError;

  if (cache) {
    const updatePayload: Record<string, unknown> = {
      transcription_job_id: job.id,
      transcript,
      updated_at: new Date().toISOString(),
    };

    if ((cache as { state?: string }).state === 'UNBOUND') {
      updatePayload.state = 'PREPROCESSED';
    }

    const { error: cacheUpdateError } = await supabase
      .from('voice_memo_cache')
      .update(updatePayload)
      .eq('memo_id', memo.id);

    if (cacheUpdateError) throw cacheUpdateError;
  }

  return {
    jobId: job.id,
    memoId: memo.id,
    transcriptLength: transcript.length,
    processingMs,
    stateAdvanced: cache ? (cache as { state?: string }).state === 'UNBOUND' : false,
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true });
  }

  try {
    const supabase = createSupabaseAdmin();
    const authHeader = req.headers.get('Authorization');
    const runnerSecret = Deno.env.get('VOICE_TRANSCRIBE_WORKER_SECRET');
    const allowUnauthenticated = parseBoolean(Deno.env.get('ALLOW_UNAUTHENTICATED_WORKER_INVOKE'), false);

    if (!allowUnauthenticated) {
      if (!runnerSecret) {
        throw new Error('Missing VOICE_TRANSCRIBE_WORKER_SECRET');
      }
      if (authHeader !== `Bearer ${runnerSecret}`) {
        return json({ error: 'Unauthorized worker invocation' }, 401);
      }
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const requestedJobId = typeof body?.jobId === 'string' ? body.jobId : null;

    const job = requestedJobId
      ? await fetchJobById(supabase, requestedJobId)
      : await claimNextJob(supabase);

    if (!job) {
      return json({ ok: true, processed: false, reason: 'no_job' });
    }

    if (requestedJobId && job.status === 'completed') {
      return json({ ok: true, processed: false, reason: 'already_completed', jobId: job.id });
    }

    if (requestedJobId && job.status === 'failed') {
      return json({ ok: true, processed: false, reason: 'already_failed', jobId: job.id });
    }

    if (requestedJobId && job.status !== 'processing') {
      const { error: claimError } = await supabase
        .from('transcription_jobs')
        .update({
          status: 'processing',
          retry_count: (job.retry_count ?? 0) + 1,
          error_message: null,
        })
        .eq('id', job.id);
      if (claimError) throw claimError;
    }

    try {
      const result = await processJob(supabase, job);
      return json({ ok: true, processed: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error));
      await markFailure(supabase, job, message);
      return json({ ok: false, processed: true, error: message, jobId: job.id }, 500);
    }
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error)),
      },
      500,
    );
  }
});
