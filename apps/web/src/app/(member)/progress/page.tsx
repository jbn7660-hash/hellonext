/**
 * Member Progress Tab (F-010) - Sprint 7 UX Polish
 *
 * Enhanced visualizations with:
 *  - Interactive animated charts
 *  - Feel vs Real trend line chart
 *  - Weekly goal setting & tracking
 *  - Achievement badges for milestones
 *  - Period-over-period comparison
 *  - CSV export
 *  - Deep links to swing entries
 *  - Smooth animations & transitions
 *  - Pull-to-refresh support
 *  - Full Korean localization
 *
 * @page /progress
 * @feature F-010
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

interface ProgressStats {
  total_swings: number;
  total_practice_days: number;
  current_streak: number;
  feel_accuracy_rate: number; // 0-100
  feel_accuracy_trend: Array<{ date: string; accuracy: number }>;
  weekly_goal: number | null;
  current_week_swings: number;
  most_common_errors: Array<{ code: string; name: string; count: number; id?: string }>;
  weekly_swings: Array<{ week: string; count: number }>;
  position_trends: Array<{
    position: string;
    recent_score: number;
    previous_score: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  recent_reports: Array<{
    id: string;
    title: string;
    date: string;
    pro_name: string;
  }>;
  period_comparison?: {
    swings_change: number;
    accuracy_change: number;
    streak_change: number;
  };
  achievements?: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    unlockedAt?: string;
  }>;
}

type TimeRange = '1w' | '1m' | '3m' | 'all';

export default function ProgressPage() {
  const router = useRouter();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('1m');
  const [refreshing, setRefreshing] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/progress?range=${timeRange}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch progress: ${res.status}`);
      }
      const { data } = await res.json();
      setStats(data);
      setWeeklyGoal(data.weekly_goal || 0);
      logger.info('Progress stats fetched', { range: timeRange });
    } catch (err) {
      logger.error('Progress fetch error', { error: err, range: timeRange });
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    setLoading(true);
    fetchProgress();
  }, [fetchProgress]);

  // Pull-to-refresh support
  const handlePullToRefresh = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const { scrollTop } = containerRef.current;
    if (scrollTop === 0 && !refreshing) {
      setRefreshing(true);
      fetchProgress();
    }
  }, [fetchProgress, refreshing]);

  const handleExportCSV = useCallback(() => {
    if (!stats) return;

    let csv = '날짜,데이터,값\n';
    csv += `"총 스윙","스윙 횟수",${stats.total_swings}\n`;
    csv += `"연습 날",수,"${stats.total_practice_days}"\n`;
    csv += `"연속 날","일","${stats.current_streak}"\n`;
    csv += `"Feel 정확도","%","${stats.feel_accuracy_rate}"\n`;

    stats.weekly_swings.forEach(w => {
      csv += `"${w.week}","스윙","${w.count}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `진척도_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    logger.info('Progress data exported as CSV');
  }, [stats]);

  const handleSetGoal = useCallback(async () => {
    if (!weeklyGoal) return;

    try {
      const res = await fetch('/api/progress/goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly_goal: weeklyGoal }),
      });
      if (res.ok) {
        setShowGoalModal(false);
        fetchProgress();
      }
    } catch (err) {
      logger.error('Failed to set goal', { error: err });
    }
  }, [weeklyGoal, fetchProgress]);

  const timeRanges: { key: TimeRange; label: string }[] = [
    { key: '1w', label: '1주' },
    { key: '1m', label: '1개월' },
    { key: '3m', label: '3개월' },
    { key: 'all', label: '전체' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" label="진척도 분석 중..." />
      </div>
    );
  }

  if (!stats || stats.total_swings === 0) {
    return (
      <div className="px-5 pt-4">
        <h2 className="text-lg font-extrabold tracking-[-0.4px] text-ink mb-4">내 진척도</h2>
        <EmptyState
          title="아직 데이터가 없어요"
          description="연습 탭에서 첫 스윙을 촬영하면 진척도를 확인할 수 있습니다."
          action={
            <button
              type="button"
              onClick={() => router.push('/practice')}
              className="text-sm px-4 py-2 rounded-xl bg-ink text-dawn font-semibold"
            >
              연습 시작
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="px-5 pt-4 pb-24 overflow-y-auto"
      onTouchMove={handlePullToRefresh}
    >
      {refreshing && (
        <div className="animate-fade-in mb-2 text-center">
          <LoadingSpinner size="sm" label="새로고침 중..." />
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold tracking-[-0.4px] text-ink">내 진척도</h2>

        {/* Time Range Filter with smooth transition */}
        <div className="flex gap-1 transition-all duration-300">
          {timeRanges.map((tr) => (
            <button
              key={tr.key}
              type="button"
              onClick={() => setTimeRange(tr.key)}
              className={cn(
                'text-[10px] px-2 py-1 rounded-full font-medium transition-all duration-200',
                timeRange === tr.key
                  ? 'bg-ink text-dawn scale-105'
                  : 'bg-warm text-ink-4 hover:bg-border'
              )}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key Stats with comparison */}
      <div className="grid grid-cols-4 gap-2 mb-6 animate-fade-in">
        <MiniStat
          label="총 스윙"
          value={stats.total_swings}
          change={stats.period_comparison?.swings_change}
        />
        <MiniStat label="연습일" value={stats.total_practice_days} />
        <MiniStat label="연속일" value={stats.current_streak} suffix="일" />
        <MiniStat
          label="Feel 정확도"
          value={stats.feel_accuracy_rate}
          suffix="%"
          color={stats.feel_accuracy_rate >= 60 ? 'text-calm' : 'text-caution'}
          change={stats.period_comparison?.accuracy_change}
        />
      </div>

      {/* Feel Accuracy Card with Trend */}
      <div className="bg-card border border-border rounded-2xl shadow-card p-4 mb-4 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold tracking-[-0.3px] text-ink">Feel vs Real 추이</h3>
          <button
            type="button"
            onClick={handleExportCSV}
            className="text-[10px] text-sky font-medium hover:underline"
            title="CSV로 내보내기"
          >
            내보내기
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg
              className="w-16 h-16 -rotate-90 transition-transform duration-500"
              viewBox="0 0 36 36"
            >
              <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-warm" />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${stats.feel_accuracy_rate} ${100 - stats.feel_accuracy_rate}`}
                strokeLinecap="round"
                className={cn(
                  'transition-all duration-500',
                  stats.feel_accuracy_rate >= 60 ? 'text-calm' : 'text-caution'
                )}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-ink">
              {stats.feel_accuracy_rate}%
            </span>
          </div>
          <div className="flex-1">
            <p className="text-xs text-ink-3 leading-relaxed">
              {stats.feel_accuracy_rate >= 70
                ? '내가 느끼는 감각과 실제 움직임이 잘 일치하고 있어요!'
                : stats.feel_accuracy_rate >= 40
                  ? '조금씩 감각이 맞아가고 있어요. 꾸준히 연습해보세요.'
                  : '느끼는 것과 실제가 다를 수 있어요. Feel Check를 더 신중히 해보세요.'}
            </p>
          </div>
        </div>

        {/* Trend Chart */}
        {stats.feel_accuracy_trend && stats.feel_accuracy_trend.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="h-12 flex items-end gap-1">
              {stats.feel_accuracy_trend.slice(-7).map((point, idx) => {
                const height = Math.max((point.accuracy / 100) * 100, 5);
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center group"
                  >
                    <div
                      className="w-full bg-sky/20 hover:bg-sky/40 rounded-t transition-all duration-300 cursor-pointer"
                      style={{ height: `${height}%` }}
                      title={`${new Date(point.date).toLocaleDateString('ko-KR')}: ${point.accuracy}%`}
                    >
                      <div
                        className="w-full bg-sky rounded-t transition-all duration-300"
                        style={{ height: '100%' }}
                      />
                    </div>
                    <span className="text-[7px] text-ink-4 mt-1 group-hover:font-semibold">
                      {new Date(point.date).getDate()}일
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Weekly Goal Card */}
      <div className="bg-card border border-border rounded-2xl shadow-card p-4 mb-4 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold tracking-[-0.3px] text-ink">주간 목표</h3>
          <button
            type="button"
            onClick={() => setShowGoalModal(true)}
            className="text-[10px] text-sky font-medium hover:underline"
          >
            {weeklyGoal ? '수정' : '설정'}
          </button>
        </div>

        {weeklyGoal ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-ink-3">목표</span>
              <span className="text-sm font-semibold text-ink">{weeklyGoal}회</span>
            </div>
            <div className="w-full h-3 bg-warm rounded-full overflow-hidden">
              <div
                className="h-full bg-ink transition-all duration-500 rounded-full"
                style={{
                  width: `${Math.min((stats.current_week_swings / weeklyGoal) * 100, 100)}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-4">
                이번주: {stats.current_week_swings}회
              </span>
              <span className={cn(
                'text-xs font-medium',
                stats.current_week_swings >= weeklyGoal ? 'text-calm' : 'text-caution'
              )}>
                {stats.current_week_swings >= weeklyGoal ? '달성!' : `${weeklyGoal - stats.current_week_swings}회 남음`}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-3">주간 목표를 설정해보세요!</p>
        )}
      </div>

      {/* Achievements Section */}
      {stats.achievements && stats.achievements.length > 0 && (
        <div className="bg-card border border-border rounded-2xl shadow-card p-4 mb-4 animate-fade-in">
          <h3 className="text-sm font-bold tracking-[-0.3px] text-ink mb-3">달성 배지</h3>
          <div className="grid grid-cols-3 gap-2">
            {stats.achievements.slice(0, 6).map((achievement) => (
              <div
                key={achievement.id}
                className="flex flex-col items-center text-center p-2 rounded-xl bg-dawn hover:bg-warm transition-colors duration-200"
              >
                <div className="text-2xl mb-1">{achievement.icon}</div>
                <p className="text-[9px] font-medium text-ink leading-tight">
                  {achievement.name}
                </p>
                <p className="text-[8px] text-ink-4 mt-0.5">
                  {achievement.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Activity */}
      {stats.weekly_swings.length > 0 && (
        <div className="bg-card border border-border rounded-2xl shadow-card p-4 mb-4 animate-fade-in">
          <h3 className="text-sm font-bold tracking-[-0.3px] text-ink mb-3">주간 연습량</h3>
          <div className="flex items-end gap-1 h-24 group">
            {stats.weekly_swings.map((week, idx) => {
              const max = Math.max(...stats.weekly_swings.map((w) => w.count), 1);
              const height = (week.count / max) * 100;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center gap-1 group/bar cursor-pointer"
                >
                  <div
                    className="w-full bg-ink/15 rounded-t transition-all duration-300 hover:bg-ink/30"
                    style={{ height: `${Math.max(height, 4)}%` }}
                    title={`${week.week}: ${week.count}회`}
                  >
                    <div
                      className="w-full bg-ink rounded-t transition-all duration-300 group-hover/bar:shadow-card"
                      style={{ height: '100%' }}
                    />
                  </div>
                  <span className="text-[8px] text-ink-4 group-hover/bar:font-semibold transition-all">
                    {week.week}
                  </span>
                  <span className="text-[7px] text-ink-4 opacity-0 group-hover/bar:opacity-100 transition-opacity">
                    {week.count}회
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Position Trend */}
      {stats.position_trends.length > 0 && (
        <div className="bg-card border border-border rounded-2xl shadow-card p-4 mb-4">
          <h3 className="text-sm font-bold tracking-[-0.3px] text-ink mb-3">포지션별 변화</h3>
          <div className="space-y-2">
            {stats.position_trends.map((pt) => (
              <div key={pt.position} className="flex items-center gap-3">
                <span className="text-xs font-medium text-ink-3 w-8">{pt.position}</span>
                <div className="flex-1 h-2 bg-warm rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      pt.trend === 'improving' ? 'bg-calm' :
                      pt.trend === 'stable' ? 'bg-ink' : 'bg-caution'
                    )}
                    style={{ width: `${pt.recent_score}%` }}
                  />
                </div>
                <TrendIcon trend={pt.trend} />
                <span className="text-[10px] text-ink-4 w-8 text-right">
                  {pt.recent_score}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most Common Errors with Deep Links */}
      {stats.most_common_errors.length > 0 && (
        <div className="bg-card border border-border rounded-2xl shadow-card p-4 mb-4 animate-fade-in">
          <h3 className="text-sm font-bold tracking-[-0.3px] text-ink mb-3">자주 나타나는 패턴</h3>
          <div className="space-y-2">
            {stats.most_common_errors.slice(0, 5).map((ep, idx) => (
              <button
                key={`${ep.code}-${idx}`}
                type="button"
                onClick={() => {
                  if (ep.id) {
                    router.push(`/swingbook?error=${ep.code}`);
                  }
                }}
                className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-dawn transition-colors duration-200"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-[10px] bg-warm text-ink-4 px-1.5 py-0.5 rounded font-mono shrink-0">
                    {ep.code}
                  </span>
                  <span className="text-xs text-ink-3 truncate">{ep.name}</span>
                </div>
                <span className="text-xs font-medium text-ink shrink-0 ml-2">{ep.count}회</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Reports */}
      {stats.recent_reports.length > 0 && (
        <div className="mb-4 animate-fade-in">
          <h3 className="text-sm font-bold tracking-[-0.3px] text-ink mb-3">최근 레슨 리포트</h3>
          <div className="space-y-2">
            {stats.recent_reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => router.push(`/my-reports/${report.id}`)}
                className="bg-card border border-border rounded-2xl shadow-card p-3 w-full text-left flex items-center justify-between hover:border-ink-4 transition-all duration-200 transform hover:scale-102"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{report.title}</p>
                  <p className="text-[10px] text-ink-4">
                    {report.pro_name} · {new Date(report.date).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <ChevronIcon className="w-4 h-4 text-ink-4 shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 bg-ink/40 animate-fade-in flex items-center justify-center p-5">
          <div className="bg-card border border-border rounded-2xl shadow-card p-6 w-full max-w-sm animate-scale-in">
            <h3 className="text-lg font-extrabold tracking-[-0.4px] text-ink mb-4">주간 목표 설정</h3>
            <div className="mb-4">
              <label className="text-sm text-ink-3 mb-2 block">
                목표 스윙 횟수
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={weeklyGoal}
                onChange={(e) => setWeeklyGoal(parseInt(e.target.value) || 0)}
                className="w-full text-center text-lg px-3.5 py-2.5 rounded-xl border border-border bg-card text-ink outline-none focus:border-ink-4"
                placeholder="목표 횟수 입력"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowGoalModal(false)}
                className="flex-1 text-sm py-3 rounded-xl border-[1.5px] border-border bg-transparent text-ink font-semibold"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSetGoal}
                disabled={!weeklyGoal}
                className="flex-1 text-sm py-3 rounded-xl bg-ink text-dawn font-semibold disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  suffix = '',
  color = 'text-ink',
  change,
}: {
  label: string;
  value: number;
  suffix?: string;
  color?: string;
  change?: number;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-card p-2 text-center hover:shadow-score transition-shadow duration-200">
      <div className="flex items-baseline justify-center gap-1">
        <p className={cn('text-base font-bold', color)}>
          {value}{suffix}
        </p>
        {change !== undefined && change !== 0 && (
          <p className={cn(
            'text-[9px] font-semibold',
            change > 0 ? 'text-calm' : 'text-caution'
          )}>
            {change > 0 ? '↑' : '↓'}{Math.abs(change)}
          </p>
        )}
      </div>
      <p className="text-[9px] text-ink-4">{label}</p>
    </div>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'improving') {
    return (
      <svg className="w-3 h-3 text-calm" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4l-8 8h5v8h6v-8h5z" />
      </svg>
    );
  }
  if (trend === 'declining') {
    return (
      <svg className="w-3 h-3 text-caution" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 20l8-8h-5V4h-6v8H4z" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3 text-ink-4" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="10" width="16" height="4" rx="1" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="9,6 15,12 9,18" />
    </svg>
  );
}
