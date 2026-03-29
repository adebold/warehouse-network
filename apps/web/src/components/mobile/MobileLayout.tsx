/**
 * Mobile Layout Component
 * Provides mobile-optimized layout with bottom navigation and responsive design
 */
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Home,
  Scan,
  MapPin,
  Package,
  User,
  Menu,
  Bell,
  Settings,
  ChevronLeft,
  Wifi,
  WifiOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MobileLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBackButton?: boolean;
  showNotifications?: boolean;
  rightAction?: React.ReactNode;
}

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/mobile/scan', icon: Scan, label: 'Scan' },
  { href: '/mobile/find', icon: MapPin, label: 'Find' },
  { href: '/inventory', icon: Package, label: 'Inventory' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export function MobileLayout({
  children,
  title,
  showBackButton = false,
  showNotifications = true,
  rightAction
}: MobileLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [notificationCount, setNotificationCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial state
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen for service worker messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SYNC_COMPLETE') {
        // Handle sync completion notification
        console.log('Data synced:', event.data.data);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard');
    }
  };

  const isActiveRoute = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Status Bar */}
      <div className="h-6 bg-background border-b border-border/5 flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isOnline ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3 text-destructive" />
          )}
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {/* Header */}
      <header className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          {showBackButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="p-2 h-auto text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}

          {!showBackButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 h-auto text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}

          <h1 className="text-lg font-semibold truncate">
            {title || 'SkidSpace'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {showNotifications && (
            <Button
              variant="ghost"
              size="sm"
              className="p-2 h-auto relative text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => router.push('/notifications')}
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs bg-destructive text-destructive-foreground">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </Badge>
              )}
            </Button>
          )}

          {rightAction}
        </div>
      </header>

      {/* Side Menu Overlay */}
      {showMenu && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setShowMenu(false)}
        >
          <div className="w-64 h-full bg-background border-r border-border p-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Menu</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMenu(false)}
              >
                ×
              </Button>
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => (
                <Button
                  key={item.href}
                  variant={isActiveRoute(item.href) ? "default" : "ghost"}
                  className="w-full justify-start gap-3"
                  onClick={() => {
                    router.push(item.href);
                    setShowMenu(false);
                  }}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                  {item.badge && (
                    <Badge className="ml-auto">
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              ))}

              <div className="border-t pt-4 mt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3"
                  onClick={() => {
                    router.push('/settings');
                    setShowMenu(false);
                  }}
                >
                  <Settings className="w-5 h-5" />
                  Settings
                </Button>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-16">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-2 py-1 safe-area-bottom">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-3 relative",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
                onClick={() => router.push(item.href)}
              >
                <item.icon className={cn(
                  "w-5 h-5",
                  isActive && "text-primary"
                )} />
                <span className="text-xs font-medium">
                  {item.label}
                </span>
                {item.badge && (
                  <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs">
                    {item.badge}
                  </Badge>
                )}
                {isActive && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-primary rounded-b" />
                )}
              </Button>
            );
          })}
        </div>
      </nav>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-14 left-0 right-0 bg-destructive text-destructive-foreground px-4 py-2 text-sm text-center z-50">
          <div className="flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            You're offline. Some features may be limited.
          </div>
        </div>
      )}

      {/* Safe Area Padding for devices with notches */}
      <style jsx>{`
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom);
        }
      `}</style>
    </div>
  );
}

export default MobileLayout;