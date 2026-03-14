/**
 * Members API — List Pro's Members
 *
 * GET /api/members — List all members linked to current pro
 *
 * Returns members with latest activity summary (last report, feel-check).
 *
 * @route /api/members
 * @feature F-002
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Tables } from '@/lib/supabase/types';

// member_profiles schema: id, created_at, display_name, is_premium, premium_expires_at, updated_at, user_id
// pro_member_links schema: id, created_at, invite_code, member_id, pro_id, status, updated_at
// NO avatar_url, handicap, golf_experience_months on member_profiles
// NO is_active on pro_member_links — use status='active'

type MemberProfileJoin = {
  id: string;
  display_name: string;
};

type ProMemberLinkWithMember = {
  member_id: string | null;
  created_at: string;
  member_profiles: MemberProfileJoin | null;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: proProfileRaw, error: profileError } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

    if (profileError || !proProfile) {
      logger.warn('Pro profile not found', { userId: user.id });
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // Fetch linked members — select only schema-valid columns
    const { data: dataRaw, error } = await supabase
      .from('pro_member_links')
      .select(`
        member_id,
        created_at,
        member_profiles!inner(
          id,
          display_name
        )
      `)
      .eq('pro_id', proProfile.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch members', { userId: user.id, error: error.message });
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    const memberData = (dataRaw ?? []) as unknown as ProMemberLinkWithMember[];

    const memberIds = memberData
      .map((link) => link.member_id)
      .filter((id): id is string => id !== null);

    if (memberIds.length === 0) {
      logger.info('No members found', { userId: user.id, proId: proProfile.id });
      return NextResponse.json({ data: [] });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    const [reportCounts, feelChecks, memoCounts] = await Promise.all([
      supabase
        .from('reports')
        .select('member_id')
        .eq('pro_id', proProfile.id)
        .in('member_id', memberIds)
        .gte('created_at', thirtyDaysAgoStr),

      supabase
        .from('feel_checks')
        .select('member_id, feeling, created_at')
        .in('member_id', memberIds)
        .order('created_at', { ascending: false }),

      supabase
        .from('voice_memos')
        .select('member_id')
        .eq('pro_id', proProfile.id)
        .in('member_id', memberIds)
        .eq('status', 'draft'),
    ]);

    const reportCountMap = new Map<string, number>();
    ((reportCounts.data ?? []) as { member_id: string }[]).forEach((r) => {
      reportCountMap.set(r.member_id, (reportCountMap.get(r.member_id) ?? 0) + 1);
    });

    const latestFeelMap = new Map<string, { feeling: string; created_at: string }>();
    ((feelChecks.data ?? []) as Tables<'feel_checks'>[]).forEach((fc) => {
      if (!latestFeelMap.has(fc.member_id)) {
        latestFeelMap.set(fc.member_id, { feeling: fc.feeling, created_at: fc.created_at });
      }
    });

    const memoCountMap = new Map<string, number>();
    ((memoCounts.data ?? []) as Tables<'voice_memos'>[]).forEach((m) => {
      if (m.member_id) {
        memoCountMap.set(m.member_id, (memoCountMap.get(m.member_id) ?? 0) + 1);
      }
    });

    const members = memberData
      .filter((link) => link.member_id !== null && link.member_profiles !== null)
      .map((link) => {
        const member = link.member_profiles!;
        const memberId = link.member_id!;

        return {
          id: member.id,
          display_name: member.display_name,
          linked_at: link.created_at,
          recent_report_count: reportCountMap.get(memberId) ?? 0,
          latest_feel_check: latestFeelMap.get(memberId) ?? null,
          pending_memo_count: memoCountMap.get(memberId) ?? 0,
        };
      });

    logger.info('Members fetched', { userId: user.id, count: members.length });

    return NextResponse.json({ data: members });
  } catch (err) {
    logger.error('Members GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
