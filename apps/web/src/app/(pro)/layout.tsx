/**
 * Pro Layout
 *
 * Shell for all pro-facing pages.
 * Includes bottom tab navigation, voice FAB, and orphan memo sheet.
 *
 * @layout (pro)
 * @feature F-002
 */

'use client';

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { VoiceFAB } from '@/components/voice/voice-fab';
import { OrphanMemoSheet } from '@/components/voice/orphan-memo-sheet';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils/cn';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const PRO_TABS = [
  { key: 'dashboard', label: '대시보드', href: '/dashboard', icon: DashboardIcon },
  { key: 'reports', label: '리포트', href: '/reports', icon: ReportIcon },
  { key: 'members', label: '회원', href: '/members', icon: MembersIcon },
  { key: 'settings', label: '설정', href: '/settings', icon: SettingsIcon },
] as const;

export default function ProLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro, loading: authLoading } = useAuth();
  const { proActiveTab, setProActiveTab } = useUIStore();
  const [orphanSheetOpen, setOrphanSheetOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Redirect if not authenticated or not a pro
  useEffect(() => {
    if (authLoading) return;
    if (!isPro) {
      router.replace('/login');
    }
  }, [isPro, authLoading, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="로딩 중..." />
      </div>
    );
  }

  if (!isPro) {
    return null;
  }

  const handleMemoCreated = useCallback((memoId: string, isOrphan: boolean) => {
    if (isOrphan) {
      // Show orphan sheet after brief delay
      setTimeout(() => setOrphanSheetOpen(true), 2500);
    }
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-dawn">
      {/* Main content */}
      <main className="flex-1 pb-20">{children}</main>

      {/* Voice FAB */}
      <VoiceFAB
        selectedMemberId={selectedMemberId}
        onMemoCreated={handleMemoCreated}
      />

      {/* Orphan Memo Sheet */}
      <OrphanMemoSheet
        isOpen={orphanSheetOpen}
        onClose={() => setOrphanSheetOpen(false)}
        onMemoAssigned={() => {
          // Refresh could be triggered here
        }}
      />

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-safe-left px-safe-right">
          {PRO_TABS.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                onClick={() => setProActiveTab(tab.key as typeof PRO_TABS[number]['key'])}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full gap-0.5',
                  'transition-colors duration-200',
                  isActive ? 'text-ink' : 'text-ink-4'
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

function DashboardIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function ReportIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function MembersIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SettingsIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
