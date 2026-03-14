/**
 * Voice Memos API — List & Create
 *
 * GET  /api/voice-memos  — List pro's voice memos (paginated)
 * POST /api/voice-memos  — Create new memo + trigger pipeline
 *
 * @route /api/voice-memos
 * @feature F-001, F-003
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';

const CreateMemoSchema = z.object({
  audio_url: z.string().url('유효한 오디오 URL이 필요합니다.'),
  duration_sec: z.number().int().min(1, '최소 1초 이상이어야 합니다.').max(120, '최대 120초(2분)까지 가능합니다.'),
  member_id: z.string().uuid('유효한 회원 ID가 필요합니다.').nullable().optional(),
});

const ListMemosSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  orphan: z.coerce.boolean().default(false),
  status: z.string().optional(),
  member_id: z.string().uuid().optional(),
});

/** GET: List memos for current pro */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pro profile
    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as { id: string } | null;

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = ListMemosSchema.safeParse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      orphan: searchParams.get('orphan'),
      status: searchParams.get('status'),
      member_id: searchParams.get('member_id'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, orphan, status, member_id } = parsed.data;

    let query = supabase
      .from('voice_memos')
      .select('*, reports(id, status)', { count: 'exact' })
      .eq('pro_id', proProfile.id)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (orphan) {
      query = query.is('member_id', null);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (member_id) {
      query = query.eq('member_id', member_id);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch memos', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch memos' }, { status: 500 });
    }

    return NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any[],
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (err) {
    logger.error('Voice memos GET unexpected error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST: Create new memo and trigger voice-to-report pipeline */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pro profile
    // C7 Fix: pro_profiles.tier 사용 (subscription_status 컬럼 미존재)
    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id, tier')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as { id: string; tier: string } | null;

    if (!proProfile) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Pro profile not found' } },
        { status: 403 }
      );
    }

    // MVP: starter 티어도 PLG 쿠폰 3개로 음성 메모 생성 가능
    // Sprint 4에서 구독 기반 제한 강화 예정

    // Validate body
    const body = await request.json();
    const parsed = CreateMemoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { audio_url, duration_sec, member_id } = parsed.data;

    // Create memo record
    const { data: memoRaw, error: insertError } = await supabase
      .from('voice_memos')
      .insert({
        pro_id: proProfile.id,
        member_id: member_id ?? null,
        audio_url,
        duration_sec,
        status: 'recording',
      } as unknown as never)
      .select('*')
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memo = memoRaw as any;

    if (insertError || !memo) {
      logger.error('Failed to create memo', { error: insertError?.message });
      return NextResponse.json({ error: 'Failed to create memo' }, { status: 500 });
    }

    logger.info('Memo created, triggering pipeline', { memoId: memo.id, hasTarget: !!member_id });

    // Trigger voice-to-report Edge Function (async)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/voice-to-report`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            memo_id: memo.id,
            pro_id: proProfile.id,
            member_id: member_id ?? null,
          }),
        });
      } catch (err) {
        logger.error('Failed to trigger pipeline', { error: err });
      }
    }

    return NextResponse.json({ data: memo }, { status: 201 });
  } catch (err) {
    logger.error('Voice memos POST unexpected error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
