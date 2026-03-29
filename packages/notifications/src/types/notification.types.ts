/**
 * Core notification system types and interfaces
 */

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  WEBHOOK = 'webhook',
  IN_APP = 'in_app'
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum NotificationStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum NotificationCategory {
  SYSTEM = 'system',
  SECURITY = 'security',
  BILLING = 'billing',
  INVENTORY = 'inventory',
  USER_ACTION = 'user_action',
  MARKETING = 'marketing',
  OPERATIONAL = 'operational'
}

export interface NotificationRecipient {
  id: string;
  type: 'user' | 'organization' | 'external';
  userId?: string;
  organizationId?: string;
  email?: string;
  phone?: string;
  deviceTokens?: string[];
  webhookUrl?: string;
  preferences?: NotificationPreferences;
}

export interface NotificationPreferences {
  channels: {
    [K in NotificationChannel]?: {
      enabled: boolean;
      priority?: NotificationPriority[];
      categories?: NotificationCategory[];
      quietHours?: {
        enabled: boolean;
        start: string; // HH:mm format
        end: string;   // HH:mm format
        timezone: string;
      };
    };
  };
  frequency?: {
    digest: boolean;
    immediate: boolean;
    daily: boolean;
    weekly: boolean;
  };
  optOut?: {
    marketing: boolean;
    promotional: boolean;
  };
}

export interface NotificationTemplate {
  id: string;
  name: string;
  description?: string;
  category: NotificationCategory;
  channels: NotificationChannel[];

  // Template content by channel
  content: {
    [K in NotificationChannel]?: {
      subject?: string;
      body: string;
      htmlBody?: string;
      metadata?: Record<string, any>;
    };
  };

  // Template variables and validation
  variables: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'object';
    required: boolean;
    description?: string;
    defaultValue?: any;
  }[];

  // Configuration
  priority: NotificationPriority;
  retryPolicy?: RetryPolicy;

  // Metadata
  version: string;
  isActive: boolean;
  organizationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  initialDelay: number; // seconds
  maxDelay: number;     // seconds
  retryableErrors: string[];
}

export interface NotificationRequest {
  id?: string;
  templateId?: string;

  // Recipients
  recipients: NotificationRecipient[];

  // Content (if not using template)
  subject?: string;
  content: string;
  htmlContent?: string;

  // Configuration
  channels: NotificationChannel[];
  priority: NotificationPriority;
  category: NotificationCategory;

  // Template variables
  variables?: Record<string, any>;

  // Scheduling
  scheduledAt?: Date;
  expiresAt?: Date;

  // Tracking and metadata
  trackingId?: string;
  metadata?: Record<string, any>;

  // Context
  organizationId?: string;
  userId?: string;

  // Retry configuration
  retryPolicy?: Partial<RetryPolicy>;
}

export interface NotificationResult {
  id: string;
  requestId: string;
  recipientId: string;
  channel: NotificationChannel;
  status: NotificationStatus;

  // Provider details
  providerId?: string;
  providerMessageId?: string;
  providerResponse?: any;

  // Delivery tracking
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  clickedAt?: Date;

  // Error handling
  error?: {
    code: string;
    message: string;
    details?: any;
  };

  // Retry tracking
  attemptCount: number;
  nextRetryAt?: Date;

  // Metadata
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationMetrics {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  deliveryRate: number;

  // By channel
  byChannel: {
    [K in NotificationChannel]?: {
      sent: number;
      delivered: number;
      failed: number;
      deliveryRate: number;
    };
  };

  // By category
  byCategory: {
    [K in NotificationCategory]?: {
      sent: number;
      delivered: number;
      failed: number;
      deliveryRate: number;
    };
  };

  // Time-based metrics
  averageDeliveryTime?: number; // seconds
  peakSendingTime?: Date;

  // Period
  startDate: Date;
  endDate: Date;
}

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: Date;
  signature?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
}

export interface NotificationEvent {
  type: 'notification.sent' | 'notification.delivered' | 'notification.failed' | 'notification.clicked' | 'notification.read';
  notificationId: string;
  recipientId: string;
  channel: NotificationChannel;
  timestamp: Date;
  data?: any;
  organizationId?: string;
}

export interface InAppNotification {
  id: string;
  userId: string;
  organizationId?: string;

  title: string;
  content: string;
  icon?: string;
  category: NotificationCategory;
  priority: NotificationPriority;

  // Action buttons
  actions?: {
    id: string;
    label: string;
    url?: string;
    action?: string;
    style?: 'primary' | 'secondary' | 'danger';
  }[];

  // State
  isRead: boolean;
  isArchived: boolean;
  readAt?: Date;

  // Metadata
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationProvider {
  readonly id: string;
  readonly name: string;
  readonly channels: NotificationChannel[];

  send(request: NotificationRequest, recipient: NotificationRecipient): Promise<NotificationResult>;
  getStatus(messageId: string): Promise<NotificationStatus>;
  validateConfiguration(): Promise<boolean>;
}

export interface NotificationQueue {
  add(request: NotificationRequest): Promise<void>;
  process(handler: (request: NotificationRequest) => Promise<void>): void;
  getStats(): Promise<QueueStats>;
  clear(): Promise<void>;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

// Configuration interfaces
export interface EmailProviderConfig {
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
}

export interface SMSProviderConfig {
  provider: 'twilio' | 'aws-sns' | 'vonage';
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
  fromNumber: string;
}

export interface PushProviderConfig {
  provider: 'fcm' | 'apns';
  serviceAccountKey?: string;
  keyId?: string;
  teamId?: string;
  bundleId?: string;
  privateKey?: string;
  production?: boolean;
}