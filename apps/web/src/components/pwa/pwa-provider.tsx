/**
 * PWA Provider Component
 *
 * Wraps the app with PWA features:
 * - Service Worker registration
 * - Install prompt
 * - Update notification
 * - Offline indicator
 * - Online/offline context
 */

'use client';

import { createContext, useContext, ReactNode } from 'react';
import { usePwa } from '@/hooks/use-pwa';
import { InstallPrompt } from './install-prompt';
import { UpdatePrompt } from './update-prompt';
import { OfflineIndicator } from './offline-indicator';

// ============================================================
// Context
// ============================================================
interface PwaContextValue {
  isOnline: boolean;
  isInstalled: boolean;
  isInstallable: boolean;
  isUpdateAvailable: boolean;
  promptInstall: () => Promise<boolean>;
  applyUpdate: () => void;
  requestSync: (tag: string) => Promise<boolean>;
}

const PwaContext = createContext<PwaContextValue>({
  isOnline: true,
  isInstalled: false,
  isInstallable: false,
  isUpdateAvailable: false,
  promptInstall: async () => false,
  applyUpdate: () => {},
  requestSync: async () => false,
});

export const usePwaContext = () => useContext(PwaContext);

// ============================================================
// Provider
// ============================================================
interface PwaProviderProps {
  children: ReactNode;
}

export function PwaProvider({ children }: PwaProviderProps) {
  const pwa = usePwa();

  return (
    <PwaContext.Provider
      value={{
        isOnline: pwa.isOnline,
        isInstalled: pwa.isInstalled,
        isInstallable: pwa.isInstallable,
        isUpdateAvailable: pwa.isUpdateAvailable,
        promptInstall: pwa.promptInstall,
        applyUpdate: pwa.applyUpdate,
        requestSync: pwa.requestSync,
      }}
    >
      {/* Offline status bar */}
      <OfflineIndicator />

      {/* App content */}
      {children}

      {/* Install prompt (bottom sheet) */}
      <InstallPrompt />

      {/* Update notification (top toast) */}
      <UpdatePrompt
        isUpdateAvailable={pwa.isUpdateAvailable}
        onUpdate={pwa.applyUpdate}
      />
    </PwaContext.Provider>
  );
}
