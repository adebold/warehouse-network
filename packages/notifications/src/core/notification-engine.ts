/**
 * Core Notification Engine - Orchestrates all notification processing
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from 'winston';
import {
  NotificationRequest,
  NotificationResult,
  NotificationChannel,
  NotificationStatus,
  NotificationRecipient,
  NotificationProvider,
  NotificationQueue,
  NotificationTemplate,
  NotificationEvent,
  NotificationMetrics,
  NotificationCategory,
  NotificationPriority
} from '../types/notification.types';
import { TemplateEngine } from './template-engine';
import { PreferenceManager } from './preference-manager';
import { AnalyticsCollector } from '../analytics/analytics-collector';
import { createLogger } from '../utils/logger';
import { validateNotificationRequest } from '../utils/validation';

export interface NotificationEngineConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  providers: {
    [key: string]: NotificationProvider;
  };
  defaultRetryPolicy: {
    maxAttempts: number;
    backoffStrategy: 'linear' | 'exponential' | 'fixed';
    initialDelay: number;
    maxDelay: number;
  };
  rateLimits: {
    [K in NotificationChannel]?: {
      perSecond: number;
      perMinute: number;
      perHour: number;
    };
  };
  analytics: {
    enabled: boolean;
    retentionDays: number;
  };
}

export class NotificationEngine extends EventEmitter {
  private redis: Redis;
  private providers: Map<string, NotificationProvider>;
  private queue: NotificationQueue;
  private templateEngine: TemplateEngine;
  private preferenceManager: PreferenceManager;
  private analyticsCollector: AnalyticsCollector;
  private logger: Logger;
  private isShuttingDown = false;

  constructor(private config: NotificationEngineConfig) {
    super();
    this.logger = createLogger('NotificationEngine');
    this.redis = new Redis(config.redis);
    this.providers = new Map();

    this.setupProviders();
    this.setupQueue();
    this.templateEngine = new TemplateEngine();
    this.preferenceManager = new PreferenceManager(this.redis);
    this.analyticsCollector = new AnalyticsCollector(this.redis, config.analytics);

    this.setupEventHandlers();
  }

  /**
   * Initialize the notification engine
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing notification engine...');

      // Test Redis connection
      await this.redis.ping();

      // Initialize providers
      for (const [id, provider] of this.providers) {
        const isValid = await provider.validateConfiguration();
        if (!isValid) {
          this.logger.warn(`Provider ${id} configuration is invalid`);
        }
      }

      // Start queue processing
      this.queue.process(this.processNotification.bind(this));

      // Initialize analytics
      await this.analyticsCollector.initialize();

      this.logger.info('Notification engine initialized successfully');
      this.emit('engine:initialized');
    } catch (error) {
      this.logger.error('Failed to initialize notification engine:', error);
      throw error;
    }
  }

  /**
   * Send a notification
   */
  async send(request: NotificationRequest): Promise<string[]> {
    try {
      // Validate request
      const validation = validateNotificationRequest(request);
      if (!validation.isValid) {
        throw new Error(`Invalid notification request: ${validation.errors.join(', ')}`);
      }

      // Generate unique request ID if not provided
      if (!request.id) {
        request.id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      this.logger.info(`Processing notification request: ${request.id}`);

      // Process each recipient
      const resultIds: string[] = [];

      for (const recipient of request.recipients) {
        // Get user preferences
        const preferences = await this.preferenceManager.getPreferences(recipient.id);

        // Filter channels based on preferences
        const allowedChannels = this.filterChannelsByPreferences(
          request.channels,
          request.category,
          request.priority,
          preferences
        );

        if (allowedChannels.length === 0) {
          this.logger.info(`No allowed channels for recipient ${recipient.id}`);
          continue;
        }

        // Create notification for each allowed channel
        for (const channel of allowedChannels) {
          const notificationRequest = {
            ...request,
            channels: [channel],
            recipients: [recipient]
          };

          // Add to queue
          await this.queue.add(notificationRequest);
          resultIds.push(`${request.id}_${recipient.id}_${channel}`);
        }
      }

      this.emit('notification:queued', { requestId: request.id, count: resultIds.length });
      return resultIds;
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulk(requests: NotificationRequest[]): Promise<string[][]> {
    const results: string[][] = [];

    for (const request of requests) {
      try {
        const requestResults = await this.send(request);
        results.push(requestResults);
      } catch (error) {
        this.logger.error(`Failed to send bulk notification:`, error);
        results.push([]);
      }
    }

    return results;
  }

  /**
   * Get notification status
   */
  async getStatus(notificationId: string): Promise<NotificationResult | null> {
    try {
      const statusKey = `notification:status:${notificationId}`;
      const status = await this.redis.get(statusKey);

      if (!status) {
        return null;
      }

      return JSON.parse(status) as NotificationResult;
    } catch (error) {
      this.logger.error('Failed to get notification status:', error);
      return null;
    }
  }

  /**
   * Get analytics metrics
   */
  async getMetrics(
    startDate: Date,
    endDate: Date,
    organizationId?: string
  ): Promise<NotificationMetrics> {
    return this.analyticsCollector.getMetrics(startDate, endDate, organizationId);
  }

  /**
   * Register a notification provider
   */
  registerProvider(id: string, provider: NotificationProvider): void {
    this.providers.set(id, provider);
    this.logger.info(`Registered notification provider: ${id}`);
  }

  /**
   * Register a notification template
   */
  async registerTemplate(template: NotificationTemplate): Promise<void> {
    await this.templateEngine.registerTemplate(template);
    this.logger.info(`Registered notification template: ${template.id}`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Shutting down notification engine...');

    try {
      // Stop accepting new notifications
      this.emit('engine:shutdown');

      // Clear queue processing
      await this.queue.clear();

      // Close Redis connection
      await this.redis.quit();

      this.logger.info('Notification engine shut down successfully');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Process a single notification
   */
  private async processNotification(request: NotificationRequest): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    const startTime = Date.now();

    try {
      const recipient = request.recipients[0];
      const channel = request.channels[0];
      const notificationId = `${request.id}_${recipient.id}_${channel}`;

      this.logger.info(`Processing notification: ${notificationId}`);

      // Update status to processing
      await this.updateNotificationStatus(notificationId, {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel,
        status: NotificationStatus.PROCESSING,
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Compile template if using one
      let compiledContent = request.content;
      let compiledSubject = request.subject;
      let compiledHtmlContent = request.htmlContent;

      if (request.templateId) {
        const compiled = await this.templateEngine.compile(
          request.templateId,
          channel,
          request.variables || {},
          recipient.organizationId
        );
        compiledContent = compiled.body;
        compiledSubject = compiled.subject;
        compiledHtmlContent = compiled.htmlBody;
      }

      // Get appropriate provider
      const provider = this.getProviderForChannel(channel);
      if (!provider) {
        throw new Error(`No provider available for channel: ${channel}`);
      }

      // Send notification
      const result = await provider.send({
        ...request,
        content: compiledContent,
        subject: compiledSubject,
        htmlContent: compiledHtmlContent
      }, recipient);

      // Update status to sent
      result.status = NotificationStatus.SENT;
      result.sentAt = new Date();
      await this.updateNotificationStatus(notificationId, result);

      // Collect analytics
      await this.analyticsCollector.recordNotification({
        type: 'notification.sent',
        notificationId,
        recipientId: recipient.id,
        channel,
        timestamp: new Date(),
        organizationId: recipient.organizationId
      });

      // Emit event
      this.emit('notification:sent', result);

      this.logger.info(`Notification sent successfully: ${notificationId} (${Date.now() - startTime}ms)`);
    } catch (error) {
      this.logger.error(`Failed to process notification:`, error);

      // Handle retry logic here
      await this.handleNotificationFailure(request, error);
    }
  }

  /**
   * Handle notification failure and retry logic
   */
  private async handleNotificationFailure(
    request: NotificationRequest,
    error: any
  ): Promise<void> {
    const recipient = request.recipients[0];
    const channel = request.channels[0];
    const notificationId = `${request.id}_${recipient.id}_${channel}`;

    const failureResult: NotificationResult = {
      id: notificationId,
      requestId: request.id!,
      recipientId: recipient.id,
      channel,
      status: NotificationStatus.FAILED,
      attemptCount: 1,
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message,
        details: error
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.updateNotificationStatus(notificationId, failureResult);

    // Collect analytics
    await this.analyticsCollector.recordNotification({
      type: 'notification.failed',
      notificationId,
      recipientId: recipient.id,
      channel,
      timestamp: new Date(),
      data: { error: error.message },
      organizationId: recipient.organizationId
    });

    this.emit('notification:failed', failureResult);
  }

  /**
   * Update notification status in Redis
   */
  private async updateNotificationStatus(
    notificationId: string,
    result: NotificationResult
  ): Promise<void> {
    const statusKey = `notification:status:${notificationId}`;
    await this.redis.setex(statusKey, 86400 * 7, JSON.stringify(result)); // Keep for 7 days
  }

  /**
   * Get provider for specific channel
   */
  private getProviderForChannel(channel: NotificationChannel): NotificationProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.channels.includes(channel)) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Filter channels based on user preferences
   */
  private filterChannelsByPreferences(
    channels: NotificationChannel[],
    category: NotificationCategory,
    priority: NotificationPriority,
    preferences: any
  ): NotificationChannel[] {
    if (!preferences?.channels) {
      return channels;
    }

    return channels.filter(channel => {
      const channelPrefs = preferences.channels[channel];
      if (!channelPrefs?.enabled) {
        return false;
      }

      // Check priority filter
      if (channelPrefs.priority && !channelPrefs.priority.includes(priority)) {
        return false;
      }

      // Check category filter
      if (channelPrefs.categories && !channelPrefs.categories.includes(category)) {
        return false;
      }

      // Check quiet hours
      if (channelPrefs.quietHours?.enabled) {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5); // HH:mm format
        const { start, end } = channelPrefs.quietHours;

        if (start <= end) {
          // Same day quiet hours
          if (currentTime >= start && currentTime <= end) {
            return priority === NotificationPriority.CRITICAL;
          }
        } else {
          // Overnight quiet hours
          if (currentTime >= start || currentTime <= end) {
            return priority === NotificationPriority.CRITICAL;
          }
        }
      }

      return true;
    });
  }

  /**
   * Setup providers from config
   */
  private setupProviders(): void {
    for (const [id, provider] of Object.entries(this.config.providers)) {
      this.providers.set(id, provider);
    }
  }

  /**
   * Setup notification queue
   */
  private setupQueue(): void {
    // Queue implementation would be injected or created here
    // For now, using a simple in-memory queue placeholder
    this.queue = {
      add: async (request: NotificationRequest) => {
        // Add to Redis-based queue
        await this.redis.lpush('notification:queue', JSON.stringify(request));
      },
      process: (handler: (request: NotificationRequest) => Promise<void>) => {
        // Start queue processor
        this.startQueueProcessor(handler);
      },
      getStats: async () => ({
        pending: await this.redis.llen('notification:queue'),
        processing: 0,
        completed: 0,
        failed: 0
      }),
      clear: async () => {
        await this.redis.del('notification:queue');
      }
    };
  }

  /**
   * Start queue processor
   */
  private async startQueueProcessor(handler: (request: NotificationRequest) => Promise<void>): Promise<void> {
    const processQueue = async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        const item = await this.redis.brpop('notification:queue', 1);
        if (item) {
          const request = JSON.parse(item[1]) as NotificationRequest;
          await handler(request);
        }
      } catch (error) {
        this.logger.error('Queue processing error:', error);
      }

      // Continue processing
      setImmediate(processQueue);
    };

    processQueue();
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('notification:sent', (result: NotificationResult) => {
      this.logger.debug(`Notification sent: ${result.id}`);
    });

    this.on('notification:failed', (result: NotificationResult) => {
      this.logger.warn(`Notification failed: ${result.id} - ${result.error?.message}`);
    });
  }
}