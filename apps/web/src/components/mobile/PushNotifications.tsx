/**
 * Push Notifications Component
 * Manages mobile push notification setup and handling
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Bell,
  BellOff,
  Settings,
  Check,
  X,
  AlertCircle,
  Info,
  MessageSquare,
  Package,
  MapPin,
  DollarSign,
  User,
  Smartphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PushNotificationsProps {
  onPermissionChange?: (granted: boolean) => void;
  onNotificationReceived?: (notification: NotificationData) => void;
  className?: string;
}

interface NotificationData {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
  timestamp: Date;
  category: NotificationCategory;
  read: boolean;
  actions?: NotificationAction[];
}

interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

interface NotificationPreferences {
  enabled: boolean;
  categories: {
    [key: string]: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  vibration: boolean;
  sound: boolean;
}

type NotificationCategory = 'inventory' | 'payment' | 'location' | 'social' | 'system' | 'promotion';

interface NotificationStatus {
  permission: NotificationPermission | 'unknown';
  supported: boolean;
  registered: boolean;
  subscription: PushSubscription | null;
}

const NOTIFICATION_CATEGORIES = [
  {
    id: 'inventory' as NotificationCategory,
    label: 'Inventory Updates',
    description: 'Stock levels, shipments, and warehouse activities',
    icon: Package,
    defaultEnabled: true
  },
  {
    id: 'payment' as NotificationCategory,
    label: 'Payment Alerts',
    description: 'Transaction confirmations and billing updates',
    icon: DollarSign,
    defaultEnabled: true
  },
  {
    id: 'location' as NotificationCategory,
    label: 'Location Services',
    description: 'Nearby warehouses and location-based offers',
    icon: MapPin,
    defaultEnabled: false
  },
  {
    id: 'social' as NotificationCategory,
    label: 'Messages',
    description: 'Chat messages and collaboration updates',
    icon: MessageSquare,
    defaultEnabled: true
  },
  {
    id: 'system' as NotificationCategory,
    label: 'System Alerts',
    description: 'Security updates and system maintenance',
    icon: AlertCircle,
    defaultEnabled: true
  },
  {
    id: 'promotion' as NotificationCategory,
    label: 'Promotions',
    description: 'Special offers and promotional content',
    icon: Info,
    defaultEnabled: false
  }
];

export function PushNotifications({
  onPermissionChange,
  onNotificationReceived,
  className
}: PushNotificationsProps) {
  const [status, setStatus] = useState<NotificationStatus>({
    permission: 'unknown',
    supported: false,
    registered: false,
    subscription: null
  });

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    enabled: false,
    categories: {},
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    },
    vibration: true,
    sound: true
  });

  const [recentNotifications, setRecentNotifications] = useState<NotificationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize notification system
  useEffect(() => {
    initializeNotifications();
    loadPreferences();
  }, []);

  // Listen for notifications
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
  }, []);

  const initializeNotifications = async () => {
    // Check browser support
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

    if (!supported) {
      setStatus(prev => ({ ...prev, supported: false }));
      return;
    }

    // Get current permission
    const permission = Notification.permission;

    // Load existing subscription
    const registration = await navigator.serviceWorker.getRegistration();
    let subscription = null;

    if (registration) {
      subscription = await registration.pushManager.getSubscription();
    }

    setStatus({
      permission,
      supported: true,
      registered: !!subscription,
      subscription
    });

    // Initialize default preferences
    const defaultPrefs = NOTIFICATION_CATEGORIES.reduce((acc, category) => ({
      ...acc,
      [category.id]: category.defaultEnabled
    }), {});

    setPreferences(prev => ({
      ...prev,
      categories: { ...defaultPrefs, ...prev.categories },
      enabled: permission === 'granted'
    }));
  };

  const loadPreferences = () => {
    const saved = localStorage.getItem('notification-preferences');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPreferences(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      }
    }
  };

  const savePreferences = useCallback((newPrefs: NotificationPreferences) => {
    localStorage.setItem('notification-preferences', JSON.stringify(newPrefs));
    setPreferences(newPrefs);
  }, []);

  const requestPermission = async () => {
    if (!status.supported) {
      throw new Error('Push notifications are not supported on this device');
    }

    setIsLoading(true);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        // Register service worker and subscribe to push
        const registration = await navigator.serviceWorker.ready;

        // Get VAPID public key from your server
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

        if (!vapidPublicKey) {
          throw new Error('VAPID key not configured');
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });

        // Send subscription to your server
        await saveSubscription(subscription);

        setStatus(prev => ({
          ...prev,
          permission: 'granted',
          registered: true,
          subscription
        }));

        setPreferences(prev => ({ ...prev, enabled: true }));
        onPermissionChange?.(true);

      } else {
        setStatus(prev => ({ ...prev, permission }));
        onPermissionChange?.(false);
      }

    } catch (error) {
      console.error('Failed to setup notifications:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const saveSubscription = async (subscription: PushSubscription) => {
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        preferences: preferences.categories
      })
    });
  };

  const unsubscribe = async () => {
    if (!status.subscription) return;

    setIsLoading(true);

    try {
      // Unsubscribe from push
      await status.subscription.unsubscribe();

      // Remove subscription from server
      await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: status.subscription.endpoint
        })
      });

      setStatus(prev => ({
        ...prev,
        registered: false,
        subscription: null
      }));

      setPreferences(prev => ({ ...prev, enabled: false }));
      onPermissionChange?.(false);

    } catch (error) {
      console.error('Failed to unsubscribe:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === 'NOTIFICATION_RECEIVED') {
      const notification: NotificationData = event.data.notification;
      setRecentNotifications(prev => [notification, ...prev.slice(0, 9)]);
      onNotificationReceived?.(notification);
    }
  };

  const updateCategoryPreference = (categoryId: string, enabled: boolean) => {
    const newPrefs = {
      ...preferences,
      categories: {
        ...preferences.categories,
        [categoryId]: enabled
      }
    };
    savePreferences(newPrefs);

    // Update server subscription
    if (status.subscription) {
      saveSubscription(status.subscription);
    }
  };

  const sendTestNotification = async () => {
    if (!status.registered) return;

    try {
      await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: status.subscription
        })
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const getPermissionStatusColor = () => {
    switch (status.permission) {
      case 'granted':
        return 'text-green-500';
      case 'denied':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  const getPermissionStatusText = () => {
    switch (status.permission) {
      case 'granted':
        return 'Enabled';
      case 'denied':
        return 'Blocked';
      case 'default':
        return 'Not set';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Push Notifications
            </div>
            <Badge
              variant={status.permission === 'granted' ? "default" : "secondary"}
              className={getPermissionStatusColor()}
            >
              {getPermissionStatusText()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status.supported && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Push notifications are not supported on this device or browser.
              </AlertDescription>
            </Alert>
          )}

          {status.supported && status.permission === 'denied' && (
            <Alert variant="destructive">
              <BellOff className="h-4 w-4" />
              <AlertDescription>
                Notifications are blocked. Please enable them in your browser settings to receive updates.
              </AlertDescription>
            </Alert>
          )}

          {status.supported && status.permission === 'default' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Enable notifications to receive real-time updates about your warehouse activities.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            {status.permission !== 'granted' ? (
              <Button
                onClick={requestPermission}
                disabled={!status.supported || isLoading}
                className="flex-1"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Setting up...
                  </div>
                ) : (
                  <>
                    <Bell className="w-4 h-4 mr-2" />
                    Enable Notifications
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  onClick={sendTestNotification}
                  disabled={!status.registered}
                  variant="outline"
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  Test
                </Button>
                <Button
                  onClick={unsubscribe}
                  disabled={isLoading}
                  variant="destructive"
                  className="flex-1"
                >
                  {isLoading ? (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <BellOff className="w-4 h-4 mr-2" />
                      Disable
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification Categories */}
      {status.permission === 'granted' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Notification Types
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <div key={category.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <category.icon className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label className="font-medium">{category.label}</Label>
                    <p className="text-sm text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.categories[category.id] || false}
                  onCheckedChange={(checked) => updateCategoryPreference(category.id, checked)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quiet Hours */}
      {status.permission === 'granted' && (
        <Card>
          <CardHeader>
            <CardTitle>Quiet Hours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Enable quiet hours</Label>
              <Switch
                checked={preferences.quietHours.enabled}
                onCheckedChange={(checked) =>
                  savePreferences({
                    ...preferences,
                    quietHours: { ...preferences.quietHours, enabled: checked }
                  })
                }
              />
            </div>

            {preferences.quietHours.enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start time</Label>
                  <input
                    type="time"
                    value={preferences.quietHours.start}
                    onChange={(e) =>
                      savePreferences({
                        ...preferences,
                        quietHours: { ...preferences.quietHours, start: e.target.value }
                      })
                    }
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End time</Label>
                  <input
                    type="time"
                    value={preferences.quietHours.end}
                    onChange={(e) =>
                      savePreferences({
                        ...preferences,
                        quietHours: { ...preferences.quietHours, end: e.target.value }
                      })
                    }
                    className="w-full p-2 border rounded-md"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Notifications */}
      {recentNotifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentNotifications.map((notification) => (
                <div key={notification.id} className="p-3 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{notification.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {notification.body}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {notification.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(notification.timestamp)}
                        </span>
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-primary rounded-full mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PushNotifications;