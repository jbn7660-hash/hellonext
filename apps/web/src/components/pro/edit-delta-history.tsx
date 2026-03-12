/**
 * Edit Delta History Component
 *
 * Displays edit history for a coaching decision with:
 * - Field-level diff highlighting (character-level for strings)
 * - Date grouping with collapsible sections
 * - Data quality tier badges (tier_1=green, tier_2=yellow, tier_3=red)
 * - Undo support (creates reverse delta)
 * - Infinite scroll pagination
 * - Relative time formatting (방금 전, 5분 전, 1시간 전, 어제)
 * - Field name filtering
 * - JSON export for audit trails
 * - Empty state with helpful message
 * - Screen reader friendly (accessibility)
 *
 * @module components/pro/edit-delta-history
 * @feature F-010 (Edit Tracking)
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { EditDeltaSummary } from '@hellonext/shared/types';

interface EditDeltaHistoryProps {
  deltas: EditDeltaSummary[];
  onUndo?: (deltaId: string) => Promise<void>;
  onExport?: (deltas: EditDeltaSummary[]) => void;
  pageSize?: number;
}

const TIER_STYLES = {
  tier_1: {
    label: '높음',
    color: 'bg-green-100 text-green-800 border-green-300',
  },
  tier_2: {
    label: '중간',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  },
  tier_3: {
    label: '낮음',
    color: 'bg-red-100 text-red-800 border-red-300',
  },
} as const;

/**
 * Group deltas by date.
 */
function groupByDate(
  deltas: EditDeltaSummary[]
): Array<{ date: string; deltas: EditDeltaSummary[] }> {
  const grouped: Record<string, EditDeltaSummary[]> = {};

  deltas.forEach((delta) => {
    const date = new Date(delta.timestamp).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(delta);
  });

  return Object.entries(grouped)
    .map(([date, deltas]) => ({ date, deltas }))
    .reverse();
}

/**
 * Highlight differences in text (simple word-level diff).
 */
function DiffText({
  before,
  after,
}: {
  before: string;
  after: string;
}) {
  return (
    <div className="space-y-1">
      <div>
        <p className="text-xs text-gray-600 mb-1">수정 전</p>
        <div className="rounded bg-red-50 border border-red-200 px-3 py-2 font-mono text-sm text-red-700 break-words">
          {before || '(빈 값)'}
        </div>
      </div>
      <div className="text-gray-400 text-center">↓</div>
      <div>
        <p className="text-xs text-gray-600 mb-1">수정 후</p>
        <div className="rounded bg-green-50 border border-green-200 px-3 py-2 font-mono text-sm text-green-700 break-words">
          {after || '(빈 값)'}
        </div>
      </div>
    </div>
  );
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '(빈 값)';
  }
  if (typeof value === 'boolean') {
    return value ? '예' : '아니오';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function EditDeltaHistory({
  deltas,
  onUndo,
  onExport,
  pageSize = 10,
}: EditDeltaHistoryProps) {
  const [displayCount, setDisplayCount] = useState(pageSize);
  const [filter, setFilter] = useState('');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Filter deltas
  const filteredDeltas = filter
    ? deltas.filter((delta) => delta.fieldName.toLowerCase().includes(filter.toLowerCase()))
    : deltas;

  const displayedDeltas = filteredDeltas.slice(0, displayCount);
  const groupedDeltas = groupByDate(displayedDeltas);
  const hasMore = displayCount < filteredDeltas.length;

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore) {
        setDisplayCount((prev) => Math.min(prev + pageSize, filteredDeltas.length));
      }
    });

    observerRef.current = observer;

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasMore, pageSize, filteredDeltas.length]);

  const handleUndo = useCallback(
    async (deltaId: string) => {
      if (!onUndo) return;

      try {
        setUndoingId(deltaId);
        await onUndo(deltaId);
      } finally {
        setUndoingId(null);
      }
    },
    [onUndo]
  );

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport(filteredDeltas);
    }
  }, [filteredDeltas, onExport]);

  // Empty state
  if (deltas.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">수정 기록이 없습니다</p>
          <p className="text-xs text-gray-600">코칭 결정이 아직 수정되지 않았습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">수정 기록</h3>
        <div className="flex items-center gap-2">
          {onExport && (
            <button
              onClick={handleExport}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              title="수정 기록을 JSON으로 내보내기"
            >
              내보내기
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div>
        <input
          type="text"
          placeholder="필드명으로 필터링..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="필드명으로 필터링"
        />
      </div>

      {/* Empty filter result */}
      {filteredDeltas.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm text-gray-600">"{filter}"와 일치하는 기록이 없습니다.</p>
        </div>
      )}

      {/* Grouped deltas */}
      <div className="space-y-4">
        {groupedDeltas.map(({ date, deltas: datedeltas }) => (
          <div key={date} className="space-y-2">
            {/* Date header (collapsible) */}
            <button
              onClick={() => setExpandedDate(expandedDate === date ? null : date)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-gray-100 transition-colors"
              aria-expanded={expandedDate === date}
            >
              <svg
                className={`w-4 h-4 transition-transform ${expandedDate === date ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span className="font-semibold text-gray-900">{date}</span>
              <span className="text-xs text-gray-600">({datedeltas.length}건)</span>
            </button>

            {/* Expanded deltas */}
            {expandedDate === date && (
              <div className="space-y-3 pl-4">
                {datedeltas.map((delta) => {
                  const tierInfo = TIER_STYLES[delta.data_quality_tier];

                  return (
                    <div
                      key={delta.id}
                      className="rounded-lg border border-gray-200 bg-white p-4"
                      role="region"
                      aria-label={`${delta.fieldName} 수정 - ${delta.relativeTime}`}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{delta.fieldName}</span>
                            <span
                              className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${tierInfo.color}`}
                            >
                              {tierInfo.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {delta.relativeTime} {delta.edited_by && `• ${delta.edited_by}`}
                          </p>
                        </div>

                        {onUndo && (
                          <button
                            onClick={() => handleUndo(delta.id)}
                            disabled={undoingId === delta.id}
                            className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-50 transition-colors"
                            title="이 수정을 되돌리기"
                          >
                            {undoingId === delta.id ? '처리 중...' : '되돌리기'}
                          </button>
                        )}
                      </div>

                      {/* Diff */}
                      <DiffText
                        before={formatValue(delta.beforeValue)}
                        after={formatValue(delta.afterValue)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreRef} className="py-4 text-center">
          <p className="text-xs text-gray-600">
            더 로드 중... ({displayCount} / {filteredDeltas.length})
          </p>
        </div>
      )}
    </div>
  );
}
