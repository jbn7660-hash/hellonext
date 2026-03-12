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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pro profile
    const { data: proProfile, error: profileError } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !proProfile) {
      logger.warn('Pro profile not found', { userId: user.id });
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // Fetch linked members with latest activity
    const { data, error } = await supabase
      .from('pro_member_links')
      .select(`
        member_id,
        created_at,
        member_profiles!inner(
          id,
          display_name,
          avatar_url,
          handicap,
          golf_experience_months
        )
      `)
      .eq('pro_id', proProfile.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch members', { userId: user.id, error: error.message });
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    const memberData = data ?? [];

    // Batch-optimized: collect all member IDs, then run 3 aggregate queries
    const memberIds = memberData.map((link) => {
      const mp = link.member_profiles as { id: string };
      return mp.id;
    });

    if (memberIds.length === 0) {
      logger.info('No members found', { userId: user.id, proId: proProfile.id });
      return NextResponse.json({ data: [] });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    // 3 parallel batch queries instead of N×3 sequential queries (performance optimization)
    const [reportCounts, feelChecks, memoCounts] = await Promise.all([
      // Batch: report counts per member (last 30 days)
      supabase
        .from('reports')
        .select('member_id')
        .eq('pro_id', proProfile.id)
        .in('member_id', memberIds)
        .gte('created_at', thirtyDaysAgoStr),

      // Batch: latest feel checks per member (all at once)
      supabase
        .from('feel_checks')
        .select('member_id, feeling, created_at')
        .in('member_id', memberIds)
        .order('created_at', { ascending: false }),

      // Batch: draft memo counts per member
      supabase
        .from('voice_memos')
        .select('member_id')
        .eq('pro_id', proProfile.id)
        .in('member_id', memberIds)
        .eq('status', 'draft'),
    ]);

    // Build lookup maps from batch results
    const reportCountMap = new Map<string, number>();
    (reportCounts.data ?? []).forEach((r) => {
      reportCountMap.set(r.member_id, (reportCountMap.get(r.member_id) ?? 0) + 1);
    });

    const latestFeelMap = new Map<string, { feeling: string; created_at: string }>();
    (feelChecks.data ?? []).forEach((fc) => {
      if (!latestFeelMap.has(fc.member_id)) {
        latestFeelMap.set(fc.member_id, { feeling: fc.feeling, created_at: fc.created_at });
      }
    });

    const memoCountMap = new Map<string, number>();
    (memoCounts.data ?? []).forEach((m) => {
      memoCountMap.set(m.member_id, (memoCountMap.get(m.member_id) ?? 0) + 1);
    });

    // Map results
    const members = memberData.map((link) => {
      const member = link.member_profiles as {
        id: string;
        display_name: string;
        avatar_url: string | null;
        handicap: number | null;
        golf_experience_months: number | null;
      };

      return {
        id: member.id,
        display_name: member.display_name,
        avatar_url: member.avatar_url,
        handicap: member.handicap,
        golf_experience_months: member.golf_experience_months,
        linked_at: link.created_at,
        recent_report_count: reportCountMap.get(member.id) ?? 0,
        latest_feel_check: latestFeelMap.get(member.id) ?? null,
        pending_memo_count: memoCountMap.get(member.id) ?? 0,
      };
    });

    logger.info('Members fetched', { userId: user.id, count: members.length });

    return NextResponse.json({ data: members });
  } catch (err) {
    logger.error('Members GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
