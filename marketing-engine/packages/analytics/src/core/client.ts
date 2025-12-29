/**
 * Main analytics client
 */

import { v4 as uuidv4 } from 'uuid';
import { AnalyticsConfig, loadConfig } from './config';
import { Logger, createLogger } from './logger';
import { 
  AnalyticsEvent, 
  ConversionEvent, 
  UserProfile,
  AttributionModel,
  GDPRRequest
} from './types';
import { DatabasePool } from '../database/pool';
import { AnalyticsRepository } from '../database/repository';
import { RedisStreamProcessor } from '../streaming/redis-stream';
import { EventProcessor } from '../streaming/event-processor';
import { GA4Client } from '../ga4/client';
import { MixpanelClient } from '../mixpanel/client';
import { AttributionEngine } from '../custom-attribution/engine';
import { GDPRManager } from '../compliance/gdpr';
import { RetentionManager } from '../compliance/retention';

export interface AnalyticsClientOptions {
  config?: AnalyticsConfig;
  logger?: Logger;
}

export class AnalyticsClient {
  private readonly config: AnalyticsConfig;
  private readonly logger: Logger;
  private readonly databasePool: DatabasePool;
  private readonly repository: AnalyticsRepository;
  private readonly redisStream: RedisStreamProcessor;
  private readonly eventProcessor: EventProcessor;
  private readonly ga4Client: GA4Client;
  private readonly mixpanelClient: MixpanelClient;
  private readonly attributionEngine: AttributionEngine;
  private readonly gdprManager: GDPRManager;
  private readonly retentionManager: RetentionManager;
  private isInitialized: boolean = false;

  constructor(options: AnalyticsClientOptions = {}) {
    this.config = options.config || loadConfig();
    this.logger = options.logger || createLogger(this.config.monitoring);

    // Initialize database
    this.databasePool = new DatabasePool({
      config: this.config.database,
      logger: this.logger
    });

    this.repository = new AnalyticsRepository({
      pool: this.databasePool,
      logger: this.logger
    });

    // Initialize streaming
    this.redisStream = new RedisStreamProcessor({
      config: this.config.redis,
      logger: this.logger
    });

    // Initialize integrations
    this.ga4Client = new GA4Client({
      config: this.config.ga4,
      logger: this.logger
    });

    this.mixpanelClient = new MixpanelClient({
      config: this.config.mixpanel,
      logger: this.logger
    });

    // Initialize attribution
    this.attributionEngine = new AttributionEngine({
      pool: this.databasePool.getPool(),
      logger: this.logger,
      modelPath: this.config.attribution.modelPath
    });

    // Initialize event processor
    this.eventProcessor = new EventProcessor({
      redisStream: this.redisStream,
      ga4Client: this.ga4Client,
      mixpanelClient: this.mixpanelClient,
      attributionEngine: this.attributionEngine,
      repository: this.repository,
      logger: this.logger,
      batchSize: this.config.processing.realtimeBatchSize,
      processingInterval: this.config.processing.realtimeInterval
    });

    // Initialize compliance
    this.gdprManager = new GDPRManager({
      repository: this.repository,
      pool: this.databasePool.getPool(),
      logger: this.logger,
      encryptionKey: this.config.security.encryptionKey
    });

    this.retentionManager = new RetentionManager({
      pool: this.databasePool.getPool(),
      logger: this.logger,
      policy: this.config.compliance.gdpr.dataRetention
    });
  }

  /**
   * Initialize analytics client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('Initializing analytics client');

    try {
      // Test database connection
      const dbHealthy = await this.databasePool.healthCheck();
      if (!dbHealthy) {
        throw new Error('Database health check failed');
      }

      // Start event processor
      await this.eventProcessor.start();

      // Start scheduled tasks
      if (this.config.compliance.gdpr.enabled) {
        this.retentionManager.startScheduledRetention();
      }

      this.isInitialized = true;
      this.logger.info('Analytics client initialized');
    } catch (error) {
      this.logger.error('Failed to initialize analytics client', error);
      throw error;
    }
  }

  /**
   * Track an event
   */
  async track(
    eventName: string,
    userId: string | null,
    anonymousId: string,
    properties: Record<string, any> = {},
    context: Partial<AnalyticsEvent['context']> = {}
  ): Promise<void> {
    const event: AnalyticsEvent = {
      eventId: uuidv4(),
      eventName,
      userId: userId || undefined,
      anonymousId,
      timestamp: new Date(),
      properties,
      context: {
        ip: context.ip || '0.0.0.0',
        userAgent: context.userAgent || 'Unknown',
        locale: context.locale || 'en-US',
        timezone: context.timezone || 'UTC',
        ...context
      },
      integrations: {
        ga4: this.config.ga4.enabled,
        mixpanel: this.config.mixpanel.enabled,
        custom: true
      }
    };

    try {
      // Add to stream for processing
      await this.redisStream.addEvent(event);
      
      this.logger.debug('Event tracked', {
        eventId: event.eventId,
        eventName
      });
    } catch (error) {
      this.logger.error('Failed to track event', error, {
        eventName
      });
      throw error;
    }
  }

  /**
   * Track a conversion
   */
  async trackConversion(
    userId: string | null,
    anonymousId: string,
    conversionValue: number,
    currency: string = 'USD',
    properties: Record<string, any> = {},
    context: Partial<AnalyticsEvent['context']> = {}
  ): Promise<void> {
    const event: ConversionEvent = {
      eventId: uuidv4(),
      eventName: 'conversion',
      userId: userId || undefined,
      anonymousId,
      timestamp: new Date(),
      properties,
      context: {
        ip: context.ip || '0.0.0.0',
        userAgent: context.userAgent || 'Unknown',
        locale: context.locale || 'en-US',
        timezone: context.timezone || 'UTC',
        ...context
      },
      integrations: {
        ga4: this.config.ga4.enabled,
        mixpanel: this.config.mixpanel.enabled,
        custom: true
      },
      conversionValue,
      currency,
      transactionId: properties.transactionId,
      items: properties.items
    };

    try {
      // Add to stream for processing
      await this.redisStream.addEvent(event);
      
      this.logger.info('Conversion tracked', {
        eventId: event.eventId,
        value: conversionValue,
        currency
      });
    } catch (error) {
      this.logger.error('Failed to track conversion', error);
      throw error;
    }
  }

  /**
   * Identify a user
   */
  async identify(
    userId: string,
    traits: Record<string, any> = {}
  ): Promise<void> {
    const profile: UserProfile = {
      userId,
      traits,
      createdAt: new Date(),
      updatedAt: new Date(),
      integrations: {
        ga4Id: userId,
        mixpanelId: userId
      }
    };

    try {
      // Save profile
      await this.repository.saveUserProfile(profile);

      // Update in integrations
      await Promise.all([
        this.ga4Client.updateUserProperties(userId, userId, traits),
        this.mixpanelClient.updateUserProfile(profile)
      ]);

      this.logger.debug('User identified', { userId });
    } catch (error) {
      this.logger.error('Failed to identify user', error, { userId });
      throw error;
    }
  }

  /**
   * Alias user IDs
   */
  async alias(
    userId: string,
    anonymousId: string
  ): Promise<void> {
    try {
      await this.mixpanelClient.createAlias(userId, anonymousId);
      
      this.logger.debug('User alias created', {
        userId,
        anonymousId
      });
    } catch (error) {
      this.logger.error('Failed to create alias', error, {
        userId,
        anonymousId
      });
      throw error;
    }
  }

  /**
   * Get attribution results
   */
  async getAttribution(
    userId: string,
    model: string = 'linear'
  ): Promise<any> {
    return this.attributionEngine.analyzeJourney(userId, [model]);
  }

  /**
   * Create funnel analysis
   */
  async createFunnel(
    name: string,
    steps: string[],
    dateRange: { from: Date; to: Date }
  ): Promise<any> {
    return this.mixpanelClient.createFunnel(name, steps, dateRange);
  }

  /**
   * Create cohort
   */
  async createCohort(
    name: string,
    description: string,
    filter: any
  ): Promise<string> {
    return this.mixpanelClient.createCohort(name, description, filter);
  }

  /**
   * Process GDPR request
   */
  async processGDPRRequest(
    userId: string,
    requestType: GDPRRequest['type']
  ): Promise<string> {
    return this.gdprManager.processRequest({
      userId,
      type: requestType,
      status: 'pending'
    });
  }

  /**
   * Update user consent
   */
  async updateConsent(
    userId: string,
    consent: Record<string, boolean>
  ): Promise<void> {
    return this.gdprManager.updateConsent(userId, consent);
  }

  /**
   * Get analytics metrics
   */
  async getMetrics(
    startDate: Date,
    endDate: Date,
    groupBy: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<any[]> {
    return this.repository.getMetrics(startDate, endDate, groupBy);
  }

  /**
   * Get processing statistics
   */
  getStats(): any {
    return {
      database: this.databasePool.getStats(),
      processing: this.eventProcessor.getMetrics(),
      ga4: this.ga4Client.getMetrics(),
      mixpanel: this.mixpanelClient.getMetrics()
    };
  }

  /**
   * Shutdown analytics client
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down analytics client');

    try {
      // Stop scheduled tasks
      this.retentionManager.stopScheduledRetention();

      // Stop event processor
      await this.eventProcessor.stop();

      // Flush integrations
      await Promise.all([
        this.ga4Client.shutdown(),
        this.mixpanelClient.shutdown()
      ]);

      // Shutdown Redis
      await this.redisStream.shutdown();

      // Shutdown database
      await this.databasePool.shutdown();

      // Flush logs
      await this.logger.flush();

      this.isInitialized = false;
      this.logger.info('Analytics client shut down');
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      throw error;
    }
  }
}