import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

class RedisService {
  private client: RedisClientType | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
    };

    this.client = createClient({
      url: `redis://${config.password ? `:${config.password}@` : ''}${config.host}:${config.port}/${config.db}`,
      socket: {
        connectTimeout: 10000,
        lazyConnect: true,
      }
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('end', () => {
      logger.info('Redis client disconnected');
    });

    try {
      await this.client.connect();
      this.isInitialized = true;
      logger.info('Redis connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isInitialized) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string, expireInSeconds?: number): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }

    try {
      if (expireInSeconds) {
        await this.client.setEx(key, expireInSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isInitialized) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      throw error;
    }
  }

  async increment(key: string, expireInSeconds?: number): Promise<number> {
    if (!this.client || !this.isInitialized) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }

    try {
      const result = await this.client.incr(key);
      
      if (expireInSeconds && result === 1) {
        await this.client.expire(key, expireInSeconds);
      }
      
      return result;
    } catch (error) {
      logger.error(`Redis INCR error for key ${key}:`, error);
      throw error;
    }
  }

  async setHash(key: string, field: string, value: string): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }

    try {
      await this.client.hSet(key, field, value);
    } catch (error) {
      logger.error(`Redis HSET error for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  async getHash(key: string, field: string): Promise<string | undefined> {
    if (!this.client || !this.isInitialized) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }

    try {
      return await this.client.hGet(key, field);
    } catch (error) {
      logger.error(`Redis HGET error for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  async flushDb(): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }

    try {
      await this.client.flushDb();
    } catch (error) {
      logger.error('Redis FLUSHDB error:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.client && this.isInitialized) {
      await this.client.quit();
      this.client = null;
      this.isInitialized = false;
      logger.info('Redis connection closed');
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.client?.isReady === true;
  }

  async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.client?.ping();
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return { status: 'unhealthy' };
    }
  }

  getClient(): RedisClientType | null {
    return this.client;
  }
}

export const redisService = new RedisService();
export const redisClient = redisService.getClient();
export default redisService;