/**
 * Offline Indicator Component
 *
 * Shows a subtle banner at the top of the screen when
 * the user goes offline. Auto-hides when back online.
 */

'use client';

import { useState, useEffect } from 'react';
import { useOnlineStatus } from '@/hooks/use-pwa';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [show, setShow] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" briefly, then hide
      const timer = setTimeout(() => {
        setShow(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (!show) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[60] py-2 px-4 text-center text-xs font-medium transition-all duration-300 safe-area-top ${
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-gray-800 text-gray-200'
      }`}
      role="status"
      aria-live="polite"
    >
      {isOnline ? (
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          다시 온라인 상태입니다
        </span>
      ) : (
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          오프라인 상태 — 일부 기능이 제한됩니다
        </span>
      )}

      <style jsx>{`
        .safe-area-top {
          padding-top: max(0.5rem, env(safe-area-inset-top, 0px));
        }
      `}</style>
    </div>
  );
}
