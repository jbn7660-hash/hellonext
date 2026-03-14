/**
 * Dashboard Stats API Route
 *
 * GET /api/dashboard/stats — Aggregate stats for pro dashboard
 *
 * Returns weekly report counts, notifications, activity feed,
 * and onboarding status.
 *
 * @route /api/dashboard/stats
 * @feature F-002
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Tables } from '@/lib/supabase/types';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: proProfileRaw, error: profileError } = await supabase
      .from('pro_profiles')
      .select('id, studio_name')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as Pick<Tables<'pro_profiles'>, 'id' | 'studio_name'> | null;

    if (profileError || !proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay());
    startOfThisWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const [thisWeekReports, lastWeekReports, recentNotifications] = await Promise.all([
      // This week's reports
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('pro_id', proProfile.id)
        .gte('created_at', startOfThisWeek.toISOString()),

      // Last week's reports
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('pro_id', proProfile.id)
        .gte('created_at', startOfLastWeek.toISOString())
        .lt('created_at', startOfThisWeek.toISOString()),

      // Recent notifications
      supabase
        .from('notifications')
        .select('id, type, body, created_at')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    // Check onboarding: has at least 1 member linked
    const { count: memberCount } = await supabase
      .from('pro_member_links')
      .select('id', { count: 'exact', head: true })
      .eq('pro_id', proProfile.id)
      .eq('status', 'active');

    const onboardingCompleted = (memberCount ?? 0) > 0;

    const notifications = ((recentNotifications.data ?? []) as Tables<'notifications'>[]).map((n) => ({
      id: n.id,
      type: n.type as 'new_video' | 'analysis_complete' | 'report_published',
      message: n.body ?? n.title,
      created_at: n.created_at,
    }));

    logger.info('Dashboard stats fetched', { proId: proProfile.id });

    return NextResponse.json({
      this_week_reports: thisWeekReports.count ?? 0,
      last_week_reports: lastWeekReports.count ?? 0,
      notifications,
      onboarding_completed: onboardingCompleted,
    });
  } catch (err) {
    logger.error('Dashboard stats GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
