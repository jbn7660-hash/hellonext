/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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

interface VoiceMemoRow {
  id: string;
  pro_id: string;
  member_id: string | null;
  audio_url: string;
  transcript: string | null;
  structured_json: unknown;
  status: string;
}

interface CacheRow {
  memo_id: string;
  coach_profile_id: string;
  target_id: string | null;
  state: 'UNBOUND' | 'PREPROCESSED' | 'LINKED' | 'FINALIZED';
  transcription_job_id: string | null;
  audio_blob_ref: string;
  transcript: string | null;
}

const CHAT_API_URL = 'https://api.openai.com/v1/chat/completions';
const GROQ_CHAT_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

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

function getOpenAIKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('Missing OPENAI_API_KEY');
  return key;
}

function getGroqKey(): string | null {
  return Deno.env.get('GROQ_API_KEY') ?? null;
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

async function fetchMemo(supabase: SupabaseAdmin, memoId: string): Promise<VoiceMemoRow | null> {
  const { data, error } = await supabase
    .from('voice_memos')
    .select('id, pro_id, member_id, audio_url, transcript, structured_json, status')
    .eq('id', memoId)
    .maybeSingle();

  if (error) throw error;
  return (data as VoiceMemoRow | null) ?? null;
}

async function fetchCache(supabase: SupabaseAdmin, memoId: string): Promise<CacheRow | null> {
  const { data, error } = await supabase
    .from('voice_memo_cache')
    .select('memo_id, coach_profile_id, target_id, state, transcription_job_id, audio_blob_ref, transcript')
    .eq('memo_id', memoId)
    .maybeSingle();

  if (error) throw error;
  return (data as CacheRow | null) ?? null;
}

async function fetchGlossary(supabase: SupabaseAdmin, proId: string): Promise<string> {
  const { data: terms, error } = await supabase
    .from('glossary_terms')
    .select('original_term, standardized_term')
    .eq('pro_id', proId);

  if (error || !terms || terms.length === 0) return '';

  return terms
    .map((t: { original_term: string; standardized_term: string }) =>
      `"${t.original_term}" → "${t.standardized_term}"`
    )
    .join('\n');
}

async function fetchMemberContext(supabase: SupabaseAdmin, proId: string, memberId: string | null): Promise<string | null> {
  if (!memberId) return null;

  const { data, error } = await supabase
    .from('ai_scope_settings')
    .select('ai_tone, visible_error_patterns')
    .eq('pro_id', proId)
    .eq('member_id', memberId)
    .maybeSingle();

  if (error || !data) return null;

  const tone = typeof data.ai_tone === 'string' ? data.ai_tone : 'observe';
  const visiblePatterns = Array.isArray(data.visible_error_patterns) ? data.visible_error_patterns : [];

  return [
    `ai_tone: ${tone}`,
    visiblePatterns.length ? `visible_error_patterns: ${visiblePatterns.join(', ')}` : null,
  ].filter(Boolean).join('\n');
}

async function callChatAPI(
  url: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  useJsonMode: boolean,
): Promise<{ content: string; provider: 'openai' | 'groq' }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 2000,
  };
  if (useJsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(`Chat API error: ${response.status} - ${errorBody}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty response');
  return { content, provider: url.includes('groq') ? 'groq' : 'openai' };
}

async function structureTranscript(
  transcript: string,
  glossary: string,
  memberContext: string | null,
): Promise<StructuredReport> {
  const userPrompt = [
    '## 전사본',
    transcript,
    glossary ? `\n## 용어사전\n${glossary}` : '',
    memberContext ? `\n## 회원 컨텍스트\n${memberContext}` : '',
    '\n위 전사본을 분석하여 구조화된 레슨 리포트를 JSON으로 생성하세요.',
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system', content: STRUCTURING_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  // Try OpenAI first
  try {
    const { content } = await callChatAPI(CHAT_API_URL, getOpenAIKey(), 'gpt-4o', messages, true);
    return JSON.parse(content) as StructuredReport;
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    const isQuotaOrAuth = status === 429 || status === 402 || status === 401;
    if (!isQuotaOrAuth) throw err;
    console.warn(`OpenAI ChatGPT failed (${status}), attempting Groq fallback...`);
  }

  // Fallback to Groq
  const groqKey = getGroqKey();
  if (!groqKey) {
    throw new Error('OpenAI quota exceeded and no GROQ_API_KEY configured for fallback');
  }

  const { content } = await callChatAPI(
    GROQ_CHAT_API_URL,
    groqKey,
    'llama-3.3-70b-versatile',
    messages,
    true,
  );
  return JSON.parse(content) as StructuredReport;
}

async function createReportIfPossible(
  supabase: SupabaseAdmin,
  memo: VoiceMemoRow,
  structured: StructuredReport,
): Promise<string | null> {
  if (!memo.member_id) return null;

  const { data: link, error: linkError } = await supabase
    .from('pro_member_links')
    .select('id')
    .eq('pro_id', memo.pro_id)
    .eq('member_id', memo.member_id)
    .eq('status', 'active')
    .maybeSingle();

  if (linkError || !link) return null;

  const { data: existingReport } = await supabase
    .from('reports')
    .select('id')
    .eq('voice_memo_id', memo.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingReport?.id) {
    return existingReport.id as string;
  }

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .insert({
      voice_memo_id: memo.id,
      pro_id: memo.pro_id,
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

  if (reportError || !report) {
    throw reportError ?? new Error('Failed to create report');
  }

  return report.id as string;
}

async function broadcast(supabase: SupabaseAdmin, event: string, payload: Record<string, unknown>) {
  try {
    const channel = supabase.channel('report-updates');
    await channel.send({ type: 'broadcast', event, payload });
  } catch (_err) {
    // best effort only
  }
}

async function processMemo(supabase: SupabaseAdmin, memoId: string) {
  const memo = await fetchMemo(supabase, memoId);
  if (!memo) throw new Error(`Memo not found: ${memoId}`);

  const cache = await fetchCache(supabase, memoId);
  const transcript = cache?.transcript ?? memo.transcript;
  if (!transcript) throw new Error('Transcript not found; transcription stage not complete');

  if (memo.structured_json) {
    return {
      memoId,
      skipped: true,
      reason: 'already_structured',
    };
  }

  if (cache && !['PREPROCESSED', 'LINKED'].includes(cache.state)) {
    throw new Error(`Memo cache is not ready for report generation: ${cache.state}`);
  }

  await supabase
    .from('voice_memos')
    .update({ status: 'structuring' })
    .eq('id', memoId);

  await broadcast(supabase, 'processing_progress', {
    memo_id: memoId,
    stage: 'llm_structuring',
    progress: 45,
    status: 'in_progress',
  });

  const glossary = await fetchGlossary(supabase, memo.pro_id);
  const memberContext = await fetchMemberContext(supabase, memo.pro_id, memo.member_id);
  const structured = await structureTranscript(transcript, glossary, memberContext);

  await supabase
    .from('voice_memos')
    .update({
      status: 'draft',
      transcript,
      structured_json: structured,
    })
    .eq('id', memoId);

  let reportId: string | null = null;
  if (memo.member_id) {
    reportId = await createReportIfPossible(supabase, memo, structured);
  }

  if (cache?.state === 'LINKED') {
    await supabase
      .from('voice_memo_cache')
      .update({
        state: 'FINALIZED',
        transcript,
        target_id: cache.target_id,
      })
      .eq('memo_id', memoId);
  } else if (cache?.state === 'PREPROCESSED') {
    await supabase
      .from('voice_memo_cache')
      .update({ transcript })
      .eq('memo_id', memoId);
  }

  await broadcast(supabase, 'report_ready', {
    memo_id: memoId,
    report_id: reportId,
    pro_id: memo.pro_id,
    status: 'draft',
  });

  await broadcast(supabase, 'processing_progress', {
    memo_id: memoId,
    stage: 'pipeline',
    progress: 100,
    status: 'complete',
  });

  return {
    memoId,
    skipped: false,
    reportId,
    sectionsCount: structured.sections.length,
    errorTags: structured.error_tags.length,
    finalized: cache?.state === 'LINKED',
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });

  try {
    const supabase = createSupabaseAdmin();
    const authHeader = req.headers.get('Authorization');
    const runnerSecret = Deno.env.get('VOICE_REPORT_WORKER_SECRET');
    const allowUnauthenticated = parseBoolean(Deno.env.get('ALLOW_UNAUTHENTICATED_WORKER_INVOKE'), false);

    if (!allowUnauthenticated) {
      if (!runnerSecret) throw new Error('Missing VOICE_REPORT_WORKER_SECRET');
      if (authHeader !== `Bearer ${runnerSecret}`) {
        return json({ error: 'Unauthorized worker invocation' }, 401);
      }
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const memoId = typeof body?.memoId === 'string' ? body.memoId : null;

    if (!memoId) {
      return json({ ok: false, error: 'memoId is required for voice-report-worker' }, 400);
    }

    const result = await processMemo(supabase, memoId);
    return json({ ok: true, processed: true, result });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
