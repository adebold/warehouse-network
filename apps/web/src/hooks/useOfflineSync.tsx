/**
 * Offline Sync Hook
 * Manages offline data synchronization and queuing
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface OfflineItem {
  id: string;
  type: 'inventory' | 'transaction' | 'location' | 'user_action' | 'scan';
  action: 'create' | 'update' | 'delete' | 'sync';
  data: any;
  timestamp: number;
  retries: number;
  priority: 'high' | 'medium' | 'low';
  endpoint: string;
  method: string;
}

interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingItems: number;
  lastSync: Date | null;
  syncProgress: number;
  errors: string[];
}

interface UseOfflineSyncReturn {
  syncStatus: SyncStatus;
  addToQueue: (item: Omit<OfflineItem, 'id' | 'retries' | 'timestamp'>) => Promise<void>;
  syncNow: () => Promise<void>;
  clearQueue: () => Promise<void>;
  clearErrors: () => void;
  getQueuedItems: () => Promise<OfflineItem[]>;
}

const DB_NAME = 'skidspace-offline';
const DB_VERSION = 1;
const SYNC_QUEUE_STORE = 'sync_queue';
const MAX_RETRIES = 3;
const SYNC_INTERVAL = 30000; // 30 seconds

export function useOfflineSync(): UseOfflineSyncReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingItems: 0,
    lastSync: null,
    syncProgress: 0,
    errors: []
  });

  const dbRef = useRef<IDBDatabase | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Initialize database
  useEffect(() => {
    initializeDatabase();
    loadLastSyncTime();

    return () => {
      isMountedRef.current = false;
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      if (isMountedRef.current) {
        setSyncStatus(prev => ({ ...prev, isOnline: true, errors: [] }));
        // Auto-sync when coming online
        setTimeout(() => syncNow(), 1000);
      }
    };

    const handleOffline = () => {
      if (isMountedRef.current) {
        setSyncStatus(prev => ({ ...prev, isOnline: false }));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Setup periodic sync when online
  useEffect(() => {
    if (syncStatus.isOnline && !syncIntervalRef.current) {
      syncIntervalRef.current = setInterval(() => {
        if (syncStatus.isOnline && !syncStatus.isSyncing) {
          syncNow();
        }
      }, SYNC_INTERVAL);
    } else if (!syncStatus.isOnline && syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [syncStatus.isOnline, syncStatus.isSyncing]);

  const initializeDatabase = async () => {
    try {
      const db = await openDatabase();
      dbRef.current = db;
      await updatePendingCount();
    } catch (error) {
      console.error('Failed to initialize offline database:', error);
      if (isMountedRef.current) {
        setSyncStatus(prev => ({
          ...prev,
          errors: [...prev.errors, 'Failed to initialize offline storage']
        }));
      }
    }
  };

  const openDatabase = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create sync queue store
        if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
          const store = db.createObjectStore(SYNC_QUEUE_STORE, {
            keyPath: 'id'
          });

          // Add indexes for efficient querying
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
          store.createIndex('retries', 'retries', { unique: false });
        }
      };
    });
  };

  const loadLastSyncTime = () => {
    const lastSync = localStorage.getItem('skidspace-last-sync');
    if (lastSync && isMountedRef.current) {
      setSyncStatus(prev => ({
        ...prev,
        lastSync: new Date(parseInt(lastSync))
      }));
    }
  };

  const updatePendingCount = async () => {
    if (!dbRef.current || !isMountedRef.current) return;

    try {
      const transaction = dbRef.current.transaction([SYNC_QUEUE_STORE], 'readonly');
      const store = transaction.objectStore(SYNC_QUEUE_STORE);
      const request = store.count();

      request.onsuccess = () => {
        if (isMountedRef.current) {
          setSyncStatus(prev => ({ ...prev, pendingItems: request.result }));
        }
      };
    } catch (error) {
      console.error('Failed to update pending count:', error);
    }
  };

  const addToQueue = useCallback(async (item: Omit<OfflineItem, 'id' | 'retries' | 'timestamp'>) => {
    if (!dbRef.current) {
      throw new Error('Database not initialized');
    }

    const queueItem: OfflineItem = {
      ...item,
      id: `${item.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retries: 0
    };

    try {
      const transaction = dbRef.current.transaction([SYNC_QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(SYNC_QUEUE_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.add(queueItem);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      await updatePendingCount();

      // Try to sync immediately if online
      if (syncStatus.isOnline && !syncStatus.isSyncing) {
        setTimeout(() => syncNow(), 100);
      }

      console.log('Added to sync queue:', queueItem);
    } catch (error) {
      console.error('Failed to add to sync queue:', error);
      throw error;
    }
  }, [syncStatus.isOnline, syncStatus.isSyncing]);

  const getQueuedItems = useCallback(async (): Promise<OfflineItem[]> => {
    if (!dbRef.current) return [];

    try {
      const transaction = dbRef.current.transaction([SYNC_QUEUE_STORE], 'readonly');
      const store = transaction.objectStore(SYNC_QUEUE_STORE);

      return new Promise<OfflineItem[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get queued items:', error);
      return [];
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!dbRef.current || !syncStatus.isOnline || syncStatus.isSyncing) {
      return;
    }

    if (isMountedRef.current) {
      setSyncStatus(prev => ({ ...prev, isSyncing: true, syncProgress: 0 }));
    }

    try {
      const queuedItems = await getQueuedItems();

      if (queuedItems.length === 0) {
        if (isMountedRef.current) {
          setSyncStatus(prev => ({
            ...prev,
            isSyncing: false,
            syncProgress: 100,
            lastSync: new Date()
          }));
        }
        return;
      }

      const totalItems = queuedItems.length;
      let processedItems = 0;
      let syncedItems = 0;
      const errors: string[] = [];

      // Sort by priority and timestamp
      const sortedItems = queuedItems.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.timestamp - b.timestamp;
      });

      for (const item of sortedItems) {
        if (!isMountedRef.current) break;

        try {
          const success = await syncItem(item);

          if (success) {
            await removeFromQueue(item.id);
            syncedItems++;
          } else {
            await updateRetryCount(item);
            if (item.retries >= MAX_RETRIES - 1) {
              errors.push(`Failed to sync ${item.type} after ${MAX_RETRIES} attempts`);
              await removeFromQueue(item.id);
            }
          }

          processedItems++;

          if (isMountedRef.current) {
            setSyncStatus(prev => ({
              ...prev,
              syncProgress: Math.round((processedItems / totalItems) * 100)
            }));
          }

        } catch (error) {
          console.error(`Failed to sync item ${item.id}:`, error);
          await updateRetryCount(item);
          processedItems++;

          if (item.retries >= MAX_RETRIES - 1) {
            errors.push(`Sync failed for ${item.type}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            await removeFromQueue(item.id);
          }
        }
      }

      // Update sync status
      if (isMountedRef.current) {
        setSyncStatus(prev => ({
          ...prev,
          isSyncing: false,
          syncProgress: 100,
          lastSync: new Date(),
          errors: [...prev.errors, ...errors]
        }));
      }

      // Store last sync time
      localStorage.setItem('skidspace-last-sync', Date.now().toString());

      await updatePendingCount();

      console.log(`Sync completed: ${syncedItems}/${totalItems} items synced`);

    } catch (error) {
      console.error('Sync failed:', error);
      if (isMountedRef.current) {
        setSyncStatus(prev => ({
          ...prev,
          isSyncing: false,
          syncProgress: 0,
          errors: [...prev.errors, `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
        }));
      }
    }
  }, [syncStatus.isOnline, syncStatus.isSyncing, getQueuedItems]);

  const syncItem = async (item: OfflineItem): Promise<boolean> => {
    try {
      const response = await fetch(item.endpoint, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item.data)
      });

      if (response.ok) {
        console.log(`Successfully synced ${item.type}:`, item.id);
        return true;
      } else {
        console.error(`Sync failed for ${item.type}:`, response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error(`Network error syncing ${item.type}:`, error);
      return false;
    }
  };

  const removeFromQueue = async (itemId: string): Promise<void> => {
    if (!dbRef.current) return;

    try {
      const transaction = dbRef.current.transaction([SYNC_QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(SYNC_QUEUE_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(itemId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to remove item from queue:', error);
    }
  };

  const updateRetryCount = async (item: OfflineItem): Promise<void> => {
    if (!dbRef.current) return;

    try {
      const updatedItem = { ...item, retries: item.retries + 1 };
      const transaction = dbRef.current.transaction([SYNC_QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(SYNC_QUEUE_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.put(updatedItem);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to update retry count:', error);
    }
  };

  const clearQueue = useCallback(async (): Promise<void> => {
    if (!dbRef.current) return;

    try {
      const transaction = dbRef.current.transaction([SYNC_QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(SYNC_QUEUE_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      await updatePendingCount();

      if (isMountedRef.current) {
        setSyncStatus(prev => ({ ...prev, errors: [] }));
      }

    } catch (error) {
      console.error('Failed to clear sync queue:', error);
      throw error;
    }
  }, []);

  const clearErrors = useCallback(() => {
    if (isMountedRef.current) {
      setSyncStatus(prev => ({ ...prev, errors: [] }));
    }
  }, []);

  return {
    syncStatus,
    addToQueue,
    syncNow,
    clearQueue,
    clearErrors,
    getQueuedItems
  };
}

export default useOfflineSync;