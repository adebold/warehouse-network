export interface Content {
  id: string;
  title: string;
  body: string;
  metadata: ContentMetadata;
  channels: Channel[];
  status: ContentStatus;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  scheduledAt?: Date;
  expiresAt?: Date;
}

export interface ContentMetadata {
  tags: string[];
  categories: string[];
  language: string;
  format: ContentFormat;
  customFields: Record<string, any>;
}

export enum ContentFormat {
  HTML = 'html',
  MARKDOWN = 'markdown',
  PLAINTEXT = 'plaintext',
  JSON = 'json',
  VIDEO = 'video',
  IMAGE = 'image',
  AUDIO = 'audio'
}

export enum ContentStatus {
  DRAFT = 'draft',
  REVIEW = 'review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  SCHEDULED = 'scheduled'
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  config: ChannelConfig;
  status: ChannelStatus;
  analytics: ChannelAnalytics;
}

export enum ChannelType {
  EMAIL = 'email',
  SMS = 'sms',
  SOCIAL_MEDIA = 'social_media',
  WEBSITE = 'website',
  MOBILE_APP = 'mobile_app',
  API = 'api',
  WEBHOOK = 'webhook'
}

export interface ChannelConfig {
  endpoint?: string;
  credentials?: Record<string, string>;
  headers?: Record<string, string>;
  retryPolicy: RetryPolicy;
  rateLimit: RateLimit;
  transformations?: ContentTransformation[];
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelay: number;
  maxDelay: number;
}

export interface RateLimit {
  requests: number;
  window: number; // in seconds
}

export interface ContentTransformation {
  type: TransformationType;
  config: Record<string, any>;
}

export enum TransformationType {
  RESIZE_IMAGE = 'resize_image',
  COMPRESS_VIDEO = 'compress_video',
  FORMAT_TEXT = 'format_text',
  TRANSLATE = 'translate',
  PERSONALIZE = 'personalize'
}

export enum ChannelStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
  ERROR = 'error'
}

export interface ChannelAnalytics {
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  conversionCount: number;
  revenue: number;
  lastActivity: Date;
}

export interface AnalyticsEvent {
  id: string;
  contentId: string;
  channelId: string;
  eventType: EventType;
  userId?: string;
  sessionId?: string;
  metadata: Record<string, any>;
  timestamp: Date;
  processed: boolean;
}

export enum EventType {
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  CONVERTED = 'converted',
  BOUNCED = 'bounced',
  COMPLAINED = 'complained',
  UNSUBSCRIBED = 'unsubscribed'
}

export interface KPI {
  id: string;
  name: string;
  description: string;
  formula: string;
  unit: KPIUnit;
  target?: number;
  frequency: KPIFrequency;
  dimensions: string[];
}

export enum KPIUnit {
  PERCENTAGE = 'percentage',
  CURRENCY = 'currency',
  COUNT = 'count',
  RATIO = 'ratio',
  DAYS = 'days',
  HOURS = 'hours'
}

export enum KPIFrequency {
  REALTIME = 'realtime',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

export interface KPIResult {
  kpiId: string;
  value: number;
  dimensions: Record<string, string>;
  period: {
    start: Date;
    end: Date;
  };
  calculatedAt: Date;
}

export interface PublishResult {
  contentId: string;
  channelId: string;
  success: boolean;
  message?: string;
  externalId?: string;
  publishedAt: Date;
  metrics?: {
    processingTime: number;
    bytesTransferred: number;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  active: boolean;
  createdAt: Date;
  lastLogin?: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}