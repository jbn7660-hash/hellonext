/**
 * Edit Deltas API Route
 *
 * POST /api/edit-deltas — Record a coach edit delta
 * GET /api/edit-deltas?decision_id=<uuid> — Retrieve edit deltas for a decision
 *
 * Per Patent 1 Claim 3: Records Layer C (coaching_decisions) edits as deltas
 * for RLHF and edge weight calibration.
 *
 * DC-1 compliance: Only Layer C (coaching_decisions) edits are recorded.
 *
 * @route /api/edit-deltas
 * @feature F-015
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

interface EditDeltaRequest {
  decision_id: string; // UUID
  edited_fields: string[]; // Field names changed
  original_value: Record<string, unknown>; // Before values
  edited_value: Record<string, unknown>; // After values
  confidence_score?: number; // [0.0, 1.0] for data quality tier
}

interface EditDeltaResponse {
  id: string;
  decision_id: string;
  edited_fields: string[];
  original_value: Record<string, unknown>;
  edited_value: Record<string, unknown>;
  delta_value: Record<string, unknown>;
  data_quality_tier: string; // tier_1, tier_2, tier_3
  created_at: string;
}

/**
 * Compute delta between original and edited values.
 * Returns JSONB object with differences.
 */
function computeEditDelta(
  originalValue: Record<string, unknown>,
  editedValue: Record<string, unknown>,
  editedFields: string[]
): Record<string, unknown> {
  const delta: Record<string, unknown> = {};

  for (const field of editedFields) {
    const original = originalValue[field];
    const edited = editedValue[field];

    // Compute numeric delta if applicable
    if (typeof original === 'number' && typeof edited === 'number') {
      delta[field] = {
        original,
        edited,
        change: edited - original,
        percent_change: original !== 0 ? ((edited - original) / original) * 100 : 0,
      };
    } else {
      delta[field] = {
        original,
        edited,
      };
    }
  }

  return delta;
}

/**
 * Determine data quality tier based on confidence score.
 * tier_1: AI unchanged (confidence < 0.3)
 * tier_2: Partial edit (confidence 0.3-0.7)
 * tier_3: Full override (confidence > 0.7)
 */
function determineDataQualityTier(confidenceScore: number): string {
  if (confidenceScore < 0.3) return 'tier_1';
  if (confidenceScore <= 0.7) return 'tier_2';
  return 'tier_3';
}

/**
 * POST /api/edit-deltas
 * Record a coach edit delta.
 * DC-1 compliance: Validates only Layer C (coaching_decisions) is edited.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // Parse request body
    const body = (await request.json()) as EditDeltaRequest;
    const {
      decision_id,
      edited_fields,
      original_value,
      edited_value,
      confidence_score = 0.5,
    } = body;

    // Validation
    if (!decision_id || !edited_fields || !original_value || !edited_value) {
      return NextResponse.json(
        { error: 'decision_id, edited_fields, original_value, and edited_value are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(edited_fields) || edited_fields.length === 0) {
      return NextResponse.json(
        { error: 'edited_fields must be a non-empty array' },
        { status: 400 }
      );
    }

    if (confidence_score < 0 || confidence_score > 1) {
      return NextResponse.json(
        { error: 'confidence_score must be between 0.0 and 1.0' },
        { status: 400 }
      );
    }

    logger.info('Recording edit delta', {
      userId: user.id,
      decisionId: decision_id,
      editedFields,
    });

    // DC-1 Compliance: Verify the decision exists and belongs to Layer C
    const { data: decision, error: decisionError } = await supabase
      .from('coaching_decisions')
      .select('id, coach_profile_id, data_quality_tier')
      .eq('id', decision_id)
      .single();

    if (decisionError || !decision) {
      logger.warn('Coaching decision not found', {
        userId: user.id,
        decisionId: decision_id,
      });
      return NextResponse.json({ error: '코칭 결정을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Verify user is the coach for this decision
    const { data: proProfile, error: profileError } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !proProfile || proProfile.id !== decision.coach_profile_id) {
      logger.warn('User not authorized to edit this decision', {
        userId: user.id,
        decisionId: decision_id,
      });
      return NextResponse.json(
        { error: '이 결정을 수정할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // Compute delta
    const deltaValue = computeEditDelta(original_value, edited_value, edited_fields);

    // Determine data quality tier
    const dataQualityTier = determineDataQualityTier(confidence_score);

    // Insert edit delta
    const { data: editDelta, error: insertError } = await supabase
      .from('edit_deltas')
      .insert({
        decision_id,
        edited_fields,
        original_value,
        edited_value,
        delta_value: deltaValue,
        data_quality_tier: dataQualityTier,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertError) {
      logger.error('Failed to insert edit delta', {
        userId: user.id,
        decisionId: decision_id,
        error: insertError.message,
      });
      return NextResponse.json(
        { error: '수정 델타를 기록할 수 없습니다.' },
        { status: 500 }
      );
    }

    logger.info('Edit delta recorded', {
      userId: user.id,
      decisionId: decision_id,
      editDeltaId: editDelta.id,
      dataQualityTier,
    });

    // Update decision's data_quality_tier if needed
    if (dataQualityTier !== decision.data_quality_tier) {
      const { error: updateError } = await supabase
        .from('coaching_decisions')
        .update({
          data_quality_tier: dataQualityTier,
          updated_at: new Date().toISOString(),
        })
        .eq('id', decision_id);

      if (updateError) {
        logger.warn('Failed to update coaching decision tier', {
          userId: user.id,
          decisionId: decision_id,
          error: updateError.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: editDelta.id,
        decision_id: editDelta.decision_id,
        edited_fields: editDelta.edited_fields,
        original_value: editDelta.original_value,
        edited_value: editDelta.edited_value,
        delta_value: editDelta.delta_value,
        data_quality_tier: editDelta.data_quality_tier,
        created_at: editDelta.created_at,
      } as EditDeltaResponse,
    });
  } catch (err) {
    logger.error('Edit delta POST error', { error: err });
    return NextResponse.json({ error: '내부 서버 오류' }, { status: 500 });
  }
}

/**
 * GET /api/edit-deltas?decision_id=<uuid>&page=1&limit=20
 * Retrieve edit deltas for a decision with pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const decisionId = searchParams.get('decision_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!decisionId) {
      return NextResponse.json(
        { error: 'decision_id query parameter is required' },
        { status: 400 }
      );
    }

    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'page must be >= 1, limit must be 1-100' },
        { status: 400 }
      );
    }

    logger.info('Fetching edit deltas', {
      userId: user.id,
      decisionId,
      page,
      limit,
    });

    // Verify decision exists and user is authorized
    const { data: decision, error: decisionError } = await supabase
      .from('coaching_decisions')
      .select('id, coach_profile_id')
      .eq('id', decisionId)
      .single();

    if (decisionError || !decision) {
      return NextResponse.json(
        { error: '코칭 결정을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // Verify user is the coach
    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!proProfile || proProfile.id !== decision.coach_profile_id) {
      return NextResponse.json(
        { error: '이 결정의 수정 내역을 볼 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // Fetch edit deltas with pagination
    const offset = (page - 1) * limit;

    const {
      data: editDeltas,
      error: fetchError,
      count,
    } = await supabase
      .from('edit_deltas')
      .select('*', { count: 'exact' })
      .eq('decision_id', decisionId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      logger.error('Failed to fetch edit deltas', {
        userId: user.id,
        decisionId,
        error: fetchError.message,
      });
      return NextResponse.json(
        { error: '수정 델타를 가져올 수 없습니다.' },
        { status: 500 }
      );
    }

    logger.info('Edit deltas fetched', {
      userId: user.id,
      decisionId,
      count: editDeltas?.length || 0,
      totalCount: count,
    });

    return NextResponse.json({
      success: true,
      data: editDeltas || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    logger.error('Edit delta GET error', { error: err });
    return NextResponse.json({ error: '내부 서버 오류' }, { status: 500 });
  }
}
