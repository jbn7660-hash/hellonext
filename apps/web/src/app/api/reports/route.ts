/**
 * Reports API — List Reports
 *
 * GET /api/reports — List reports for authenticated user
 *   - Pro: reports they created (pro_id match)
 *   - Member: reports sent to them (member_id match)
 *
 * @route /api/reports
 * @feature F-001
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';

const ListReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'published', 'read']).optional(),
  member_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 },
      );
    }

    // Validate query params
    const { searchParams } = new URL(request.url);
    const parsed = ListReportsQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      member_id: searchParams.get('member_id') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: '잘못된 요청 파라미터입니다.' } },
        { status: 400 },
      );
    }

    const { page, limit, status, member_id: memberIdFilter } = parsed.data;

    // Check user role
    const { data: memberProfile } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Build query
    let query = supabase
      .from('reports')
      .select(
        `id, title, status, created_at, updated_at, member_id, pro_id, error_tags, homework,
        voice_memos(id, duration_sec),
        member_profiles(display_name),
        pro_profiles(display_name, studio_name)`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (memberProfile) {
      // Member sees reports sent to them
      query = query.eq('member_id', memberProfile.id);

      // Members cannot filter by member_id
      if (memberIdFilter) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: '회원은 member_id 필터를 사용할 수 없습니다.' } },
          { status: 403 },
        );
      }
    } else if (proProfile) {
      // Pro sees reports they created
      query = query.eq('pro_id', proProfile.id);

      // C6 Fix: Pro filtering by member_id requires pro_member_links verification
      if (memberIdFilter) {
        const { data: link } = await supabase
          .from('pro_member_links')
          .select('id')
          .eq('pro_id', proProfile.id)
          .eq('member_id', memberIdFilter)
          .eq('status', 'active')
          .maybeSingle();

        if (!link) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '해당 회원과의 연결이 없습니다.' } },
            { status: 403 },
          );
        }

        query = query.eq('member_id', memberIdFilter);
      }
    } else {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '프로필을 찾을 수 없습니다.' } },
        { status: 403 },
      );
    }

    // Optional status filter
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Reports fetch failed', { error: error.message, userId: user.id });
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: '리포트 목록을 불러오는데 실패했습니다.' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (err) {
    logger.error('Reports GET error', { error: err });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 },
    );
  }
}
