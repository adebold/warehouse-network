/**
 * Real-time event processor for analytics pipeline
 */

import { Logger } from '../core/logger';
import { AnalyticsEvent, ConversionEvent } from '../core/types';
import { RedisStreamProcessor, StreamMessage } from './redis-stream';
import { GA4Client } from '../ga4/client';
import { MixpanelClient } from '../mixpanel/client';
import { AttributionEngine } from '../custom-attribution/engine';
import { AnalyticsRepository } from '../database/repository';
import Bull from 'bull';

export interface EventProcessorOptions {
  redisStream: RedisStreamProcessor;
  ga4Client: GA4Client;
  mixpanelClient: MixpanelClient;
  attributionEngine: AttributionEngine;
  repository: AnalyticsRepository;
  logger: Logger;
  batchSize: number;
  processingInterval: number;
}

export interface ProcessingMetrics {
  processed: number;
  failed: number;
  avgProcessingTime: number;
  lastProcessedAt?: Date;
}

export class EventProcessor {
  private readonly redisStream: RedisStreamProcessor;
  private readonly ga4Client: GA4Client;
  private readonly mixpanelClient: MixpanelClient;
  private readonly attributionEngine: AttributionEngine;
  private readonly repository: AnalyticsRepository;
  private readonly logger: Logger;
  private readonly batchSize: number;
  private readonly processingInterval: number;
  private readonly processingQueue: Bull.Queue;
  private metrics: ProcessingMetrics = {
    processed: 0,
    failed: 0,
    avgProcessingTime: 0
  };
  private isRunning: boolean = false;

  constructor(options: EventProcessorOptions) {
    this.redisStream = options.redisStream;
    this.ga4Client = options.ga4Client;
    this.mixpanelClient = options.mixpanelClient;
    this.attributionEngine = options.attributionEngine;
    this.repository = options.repository;
    this.logger = options.logger.child({ component: 'EventProcessor' });
    this.batchSize = options.batchSize;
    this.processingInterval = options.processingInterval;

    // Initialize processing queue for handling bursts
    this.processingQueue = new Bull('analytics-processing', {
      redis: {
        port: 6379,
        host: 'localhost' // Would come from config in production
      },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    this.setupQueueHandlers();
  }

  /**
   * Setup queue event handlers
   */
  private setupQueueHandlers(): void {
    this.processingQueue.on('completed', (job) => {
      this.logger.debug('Job completed', { jobId: job.id });
    });

    this.processingQueue.on('failed', (job, err) => {
      this.logger.error('Job failed', err, { jobId: job.id });
      this.metrics.failed++;
    });

    this.processingQueue.on('stalled', (job) => {
      this.logger.warn('Job stalled', { jobId: job.id });
    });
  }

  /**
   * Start event processing
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Event processor already running');
    }

    this.isRunning = true;
    this.logger.info('Starting event processor', {
      batchSize: this.batchSize,
      processingInterval: this.processingInterval
    });

    // Start Redis stream consumer
    await this.redisStream.startConsumer(
      this.handleStreamMessages.bind(this),
      this.batchSize,
      this.processingInterval
    );

    // Process queue jobs
    this.processingQueue.process('process-event', 10, async (job) => {
      return this.processEvent(job.data.event);
    });

    // Schedule periodic tasks
    this.schedulePeriodicTasks();
  }

  /**
   * Handle messages from Redis stream
   */
  private async handleStreamMessages(messages: StreamMessage[]): Promise<void> {
    const startTime = Date.now();
    
    this.logger.debug('Processing stream messages', {
      count: messages.length
    });

    // Process messages in parallel batches
    const batchPromises = messages.map(message => 
      this.processingQueue.add('process-event', {
        event: message.data,
        messageId: message.id
      })
    );

    try {
      await Promise.all(batchPromises);
      
      const processingTime = Date.now() - startTime;
      this.updateMetrics(messages.length, processingTime);
      
      this.logger.info('Batch processed successfully', {
        count: messages.length,
        processingTime
      });
    } catch (error) {
      this.logger.error('Failed to process batch', error);
      throw error;
    }
  }

  /**
   * Process individual event
   */
  private async processEvent(event: AnalyticsEvent): Promise<void> {
    try {
      // Save to database
      await this.repository.saveEvent(event);

      // Process based on event type
      if (this.isConversionEvent(event)) {
        await this.processConversion(event as ConversionEvent);
      } else {
        await this.processTrackEvent(event);
      }

      // Track attribution touchpoint
      await this.trackAttribution(event);

      this.logger.debug('Event processed', {
        eventId: event.eventId,
        eventName: event.eventName
      });
    } catch (error) {
      this.logger.error('Failed to process event', error, {
        eventId: event.eventId
      });
      throw error;
    }
  }

  /**
   * Process tracking event
   */
  private async processTrackEvent(event: AnalyticsEvent): Promise<void> {
    // Send to integrations in parallel
    const promises: Promise<void>[] = [];

    if (event.integrations?.ga4 !== false) {
      promises.push(
        this.ga4Client.trackEvent(event)
          .catch(error => {
            this.logger.error('GA4 tracking failed', error, {
              eventId: event.eventId
            });
          })
      );
    }

    if (event.integrations?.mixpanel !== false) {
      promises.push(
        this.mixpanelClient.trackEvent(event)
          .catch(error => {
            this.logger.error('Mixpanel tracking failed', error, {
              eventId: event.eventId
            });
          })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Process conversion event
   */
  private async processConversion(event: ConversionEvent): Promise<void> {
    // Save conversion
    await this.repository.saveConversion(event);

    // Send to integrations
    const promises: Promise<void>[] = [];

    if (event.integrations?.ga4 !== false) {
      promises.push(
        this.ga4Client.trackConversion(event)
          .catch(error => {
            this.logger.error('GA4 conversion tracking failed', error, {
              eventId: event.eventId
            });
          })
      );
    }

    if (event.integrations?.mixpanel !== false) {
      promises.push(
        this.mixpanelClient.trackConversion(event)
          .catch(error => {
            this.logger.error('Mixpanel conversion tracking failed', error, {
              eventId: event.eventId
            });
          })
      );
    }

    // Process attribution
    if (event.userId) {
      promises.push(
        this.attributionEngine.processConversion(event)
          .catch(error => {
            this.logger.error('Attribution processing failed', error, {
              eventId: event.eventId
            });
          })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Track attribution touchpoint
   */
  private async trackAttribution(event: AnalyticsEvent): Promise<void> {
    if (!event.userId) return;

    try {
      const touchpoint = {
        touchpointId: `tp_${event.eventId}`,
        userId: event.userId,
        timestamp: event.timestamp,
        channel: this.extractChannel(event),
        campaign: event.context.campaign?.name,
        source: event.context.campaign?.source,
        medium: event.context.campaign?.medium,
        event
      };

      await this.attributionEngine.trackTouchpoint(touchpoint);
    } catch (error) {
      this.logger.error('Failed to track attribution touchpoint', error, {
        eventId: event.eventId
      });
    }
  }

  /**
   * Extract channel from event
   */
  private extractChannel(event: AnalyticsEvent): string {
    const { campaign, referrer } = event.context;
    
    if (campaign?.medium === 'cpc' || campaign?.medium === 'ppc') {
      return 'paid';
    } else if (campaign?.medium === 'email') {
      return 'email';
    } else if (campaign?.medium === 'social' || referrer?.type === 'social') {
      return 'social';
    } else if (referrer?.type === 'organic') {
      return 'organic';
    } else if (!referrer || referrer.type === 'direct') {
      return 'direct';
    } else {
      return 'referral';
    }
  }

  /**
   * Check if event is a conversion
   */
  private isConversionEvent(event: AnalyticsEvent): boolean {
    return (
      event.eventName.toLowerCase().includes('purchase') ||
      event.eventName.toLowerCase().includes('conversion') ||
      event.properties.revenue !== undefined ||
      event.properties.value !== undefined
    ) && 'conversionValue' in event;
  }

  /**
   * Schedule periodic tasks
   */
  private schedulePeriodicTasks(): void {
    // Flush integrations every minute
    setInterval(async () => {
      try {
        await Promise.all([
          this.ga4Client.flush(),
          this.mixpanelClient.flush()
        ]);
      } catch (error) {
        this.logger.error('Failed to flush integrations', error);
      }
    }, 60000);

    // Trim Redis stream every hour
    setInterval(async () => {
      try {
        await this.redisStream.trimStream(100000);
      } catch (error) {
        this.logger.error('Failed to trim stream', error);
      }
    }, 3600000);

    // Log metrics every 5 minutes
    setInterval(() => {
      this.logger.info('Processing metrics', this.metrics);
    }, 300000);
  }

  /**
   * Update processing metrics
   */
  private updateMetrics(count: number, processingTime: number): void {
    this.metrics.processed += count;
    this.metrics.lastProcessedAt = new Date();
    
    // Update average processing time
    const totalTime = this.metrics.avgProcessingTime * (this.metrics.processed - count);
    this.metrics.avgProcessingTime = (totalTime + processingTime) / this.metrics.processed;
  }

  /**
   * Get processing metrics
   */
  getMetrics(): ProcessingMetrics {
    return { ...this.metrics };
  }

  /**
   * Stop event processing
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Stop Redis stream consumer
    await this.redisStream.stopConsumer();
    
    // Close queue
    await this.processingQueue.close();
    
    this.logger.info('Event processor stopped', this.metrics);
  }
}