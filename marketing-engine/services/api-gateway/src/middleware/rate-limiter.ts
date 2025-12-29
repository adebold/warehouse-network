import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { redis } from '../utils/redis';
import { config } from '../config';
import { logger } from '../utils/logger';

// Custom Redis store for rate limiting
class RedisStore {
  constructor(private client: typeof redis) {}

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const now = Date.now();
    const windowStart = now - config.rateLimit.windowMs;
    
    // Use Redis sorted sets for sliding window
    const multi = this.client.multi();
    
    // Remove old entries
    multi.zremrangebyscore(key, '-inf', windowStart);
    
    // Add current request
    multi.zadd(key, now, `${now}-${Math.random()}`);
    
    // Count requests in window
    multi.zcard(key);
    
    // Set expiry
    multi.expire(key, Math.ceil(config.rateLimit.windowMs / 1000));
    
    const results = await multi.exec();
    
    if (!results) {
      throw new Error('Redis transaction failed');
    }
    
    const totalHits = results[2][1] as number;
    const resetTime = new Date(now + config.rateLimit.windowMs);
    
    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    // Not needed for sliding window
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(key);
  }
}

// Create rate limiter instances
const store = new RedisStore(redis);

// Global rate limiter
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: (req: Request) => {
    // Use IP + user ID for authenticated users
    const userId = (req as any).user?.userId;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return userId ? `rate:user:${userId}` : `rate:ip:${ip}`;
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userId: (req as any).user?.userId,
    });
    
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/health/live';
  },
});

// Channel-specific rate limiters
export function createChannelRateLimiter(channel: string, maxRequests: number) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.userId || 'anonymous';
      return `rate:channel:${channel}:${userId}`;
    },
    handler: (req: Request, res: Response) => {
      logger.warn('Channel rate limit exceeded', {
        channel,
        userId: (req as any).user?.userId,
        path: req.path,
      });
      
      res.status(429).json({
        error: 'Channel rate limit exceeded',
        message: `Too many requests to ${channel} channel. Please try again later.`,
        channel,
        retryAfter: res.getHeader('Retry-After'),
      });
    },
  });
}

// Endpoint-specific rate limiters
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: (req: Request) => {
    return `rate:auth:${req.ip}`;
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Please wait before trying again.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

// API key rate limiter (higher limits)
export const apiKeyRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max * 10, // 10x higher limit for API keys
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: (req: Request) => {
    const apiKey = req.headers['x-api-key'] as string;
    return `rate:apikey:${apiKey}`;
  },
  skip: (req: Request) => {
    // Only apply to requests with API key
    return !req.headers['x-api-key'];
  },
});