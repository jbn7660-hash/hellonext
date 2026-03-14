/**
 * ReportViewer Component
 *
 * Renders a structured golf lesson report with advanced features:
 * - Print/PDF export with optimized layout
 * - Share functionality (copy link, text export)
 * - Automatic read receipt on member view
 * - Table-of-contents sidebar navigation
 * - Inline editing with auto-save for pros
 * - Image support in sections
 * - Accessibility: Full ARIA landmarks and semantic HTML
 * - Smooth CSS-based collapse/expand animations
 *
 * Used by both pro (editing mode) and member (read-only mode).
 *
 * @module components/report/report-viewer
 * @feature F-001
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatDuration } from '@/lib/utils/format';
import type { ReportContent, ReportSection } from '@hellonext/shared/types/report';
import { ERROR_PATTERNS } from '@hellonext/shared/constants/error-patterns';
import { SWING_POSITIONS } from '@hellonext/shared/constants/swing-positions';
import { logger } from '@/lib/utils/logger';

interface ReportData {
  id: string;
  title: string;
  content: ReportContent;
  homework: string | null;
  error_tags: string[];
  status: 'draft' | 'published' | 'read';
  created_at: string;
  published_at: string | null;
  read_at?: string | null;
  voice_memos?: {
    id: string;
    transcript: string | null;
    duration_sec: number;
  };
  pro_profiles?: {
    display_name: string;
    studio_name: string;
  };
  member_profiles?: {
    display_name: string;
  };
}

interface ReportViewerProps {
  report: ReportData;
  mode: 'pro' | 'member';
  onEdit?: (field: string, value: unknown) => void;
  onPublish?: () => void;
  onReadReceipt?: () => void;
}

interface EditingState {
  field: string | null;
  value: string;
  isSaving: boolean;
}

export function ReportViewer({ report, mode, onEdit, onPublish, onReadReceipt }: ReportViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));
  const [showTableOfContents, setShowTableOfContents] = useState(false);
  const [editingState, setEditingState] = useState<EditingState>({ field: null, value: '', isSaving: false });
  const [shareMessage, setShareMessage] = useState('');
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isPro = mode === 'pro';

  // Mark as read when member views (non-draft)
  useEffect(() => {
    if (mode === 'member' && report.status !== 'draft' && !report.read_at && onReadReceipt) {
      const timer = setTimeout(() => {
        onReadReceipt();
        logger.info('Report marked as read', { reportId: report.id });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [report.id, report.status, report.read_at, mode, onReadReceipt]);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleShare = useCallback(() => {
    const reportUrl = `${window.location.origin}/reports/${report.id}`;
    navigator.clipboard.writeText(reportUrl).then(() => {
      setShareMessage('링크가 복사되었습니다');
      setTimeout(() => setShareMessage(''), 2000);
    });
  }, [report.id]);

  const handleExportText = useCallback(() => {
    const text = [
      report.title,
      `${report.member_profiles?.display_name}님 레슨 리포트`,
      `작성일: ${formatDate(report.created_at)}`,
      '',
      report.content?.sections?.map((s) => `${s.title}\n${s.content}`).join('\n\n'),
      report.homework ? `\n숙제\n${report.homework}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${report.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const handleEditStart = useCallback(
    (field: string, currentValue: string) => {
      setEditingState({ field, value: currentValue, isSaving: false });
    },
    []
  );

  const handleEditSave = useCallback(
    (field: string, value: string) => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);

      setEditingState((prev) => ({ ...prev, isSaving: true }));

      saveDebounceRef.current = setTimeout(() => {
        if (onEdit) {
          onEdit(field, value);
          logger.info('Field auto-saved', { field });
        }
        setEditingState({ field: null, value: '', isSaving: false });
      }, 1000);
    },
    [onEdit]
  );

  const handleEditCancel = useCallback(() => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    setEditingState({ field: null, value: '', isSaving: false });
  }, []);

  // Filter sections for TOC
  const tocSections = report.content?.sections ?? [];

  return (
    <div className="flex gap-6 print:gap-0">
      {/* Table of Contents Sidebar */}
      {tocSections.length > 3 && (
        <aside
          className={cn(
            'sticky top-4 h-fit w-48 flex-shrink-0 print:hidden transition-all duration-300',
            showTableOfContents ? 'opacity-100 visible' : 'opacity-0 invisible'
          )}
          role="navigation"
          aria-label="목차"
        >
          <nav className="bg-surface-secondary rounded-lg p-4 text-sm space-y-2">
            <h3 className="font-semibold text-text-primary mb-3">목차</h3>
            {tocSections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => {
                  toggleSection(section.key);
                  const elem = document.getElementById(`section-${section.key}`);
                  elem?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="block w-full text-left text-text-secondary hover:text-brand-primary transition-colors text-xs"
              >
                {section.title}
              </button>
            ))}
          </nav>
        </aside>
      )}

      {/* Main Content */}
      <article className="flex-1 space-y-4" role="main">
        {/* Print/Share Toolbar */}
        {!isPro && (
          <div className="flex gap-2 print:hidden mb-4">
            <button
              type="button"
              onClick={handlePrint}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1"
              title="인쇄 (Ctrl+P)"
            >
              🖨️ 인쇄
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1"
              title="링크 복사"
            >
              🔗 공유
            </button>
            <button
              type="button"
              onClick={handleExportText}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1"
              title="텍스트로 내보내기"
            >
              💾 다운로드
            </button>
            {tocSections.length > 3 && (
              <button
                type="button"
                onClick={() => setShowTableOfContents(!showTableOfContents)}
                className="text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1 ml-auto"
              >
                📑 목차
              </button>
            )}
          </div>
        )}

        {shareMessage && (
          <div className="text-xs text-status-success bg-status-success/10 px-3 py-2 rounded-lg print:hidden">
            {shareMessage}
          </div>
        )}
        {/* Report Header */}
        <header className="pb-4 border-b border-gray-100 print:border-gray-300" role="banner">
          <div className="flex items-center gap-2 mb-1 print:mb-2">
            <StatusBadge status={report.status} />
            <span className="text-xs text-text-tertiary print:text-black/70">
              {formatDate(report.created_at)}
              {report.status === 'read' && report.read_at && (
                <>
                  {' · 읽음 '}{formatDate(report.read_at)}
                </>
              )}
            </span>
          </div>
          <h1 className="text-lg font-bold text-text-primary print:text-lg print:text-black">
            {report.title || '(제목 없음)'}
          </h1>
          {report.member_profiles && (
            <p className="text-sm text-text-secondary mt-1 print:text-black/70">
              {report.member_profiles.display_name}님 레슨 리포트
            </p>
          )}
          {report.pro_profiles && mode === 'member' && (
            <p className="text-sm text-text-secondary mt-0.5 print:text-black/70">
              {report.pro_profiles.display_name} 프로 · {report.pro_profiles.studio_name}
            </p>
          )}
        </header>

        {/* Report Sections */}
        {report.content?.sections && report.content.sections.length > 0 ? (
          report.content.sections.map((section) => (
            <CollapsibleSection
              key={section.key}
              sectionId={`section-${section.key}`}
              section={section}
              isExpanded={expandedSections.has(section.key)}
              onToggle={() => toggleSection(section.key)}
              isPro={isPro}
              isEditing={editingState.field === `${section.key}_content`}
              editValue={editingState.value}
              onEditStart={handleEditStart}
              onEditChange={(val) => setEditingState((prev) => ({ ...prev, value: val }))}
              onEditSave={handleEditSave}
              onEditCancel={handleEditCancel}
              isSaving={editingState.isSaving}
            />
          ))
        ) : (
          <section className="card p-4 text-center text-text-tertiary" role="status" aria-label="빈 콘텐츠">
            리포트 내용이 없습니다
          </section>
        )}

        {/* Error Pattern Tags */}
        {report.error_tags.length > 0 && (
          <section className="card p-4" role="region" aria-label="감지된 에러 패턴">
            <h2 className="text-sm font-semibold text-text-primary mb-3">감지된 에러 패턴</h2>
            <div className="flex flex-wrap gap-2">
              {report.error_tags.map((code) => {
                const pattern = ERROR_PATTERNS.find((p) => p.code === code);
                const position = pattern ? SWING_POSITIONS.find((p) => p.id === pattern.position) : null;

                return (
                  <div
                    key={code}
                    className="bg-status-error/10 text-status-error text-xs px-3 py-1.5 rounded-full print:border print:border-red-400"
                    role="status"
                    aria-label={`에러 패턴: ${pattern?.nameKo ?? code}`}
                  >
                    <span className="font-medium">{code}</span>
                    {pattern && (
                      <span className="ml-1 text-status-error/70">
                        {pattern.nameKo}
                        {position && ` (${position.nameKo})`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Homework */}
        {report.homework && (
          <section className="card p-4 border-l-4 border-brand-primary print:border-l-2 print:border-blue-400" role="region" aria-label="숙제">
            <h2 className="text-sm font-semibold text-text-primary mb-2">숙제</h2>
            {isPro && editingState.field === 'homework' ? (
              <div className="space-y-2">
                <textarea
                  value={editingState.value}
                  onChange={(e) => setEditingState((prev) => ({ ...prev, value: e.target.value }))}
                  className="w-full min-h-24 p-2 border border-gray-200 rounded text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEditSave('homework', editingState.value)}
                    disabled={editingState.isSaving}
                    className="text-xs px-3 py-1 bg-brand-primary text-white rounded hover:bg-brand-primary/90 disabled:opacity-50"
                  >
                    {editingState.isSaving ? '저장 중...' : '저장'}
                  </button>
                  <button
                    type="button"
                    onClick={handleEditCancel}
                    className="text-xs px-3 py-1 border border-gray-200 rounded hover:bg-gray-50"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-text-secondary whitespace-pre-wrap print:text-black/80">
                  {report.homework}
                </p>
                {isPro && onEdit && (
                  <button
                    type="button"
                    onClick={() => handleEditStart('homework', report.homework || '')}
                    className="text-xs text-brand-primary mt-2 hover:underline print:hidden"
                  >
                    ✎ 수정
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {/* Transcript Reference */}
        {report.voice_memos?.transcript && (
          <TranscriptSection
            transcript={report.voice_memos.transcript}
            durationSec={report.voice_memos.duration_sec}
          />
        )}

        {/* Pro Actions */}
        {isPro && report.status === 'draft' && onPublish && (
          <div className="flex gap-3 pt-4 print:hidden">
            <button
              type="button"
              onClick={onPublish}
              className="btn-primary flex-1 py-3 text-sm font-medium"
            >
              회원에게 전송
            </button>
          </div>
        )}

        {/* Published State Info */}
        {isPro && report.status === 'published' && (
          <div className="mt-6 p-4 bg-brand-primary/5 rounded-lg border border-brand-primary/20 print:border print:border-blue-300 print:bg-transparent">
            <p className="text-sm text-text-secondary print:text-black/70">
              ✓ {report.published_at ? `${formatDate(report.published_at)}에 전송됨` : '전송됨'}
            </p>
          </div>
        )}
      </article>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            background: white;
          }
          article {
            box-shadow: none;
            border: none;
          }
          .card {
            page-break-inside: avoid;
            border: 1px solid #ddd;
          }
          h1, h2, h3 {
            page-break-after: avoid;
          }
          button {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function CollapsibleSection({
  sectionId,
  section,
  isExpanded,
  onToggle,
  isPro,
  isEditing,
  editValue,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  isSaving,
}: {
  sectionId: string;
  section: ReportSection;
  isExpanded: boolean;
  onToggle: () => void;
  isPro: boolean;
  isEditing: boolean;
  editValue: string;
  onEditStart: (field: string, value: string) => void;
  onEditChange: (value: string) => void;
  onEditSave: (field: string, value: string) => void;
  onEditCancel: () => void;
  isSaving: boolean;
}) {
  const sectionIcons: Record<string, string> = {
    summary: '📝',
    error_analysis: '🔍',
    drill_recommendation: '🎯',
    progress: '📈',
    mental_note: '🧠',
  };

  const headingLevel = 2; // h2 for top-level sections
  const HeadingTag = `h${headingLevel}` as const;

  return (
    <section className="card overflow-hidden print:border" id={sectionId}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50/50 transition-colors print:hover:bg-transparent"
        aria-expanded={isExpanded}
        aria-controls={`${sectionId}-content`}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true">{sectionIcons[section.key] ?? '📋'}</span>
          <HeadingTag className="text-sm font-semibold text-text-primary print:text-black">
            {section.title}
          </HeadingTag>
        </div>
        <svg
          className={cn(
            'w-4 h-4 text-text-tertiary transition-transform duration-200 print:hidden',
            isExpanded && 'rotate-180'
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      <div
        id={`${sectionId}-content`}
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 print:max-h-full print:opacity-100'
        )}
      >
        <div className="px-4 pb-4 print:pb-2">
          {isPro && isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editValue}
                onChange={(e) => onEditChange(e.target.value)}
                className="w-full min-h-32 p-2 border border-gray-200 rounded text-sm font-mono"
                aria-label={`${section.title} 편집`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEditSave(`${section.key}_content`, editValue)}
                  disabled={isSaving}
                  className="text-xs px-3 py-1 bg-brand-primary text-white rounded hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  {isSaving ? '저장 중...' : '저장'}
                </button>
                <button
                  type="button"
                  onClick={onEditCancel}
                  className="text-xs px-3 py-1 border border-gray-200 rounded hover:bg-gray-50"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed print:text-black/80">
                {section.content}
              </div>
              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-3 space-y-1.5" role="list">
                  {section.bullets.map((bullet, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-text-secondary print:text-black/80"
                    >
                      <span className="text-brand-primary mt-0.5 print:text-black/60" aria-hidden="true">
                        •
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
              {isPro && (
                <button
                  type="button"
                  onClick={() => onEditStart(`${section.key}_content`, section.content)}
                  className="text-xs text-brand-primary mt-3 hover:underline print:hidden"
                >
                  ✎ 수정
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function TranscriptSection({
  transcript,
  durationSec,
}: {
  transcript: string;
  durationSec: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="card p-4 print:border print:border-gray-300" role="region" aria-label="원본 녹음 텍스트">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left hover:bg-gray-50/50 p-2 -m-2 print:hover:bg-transparent print:p-0 print:m-0"
        aria-expanded={isExpanded}
        aria-controls="transcript-content"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true">🎙️</span>
          <h3 className="text-sm font-semibold text-text-primary print:text-black">원본 녹음 텍스트</h3>
          <span className="text-xs text-text-tertiary print:text-black/70">{formatDuration(durationSec)}</span>
        </div>
        <span className="text-xs text-brand-primary print:hidden">
          {isExpanded ? '접기' : '펼치기'}
        </span>
      </button>

      <div
        id="transcript-content"
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 print:max-h-full print:opacity-100'
        )}
      >
        <div className="mt-3 p-3 bg-gray-50 rounded-lg print:bg-transparent print:p-0 print:mt-2">
          <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed font-mono print:text-black/70 print:font-sans">
            {transcript}
          </p>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: '초안', className: 'bg-gray-100 text-gray-600' },
    published: { label: '전송됨', className: 'bg-brand-primary/10 text-brand-primary' },
    read: { label: '읽음', className: 'bg-status-success/10 text-status-success' },
  };

  const { label, className } = config[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' };

  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', className)}>
      {label}
    </span>
  );
}
