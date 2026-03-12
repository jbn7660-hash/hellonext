/**
 * Edge Function: voice-transcribe
 *
 * Receives audio file from mobile app, sends to OpenAI Whisper API,
 * returns transcription. Updates transcription_jobs table.
 *
 * Patent 4 FSM: Triggers UNBOUND → PREPROCESSED transition
 * on successful transcription.
 *
 * POST /functions/v1/voice-transcribe
 * Body: FormData { audio: File, voice_memo_id: string, duration: string }
 * Returns: { transcript, confidence, segments, language }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // ── Auth ──────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonError('인증이 필요합니다.', 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonError('인증 실패', 401);
    }

    // ── Parse Form Data ──────────────────────
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const voiceMemoId = formData.get('voice_memo_id') as string;
    const duration = parseInt(formData.get('duration') as string || '0', 10);

    if (!audioFile) {
      return jsonError('오디오 파일이 필요합니다.', 400);
    }

    // ── Create Transcription Job ──────────────
    const { data: job, error: jobError } = await supabase
      .from('transcription_jobs')
      .insert({
        voice_memo_id: voiceMemoId,
        user_id: user.id,
        status: 'processing',
        audio_duration: duration,
        audio_format: getAudioFormat(audioFile.name),
      })
      .select('id')
      .single();

    if (jobError) {
      console.error('Job creation failed:', jobError);
      return jsonError('작업 생성 실패', 500);
    }

    // ── Upload to Supabase Storage ────────────
    const audioBuffer = await audioFile.arrayBuffer();
    const storagePath = `voice-memos/${user.id}/${job.id}.${getAudioFormat(audioFile.name)}`;

    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(storagePath, audioBuffer, {
        contentType: audioFile.type || 'audio/m4a',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      // Continue without storage - transcribe from memory
    }

    // ── Call OpenAI Whisper API ────────────────
    const whisperFormData = new FormData();
    whisperFormData.append('file', new Blob([audioBuffer], { type: audioFile.type }), audioFile.name);
    whisperFormData.append('model', 'whisper-1');
    whisperFormData.append('language', 'ko');
    whisperFormData.append('response_format', 'verbose_json');
    whisperFormData.append('timestamp_granularities[]', 'segment');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: whisperFormData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('Whisper API error:', errorText);

      // Update job as failed
      await supabase.from('transcription_jobs').update({
        status: 'failed',
        error_message: `Whisper API error: ${whisperResponse.status}`,
        retry_count: 1,
      }).eq('id', job.id);

      return jsonError('음성 인식 실패', 502);
    }

    const whisperResult = await whisperResponse.json();
    const processingMs = Date.now() - startTime;

    // ── Parse Segments ────────────────────────
    const segments = (whisperResult.segments || []).map((seg: any) => ({
      text: seg.text?.trim() || '',
      start: Math.round((seg.start || 0) * 1000),
      end: Math.round((seg.end || 0) * 1000),
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : 0.8,
    }));

    // Calculate overall confidence
    const avgConfidence = segments.length > 0
      ? segments.reduce((sum: number, s: any) => sum + s.confidence, 0) / segments.length
      : 0.8;

    // ── Update Job as Completed ───────────────
    await supabase.from('transcription_jobs').update({
      status: 'completed',
      transcript: whisperResult.text,
      confidence: Math.round(avgConfidence * 10000) / 10000,
      language: whisperResult.language || 'ko',
      segments: segments,
      processing_ms: processingMs,
      completed_at: new Date().toISOString(),
      audio_url: storagePath,
    }).eq('id', job.id);

    // ── Update Voice Memo with Transcript ─────
    if (voiceMemoId) {
      await supabase.from('voice_memos').update({
        transcript: whisperResult.text,
        updated_at: new Date().toISOString(),
      }).eq('id', voiceMemoId);

      // ── Patent 4 FSM: Trigger PREPROCESSED ──
      // If voice_memo_cache exists in UNBOUND state,
      // transition to PREPROCESSED
      await supabase.from('voice_memo_cache').update({
        state: 'PREPROCESSED',
        updated_at: new Date().toISOString(),
      }).eq('voice_memo_id', voiceMemoId)
        .eq('state', 'UNBOUND');
    }

    // ── Return Result ─────────────────────────
    return new Response(
      JSON.stringify({
        text: whisperResult.text,
        confidence: avgConfidence,
        language: whisperResult.language || 'ko',
        segments,
        jobId: job.id,
        processingMs,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Transcription error:', error);
    return jsonError('서버 오류가 발생했습니다.', 500);
  }
});

// ── Helpers ──────────────────────────────────────
function jsonError(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
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
