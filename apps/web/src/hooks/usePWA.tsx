/**
 * PWA Hook
 * Manages Progressive Web App functionality and installation
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  isOfflineCapable: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  updateAvailable: boolean;
  isLoading: boolean;
}

interface PWAActions {
  promptInstall: () => Promise<boolean>;
  refreshApp: () => void;
  dismissUpdate: () => void;
  checkForUpdates: () => Promise<boolean>;
}

interface UsePWAReturn extends PWAState, PWAActions {}

export function usePWA(): UsePWAReturn {
  const [pwaState, setPwaState] = useState<PWAState>({
    isInstallable: false,
    isInstalled: false,
    isOfflineCapable: false,
    installPrompt: null,
    updateAvailable: false,
    isLoading: true
  });

  // Check if app is installed
  const checkInstallStatus = useCallback(() => {
    const isInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (window.navigator as any).standalone === true;

    setPwaState(prev => ({ ...prev, isInstalled }));
  }, []);

  // Check offline capabilities
  const checkOfflineCapabilities = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const isOfflineCapable = !!registration;
        setPwaState(prev => ({ ...prev, isOfflineCapable }));
      } catch (error) {
        console.error('Failed to check offline capabilities:', error);
      }
    }
  }, []);

  // Check for app updates
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();

          // Check if there's a waiting service worker
          const hasUpdate = !!registration.waiting;

          if (hasUpdate !== pwaState.updateAvailable) {
            setPwaState(prev => ({ ...prev, updateAvailable: hasUpdate }));
          }

          return hasUpdate;
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    }
    return false;
  }, [pwaState.updateAvailable]);

  // Prompt user to install PWA
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!pwaState.installPrompt) {
      return false;
    }

    try {
      await pwaState.installPrompt.prompt();
      const choiceResult = await pwaState.installPrompt.userChoice;

      setPwaState(prev => ({
        ...prev,
        installPrompt: null,
        isInstallable: false
      }));

      return choiceResult.outcome === 'accepted';
    } catch (error) {
      console.error('Failed to prompt install:', error);
      return false;
    }
  }, [pwaState.installPrompt]);

  // Refresh app to apply updates
  const refreshApp = useCallback(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration?.waiting) {
          // Tell the waiting service worker to skip waiting and become active
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });

          // Listen for the new service worker to take control
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      });
    } else {
      window.location.reload();
    }
  }, []);

  // Dismiss update notification
  const dismissUpdate = useCallback(() => {
    setPwaState(prev => ({ ...prev, updateAvailable: false }));
  }, []);

  // Initialize PWA functionality
  useEffect(() => {
    const initializePWA = async () => {
      setPwaState(prev => ({ ...prev, isLoading: true }));

      // Check install status
      checkInstallStatus();

      // Check offline capabilities
      await checkOfflineCapabilities();

      // Check for updates
      await checkForUpdates();

      // Listen for beforeinstallprompt event
      const handleBeforeInstallPrompt = (event: Event) => {
        event.preventDefault();
        const installPrompt = event as BeforeInstallPromptEvent;

        setPwaState(prev => ({
          ...prev,
          isInstallable: true,
          installPrompt
        }));
      };

      // Listen for app installation
      const handleAppInstalled = () => {
        setPwaState(prev => ({
          ...prev,
          isInstalled: true,
          isInstallable: false,
          installPrompt: null
        }));
      };

      // Listen for service worker updates
      const handleServiceWorkerUpdate = () => {
        setPwaState(prev => ({ ...prev, updateAvailable: true }));
      };

      // Add event listeners
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', handleAppInstalled);

      // Service worker update listeners
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'SW_UPDATED') {
            handleServiceWorkerUpdate();
          }
        });

        // Listen for new service worker waiting
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!navigator.serviceWorker.controller?.scriptURL.includes('sw.js')) {
            return;
          }
          handleServiceWorkerUpdate();
        });

        // Check existing registration for waiting service worker
        navigator.serviceWorker.getRegistration().then(registration => {
          if (registration?.waiting) {
            handleServiceWorkerUpdate();
          }

          // Listen for new service workers installing
          registration?.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  handleServiceWorkerUpdate();
                }
              });
            }
          });
        });
      }

      setPwaState(prev => ({ ...prev, isLoading: false }));

      // Cleanup event listeners
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    };

    initializePWA();
  }, [checkInstallStatus, checkOfflineCapabilities, checkForUpdates]);

  // Periodically check for updates
  useEffect(() => {
    const interval = setInterval(() => {
      checkForUpdates();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [checkForUpdates]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      checkForUpdates();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [checkForUpdates]);

  // Listen for visibility change to check for updates when app becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkForUpdates();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkForUpdates]);

  return {
    ...pwaState,
    promptInstall,
    refreshApp,
    dismissUpdate,
    checkForUpdates
  };
}

export default usePWA;