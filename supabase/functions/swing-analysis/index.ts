/**
 * Swing Analysis — Supabase Edge Function
 *
 * Processes swing video pose data and generates AI observations.
 *
 * Pipeline:
 * 1. Receive pose_data (keypoints per frame) + feel_check + member_id
 * 2. Fetch AI scope settings (F-013) for the pro-member pair
 * 3. Compute swing metrics (joint angles, tempo, position markers)
 * 4. Generate AI observation via Groq (llama-3.3-70b-versatile) in "curious observer" tone
 * 5. Store ai_observation record + update swing_video status
 * 6. Broadcast result via Realtime
 *
 * @function swing-analysis
 * @feature F-005, F-013
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://hellonext.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SwingAnalysisRequest {
  video_id: string;
  member_id: string;
  pose_data: PoseFrame[];
  feel_check_id: string;
}

interface PoseFrame {
  frame_index: number;
  timestamp_ms: number;
  keypoints: { name: string; x: number; y: number; score: number }[];
}

interface AIScopeSettings {
  hidden_patterns: string[];
  tone_level: 'observe_only' | 'gentle_suggest' | 'specific_guide';
}

const GROQ_CHAT_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

function getGroqKey(): string {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('Missing GROQ_API_KEY');
  return key;
}

async function callGroqChat(
  messages: { role: string; content: string }[],
): Promise<string> {
  const response = await fetch(GROQ_CHAT_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGroqKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq Chat API error: ${response.status} - ${errorBody}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty response');
  return content;
}

const OBSERVATION_SYSTEM_PROMPT = `당신은 골프 스윙을 "관찰"하는 AI 어시스턴트입니다.

## 핵심 원칙
1. 교정이 아닌 관찰: "~가 보입니다" "~에 변화가 있는 것 같습니다"
2. 팩트 호기심 톤: "프로님에게 물어보세요" 등 질문 유도
3. 프로 통제권 존중: hidden_patterns에 해당하는 항목은 절대 언급하지 않음
4. Feel Check 연결: 회원의 느낌과 실제 데이터의 차이를 부드럽게 관찰

## 톤 레벨
- observe_only: 변화 관찰만. 제안 없음.
- gentle_suggest: "~해보면 어떨까요?" 수준의 부드러운 제안
- specific_guide: 구체적 드릴 추천 포함

## 출력 형식 (JSON)
{
  "observations": [
    {
      "position": "P1~P8",
      "observation": "관찰 내용",
      "error_pattern_code": "EP-XXX 또는 null",
      "coach_consultation_flag": true/false,
      "visible": true/false
    }
  ],
  "feel_accuracy_note": "Feel Check과 실제 데이터 비교 관찰",
  "summary": "1-2문장 전체 요약"
}`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: SwingAnalysisRequest = await req.json();
    const { video_id, member_id, pose_data, feel_check_id } = payload;

    // Validate required fields
    if (!video_id || typeof video_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid video_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!member_id || typeof member_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid member_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(pose_data) || pose_data.length === 0) {
      return new Response(
        JSON.stringify({ error: 'pose_data must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!feel_check_id || typeof feel_check_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid feel_check_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Get feel check data
    const { data: feelCheck } = await supabase
      .from('feel_checks')
      .select('feeling, notes')
      .eq('id', feel_check_id)
      .single();

    // 2. Get AI scope settings from linked pro(s)
    const { data: proLinks } = await supabase
      .from('pro_member_links')
      .select('pro_id')
      .eq('member_id', member_id)
      .eq('is_active', true);

    let scopeSettings: AIScopeSettings = {
      hidden_patterns: [],
      tone_level: 'observe_only',
    };

    if (proLinks && proLinks.length > 0) {
      const { data: scopeData } = await supabase
        .from('ai_scope_settings')
        .select('hidden_patterns, tone_level')
        .eq('member_id', member_id)
        .eq('pro_id', proLinks[0]!.pro_id)
        .maybeSingle();

      if (scopeData) {
        scopeSettings = scopeData as AIScopeSettings;
      }
    }

    // 3. Compute swing metrics from pose data
    const metrics = computeSwingMetrics(pose_data);

    // 4. Generate AI observation via Groq
    const userPrompt = buildAnalysisPrompt(metrics, feelCheck, scopeSettings);
    const messages = [
      { role: 'system', content: OBSERVATION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const llmContent = await callGroqChat(messages);

    let observation;
    try {
      observation = JSON.parse(llmContent);
    } catch (parseErr) {
      console.error('Failed to parse LLM response:', llmContent);
      throw new Error('Invalid JSON in LLM response');
    }

    // 5. Apply visibility filter (hidden patterns → visible: false)
    if (observation.observations) {
      for (const obs of observation.observations) {
        if (
          obs.error_pattern_code &&
          scopeSettings.hidden_patterns.includes(obs.error_pattern_code)
        ) {
          obs.visible = false;
        }
      }
    }

    // 6. Store computed metrics in pose_data
    const { error: poseUpsertError } = await supabase
      .from('pose_data')
      .upsert({
        video_id,
        keypoints: pose_data.map((f) => ({ frame_index: f.frame_index, keypoints: f.keypoints })),
        angles: metrics.phase_angles,
        metrics: {
          total_frames: metrics.total_frames,
          phases: metrics.phases,
          tempo_ratio: metrics.tempo_ratio,
          backswing_duration_ms: metrics.backswing_duration_ms,
          downswing_duration_ms: metrics.downswing_duration_ms,
        },
      }, { onConflict: 'video_id' });

    if (poseUpsertError) {
      console.error('Failed to save pose_data:', JSON.stringify(poseUpsertError));
    }

    // 7. Separate visible vs hidden observations
    const visibleObs = (observation.observations ?? []).filter(
      (obs: { visible?: boolean }) => obs.visible !== false,
    );
    const hiddenObs = (observation.observations ?? []).filter(
      (obs: { visible?: boolean }) => obs.visible === false,
    );
    const hasConsultationFlag = (observation.observations ?? []).some(
      (obs: { coach_consultation_flag?: boolean }) => obs.coach_consultation_flag === true,
    );

    // 8. Store AI observation
    const observationText = [
      observation.summary ?? '',
      observation.feel_accuracy_note ? `\n[Feel Check] ${observation.feel_accuracy_note}` : '',
    ].join('');

    const toneMap: Record<string, string> = {
      observe_only: 'observe',
      gentle_suggest: 'suggest',
      specific_guide: 'guide',
    };

    const { data: savedObservation, error: insertError } = await supabase
      .from('ai_observations')
      .insert({
        video_id,
        member_id,
        observation_text: observationText,
        tone: toneMap[scopeSettings.tone_level] ?? 'observe',
        coach_consultation_flag: hasConsultationFlag,
        visible_tags: visibleObs,
        hidden_tags: hiddenObs,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to save observation:', JSON.stringify(insertError));
      throw new Error('Failed to save observation');
    }

    // 9. Broadcast via Realtime
    await supabase.channel(`member-${member_id}`).send({
      type: 'broadcast',
      event: 'swing_analyzed',
      payload: {
        video_id,
        observation_id: savedObservation.id,
        summary: observation.summary,
      },
    });

    console.log('Swing analysis complete', { video_id, observation_id: savedObservation.id });

    return new Response(
      JSON.stringify({ success: true, observation_id: savedObservation.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error
      ? err.message
      : JSON.stringify(err);
    console.error('swing-analysis error:', errorMessage);
    return new Response(
      JSON.stringify({
        error: {
          code: 'SWING_ANALYSIS_ERROR',
          message: errorMessage,
        },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Compute swing metrics from MediaPipe 2D pose keypoints.
 * Identifies P1-P8 positions and extracts key angles.
 *
 * Swing phase detection:
 * - P1: Address (start)
 * - P2: Takeaway (initial movement)
 * - P3: Top of backswing (peak height)
 * - P4: Early downswing
 * - P5: Impact (lowest point before follow-through)
 * - P6: Follow-through (club extends past impact)
 * - P7: Extension (full extension)
 * - P8: Finish (final position)
 */
function computeSwingMetrics(frames: PoseFrame[]) {
  const totalFrames = frames.length;

  if (totalFrames === 0) {
    throw new Error('No frames provided for swing analysis');
  }

  // Identify swing phase boundaries (based on wrist trajectory)
  const wristPositions = frames.map((f) => {
    const leftWrist = f.keypoints.find((k) => k.name === 'left_wrist');
    const rightWrist = f.keypoints.find((k) => k.name === 'right_wrist');
    return {
      frame: f.frame_index,
      timestamp: f.timestamp_ms,
      leadWristY: leftWrist?.y ?? 0,
      trailWristY: rightWrist?.y ?? 0,
    };
  });

  // Find highest point (top of backswing → P3)
  let topFrameIdx = Math.round(totalFrames * 0.2); // Fallback
  let minWristY = Infinity;
  for (const wp of wristPositions) {
    if (wp.leadWristY < minWristY && wp.leadWristY > 0) {
      minWristY = wp.leadWristY;
      topFrameIdx = wp.frame;
    }
  }

  // Clamp phase indices to valid ranges
  const clamp = (val: number, max: number) => Math.max(0, Math.min(val, max - 1));

  // Estimate swing phases based on frame indices
  const phases = {
    P1_address: 0,
    P2_takeaway: clamp(Math.round(topFrameIdx * 0.4), totalFrames),
    P3_top: clamp(topFrameIdx, totalFrames),
    P4_downswing: clamp(Math.round(topFrameIdx + (totalFrames - topFrameIdx) * 0.2), totalFrames),
    P5_impact: clamp(Math.round(topFrameIdx + (totalFrames - topFrameIdx) * 0.5), totalFrames),
    P6_followthrough: clamp(Math.round(topFrameIdx + (totalFrames - topFrameIdx) * 0.65), totalFrames),
    P7_extension: clamp(Math.round(topFrameIdx + (totalFrames - topFrameIdx) * 0.8), totalFrames),
    P8_finish: totalFrames - 1,
  };

  // Extract key joint angles at each phase
  const phaseAngles: Record<string, Record<string, number>> = {};

  for (const [phaseName, frameIdx] of Object.entries(phases)) {
    const frame = frames[frameIdx];
    if (!frame) continue;

    const kp = Object.fromEntries(frame.keypoints.map((k) => [k.name, k]));

    phaseAngles[phaseName] = {
      left_elbow: computeAngle(kp['left_shoulder'], kp['left_elbow'], kp['left_wrist']),
      right_elbow: computeAngle(kp['right_shoulder'], kp['right_elbow'], kp['right_wrist']),
      left_knee: computeAngle(kp['left_hip'], kp['left_knee'], kp['left_ankle']),
      spine_tilt: computeAngle(kp['left_hip'], kp['left_shoulder'], kp['nose']),
    };
  }

  // Tempo calculation (ratio of backswing to downswing duration)
  const backswingDuration = frames[phases.P3_top]?.timestamp_ms ?? 0;
  const downswingDuration =
    (frames[phases.P5_impact]?.timestamp_ms ?? 0) - backswingDuration;

  let tempoRatio: number | string = 'N/A';
  if (downswingDuration > 0) {
    const ratio = backswingDuration / downswingDuration;
    tempoRatio = parseFloat(ratio.toFixed(2));
  }

  return {
    total_frames: totalFrames,
    phases,
    phase_angles: phaseAngles,
    tempo_ratio: tempoRatio,
    backswing_duration_ms: backswingDuration,
    downswing_duration_ms: downswingDuration,
  };
}

function computeAngle(
  a?: { x: number; y: number },
  b?: { x: number; y: number },
  c?: { x: number; y: number }
): number {
  if (!a || !b || !c) return 0;
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let degrees = Math.abs((radians * 180) / Math.PI);
  if (degrees > 180) degrees = 360 - degrees;
  return Math.round(degrees);
}

function buildAnalysisPrompt(
  metrics: ReturnType<typeof computeSwingMetrics>,
  feelCheck: { feeling: string; notes: string | null } | null,
  scope: AIScopeSettings
): string {
  const parts: string[] = [];

  parts.push(`## 스윙 메트릭스`);
  parts.push(`- 총 프레임: ${metrics.total_frames}`);
  parts.push(`- 템포 비율 (백스윙:다운스윙): ${metrics.tempo_ratio}`);
  parts.push(`- 백스윙 ${metrics.backswing_duration_ms}ms / 다운스윙 ${metrics.downswing_duration_ms}ms`);

  parts.push(`\n## 포지션별 관절 각도`);
  for (const [phase, angles] of Object.entries(metrics.phase_angles)) {
    parts.push(`### ${phase}`);
    for (const [joint, angle] of Object.entries(angles)) {
      parts.push(`  - ${joint}: ${angle}°`);
    }
  }

  if (feelCheck) {
    parts.push(`\n## Feel Check`);
    parts.push(`- 느낌: ${feelCheck.feeling}`);
    if (feelCheck.notes) parts.push(`- 메모: ${feelCheck.notes}`);
  }

  parts.push(`\n## AI 범위 설정`);
  parts.push(`- 톤 레벨: ${scope.tone_level}`);
  if (scope.hidden_patterns.length > 0) {
    parts.push(`- 비공개 패턴 (절대 언급 금지): ${scope.hidden_patterns.join(', ')}`);
  }

  return parts.join('\n');
}
