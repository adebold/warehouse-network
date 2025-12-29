import Redis, { RedisOptions } from 'ioredis';
import { createLogger } from '../utils/logger';

const logger = createLogger('Redis');

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  enableOfflineQueue?: boolean;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | void;
  tls?: boolean;
}

export class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private config: RedisConfig;

  constructor(config: RedisConfig = {}) {
    this.config = {
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: config.password || process.env.REDIS_PASSWORD,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'marketing:',
      enableOfflineQueue: config.enableOfflineQueue !== undefined ? config.enableOfflineQueue : false,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      tls: config.tls !== undefined ? config.tls : process.env.REDIS_TLS === 'true'
    };

    const redisOptions: RedisOptions = {
      ...this.config,
      retryStrategy: this.config.retryStrategy || this.defaultRetryStrategy,
      reconnectOnError: (err) => {
        logger.error('Redis reconnection error', err);
        return true;
      }
    };

    this.client = new Redis(redisOptions);
    this.subscriber = new Redis(redisOptions);

    this.setupEventHandlers();
  }

  private defaultRetryStrategy(times: number): number | void {
    if (times > 10) {
      logger.error('Redis connection failed after 10 retries');
      return undefined;
    }
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Retrying Redis connection in ${delay}ms (attempt ${times})`);
    return delay;
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error', err);
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    this.subscriber.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    this.subscriber.on('error', (err) => {
      logger.error('Redis subscriber error', err);
    });
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Failed to get key: ${key}`, error);
      throw error;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.error(`Failed to set key: ${key}`, error);
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error(`Failed to delete key: ${key}`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to check key existence: ${key}`, error);
      throw error;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to set expiration for key: ${key}`, error);
      throw error;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error(`Failed to increment key: ${key}`, error);
      throw error;
    }
  }

  async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      logger.error(`Failed to decrement key: ${key}`, error);
      throw error;
    }
  }

  async hset(key: string, field: string, value: any): Promise<number> {
    try {
      const serialized = JSON.stringify(value);
      return await this.client.hset(key, field, serialized);
    } catch (error) {
      logger.error(`Failed to set hash field: ${key}.${field}`, error);
      throw error;
    }
  }

  async hget<T = any>(key: string, field: string): Promise<T | null> {
    try {
      const value = await this.client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Failed to get hash field: ${key}.${field}`, error);
      throw error;
    }
  }

  async hgetall<T = any>(key: string): Promise<Record<string, T>> {
    try {
      const hash = await this.client.hgetall(key);
      const result: Record<string, T> = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      logger.error(`Failed to get all hash fields: ${key}`, error);
      throw error;
    }
  }

  async lpush(key: string, ...values: any[]): Promise<number> {
    try {
      const serialized = values.map(v => JSON.stringify(v));
      return await this.client.lpush(key, ...serialized);
    } catch (error) {
      logger.error(`Failed to push to list: ${key}`, error);
      throw error;
    }
  }

  async rpop<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.rpop(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Failed to pop from list: ${key}`, error);
      throw error;
    }
  }

  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      const values = await this.client.lrange(key, start, stop);
      return values.map(v => JSON.parse(v));
    } catch (error) {
      logger.error(`Failed to get list range: ${key}`, error);
      throw error;
    }
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      logger.error(`Failed to add to set: ${key}`, error);
      throw error;
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to check set membership: ${key}`, error);
      throw error;
    }
  }

  async publish(channel: string, message: any): Promise<number> {
    try {
      const serialized = JSON.stringify(message);
      return await this.client.publish(channel, serialized);
    } catch (error) {
      logger.error(`Failed to publish to channel: ${channel}`, error);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsed = JSON.parse(message);
            callback(parsed);
          } catch (error) {
            logger.error(`Failed to parse message from channel: ${channel}`, error);
          }
        }
      });
    } catch (error) {
      logger.error(`Failed to subscribe to channel: ${channel}`, error);
      throw error;
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      logger.error(`Failed to unsubscribe from channel: ${channel}`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
    await this.subscriber.quit();
    logger.info('Redis connections closed');
  }

  getClient(): Redis {
    return this.client;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }
}

// Singleton instances
let redisInstance: RedisClient | null = null;

export function getRedis(config?: RedisConfig): RedisClient {
  if (!redisInstance) {
    redisInstance = new RedisClient(config);
  }
  return redisInstance;
}