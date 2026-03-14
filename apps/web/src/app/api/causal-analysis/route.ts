/**
 * Causal Analysis API Route
 *
 * POST /api/causal-analysis — Trigger causal analysis for a session
 * GET /api/causal-analysis — Retrieve existing analysis for a session
 *
 * Per Patent 1 Claim 1(e): Calls Edge Function to build DAG, compute IIS,
 * and create coaching decision with primary_fix (DC-4 scalar).
 *
 * @route /api/causal-analysis
 * @feature F-015
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Tables } from '@/lib/supabase/types';

interface CausalAnalysisRequest {
  session_id: string; // UUID format
  force_rerun?: boolean;
}

/**
 * POST /api/causal-analysis
 * Trigger causal analysis for a session via Edge Function.
 * Requires pro role authentication.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // Verify pro role
    const { data: proProfileRaw, error: profileError } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();
    const proProfile = proProfileRaw as Pick<Tables<'pro_profiles'>, 'id'> | null;

    if (profileError || !proProfile) {
      logger.warn('Pro profile not found for causal-analysis', { userId: user.id });
      return NextResponse.json({ error: '프로 프로필이 없습니다.' }, { status: 403 });
    }

    // Parse request body
    const body = (await request.json()) as CausalAnalysisRequest;
    const { session_id, force_rerun = false } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    logger.info('Invoking causal-analysis edge function', {
      userId: user.id,
      sessionId: session_id,
      forceRerun: force_rerun,
    });

    // Call Edge Function
    const { data: edgeFunctionResult, error: edgeFunctionError } =
      await supabase.functions.invoke('causal-analysis', {
        body: {
          operation: 'createDraft',
          session_id,
          force_rerun,
        },
      });

    if (edgeFunctionError) {
      logger.error('Edge function error', {
        userId: user.id,
        sessionId: session_id,
        error: edgeFunctionError,
      });

      // Map error codes to HTTP status
      if (edgeFunctionResult?.code === 'CA_SESSION_NOT_FOUND') {
        return NextResponse.json(
          { error: '분석할 세션을 찾을 수 없습니다.' },
          { status: 404 }
        );
      } else if (edgeFunctionResult?.code === 'CA_INSUFFICIENT_DATA') {
        return NextResponse.json(
          { error: '분석에 필요한 데이터가 부족합니다.' },
          { status: 422 }
        );
      } else if (edgeFunctionResult?.code === 'CA_DAG_CYCLE') {
        return NextResponse.json(
          { error: 'Causal graph에 순환이 감지되었습니다.' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: '인과 분석 실패' },
        { status: 500 }
      );
    }

    logger.info('Causal analysis completed', {
      userId: user.id,
      sessionId: session_id,
      decisionId: edgeFunctionResult?.result?.coaching_decision_id,
    });

    return NextResponse.json({
      success: true,
      data: edgeFunctionResult?.result,
      cached: edgeFunctionResult?.cached,
    });
  } catch (err) {
    logger.error('Causal analysis POST error', { error: err });
    return NextResponse.json({ error: '내부 서버 오류' }, { status: 500 });
  }
}

/**
 * GET /api/causal-analysis?session_id=<uuid>
 * Retrieve existing analysis for a session.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // Get session_id from query params
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id query parameter is required' },
        { status: 400 }
      );
    }

    logger.info('Fetching existing analysis', { userId: user.id, sessionId });

    // Fetch coaching decision for this session
    const { data: decisionRaw, error: decisionError } = await supabase
      .from('coaching_decisions')
      .select('id, primary_fix, auto_draft, coach_edited, data_quality_tier, created_at, updated_at')
      .eq('session_id', sessionId)
      .single();
    const decision = decisionRaw as Tables<'coaching_decisions'> | null;

    if (decisionError && decisionError.code !== 'PGRST116') {
      logger.error('Failed to fetch coaching decision', {
        userId: user.id,
        sessionId,
        error: decisionError.message,
      });
      return NextResponse.json({ error: '분석 정보를 가져올 수 없습니다.' }, { status: 500 });
    }

    if (!decision) {
      return NextResponse.json(
        { error: 'No analysis found for this session' },
        { status: 404 }
      );
    }

    // Count related edit_deltas
    const { count: editDeltaCount, error: countError } = await supabase
      .from('edit_deltas')
      .select('*', { count: 'exact', head: true })
      .eq('decision_id', decision.id);

    if (countError) {
      logger.warn('Failed to count edit deltas', {
        userId: user.id,
        decisionId: decision.id,
        error: countError.message,
      });
    }

    logger.info('Analysis fetched', {
      userId: user.id,
      sessionId,
      decisionId: decision.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        coaching_decision_id: decision.id,
        primary_fix: decision.primary_fix,
        auto_draft: decision.auto_draft,
        coach_edited: decision.coach_edited,
        data_quality_tier: decision.data_quality_tier,
        edit_delta_count: editDeltaCount ?? 0,
        created_at: decision.created_at,
        updated_at: decision.updated_at,
      },
    });
  } catch (err) {
    logger.error('Causal analysis GET error', { error: err });
    return NextResponse.json({ error: '내부 서버 오류' }, { status: 500 });
  }
}
