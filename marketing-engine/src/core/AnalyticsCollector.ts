import { v4 as uuidv4 } from 'uuid';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { Database } from '../config/database';
import { RedisClient } from '../config/redis';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';
import {
  AnalyticsEvent,
  EventType,
  ChannelAnalytics
} from '../types';

export interface AnalyticsConfig {
  batchSize: number;
  flushInterval: number;
  enableStreaming: boolean;
  kafkaBrokers?: string[];
  kafkaClientId?: string;
  kafkaGroupId?: string;
}

export interface EventProcessor {
  eventType: EventType;
  process(event: AnalyticsEvent): Promise<void>;
}

export interface RealtimeMetrics {
  eventsPerMinute: number;
  eventsPerHour: number;
  activeChannels: number;
  topContent: Array<{ contentId: string; events: number }>;
  eventTypeDistribution: Record<EventType, number>;
}

export class AnalyticsCollector extends EventEmitter {
  private db: Database;
  private redis: RedisClient;
  private logger: Logger;
  private config: AnalyticsConfig;
  private kafka?: Kafka;
  private producer?: Producer;
  private consumer?: Consumer;
  private eventBuffer: AnalyticsEvent[];
  private flushTimer?: NodeJS.Timeout;
  private processors: Map<EventType, EventProcessor[]>;
  private metricsCache: Map<string, any>;

  constructor(db: Database, redis: RedisClient, config: AnalyticsConfig) {
    super();
    this.db = db;
    this.redis = redis;
    this.logger = new Logger('AnalyticsCollector');
    this.config = {
      batchSize: config.batchSize || parseInt(process.env.ANALYTICS_BATCH_SIZE || '100'),
      flushInterval: config.flushInterval || parseInt(process.env.ANALYTICS_FLUSH_INTERVAL || '5000'),
      enableStreaming: config.enableStreaming !== false,
      kafkaBrokers: config.kafkaBrokers || process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
      kafkaClientId: config.kafkaClientId || process.env.KAFKA_CLIENT_ID || 'marketing-engine',
      kafkaGroupId: config.kafkaGroupId || process.env.KAFKA_GROUP_ID || 'marketing-engine-group'
    };
    this.eventBuffer = [];
    this.processors = new Map();
    this.metricsCache = new Map();

    if (this.config.enableStreaming) {
      this.initializeKafka();
    }

    this.startFlushTimer();
  }

  async initialize(): Promise<void> {
    if (this.config.enableStreaming && this.producer) {
      await this.producer.connect();
      await this.consumer?.connect();
      await this.consumer?.subscribe({ topic: 'analytics-events', fromBeginning: false });
      await this.startConsumer();
      this.logger.info('Analytics collector initialized with streaming');
    } else {
      this.logger.info('Analytics collector initialized without streaming');
    }
  }

  async track(event: Omit<AnalyticsEvent, 'id' | 'timestamp' | 'processed'>): Promise<void> {
    const fullEvent: AnalyticsEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
      processed: false
    };

    // Add to buffer
    this.eventBuffer.push(fullEvent);

    // Stream to Kafka if enabled
    if (this.config.enableStreaming && this.producer) {
      try {
        await this.producer.send({
          topic: 'analytics-events',
          messages: [{
            key: fullEvent.contentId,
            value: JSON.stringify(fullEvent)
          }]
        });
      } catch (error) {
        this.logger.error('Failed to stream event to Kafka', error);
      }
    }

    // Update real-time metrics
    await this.updateRealtimeMetrics(fullEvent);

    // Emit event for real-time processing
    this.emit('event', fullEvent);

    // Check if we should flush
    if (this.eventBuffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async trackBatch(events: Array<Omit<AnalyticsEvent, 'id' | 'timestamp' | 'processed'>>): Promise<void> {
    const trackPromises = events.map(event => this.track(event));
    await Promise.all(trackPromises);
  }

  registerProcessor(processor: EventProcessor): void {
    const processors = this.processors.get(processor.eventType) || [];
    processors.push(processor);
    this.processors.set(processor.eventType, processors);
    this.logger.info('Event processor registered', { eventType: processor.eventType });
  }

  async getRealtimeMetrics(): Promise<RealtimeMetrics> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    // Get event counts from Redis
    const eventsPerMinute = await this.redis.get<number>('analytics:events:minute') || 0;
    const eventsPerHour = await this.redis.get<number>('analytics:events:hour') || 0;
    
    // Get active channels
    const activeChannels = await this.redis.sismember('analytics:active:channels', '*');
    
    // Get top content
    const topContent = await this.getTopContent(10);
    
    // Get event type distribution
    const distribution = await this.getEventTypeDistribution();

    return {
      eventsPerMinute,
      eventsPerHour,
      activeChannels: activeChannels ? 1 : 0,
      topContent,
      eventTypeDistribution: distribution
    };
  }

  async getChannelMetrics(channelId: string, timeRange?: { start: Date; end: Date }): Promise<ChannelAnalytics> {
    const cacheKey = `channel:metrics:${channelId}`;
    
    // Try cache first
    const cached = await this.redis.get<ChannelAnalytics>(cacheKey);
    if (cached && !timeRange) {
      return cached;
    }

    // Query aggregated metrics
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE event_type = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE event_type = 'delivered') as delivered_count,
        COUNT(*) FILTER (WHERE event_type = 'opened') as opened_count,
        COUNT(*) FILTER (WHERE event_type = 'clicked') as clicked_count,
        COUNT(*) FILTER (WHERE event_type = 'converted') as conversion_count,
        COALESCE(SUM((metadata->>'revenue')::numeric), 0) as revenue,
        MAX(timestamp) as last_activity
      FROM analytics_events
      WHERE channel_id = $1
      ${timeRange ? 'AND timestamp BETWEEN $2 AND $3' : ''}
    `;

    const values = timeRange ? [channelId, timeRange.start, timeRange.end] : [channelId];
    const result = await this.db.query(query, values);
    
    const metrics: ChannelAnalytics = {
      sentCount: parseInt(result.rows[0].sent_count || '0'),
      deliveredCount: parseInt(result.rows[0].delivered_count || '0'),
      openedCount: parseInt(result.rows[0].opened_count || '0'),
      clickedCount: parseInt(result.rows[0].clicked_count || '0'),
      conversionCount: parseInt(result.rows[0].conversion_count || '0'),
      revenue: parseFloat(result.rows[0].revenue || '0'),
      lastActivity: result.rows[0].last_activity || new Date()
    };

    // Cache for 5 minutes
    if (!timeRange) {
      await this.redis.set(cacheKey, metrics, 300);
    }

    return metrics;
  }

  async getContentPerformance(contentId: string): Promise<any> {
    const query = `
      SELECT 
        ch.name as channel_name,
        ch.type as channel_type,
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE ae.event_type = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE ae.event_type = 'opened') as opened,
        COUNT(*) FILTER (WHERE ae.event_type = 'clicked') as clicked,
        COUNT(*) FILTER (WHERE ae.event_type = 'converted') as converted,
        ROUND(
          CASE 
            WHEN COUNT(*) FILTER (WHERE ae.event_type = 'sent') > 0
            THEN COUNT(*) FILTER (WHERE ae.event_type = 'opened')::numeric / 
                 COUNT(*) FILTER (WHERE ae.event_type = 'sent') * 100
            ELSE 0
          END, 2
        ) as open_rate,
        ROUND(
          CASE 
            WHEN COUNT(*) FILTER (WHERE ae.event_type = 'opened') > 0
            THEN COUNT(*) FILTER (WHERE ae.event_type = 'clicked')::numeric / 
                 COUNT(*) FILTER (WHERE ae.event_type = 'opened') * 100
            ELSE 0
          END, 2
        ) as click_rate,
        ROUND(
          CASE 
            WHEN COUNT(*) FILTER (WHERE ae.event_type = 'clicked') > 0
            THEN COUNT(*) FILTER (WHERE ae.event_type = 'converted')::numeric / 
                 COUNT(*) FILTER (WHERE ae.event_type = 'clicked') * 100
            ELSE 0
          END, 2
        ) as conversion_rate
      FROM analytics_events ae
      INNER JOIN channels ch ON ae.channel_id = ch.id
      WHERE ae.content_id = $1
      GROUP BY ch.id, ch.name, ch.type
      ORDER BY total_events DESC
    `;

    const result = await this.db.query(query, [contentId]);
    return result.rows;
  }

  async getEngagementFunnel(channelId?: string, timeRange?: { start: Date; end: Date }): Promise<any> {
    let query = `
      SELECT 
        COUNT(*) FILTER (WHERE event_type = 'sent') as sent,
        COUNT(*) FILTER (WHERE event_type = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE event_type = 'opened') as opened,
        COUNT(*) FILTER (WHERE event_type = 'clicked') as clicked,
        COUNT(*) FILTER (WHERE event_type = 'converted') as converted
      FROM analytics_events
      WHERE 1=1
    `;

    const values: any[] = [];
    let paramIndex = 1;

    if (channelId) {
      query += ` AND channel_id = $${paramIndex++}`;
      values.push(channelId);
    }

    if (timeRange) {
      query += ` AND timestamp BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      values.push(timeRange.start, timeRange.end);
    }

    const result = await this.db.query(query, values);
    const data = result.rows[0];

    return {
      funnel: [
        { stage: 'Sent', count: parseInt(data.sent || '0'), percentage: 100 },
        { 
          stage: 'Delivered', 
          count: parseInt(data.delivered || '0'), 
          percentage: data.sent > 0 ? (data.delivered / data.sent * 100).toFixed(2) : 0 
        },
        { 
          stage: 'Opened', 
          count: parseInt(data.opened || '0'), 
          percentage: data.delivered > 0 ? (data.opened / data.delivered * 100).toFixed(2) : 0 
        },
        { 
          stage: 'Clicked', 
          count: parseInt(data.clicked || '0'), 
          percentage: data.opened > 0 ? (data.clicked / data.opened * 100).toFixed(2) : 0 
        },
        { 
          stage: 'Converted', 
          count: parseInt(data.converted || '0'), 
          percentage: data.clicked > 0 ? (data.converted / data.clicked * 100).toFixed(2) : 0 
        }
      ],
      overallConversionRate: data.sent > 0 ? (data.converted / data.sent * 100).toFixed(2) : 0
    };
  }

  async aggregateMetrics(period: 'hour' | 'day' | 'week' | 'month'): Promise<void> {
    this.logger.info('Starting metrics aggregation', { period });

    const intervals = {
      hour: '1 hour',
      day: '1 day',
      week: '1 week',
      month: '1 month'
    };

    const query = `
      INSERT INTO channel_analytics (channel_id, sent_count, delivered_count, opened_count, 
        clicked_count, conversion_count, revenue, last_activity)
      SELECT 
        channel_id,
        COUNT(*) FILTER (WHERE event_type = 'sent'),
        COUNT(*) FILTER (WHERE event_type = 'delivered'),
        COUNT(*) FILTER (WHERE event_type = 'opened'),
        COUNT(*) FILTER (WHERE event_type = 'clicked'),
        COUNT(*) FILTER (WHERE event_type = 'converted'),
        COALESCE(SUM((metadata->>'revenue')::numeric), 0),
        MAX(timestamp)
      FROM analytics_events
      WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '${intervals[period]}'
      GROUP BY channel_id
      ON CONFLICT (channel_id) DO UPDATE SET
        sent_count = channel_analytics.sent_count + EXCLUDED.sent_count,
        delivered_count = channel_analytics.delivered_count + EXCLUDED.delivered_count,
        opened_count = channel_analytics.opened_count + EXCLUDED.opened_count,
        clicked_count = channel_analytics.clicked_count + EXCLUDED.clicked_count,
        conversion_count = channel_analytics.conversion_count + EXCLUDED.conversion_count,
        revenue = channel_analytics.revenue + EXCLUDED.revenue,
        last_activity = GREATEST(channel_analytics.last_activity, EXCLUDED.last_activity),
        updated_at = CURRENT_TIMESTAMP
    `;

    await this.db.query(query);

    // Mark events as processed
    await this.db.query(`
      UPDATE analytics_events 
      SET processed = true 
      WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '${intervals[period]}' 
        AND processed = false
    `);

    this.logger.info('Metrics aggregation completed', { period });
  }

  async close(): Promise<void> {
    // Flush remaining events
    await this.flush();

    // Clear timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Disconnect Kafka
    if (this.producer) {
      await this.producer.disconnect();
    }
    if (this.consumer) {
      await this.consumer.disconnect();
    }

    this.logger.info('Analytics collector closed');
  }

  private initializeKafka(): void {
    this.kafka = new Kafka({
      clientId: this.config.kafkaClientId!,
      brokers: this.config.kafkaBrokers!,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000
    });

    this.consumer = this.kafka.consumer({
      groupId: this.config.kafkaGroupId!,
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });
  }

  private async startConsumer(): Promise<void> {
    if (!this.consumer) return;

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          const event: AnalyticsEvent = JSON.parse(payload.message.value!.toString());
          
          // Process with registered processors
          const processors = this.processors.get(event.eventType) || [];
          for (const processor of processors) {
            await processor.process(event);
          }

          // Emit for real-time processing
          this.emit('streamed-event', event);
        } catch (error) {
          this.logger.error('Failed to process streamed event', error);
        }
      }
    });
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        this.logger.error('Failed to flush events', error);
      });
    }, this.config.flushInterval);
  }

  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Batch insert events
      const values = events.map(event => [
        event.id,
        event.contentId,
        event.channelId,
        event.eventType,
        event.userId,
        event.sessionId,
        JSON.stringify(event.metadata),
        event.timestamp,
        event.processed
      ]);

      const query = `
        INSERT INTO analytics_events (
          id, content_id, channel_id, event_type, user_id, 
          session_id, metadata, timestamp, processed
        ) VALUES ${values.map((_, i) => 
          `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, 
            $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`
        ).join(', ')}
      `;

      const flatValues = values.flat();
      await this.db.query(query, flatValues);

      this.logger.info('Flushed analytics events', { count: events.length });
    } catch (error) {
      this.logger.error('Failed to flush events to database', error);
      // Re-add events to buffer
      this.eventBuffer.unshift(...events);
    }
  }

  private async updateRealtimeMetrics(event: AnalyticsEvent): Promise<void> {
    // Update event counters
    await this.redis.incr('analytics:events:minute');
    await this.redis.expire('analytics:events:minute', 60);
    
    await this.redis.incr('analytics:events:hour');
    await this.redis.expire('analytics:events:hour', 3600);

    // Track active channels
    await this.redis.sadd('analytics:active:channels', event.channelId);
    await this.redis.expire('analytics:active:channels', 300);

    // Update content event count
    const contentKey = `analytics:content:${event.contentId}`;
    await this.redis.incr(contentKey);
    await this.redis.expire(contentKey, 3600);

    // Update event type counter
    const typeKey = `analytics:type:${event.eventType}`;
    await this.redis.incr(typeKey);
    await this.redis.expire(typeKey, 3600);
  }

  private async getTopContent(limit: number): Promise<Array<{ contentId: string; events: number }>> {
    // This is a simplified version - in production, you'd use Redis sorted sets
    const keys = await this.redis.getClient().keys('analytics:content:*');
    const counts: Array<{ contentId: string; events: number }> = [];

    for (const key of keys) {
      const contentId = key.split(':')[2];
      const events = await this.redis.get<number>(key) || 0;
      counts.push({ contentId, events });
    }

    return counts
      .sort((a, b) => b.events - a.events)
      .slice(0, limit);
  }

  private async getEventTypeDistribution(): Promise<Record<EventType, number>> {
    const types: EventType[] = [
      EventType.SENT,
      EventType.DELIVERED,
      EventType.OPENED,
      EventType.CLICKED,
      EventType.CONVERTED,
      EventType.BOUNCED,
      EventType.COMPLAINED,
      EventType.UNSUBSCRIBED
    ];

    const distribution: Record<EventType, number> = {} as any;

    for (const type of types) {
      const count = await this.redis.get<number>(`analytics:type:${type}`) || 0;
      distribution[type] = count;
    }

    return distribution;
  }
}