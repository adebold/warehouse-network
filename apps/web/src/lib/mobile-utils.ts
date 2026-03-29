/**
 * Mobile Utilities
 * Utility functions for mobile device detection and optimization
 */

// Device detection utilities
export const isMobile = (): boolean => {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
};

export const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false;

  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
};

export const isAndroid = (): boolean => {
  if (typeof window === 'undefined') return false;

  return /android/.test(navigator.userAgent.toLowerCase());
};

export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;

  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
};

// Viewport utilities
export const getViewportSize = () => {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return {
    width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
    height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
  };
};

export const isMobileViewport = (): boolean => {
  const { width } = getViewportSize();
  return width < 768; // Tailwind md breakpoint
};

// Touch and gesture utilities
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

export const supportsHover = (): boolean => {
  if (typeof window === 'undefined') return false;

  return window.matchMedia('(hover: hover)').matches;
};

// Performance optimization
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const getConnectionType = (): string => {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) {
    return 'unknown';
  }

  const connection = (navigator as any).connection;
  return connection.effectiveType || connection.type || 'unknown';
};

export const isSlowConnection = (): boolean => {
  const connectionType = getConnectionType();
  return ['slow-2g', '2g', '3g'].includes(connectionType);
};

// Storage utilities
export const getStorageQuota = async (): Promise<{ usage: number; quota: number } | null> => {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  } catch {
    return null;
  }
};

export const clearAppCache = async (): Promise<void> => {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
  }
};

// PWA utilities
export const isInstallable = (): boolean => {
  return typeof window !== 'undefined' &&
         'serviceWorker' in navigator &&
         'PushManager' in window;
};

export const requestWakeLock = async (): Promise<WakeLockSentinel | null> => {
  if ('wakeLock' in navigator) {
    try {
      return await (navigator as any).wakeLock.request('screen');
    } catch (err) {
      console.error('Wake lock failed:', err);
    }
  }
  return null;
};

// Haptic feedback
export const vibrate = (pattern: number | number[]): void => {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

export const hapticFeedback = {
  light: () => vibrate(50),
  medium: () => vibrate(100),
  heavy: () => vibrate(200),
  success: () => vibrate([100, 50, 100]),
  error: () => vibrate([200, 100, 200, 100, 200]),
  warning: () => vibrate([100, 100, 100])
};

// Orientation utilities
export const getOrientation = (): string => {
  if (typeof window === 'undefined') return 'unknown';

  if ('orientation' in window) {
    return Math.abs(window.orientation || 0) === 90 ? 'landscape' : 'portrait';
  }

  const { width, height } = getViewportSize();
  return width > height ? 'landscape' : 'portrait';
};

export const lockOrientation = async (orientation: OrientationLockType): Promise<void> => {
  if ('screen' in window && 'orientation' in window.screen && 'lock' in window.screen.orientation) {
    try {
      await window.screen.orientation.lock(orientation);
    } catch (err) {
      console.warn('Orientation lock failed:', err);
    }
  }
};

// Battery utilities
export const getBatteryInfo = async (): Promise<any | null> => {
  if ('getBattery' in navigator) {
    try {
      return await (navigator as any).getBattery();
    } catch {
      return null;
    }
  }
  return null;
};

export const isLowBattery = async (): Promise<boolean> => {
  const battery = await getBatteryInfo();
  return battery ? battery.level < 0.2 : false;
};

// Keyboard utilities
export const isVirtualKeyboardOpen = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Simple heuristic: if viewport height is significantly reduced on mobile
  if (!isMobile()) return false;

  const viewport = getViewportSize();
  const screenHeight = window.screen.height;

  return viewport.height < screenHeight * 0.75;
};

// Safe area utilities
export const getSafeAreaInsets = () => {
  if (typeof window === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const style = getComputedStyle(document.documentElement);

  return {
    top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0'),
    right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0'),
    bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0'),
    left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0')
  };
};

// Camera and media utilities
export const hasCameraAccess = async (): Promise<boolean> => {
  if (!('mediaDevices' in navigator)) return false;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch {
    return false;
  }
};

export const requestCameraPermission = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
};

// Location utilities
export const hasLocationAccess = (): boolean => {
  return 'geolocation' in navigator;
};

export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!hasLocationAccess()) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    });
  });
};

// Push notification utilities
export const canSendNotifications = (): boolean => {
  return 'Notification' in window && 'serviceWorker' in navigator;
};

export const getNotificationPermission = (): NotificationPermission => {
  return canSendNotifications() ? Notification.permission : 'denied';
};

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!canSendNotifications()) return 'denied';

  return await Notification.requestPermission();
};

// App badge utilities (experimental)
export const setAppBadge = (count?: number): void => {
  if ('setAppBadge' in navigator) {
    (navigator as any).setAppBadge(count);
  }
};

export const clearAppBadge = (): void => {
  if ('clearAppBadge' in navigator) {
    (navigator as any).clearAppBadge();
  }
};

// Fullscreen utilities
export const enterFullscreen = async (element?: Element): Promise<void> => {
  const target = element || document.documentElement;

  if (target.requestFullscreen) {
    await target.requestFullscreen();
  } else if ((target as any).webkitRequestFullscreen) {
    await (target as any).webkitRequestFullscreen();
  } else if ((target as any).msRequestFullscreen) {
    await (target as any).msRequestFullscreen();
  }
};

export const exitFullscreen = async (): Promise<void> => {
  if (document.exitFullscreen) {
    await document.exitFullscreen();
  } else if ((document as any).webkitExitFullscreen) {
    await (document as any).webkitExitFullscreen();
  } else if ((document as any).msExitFullscreen) {
    await (document as any).msExitFullscreen();
  }
};

export const isFullscreen = (): boolean => {
  return !!(document.fullscreenElement ||
           (document as any).webkitFullscreenElement ||
           (document as any).msFullscreenElement);
};

// NFC utilities (experimental)
export const hasNFCAccess = (): boolean => {
  return 'NDEFReader' in window;
};

export const readNFC = async (): Promise<any> => {
  if (!hasNFCAccess()) {
    throw new Error('NFC not supported');
  }

  const ndef = new (window as any).NDEFReader();
  await ndef.scan();

  return new Promise((resolve, reject) => {
    ndef.addEventListener('reading', ({ message }: any) => {
      resolve(message);
    });

    ndef.addEventListener('readingerror', reject);
  });
};

// Debug utilities
export const logDeviceInfo = (): void => {
  console.group('Device Information');
  console.log('User Agent:', navigator.userAgent);
  console.log('Mobile:', isMobile());
  console.log('iOS:', isIOS());
  console.log('Android:', isAndroid());
  console.log('Standalone:', isStandalone());
  console.log('Touch Device:', isTouchDevice());
  console.log('Supports Hover:', supportsHover());
  console.log('Viewport:', getViewportSize());
  console.log('Orientation:', getOrientation());
  console.log('Connection:', getConnectionType());
  console.log('Reduced Motion:', prefersReducedMotion());
  console.groupEnd();
};

export const mobileUtils = {
  // Device detection
  isMobile,
  isIOS,
  isAndroid,
  isStandalone,
  isTouchDevice,

  // Viewport
  getViewportSize,
  isMobileViewport,

  // Performance
  prefersReducedMotion,
  isSlowConnection,

  // Capabilities
  hasCameraAccess,
  hasLocationAccess,
  canSendNotifications,
  hasNFCAccess,

  // Utilities
  hapticFeedback,
  requestWakeLock,
  setAppBadge,
  clearAppBadge,
  logDeviceInfo
};