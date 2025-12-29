/**
 * Core analytics types and interfaces
 */

export interface AnalyticsEvent {
  eventId: string;
  eventName: string;
  userId?: string;
  anonymousId: string;
  timestamp: Date;
  properties: Record<string, any>;
  context: EventContext;
  integrations?: EventIntegrations;
}

export interface EventContext {
  ip: string;
  userAgent: string;
  locale: string;
  timezone: string;
  page?: PageContext;
  device?: DeviceContext;
  campaign?: CampaignContext;
  referrer?: ReferrerContext;
}

export interface PageContext {
  url: string;
  path: string;
  title: string;
  referrer?: string;
  search?: string;
}

export interface DeviceContext {
  type: 'mobile' | 'tablet' | 'desktop' | 'bot';
  manufacturer?: string;
  model?: string;
  os?: {
    name: string;
    version: string;
  };
  browser?: {
    name: string;
    version: string;
  };
  screen?: {
    width: number;
    height: number;
  };
}

export interface CampaignContext {
  source?: string;
  medium?: string;
  name?: string;
  term?: string;
  content?: string;
  // UTM parameters
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface ReferrerContext {
  url: string;
  domain: string;
  type: 'direct' | 'organic' | 'paid' | 'social' | 'email' | 'referral';
}

export interface EventIntegrations {
  ga4?: boolean;
  mixpanel?: boolean;
  custom?: boolean;
}

export interface UserProfile {
  userId: string;
  traits: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  integrations: {
    ga4Id?: string;
    mixpanelId?: string;
  };
}

export interface ConversionEvent extends AnalyticsEvent {
  conversionValue: number;
  currency: string;
  transactionId?: string;
  items?: ConversionItem[];
}

export interface ConversionItem {
  itemId: string;
  itemName: string;
  category?: string;
  quantity: number;
  price: number;
  currency: string;
}

export interface AttributionTouchpoint {
  touchpointId: string;
  userId: string;
  timestamp: Date;
  channel: string;
  campaign?: string;
  source?: string;
  medium?: string;
  event: AnalyticsEvent;
  credit?: number; // Attribution credit (0-1)
}

export interface AttributionModel {
  modelId: string;
  name: string;
  type: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'position_based' | 'data_driven';
  lookbackWindow: number; // days
  parameters?: Record<string, any>;
}

export interface AttributionResult {
  conversionId: string;
  conversionValue: number;
  touchpoints: AttributionTouchpoint[];
  model: AttributionModel;
  calculatedAt: Date;
}

export interface AnalyticsMetrics {
  events: {
    total: number;
    byType: Record<string, number>;
    failureRate: number;
  };
  processing: {
    averageLatency: number;
    throughput: number;
    queueSize: number;
  };
  integrations: {
    [key: string]: {
      success: number;
      failure: number;
      latency: number;
    };
  };
}

export interface DataRetentionPolicy {
  retentionDays: number;
  anonymizeAfterDays: number;
  deleteAfterDays: number;
  excludeFields?: string[];
}

export interface GDPRRequest {
  requestId: string;
  userId: string;
  type: 'access' | 'deletion' | 'portability' | 'rectification';
  requestedAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  completedAt?: Date;
  result?: any;
}

export type EventHandler = (event: AnalyticsEvent) => Promise<void>;
export type ErrorHandler = (error: Error, context?: any) => void;