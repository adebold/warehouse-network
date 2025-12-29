/**
 * Core module exports
 */

export { AnalyticsClient, AnalyticsClientOptions } from './client';
export { AnalyticsConfig, loadConfig } from './config';
export { Logger, createLogger, LogContext } from './logger';
export {
  AnalyticsEvent,
  EventContext,
  PageContext,
  DeviceContext,
  CampaignContext,
  ReferrerContext,
  EventIntegrations,
  UserProfile,
  ConversionEvent,
  ConversionItem,
  AttributionTouchpoint,
  AttributionModel,
  AttributionResult,
  AnalyticsMetrics,
  DataRetentionPolicy,
  GDPRRequest,
  EventHandler,
  ErrorHandler
} from './types';