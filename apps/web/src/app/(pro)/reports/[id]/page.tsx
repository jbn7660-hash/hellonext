/**
 * Pro Report Detail Page
 *
 * Shows full report content with edit + publish actions.
 * Uses Realtime to update when pipeline completes.
 *
 * @page /reports/[id]
 * @feature F-001
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReportViewer } from '@/components/report/report-viewer';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { logger } from '@/lib/utils/logger';

export default function ProReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      if (!reportId) return;

      try {
        const res = await fetch(`/api/reports/${reportId}`);
        if (res.ok) {
          const { data } = await res.json();
          setReport(data);
        } else if (res.status === 404) {
          logger.warn('Report not found', { reportId });
        } else {
          logger.error('Report fetch failed', { reportId, status: res.status });
        }
      } catch (err) {
        logger.error('Report fetch error', { reportId, error: err });
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [reportId]);

  const handleEdit = useCallback(
    async (field: string, value: unknown) => {
      try {
        const res = await fetch(`/api/reports/${reportId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });

        if (res.ok) {
          const { data } = await res.json();
          setReport(data);
          logger.info('Report field updated', { reportId, field });
        } else {
          logger.error('Report edit failed', { reportId, status: res.status });
        }
      } catch (err) {
        logger.error('Report edit failed', { reportId, field, error: err });
      }
    },
    [reportId]
  );

  const handlePublish = useCallback(async () => {
    // Confirm before publishing
    if (!confirm('리포트를 회원에게 전송하시겠습니까?')) {
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/publish`, {
        method: 'POST',
      });

      if (res.ok) {
        const { report_id } = await res.json();
        setReport((prev) => prev ? { ...prev, status: 'published', published_at: new Date().toISOString() } : prev);
        logger.info('Report published', { reportId: report_id });
      } else {
        logger.error('Report publish failed', { reportId, status: res.status });
      }
    } catch (err) {
      logger.error('Report publish failed', { reportId, error: err });
    } finally {
      setPublishing(false);
    }
  }, [reportId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="리포트 로딩 중..." />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-text-secondary mb-4">리포트를 찾을 수 없습니다</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-brand-primary"
          >
            뒤로 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-safe-top pb-24">
      {/* Back button */}
      <div className="pt-4 pb-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-text-secondary"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="15,18 9,12 15,6" />
          </svg>
          돌아가기
        </button>
      </div>

      <ReportViewer
        report={report as any}
        mode="pro"
        onEdit={handleEdit}
        onPublish={report?.status === 'draft' ? handlePublish : undefined}
      />

      {publishing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl">
            <LoadingSpinner size="md" label="전송 중..." />
          </div>
        </div>
      )}
    </div>
  );
}
