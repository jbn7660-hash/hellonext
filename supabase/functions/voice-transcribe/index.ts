/**
 * Edge Function: voice-transcribe
 *
 * Receives audio file from mobile app, persists/upload data, creates a transcription job,
 * and returns an immediate ACK. This is the first step toward ACK + job-oriented processing.
 *
 * Current behavior:
 * - Authenticates caller
 * - Deduplicates in-flight/completed jobs per voice memo
 * - Uploads original audio to Storage when possible
 * - Creates/updates a `transcription_jobs` row
 * - Updates `voice_memo_cache.transcription_job_id` when cache exists
 * - Returns 202 Accepted instead of waiting for Whisper completion
 *
 * POST /functions/v1/voice-transcribe
 * Body: FormData { audio: File, voice_memo_id: string, duration: string }
 * Returns: { accepted, jobId, status, storagePath, reused }
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl =
      Deno.env.get('EDGE_SUPABASE_URL') ||
      Deno.env.get('SUPABASE_URL') ||
      Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ||
      '';
    const supabaseServiceKey =
      Deno.env.get('EDGE_SUPABASE_SERVICE_ROLE_KEY') ||
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl) {
      throw new Error('Missing required environment variable: EDGE_SUPABASE_URL, SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_URL');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonError('인증이 필요합니다.', 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const allowInsecureLocalAuthBypass = Deno.env.get('ALLOW_INSECURE_LOCAL_AUTH_BYPASS') === 'true';

    // --- Admin smoke bypass ---
    // service-role 기반 admin 경로: user JWT 없이 파이프라인 E2E 검증 가능
    // 사용법: Authorization: Bearer <VOICE_ADMIN_SECRET>, body에 user_id 포함
    const adminSecret = Deno.env.get('VOICE_ADMIN_SECRET');
    const isAdminBypass = adminSecret && token === adminSecret;

    let userId: string | null = null;

    if (isAdminBypass) {
      // admin bypass: body에서 user_id를 읽거나, 없으면 고정 smoke user
      const bodyClone = req.clone();
      try {
        const peek = await bodyClone.formData();
        userId = (peek.get('user_id') as string) || null;
      } catch {
        // formData 파싱 실패 시 무시 — 아래에서 fallback
      }
      if (!userId) {
        userId = Deno.env.get('SMOKE_TEST_USER_ID') || '00000000-0000-0000-0000-000000000000';
      }
      console.log(`[admin-bypass] userId=${userId}`);
    } else {
      // 일반 사용자 JWT 인증 경로
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        if (!allowInsecureLocalAuthBypass || !supabaseUrl.includes('127.0.0.1')) {
          return jsonError('인증 실패', 401);
        }

        const fallbackUserId = extractUserIdFromJwt(token);
        if (!fallbackUserId) {
          return jsonError('인증 실패', 401);
        }
        userId = fallbackUserId;
      } else {
        userId = user.id;
      }
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio');
    const voiceMemoId = formData.get('voice_memo_id');
    const duration = parseInt((formData.get('duration') as string) || '0', 10);

    if (!(audioFile instanceof File)) {
      return jsonError('오디오 파일이 필요합니다.', 400);
    }

    if (!audioFile.name) {
      return jsonError('오디오 파일 이름이 필요합니다.', 400);
    }

    if (typeof voiceMemoId !== 'string' || !voiceMemoId.trim()) {
      return jsonError('voice_memo_id가 필요합니다.', 400);
    }

    const { data: existingProcessingJob, error: existingProcessingJobError } = await supabase
      .from('transcription_jobs')
      .select('id, status, created_at, audio_url')
      .eq('voice_memo_id', voiceMemoId)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingProcessingJobError) {
      return jsonDetailedError('기존 작업 조회 실패', 'lookup_job', existingProcessingJobError, 500);
    }

    if (existingProcessingJob) {
      return new Response(
        JSON.stringify({
          accepted: true,
          reused: true,
          jobId: existingProcessingJob.id,
          status: existingProcessingJob.status,
          storagePath: existingProcessingJob.audio_url,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 202,
        }
      );
    }

    const { data: existingCompletedJob, error: existingCompletedJobError } = await supabase
      .from('transcription_jobs')
      .select('id, status, audio_url')
      .eq('voice_memo_id', voiceMemoId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCompletedJobError) {
      return jsonDetailedError('완료 작업 조회 실패', 'lookup_completed_job', existingCompletedJobError, 500);
    }

    if (existingCompletedJob) {
      return new Response(
        JSON.stringify({
          accepted: true,
          reused: true,
          jobId: existingCompletedJob.id,
          status: existingCompletedJob.status,
          storagePath: existingCompletedJob.audio_url,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 202,
        }
      );
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const audioFormat = getAudioFormat(audioFile.name);

    const { data: job, error: jobError } = await supabase
      .from('transcription_jobs')
      .insert({
        voice_memo_id: voiceMemoId,
        user_id: userId,
        status: 'pending',
        audio_duration: duration,
        audio_format: audioFormat,
        provider: 'openai',
        model: 'whisper-1',
      })
      .select('id')
      .single();

    if (jobError || !job) {
      return jsonDetailedError('작업 생성 실패', 'create_job', jobError, 500);
    }

    const storagePath = `voice-memos/${userId}/${job.id}.${audioFormat}`;

    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(storagePath, audioBuffer, {
        contentType: audioFile.type || 'audio/m4a',
        upsert: true,
      });

    if (uploadError) {
      await supabase.from('transcription_jobs').update({
        status: 'failed',
        error_message: `Storage upload failed: ${uploadError.message}`,
        retry_count: 1,
      }).eq('id', job.id);

      return jsonDetailedError('오디오 업로드 실패', 'upload_audio', uploadError, 500);
    }

    await supabase.from('transcription_jobs').update({
      status: 'processing',
      audio_url: storagePath,
    }).eq('id', job.id);

    await supabase.from('voice_memo_cache').update({
      transcription_job_id: job.id,
      updated_at: new Date().toISOString(),
    }).eq('memo_id', voiceMemoId);

    return new Response(
      JSON.stringify({
        accepted: true,
        reused: false,
        jobId: job.id,
        status: 'processing',
        storagePath,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 202,
      }
    );
  } catch (error) {
    console.error('Transcription enqueue error:', error);
    return new Response(
      JSON.stringify({
        error: '서버 오류가 발생했습니다.',
        stage: 'unhandled',
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function jsonError(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    }
  );
}

function jsonDetailedError(message: string, stage: string, err: unknown, status: number) {
  return new Response(
    JSON.stringify({
      error: message,
      stage,
      details: {
        message: err instanceof Error ? err.message : String(err),
        code: (err as any)?.code ?? null,
        details: (err as any)?.details ?? null,
        hint: (err as any)?.hint ?? null,
      },
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    }
  );
}

function getAudioFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext || 'm4a';
}

function extractUserIdFromJwt(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
