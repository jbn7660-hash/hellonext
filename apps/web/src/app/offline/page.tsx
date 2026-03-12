'use client';

/**
 * Offline Fallback Page
 *
 * Displayed when the user is offline and the requested page
 * isn't available in the service worker cache.
 */

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col items-center justify-center px-6">
      {/* Icon */}
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <svg
          className="w-10 h-10 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
        오프라인 상태입니다
      </h1>

      {/* Description */}
      <p className="text-gray-600 text-center max-w-sm mb-8 leading-relaxed">
        인터넷 연결이 없어 페이지를 불러올 수 없습니다.
        Wi-Fi 또는 모바일 데이터를 확인해주세요.
      </p>

      {/* Features available offline */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 w-full max-w-sm mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          오프라인에서 가능한 기능
        </h2>
        <ul className="space-y-3">
          <li className="flex items-center gap-3 text-sm text-gray-700">
            <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </span>
            음성 메모 녹음 (나중에 자동 동기화)
          </li>
          <li className="flex items-center gap-3 text-sm text-gray-700">
            <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m2.625-1.125v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-2.625-1.125v1.5c0 .621.504 1.125 1.125 1.125m0 0h12m-12 0a1.125 1.125 0 01-1.125-1.125m13.125 1.125a1.125 1.125 0 01-1.125-1.125" />
              </svg>
            </span>
            이전에 본 리포트 열람
          </li>
          <li className="flex items-center gap-3 text-sm text-gray-700">
            <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </span>
            스윙 영상 촬영 (나중에 자동 업로드)
          </li>
        </ul>
      </div>

      {/* Retry button */}
      <button
        onClick={() => window.location.reload()}
        className="bg-green-500 hover:bg-green-600 text-white font-semibold px-8 py-3 rounded-full transition-colors shadow-lg shadow-green-500/25"
      >
        다시 시도
      </button>

      {/* Status indicator */}
      <p className="mt-6 text-xs text-gray-400" id="offline-status">
        연결이 복구되면 자동으로 새로고침됩니다
      </p>

      {/* Auto-reload on reconnect */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('online', function() {
              document.getElementById('offline-status').textContent = '연결 복구됨! 새로고침 중...';
              setTimeout(function() { window.location.reload(); }, 1000);
            });
          `,
        }}
      />
    </div>
  );
}
