import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

// Create Redis client with connection pooling
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  disconnectTimeout: 2000,
  commandTimeout: 5000,
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect when Redis is in readonly mode
      return true;
    }
    return false;
  },
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis reconnection attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
});

// Redis event handlers
redis.on('connect', () => {
  logger.info('Redis client connected');
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

redis.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', (delay: number) => {
  logger.info(`Redis reconnecting in ${delay}ms`);
});

// Helper functions
export async function getJSON<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
}

export async function setJSON<T>(
  key: string,
  value: T,
  ttl?: number
): Promise<void> {
  const json = JSON.stringify(value);
  if (ttl) {
    await redis.setex(key, ttl, json);
  } else {
    await redis.set(key, json);
  }
}

export async function acquireLock(
  key: string,
  ttl: number = 30
): Promise<string | null> {
  const token = Math.random().toString(36).substring(2);
  const result = await redis.set(
    `lock:${key}`,
    token,
    'EX',
    ttl,
    'NX'
  );
  return result === 'OK' ? token : null;
}

export async function releaseLock(
  key: string,
  token: string
): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, `lock:${key}`, token);
  return result === 1;
}

// Cache wrapper with automatic serialization
export class Cache {
  constructor(
    private prefix: string,
    private defaultTTL: number = config.redis.ttl
  ) {}

  async get<T>(key: string): Promise<T | null> {
    return getJSON<T>(`${this.prefix}:${key}`);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await setJSON(`${this.prefix}:${key}`, value, ttl || this.defaultTTL);
  }

  async delete(key: string): Promise<void> {
    await redis.del(`${this.prefix}:${key}`);
  }

  async deletePattern(pattern: string): Promise<void> {
    const keys = await redis.keys(`${this.prefix}:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await redis.exists(`${this.prefix}:${key}`)) === 1;
  }

  async ttl(key: string): Promise<number> {
    return redis.ttl(`${this.prefix}:${key}`);
  }
}