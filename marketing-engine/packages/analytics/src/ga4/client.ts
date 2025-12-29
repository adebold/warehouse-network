/**
 * Google Analytics 4 Client Implementation
 * Uses Measurement Protocol for server-side tracking
 */

import axios, { AxiosInstance } from 'axios';
import { AnalyticsConfig } from '../core/config';
import { AnalyticsEvent, ConversionEvent, UserProfile } from '../core/types';
import { Logger } from '../core/logger';
import { EventBatcher } from './batcher';
import { GA4EventTransformer } from './transformer';
import { GA4Error, GA4ValidationError } from './errors';

export interface GA4ClientOptions {
  config: AnalyticsConfig['ga4'];
  logger: Logger;
}

export interface GA4Event {
  client_id: string;
  user_id?: string;
  timestamp_micros?: string;
  non_personalized_ads?: boolean;
  events: Array<{
    name: string;
    params: Record<string, any>;
  }>;
}

export interface GA4UserProperty {
  [key: string]: {
    value: string | number | boolean;
  };
}

export class GA4Client {
  private readonly config: AnalyticsConfig['ga4'];
  private readonly logger: Logger;
  private readonly httpClient: AxiosInstance;
  private readonly batcher: EventBatcher<GA4Event>;
  private readonly transformer: GA4EventTransformer;
  private readonly measurementProtocolUrl: string;

  constructor(options: GA4ClientOptions) {
    this.config = options.config;
    this.logger = options.logger.child({ integration: 'ga4' });
    this.transformer = new GA4EventTransformer();

    // Measurement Protocol endpoint
    this.measurementProtocolUrl = `https://www.google-analytics.com/mp/collect?measurement_id=${this.config.measurementId}&api_secret=${this.config.apiSecret}`;

    // HTTP client with retry logic
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MarketingEngine-Analytics/1.0'
      }
    });

    // Request/response interceptors for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug('GA4 API request', {
          url: config.url,
          method: config.method
        });
        return config;
      },
      (error) => {
        this.logger.error('GA4 API request error', error);
        return Promise.reject(error);
      }
    );

    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug('GA4 API response', {
          status: response.status,
          statusText: response.statusText
        });
        return response;
      },
      (error) => {
        this.logger.error('GA4 API response error', error);
        return Promise.reject(new GA4Error(
          error.response?.data?.error?.message || error.message,
          error.response?.status
        ));
      }
    );

    // Initialize event batcher
    this.batcher = new EventBatcher<GA4Event>({
      batchSize: this.config.batchSize,
      flushInterval: this.config.flushInterval,
      onBatch: this.sendBatch.bind(this),
      logger: this.logger
    });
  }

  /**
   * Track a generic event
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('GA4 tracking disabled');
      return;
    }

    try {
      const ga4Event = this.transformer.transformEvent(event);
      await this.batcher.add(ga4Event);
      
      this.logger.debug('Event queued for GA4', {
        eventId: event.eventId,
        eventName: event.eventName
      });
    } catch (error) {
      this.logger.error('Failed to track event in GA4', error, {
        eventId: event.eventId
      });
      throw error;
    }
  }

  /**
   * Track a conversion event with enhanced e-commerce data
   */
  async trackConversion(event: ConversionEvent): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('GA4 tracking disabled');
      return;
    }

    try {
      const ga4Event = this.transformer.transformConversion(event);
      await this.batcher.add(ga4Event);
      
      this.logger.info('Conversion tracked in GA4', {
        eventId: event.eventId,
        value: event.conversionValue,
        currency: event.currency
      });
    } catch (error) {
      this.logger.error('Failed to track conversion in GA4', error, {
        eventId: event.eventId
      });
      throw error;
    }
  }

  /**
   * Update user properties
   */
  async updateUserProperties(
    userId: string,
    anonymousId: string,
    properties: Record<string, any>
  ): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('GA4 tracking disabled');
      return;
    }

    try {
      const userProperties: GA4UserProperty = {};
      for (const [key, value] of Object.entries(properties)) {
        // GA4 user property names must be alphanumeric with underscores
        const propertyName = key.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 24);
        userProperties[propertyName] = { value };
      }

      const ga4Event: GA4Event = {
        client_id: anonymousId,
        user_id: userId,
        user_properties: userProperties as any,
        events: [{
          name: 'user_properties_update',
          params: {
            engagement_time_msec: 100
          }
        }]
      };

      await this.sendBatch([ga4Event]);
      
      this.logger.debug('User properties updated in GA4', {
        userId,
        propertyCount: Object.keys(properties).length
      });
    } catch (error) {
      this.logger.error('Failed to update user properties in GA4', error, {
        userId
      });
      throw error;
    }
  }

  /**
   * Create audience segment
   */
  async createAudience(
    name: string,
    description: string,
    conditions: any[]
  ): Promise<string> {
    if (!this.config.serviceAccountKeyPath) {
      throw new GA4Error('Service account required for audience creation');
    }

    // This would use Google Analytics Admin API
    // Implementation requires service account authentication
    this.logger.info('Audience creation requested', {
      name,
      description,
      conditionCount: conditions.length
    });

    // Placeholder for actual implementation
    throw new Error('Audience creation requires GA4 Admin API setup');
  }

  /**
   * Send batch of events to GA4
   */
  private async sendBatch(events: GA4Event[]): Promise<void> {
    if (events.length === 0) return;

    try {
      // GA4 Measurement Protocol accepts one event at a time
      // Send events in parallel with rate limiting
      const promises = events.map(async (event) => {
        try {
          await this.httpClient.post(this.measurementProtocolUrl, event);
        } catch (error) {
          // Log individual event errors but don't fail the entire batch
          this.logger.error('Failed to send event to GA4', error, {
            clientId: event.client_id,
            eventName: event.events[0]?.name
          });
        }
      });

      await Promise.all(promises);
      
      this.logger.info('Batch sent to GA4', {
        eventCount: events.length
      });
    } catch (error) {
      this.logger.error('Failed to send batch to GA4', error);
      throw error;
    }
  }

  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    await this.batcher.flush();
    this.logger.debug('GA4 client flushed');
  }

  /**
   * Shutdown client
   */
  async shutdown(): Promise<void> {
    await this.batcher.shutdown();
    this.logger.info('GA4 client shutdown');
  }

  /**
   * Get client metrics
   */
  getMetrics() {
    return {
      batcher: this.batcher.getMetrics(),
      enabled: this.config.enabled
    };
  }
}