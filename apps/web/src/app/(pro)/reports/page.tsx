/**
 * Pro Reports List Page
 *
 * Shows all reports for the pro, filterable by member.
 * Supports pipeline status indicators via Realtime.
 *
 * @page /reports
 * @feature F-001, F-002
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useReportPipelineUpdates } from '@/hooks/use-realtime';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

interface ReportListItem {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'read';
  created_at: string;
  published_at: string | null;
  error_tags: string[];
  member_profiles?: { display_name: string };
}

export default function ProReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const memberFilter = searchParams.get('member');

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'published'>('all');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (memberFilter) params.set('member_id', memberFilter);

      const res = await fetch(`/api/voice-memos?with_reports=true&${params.toString()}`);
      if (res.ok) {
        const { data } = await res.json();
        setReports(data ?? []);
      } else {
        logger.error('Failed to fetch reports', { status: res.status });
      }
    } catch (err) {
      logger.error('Failed to fetch reports', { error: err });
    } finally {
      setLoading(false);
    }
  }, [memberFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Realtime: refresh when a report completes pipeline
  useReportPipelineUpdates((data) => {
    logger.info('Pipeline update received', data);
    fetchReports();
  });

  const filteredReports = reports.filter((r) => {
    if (activeTab === 'all') return true;
    return r.status === activeTab;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="리포트 불러오는 중..." />
      </div>
    );
  }

  return (
    <div className="px-5 pt-safe-top">
      <header className="pt-4 pb-4">
        <h1 className="text-xl font-bold text-text-primary">리포트</h1>
      </header>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'draft', 'published'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-text-secondary'
            )}
          >
            {tab === 'all' ? '전체' : tab === 'draft' ? '초안' : '전송됨'}
          </button>
        ))}
      </div>

      {/* Report List */}
      {filteredReports.length === 0 ? (
        <EmptyState
          title="리포트가 없습니다"
          description="음성 메모를 녹음하면 AI가 자동으로 리포트를 생성합니다."
        />
      ) : (
        <div className="space-y-2">
          {filteredReports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => router.push(`/reports/${report.id}`)}
              className="w-full card p-4 text-left hover:border-brand-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  report.status === 'draft' && 'bg-gray-100 text-gray-600',
                  report.status === 'published' && 'bg-brand-primary/10 text-brand-primary',
                  report.status === 'read' && 'bg-status-success/10 text-status-success'
                )}>
                  {report.status === 'draft' ? '초안' : report.status === 'published' ? '전송됨' : '읽음'}
                </span>
                <span className="text-xs text-text-tertiary">
                  {formatRelativeTime(report.created_at)}
                </span>
              </div>
              <h3 className="text-sm font-medium text-text-primary truncate">
                {report.title || '(제목 없음)'}
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {report.member_profiles?.display_name || '(회원 정보 없음)'}
              </p>
              {report.error_tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {report.error_tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  {report.error_tags.length > 3 && (
                    <span className="text-[10px] text-text-tertiary">
                      +{report.error_tags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
