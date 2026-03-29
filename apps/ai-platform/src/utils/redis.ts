/**
 * Redis Manager for caching and session management
 */

import Redis from 'ioredis';
import { logger } from './logger';

export class RedisManager {
  private client: Redis | null = null;
  private isConnected = false;

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        db: parseInt(process.env.REDIS_DB || '0')
      });

      // Set up event handlers
      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('🔗 Connected to Redis');
      });

      this.client.on('disconnect', () => {
        this.isConnected = false;
        logger.warn('📡 Disconnected from Redis');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        logger.error('❌ Redis error:', error);
      });

      this.client.on('reconnecting', () => {
        logger.info('🔄 Reconnecting to Redis...');
      });

      // Actually connect
      await this.client.connect();

      logger.info('✅ Redis Manager initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('✅ Disconnected from Redis');
    }
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`❌ Redis GET failed for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value with key
   */
  async set(key: string, value: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.set(key, value);
      return result === 'OK';
    } catch (error) {
      logger.error(`❌ Redis SET failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set value with expiration
   */
  async setex(key: string, seconds: number, value: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.setex(key, seconds, value);
      return result === 'OK';
    } catch (error) {
      logger.error(`❌ Redis SETEX failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error(`❌ Redis DEL failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      logger.error(`❌ Redis EXISTS failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration on key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      logger.error(`❌ Redis EXPIRE failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get multiple values
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.mget(...keys);
    } catch (error) {
      logger.error(`❌ Redis MGET failed for keys ${keys.join(', ')}:`, error);
      return new Array(keys.length).fill(null);
    }
  }

  /**
   * Set multiple values
   */
  async mset(keyValues: Record<string, string>): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const args: string[] = [];
      for (const [key, value] of Object.entries(keyValues)) {
        args.push(key, value);
      }
      const result = await this.client.mset(...args);
      return result === 'OK';
    } catch (error) {
      logger.error('❌ Redis MSET failed:', error);
      return false;
    }
  }

  /**
   * Hash operations
   */
  async hset(key: string, field: string, value: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.hset(key, field, value);
      return result >= 0;
    } catch (error) {
      logger.error(`❌ Redis HSET failed for key ${key}:`, error);
      return false;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.hget(key, field);
    } catch (error) {
      logger.error(`❌ Redis HGET failed for key ${key}:`, error);
      return null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.hgetall(key);
    } catch (error) {
      logger.error(`❌ Redis HGETALL failed for key ${key}:`, error);
      return {};
    }
  }

  /**
   * List operations
   */
  async lpush(key: string, value: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.lpush(key, value);
    } catch (error) {
      logger.error(`❌ Redis LPUSH failed for key ${key}:`, error);
      return 0;
    }
  }

  async rpop(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.rpop(key);
    } catch (error) {
      logger.error(`❌ Redis RPOP failed for key ${key}:`, error);
      return null;
    }
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.lrange(key, start, stop);
    } catch (error) {
      logger.error(`❌ Redis LRANGE failed for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Set operations
   */
  async sadd(key: string, member: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.sadd(key, member);
      return result > 0;
    } catch (error) {
      logger.error(`❌ Redis SADD failed for key ${key}:`, error);
      return false;
    }
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.smembers(key);
    } catch (error) {
      logger.error(`❌ Redis SMEMBERS failed for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Sorted set operations
   */
  async zadd(key: string, score: number, member: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.zadd(key, score, member);
      return result > 0;
    } catch (error) {
      logger.error(`❌ Redis ZADD failed for key ${key}:`, error);
      return false;
    }
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.zrange(key, start, stop);
    } catch (error) {
      logger.error(`❌ Redis ZRANGE failed for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Pattern-based operations
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(`❌ Redis KEYS failed for pattern ${pattern}:`, error);
      return [];
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      return await this.client.del(...keys);
    } catch (error) {
      logger.error(`❌ Redis delete pattern failed for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Transaction operations
   */
  async multi(): Promise<any> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    return this.client.multi();
  }

  /**
   * Publish/Subscribe operations
   */
  async publish(channel: string, message: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.publish(channel, message);
    } catch (error) {
      logger.error(`❌ Redis PUBLISH failed for channel ${channel}:`, error);
      return 0;
    }
  }

  /**
   * Get Redis info
   */
  async info(): Promise<string> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      return await this.client.info();
    } catch (error) {
      logger.error('❌ Redis INFO failed:', error);
      return '';
    }
  }

  /**
   * Flush database
   */
  async flushdb(): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.client.flushdb();
      return result === 'OK';
    } catch (error) {
      logger.error('❌ Redis FLUSHDB failed:', error);
      return false;
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get client instance (use with caution)
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('❌ Redis health check failed:', error);
      return false;
    }
  }
}