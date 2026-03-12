/**
 * OrphanMemoSheet — Bottom Sheet for Mapping Orphan Memos to Members
 *
 * When a pro records a voice memo without pre-selecting a member,
 * it becomes an "orphan memo" (F-003). This sheet lets the pro:
 *  1. See all orphan memos
 *  2. Select a member to assign each memo to
 *  3. Trigger the AI pipeline after assignment
 *
 * @module components/voice/orphan-memo-sheet
 * @feature F-003
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDuration, formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';
import { useAuth } from '@/hooks/use-auth';

interface OrphanMemo {
  id: string;
  created_at: string;
  duration_sec: number;
  status: string;
  transcript: string | null;
}

interface MemberOption {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface OrphanMemoSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onMemoAssigned?: (memoId: string, memberId: string) => void;
}

export function OrphanMemoSheet({ isOpen, onClose, onMemoAssigned }: OrphanMemoSheetProps) {
  const { user } = useAuth();
  const [memos, setMemos] = useState<OrphanMemo[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedMemo, setSelectedMemo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch orphan memos + members list
  useEffect(() => {
    if (!isOpen || !user) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [memosRes, membersRes] = await Promise.all([
          fetch('/api/voice-memos?orphan=true'),
          fetch('/api/members'),
        ]);

        if (!memosRes.ok) {
          throw new Error('고아 메모를 불러올 수 없습니다.');
        }

        if (!membersRes.ok) {
          throw new Error('회원 목록을 불러올 수 없습니다.');
        }

        const { data: memosData } = await memosRes.json();
        const { data: membersData } = await membersRes.json();

        setMemos(memosData ?? []);
        setMembers(membersData ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : '데이터 불러오기 실패';
        setError(message);
        logger.error('Failed to fetch orphan memo data', { error: err });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, user]);

  const handleAssign = useCallback(
    async (memoId: string, memberId: string) => {
      setAssigningId(memoId);
      setError(null);
      try {
        const res = await fetch(`/api/voice-memos/${memoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: memberId }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? '회원 지정에 실패했습니다.');
        }

        // Remove from orphan list
        setMemos((prev) => prev.filter((m) => m.id !== memoId));
        setSelectedMemo(null);
        onMemoAssigned?.(memoId, memberId);

        logger.info('Orphan memo assigned', { memoId, memberId });
      } catch (err) {
        const message = err instanceof Error ? err.message : '회원 지정에 실패했습니다.';
        setError(message);
        logger.error('Failed to assign orphan memo', { error: err });
      } finally {
        setAssigningId(null);
      }
    },
    [onMemoAssigned]
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`고아 메모 (${memos.length})`}
      snapPoint={75}
    >
      {error && (
        <div className="bg-status-error/10 text-status-error text-sm px-4 py-2 rounded-lg mb-4">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="float-right underline text-xs"
          >
            닫기
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSpinner size="md" label="메모 불러오는 중..." className="py-12" />
      ) : memos.length === 0 ? (
        <EmptyState
          title="고아 메모가 없습니다"
          description="회원을 지정하지 않고 녹음한 메모가 여기에 표시됩니다."
        />
      ) : (
        <div className="space-y-3">
          {memos.map((memo) => (
            <div
              key={memo.id}
              className={cn(
                'border rounded-xl p-4 transition-colors',
                selectedMemo === memo.id
                  ? 'border-brand-primary bg-brand-primary/5'
                  : 'border-gray-200'
              )}
            >
              {/* Memo info */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {formatDuration(memo.duration_sec)}
                  </span>
                  <StatusBadge status={memo.status} />
                </div>
                <span className="text-xs text-text-tertiary">
                  {formatRelativeTime(memo.created_at)}
                </span>
              </div>

              {/* Transcript preview */}
              {memo.transcript && (
                <p className="text-sm text-text-secondary mb-3 line-clamp-2">
                  {memo.transcript}
                </p>
              )}

              {/* Assign action */}
              {selectedMemo === memo.id ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary font-medium">회원 선택:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {members.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        disabled={assigningId === memo.id}
                        onClick={() => handleAssign(memo.id, member.id)}
                        className={cn(
                          'text-left px-3 py-2 rounded-lg border border-gray-200',
                          'hover:border-brand-primary hover:bg-brand-primary/5',
                          'transition-colors text-sm',
                          assigningId === memo.id && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-text-secondary">
                            {member.display_name.charAt(0)}
                          </div>
                          <span className="truncate">{member.display_name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMemo(null)}
                    className="text-xs text-text-tertiary underline mt-1"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedMemo(memo.id)}
                  className="text-sm text-brand-primary font-medium"
                >
                  회원 지정하기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    recording: { label: '녹음 중', className: 'bg-status-error/10 text-status-error' },
    transcribing: { label: '변환 중', className: 'bg-status-warning/10 text-status-warning' },
    structuring: { label: '분석 중', className: 'bg-brand-primary/10 text-brand-primary' },
    draft: { label: '완료', className: 'bg-status-success/10 text-status-success' },
    failed: { label: '실패', className: 'bg-status-error/10 text-status-error' },
  };

  const { label, className } = config[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', className)}>
      {label}
    </span>
  );
}
