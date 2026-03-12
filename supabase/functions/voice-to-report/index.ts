/**
 * Voice-to-Report Edge Function
 *
 * Core AI pipeline that transforms a pro's voice memo into a structured coaching report.
 *
 * Pipeline stages:
 * 1. Receive audio URL + memo ID
 * 2. Transcribe via OpenAI Whisper
 * 3. Fetch pro's glossary terms for normalization
 * 4. Structure transcript via LLM (GPT-4o / Claude)
 * 5. Generate report draft with error pattern tagging
 * 6. Update DB records and notify via Realtime
 *
 * @edge-function voice-to-report
 * @feature F-001
 * @dependencies OpenAI API, Supabase client
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Types ───────────────────────────────────────────────────────

interface VoiceToReportRequest {
  memo_id: string;
  pro_id: string;
}

interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

interface StructuredReport {
  title: string;
  sections: {
    key: string;
    title: string;
    content: string;
    bullets?: string[];
    error_pattern_codes: string[];
    priority: 'high' | 'medium' | 'low';
  }[];
  error_tags: string[];
  homework: string | null;
  summary: string;
}

// ─── Constants ───────────────────────────────────────────────────

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const CHAT_API_URL = 'https://api.openai.com/v1/chat/completions';

const STRUCTURING_SYSTEM_PROMPT = `당신은 골프 코칭 리포트를 작성하는 AI 어시스턴트입니다.

프로 코치의 음성 메모 전사본을 분석하여 구조화된 레슨 리포트를 생성합니다.

## 규칙
1. 프로의 원래 의도와 톤을 최대한 보존합니다.
2. 골프 용어를 표준화합니다 (제공된 용어사전 참조).
3. 에러 패턴 코드(EP-001 ~ EP-022)를 식별하여 태깅합니다.
4. 리포트 구조: 제목, 섹션별 포인트, 숙제, 요약
5. 섹션 우선순위: high(핵심 교정), medium(보조 포인트), low(참고사항)

## 에러 패턴 포지션 맵
P1(어드레스): EP-001~003
P2(테이크어웨이): EP-004~006
P3(백스윙 탑): EP-007~010
P4(다운스윙): EP-011~013, EP-021~022
P5(임팩트): EP-014~015
P6(팔로스루): EP-016~017
P7(익스텐션): EP-018
P8(피니시): EP-019~020

## 출력 형식 (JSON)
{
  "title": "레슨 제목",
  "sections": [
    {
      "key": "summary|error_analysis|drill_recommendation|progress|mental_note",
      "title": "섹션 제목",
      "content": "내용 (마크다운)",
      "bullets": ["포인트1", "포인트2"],
      "error_pattern_codes": ["EP-XXX"],
      "priority": "high|medium|low"
    }
  ],
  "error_tags": ["EP-XXX", ...],
  "homework": "숙제 내용 또는 null",
  "summary": "1-2문장 요약"
}`;

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

/**
 * Updates memo status in DB with structured logging.
 */
async function updateMemoStatus(
  supabase: ReturnType<typeof createClient>,
  memoId: string,
  status: string,
  extraFields?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('voice_memos')
    .update({ status, ...extraFields })
    .eq('id', memoId);

  if (error) {
    console.error(`[voice-to-report] Failed to update memo ${memoId} to ${status}:`, error.message);
    throw error;
  }
  console.info(`[voice-to-report] Memo ${memoId} → ${status}`);
}

/**
 * Broadcast progress update via Realtime for UI feedback.
 */
async function broadcastProgress(
  supabase: ReturnType<typeof createClient>,
  memoId: string,
  stage: string,
  progress: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const channel = supabase.channel('report-updates');
    await channel.send({
      type: 'broadcast',
      event: 'processing_progress',
      payload: {
        memo_id: memoId,
        stage,
        progress, // 0-100
        ...metadata,
      },
    });
    console.info(`[voice-to-report] Progress broadcast: ${stage} (${progress}%)`);
  } catch (error) {
    console.warn(`[voice-to-report] Failed to broadcast progress:`, error);
    // Don't throw - progress updates are best-effort
  }
}

/**
 * Stage 1: Transcribe audio via Whisper API with retry logic and timeout.
 * Timeout: 120 seconds (long audio can take time with Whisper)
 */
async function transcribeAudio(
  audioUrl: string,
  maxRetries: number = 2
): Promise<TranscriptionResult> {
  console.info('[voice-to-report] Stage 1: Transcribing audio...');

  const TRANSCRIPTION_TIMEOUT_MS = 120000; // 120 seconds
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Fetch audio file with timeout
      const audioFetchController = new AbortController();
      const audioFetchTimeout = setTimeout(() => audioFetchController.abort(), 30000);

      try {
        const audioResponse = await fetch(audioUrl, {
          signal: audioFetchController.signal,
        });

        if (!audioResponse.ok) {
          throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
        }

        const audioBlob = await audioResponse.blob();
        clearTimeout(audioFetchTimeout);

        const formData = new FormData();
        formData.append('file', audioBlob, 'memo.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'ko');
        formData.append('response_format', 'verbose_json');

        // Whisper API call with timeout
        const transcribeController = new AbortController();
        const transcribeTimeout = setTimeout(() => transcribeController.abort(), TRANSCRIPTION_TIMEOUT_MS);

        try {
          const response = await fetch(WHISPER_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${getOpenAIKey()}`,
            },
            body: formData,
            signal: transcribeController.signal,
          });

          clearTimeout(transcribeTimeout);

          if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Whisper API error: ${response.status} - ${errorBody}`);
          }

          const result = await response.json();
          console.info(
            `[voice-to-report] Transcription complete: ${result.text.length} chars, ${result.duration}s`
          );

          return {
            text: result.text,
            language: result.language,
            duration: result.duration,
          };
        } finally {
          clearTimeout(transcribeTimeout);
        }
      } finally {
        clearTimeout(audioFetchTimeout);
      }
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s backoff
        console.warn(
          `[voice-to-report] Transcription failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
          `retrying in ${delayMs}ms: ${lastError.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(`[voice-to-report] Transcription failed after ${maxRetries + 1} attempts`);
  throw lastError || new Error('Transcription failed');
}

/**
 * Stage 2: Fetch pro's glossary terms for term normalization.
 */
async function fetchGlossary(
  supabase: ReturnType<typeof createClient>,
  proId: string
): Promise<string> {
  const { data: terms, error } = await supabase
    .from('glossary_terms')
    .select('original_term, standardized_term')
    .eq('pro_id', proId);

  if (error) {
    console.warn('[voice-to-report] Failed to fetch glossary, proceeding without:', error.message);
    return '';
  }

  if (!terms || terms.length === 0) return '';

  const glossaryText = terms
    .map((t: { original_term: string; standardized_term: string }) =>
      `"${t.original_term}" → "${t.standardized_term}"`
    )
    .join('\n');

  console.info(`[voice-to-report] Loaded ${terms.length} glossary terms`);
  return glossaryText;
}

/**
 * Stage 3: Structure transcript into report via LLM.
 */
async function structureTranscript(
  transcript: string,
  glossary: string,
  memberContext: string | null
): Promise<StructuredReport> {
  console.info('[voice-to-report] Stage 3: Structuring transcript via LLM...');

  const userPrompt = [
    '## 전사본',
    transcript,
    glossary ? `\n## 용어사전\n${glossary}` : '',
    memberContext ? `\n## 회원 컨텍스트\n${memberContext}` : '',
    '\n위 전사본을 분석하여 구조화된 레슨 리포트를 JSON으로 생성하세요.',
  ].filter(Boolean).join('\n');

  const response = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getOpenAIKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: STRUCTURING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ChatGPT API error: ${response.status} - ${errorBody}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('LLM returned empty response');
  }

  const parsed: StructuredReport = JSON.parse(content);
  console.info(`[voice-to-report] Structured: ${parsed.sections.length} sections, ${parsed.error_tags.length} error tags`);

  return parsed;
}

// ─── Main Handler ────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS headers
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://hellonext.app';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate request
    const { memo_id, pro_id } = (await req.json()) as VoiceToReportRequest;

    if (!memo_id || !pro_id) {
      return new Response(
        JSON.stringify({ error: 'memo_id and pro_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`[voice-to-report] Processing memo ${memo_id} for pro ${pro_id}`);
    const supabase = createSupabaseAdmin();

    // Fetch memo
    const { data: memo, error: memoError } = await supabase
      .from('voice_memos')
      .select('*')
      .eq('id', memo_id)
      .single();

    if (memoError || !memo) {
      return new Response(
        JSON.stringify({ error: 'Memo not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Stage 1: Transcribe ───
    await updateMemoStatus(supabase, memo_id, 'transcribing');
    await broadcastProgress(supabase, memo_id, 'transcription', 5, { status: 'starting' });

    const transcription = await transcribeAudio(memo.audio_url);
    await broadcastProgress(supabase, memo_id, 'transcription', 25, {
      status: 'completed',
      duration: transcription.duration,
      transcript_length: transcription.text.length,
    });

    await updateMemoStatus(supabase, memo_id, 'structuring', {
      transcript: transcription.text,
    });

    // ─── Stage 2: Fetch glossary ───
    const glossary = await fetchGlossary(supabase, pro_id);
    await broadcastProgress(supabase, memo_id, 'glossary_fetch', 35, {
      status: 'completed',
      glossary_terms: glossary.length > 0 ? glossary.split('\n').length : 0,
    });

    // ─── Stage 3: Structure via LLM ───
    await broadcastProgress(supabase, memo_id, 'llm_structuring', 45, { status: 'in_progress' });

    const structured = await structureTranscript(
      transcription.text,
      glossary,
      null // member context can be added later
    );

    await broadcastProgress(supabase, memo_id, 'llm_structuring', 65, {
      status: 'completed',
      sections: structured.sections.length,
      error_tags: structured.error_tags.length,
    });

    // ─── Stage 4: Save results ───
    await updateMemoStatus(supabase, memo_id, 'draft', {
      structured_json: structured,
    });

    await broadcastProgress(supabase, memo_id, 'report_creation', 75, { status: 'starting' });

    // Create report draft if memo has a member assigned (non-orphan memo)
    let reportId: string | null = null;

    if (memo.member_id) {
      // Find the active link between pro and member
      const { data: link } = await supabase
        .from('pro_member_links')
        .select('id')
        .eq('pro_id', pro_id)
        .eq('member_id', memo.member_id)
        .eq('status', 'active')
        .single();

      if (link) {
        const { data: report, error: reportError } = await supabase
          .from('reports')
          .insert({
            voice_memo_id: memo_id,
            pro_id,
            member_id: memo.member_id,
            link_id: link.id,
            title: structured.title,
            content: {
              sections: structured.sections,
              summary: structured.summary,
              overallTone: 'constructive',
            },
            error_tags: structured.error_tags,
            homework: structured.homework,
            status: 'draft',
          })
          .select('id')
          .single();

        if (reportError) {
          console.error('[voice-to-report] Failed to create report:', reportError.message);
        } else {
          reportId = report?.id ?? null;
          console.info(`[voice-to-report] Report draft created: ${reportId}`);
        }
      }
    } else {
      console.info(
        `[voice-to-report] Memo ${memo_id} is orphan (no member assigned), skipping report creation`
      );
    }

    await broadcastProgress(supabase, memo_id, 'report_creation', 90, {
      status: 'completed',
      report_id: reportId,
    });

    // ─── Broadcast via Realtime ───
    const channel = supabase.channel('report-updates');
    await channel.send({
      type: 'broadcast',
      event: 'report_ready',
      payload: {
        memo_id,
        report_id: reportId,
        pro_id,
        status: 'draft',
      },
    });

    await broadcastProgress(supabase, memo_id, 'pipeline', 100, { status: 'complete' });

    console.info(`[voice-to-report] Pipeline complete for memo ${memo_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        memo_id,
        report_id: reportId,
        transcript_length: transcription.text.length,
        sections_count: structured.sections.length,
        error_tags: structured.error_tags,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[voice-to-report] Pipeline error:', error);

    // Attempt to broadcast error status
    const supabase = createSupabaseAdmin();
    try {
      const channel = supabase.channel('report-updates');
      await channel.send({
        type: 'broadcast',
        event: 'processing_error',
        payload: {
          memo_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    } catch (broadcastError) {
      console.warn('[voice-to-report] Failed to broadcast error:', broadcastError);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeoutError = errorMessage.includes('timeout');

    return new Response(
      JSON.stringify({
        error: 'Pipeline processing failed',
        error_code: isTimeoutError ? 'PROCESSING_TIMEOUT' : 'INTERNAL_ERROR',
        message: errorMessage,
      }),
      {
        status: isTimeoutError ? 408 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
