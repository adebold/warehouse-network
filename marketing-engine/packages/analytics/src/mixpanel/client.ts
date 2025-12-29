/**
 * Mixpanel Client Implementation
 * Full-featured integration with event tracking, user profiles, and cohorts
 */

import Mixpanel from 'mixpanel';
import axios, { AxiosInstance } from 'axios';
import { AnalyticsConfig } from '../core/config';
import { AnalyticsEvent, ConversionEvent, UserProfile } from '../core/types';
import { Logger } from '../core/logger';
import { MixpanelEventTransformer } from './transformer';
import { FunnelAnalyzer } from './funnel';
import { CohortManager } from './cohort';
import { MixpanelError } from './errors';

export interface MixpanelClientOptions {
  config: AnalyticsConfig['mixpanel'];
  logger: Logger;
}

export interface MixpanelEvent {
  event: string;
  properties: Record<string, any>;
}

export interface MixpanelUserUpdate {
  $set?: Record<string, any>;
  $set_once?: Record<string, any>;
  $add?: Record<string, number>;
  $append?: Record<string, any>;
  $union?: Record<string, string[]>;
  $unset?: string[];
}

export class MixpanelClient {
  private readonly config: AnalyticsConfig['mixpanel'];
  private readonly logger: Logger;
  private readonly mixpanel: any;
  private readonly httpClient: AxiosInstance;
  private readonly transformer: MixpanelEventTransformer;
  private readonly funnelAnalyzer: FunnelAnalyzer;
  private readonly cohortManager: CohortManager;

  constructor(options: MixpanelClientOptions) {
    this.config = options.config;
    this.logger = options.logger.child({ integration: 'mixpanel' });
    this.transformer = new MixpanelEventTransformer();

    // Initialize Mixpanel SDK
    this.mixpanel = Mixpanel.init(this.config.projectToken, {
      host: this.config.euResidency ? 'https://api-eu.mixpanel.com' : undefined,
      protocol: 'https',
      verbose: false,
      batch_size: this.config.batchSize,
      batch_flush_interval_ms: this.config.flushInterval
    });

    // HTTP client for API operations
    const baseURL = this.config.euResidency 
      ? 'https://eu.mixpanel.com/api'
      : 'https://mixpanel.com/api';

    this.httpClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      auth: this.config.apiSecret ? {
        username: this.config.apiSecret,
        password: ''
      } : undefined
    });

    // Initialize specialized components
    this.funnelAnalyzer = new FunnelAnalyzer({
      httpClient: this.httpClient,
      projectId: this.extractProjectId(this.config.projectToken),
      logger: this.logger
    });

    this.cohortManager = new CohortManager({
      httpClient: this.httpClient,
      projectId: this.extractProjectId(this.config.projectToken),
      logger: this.logger
    });
  }

  /**
   * Track a generic event
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Mixpanel tracking disabled');
      return;
    }

    try {
      const mixpanelEvent = this.transformer.transformEvent(event);
      
      // Use distinct_id for tracking
      const distinctId = event.userId || event.anonymousId;
      
      this.mixpanel.track(
        mixpanelEvent.event,
        {
          ...mixpanelEvent.properties,
          distinct_id: distinctId,
          $insert_id: event.eventId, // Deduplication
          time: Math.floor(event.timestamp.getTime() / 1000)
        }
      );

      this.logger.debug('Event tracked in Mixpanel', {
        eventId: event.eventId,
        eventName: event.eventName,
        distinctId
      });
    } catch (error) {
      this.logger.error('Failed to track event in Mixpanel', error, {
        eventId: event.eventId
      });
      throw new MixpanelError(`Failed to track event: ${error.message}`);
    }
  }

  /**
   * Track a conversion event with revenue data
   */
  async trackConversion(event: ConversionEvent): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Mixpanel tracking disabled');
      return;
    }

    try {
      const mixpanelEvent = this.transformer.transformConversion(event);
      const distinctId = event.userId || event.anonymousId;

      // Track the conversion
      this.mixpanel.track(
        mixpanelEvent.event,
        {
          ...mixpanelEvent.properties,
          distinct_id: distinctId,
          $insert_id: event.eventId,
          time: Math.floor(event.timestamp.getTime() / 1000)
        }
      );

      // Update user's lifetime value
      if (event.userId) {
        await this.updateUserRevenue(event.userId, event.conversionValue);
      }

      this.logger.info('Conversion tracked in Mixpanel', {
        eventId: event.eventId,
        value: event.conversionValue,
        currency: event.currency,
        distinctId
      });
    } catch (error) {
      this.logger.error('Failed to track conversion in Mixpanel', error, {
        eventId: event.eventId
      });
      throw new MixpanelError(`Failed to track conversion: ${error.message}`);
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(profile: UserProfile): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Mixpanel tracking disabled');
      return;
    }

    try {
      const update: MixpanelUserUpdate = {
        $set: {
          ...profile.traits,
          $email: profile.traits.email,
          $name: profile.traits.name,
          $created: profile.createdAt.toISOString(),
          last_updated: new Date().toISOString()
        }
      };

      this.mixpanel.people.set(profile.userId, update.$set);

      this.logger.debug('User profile updated in Mixpanel', {
        userId: profile.userId,
        traitCount: Object.keys(profile.traits).length
      });
    } catch (error) {
      this.logger.error('Failed to update user profile in Mixpanel', error, {
        userId: profile.userId
      });
      throw new MixpanelError(`Failed to update profile: ${error.message}`);
    }
  }

  /**
   * Create user alias for identity resolution
   */
  async createAlias(userId: string, anonymousId: string): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Mixpanel tracking disabled');
      return;
    }

    try {
      this.mixpanel.alias(userId, anonymousId);
      
      this.logger.debug('User alias created in Mixpanel', {
        userId,
        anonymousId
      });
    } catch (error) {
      this.logger.error('Failed to create alias in Mixpanel', error, {
        userId,
        anonymousId
      });
      throw new MixpanelError(`Failed to create alias: ${error.message}`);
    }
  }

  /**
   * Update user revenue metrics
   */
  private async updateUserRevenue(
    userId: string,
    amount: number
  ): Promise<void> {
    try {
      this.mixpanel.people.increment(userId, {
        total_revenue: amount,
        transaction_count: 1
      });

      this.mixpanel.people.set(userId, {
        last_transaction_date: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to update user revenue', error, {
        userId,
        amount
      });
    }
  }

  /**
   * Create a funnel analysis
   */
  async createFunnel(
    name: string,
    steps: string[],
    dateRange: { from: Date; to: Date }
  ): Promise<any> {
    return this.funnelAnalyzer.analyzeFunnel({
      name,
      steps,
      dateRange,
      unit: 'day'
    });
  }

  /**
   * Create a cohort
   */
  async createCohort(
    name: string,
    description: string,
    filter: any
  ): Promise<string> {
    return this.cohortManager.createCohort({
      name,
      description,
      filter
    });
  }

  /**
   * Get cohort analysis
   */
  async analyzeCohort(
    cohortId: string,
    metric: string,
    dateRange: { from: Date; to: Date }
  ): Promise<any> {
    return this.cohortManager.analyzeCohort(cohortId, metric, dateRange);
  }

  /**
   * Extract project ID from token
   */
  private extractProjectId(token: string): string {
    // Mixpanel project tokens are base64 encoded
    // The project ID is often embedded in the token
    // This is a simplified extraction - real implementation may vary
    return token.substring(0, 8);
  }

  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.mixpanel.flush((error?: Error) => {
        if (error) {
          this.logger.error('Failed to flush Mixpanel', error);
          reject(error);
        } else {
          this.logger.debug('Mixpanel flushed');
          resolve();
        }
      });
    });
  }

  /**
   * Shutdown client
   */
  async shutdown(): Promise<void> {
    await this.flush();
    this.logger.info('Mixpanel client shutdown');
  }

  /**
   * Get client metrics
   */
  getMetrics() {
    return {
      enabled: this.config.enabled,
      euResidency: this.config.euResidency,
      batchSize: this.config.batchSize
    };
  }
}