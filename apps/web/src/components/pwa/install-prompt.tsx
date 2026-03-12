/**
 * PWA Install Prompt Component
 *
 * Shows a bottom banner when the app is installable (A2HS).
 * Includes:
 * - Animated slide-up banner
 * - Install button
 * - Dismiss with localStorage persistence
 * - iOS Safari instructions
 */

'use client';

import { useState, useEffect } from 'react';
import { useInstallPrompt } from '@/hooks/use-pwa';

const DISMISS_KEY = 'hellonext-install-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function InstallPrompt() {
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check iOS Safari
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|Chrome/.test(ua);
    setIsIOS(isIOSDevice && isSafari);

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < DISMISS_DURATION) {
      return;
    }

    // Show prompt after 3 seconds
    const timer = setTimeout(() => {
      if (isInstallable || (isIOSDevice && isSafari && !isInstalled)) {
        setIsVisible(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled]);

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  if (!isVisible || isInstalled) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 animate-fade-in"
        onClick={handleDismiss}
      />

      {/* Install Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up safe-area-bottom">
        <div className="bg-white rounded-t-3xl shadow-2xl mx-auto max-w-lg">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="px-6 pb-6">
            {/* App icon + info */}
            <div className="flex items-center gap-4 mb-4">
              <img
                src="/icons/icon-96x96.png"
                alt="HelloNext"
                className="w-14 h-14 rounded-2xl shadow-md"
              />
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-lg">HelloNext</h3>
                <p className="text-sm text-gray-500">AI 골프 코칭 플랫폼</p>
              </div>
            </div>

            {/* Benefits */}
            <div className="space-y-2 mb-5">
              {[
                { icon: '⚡', text: '더 빠른 실행 속도' },
                { icon: '📴', text: '오프라인에서도 사용 가능' },
                { icon: '🔔', text: '실시간 코칭 알림' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-base">{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            {/* iOS Safari Guide */}
            {isIOS ? (
              <div>
                <button
                  onClick={() => setShowIOSGuide(!showIOSGuide)}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-lg shadow-green-500/25"
                >
                  홈 화면에 추가하기
                </button>

                {showIOSGuide && (
                  <div className="mt-4 bg-gray-50 rounded-xl p-4 space-y-3 text-sm text-gray-600">
                    <p className="font-medium text-gray-800">Safari에서 설치하기:</p>
                    <ol className="space-y-2 list-decimal list-inside">
                      <li>
                        하단의{' '}
                        <span className="inline-flex items-center bg-white px-1.5 py-0.5 rounded border text-xs">
                          공유
                          <svg className="w-3.5 h-3.5 ml-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </span>{' '}
                        버튼을 탭하세요
                      </li>
                      <li>아래로 스크롤하여 &quot;홈 화면에 추가&quot;를 탭하세요</li>
                      <li>&quot;추가&quot;를 탭하면 완료!</li>
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              /* Standard install button */
              <div className="flex gap-3">
                <button
                  onClick={handleDismiss}
                  className="flex-1 py-3.5 rounded-2xl text-gray-500 font-medium hover:bg-gray-100 transition-colors"
                >
                  나중에
                </button>
                <button
                  onClick={handleInstall}
                  className="flex-[2] bg-green-500 hover:bg-green-600 text-white font-semibold py-3.5 rounded-2xl transition-colors shadow-lg shadow-green-500/25"
                >
                  앱 설치하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-slide-up {
          animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>
    </>
  );
}
