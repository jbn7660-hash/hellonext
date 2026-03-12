/**
 * Feel Checks API
 *
 * POST /api/feel-checks — Create a feel check entry
 * GET  /api/feel-checks — List feel checks for current member
 *
 * @route /api/feel-checks
 * @feature F-005
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';

const CreateFeelCheckSchema = z.object({
  swing_video_id: z.string().uuid(),
  feeling: z.enum(['good', 'unsure', 'off']),
  notes: z.string().max(200).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateFeelCheckSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Get member profile
    const { data: memberProfile } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!memberProfile) {
      return NextResponse.json({ error: 'Member profile not found' }, { status: 403 });
    }

    // Verify swing video belongs to this member
    const { data: videoCheck } = await supabase
      .from('swing_videos')
      .select('id, member_id')
      .eq('id', parsed.data.swing_video_id)
      .maybeSingle();

    if (!videoCheck || videoCheck.member_id !== memberProfile.id) {
      return NextResponse.json(
        { error: '해당 스윙 영상을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from('feel_checks')
      .insert({
        member_id: memberProfile.id,
        swing_video_id: parsed.data.swing_video_id,
        feeling: parsed.data.feeling,
        notes: parsed.data.notes ?? null,
      })
      .select('id, feeling, created_at')
      .single();

    if (error) {
      logger.error('Feel check insert failed', { error: error.message });
      return NextResponse.json({ error: 'Feel Check 저장 실패' }, { status: 500 });
    }

    logger.info('Feel check created', {
      feelCheckId: data.id,
      videoId: parsed.data.swing_video_id,
      feeling: parsed.data.feeling,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    logger.error('Feel check POST error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberProfile } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!memberProfile) {
      return NextResponse.json({ error: 'Member profile not found' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);

    const { data, error } = await supabase
      .from('feel_checks')
      .select('id, feeling, notes, created_at, swing_video_id')
      .eq('member_id', memberProfile.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Feel checks fetch failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    logger.error('Feel checks GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
