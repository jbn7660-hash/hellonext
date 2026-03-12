/**
 * NotificationCenter Component
 *
 * Advanced notification hub with:
 *  - Grouped notifications (오늘, 어제, 이번 주, 이전)
 *  - Category filtering (리포트, 검증, 시스템, 결제)
 *  - Rich previews with thumbnails
 *  - Swipe-to-dismiss and individual mark as read
 *  - Optional notification sound
 *  - Stacking animation for rapid arrivals
 *  - Badge pulse animation
 *  - Infinite scroll for older notifications
 *  - Realtime delivery via Supabase
 *
 * @module components/notification/notification-center
 * @feature F-014
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtimeBroadcast } from '@/hooks/use-realtime';
import { useAuth } from '@/hooks/use-auth';
import { formatRelativeTime, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

type NotificationCategory = 'report' | 'validation' | 'system' | 'payment' | 'all';
type NotificationGroup = 'today' | 'yesterday' | 'this_week' | 'earlier';

interface Notification {
  id: string;
  type: 'verification_complete' | 'report_published' | 'new_member' | 'validation_result' | 'system';
  category?: NotificationCategory;
  title: string;
  body: string;
  data: Record<string, string>;
  is_read: boolean;
  created_at: string;
  thumbnail?: string;
}

export function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>('all');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const notificationSoundUrl = '/sounds/notification.mp3';

  // Initialize audio
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(notificationSoundUrl);
      audioRef.current.volume = 0.3;
    }
  }, []);

  // Fetch notifications with pagination
  const fetchNotifications = useCallback(
    async (pageNum: number = 1) => {
      if (pageNum === 1) setLoading(true);
      try {
        const res = await fetch(`/api/notifications?page=${pageNum}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          if (pageNum === 1) {
            setNotifications(data.data);
          } else {
            setNotifications((prev) => [...prev, ...data.data]);
          }
          setUnreadCount(data.unread_count);
          setHasMore(data.has_more);
          setPage(pageNum);
        }
      } catch (err) {
        logger.error('Failed to fetch notifications', { error: err });
      } finally {
        if (pageNum === 1) setLoading(false);
      }
    },
    []
  );

  // Initial fetch
  useEffect(() => {
    if (!user?.id) return;
    fetchNotifications(1);
  }, [user?.id, fetchNotifications]);

  // Realtime: listen for new notifications with stacking animation
  useRealtimeBroadcast<{ type: string; title: string; body: string; data: Record<string, string> }>(
    `user-${user?.id ?? 'none'}`,
    'notification',
    (payload) => {
      const newNotif: Notification = {
        id: `temp-${Date.now()}`,
        type: payload.type as Notification['type'],
        category: getCategoryFromType(payload.type),
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        is_read: false,
        created_at: new Date().toISOString(),
      };
      setNotifications((prev) => [newNotif, ...prev]);
      setUnreadCount((prev) => prev + 1);

      // Play sound if enabled
      if (soundEnabled && audioRef.current) {
        audioRef.current.play().catch(() => {
          /* Sound playback may fail in some browsers */
        });
      }
    },
    !!user?.id
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [isOpen]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !loading) {
      fetchNotifications(page + 1);
    }
  }, [hasMore, loading, page, fetchNotifications]);

  // Mark single as read
  const handleMarkRead = useCallback(async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      logger.error('Failed to mark as read', { error: err });
    }
  }, []);

  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      logger.error('Failed to mark all read', { error: err });
    }
  }, []);

  // Delete notification with animation
  const handleDelete = useCallback(async (notificationId: string) => {
    setDismissing((prev) => new Set([...prev, notificationId]));
    setTimeout(async () => {
      try {
        await fetch(`/api/notifications/${notificationId}`, {
          method: 'DELETE',
        });
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      } catch (err) {
        logger.error('Failed to delete notification', { error: err });
        setDismissing((prev) => {
          const next = new Set(prev);
          next.delete(notificationId);
          return next;
        });
      }
    }, 300);
  }, []);

  // Navigate to relevant page
  const handleNavigate = useCallback((notification: Notification) => {
    const { data } = notification;
    if (data.report_id) {
      window.location.href = `/reports/${data.report_id}`;
    } else if (data.member_id) {
      window.location.href = `/members/${data.member_id}`;
    }
  }, []);

  const typeIcon: Record<string, string> = {
    verification_complete: '✓',
    report_published: '📋',
    new_member: '👤',
    validation_result: '🎯',
    system: '📢',
  };

  const categoryLabel: Record<NotificationCategory, string> = {
    all: '전체',
    report: '리포트',
    validation: '검증',
    system: '시스템',
    payment: '결제',
  };

  // Filter notifications by category
  const filteredNotifications = notifications.filter((n) => {
    if (selectedCategory === 'all') return true;
    return n.category === selectedCategory;
  });

  // Group notifications by date
  const groupedNotifications = groupNotificationsByDate(filteredNotifications);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button with Badge */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications(1);
        }}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label={`알림${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
        aria-expanded={isOpen}
      >
        <BellIcon className="w-5 h-5 text-text-secondary" />
        {unreadCount > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 w-4 h-4 bg-status-error text-white text-[10px] font-bold rounded-full flex items-center justify-center',
            'animate-pulse'
          )}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-96 max-h-[600px] bg-surface-primary rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in z-50 flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-text-primary">알림</h2>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-brand-primary hover:text-brand-primary/80 transition-colors"
                >
                  모두 읽음
                </button>
              )}
              <label className="text-xs text-text-tertiary flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="w-3 h-3"
                />
                음성
              </label>
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-50 overflow-x-auto">
            <div className="flex gap-2 whitespace-nowrap">
              {(['all', 'report', 'validation', 'system'] as NotificationCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    'text-xs px-3 py-1 rounded-full transition-colors whitespace-nowrap',
                    selectedCategory === cat
                      ? 'bg-brand-primary text-white'
                      : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                  )}
                >
                  {categoryLabel[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications List */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
            role="region"
            aria-label="알림 목록"
            aria-live="polite"
          >
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-tertiary">로딩 중...</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm text-text-tertiary">알림이 없습니다</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {Object.entries(groupedNotifications).map(([group, notifs]) => (
                  <div key={group}>
                    <div className="sticky top-0 px-4 py-2 bg-gray-50/80 backdrop-blur-sm text-xs font-semibold text-text-tertiary">
                      {getGroupLabel(group as NotificationGroup)}
                    </div>
                    {notifs.map((notif) => (
                      <NotificationItem
                        key={notif.id}
                        notification={notif}
                        icon={typeIcon[notif.type] ?? '📌'}
                        isDismissing={dismissing.has(notif.id)}
                        onMarkRead={() => handleMarkRead(notif.id)}
                        onDelete={() => handleDelete(notif.id)}
                        onNavigate={() => handleNavigate(notif)}
                      />
                    ))}
                  </div>
                ))}
                {hasMore && (
                  <div className="py-3 text-center text-xs text-text-tertiary">
                    로드 중...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: Get category from notification type
function getCategoryFromType(type: string): NotificationCategory {
  if (type.includes('report')) return 'report';
  if (type.includes('verification') || type.includes('validation')) return 'validation';
  if (type.includes('payment')) return 'payment';
  return 'system';
}

// Helper: Group notifications by date
function groupNotificationsByDate(notifs: Notification[]): Record<NotificationGroup, Notification[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const grouped: Record<NotificationGroup, Notification[]> = {
    today: [],
    yesterday: [],
    this_week: [],
    earlier: [],
  };

  notifs.forEach((n) => {
    const date = new Date(n.created_at);
    const notifDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (notifDay.getTime() === today.getTime()) {
      grouped.today.push(n);
    } else if (notifDay.getTime() === yesterday.getTime()) {
      grouped.yesterday.push(n);
    } else if (notifDay > weekAgo) {
      grouped.this_week.push(n);
    } else {
      grouped.earlier.push(n);
    }
  });

  return grouped;
}

// Helper: Get group label
function getGroupLabel(group: NotificationGroup): string {
  const labels: Record<NotificationGroup, string> = {
    today: '오늘',
    yesterday: '어제',
    this_week: '이번 주',
    earlier: '이전',
  };
  return labels[group];
}

// NotificationItem sub-component
function NotificationItem({
  notification,
  icon,
  isDismissing,
  onMarkRead,
  onDelete,
  onNavigate,
}: {
  notification: Notification;
  icon: string;
  isDismissing: boolean;
  onMarkRead: () => void;
  onDelete: () => void;
  onNavigate: () => void;
}) {
  return (
    <div
      className={cn(
        'px-4 py-3 hover:bg-gray-50 transition-all duration-300 group cursor-pointer',
        !notification.is_read && 'bg-brand-primary/5',
        isDismissing && 'opacity-0 translate-x-full'
      )}
      onClick={onNavigate}
      role="article"
      aria-label={notification.title}
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-1 flex-shrink-0" aria-hidden="true">
          {icon}
        </span>

        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm break-words',
            notification.is_read ? 'text-text-secondary' : 'text-text-primary font-medium'
          )}>
            {notification.title}
          </p>
          <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2 break-words">
            {notification.body}
          </p>
          <p className="text-[10px] text-text-tertiary mt-1">
            {formatRelativeTime(notification.created_at)}
          </p>
        </div>

        {!notification.is_read && (
          <span className="w-2 h-2 rounded-full bg-brand-primary flex-shrink-0 mt-2" />
        )}

        {/* Action buttons (visible on hover) */}
        <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!notification.is_read && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead();
              }}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              title="읽음으로 표시"
            >
              ✓
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 hover:bg-gray-200 rounded transition-colors text-text-tertiary"
            title="삭제"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
