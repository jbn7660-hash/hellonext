/**
 * PWA Hooks
 *
 * Provides:
 * - Service Worker registration
 * - Install prompt (A2HS)
 * - Online/offline status
 * - Push notification subscription
 * - Background sync registration
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// Types
// ============================================================
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface PwaState {
  isInstalled: boolean;
  isInstallable: boolean;
  isOnline: boolean;
  isUpdateAvailable: boolean;
  swRegistration: ServiceWorkerRegistration | null;
}

// ============================================================
// useServiceWorker
// ============================================================
export function useServiceWorker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        setRegistration(reg);
        console.log('[PWA] Service Worker registered, scope:', reg.scope);

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New version available');
              setUpdateAvailable(true);
            }
          });
        });

        // Periodic update check (every 1 hour)
        setInterval(() => {
          reg.update().catch(() => {});
        }, 60 * 60 * 1000);
      } catch (error) {
        console.warn('[PWA] Service Worker registration failed:', error);
      }
    };

    registerSW();

    // Listen for controller change (after update)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] Controller changed, reloading...');
      // Optionally reload on update
    });
  }, []);

  const applyUpdate = useCallback(() => {
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    setUpdateAvailable(false);
    window.location.reload();
  }, [registration]);

  return { registration, updateAvailable, applyUpdate };
}

// ============================================================
// useInstallPrompt (Add to Home Screen)
// ============================================================
export function useInstallPrompt() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
      console.log('[PWA] Install prompt captured');
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPromptRef.current = null;
      console.log('[PWA] App installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPromptRef.current) return false;

    try {
      await deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      console.log('[PWA] Install prompt result:', outcome);
      deferredPromptRef.current = null;
      setIsInstallable(false);
      return outcome === 'accepted';
    } catch (error) {
      console.warn('[PWA] Install prompt error:', error);
      return false;
    }
  }, []);

  return { isInstallable, isInstalled, promptInstall };
}

// ============================================================
// useOnlineStatus
// ============================================================
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('[PWA] Back online');
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('[PWA] Gone offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// ============================================================
// usePushNotifications
// ============================================================
export function usePushNotifications(registration: ServiceWorkerRegistration | null) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  useEffect(() => {
    if (!registration) return;

    registration.pushManager.getSubscription().then((sub) => {
      setIsSubscribed(!!sub);
    });
  }, [registration]);

  const subscribe = useCallback(async () => {
    if (!registration) return null;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        console.log('[PWA] Notification permission denied');
        return null;
      }

      // VAPID public key should come from env
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.warn('[PWA] VAPID public key not configured');
        return null;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Send subscription to server
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      setIsSubscribed(true);
      console.log('[PWA] Push subscription successful');
      return subscription;
    } catch (error) {
      console.warn('[PWA] Push subscription failed:', error);
      return null;
    }
  }, [registration]);

  const unsubscribe = useCallback(async () => {
    if (!registration) return;

    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      setIsSubscribed(false);
      console.log('[PWA] Push unsubscribed');
    }
  }, [registration]);

  return { isSubscribed, permission, subscribe, unsubscribe };
}

// ============================================================
// useBackgroundSync
// ============================================================
export function useBackgroundSync(registration: ServiceWorkerRegistration | null) {
  const requestSync = useCallback(
    async (tag: string) => {
      if (!registration) return false;

      try {
        await (registration as any).sync?.register(tag);
        console.log('[PWA] Background sync registered:', tag);
        return true;
      } catch (error) {
        console.warn('[PWA] Background sync not supported or failed:', error);
        return false;
      }
    },
    [registration]
  );

  return { requestSync };
}

// ============================================================
// Combined hook: usePwa
// ============================================================
export function usePwa(): PwaState & {
  promptInstall: () => Promise<boolean>;
  applyUpdate: () => void;
  requestSync: (tag: string) => Promise<boolean>;
} {
  const { registration, updateAvailable, applyUpdate } = useServiceWorker();
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const isOnline = useOnlineStatus();
  const { requestSync } = useBackgroundSync(registration);

  return {
    isInstalled,
    isInstallable,
    isOnline,
    isUpdateAvailable: updateAvailable,
    swRegistration: registration,
    promptInstall,
    applyUpdate,
    requestSync,
  };
}

// ============================================================
// Utility: Convert VAPID key
// ============================================================
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
