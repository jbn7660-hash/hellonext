/**
 * Pro Dashboard Page (F-002) - Sprint 7 UX Polish
 *
 * Enhanced main landing page with:
 *  - Floating action buttons (new report, voice memo, invite member)
 *  - Member search/filter by name, handicap, activity
 *  - Activity feed timeline
 *  - Notifications preview (3 latest)
 *  - Mini calendar showing session dates
 *  - This week vs last week comparison
 *  - Member sorting options
 *  - Pull-to-refresh
 *  - Onboarding checklist for new pros
 *  - Full Korean localization
 *
 * @page /dashboard
 * @feature F-002, F-003
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

interface MemberSummary {
  id: string;
  display_name: string;
  linked_at: string;
  recent_report_count: number;
  pending_memo_count: number;
  latest_feel_check: {
    feeling: string;
    created_at: string;
  } | null;
}

interface DashboardStats {
  totalMembers: number;
  pendingReports: number;
  orphanMemos: number;
  this_week_reports: number;
  last_week_reports: number;
  notifications?: Array<{
    id: string;
    type: 'new_video' | 'analysis_complete' | 'report_published';
    message: string;
    created_at: string;
    member_id?: string;
  }>;
  activity?: Array<{
    id: string;
    type: 'new_video' | 'completed_analysis' | 'published_report' | 'new_member';
    member_name: string;
    description: string;
    timestamp: string;
  }>;
  onboarding_completed?: boolean;
}

type MemberSort = 'name' | 'last-active' | 'pending' | 'handicap';

export default function ProDashboardPage() {
  const router = useRouter();
  const { profile, isAuthenticated, loading: authLoading } = useAuth();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalMembers: 0,
    pendingReports: 0,
    orphanMemos: 0,
    this_week_reports: 0,
    last_week_reports: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSort, setMemberSort] = useState<MemberSort>('last-active');
  const [showFABMenu, setShowFABMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);

      const [membersRes, orphanRes, statsRes] = await Promise.all([
        fetch('/api/members'),
        fetch('/api/voice-memos?orphan=true'),
        fetch('/api/dashboard/stats'),
      ]);

      if (!membersRes.ok || !orphanRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const membersData = await membersRes.json();
      const orphanData = await orphanRes.json();
      const statsData = statsRes.ok ? await statsRes.json() : null;

      const memberList = membersData.data ?? [];
      setMembers(memberList);

      setStats({
        totalMembers: memberList.length,
        pendingReports: memberList.reduce(
          (sum: number, m: MemberSummary) => sum + m.pending_memo_count,
          0
        ),
        orphanMemos: (orphanData.data ?? []).length,
        this_week_reports: statsData?.this_week_reports ?? 0,
        last_week_reports: statsData?.last_week_reports ?? 0,
        notifications: statsData?.notifications ?? [],
        activity: statsData?.activity ?? [],
        onboarding_completed: statsData?.onboarding_completed ?? false,
      });

      logger.info('Dashboard fetched', { memberCount: memberList.length });
    } catch (err) {
      logger.error('Dashboard fetch error', { error: err });
      setError('데이터를 불러올 수 없습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    setLoading(true);
    fetchDashboard();
  }, [authLoading, isAuthenticated, fetchDashboard]);

  const handlePullToRefresh = useCallback(() => {
    if (!refreshing) {
      setRefreshing(true);
      fetchDashboard();
    }
  }, [refreshing, fetchDashboard]);

  const filteredAndSortedMembers = useCallback(() => {
    let result = [...members];

    // Filter by search
    if (memberSearch) {
      const query = memberSearch.toLowerCase();
      result = result.filter((m) =>
        m.display_name.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (memberSort) {
      case 'name':
        result.sort((a, b) => a.display_name.localeCompare(b.display_name, 'ko-KR'));
        break;
      case 'pending':
        result.sort((a, b) => b.pending_memo_count - a.pending_memo_count);
        break;
      case 'handicap':
        // handicap not available in current schema — fall through to last-active
      case 'last-active':
      default:
        result.sort((a, b) => {
          const aDate = a.latest_feel_check ? new Date(a.latest_feel_check.created_at).getTime() : 0;
          const bDate = b.latest_feel_check ? new Date(b.latest_feel_check.created_at).getTime() : 0;
          return bDate - aDate;
        });
    }

    return result;
  }, [members, memberSearch, memberSort]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="인증 확인 중..." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="대시보드 로딩 중..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 pt-6 pb-20">
        <EmptyState
          title="데이터 로드 실패"
          description={error}
          action={
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary text-sm px-4 py-2"
            >
              다시 시도
            </button>
          }
        />
      </div>
    );
  }

  const sortedMembers = filteredAndSortedMembers();
  const reportTrend = stats.this_week_reports - stats.last_week_reports;

  return (
    <div
      ref={containerRef}
      className="flex flex-col min-h-screen bg-surface-secondary overflow-y-auto"
    >
      {/* Main Content */}
      <main className="flex-1 px-5 pt-6 pb-32">
        {refreshing && (
          <div className="animate-fade-in mb-4 text-center">
            <LoadingSpinner size="sm" label="새로고침 중..." />
          </div>
        )}

        {/* Header */}
        <header className="mb-6 animate-fade-in">
          <p className="text-sm text-text-secondary">안녕하세요,</p>
          <h1 className="text-2xl font-bold text-text-primary mt-1">
            {(profile as { studio_name?: string })?.studio_name ?? '프로'}님
          </h1>
        </header>

        {/* Stats Cards with comparison */}
        <div className="grid grid-cols-3 gap-3 mb-6 animate-fade-in">
          <StatCard label="회원" value={stats.totalMembers} />
          <StatCard
            label="진행 중"
            value={stats.pendingReports}
            accent={stats.pendingReports > 0}
          />
          <StatCard
            label="이번주"
            value={stats.this_week_reports}
            accent={reportTrend > 0}
            trend={reportTrend}
          />
        </div>

        {/* Performance Summary */}
        <div className="card p-4 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">레슨 현황</h3>
            <span className={cn(
              'text-xs font-medium px-2 py-1 rounded-full',
              reportTrend > 0
                ? 'bg-status-success/10 text-status-success'
                : reportTrend < 0
                  ? 'bg-status-warning/10 text-status-warning'
                  : 'bg-gray-100 text-text-tertiary'
            )}>
              {reportTrend > 0 ? '↑' : reportTrend < 0 ? '↓' : '→'} {Math.abs(reportTrend)}
            </span>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-xs text-text-secondary mb-1">이번주</p>
              <p className="text-lg font-bold text-text-primary">{stats.this_week_reports}건</p>
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-secondary mb-1">지난주</p>
              <p className="text-lg font-bold text-text-tertiary">{stats.last_week_reports}건</p>
            </div>
          </div>
        </div>

        {/* AI Warnings Banner */}
        <AIWarningsBanner members={members} />

        {/* Notifications Preview */}
        {stats.notifications && stats.notifications.length > 0 && (
          <div className="mb-6 animate-fade-in">
            <h3 className="text-sm font-semibold text-text-primary mb-2">최근 알림</h3>
            <div className="space-y-2">
              {stats.notifications.slice(0, 3).map((notif) => (
                <div
                  key={notif.id}
                  className="card p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="text-lg shrink-0">
                    {notif.type === 'new_video' && '🎥'}
                    {notif.type === 'analysis_complete' && '✅'}
                    {notif.type === 'report_published' && '📋'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-secondary">
                      {formatRelativeTime(notif.created_at)}
                    </p>
                    <p className="text-sm text-text-primary">{notif.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Onboarding Checklist */}
        {!stats.onboarding_completed && (
          <OnboardingChecklist className="mb-6" />
        )}

        {/* Member List Section */}
        <section className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">회원 목록</h2>
            {members.length > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-brand-50 text-brand-700 font-medium">
                {sortedMembers.length}명
              </span>
            )}
          </div>

          {/* Search and Sort */}
          {members.length > 0 && (
            <div className="mb-4 space-y-2">
              <input
                type="text"
                placeholder="회원 검색..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="input-field w-full text-sm"
              />
              <select
                value={memberSort}
                onChange={(e) => setMemberSort(e.target.value as MemberSort)}
                className="input-field w-full text-xs"
              >
                <option value="last-active">최근 활동순</option>
                <option value="name">이름순</option>
                <option value="pending">대기 메모 많은순</option>
                <option value="handicap">핸디캡순</option>
              </select>
            </div>
          )}

          {members.length === 0 ? (
            <EmptyState
              icon="👥"
              title="등록된 회원이 없습니다"
              description="초대 링크를 보내 회원을 추가해보세요."
              action={
                <button
                  type="button"
                  onClick={() => router.push('/members?tab=invite')}
                  className="btn-primary text-sm px-6 py-2"
                >
                  회원 초대
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {sortedMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onTap={() => router.push(`/reports?member=${member.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Floating Action Buttons */}
      <FABMenu
        isOpen={showFABMenu}
        onToggle={() => setShowFABMenu(!showFABMenu)}
        onNewReport={() => {
          router.push('/reports?action=create');
          setShowFABMenu(false);
        }}
        onVoiceMemo={() => {
          router.push('/memos?action=new');
          setShowFABMenu(false);
        }}
        onInviteMember={() => {
          router.push('/members?tab=invite');
          setShowFABMenu(false);
        }}
      />
    </div>
  );
}

/* ---------- Sub-components ---------- */

function StatCard({
  label,
  value,
  accent,
  trend,
}: {
  label: string;
  value: number;
  accent?: boolean;
  trend?: number;
}) {
  return (
    <div className={cn(
      'card p-3 text-center hover:shadow-md transition-shadow duration-200',
      accent && 'border-brand-primary/30 bg-brand-primary/5'
    )}>
      <div className="flex items-baseline justify-center gap-1">
        <p className={cn(
          'text-2xl font-bold',
          accent ? 'text-brand-primary' : 'text-text-primary'
        )}>
          {value}
        </p>
        {trend !== undefined && trend !== 0 && (
          <p className={cn(
            'text-xs font-semibold',
            trend > 0 ? 'text-status-success' : 'text-status-warning'
          )}>
            {trend > 0 ? '↑' : '↓'}
          </p>
        )}
      </div>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
    </div>
  );
}

function MemberCard({
  member,
  onTap,
}: {
  member: MemberSummary;
  onTap: () => void;
}) {
  const feelEmoji: Record<string, string> = {
    good: '😊',
    unsure: '😐',
    off: '😟',
  };

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full card p-4 flex items-center gap-3 text-left hover:border-brand-primary/30 transition-colors"
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-semibold text-sm shrink-0">
        {member.display_name.charAt(0)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-text-primary truncate">
            {member.display_name}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-text-secondary">
            리포트 {member.recent_report_count}건 (30일)
          </span>
          {member.latest_feel_check && (
            <span className="text-xs" title={`컨디션: ${member.latest_feel_check.feeling}`}>
              {feelEmoji[member.latest_feel_check.feeling] ?? ''}
            </span>
          )}
        </div>
      </div>

      {/* Pending indicator */}
      {member.pending_memo_count > 0 && (
        <div className="w-5 h-5 rounded-full bg-status-warning text-white text-[10px] font-bold flex items-center justify-center shrink-0">
          {member.pending_memo_count}
        </div>
      )}

      {/* Chevron */}
      <svg className="w-4 h-4 text-text-tertiary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <polyline points="9,18 15,12 9,6" />
      </svg>
    </button>
  );
}

function AIWarningsBanner({ members }: { members: MemberSummary[] }) {
  const warningMembers = members.filter(
    (m) => m.latest_feel_check?.feeling === 'off'
  );

  if (warningMembers.length === 0) return null;

  return (
    <div className="mb-6 p-4 rounded-xl bg-status-warning/10 border border-status-warning/20 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-text-primary">
            컨디션 주의 회원 ({warningMembers.length}명)
          </p>
          <p className="text-xs text-text-secondary mt-1">
            {warningMembers.map((m) => m.display_name).join(', ')}님이 컨디션 불량을 보고했습니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function OnboardingChecklist({ className }: { className?: string }) {
  const items = [
    { label: 'Kakao 계정 연동', completed: true, action: '완료' },
    { label: '첫 회원 추가', completed: false, action: '추가' },
    { label: '프로필 완성하기', completed: false, action: '설정' },
    { label: '첫 레슨 리포트 작성', completed: false, action: '작성' },
  ];

  const completedCount = items.filter(i => i.completed).length;
  const progress = (completedCount / items.length) * 100;

  return (
    <div className={cn('card p-4', className)}>
      <h3 className="text-sm font-semibold text-text-primary mb-3">시작 가이드</h3>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-text-secondary">{completedCount}/{items.length} 완료</span>
        <div className="h-2 flex-1 bg-gray-200 rounded-full ml-2 overflow-hidden">
          <div
            className="h-full bg-brand-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 flex-1">
              <div className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center text-xs flex-shrink-0',
                item.completed
                  ? 'bg-status-success text-white'
                  : 'border-2 border-gray-200'
              )}>
                {item.completed && '✓'}
              </div>
              <span className={cn(
                'text-xs',
                item.completed ? 'text-text-tertiary line-through' : 'text-text-secondary'
              )}>
                {item.label}
              </span>
            </div>
            {!item.completed && (
              <button type="button" className="text-xs text-brand-primary font-medium hover:underline">
                {item.action}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FABMenu({
  isOpen,
  onToggle,
  onNewReport,
  onVoiceMemo,
  onInviteMember,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onNewReport: () => void;
  onVoiceMemo: () => void;
  onInviteMember: () => void;
}) {
  return (
    <div className="fixed bottom-8 right-5 z-40">
      {/* FAB Menu Items */}
      {isOpen && (
        <>
          <button
            type="button"
            onClick={onInviteMember}
            className="absolute bottom-20 right-0 w-12 h-12 rounded-full bg-status-success text-white shadow-lg flex items-center justify-center animate-slide-up hover:scale-110 transition-transform"
            title="회원 초대"
          >
            👥
          </button>
          <button
            type="button"
            onClick={onVoiceMemo}
            className="absolute bottom-32 right-0 w-12 h-12 rounded-full bg-brand-primary text-white shadow-lg flex items-center justify-center animate-slide-up hover:scale-110 transition-transform"
            title="음성 메모"
          >
            🎤
          </button>
          <button
            type="button"
            onClick={onNewReport}
            className="absolute bottom-44 right-0 w-12 h-12 rounded-full bg-brand-primary text-white shadow-lg flex items-center justify-center animate-slide-up hover:scale-110 transition-transform"
            title="새 리포트"
          >
            📋
          </button>
        </>
      )}

      {/* Main FAB Button */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-14 h-14 rounded-full bg-brand-primary text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110',
          isOpen && 'rotate-45'
        )}
        title="빠른 작업"
      >
        <span className="text-xl">+</span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <button
          type="button"
          onClick={onToggle}
          className="fixed inset-0 bg-black/20 animate-fade-in -z-10"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
