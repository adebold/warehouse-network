// SkidSpace Static Asset URLs Configuration
// This file centralizes all static asset URLs for easy CDN management

const CDN_BASE_URL = process.env.NEXT_PUBLIC_CDN_BASE_URL || '';

// Brand Assets
export const BRAND_ASSETS = {
  logoIcon: `${CDN_BASE_URL}/brand/logo-icon.svg`,
  logoPrimary: `${CDN_BASE_URL}/brand/logo-primary.svg`,
  systemIcon: `${CDN_BASE_URL}/brand/system-icon.svg`,
  mapPin: `${CDN_BASE_URL}/brand/map-pin.svg`,
  mapPinActive: `${CDN_BASE_URL}/brand/map-pin-active.svg`,
} as const;

// Local fallback URLs (for development)
export const LOCAL_BRAND_ASSETS = {
  logoIcon: '/brand/logo-icon.svg',
  logoPrimary: '/brand/logo-primary.svg',
  systemIcon: '/brand/system-icon.svg',
  mapPin: '/brand/map-pin.svg',
  mapPinActive: '/brand/map-pin-active.svg',
} as const;

// Asset URL helper function
export function getAssetUrl(assetKey: keyof typeof BRAND_ASSETS): string {
  if (CDN_BASE_URL) {
    return BRAND_ASSETS[assetKey];
  }
  return LOCAL_BRAND_ASSETS[assetKey];
}

// Brand configuration
export const BRAND_CONFIG = {
  name: 'SkidSpace',
  tagline: 'The Airbnb of Warehouse Space',
  colors: {
    primary: '#0B5FFF',
    accent: '#FF8A1F',
    text: '#0B1220',
    muted: '#475569',
    border: '#E2E8F0',
    background: '#FFFFFF',
    backgroundMuted: '#F8FAFC',
  },
  fonts: {
    primary: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
} as const;