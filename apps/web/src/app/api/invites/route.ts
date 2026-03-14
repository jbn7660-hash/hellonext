/**
 * Invites API — Generate and List Invite Links
 *
 * POST /api/invites — Pro creates an invite link for a member
 * GET  /api/invites — Pro lists their invite links
 *
 * @route /api/invites
 * @feature F-007 가입/인증
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Tables, TablesInsert } from '@/lib/supabase/types';

const CreateInviteSchema = z.object({
  memo: z.string().max(200).optional(),
});

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i]! % chars.length];
    if (i === 3) code += '-';
  }
  return code;
}

/**
 * POST /api/invites — Generate a new invite link
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' } },
        { status: 401 }
      );
    }

    const { data: proProfileRaw, error: profileError } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

    if (profileError || !proProfile) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '프로 계정만 초대 링크를 생성할 수 있습니다.' } },
        { status: 403 }
      );
    }

    // Validate request body
    let _body: z.infer<typeof CreateInviteSchema> = {};
    try {
      const rawBody = await request.json().catch(() => ({}));
      _body = CreateInviteSchema.parse(rawBody);
    } catch (validationError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다.', details: validationError } },
        { status: 400 }
      );
    }

    // Generate unique invite code with retry
    let inviteCode = generateInviteCode();
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const insertData: TablesInsert<'pro_member_links'> = {
        pro_id: proProfile.id,
        invite_code: inviteCode,
        status: 'invited',
      };
      const { data: insertDataRaw, error: insertError } = await supabase
        .from('pro_member_links')
        .insert(insertData as never)
        .select('id, invite_code, status, created_at')
        .single();

      const data = insertDataRaw as Tables<'pro_member_links'> | null;

      if (!insertError && data) {
        const origin = request.headers.get('origin') || request.nextUrl.origin;
        const inviteUrl = `${origin}/invite/${data.invite_code}`;

        logger.info('Invite created', { proId: proProfile.id, inviteCode: data.invite_code });

        return NextResponse.json({
          data: {
            id: data.id,
            invite_code: data.invite_code,
            invite_url: inviteUrl,
            status: data.status,
            created_at: data.created_at,
          },
        });
      }

      // Unique constraint violation — regenerate code
      if (insertError?.code === '23505') {
        inviteCode = generateInviteCode();
        attempts++;
        continue;
      }

      // Other error
      logger.error('Failed to create invite', { error: insertError?.message });
      return NextResponse.json(
        { error: { code: 'INSERT_FAILED', message: '초대 링크 생성에 실패했습니다.' } },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: { code: 'CODE_GENERATION_FAILED', message: '초대 코드 생성에 실패했습니다. 다시 시도해주세요.' } },
      { status: 500 }
    );
  } catch (err) {
    logger.error('Invites POST error', { error: err });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invites — List pro's invite links
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' } },
        { status: 401 }
      );
    }

    const { data: proProfileRaw, error: profileError } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

    if (profileError || !proProfile) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '프로 계정만 초대 목록을 조회할 수 있습니다.' } },
        { status: 403 }
      );
    }

    const { data: linksRaw, error } = await supabase
      .from('pro_member_links')
      .select('id, invite_code, status, created_at, member_id')
      .eq('pro_id', proProfile.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch invites', { error: error.message });
      return NextResponse.json(
        { error: { code: 'FETCH_FAILED', message: '초대 목록 조회에 실패했습니다.' } },
        { status: 500 }
      );
    }

    const links = (linksRaw ?? []) as Tables<'pro_member_links'>[];
    const origin = process.env.NEXT_PUBLIC_APP_URL || '';

    const invites = links.map((link) => ({
      id: link.id,
      invite_code: link.invite_code,
      invite_url: origin ? `${origin}/invite/${link.invite_code}` : null,
      status: link.status,
      created_at: link.created_at,
      member_id: link.member_id,
    }));

    return NextResponse.json({ data: invites });
  } catch (err) {
    logger.error('Invites GET error', { error: err });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    );
  }
}
