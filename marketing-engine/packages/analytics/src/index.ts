/**
 * Marketing Engine Analytics Package
 * Comprehensive analytics integration with GA4, Mixpanel, and custom attribution
 */

export * from './core';
export * from './ga4';
export * from './mixpanel';
export * from './custom-attribution';
export * from './database';
export * from './streaming';
export * from './compliance';

// Re-export main analytics client
export { AnalyticsClient } from './core/client';
export { AnalyticsConfig } from './core/config';
export { AnalyticsEvent } from './core/types';