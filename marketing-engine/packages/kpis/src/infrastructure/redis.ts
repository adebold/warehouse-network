import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private static instance: RedisClient;

  private constructor() {
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };

    this.client = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error', err);
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  public async connect(): Promise<void> {
    await Promise.all([
      this.client.connect(),
      this.subscriber.connect()
    ]);
  }

  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis get error', { key, error });
      throw error;
    }
  }

  public async set(
    key: string,
    value: string,
    ttl?: number
  ): Promise<string> {
    try {
      if (ttl) {
        return await this.client.set(key, value, 'EX', ttl);
      }
      return await this.client.set(key, value);
    } catch (error) {
      logger.error('Redis set error', { key, error });
      throw error;
    }
  }

  public async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error('Redis del error', { key, error });
      throw error;
    }
  }

  public async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Redis incr error', { key, error });
      throw error;
    }
  }

  public async expire(key: string, seconds: number): Promise<number> {
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      logger.error('Redis expire error', { key, seconds, error });
      throw error;
    }
  }

  public async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      logger.error('Redis hget error', { key, field, error });
      throw error;
    }
  }

  public async hset(
    key: string,
    field: string,
    value: string
  ): Promise<number> {
    try {
      return await this.client.hset(key, field, value);
    } catch (error) {
      logger.error('Redis hset error', { key, field, error });
      throw error;
    }
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      logger.error('Redis hgetall error', { key, error });
      throw error;
    }
  }

  public async zadd(
    key: string,
    score: number,
    member: string
  ): Promise<number> {
    try {
      return await this.client.zadd(key, score, member);
    } catch (error) {
      logger.error('Redis zadd error', { key, score, member, error });
      throw error;
    }
  }

  public async zrange(
    key: string,
    start: number,
    stop: number,
    withScores?: boolean
  ): Promise<string[]> {
    try {
      if (withScores) {
        return await this.client.zrange(key, start, stop, 'WITHSCORES');
      }
      return await this.client.zrange(key, start, stop);
    } catch (error) {
      logger.error('Redis zrange error', { key, start, stop, error });
      throw error;
    }
  }

  public async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.client.publish(channel, message);
    } catch (error) {
      logger.error('Redis publish error', { channel, error });
      throw error;
    }
  }

  public async subscribe(
    channel: string,
    callback: (message: string) => void
  ): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          callback(message);
        }
      });
    } catch (error) {
      logger.error('Redis subscribe error', { channel, error });
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', error);
      return false;
    }
  }

  public async close(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.subscriber.quit()
    ]);
    logger.info('Redis clients closed');
  }

  public getClient(): Redis {
    return this.client;
  }
}