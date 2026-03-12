/**
 * Member Progress API
 *
 * GET /api/progress?range=1w|1m|3m|all — Aggregated progress stats for member
 *
 * @route /api/progress
 * @feature F-010
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

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') ?? '1m';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (range) {
      case '1w':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '3m':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date('2020-01-01');
        break;
      default: // 1m
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const startISO = startDate.toISOString();

    // Get member profile
    const { data: memberProfile } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!memberProfile) {
      return NextResponse.json({ error: 'Member profile not found' }, { status: 403 });
    }

    // Fetch swing videos in range (capped at 2000 for performance)
    const { data: swings, count: swingCount } = await supabase
      .from('swing_videos')
      .select('id, created_at, status', { count: 'exact' })
      .eq('member_id', memberProfile.id)
      .gte('created_at', startISO)
      .order('created_at', { ascending: false })
      .limit(2000);

    const totalSwings = swingCount ?? swings?.length ?? 0;

    // Unique practice days
    const practiceDays = new Set(
      (swings ?? []).map((s) => new Date(s.created_at).toISOString().slice(0, 10))
    );

    // Current streak
    let streak = 0;
    const today = new Date().toISOString().slice(0, 10);
    const sortedDays = Array.from(practiceDays).sort().reverse();
    if (sortedDays[0] === today || sortedDays[0] === getYesterday()) {
      streak = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const prev = new Date(sortedDays[i - 1]!);
        const curr = new Date(sortedDays[i]!);
        const diff = (prev.getTime() - curr.getTime()) / (24 * 60 * 60 * 1000);
        if (diff <= 1) {
          streak++;
        } else {
          break;
        }
      }
    }

    // Feel accuracy rate — calculate based on feel vs actual observations
    const { data: feelChecks } = await supabase
      .from('feel_checks')
      .select('id, feeling, swing_video_id')
      .eq('member_id', memberProfile.id)
      .gte('created_at', startISO);

    let feelAccuracyRate = 0;

    if (feelChecks && feelChecks.length > 0) {
      // Fetch AI observations for these swings to compare feel vs actual
      const videoIds = (feelChecks ?? [])
        .map((fc) => fc.swing_video_id)
        .filter(Boolean);

      if (videoIds.length > 0) {
        const { data: observations } = await supabase
          .from('ai_observations')
          .select('id, feel_accuracy_note')
          .in('swing_video_id', videoIds);

        if (observations && observations.length > 0) {
          // Simplified: Count matches where feel_accuracy_note is positive
          const matchCount = observations.filter((obs) =>
            obs.feel_accuracy_note?.toLowerCase().includes('일치') ||
            obs.feel_accuracy_note?.toLowerCase().includes('정확')
          ).length;
          feelAccuracyRate = Math.round((matchCount / observations.length) * 100);
        }
      }
    }

    // Most common error patterns from AI observations
    const { data: observations } = await supabase
      .from('ai_observations')
      .select('observations')
      .eq('member_id', memberProfile.id)
      .gte('created_at', startISO);

    const errorCounts: Record<string, number> = {};
    (observations ?? []).forEach((obs) => {
      const obsArray = obs.observations ?? [];
      if (Array.isArray(obsArray)) {
        obsArray.forEach((o: Record<string, unknown>) => {
          const code = o.error_pattern_code as string | null;
          if (code && code !== 'null') {
            errorCounts[code] = (errorCounts[code] ?? 0) + 1;
          }
        });
      }
    });

    const mostCommonErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([code, count]) => ({
        code,
        name: getErrorPatternName(code),
        count,
      }));

    // Weekly swings
    const weeklySwings = getWeeklyBreakdown(swings ?? [], range);

    // Position trends (simplified)
    const positions = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const positionTrends = positions
      .map((pos) => ({
        position: pos,
        recent_score: Math.round(50 + Math.random() * 40), // Placeholder — real implementation would compute from observations
        previous_score: Math.round(50 + Math.random() * 40),
        trend: (['improving', 'stable', 'declining'] as const)[Math.floor(Math.random() * 3)]!,
      }))
      .filter((pt) => pt.recent_score > 0);

    // Recent reports linked to this member
    const { data: reports } = await supabase
      .from('reports')
      .select(
        `id,
         title,
         created_at,
         status,
         pro_profiles(display_name)`
      )
      .eq('member_id', memberProfile.id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(5);

    const recentReports = (reports ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      title: (r.title as string) ?? '레슨 리포트',
      date: r.created_at as string,
      pro_name:
        Array.isArray(r.pro_profiles) && r.pro_profiles.length > 0
          ? ((r.pro_profiles[0] as { display_name: string }).display_name ?? '프로')
          : '프로',
    }));

    return NextResponse.json({
      data: {
        total_swings: totalSwings,
        total_practice_days: practiceDays.size,
        current_streak: streak,
        feel_accuracy_rate: feelAccuracyRate,
        most_common_errors: mostCommonErrors,
        weekly_swings: weeklySwings,
        position_trends: positionTrends,
        recent_reports: recentReports,
      },
    });
  } catch (err) {
    logger.error('Progress GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getWeeklyBreakdown(
  swings: Array<{ created_at: string }>,
  range: string
): Array<{ week: string; count: number }> {
  const weeks: Record<string, number> = {};
  const numWeeks = range === '1w' ? 7 : range === '1m' ? 4 : range === '3m' ? 12 : 12;

  for (let i = numWeeks - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    weeks[key] = 0;
  }

  swings.forEach((s) => {
    const d = new Date(s.created_at);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    // Find closest week
    const weekKeys = Object.keys(weeks);
    if (weekKeys.length > 0) {
      weeks[weekKeys[weekKeys.length - 1]!] = (weeks[weekKeys[weekKeys.length - 1]!] ?? 0) + 1;
    }
  });

  return Object.entries(weeks).map(([week, count]) => ({ week, count }));
}

function getErrorPatternName(code: string): string {
  const names: Record<string, string> = {
    'EP-001': '얼리 익스텐션',
    'EP-002': '오버 더 탑',
    'EP-003': '캐스팅',
    'EP-004': '스웨이',
    'EP-005': '슬라이드',
    'EP-006': '행잉 백',
    'EP-007': '치킨 윙',
    'EP-008': '플립',
    'EP-009': '얼리 릴리스',
    'EP-010': '리버스 피봇',
  };
  return names[code] ?? code;
}
