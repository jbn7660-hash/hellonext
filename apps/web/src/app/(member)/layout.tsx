/**
 * Member Layout
 *
 * Shell for all member-facing pages.
 * Includes bottom tab navigation and notification center.
 *
 * @layout (member)
 * @feature F-004, F-005
 */

'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { NotificationCenter } from '@/components/notification/notification-center';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils/cn';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const MEMBER_TABS = [
  { key: 'practice', label: '연습', href: '/practice', icon: PracticeIcon },
  { key: 'swingbook', label: '스윙북', href: '/swingbook', icon: SwingBookIcon },
  { key: 'progress', label: '진행도', href: '/progress', icon: ProgressIcon },
  { key: 'profile', label: '내 정보', href: '/profile', icon: ProfileIcon },
] as const;

export default function MemberLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isMember, loading: authLoading } = useAuth();
  const { memberActiveTab, setMemberActiveTab } = useUIStore();

  // Redirect if not authenticated or not a member
  useEffect(() => {
    if (authLoading) return;
    if (!isMember) {
      router.replace('/login');
    }
  }, [isMember, authLoading, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="로딩 중..." />
      </div>
    );
  }

  if (!isMember) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface-secondary">
      {/* Header with Notification */}
      <header className="sticky top-0 z-30 bg-surface-primary border-b border-gray-100 safe-area-top">
        <div className="flex items-center justify-between px-5 h-12">
          <h1 className="text-base font-bold text-brand-primary">HelloNext</h1>
          <NotificationCenter />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20">{children}</main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface-primary border-t border-gray-100 z-30 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-safe-left px-safe-right">
          {MEMBER_TABS.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                onClick={() => setMemberActiveTab(tab.key as typeof MEMBER_TABS[number]['key'])}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full gap-0.5',
                  'transition-colors duration-200',
                  isActive ? 'text-brand-primary' : 'text-text-tertiary'
                )}
              >
                <tab.icon className="w-5 h-5" filled={isActive} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* ---------- Tab Icons ---------- */

function PracticeIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="10,8 16,12 10,16" />
    </svg>
  );
}

function SwingBookIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ReportIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

function ProgressIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="7.5 4.21l6.5 3.75 6.5-3.75" />
      <polyline points="7.5 19.79v-10.3" />
      <polyline points="16.5 9.5v10.29" />
      <line x1="3.27" y1="6.6" x2="12" y2="12.25" />
      <line x1="20.73" y1="6.6" x2="12" y2="12.25" />
    </svg>
  );
}

function ProfileIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
