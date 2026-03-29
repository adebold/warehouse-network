/**
 * Offline Page
 * Displayed when the app is accessed offline
 */
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  WifiOff,
  RefreshCw,
  Database,
  Clock,
  Home,
  Package,
  User,
  Settings
} from 'lucide-react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [cachedData, setCachedData] = useState({
    inventory: 0,
    warehouses: 0,
    notifications: 0
  });

  useEffect(() => {
    // Check online status
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Load cached data info
    loadCachedDataInfo();

    // Load last sync time
    const savedLastSync = localStorage.getItem('skidspace-last-sync');
    if (savedLastSync) {
      setLastSync(new Date(parseInt(savedLastSync)));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadCachedDataInfo = async () => {
    try {
      // Check IndexedDB for cached data
      const request = indexedDB.open('skidspace-offline', 1);

      request.onsuccess = async () => {
        const db = request.result;

        const inventoryCount = await getStoreCount(db, 'inventory');
        const warehousesCount = await getStoreCount(db, 'warehouses');
        const notificationsCount = await getStoreCount(db, 'notifications');

        setCachedData({
          inventory: inventoryCount,
          warehouses: warehousesCount,
          notifications: notificationsCount
        });
      };
    } catch (error) {
      console.error('Failed to load cached data info:', error);
    }
  };

  const getStoreCount = (db: IDBDatabase, storeName: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve(0);
        return;
      }

      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const navigateOffline = (path: string) => {
    // Navigate to cached pages
    window.location.href = path;
  };

  const formatLastSync = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Less than an hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  return (
    <>
      <Head>
        <title>Offline - SkidSpace</title>
        <meta name="description" content="SkidSpace is currently offline" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="bg-primary text-primary-foreground px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">SkidSpace</h1>
            <div className="flex items-center gap-2">
              <WifiOff className="w-5 h-5" />
              <span className="text-sm">Offline</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 space-y-6">
          {/* Connection Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isOnline ? (
                  <>
                    <RefreshCw className="w-5 h-5 text-green-500" />
                    <span className="text-green-500">Connection Restored</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-5 h-5 text-red-500" />
                    <span className="text-red-500">You're Offline</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isOnline ? (
                <Alert>
                  <RefreshCw className="h-4 w-4" />
                  <AlertDescription>
                    Your connection has been restored. Click refresh to reload the app with the latest data.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <WifiOff className="h-4 w-4" />
                  <AlertDescription>
                    You're currently offline. Some features may be limited, but you can still access cached data and perform offline actions.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleRefresh}
                className={`w-full ${isOnline ? 'bg-green-600 hover:bg-green-700' : ''}`}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {isOnline ? 'Reload App' : 'Try Again'}
              </Button>
            </CardContent>
          </Card>

          {/* Cached Data Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Available Offline Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{cachedData.inventory}</div>
                  <div className="text-sm text-muted-foreground">Inventory Items</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{cachedData.warehouses}</div>
                  <div className="text-sm text-muted-foreground">Warehouses</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{cachedData.notifications}</div>
                  <div className="text-sm text-muted-foreground">Notifications</div>
                </div>
              </div>

              {lastSync && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Last synced: {formatLastSync(lastSync)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Offline Navigation */}
          <Card>
            <CardHeader>
              <CardTitle>What You Can Do Offline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigateOffline('/dashboard')}
                  className="h-20 flex flex-col gap-2"
                >
                  <Home className="w-6 h-6" />
                  <span className="text-sm">Dashboard</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigateOffline('/inventory')}
                  className="h-20 flex flex-col gap-2"
                >
                  <Package className="w-6 h-6" />
                  <span className="text-sm">Inventory</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigateOffline('/profile')}
                  className="h-20 flex flex-col gap-2"
                >
                  <User className="w-6 h-6" />
                  <span className="text-sm">Profile</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigateOffline('/settings')}
                  className="h-20 flex flex-col gap-2"
                >
                  <Settings className="w-6 h-6" />
                  <span className="text-sm">Settings</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Offline Features */}
          <Card>
            <CardHeader>
              <CardTitle>Offline Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  View cached inventory and warehouse data
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Scan barcodes and queue updates
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Record transactions for later sync
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Access your profile and settings
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  Limited search functionality
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  Real-time updates not available
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <CardTitle>Offline Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• All actions you perform offline will be synced when you reconnect</li>
                <li>• Barcode scans and inventory updates are saved locally</li>
                <li>• Check your connection and refresh to get the latest data</li>
                <li>• Some features require an active internet connection</li>
              </ul>
            </CardContent>
          </Card>
        </main>

        {/* Footer */}
        <footer className="p-4 text-center text-sm text-muted-foreground border-t">
          <p>SkidSpace - Smart Warehouse Management</p>
          <p>Working offline with cached data</p>
        </footer>
      </div>
    </>
  );
}