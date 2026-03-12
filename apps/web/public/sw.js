/**
 * HelloNext Service Worker v2.0
 *
 * Caching Strategies:
 * - App Shell: Cache-first (static assets)
 * - API Data: Network-first with cache fallback
 * - Images: Cache-first with expiration
 * - Pages: Stale-while-revalidate
 *
 * Features:
 * - Offline fallback page
 * - Background sync for voice memos
 * - Push notification support
 * - Intelligent cache management
 */

const CACHE_VERSION = 'hellonext-v2.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const API_CACHE = `${CACHE_VERSION}-api`;

// ============================================================
// App Shell - Critical resources for offline
// ============================================================
const APP_SHELL = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ============================================================
// Cache size limits
// ============================================================
const CACHE_LIMITS = {
  [DYNAMIC_CACHE]: 50,
  [IMAGE_CACHE]: 100,
  [API_CACHE]: 30,
};

// ============================================================
// URL patterns for routing
// ============================================================
const API_PATTERN = /\/api\//;
const IMAGE_PATTERN = /\.(png|jpg|jpeg|gif|webp|avif|svg|ico)(\?|$)/;
const STATIC_PATTERN = /\.(js|css|woff2?|ttf|eot)(\?|$)/;
const SUPABASE_PATTERN = /supabase\.co/;
const CLOUDINARY_PATTERN = /cloudinary\.com/;

// ============================================================
// Install: Pre-cache app shell
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v2.0...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Pre-cache failed (non-critical):', err.message);
        return self.skipWaiting();
      })
  );
});

// ============================================================
// Activate: Clean old caches
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v2.0...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('hellonext-') && !name.startsWith(CACHE_VERSION))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ============================================================
// Fetch: Intelligent routing
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (let POST/PUT/DELETE go through)
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s)
  if (!url.protocol.startsWith('http')) return;

  // Skip Supabase real-time WebSocket
  if (url.pathname.includes('/realtime/')) return;

  // Route to appropriate strategy
  if (API_PATTERN.test(url.pathname) || SUPABASE_PATTERN.test(url.hostname)) {
    event.respondWith(networkFirst(request, API_CACHE));
  } else if (IMAGE_PATTERN.test(url.pathname) || CLOUDINARY_PATTERN.test(url.hostname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  } else if (STATIC_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
  }
});

// ============================================================
// Strategy: Cache-First (static assets, images)
// ============================================================
async function cacheFirst(request, cacheName) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      await trimCache(cacheName);
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // For images, return a placeholder
    if (IMAGE_PATTERN.test(request.url)) {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#f3f4f6" width="200" height="200"/><text x="100" y="110" text-anchor="middle" fill="#9ca3af" font-size="14">오프라인</text></svg>',
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }

    return caches.match('/offline');
  }
}

// ============================================================
// Strategy: Network-First (API, Supabase)
// ============================================================
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      await trimCache(cacheName);
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving cached API response:', request.url);
      return cached;
    }

    // Return offline JSON for API
    if (API_PATTERN.test(request.url)) {
      return new Response(
        JSON.stringify({
          error: 'offline',
          message: '오프라인 상태입니다. 네트워크 연결을 확인해주세요.',
          cached: false
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return caches.match('/offline');
  }
}

// ============================================================
// Strategy: Stale-While-Revalidate (pages)
// ============================================================
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
        await trimCache(cacheName);
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately, update in background
  if (cached) {
    fetchPromise; // fire-and-forget background update
    return cached;
  }

  // No cache: wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;

  // Absolute fallback
  return caches.match('/offline');
}

// ============================================================
// Cache management: Trim to limit
// ============================================================
async function trimCache(cacheName) {
  const limit = CACHE_LIMITS[cacheName];
  if (!limit) return;

  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > limit) {
    // Delete oldest entries (FIFO)
    const deleteCount = keys.length - limit;
    await Promise.all(
      keys.slice(0, deleteCount).map((key) => cache.delete(key))
    );
  }
}

// ============================================================
// Background Sync: Voice memo upload
// ============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'voice-memo-sync') {
    console.log('[SW] Background sync: voice-memo-sync');
    event.waitUntil(syncVoiceMemos());
  }
  if (event.tag === 'swing-data-sync') {
    console.log('[SW] Background sync: swing-data-sync');
    event.waitUntil(syncSwingData());
  }
});

async function syncVoiceMemos() {
  try {
    // Open IndexedDB for pending voice memos
    const db = await openDB('hellonext-offline', 1);
    const tx = db.transaction('voice-memos', 'readonly');
    const store = tx.objectStore('voice-memos');
    const pending = await getAllFromStore(store);

    for (const memo of pending) {
      try {
        const response = await fetch('/api/voice-memos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(memo.data),
        });

        if (response.ok) {
          // Remove from pending
          const deleteTx = db.transaction('voice-memos', 'readwrite');
          deleteTx.objectStore('voice-memos').delete(memo.id);
          console.log('[SW] Synced voice memo:', memo.id);
        }
      } catch (err) {
        console.warn('[SW] Failed to sync memo:', memo.id, err);
      }
    }
  } catch (err) {
    console.warn('[SW] Voice memo sync failed:', err);
  }
}

async function syncSwingData() {
  try {
    const db = await openDB('hellonext-offline', 1);
    const tx = db.transaction('swing-data', 'readonly');
    const store = tx.objectStore('swing-data');
    const pending = await getAllFromStore(store);

    for (const data of pending) {
      try {
        const response = await fetch('/api/swing-videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.payload),
        });

        if (response.ok) {
          const deleteTx = db.transaction('swing-data', 'readwrite');
          deleteTx.objectStore('swing-data').delete(data.id);
          console.log('[SW] Synced swing data:', data.id);
        }
      } catch (err) {
        console.warn('[SW] Failed to sync swing data:', data.id, err);
      }
    }
  } catch (err) {
    console.warn('[SW] Swing data sync failed:', err);
  }
}

// ============================================================
// Push Notifications
// ============================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || '새로운 알림이 있습니다.',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/',
        type: data.type || 'general',
      },
      actions: data.actions || [
        { action: 'open', title: '열기' },
        { action: 'dismiss', title: '닫기' },
      ],
      tag: data.tag || 'hellonext-notification',
      renotify: data.renotify || false,
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'HelloNext', options)
    );
  } catch (err) {
    console.warn('[SW] Push parse error:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if open
        for (const client of clients) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ============================================================
// IndexedDB helpers
// ============================================================
function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('voice-memos')) {
        db.createObjectStore('voice-memos', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('swing-data')) {
        db.createObjectStore('swing-data', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// Periodic sync (if supported)
// ============================================================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'content-sync') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then(async (cache) => {
        // Refresh key pages
        const pagesToRefresh = ['/', '/practice', '/progress'];
        await Promise.allSettled(
          pagesToRefresh.map((url) =>
            fetch(url).then((response) => {
              if (response.ok) cache.put(url, response);
            })
          )
        );
      })
    );
  }
});

console.log('[SW] Service Worker v2.0 loaded');
