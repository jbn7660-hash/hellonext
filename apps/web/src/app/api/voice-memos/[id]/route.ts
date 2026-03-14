/**
 * Voice Memo API — Single Memo Operations
 *
 * GET    /api/voice-memos/[id]  — Get memo details
 * PATCH  /api/voice-memos/[id]  — Update memo (assign member, edit)
 *
 * @route /api/voice-memos/[id]
 * @feature F-001, F-003
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';

const UpdateMemoSchema = z.object({
  member_id: z.string().uuid('유효한 회원 ID가 필요합니다.').nullable().optional(),
  status: z.enum(['recording', 'transcribing', 'structuring', 'draft', 'published']).optional(),
  transcript: z.string().optional(),
  structured_json: z.record(z.unknown()).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** GET: Fetch single memo with related report */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pro profile to verify ownership
    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('voice_memos')
      .select('*, reports(*)')
      .eq('id', id)
      .eq('pro_id', proProfile.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Memo not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    logger.error('Memo GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH: Update memo (e.g., assign member to orphan memo) */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pro profile to verify ownership
    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // Verify ownership
    const { data: existingMemo } = await supabase
      .from('voice_memos')
      .select('id, member_id')
      .eq('id', id)
      .eq('pro_id', proProfile.id)
      .single();

    if (!existingMemo) {
      return NextResponse.json({ error: 'Memo not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = UpdateMemoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('voice_memos')
      .update(parsed.data)
      .eq('id', id)
      .eq('pro_id', proProfile.id)
      .select('*')
      .single();

    if (error) {
      logger.error('Memo update failed', { memoId: id, error: error.message });
      return NextResponse.json({ error: 'Failed to update memo' }, { status: 500 });
    }

    // If member was just assigned (orphan -> assigned), trigger FSM bindTarget via Edge Function
    if (parsed.data.member_id && !existingMemo.member_id && data) {
      logger.info('Member assigned to orphan memo, triggering voice-fsm-controller', {
        memoId: id,
        memberId: parsed.data.member_id,
      });

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceKey) {
        // Trigger FSM transition via Edge Function (DC-5 compliant)
        try {
          await fetch(`${supabaseUrl}/functions/v1/voice-fsm-controller`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'bindTarget',
              memo_id: id,
              pro_id: proProfile.id,
              member_id: parsed.data.member_id,
              audio_url: data.audio_url,
              duration_sec: data.duration_sec,
              transcript: data.transcript ?? null,
              structured_json: data.structured_json ?? null,
            }),
          });
        } catch (err) {
          logger.error('Failed to trigger FSM bindTarget', { memoId: id, error: err });
          // Don't fail the PATCH - memo was updated successfully
        }
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    logger.error('Memo PATCH error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
