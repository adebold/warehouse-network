/**
 * Analytics Package Main Export
 * Comprehensive analytics and business intelligence for Skidspace warehouse marketplace
 */

// Core exports
export { AnalyticsEngine } from './core/analytics-engine';

// Service exports
export { MetricsCalculator } from './services/metrics-calculator';
export { EventProcessor } from './services/event-processor';
export { AlertManager } from './services/alert-manager';
export { ForecastEngine } from './services/forecast-engine';
export { CustomerBehaviorAnalyzer } from './services/customer-behavior';
export { PerformanceMonitor } from './services/performance-monitor';

// Type exports
export * from './types';

// Utility exports
export { createLogger, logger } from './utils/logger';

// Re-export commonly used types for convenience
export type {
  AnalyticsEventData,
  SessionData,
  KPIMetrics,
  MetricFilter,
  AlertRule,
  AlertNotification,
  CustomerJourneyData,
  ForecastData,
  DashboardConfig,
  SystemPerformanceMetrics,
  AnalyticsResponse
} from './types';