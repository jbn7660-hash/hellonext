/**
 * Offline Storage Utility
 *
 * IndexedDB wrapper for storing data offline:
 * - Voice memos (pending upload)
 * - Swing data (pending sync)
 * - Cached reports (for offline viewing)
 *
 * Used by service worker background sync.
 */

const DB_NAME = 'hellonext-offline';
const DB_VERSION = 1;

// Store names
export const STORES = {
  VOICE_MEMOS: 'voice-memos',
  SWING_DATA: 'swing-data',
  CACHED_REPORTS: 'cached-reports',
  PENDING_ACTIONS: 'pending-actions',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

// ============================================================
// Database Connection
// ============================================================
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Voice memos store
      if (!db.objectStoreNames.contains(STORES.VOICE_MEMOS)) {
        const voiceStore = db.createObjectStore(STORES.VOICE_MEMOS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        voiceStore.createIndex('createdAt', 'createdAt', { unique: false });
        voiceStore.createIndex('status', 'status', { unique: false });
      }

      // Swing data store
      if (!db.objectStoreNames.contains(STORES.SWING_DATA)) {
        const swingStore = db.createObjectStore(STORES.SWING_DATA, {
          keyPath: 'id',
          autoIncrement: true,
        });
        swingStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Cached reports store
      if (!db.objectStoreNames.contains(STORES.CACHED_REPORTS)) {
        const reportStore = db.createObjectStore(STORES.CACHED_REPORTS, {
          keyPath: 'reportId',
        });
        reportStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }

      // Pending actions store (generic queue)
      if (!db.objectStoreNames.contains(STORES.PENDING_ACTIONS)) {
        const actionStore = db.createObjectStore(STORES.PENDING_ACTIONS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        actionStore.createIndex('type', 'type', { unique: false });
        actionStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

// ============================================================
// CRUD Operations
// ============================================================

/**
 * Add an item to a store
 */
export async function addItem<T>(storeName: StoreName, item: T): Promise<IDBValidKey> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.add({
      ...item,
      createdAt: new Date().toISOString(),
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get an item by key
 */
export async function getItem<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all items from a store
 */
export async function getAllItems<T>(storeName: StoreName): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete an item by key
 */
export async function deleteItem(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all items from a store
 */
export async function clearStore(storeName: StoreName): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Count items in a store
 */
export async function countItems(storeName: StoreName): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// Voice Memo Specific
// ============================================================

export interface OfflineVoiceMemo {
  id?: number;
  data: {
    audioBlob: string; // base64 encoded
    duration: number;
    memberId: string;
    transcript?: string;
  };
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  createdAt: string;
}

export async function saveVoiceMemoOffline(memo: Omit<OfflineVoiceMemo, 'id' | 'createdAt'>): Promise<IDBValidKey> {
  return addItem(STORES.VOICE_MEMOS, {
    ...memo,
    status: 'pending',
    retryCount: 0,
  });
}

export async function getPendingVoiceMemos(): Promise<OfflineVoiceMemo[]> {
  const all = await getAllItems<OfflineVoiceMemo>(STORES.VOICE_MEMOS);
  return all.filter((m) => m.status === 'pending' || m.status === 'failed');
}

// ============================================================
// Report Cache
// ============================================================

export interface CachedReport {
  reportId: string;
  data: Record<string, any>;
  cachedAt: string;
}

export async function cacheReport(reportId: string, data: Record<string, any>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHED_REPORTS, 'readwrite');
    const store = tx.objectStore(STORES.CACHED_REPORTS);
    const request = store.put({
      reportId,
      data,
      cachedAt: new Date().toISOString(),
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedReport(reportId: string): Promise<CachedReport | undefined> {
  return getItem<CachedReport>(STORES.CACHED_REPORTS, reportId);
}

// ============================================================
// Storage Statistics
// ============================================================

export async function getStorageStats(): Promise<{
  voiceMemos: number;
  swingData: number;
  cachedReports: number;
  pendingActions: number;
}> {
  const [voiceMemos, swingData, cachedReports, pendingActions] = await Promise.all([
    countItems(STORES.VOICE_MEMOS),
    countItems(STORES.SWING_DATA),
    countItems(STORES.CACHED_REPORTS),
    countItems(STORES.PENDING_ACTIONS),
  ]);

  return { voiceMemos, swingData, cachedReports, pendingActions };
}
