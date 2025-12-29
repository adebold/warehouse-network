/**
 * Redis connection and caching layer
 */

import { createClient, RedisClientType } from 'redis';

import config from '../config/index.js';
import { logger } from '../monitoring/logger.js';

export class RedisCache {
  private client: RedisClientType;
  private connected = false;
  private keyPrefix: string;
  private defaultTTL: number;

  constructor() {
    this.keyPrefix = config.redis.keyPrefix;
    this.defaultTTL = config.redis.ttl;
    
    const clientOptions: any = {
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            logger.error('Redis: Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          const delay = Math.min(retries * 100, 3000);
          logger.info(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        }
      },
      database: config.redis.db
    };

    if (config.redis.password) {
      clientOptions.password = config.redis.password;
    }

    this.client = createClient(clientOptions);

    // Handle Redis events
    this.client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.connected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('end', () => {
      logger.info('Redis client disconnected');
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {return;}
    
    try {
      await this.client.connect();
      this.connected = true;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T = any>(key: string): Promise<T | null> {
    if (!this.connected) {await this.connect();}
    
    try {
      const value = await this.client.get(this.getKey(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    try {
      const serialized = JSON.stringify(value);
      const fullKey = this.getKey(key);
      
      if (ttl || this.defaultTTL) {
        await this.client.setEx(fullKey, ttl || this.defaultTTL, serialized);
      } else {
        await this.client.set(fullKey, serialized);
      }
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    try {
      await this.client.del(this.getKey(key));
    } catch (error) {
      logger.error(`Redis DELETE error for key ${key}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.connected) {await this.connect();}
    
    try {
      const result = await this.client.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    try {
      await this.client.expire(this.getKey(key), seconds);
    } catch (error) {
      logger.error(`Redis EXPIRE error for key ${key}:`, error);
    }
  }

  // Hash operations
  async hset(key: string, field: string, value: any): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    try {
      const serialized = JSON.stringify(value);
      await this.client.hSet(this.getKey(key), field, serialized);
    } catch (error) {
      logger.error(`Redis HSET error for key ${key}:`, error);
      throw error;
    }
  }

  async hget<T = any>(key: string, field: string): Promise<T | null> {
    if (!this.connected) {await this.connect();}
    
    try {
      const value = await this.client.hGet(this.getKey(key), field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Redis HGET error for key ${key}:`, error);
      return null;
    }
  }

  async hgetall<T = any>(key: string): Promise<Record<string, T> | null> {
    if (!this.connected) {await this.connect();}
    
    try {
      const hash = await this.client.hGetAll(this.getKey(key));
      if (!hash || Object.keys(hash).length === 0) {return null;}
      
      const result: Record<string, T> = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      logger.error(`Redis HGETALL error for key ${key}:`, error);
      return null;
    }
  }

  // List operations
  async lpush(key: string, ...values: any[]): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    try {
      const serialized = values.map(v => JSON.stringify(v));
      await this.client.lPush(this.getKey(key), serialized);
    } catch (error) {
      logger.error(`Redis LPUSH error for key ${key}:`, error);
      throw error;
    }
  }

  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    if (!this.connected) {await this.connect();}
    
    try {
      const values = await this.client.lRange(this.getKey(key), start, stop);
      return values.map(v => JSON.parse(v));
    } catch (error) {
      logger.error(`Redis LRANGE error for key ${key}:`, error);
      return [];
    }
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    try {
      await this.client.lTrim(this.getKey(key), start, stop);
    } catch (error) {
      logger.error(`Redis LTRIM error for key ${key}:`, error);
      throw error;
    }
  }

  // Pub/Sub operations
  async publish(channel: string, message: any): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    try {
      const serialized = JSON.stringify(message);
      await this.client.publish(channel, serialized);
    } catch (error) {
      logger.error(`Redis PUBLISH error for channel ${channel}:`, error);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    const subscriber = this.client.duplicate();
    await subscriber.connect();
    
    await subscriber.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message);
        callback(parsed);
      } catch (error) {
        logger.error(`Redis SUBSCRIBE parse error for channel ${channel}:`, error);
      }
    });
  }

  // Atomic operations
  async incr(key: string): Promise<number> {
    if (!this.connected) {await this.connect();}
    
    try {
      return await this.client.incr(this.getKey(key));
    } catch (error) {
      logger.error(`Redis INCR error for key ${key}:`, error);
      throw error;
    }
  }

  async decr(key: string): Promise<number> {
    if (!this.connected) {await this.connect();}
    
    try {
      return await this.client.decr(this.getKey(key));
    } catch (error) {
      logger.error(`Redis DECR error for key ${key}:`, error);
      throw error;
    }
  }

  // Cache patterns
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {return cached;}
    
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.connected) {await this.connect();}
    
    try {
      const keys = await this.client.keys(`${this.keyPrefix}${pattern}`);
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.info(`Invalidated ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error(`Redis pattern invalidation error for ${pattern}:`, error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
    this.connected = false;
    logger.info('Redis connection closed');
  }

  getClient(): RedisClientType {
    return this.client;
  }
}

// Singleton instance
export const redis = new RedisCache();