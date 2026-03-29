/**
 * PWA Install Banner Component
 * Prompts users to install the PWA on their device
 */
'use client';

import React, { useState, useEffect } from 'react';
import { X, Download, Smartphone, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePWA } from '@/hooks/usePWA';
import { cn } from '@/lib/utils';

interface PWAInstallBannerProps {
  className?: string;
  position?: 'top' | 'bottom' | 'floating';
  showOnMobileOnly?: boolean;
  autoShow?: boolean;
  onInstallSuccess?: () => void;
  onInstallDismiss?: () => void;
}

export function PWAInstallBanner({
  className,
  position = 'bottom',
  showOnMobileOnly = false,
  autoShow = true,
  onInstallSuccess,
  onInstallDismiss
}: PWAInstallBannerProps) {
  const {
    isInstallable,
    isInstalled,
    isLoading,
    promptInstall,
    updateAvailable,
    refreshApp,
    dismissUpdate
  } = usePWA();

  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      setIsMobile(mobile);
    };

    checkMobile();
  }, []);

  // Show banner logic
  useEffect(() => {
    const shouldShow =
      autoShow &&
      !isLoading &&
      !isInstalled &&
      !isDismissed &&
      isInstallable &&
      (!showOnMobileOnly || isMobile);

    setIsVisible(shouldShow);
  }, [autoShow, isLoading, isInstalled, isDismissed, isInstallable, showOnMobileOnly, isMobile]);

  // Load dismissed state
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = new Date(dismissed);
      const now = new Date();
      const daysSinceDismissed = (now.getTime() - dismissedTime.getTime()) / (1000 * 60 * 60 * 24);

      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        setIsDismissed(true);
      }
    }
  }, []);

  const handleInstall = async () => {
    setIsInstalling(true);

    try {
      const accepted = await promptInstall();

      if (accepted) {
        setIsVisible(false);
        setIsDismissed(true);
        onInstallSuccess?.();
      }
    } catch (error) {
      console.error('Installation failed:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
    onInstallDismiss?.();
  };

  const handleUpdate = () => {
    refreshApp();
  };

  const handleDismissUpdate = () => {
    dismissUpdate();
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'fixed top-4 left-4 right-4 z-50';
      case 'floating':
        return 'fixed bottom-20 left-4 right-4 z-50';
      default:
        return 'fixed bottom-4 left-4 right-4 z-50';
    }
  };

  const getInstallInstructions = () => {
    const userAgent = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(userAgent)) {
      return {
        icon: Smartphone,
        title: 'Add to Home Screen',
        steps: [
          'Tap the Share button',
          'Select "Add to Home Screen"',
          'Tap "Add" to confirm'
        ]
      };
    } else if (/android/.test(userAgent)) {
      return {
        icon: Smartphone,
        title: 'Install App',
        steps: [
          'Tap "Add to Home Screen"',
          'Follow the prompts to install',
          'Launch from your home screen'
        ]
      };
    } else {
      return {
        icon: Monitor,
        title: 'Install Desktop App',
        steps: [
          'Click "Install" in your browser',
          'Follow the installation prompts',
          'Launch from your desktop'
        ]
      };
    }
  };

  // Show update banner
  if (updateAvailable) {
    return (
      <div className={cn(getPositionClasses(), className)}>
        <Alert>
          <Download className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>A new version is available!</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdate}>
                Update
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismissUpdate}>
                Later
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Don't show if not visible
  if (!isVisible) return null;

  const instructions = getInstallInstructions();
  const Icon = instructions.icon;

  return (
    <div className={cn(getPositionClasses(), className)}>
      <Card className="p-4 shadow-lg border-primary/20">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
            <Icon className="w-6 h-6 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">
              Install SkidSpace App
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Get the full app experience with offline access, push notifications, and faster loading.
            </p>

            {/* Installation Benefits */}
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span>Offline access</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span>Push notifications</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span>Faster loading</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span>Native feel</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleInstall}
                disabled={isInstalling}
                className="flex-1"
              >
                {isInstalling ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                    Installing...
                  </div>
                ) : (
                  <>
                    <Download className="w-3 h-3 mr-1" />
                    Install
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="px-3"
              >
                Maybe Later
              </Button>
            </div>
          </div>

          {/* Close Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="flex-shrink-0 h-6 w-6 p-0"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        {/* Manual Instructions for iOS */}
        {/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs font-medium mb-2 text-muted-foreground">
              Manual Installation:
            </p>
            <ol className="text-xs text-muted-foreground space-y-1">
              {instructions.steps.map((step, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-4 h-4 bg-primary/10 rounded-full flex items-center justify-center text-[10px] font-medium">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>
    </div>
  );
}

export default PWAInstallBanner;