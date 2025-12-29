import { v4 as uuidv4 } from 'uuid';
import { Database } from '../config/database';
import { RedisClient } from '../config/redis';
import { Logger } from '../utils/logger';
import Bull from 'bull';
import {
  Channel,
  ChannelType,
  Content,
  PublishResult,
  RetryPolicy,
  ContentTransformation,
  TransformationType
} from '../types';

export interface PublishOptions {
  priority?: number;
  delay?: number;
  retryPolicy?: RetryPolicy;
  transformations?: ContentTransformation[];
}

export interface PublishJob {
  id: string;
  contentId: string;
  channelId: string;
  options: PublishOptions;
  attempt: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export abstract class ChannelAdapter {
  protected logger: Logger;
  protected config: any;

  constructor(config: any) {
    this.config = config;
    this.logger = new Logger(`ChannelAdapter:${this.getType()}`);
  }

  abstract getType(): ChannelType;
  abstract publish(content: Content): Promise<PublishResult>;
  abstract validate(content: Content): Promise<boolean>;
  abstract transform(content: Content, transformations: ContentTransformation[]): Promise<Content>;
}

export class ChannelPublisher {
  private db: Database;
  private redis: RedisClient;
  private logger: Logger;
  private publishQueue: Bull.Queue;
  private adapters: Map<ChannelType, ChannelAdapter>;
  private rateLimiters: Map<string, RateLimiter>;

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
    this.logger = new Logger('ChannelPublisher');
    this.adapters = new Map();
    this.rateLimiters = new Map();

    // Initialize Bull queue
    this.publishQueue = new Bull('publish-queue', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
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

    this.setupQueueProcessing();
  }

  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.getType(), adapter);
    this.logger.info('Channel adapter registered', { type: adapter.getType() });
  }

  async publish(
    contentId: string,
    channelIds: string[],
    options: PublishOptions = {}
  ): Promise<PublishResult[]> {
    this.logger.info('Publishing content to channels', { 
      contentId, 
      channels: channelIds.length 
    });

    const results: PublishResult[] = [];

    // Get content
    const contentQuery = `SELECT * FROM content WHERE id = $1`;
    const contentResult = await this.db.query(contentQuery, [contentId]);
    
    if (contentResult.rows.length === 0) {
      throw new Error('Content not found');
    }

    const content = contentResult.rows[0];

    // Queue publish jobs for each channel
    for (const channelId of channelIds) {
      const jobId = uuidv4();
      
      // Add to database queue
      const queueQuery = `
        INSERT INTO publish_queue (
          id, content_id, channel_id, priority, status, scheduled_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await this.db.query(queueQuery, [
        jobId,
        contentId,
        channelId,
        options.priority || 5,
        'pending',
        options.delay ? new Date(Date.now() + options.delay) : new Date()
      ]);

      // Add to Bull queue
      await this.publishQueue.add({
        jobId,
        contentId,
        channelId,
        content,
        options
      }, {
        priority: options.priority || 5,
        delay: options.delay
      });

      results.push({
        contentId,
        channelId,
        success: true,
        message: 'Queued for publishing',
        publishedAt: new Date()
      });
    }

    return results;
  }

  async publishNow(contentId: string, channelId: string): Promise<PublishResult> {
    this.logger.info('Publishing content immediately', { contentId, channelId });

    // Get content and channel
    const query = `
      SELECT c.*, ch.type, ch.config, ch.status
      FROM content c, channels ch
      WHERE c.id = $1 AND ch.id = $2
    `;

    const result = await this.db.query(query, [contentId, channelId]);
    
    if (result.rows.length === 0) {
      throw new Error('Content or channel not found');
    }

    const data = result.rows[0];
    const channel: Channel = {
      id: channelId,
      name: data.name,
      type: data.type,
      config: data.config,
      status: data.status,
      analytics: {
        sentCount: 0,
        deliveredCount: 0,
        openedCount: 0,
        clickedCount: 0,
        conversionCount: 0,
        revenue: 0,
        lastActivity: new Date()
      }
    };

    // Check rate limit
    const rateLimitKey = `channel:${channelId}`;
    const isAllowed = await this.checkRateLimit(rateLimitKey, channel.config.rateLimit);
    
    if (!isAllowed) {
      throw new Error('Rate limit exceeded for channel');
    }

    // Get adapter
    const adapter = this.adapters.get(channel.type);
    if (!adapter) {
      throw new Error(`No adapter registered for channel type: ${channel.type}`);
    }

    // Transform content if needed
    let transformedContent = this.mapToContent(data);
    if (channel.config.transformations && channel.config.transformations.length > 0) {
      transformedContent = await adapter.transform(transformedContent, channel.config.transformations);
    }

    // Validate content
    const isValid = await adapter.validate(transformedContent);
    if (!isValid) {
      throw new Error('Content validation failed for channel');
    }

    // Publish
    const publishResult = await adapter.publish(transformedContent);

    // Update database
    await this.db.transaction(async (client) => {
      // Update content_channels
      const updateChannelQuery = `
        UPDATE content_channels 
        SET published = true, published_at = CURRENT_TIMESTAMP, external_id = $1
        WHERE content_id = $2 AND channel_id = $3
      `;

      await client.query(updateChannelQuery, [
        publishResult.externalId,
        contentId,
        channelId
      ]);

      // Update channel analytics
      await client.query(
        `SELECT update_channel_analytics($1, $2, $3)`,
        [channelId, 'sent', 0]
      );

      // Record analytics event
      const eventQuery = `
        INSERT INTO analytics_events (
          content_id, channel_id, event_type, metadata
        ) VALUES ($1, $2, $3, $4)
      `;

      await client.query(eventQuery, [
        contentId,
        channelId,
        'sent',
        JSON.stringify({
          externalId: publishResult.externalId,
          processingTime: publishResult.metrics?.processingTime
        })
      ]);
    });

    this.logger.info('Content published successfully', { 
      contentId, 
      channelId, 
      externalId: publishResult.externalId 
    });

    return publishResult;
  }

  async getPublishStatus(contentId: string, channelId?: string): Promise<any> {
    if (channelId) {
      const query = `
        SELECT pc.*, pq.status as queue_status, pq.error_message
        FROM content_channels pc
        LEFT JOIN publish_queue pq ON pc.content_id = pq.content_id 
          AND pc.channel_id = pq.channel_id AND pq.status != 'completed'
        WHERE pc.content_id = $1 AND pc.channel_id = $2
      `;

      const result = await this.db.query(query, [contentId, channelId]);
      return result.rows[0] || null;
    }

    // Get status for all channels
    const query = `
      SELECT pc.*, ch.name as channel_name, ch.type as channel_type,
        pq.status as queue_status, pq.error_message
      FROM content_channels pc
      INNER JOIN channels ch ON pc.channel_id = ch.id
      LEFT JOIN publish_queue pq ON pc.content_id = pq.content_id 
        AND pc.channel_id = pq.channel_id AND pq.status != 'completed'
      WHERE pc.content_id = $1
    `;

    const result = await this.db.query(query, [contentId]);
    return result.rows;
  }

  async retryFailed(): Promise<number> {
    const query = `
      SELECT * FROM publish_queue 
      WHERE status = 'failed' 
        AND retry_count < max_retries
        AND (next_retry IS NULL OR next_retry <= CURRENT_TIMESTAMP)
      ORDER BY priority DESC, scheduled_at ASC
      LIMIT 100
    `;

    const result = await this.db.query(query);
    let retryCount = 0;

    for (const job of result.rows) {
      await this.publishQueue.add({
        jobId: job.id,
        contentId: job.content_id,
        channelId: job.channel_id,
        attempt: job.retry_count + 1
      }, {
        priority: job.priority
      });

      // Update retry count
      await this.db.query(
        `UPDATE publish_queue 
         SET retry_count = retry_count + 1, 
             last_attempt = CURRENT_TIMESTAMP,
             status = 'pending'
         WHERE id = $1`,
        [job.id]
      );

      retryCount++;
    }

    this.logger.info('Retried failed publish jobs', { count: retryCount });
    return retryCount;
  }

  async cancelPublish(contentId: string, channelId: string): Promise<void> {
    // Update database
    await this.db.query(
      `UPDATE publish_queue 
       SET status = 'cancelled' 
       WHERE content_id = $1 AND channel_id = $2 AND status = 'pending'`,
      [contentId, channelId]
    );

    // Remove from Bull queue if possible
    const jobs = await this.publishQueue.getJobs(['waiting', 'delayed']);
    for (const job of jobs) {
      if (job.data.contentId === contentId && job.data.channelId === channelId) {
        await job.remove();
      }
    }

    this.logger.info('Publish cancelled', { contentId, channelId });
  }

  private setupQueueProcessing(): void {
    this.publishQueue.process(async (job) => {
      const { jobId, contentId, channelId, content, options } = job.data;

      try {
        // Update status to processing
        await this.db.query(
          `UPDATE publish_queue SET status = 'processing' WHERE id = $1`,
          [jobId]
        );

        // Process publish
        const result = await this.publishNow(contentId, channelId);

        // Update queue status
        await this.db.query(
          `UPDATE publish_queue 
           SET status = 'completed', 
               last_attempt = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [jobId]
        );

        return result;
      } catch (error: any) {
        this.logger.error('Publish job failed', error, { jobId, contentId, channelId });

        // Calculate next retry time
        const retryDelay = this.calculateRetryDelay(
          job.attemptsMade,
          options.retryPolicy || {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 2000,
            maxDelay: 60000
          }
        );

        // Update queue with error
        await this.db.query(
          `UPDATE publish_queue 
           SET status = 'failed', 
               error_message = $1,
               last_attempt = CURRENT_TIMESTAMP,
               next_retry = CURRENT_TIMESTAMP + INTERVAL '${retryDelay} milliseconds'
           WHERE id = $2`,
          [error.message, jobId]
        );

        throw error;
      }
    });

    this.publishQueue.on('completed', (job, result) => {
      this.logger.info('Publish job completed', { 
        jobId: job.data.jobId,
        contentId: job.data.contentId,
        channelId: job.data.channelId
      });
    });

    this.publishQueue.on('failed', (job, err) => {
      this.logger.error('Publish job failed', err, {
        jobId: job.data.jobId,
        attempts: job.attemptsMade
      });
    });
  }

  private async checkRateLimit(key: string, limit: any): Promise<boolean> {
    if (!limit) return true;

    const limiter = this.getRateLimiter(key, limit);
    return await limiter.tryConsume();
  }

  private getRateLimiter(key: string, config: any): RateLimiter {
    if (!this.rateLimiters.has(key)) {
      this.rateLimiters.set(key, new RateLimiter(this.redis, key, config));
    }
    return this.rateLimiters.get(key)!;
  }

  private calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
    const delay = Math.min(
      policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt),
      policy.maxDelay
    );
    return delay;
  }

  private mapToContent(row: any): Content {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      metadata: row.metadata,
      channels: [],
      status: row.status,
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      scheduledAt: row.scheduled_at,
      expiresAt: row.expires_at
    };
  }
}

// Rate limiter implementation
class RateLimiter {
  private redis: RedisClient;
  private key: string;
  private requests: number;
  private window: number;

  constructor(redis: RedisClient, key: string, config: any) {
    this.redis = redis;
    this.key = `ratelimit:${key}`;
    this.requests = config.requests;
    this.window = config.window;
  }

  async tryConsume(): Promise<boolean> {
    const current = await this.redis.incr(this.key);
    
    if (current === 1) {
      await this.redis.expire(this.key, this.window);
    }

    return current <= this.requests;
  }

  async reset(): Promise<void> {
    await this.redis.del(this.key);
  }
}