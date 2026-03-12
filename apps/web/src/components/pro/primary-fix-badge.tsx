/**
 * Primary Fix Badge Component
 *
 * Enhanced badge displaying the primary fix recommendation with:
 * - Expandable causal path view
 * - Data quality tier indicator
 * - Confidence visualization
 * - Pulse animation for high confidence (IIS > 0.8)
 * - Rank comparison (e.g., "1st of 5 candidates")
 * - Icon based on error pattern
 * - Detailed tooltip with Korean labels
 * - Loading skeleton support
 * - No-fix state handling
 *
 * @module components/pro/primary-fix-badge
 * @feature F-015
 */

'use client';

import { useState } from 'react';
import type { IISResult } from '@hellonext/shared/types';

interface PrimaryFixBadgeProps {
  result: IISResult | null;
  rank?: number;
  totalCandidates?: number;
  causalPath?: string[];
  loading?: boolean;
  className?: string;
}

interface TierBadgeProps {
  tier: 'tier_1' | 'tier_2' | 'tier_3';
}

const TIER_LABELS = {
  tier_1: { label: '높음', color: 'bg-green-100 text-green-800 border-green-300' },
  tier_2: { label: '중간', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  tier_3: { label: '낮음', color: 'bg-red-100 text-red-800 border-red-300' },
} as const;

function TierBadge({ tier }: TierBadgeProps) {
  const tierInfo = TIER_LABELS[tier];
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${tierInfo.color}`}>
      데이터 품질: {tierInfo.label}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-red-200" />
        <div className="h-3 w-48 animate-pulse rounded bg-red-200" />
        <div className="flex items-end justify-between gap-4">
          <div className="h-3 w-24 animate-pulse rounded bg-red-200" />
          <div className="h-8 w-16 animate-pulse rounded bg-red-200" />
        </div>
      </div>
    </div>
  );
}

function NoFixState() {
  return (
    <div className="rounded-lg border-2 border-gray-300 bg-gray-50 p-4">
      <div className="text-center">
        <p className="font-semibold text-gray-700">기본 수정 대상이 없습니다</p>
        <p className="mt-1 text-sm text-gray-600">데이터가 부족하여 권장 사항을 생성할 수 없습니다.</p>
      </div>
    </div>
  );
}

export function PrimaryFixBadge({
  result,
  rank = 1,
  totalCandidates = 1,
  causalPath = [],
  loading = false,
  className = '',
}: PrimaryFixBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!result) {
    return <NoFixState />;
  }

  const iisPercent = Math.round(result.score * 100);
  const confidencePercent = Math.round(result.confidence * 100);
  const shouldPulse = result.score > 0.8;
  const rankText =
    totalCandidates > 1 ? `${rank}/${totalCandidates}번째` : '유일한 후보';

  // Korean labels for tooltip
  const tooltipContent = {
    원인경로: causalPath.join(' → ') || 'N/A',
    영향점수: `${result.score.toFixed(3)} (${iisPercent}%)`,
    데이터품질: TIER_LABELS[result.dataQualityTier].label,
    신뢰도: `${confidencePercent}%`,
  };

  return (
    <div className={className}>
      <div
        className={`rounded-lg border-2 border-red-500 bg-red-50 p-4 transition-all ${
          shouldPulse ? 'animate-pulse' : ''
        }`}
        title={`원인경로: ${tooltipContent.원인경로}`}
      >
        {/* Header with expand button */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-red-900">기본 수정 권장</h3>
              <TierBadge tier={result.dataQualityTier} />
            </div>
            <p className="mt-2 text-sm text-red-800">{result.nodeId}</p>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-4 p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
            aria-expanded={expanded}
            aria-label="상세 정보 보기"
          >
            <svg
              className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>

        {/* Score and rank */}
        <div className="flex items-end justify-between gap-4 mb-3">
          <div className="space-y-1">
            <div className="text-2xl font-bold text-red-600">{iisPercent}%</div>
            <p className="text-xs text-red-600">IIS 점수</p>
          </div>

          <div className="text-right space-y-1">
            <div className="text-sm font-medium text-red-700">{rankText}</div>
            <p className="text-xs text-red-600">순위</p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-red-700">신뢰도</span>
            <span className="text-xs text-red-600">{confidencePercent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-red-200 overflow-hidden">
            <div
              className="h-full bg-red-600 rounded-full transition-all"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-red-200 space-y-3">
            {/* Causal path */}
            {causalPath.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-700 mb-2">인과 경로</p>
                <div className="flex items-center gap-1 text-sm text-red-800 bg-red-100 px-3 py-2 rounded overflow-x-auto">
                  {causalPath.map((node, idx) => (
                    <span key={idx}>
                      {node}
                      {idx < causalPath.length - 1 && <span className="mx-1 text-red-600">→</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Metrics breakdown */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-red-100 rounded p-2">
                <p className="text-xs text-red-700">정확도</p>
                <p className="text-sm font-semibold text-red-900">{result.score.toFixed(3)}</p>
              </div>
              <div className="bg-red-100 rounded p-2">
                <p className="text-xs text-red-700">순위</p>
                <p className="text-sm font-semibold text-red-900">#{result.rank}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tooltip legend */}
      <div className="mt-2 text-xs text-gray-600 space-y-1">
        <p>IIS: Integrated Impact Score (통합 영향 점수)</p>
        <p>데이터 품질: 분석 데이터의 신뢰도 등급</p>
      </div>
    </div>
  );
}
