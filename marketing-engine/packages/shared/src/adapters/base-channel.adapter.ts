import { Logger } from 'winston';
import { Pool } from 'pg';
import Redis from 'ioredis';
import {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  ChannelCredentials,
  ChannelResponse,
  PostContent,
  PostResult,
  ScheduleOptions,
  AnalyticsData,
  HealthStatus,
  RateLimitStatus,
  ChannelError
} from '@marketing-engine/core/interfaces/channel.interface';
import { RateLimiter } from '../utils/rate-limiter';
import { RetryHandler } from '../utils/retry-handler';
import { v4 as uuidv4 } from 'uuid';

export abstract class BaseChannelAdapter implements IChannelAdapter {
  abstract readonly channelType: ChannelType;
  readonly logger: Logger;
  
  protected config: ChannelConfig;
  protected db: Pool;
  protected redis: Redis;
  protected rateLimiter: RateLimiter;
  protected retryHandler: RetryHandler;
  protected channelId?: string;

  constructor(
    config: ChannelConfig,
    logger: Logger,
    db: Pool,
    redis: Redis
  ) {
    this.config = config;
    this.logger = logger;
    this.db = db;
    this.redis = redis;

    this.rateLimiter = new RateLimiter(
      config.rateLimits,
      logger,
      `rate-limit:${config.channelType}`
    );

    this.retryHandler = new RetryHandler(config.retry, logger);
  }

  abstract authenticate(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>>;
  abstract refreshCredentials(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>>;
  
  async validateCredentials(credentials: ChannelCredentials): Promise<boolean> {
    try {
      // Check if credentials have expired
      if (credentials.expiresAt && new Date(credentials.expiresAt) < new Date()) {
        this.logger.info('Credentials expired, attempting refresh');
        const refreshResult = await this.refreshCredentials(credentials);
        
        if (refreshResult.success && refreshResult.data) {
          await this.saveCredentials(refreshResult.data);
          return true;
        }
        return false;
      }

      // Perform channel-specific validation
      return await this.performCredentialValidation(credentials);
    } catch (error) {
      this.logger.error('Error validating credentials', error);
      return false;
    }
  }

  protected abstract performCredentialValidation(credentials: ChannelCredentials): Promise<boolean>;

  async createPost(content: PostContent, options?: ScheduleOptions): Promise<ChannelResponse<PostResult>> {
    return this.executeWithRetry(async () => {
      // Validate content
      const validationError = await this.validateContent(content);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // Create post record in database
      const postId = await this.createPostRecord(content, options);

      try {
        // Execute channel-specific post creation
        const result = await this.rateLimiter.execute(() => 
          this.performCreatePost(content, options)
        );

        // Update post record with result
        await this.updatePostRecord(postId, result);

        // Schedule analytics collection if successful
        if (result.success && result.data?.id) {
          await this.scheduleAnalyticsCollection(result.data.id);
        }

        return result;
      } catch (error) {
        // Update post record with error
        await this.updatePostError(postId, error as Error);
        throw error;
      }
    }, 'createPost');
  }

  protected abstract performCreatePost(
    content: PostContent,
    options?: ScheduleOptions
  ): Promise<ChannelResponse<PostResult>>;

  async updatePost(postId: string, content: Partial<PostContent>): Promise<ChannelResponse<PostResult>> {
    return this.executeWithRetry(async () => {
      return this.rateLimiter.execute(() => 
        this.performUpdatePost(postId, content)
      );
    }, 'updatePost');
  }

  protected abstract performUpdatePost(
    postId: string,
    content: Partial<PostContent>
  ): Promise<ChannelResponse<PostResult>>;

  async deletePost(postId: string): Promise<ChannelResponse<void>> {
    return this.executeWithRetry(async () => {
      const result = await this.rateLimiter.execute(() => 
        this.performDeletePost(postId)
      );

      if (result.success) {
        await this.deletePostRecord(postId);
      }

      return result;
    }, 'deletePost');
  }

  protected abstract performDeletePost(postId: string): Promise<ChannelResponse<void>>;

  async getPost(postId: string): Promise<ChannelResponse<PostResult>> {
    return this.executeWithRetry(async () => {
      return this.rateLimiter.execute(() => 
        this.performGetPost(postId)
      );
    }, 'getPost');
  }

  protected abstract performGetPost(postId: string): Promise<ChannelResponse<PostResult>>;

  async getAnalytics(
    postId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    return this.executeWithRetry(async () => {
      // Check cache first
      const cacheKey = `analytics:${this.channelType}:${postId}:${startDate.toISOString()}:${endDate.toISOString()}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return {
          success: true,
          data: JSON.parse(cached)
        };
      }

      const result = await this.rateLimiter.execute(() => 
        this.performGetAnalytics(postId, startDate, endDate)
      );

      // Cache successful results
      if (result.success && result.data) {
        await this.redis.setex(cacheKey, 3600, JSON.stringify(result.data)); // 1 hour cache
        await this.saveAnalytics(postId, result.data);
      }

      return result;
    }, 'getAnalytics');
  }

  protected abstract performGetAnalytics(
    postId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>>;

  async getAccountAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    return this.executeWithRetry(async () => {
      return this.rateLimiter.execute(() => 
        this.performGetAccountAnalytics(startDate, endDate)
      );
    }, 'getAccountAnalytics');
  }

  protected abstract performGetAccountAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>>;

  async healthCheck(): Promise<ChannelResponse<HealthStatus>> {
    try {
      const startTime = Date.now();
      
      // Check database connection
      const dbHealthy = await this.checkDatabaseHealth();
      
      // Check Redis connection
      const redisHealthy = await this.checkRedisHealth();
      
      // Check API reachability
      const apiHealth = await this.checkAPIHealth();
      
      const responseTime = Date.now() - startTime;
      
      const isHealthy = dbHealthy && redisHealthy && apiHealth.reachable;
      
      return {
        success: true,
        data: {
          status: isHealthy ? 'healthy' : 'degraded',
          message: isHealthy ? 'All systems operational' : 'Some systems are experiencing issues',
          lastChecked: new Date(),
          apiStatus: {
            reachable: apiHealth.reachable,
            responseTimeMs: apiHealth.responseTimeMs || responseTime
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Failed to perform health check',
          details: error,
          retryable: true
        }
      };
    }
  }

  protected abstract checkAPIHealth(): Promise<{ reachable: boolean; responseTimeMs?: number }>;

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return this.rateLimiter.getStatus();
  }

  // Helper methods
  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    operation: string
  ): Promise<T> {
    return this.retryHandler.execute(fn, `${this.channelType}:${operation}`, {
      shouldRetry: (error) => this.shouldRetryError(error)
    });
  }

  protected shouldRetryError(error: any): boolean {
    if (error.retryable !== undefined) {
      return error.retryable;
    }
    
    // Add channel-specific retry logic here
    return true;
  }

  protected createError(code: string, message: string, details?: any, retryable = false): ChannelError {
    return {
      code,
      message,
      details,
      retryable
    };
  }

  // Database operations
  private async createPostRecord(content: PostContent, options?: ScheduleOptions): Promise<string> {
    const id = uuidv4();
    
    await this.db.query(
      `INSERT INTO posts (id, channel_id, content, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        this.channelId,
        JSON.stringify(content),
        options?.scheduledAt ? 'scheduled' : 'pending',
        options?.scheduledAt
      ]
    );
    
    return id;
  }

  private async updatePostRecord(id: string, result: ChannelResponse<PostResult>): Promise<void> {
    if (result.success && result.data) {
      await this.db.query(
        `UPDATE posts 
         SET external_id = $1, status = $2, published_at = $3
         WHERE id = $4`,
        [
          result.data.id,
          result.data.status,
          result.data.publishedAt,
          id
        ]
      );
    }
  }

  private async updatePostError(id: string, error: Error): Promise<void> {
    await this.db.query(
      `UPDATE posts 
       SET status = 'failed', error_details = $1, retry_count = retry_count + 1
       WHERE id = $2`,
      [
        JSON.stringify({ message: error.message, stack: error.stack }),
        id
      ]
    );
  }

  private async deletePostRecord(postId: string): Promise<void> {
    await this.db.query('DELETE FROM posts WHERE external_id = $1', [postId]);
  }

  private async saveAnalytics(postId: string, data: AnalyticsData): Promise<void> {
    await this.db.query(
      `INSERT INTO analytics 
       (post_id, channel_id, date, impressions, clicks, engagement, reach, conversions, spend, custom_metrics)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (post_id, date) 
       DO UPDATE SET 
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         engagement = EXCLUDED.engagement,
         reach = EXCLUDED.reach,
         conversions = EXCLUDED.conversions,
         spend = EXCLUDED.spend,
         custom_metrics = EXCLUDED.custom_metrics`,
      [
        postId,
        this.channelId,
        data.timestamp,
        data.impressions,
        data.clicks,
        data.engagement,
        data.reach,
        data.conversions,
        data.spend,
        JSON.stringify(data.customMetrics)
      ]
    );
  }

  private async saveCredentials(credentials: ChannelCredentials): Promise<void> {
    await this.db.query(
      `UPDATE channels 
       SET credentials = $1, last_synced_at = NOW()
       WHERE id = $2`,
      [
        JSON.stringify(credentials),
        this.channelId
      ]
    );
  }

  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.db.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return false;
    }
  }

  private async checkRedisHealth(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return false;
    }
  }

  private async scheduleAnalyticsCollection(postId: string): Promise<void> {
    // Schedule analytics collection job
    const jobData = {
      channelType: this.channelType,
      postId,
      channelId: this.channelId
    };
    
    await this.redis.zadd(
      'analytics:schedule',
      Date.now() + 3600000, // 1 hour from now
      JSON.stringify(jobData)
    );
  }

  protected abstract validateContent(content: PostContent): Promise<ChannelError | null>;
}