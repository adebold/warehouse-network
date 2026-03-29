/**
 * Offline Sync Component
 * Manages offline data synchronization and storage
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  CloudOff,
  CheckCircle,
  AlertCircle,
  Upload,
  Download,
  Clock,
  HardDrive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface OfflineSyncProps {
  className?: string;
  onSyncComplete?: (syncedItems: number) => void;
  onSyncError?: (error: string) => void;
}

interface SyncStatus {
  isOnline: boolean;
  isInitialized: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  pendingUploads: number;
  pendingDownloads: number;
  storageUsed: number;
  storageQuota: number;
  syncProgress: number;
}

interface OfflineItem {
  id: string;
  type: 'inventory' | 'transaction' | 'location' | 'user_action';
  data: any;
  timestamp: number;
  action: 'create' | 'update' | 'delete';
  retries: number;
  priority: 'high' | 'medium' | 'low';
}

const DB_NAME = 'skidspace-offline';
const DB_VERSION = 1;
const STORES = {
  INVENTORY: 'inventory',
  TRANSACTIONS: 'transactions',
  LOCATIONS: 'locations',
  USER_ACTIONS: 'user_actions',
  SYNC_QUEUE: 'sync_queue'
};

export function OfflineSync({ className, onSyncComplete, onSyncError }: OfflineSyncProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isInitialized: false,
    isSyncing: false,
    lastSync: null,
    pendingUploads: 0,
    pendingDownloads: 0,
    storageUsed: 0,
    storageQuota: 0,
    syncProgress: 0
  });

  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [syncQueue, setSyncQueue] = useState<OfflineItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize IndexedDB
  useEffect(() => {
    initializeDatabase();
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: true }));
      // Auto-sync when coming online
      setTimeout(syncData, 1000);
    };

    const handleOffline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check storage quota
  useEffect(() => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        setSyncStatus(prev => ({
          ...prev,
          storageUsed: estimate.usage || 0,
          storageQuota: estimate.quota || 0
        }));
      });
    }
  }, []);

  // Load sync queue on initialization
  useEffect(() => {
    if (db) {
      loadSyncQueue();
      loadLastSyncTime();
    }
  }, [db]);

  const initializeDatabase = async () => {
    try {
      const database = await openIndexedDB();
      setDb(database);
      setSyncStatus(prev => ({ ...prev, isInitialized: true }));
    } catch (error) {
      console.error('Failed to initialize database:', error);
      setError('Failed to initialize offline storage');
    }
  };

  const openIndexedDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        Object.values(STORES).forEach(storeName => {
          if (!database.objectStoreNames.contains(storeName)) {
            const store = database.createObjectStore(storeName, {
              keyPath: 'id',
              autoIncrement: true
            });

            // Add indexes for querying
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('priority', 'priority', { unique: false });
          }
        });
      };
    });
  };

  const loadSyncQueue = async () => {
    if (!db) return;

    try {
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readonly');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.getAll();

      request.onsuccess = () => {
        const queue = request.result as OfflineItem[];
        setSyncQueue(queue);
        setSyncStatus(prev => ({
          ...prev,
          pendingUploads: queue.filter(item => item.action !== 'download').length,
          pendingDownloads: queue.filter(item => item.action === 'download').length
        }));
      };
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  };

  const loadLastSyncTime = async () => {
    const lastSync = localStorage.getItem('skidspace-last-sync');
    if (lastSync) {
      setSyncStatus(prev => ({
        ...prev,
        lastSync: new Date(parseInt(lastSync))
      }));
    }
  };

  const addToSyncQueue = useCallback(async (item: Omit<OfflineItem, 'id' | 'retries'>) => {
    if (!db) return;

    try {
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);

      const offlineItem: OfflineItem = {
        ...item,
        id: `${item.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        retries: 0
      };

      await store.add(offlineItem);
      await loadSyncQueue();

      console.log('Added to sync queue:', offlineItem);
    } catch (error) {
      console.error('Failed to add to sync queue:', error);
    }
  }, [db]);

  const syncData = useCallback(async () => {
    if (!db || !syncStatus.isOnline || syncStatus.isSyncing) return;

    setSyncStatus(prev => ({ ...prev, isSyncing: true, syncProgress: 0 }));
    setError(null);

    try {
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.getAll();

      request.onsuccess = async () => {
        const queue = request.result as OfflineItem[];
        const totalItems = queue.length;

        if (totalItems === 0) {
          setSyncStatus(prev => ({
            ...prev,
            isSyncing: false,
            lastSync: new Date(),
            syncProgress: 100
          }));
          return;
        }

        let syncedItems = 0;

        for (const item of queue) {
          try {
            const success = await syncItem(item);

            if (success) {
              // Remove from queue
              await store.delete(item.id);
              syncedItems++;
            } else {
              // Increment retry count
              await store.put({ ...item, retries: item.retries + 1 });
            }

            // Update progress
            setSyncStatus(prev => ({
              ...prev,
              syncProgress: Math.round(((syncedItems + 1) / totalItems) * 100)
            }));

          } catch (error) {
            console.error(`Failed to sync item ${item.id}:`, error);
            // Update retry count
            await store.put({ ...item, retries: item.retries + 1 });
          }
        }

        // Update sync status
        setSyncStatus(prev => ({
          ...prev,
          isSyncing: false,
          lastSync: new Date(),
          syncProgress: 100,
          pendingUploads: queue.length - syncedItems
        }));

        // Store last sync time
        localStorage.setItem('skidspace-last-sync', Date.now().toString());

        // Reload queue to update counts
        await loadSyncQueue();

        onSyncComplete?.(syncedItems);
      };

    } catch (error) {
      console.error('Sync failed:', error);
      setError(error instanceof Error ? error.message : 'Sync failed');
      setSyncStatus(prev => ({ ...prev, isSyncing: false, syncProgress: 0 }));
      onSyncError?.(error instanceof Error ? error.message : 'Sync failed');
    }
  }, [db, syncStatus.isOnline, syncStatus.isSyncing, onSyncComplete, onSyncError]);

  const syncItem = async (item: OfflineItem): Promise<boolean> => {
    try {
      const endpoint = getEndpointForItem(item);
      const method = getMethodForAction(item.action);

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item.data)
      });

      return response.ok;
    } catch (error) {
      console.error('Network request failed:', error);
      return false;
    }
  };

  const getEndpointForItem = (item: OfflineItem): string => {
    const baseUrl = '/api';

    switch (item.type) {
      case 'inventory':
        return `${baseUrl}/inventory/sync`;
      case 'transaction':
        return `${baseUrl}/transactions/sync`;
      case 'location':
        return `${baseUrl}/locations/sync`;
      case 'user_action':
        return `${baseUrl}/actions/sync`;
      default:
        return `${baseUrl}/sync`;
    }
  };

  const getMethodForAction = (action: string): string => {
    switch (action) {
      case 'create':
        return 'POST';
      case 'update':
        return 'PUT';
      case 'delete':
        return 'DELETE';
      default:
        return 'POST';
    }
  };

  const clearOfflineData = async () => {
    if (!db) return;

    try {
      const transaction = db.transaction(Object.values(STORES), 'readwrite');

      await Promise.all(
        Object.values(STORES).map(storeName => {
          const store = transaction.objectStore(storeName);
          return store.clear();
        })
      );

      setSyncQueue([]);
      setSyncStatus(prev => ({
        ...prev,
        pendingUploads: 0,
        pendingDownloads: 0
      }));

      localStorage.removeItem('skidspace-last-sync');

    } catch (error) {
      console.error('Failed to clear offline data:', error);
      setError('Failed to clear offline data');
    }
  };

  const formatStorageSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getConnectionStatusColor = () => {
    if (syncStatus.isOnline) {
      return syncStatus.isSyncing ? 'text-blue-500' : 'text-green-500';
    }
    return 'text-red-500';
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              {syncStatus.isOnline ? (
                <Wifi className={cn("w-5 h-5", getConnectionStatusColor())} />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
              Offline Sync
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={syncStatus.isOnline ? "default" : "destructive"}
                className="text-xs"
              >
                {syncStatus.isOnline ? 'Online' : 'Offline'}
              </Badge>
              {syncStatus.isSyncing && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Syncing...</span>
                </div>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Sync Progress */}
          {syncStatus.isSyncing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Sync Progress</span>
                <span>{syncStatus.syncProgress}%</span>
              </div>
              <Progress value={syncStatus.syncProgress} className="h-2" />
            </div>
          )}

          {/* Sync Statistics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Upload className="w-4 h-4" />
                Pending Uploads
              </div>
              <div className="text-lg font-semibold">
                {syncStatus.pendingUploads}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Download className="w-4 h-4" />
                Pending Downloads
              </div>
              <div className="text-lg font-semibold">
                {syncStatus.pendingDownloads}
              </div>
            </div>
          </div>

          {/* Storage Usage */}
          {syncStatus.storageQuota > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4" />
                  Storage Used
                </div>
                <span>
                  {formatStorageSize(syncStatus.storageUsed)} / {formatStorageSize(syncStatus.storageQuota)}
                </span>
              </div>
              <Progress
                value={(syncStatus.storageUsed / syncStatus.storageQuota) * 100}
                className="h-2"
              />
            </div>
          )}

          {/* Last Sync */}
          {syncStatus.lastSync && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                Last Sync
              </div>
              <span>{formatTimeAgo(syncStatus.lastSync)}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={syncData}
              disabled={!syncStatus.isOnline || syncStatus.isSyncing || !syncStatus.isInitialized}
              className="flex-1"
            >
              {syncStatus.isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={clearOfflineData}
              disabled={syncStatus.isSyncing}
            >
              <Database className="w-4 h-4 mr-2" />
              Clear Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync Queue Details */}
      {syncQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sync Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {syncQueue.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {item.type}
                    </Badge>
                    <span className="text-sm capitalize">{item.action}</span>
                    {item.retries > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        Retries: {item.retries}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTimeAgo(new Date(item.timestamp))}
                  </div>
                </div>
              ))}

              {syncQueue.length > 10 && (
                <div className="text-center text-sm text-muted-foreground">
                  ... and {syncQueue.length - 10} more items
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Export utility function for adding items to sync queue
export const useOfflineSync = () => {
  const [db, setDb] = useState<IDBDatabase | null>(null);

  useEffect(() => {
    const openDB = async () => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => setDb(request.result);
    };
    openDB();
  }, []);

  const addToQueue = useCallback(async (
    type: OfflineItem['type'],
    action: OfflineItem['action'],
    data: any,
    priority: OfflineItem['priority'] = 'medium'
  ) => {
    if (!db) return;

    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);

    const item: OfflineItem = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      action,
      data,
      timestamp: Date.now(),
      retries: 0,
      priority
    };

    await store.add(item);
  }, [db]);

  return { addToQueue };
};

export default OfflineSync;