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
import type { Tables } from '@/lib/supabase/types';

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
    const { data: memberProfileRaw } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const memberProfile = memberProfileRaw as Pick<Tables<'member_profiles'>, 'id'> | null;

    if (!memberProfile) {
      return NextResponse.json({ error: 'Member profile not found' }, { status: 403 });
    }

    // Fetch swing videos in range (capped at 2000 for performance)
    const { data: swingsRaw, count: swingCount } = await supabase
      .from('swing_videos')
      .select('id, created_at', { count: 'exact' })
      .eq('member_id', memberProfile.id)
      .gte('created_at', startISO)
      .order('created_at', { ascending: false })
      .limit(2000);
    const swings = swingsRaw as Array<Pick<Tables<'swing_videos'>, 'id' | 'created_at'>> | null;

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

    // Feel accuracy rate — calculate based on feel_accuracy score on feel_checks
    const { data: feelChecksRaw } = await supabase
      .from('feel_checks')
      .select('id, feeling, video_id, feel_accuracy')
      .eq('member_id', memberProfile.id)
      .gte('created_at', startISO);
    const feelChecks = feelChecksRaw as Array<Pick<Tables<'feel_checks'>, 'id' | 'feeling' | 'video_id' | 'feel_accuracy'>> | null;

    let feelAccuracyRate = 0;

    if (feelChecks && feelChecks.length > 0) {
      // Calculate average feel_accuracy score (0-100 scale)
      const validChecks = feelChecks.filter((fc) => fc.feel_accuracy !== null);
      if (validChecks.length > 0) {
        const totalAccuracy = validChecks.reduce((sum, fc) => sum + (fc.feel_accuracy ?? 0), 0);
        feelAccuracyRate = Math.round(totalAccuracy / validChecks.length);
      }
    }

    // Most common error patterns from AI observations (visible_tags contains error pattern data)
    const { data: observationsRaw } = await supabase
      .from('ai_observations')
      .select('id, visible_tags, created_at')
      .eq('member_id', memberProfile.id)
      .gte('created_at', startISO);
    const observations = observationsRaw as Array<Pick<Tables<'ai_observations'>, 'id' | 'visible_tags' | 'created_at'>> | null;

    const errorCounts: Record<string, number> = {};
    (observations ?? []).forEach((obs) => {
      const tagsArray = obs.visible_tags ?? [];
      if (Array.isArray(tagsArray)) {
        (tagsArray as Array<Record<string, unknown>>).forEach((o) => {
          const code = o['error_pattern_code'] as string | null;
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

    // Position trends — computed from ai_observations error patterns per position
    const ERROR_PATTERN_POSITIONS: Record<string, string> = {
      'EP-001': 'P1', 'EP-002': 'P1', 'EP-003': 'P1',
      'EP-004': 'P2', 'EP-005': 'P2', 'EP-006': 'P2',
      'EP-007': 'P3', 'EP-008': 'P3', 'EP-009': 'P3', 'EP-010': 'P3',
      'EP-011': 'P4', 'EP-012': 'P4', 'EP-013': 'P4', 'EP-021': 'P4', 'EP-022': 'P4',
      'EP-014': 'P5', 'EP-015': 'P5',
      'EP-016': 'P6', 'EP-017': 'P6',
      'EP-018': 'P7',
      'EP-019': 'P8', 'EP-020': 'P8',
    };

    // Split observations into recent half and previous half of the date range
    const midpointISO = new Date((startDate.getTime() + now.getTime()) / 2).toISOString();
    const recentObs = (observations ?? []).filter((o) => o.created_at >= midpointISO);
    const previousObs = (observations ?? []).filter((o) => o.created_at < midpointISO);

    function countErrorsByPosition(obs: typeof observations): Record<string, number> {
      const counts: Record<string, number> = {};
      (obs ?? []).forEach((o) => {
        const tags = o.visible_tags ?? [];
        if (Array.isArray(tags)) {
          (tags as Array<Record<string, unknown>>).forEach((tag) => {
            const code = tag['error_pattern_code'] as string | null;
            const pos = code ? ERROR_PATTERN_POSITIONS[code] : null;
            if (pos) {
              counts[pos] = (counts[pos] ?? 0) + 1;
            }
          });
        }
      });
      return counts;
    }

    const recentErrors = countErrorsByPosition(recentObs);
    const previousErrors = countErrorsByPosition(previousObs);
    const recentTotal = Math.max(recentObs.length, 1);
    const previousTotal = Math.max(previousObs.length, 1);

    const positions = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const positionTrends = positions
      .map((pos) => {
        // Score: 100 minus error rate per observation (clamped 0-100)
        const recentRate = (recentErrors[pos] ?? 0) / recentTotal;
        const previousRate = (previousErrors[pos] ?? 0) / previousTotal;
        const recentScore = Math.round(Math.max(0, Math.min(100, 100 - recentRate * 100)));
        const previousScore = Math.round(Math.max(0, Math.min(100, 100 - previousRate * 100)));
        const diff = recentScore - previousScore;
        const trend: 'improving' | 'stable' | 'declining' =
          diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
        return { position: pos, recent_score: recentScore, previous_score: previousScore, trend };
      })
      .filter((pt) => pt.recent_score < 100 || pt.previous_score < 100); // Only show positions with detected errors

    // Recent reports linked to this member
    const { data: reportsRaw } = await supabase
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
    type ReportWithPro = Pick<Tables<'reports'>, 'id' | 'title' | 'created_at' | 'status'> & {
      pro_profiles: { display_name: string } | Array<{ display_name: string }> | null;
    };
    const reports = reportsRaw as ReportWithPro[] | null;

    const recentReports = (reports ?? []).map((r) => ({
      id: r.id,
      title: r.title ?? '레슨 리포트',
      date: r.created_at,
      pro_name:
        Array.isArray(r.pro_profiles) && r.pro_profiles.length > 0
          ? ((r.pro_profiles[0] as { display_name: string }).display_name ?? '프로')
          : (r.pro_profiles as { display_name: string } | null)?.display_name ?? '프로',
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
