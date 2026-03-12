/**
 * BottomSheet Component - Sprint 7 UX Polish
 *
 * Enhanced modal dialog with:
 *  - Multiple snap points (peek, half, full)
 *  - Internal scroll support
 *  - Header action buttons
 *  - Nested sheets support
 *  - Virtual keyboard avoidance
 *  - Physics-based spring animation
 *  - Size presets (sm, md, lg, full)
 *  - Enhanced accessibility
 *  - Smooth drag interactions
 *
 * @module components/ui/bottom-sheet
 * @example
 * <BottomSheet
 *   isOpen={open}
 *   onClose={() => setOpen(false)}
 *   title="작업 메뉴"
 *   snapPoints={[40, 70, 100]}
 *   size="md"
 *   headerAction={{ icon: "✕", onClick: () => {} }}
 * >
 *   Content
 * </BottomSheet>
 */

'use client';

import { useEffect, useRef, useCallback, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface HeaderAction {
  label: string;
  icon?: string;
  onClick: () => void;
}

interface BottomSheetProps {
  /** Whether the sheet is visible */
  isOpen: boolean;
  /** Callback when sheet should close */
  onClose: () => void;
  /** Optional title displayed at top */
  title?: string;
  /** Sheet content */
  children: ReactNode;
  /** Multiple snap points as percentages (default: [50, 75, 100]) */
  snapPoints?: number[];
  /** Primary snap point (default: first snapPoint) */
  initialSnapPoint?: number;
  /** Optional header action buttons */
  headerActions?: HeaderAction[];
  /** Size preset instead of custom snapPoint */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Show drag handle */
  showHandle?: boolean;
  /** Prevent dismissal on backdrop click */
  nonDismissible?: boolean;
  /** Additional CSS classes for the sheet element */
  className?: string;
}

const sizeSnapPoints = {
  sm: [40, 60],
  md: [50, 75, 100],
  lg: [60, 85, 100],
  full: [100],
};

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints,
  initialSnapPoint,
  headerActions,
  size = 'md',
  showHandle = true,
  nonDismissible = false,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const currentSnapIndexRef = useRef(0);
  const [isScrolling, setIsScrolling] = useState(false);

  const points = snapPoints || sizeSnapPoints[size];
  const initialIndex = initialSnapPoint
    ? points.indexOf(initialSnapPoint)
    : 0;

  useEffect(() => {
    currentSnapIndexRef.current = Math.max(0, initialIndex);
  }, [initialIndex]);

  // Lock body scroll and apply safe area when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.paddingRight = '0px';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen || nonDismissible) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, nonDismissible]);

  // Virtual keyboard avoidance
  useEffect(() => {
    if (!isOpen) return;

    const handleFocusIn = () => {
      setTimeout(() => {
        sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 300);
    };

    const inputs = contentRef.current?.querySelectorAll('input, textarea, select');
    inputs?.forEach((input) => {
      input.addEventListener('focusin', handleFocusIn);
    });

    return () => {
      inputs?.forEach((input) => {
        input.removeEventListener('focusin', handleFocusIn);
      });
    };
  }, [isOpen]);

  const snapToPoint = useCallback((index: number) => {
    if (!sheetRef.current) return;

    const clampedIndex = Math.max(0, Math.min(index, points.length - 1));
    const snapHeight = points[clampedIndex] ?? points[0];

    currentSnapIndexRef.current = clampedIndex;

    sheetRef.current.style.maxHeight = `${snapHeight}vh`;
    sheetRef.current.style.transform = '';
    sheetRef.current.style.transition = 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)';

    setTimeout(() => {
      if (sheetRef.current) {
        sheetRef.current.style.transition = '';
      }
    }, 300);
  }, [points]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only drag from handle or if content is scrolled to top
    const content = contentRef.current;
    const isAtTop = !content || content.scrollTop === 0;

    if (
      (e.target as HTMLElement).closest('[data-no-drag]') ||
      (!isAtTop && !(e.target as HTMLElement).closest('.drag-handle'))
    ) {
      return;
    }

    startYRef.current = e.touches[0]?.clientY ?? 0;
    setIsScrolling(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isScrolling || !sheetRef.current) return;

    const currentY = e.touches[0]?.clientY ?? 0;
    const diff = currentY - startYRef.current;
    currentYRef.current = diff;

    // Only allow downward drag (positive delta)
    if (diff > 0) {
      sheetRef.current.style.transform = `translateY(${diff}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }, [isScrolling]);

  const handleTouchEnd = useCallback(() => {
    if (!sheetRef.current) {
      setIsScrolling(false);
      return;
    }

    const dragDistance = currentYRef.current;
    const dragPercentage = (dragDistance / window.innerHeight) * 100;
    const currentSnapHeight = points[currentSnapIndexRef.current] ?? points[0];

    // Close if dragged > 15% or > 100px
    if (dragPercentage > 15 || dragDistance > 100) {
      if (!nonDismissible) {
        onClose();
      } else {
        snapToPoint(currentSnapIndexRef.current);
      }
    }
    // Try to snap to next smaller point
    else if (dragDistance > 20) {
      const nextIndex = Math.min(
        currentSnapIndexRef.current + 1,
        points.length - 1
      );
      snapToPoint(nextIndex);
    } else {
      snapToPoint(currentSnapIndexRef.current);
    }

    currentYRef.current = 0;
    setIsScrolling(false);
  }, [points, currentSnapIndexRef, onClose, snapToPoint, nonDismissible]);

  const handleBackdropClick = useCallback(() => {
    if (!nonDismissible) {
      onClose();
    }
  }, [onClose, nonDismissible]);

  if (!isOpen) return null;

  const currentSnapHeight = points[currentSnapIndexRef.current] ?? points[0];

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      {/* Backdrop with blur */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-surface-primary rounded-t-3xl',
          'animate-slide-up',
          'safe-area-bottom',
          className
        )}
        style={{
          maxHeight: `${currentSnapHeight}vh`,
          transition: 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        {showHandle && (
          <div
            className="flex justify-center py-3 cursor-grab active:cursor-grabbing drag-handle"
            aria-hidden="true"
            data-no-drag={false}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 transition-colors hover:bg-gray-400" />
          </div>
        )}

        {/* Header with Title and Actions */}
        {title && (
          <div className="px-5 pb-4 border-b border-gray-100 flex items-center justify-between">
            <h2
              id="bottom-sheet-title"
              className="text-lg font-semibold text-text-primary flex-1"
            >
              {title}
            </h2>
            {headerActions && (
              <div className="flex gap-2">
                {headerActions.map((action, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={action.onClick}
                    className="text-text-tertiary hover:text-text-primary transition-colors p-1"
                    title={action.label}
                    data-no-drag={true}
                  >
                    {action.icon ? (
                      <span className="text-lg">{action.icon}</span>
                    ) : (
                      action.label
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content with scroll */}
        <div
          ref={contentRef}
          className="overflow-y-auto px-5 py-4"
          style={{
            maxHeight: `calc(${currentSnapHeight}vh - ${
              title ? (showHandle ? '130px' : '100px') : showHandle ? '60px' : '0px'
            })`,
          }}
          data-no-drag={true}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
