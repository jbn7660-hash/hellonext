/**
 * PWA Update Prompt Component
 *
 * Shows a toast/snackbar when a new service worker version
 * is available. User can apply the update or dismiss.
 */

'use client';

import { useState, useEffect } from 'react';

interface UpdatePromptProps {
  isUpdateAvailable: boolean;
  onUpdate: () => void;
}

export function UpdatePrompt({ isUpdateAvailable, onUpdate }: UpdatePromptProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isUpdateAvailable) {
      // Small delay for smooth appearance
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isUpdateAvailable]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex justify-center">
      <div className="bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 max-w-sm animate-slide-down">
        {/* Icon */}
        <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
          <svg
            className="w-4 h-4 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">새 버전이 있습니다</p>
          <p className="text-xs text-gray-400">업데이트하여 최신 기능을 사용하세요</p>
        </div>

        {/* Actions */}
        <button
          onClick={onUpdate}
          className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          업데이트
        </button>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
          aria-label="닫기"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <style jsx>{`
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-down {
          animation: slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
