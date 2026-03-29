/**
 * Redis-based Rate Limiter with Sliding Window Algorithm
 * Implements comprehensive rate limiting for different endpoints
 */

import Redis from 'ioredis';
import { SecurityConfig } from './config';

// Redis client singleton
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: SecurityConfig.redis.host,
      port: SecurityConfig.redis.port,
      password: SecurityConfig.redis.password,
      db: SecurityConfig.redis.db,
      keyPrefix: SecurityConfig.redis.keyPrefix,
      maxRetriesPerRequest: SecurityConfig.redis.maxRetries,
      retryDelayOnFailover: SecurityConfig.redis.retryDelay,
      connectTimeout: SecurityConfig.redis.connectTimeout,
      lazyConnect: true,
      onClusterReady() {
        console.log('Redis cluster ready');
      },
      onConnect() {
        console.log('Redis connected');
      },
      onError(err) {
        console.error('Redis error:', err);
      },
    });
  }
  return redisClient;
}

export interface RateLimitConfig {
  windowMs: number; // Window size in milliseconds
  max: number; // Maximum requests per window
  skipOnError?: boolean; // Skip rate limiting if Redis is down
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
}

export class RateLimiter {
  private redis: Redis;

  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Check rate limit using sliding window algorithm
   */
  async checkLimit(
    identifier: string,
    config: RateLimitConfig,
    prefix = 'rate_limit'
  ): Promise<RateLimitResult> {
    const key = `${prefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // Use Lua script for atomic operations
      const script = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])
        local windowStart = now - window

        -- Remove old entries
        redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

        -- Count current entries
        local current = redis.call('ZCARD', key)

        if current < limit then
          -- Add current request
          redis.call('ZADD', key, now, now)
          -- Set expiry
          redis.call('EXPIRE', key, math.ceil(window / 1000))
          return {1, limit - current - 1, current + 1}
        else
          return {0, 0, current}
        end
      `;

      const result = await this.redis.eval(
        script,
        1,
        key,
        now.toString(),
        config.windowMs.toString(),
        config.max.toString()
      ) as [number, number, number];

      const [allowed, remaining, totalHits] = result;
      const resetTime = new Date(now + config.windowMs);

      return {
        allowed: allowed === 1,
        remaining,
        resetTime,
        totalHits,
      };
    } catch (error) {
      console.error('Rate limiter error:', error);

      // If Redis is down and skipOnError is true, allow the request
      if (config.skipOnError) {
        return {
          allowed: true,
          remaining: config.max,
          resetTime: new Date(now + config.windowMs),
          totalHits: 0,
        };
      }

      // Otherwise, deny the request for safety
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(now + config.windowMs),
        totalHits: config.max,
      };
    }
  }

  /**
   * Rate limiter for API endpoints
   */
  async checkApiLimit(identifier: string): Promise<RateLimitResult> {
    return this.checkLimit(identifier, SecurityConfig.rateLimit.api, 'api');
  }

  /**
   * Rate limiter for authentication endpoints
   */
  async checkAuthLimit(identifier: string): Promise<RateLimitResult> {
    return this.checkLimit(identifier, SecurityConfig.rateLimit.auth, 'auth');
  }

  /**
   * Rate limiter for registration endpoints
   */
  async checkRegistrationLimit(identifier: string): Promise<RateLimitResult> {
    return this.checkLimit(identifier, SecurityConfig.rateLimit.registration, 'reg');
  }

  /**
   * Rate limiter for password reset endpoints
   */
  async checkPasswordResetLimit(identifier: string): Promise<RateLimitResult> {
    return this.checkLimit(identifier, SecurityConfig.rateLimit.passwordReset, 'pwd_reset');
  }

  /**
   * Rate limiter for 2FA endpoints
   */
  async checkTwoFactorLimit(identifier: string): Promise<RateLimitResult> {
    return this.checkLimit(identifier, SecurityConfig.rateLimit.twoFactor, 'twofa');
  }

  /**
   * Increment failed login attempts for an IP/user
   */
  async incrementFailedAttempts(identifier: string): Promise<number> {
    const key = `failed_attempts:${identifier}`;
    const attempts = await this.redis.incr(key);

    // Set expiry for failed attempts key
    if (attempts === 1) {
      await this.redis.expire(key, SecurityConfig.auth.lockoutDuration);
    }

    return attempts;
  }

  /**
   * Check if account is locked due to failed attempts
   */
  async isAccountLocked(identifier: string): Promise<boolean> {
    const key = `failed_attempts:${identifier}`;
    const attempts = await this.redis.get(key);
    return attempts ? parseInt(attempts) >= SecurityConfig.auth.maxLoginAttempts : false;
  }

  /**
   * Reset failed attempts counter
   */
  async resetFailedAttempts(identifier: string): Promise<void> {
    const key = `failed_attempts:${identifier}`;
    await this.redis.del(key);
  }

  /**
   * Store suspicious activity
   */
  async flagSuspiciousActivity(
    identifier: string,
    activityType: string,
    details: Record<string, any>
  ): Promise<void> {
    const key = `suspicious:${identifier}:${activityType}`;
    const data = {
      timestamp: Date.now(),
      details,
    };

    await this.redis.setex(key, 24 * 60 * 60, JSON.stringify(data)); // 24 hours
  }

  /**
   * Check for suspicious activity patterns
   */
  async checkSuspiciousActivity(identifier: string): Promise<boolean> {
    const pattern = `suspicious:${identifier}:*`;
    const keys = await this.redis.keys(pattern);

    // If more than 5 different types of suspicious activity in 24 hours
    return keys.length > 5;
  }

  /**
   * Get rate limit metrics for monitoring
   */
  async getRateLimitMetrics(prefix = 'rate_limit'): Promise<{
    activeKeys: number;
    totalMemoryUsage: number;
    keysByPrefix: Record<string, number>;
  }> {
    try {
      const keys = await this.redis.keys(`${prefix}:*`);
      const keysByPrefix: Record<string, number> = {};

      for (const key of keys) {
        const keyPrefix = key.split(':')[1] || 'unknown';
        keysByPrefix[keyPrefix] = (keysByPrefix[keyPrefix] || 0) + 1;
      }

      // Estimate memory usage (rough calculation)
      const totalMemoryUsage = keys.length * 100; // Approximate bytes per key

      return {
        activeKeys: keys.length,
        totalMemoryUsage,
        keysByPrefix,
      };
    } catch (error) {
      console.error('Error getting rate limit metrics:', error);
      return {
        activeKeys: 0,
        totalMemoryUsage: 0,
        keysByPrefix: {},
      };
    }
  }

  /**
   * Clear expired keys manually (cleanup operation)
   */
  async cleanupExpiredKeys(prefix = 'rate_limit'): Promise<number> {
    try {
      const script = `
        local keys = redis.call('KEYS', ARGV[1])
        local deleted = 0
        for i = 1, #keys do
          local ttl = redis.call('TTL', keys[i])
          if ttl == -1 or ttl == 0 then
            redis.call('DEL', keys[i])
            deleted = deleted + 1
          end
        end
        return deleted
      `;

      const result = await this.redis.eval(script, 0, `${prefix}:*`) as number;
      return result;
    } catch (error) {
      console.error('Error cleaning up expired keys:', error);
      return 0;
    }
  }

  /**
   * Get current rate limit status for an identifier
   */
  async getCurrentStatus(
    identifier: string,
    config: RateLimitConfig,
    prefix = 'rate_limit'
  ): Promise<{
    currentCount: number;
    remaining: number;
    resetTime: Date;
    isAllowed: boolean;
  }> {
    const key = `${prefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // Remove old entries and count current
      const script = `
        local key = KEYS[1]
        local windowStart = tonumber(ARGV[1])

        -- Remove old entries
        redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

        -- Count current entries
        local current = redis.call('ZCARD', key)

        return current
      `;

      const currentCount = await this.redis.eval(
        script,
        1,
        key,
        windowStart.toString()
      ) as number;

      const remaining = Math.max(0, config.max - currentCount);
      const resetTime = new Date(now + config.windowMs);
      const isAllowed = currentCount < config.max;

      return {
        currentCount,
        remaining,
        resetTime,
        isAllowed,
      };
    } catch (error) {
      console.error('Error getting current rate limit status:', error);
      return {
        currentCount: 0,
        remaining: config.max,
        resetTime: new Date(now + config.windowMs),
        isAllowed: true,
      };
    }
  }

  /**
   * Bulk check rate limits for multiple identifiers
   */
  async bulkCheckLimits(
    requests: Array<{
      identifier: string;
      config: RateLimitConfig;
      prefix?: string;
    }>
  ): Promise<Array<RateLimitResult & { identifier: string }>> {
    const results: Array<RateLimitResult & { identifier: string }> = [];

    // Process in parallel for better performance
    const promises = requests.map(async (req) => {
      const result = await this.checkLimit(req.identifier, req.config, req.prefix);
      return { ...result, identifier: req.identifier };
    });

    return await Promise.all(promises);
  }

  /**
   * Reset rate limit for a specific identifier (admin function)
   */
  async resetRateLimit(identifier: string, prefix = 'rate_limit'): Promise<void> {
    try {
      const key = `${prefix}:${identifier}`;
      await this.redis.del(key);
    } catch (error) {
      console.error('Error resetting rate limit:', error);
      throw error;
    }
  }

  /**
   * Get top rate limited identifiers
   */
  async getTopRateLimitedIdentifiers(
    prefix = 'rate_limit',
    limit = 10
  ): Promise<Array<{ identifier: string; count: number; ttl: number }>> {
    try {
      const keys = await this.redis.keys(`${prefix}:*`);
      const results: Array<{ identifier: string; count: number; ttl: number }> = [];

      for (const key of keys) {
        const identifier = key.replace(`${prefix}:`, '');
        const count = await this.redis.zcard(key);
        const ttl = await this.redis.ttl(key);

        if (count > 0) {
          results.push({ identifier, count, ttl });
        }
      }

      // Sort by count descending and take top N
      return results
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting top rate limited identifiers:', error);
      return [];
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{
    isHealthy: boolean;
    latency: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return {
        isHealthy: true,
        latency,
      };
    } catch (error) {
      return {
        isHealthy: false,
        latency: -1,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }
  }
}

// Create singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Express middleware for rate limiting
 */
export function createRateLimitMiddleware(
  getLimitConfig: (req: any) => { identifier: string; config: RateLimitConfig; prefix?: string }
) {
  return async (req: any, res: any, next: any) => {
    try {
      const { identifier, config, prefix } = getLimitConfig(req);
      const result = await rateLimiter.checkLimit(identifier, config, prefix);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime.getTime() / 1000));

      if (!result.allowed) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000),
        });
      }

      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error);

      // Allow request to continue if rate limiting fails
      if (config.skipOnError !== false) {
        next();
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Rate limiting service unavailable',
        });
      }
    }
  };
}

/**
 * Get client IP address from request
 */
export function getClientIP(req: any): string {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}