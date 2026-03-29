/**
 * Warehouse Network Notifications Package
 * Enterprise-grade notification and communication system
 */

// Core exports
export { NotificationEngine, NotificationEngineConfig } from './core/notification-engine';
export { TemplateEngine, CompiledTemplate } from './core/template-engine';
export { PreferenceManager } from './core/preference-manager';
export { WorkflowEngine, NotificationWorkflow, WorkflowExecution, WorkflowTrigger, WorkflowCondition, WorkflowAction } from './core/workflow-engine';

// Provider exports
export { EmailProvider } from './providers/email-provider';
export { SMSProvider } from './providers/sms-provider';
export { PushProvider } from './providers/push-provider';
export { WebhookProvider, WebhookProviderConfig } from './providers/webhook-provider';
export { InAppProvider, InAppProviderConfig } from './providers/in-app-provider';

// Analytics exports
export { AnalyticsCollector, AnalyticsConfig } from './analytics/analytics-collector';

// Types exports
export * from './types/notification.types';

// Utility exports
export * from './utils/validation';
export { createLogger, getDefaultLogger } from './utils/logger';

// Template exports
export * from './templates/default-templates';

/**
 * Factory function to create a notification engine with default configuration
 */
export function createNotificationEngine(config: {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  email?: {
    provider: 'smtp' | 'ses' | 'sendgrid' | 'mailgun';
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: {
      user: string;
      pass: string;
    };
    apiKey?: string;
    region?: string;
    fromAddress: string;
    fromName: string;
  };
  sms?: {
    provider: 'twilio' | 'aws-sns' | 'vonage';
    accountSid?: string;
    authToken?: string;
    apiKey?: string;
    apiSecret?: string;
    fromNumber: string;
  };
  push?: {
    provider: 'fcm' | 'apns';
    serviceAccountKey?: string;
    keyId?: string;
    teamId?: string;
    bundleId?: string;
    privateKey?: string;
    production?: boolean;
  };
  webhook?: {
    defaultTimeout: number;
    maxRetries: number;
    retryDelay: number;
    signatureSecret?: string;
    userAgent: string;
    defaultHeaders: Record<string, string>;
  };
  analytics?: {
    enabled: boolean;
    retentionDays: number;
  };
}): NotificationEngine {
  const providers: any = {};

  // Setup email provider if configured
  if (config.email) {
    providers.email = new EmailProvider(config.email);
  }

  // Setup SMS provider if configured
  if (config.sms) {
    providers.sms = new SMSProvider(config.sms);
  }

  // Setup push provider if configured
  if (config.push) {
    providers.push = new PushProvider(config.push);
  }

  // Setup webhook provider if configured
  if (config.webhook) {
    providers.webhook = new WebhookProvider(config.webhook);
  }

  // Create notification engine
  const engine = new NotificationEngine({
    redis: config.redis,
    providers,
    defaultRetryPolicy: {
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      initialDelay: 1000,
      maxDelay: 30000
    },
    rateLimits: {
      email: {
        perSecond: 10,
        perMinute: 100,
        perHour: 1000
      },
      sms: {
        perSecond: 1,
        perMinute: 10,
        perHour: 100
      },
      push: {
        perSecond: 100,
        perMinute: 1000,
        perHour: 10000
      },
      webhook: {
        perSecond: 20,
        perMinute: 200,
        perHour: 2000
      }
    },
    analytics: {
      enabled: config.analytics?.enabled ?? true,
      retentionDays: config.analytics?.retentionDays ?? 90
    }
  });

  return engine;
}

/**
 * Factory function to create an in-app notification provider
 */
export function createInAppProvider(config: {
  redis: any;
  maxNotificationsPerUser?: number;
  retentionDays?: number;
  enableRealTimeUpdates?: boolean;
}): InAppProvider {
  return new InAppProvider({
    redis: config.redis,
    maxNotificationsPerUser: config.maxNotificationsPerUser ?? 1000,
    retentionDays: config.retentionDays ?? 30,
    enableRealTimeUpdates: config.enableRealTimeUpdates ?? true
  });
}

/**
 * Notification system version
 */
export const VERSION = '1.0.0';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  rateLimits: {
    email: { perSecond: 10, perMinute: 100, perHour: 1000 },
    sms: { perSecond: 1, perMinute: 10, perHour: 100 },
    push: { perSecond: 100, perMinute: 1000, perHour: 10000 },
    webhook: { perSecond: 20, perMinute: 200, perHour: 2000 },
    in_app: { perSecond: 1000, perMinute: 10000, perHour: 100000 }
  },
  retryPolicy: {
    maxAttempts: 3,
    backoffStrategy: 'exponential' as const,
    initialDelay: 1000,
    maxDelay: 30000
  },
  analytics: {
    enabled: true,
    retentionDays: 90,
    aggregationIntervals: {
      hourly: true,
      daily: true,
      weekly: false,
      monthly: false
    },
    enableRealTimeMetrics: true
  },
  webhook: {
    defaultTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    userAgent: 'Warehouse-Network-Notifications/1.0.0',
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  }
};

// Re-export important types for convenience
export type {
  NotificationRequest,
  NotificationResult,
  NotificationRecipient,
  NotificationTemplate,
  NotificationPreferences,
  NotificationMetrics,
  InAppNotification,
  WebhookPayload,
  NotificationEvent,
  EmailProviderConfig,
  SMSProviderConfig,
  PushProviderConfig
} from './types/notification.types';