/**
 * Analytics Collector - Collects and aggregates notification metrics
 */

import Redis from 'ioredis';
import { Logger } from 'winston';
import {
  NotificationEvent,
  NotificationMetrics,
  NotificationChannel,
  NotificationCategory,
  NotificationPriority
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export interface AnalyticsConfig {
  enabled: boolean;
  retentionDays: number;
  aggregationIntervals: {
    hourly: boolean;
    daily: boolean;
    weekly: boolean;
    monthly: boolean;
  };
  enableRealTimeMetrics: boolean;
}

export class AnalyticsCollector {
  private logger: Logger;

  constructor(
    private redis: Redis,
    private config: AnalyticsConfig
  ) {
    this.logger = createLogger('AnalyticsCollector');
  }

  /**
   * Initialize analytics collector
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Analytics collection is disabled');
      return;
    }

    try {
      // Test Redis connection
      await this.redis.ping();

      // Setup aggregation intervals
      if (this.config.aggregationIntervals.hourly) {
        this.startAggregation('hourly', 60 * 60 * 1000); // Every hour
      }
      if (this.config.aggregationIntervals.daily) {
        this.startAggregation('daily', 24 * 60 * 60 * 1000); // Every day
      }

      this.logger.info('Analytics collector initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize analytics collector:', error);
      throw error;
    }
  }

  /**
   * Record a notification event
   */
  async recordNotification(event: NotificationEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const timestamp = event.timestamp || new Date();
      const eventKey = this.generateEventKey(event, timestamp);

      // Store raw event data
      await this.redis.hmset(eventKey, {
        type: event.type,
        notificationId: event.notificationId,
        recipientId: event.recipientId,
        channel: event.channel,
        organizationId: event.organizationId || '',
        timestamp: timestamp.toISOString(),
        data: JSON.stringify(event.data || {})
      });

      // Set expiration for raw events
      const expirationSeconds = this.config.retentionDays * 24 * 60 * 60;
      await this.redis.expire(eventKey, expirationSeconds);

      // Update real-time counters
      if (this.config.enableRealTimeMetrics) {
        await this.updateRealTimeCounters(event, timestamp);
      }

      // Update time-series data
      await this.updateTimeSeries(event, timestamp);

      this.logger.debug(`Recorded notification event: ${event.type} for ${event.notificationId}`);
    } catch (error) {
      this.logger.error('Failed to record notification event:', error);
    }
  }

  /**
   * Get metrics for a time period
   */
  async getMetrics(
    startDate: Date,
    endDate: Date,
    organizationId?: string
  ): Promise<NotificationMetrics> {
    try {
      const metrics: NotificationMetrics = {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        deliveryRate: 0,
        byChannel: {},
        byCategory: {},
        startDate,
        endDate
      };

      // Get aggregated data for the time period
      const startTime = startDate.getTime();
      const endTime = endDate.getTime();

      // Query time series data
      const timeSeriesData = await this.queryTimeSeries(startTime, endTime, organizationId);

      // Process time series data
      for (const data of timeSeriesData) {
        const { channel, category, event_type, count } = data;

        metrics.totalSent += event_type === 'notification.sent' ? count : 0;
        metrics.totalDelivered += event_type === 'notification.delivered' ? count : 0;
        metrics.totalFailed += event_type === 'notification.failed' ? count : 0;

        // By channel metrics
        if (!metrics.byChannel[channel as NotificationChannel]) {
          metrics.byChannel[channel as NotificationChannel] = {
            sent: 0,
            delivered: 0,
            failed: 0,
            deliveryRate: 0
          };
        }

        const channelMetrics = metrics.byChannel[channel as NotificationChannel]!;
        channelMetrics.sent += event_type === 'notification.sent' ? count : 0;
        channelMetrics.delivered += event_type === 'notification.delivered' ? count : 0;
        channelMetrics.failed += event_type === 'notification.failed' ? count : 0;

        // By category metrics
        if (!metrics.byCategory[category as NotificationCategory]) {
          metrics.byCategory[category as NotificationCategory] = {
            sent: 0,
            delivered: 0,
            failed: 0,
            deliveryRate: 0
          };
        }

        const categoryMetrics = metrics.byCategory[category as NotificationCategory]!;
        categoryMetrics.sent += event_type === 'notification.sent' ? count : 0;
        categoryMetrics.delivered += event_type === 'notification.delivered' ? count : 0;
        categoryMetrics.failed += event_type === 'notification.failed' ? count : 0;
      }

      // Calculate delivery rates
      metrics.deliveryRate = metrics.totalSent > 0 ? metrics.totalDelivered / metrics.totalSent : 0;

      for (const channel in metrics.byChannel) {
        const channelMetrics = metrics.byChannel[channel as NotificationChannel]!;
        channelMetrics.deliveryRate = channelMetrics.sent > 0 ? channelMetrics.delivered / channelMetrics.sent : 0;
      }

      for (const category in metrics.byCategory) {
        const categoryMetrics = metrics.byCategory[category as NotificationCategory]!;
        categoryMetrics.deliveryRate = categoryMetrics.sent > 0 ? categoryMetrics.delivered / categoryMetrics.sent : 0;
      }

      // Get additional metrics like average delivery time
      metrics.averageDeliveryTime = await this.getAverageDeliveryTime(startTime, endTime, organizationId);

      return metrics;
    } catch (error) {
      this.logger.error('Failed to get notification metrics:', error);
      throw error;
    }
  }

  /**
   * Get real-time metrics for dashboard
   */
  async getRealTimeMetrics(organizationId?: string): Promise<{
    sent: number;
    delivered: number;
    failed: number;
    pending: number;
    lastHour: {
      sent: number;
      delivered: number;
      failed: number;
    };
  }> {
    try {
      const orgPrefix = organizationId ? `org:${organizationId}:` : '';

      const pipeline = this.redis.pipeline();

      // Get current counters
      pipeline.get(`analytics:${orgPrefix}counter:sent`);
      pipeline.get(`analytics:${orgPrefix}counter:delivered`);
      pipeline.get(`analytics:${orgPrefix}counter:failed`);
      pipeline.get(`analytics:${orgPrefix}counter:pending`);

      // Get last hour counters
      const hourKey = this.getHourKey(new Date());
      pipeline.hget(`analytics:${orgPrefix}hourly:${hourKey}`, 'sent');
      pipeline.hget(`analytics:${orgPrefix}hourly:${hourKey}`, 'delivered');
      pipeline.hget(`analytics:${orgPrefix}hourly:${hourKey}`, 'failed');

      const results = await pipeline.exec();

      return {
        sent: parseInt((results?.[0]?.[1] as string) || '0', 10),
        delivered: parseInt((results?.[1]?.[1] as string) || '0', 10),
        failed: parseInt((results?.[2]?.[1] as string) || '0', 10),
        pending: parseInt((results?.[3]?.[1] as string) || '0', 10),
        lastHour: {
          sent: parseInt((results?.[4]?.[1] as string) || '0', 10),
          delivered: parseInt((results?.[5]?.[1] as string) || '0', 10),
          failed: parseInt((results?.[6]?.[1] as string) || '0', 10)
        }
      };
    } catch (error) {
      this.logger.error('Failed to get real-time metrics:', error);
      return {
        sent: 0,
        delivered: 0,
        failed: 0,
        pending: 0,
        lastHour: { sent: 0, delivered: 0, failed: 0 }
      };
    }
  }

  /**
   * Get delivery performance by channel
   */
  async getChannelPerformance(
    startDate: Date,
    endDate: Date,
    organizationId?: string
  ): Promise<{
    channel: NotificationChannel;
    sent: number;
    delivered: number;
    failed: number;
    deliveryRate: number;
    averageDeliveryTime: number;
  }[]> {
    try {
      const startTime = startDate.getTime();
      const endTime = endDate.getTime();

      const channelData = await this.queryChannelPerformance(startTime, endTime, organizationId);

      return channelData.map(data => ({
        channel: data.channel as NotificationChannel,
        sent: data.sent,
        delivered: data.delivered,
        failed: data.failed,
        deliveryRate: data.sent > 0 ? data.delivered / data.sent : 0,
        averageDeliveryTime: data.averageDeliveryTime || 0
      }));
    } catch (error) {
      this.logger.error('Failed to get channel performance:', error);
      return [];
    }
  }

  /**
   * Get top failure reasons
   */
  async getTopFailureReasons(
    startDate: Date,
    endDate: Date,
    limit = 10,
    organizationId?: string
  ): Promise<{
    reason: string;
    count: number;
    percentage: number;
  }[]> {
    try {
      const startTime = startDate.getTime();
      const endTime = endDate.getTime();

      const orgPrefix = organizationId ? `org:${organizationId}:` : '';
      const failureKey = `analytics:${orgPrefix}failures:${this.getDayKey(startDate)}`;

      // Get failure reasons from sorted set
      const failures = await this.redis.zrevrangebyscore(
        failureKey,
        '+inf',
        '-inf',
        'WITHSCORES',
        'LIMIT',
        0,
        limit
      );

      const totalFailures = failures.length > 0 ?
        failures.reduce((sum, _, index) => index % 2 === 1 ? sum + parseInt(failures[index] as string, 10) : sum, 0) : 0;

      const results: { reason: string; count: number; percentage: number }[] = [];

      for (let i = 0; i < failures.length; i += 2) {
        const reason = failures[i] as string;
        const count = parseInt(failures[i + 1] as string, 10);
        const percentage = totalFailures > 0 ? (count / totalFailures) * 100 : 0;

        results.push({ reason, count, percentage });
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to get top failure reasons:', error);
      return [];
    }
  }

  /**
   * Generate event key
   */
  private generateEventKey(event: NotificationEvent, timestamp: Date): string {
    const dateString = timestamp.toISOString().split('T')[0];
    const eventId = `${event.notificationId}_${timestamp.getTime()}`;
    const orgPrefix = event.organizationId ? `org:${event.organizationId}:` : '';

    return `analytics:${orgPrefix}events:${dateString}:${eventId}`;
  }

  /**
   * Update real-time counters
   */
  private async updateRealTimeCounters(event: NotificationEvent, timestamp: Date): Promise<void> {
    const orgPrefix = event.organizationId ? `org:${event.organizationId}:` : '';

    const pipeline = this.redis.pipeline();

    switch (event.type) {
      case 'notification.sent':
        pipeline.incr(`analytics:${orgPrefix}counter:sent`);
        pipeline.decr(`analytics:${orgPrefix}counter:pending`);
        break;
      case 'notification.delivered':
        pipeline.incr(`analytics:${orgPrefix}counter:delivered`);
        break;
      case 'notification.failed':
        pipeline.incr(`analytics:${orgPrefix}counter:failed`);
        pipeline.decr(`analytics:${orgPrefix}counter:pending`);

        // Track failure reason if available
        if (event.data?.error?.message) {
          const failureKey = `analytics:${orgPrefix}failures:${this.getDayKey(timestamp)}`;
          pipeline.zincrby(failureKey, 1, event.data.error.message);
        }
        break;
      default:
        return;
    }

    await pipeline.exec();
  }

  /**
   * Update time series data
   */
  private async updateTimeSeries(event: NotificationEvent, timestamp: Date): Promise<void> {
    const orgPrefix = event.organizationId ? `org:${event.organizationId}:` : '';

    // Update hourly aggregates
    if (this.config.aggregationIntervals.hourly) {
      const hourKey = this.getHourKey(timestamp);
      const key = `analytics:${orgPrefix}hourly:${hourKey}`;

      await this.redis.hincrby(key, this.getEventTypeKey(event.type), 1);
      await this.redis.hincrby(key, `${event.channel}_${this.getEventTypeKey(event.type)}`, 1);

      // Set expiration for hourly data
      await this.redis.expire(key, 7 * 24 * 60 * 60); // Keep for 7 days
    }

    // Update daily aggregates
    if (this.config.aggregationIntervals.daily) {
      const dayKey = this.getDayKey(timestamp);
      const key = `analytics:${orgPrefix}daily:${dayKey}`;

      await this.redis.hincrby(key, this.getEventTypeKey(event.type), 1);
      await this.redis.hincrby(key, `${event.channel}_${this.getEventTypeKey(event.type)}`, 1);

      // Set expiration for daily data
      await this.redis.expire(key, 90 * 24 * 60 * 60); // Keep for 90 days
    }
  }

  /**
   * Query time series data
   */
  private async queryTimeSeries(
    startTime: number,
    endTime: number,
    organizationId?: string
  ): Promise<any[]> {
    // This would typically query a time-series database
    // For now, returning mock data structure
    return [];
  }

  /**
   * Query channel performance
   */
  private async queryChannelPerformance(
    startTime: number,
    endTime: number,
    organizationId?: string
  ): Promise<any[]> {
    // This would typically query performance data
    // For now, returning mock data structure
    return [];
  }

  /**
   * Get average delivery time
   */
  private async getAverageDeliveryTime(
    startTime: number,
    endTime: number,
    organizationId?: string
  ): Promise<number> {
    // This would calculate average delivery time from events
    return 0;
  }

  /**
   * Start aggregation interval
   */
  private startAggregation(interval: string, intervalMs: number): void {
    setInterval(async () => {
      try {
        await this.performAggregation(interval);
      } catch (error) {
        this.logger.error(`Aggregation failed for interval ${interval}:`, error);
      }
    }, intervalMs);

    this.logger.info(`Started ${interval} aggregation`);
  }

  /**
   * Perform data aggregation
   */
  private async performAggregation(interval: string): Promise<void> {
    // Implementation would depend on specific aggregation needs
    this.logger.debug(`Performing ${interval} aggregation`);
  }

  /**
   * Get hour key for timestamp
   */
  private getHourKey(timestamp: Date): string {
    return `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}-${String(timestamp.getHours()).padStart(2, '0')}`;
  }

  /**
   * Get day key for timestamp
   */
  private getDayKey(timestamp: Date): string {
    return `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`;
  }

  /**
   * Convert event type to key
   */
  private getEventTypeKey(eventType: string): string {
    switch (eventType) {
      case 'notification.sent':
        return 'sent';
      case 'notification.delivered':
        return 'delivered';
      case 'notification.failed':
        return 'failed';
      default:
        return 'other';
    }
  }
}