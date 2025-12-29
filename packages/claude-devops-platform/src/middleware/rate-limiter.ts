import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

const redis = new Redis(config.redis.url, {
  password: config.redis.password,
  enableOfflineQueue: false,
});

// Default rate limiter
const defaultRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:default',
  points: config.rateLimit.maxRequests,
  duration: config.rateLimit.windowMs / 1000, // Convert to seconds
  blockDuration: 60, // Block for 1 minute if exceeded
});

// Strict rate limiter for sensitive endpoints
const strictRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:strict',
  points: 10,
  duration: 60, // 10 requests per minute
  blockDuration: 300, // Block for 5 minutes if exceeded
});

// Deployment rate limiter
const deploymentRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:deployment',
  points: 5,
  duration: 300, // 5 deployments per 5 minutes
  blockDuration: 600, // Block for 10 minutes if exceeded
});

// API key rate limiter (higher limits)
const apiKeyRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:apikey',
  points: 1000,
  duration: 3600, // 1000 requests per hour
  blockDuration: 300, // Block for 5 minutes if exceeded
});

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Determine which rate limiter to use
    let limiter = defaultRateLimiter;
    let key = req.ip;
    
    // Use different limiters based on auth method
    if (req.headers.authorization?.startsWith('ApiKey ')) {
      limiter = apiKeyRateLimiter;
      key = req.headers.authorization.substring(7, 20); // Use first part of API key
    }
    
    // Use stricter limits for sensitive endpoints
    if (req.path.includes('/auth/') || req.path.includes('/admin/')) {
      limiter = strictRateLimiter;
    }
    
    // Special limits for deployment endpoints
    if (req.path.includes('/deployments') && req.method === 'POST') {
      limiter = deploymentRateLimiter;
    }
    
    await limiter.consume(key);
    
    next();
  } catch (rejRes: any) {
    // Rate limit exceeded
    const retryAfter = Math.round(rejRes.msBeforeNext / 1000) || 60;
    
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      retryAfter,
    });
    
    res.set({
      'Retry-After': retryAfter.toString(),
      'X-RateLimit-Limit': rejRes.totalPoints?.toString() || '100',
      'X-RateLimit-Remaining': rejRes.remainingPoints?.toString() || '0',
      'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString(),
    });
    
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        details: {
          retryAfter,
        },
      },
    });
  }
}

export function createCustomRateLimiter(options: {
  name: string;
  points: number;
  duration: number;
  blockDuration?: number;
}) {
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${options.name}`,
    points: options.points,
    duration: options.duration,
    blockDuration: options.blockDuration || 60,
  });
  
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = req.ip;
      await limiter.consume(key);
      next();
    } catch (rejRes: any) {
      const retryAfter = Math.round(rejRes.msBeforeNext / 1000) || 60;
      
      res.set({
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': options.points.toString(),
        'X-RateLimit-Remaining': rejRes.remainingPoints?.toString() || '0',
        'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString(),
      });
      
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          details: {
            retryAfter,
          },
        },
      });
    }
  };
}

// Middleware to add rate limit headers to all responses
export function rateLimitHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Add rate limit info to response headers
  res.on('finish', async () => {
    try {
      const key = req.ip;
      const limiterRes = await defaultRateLimiter.get(key);
      
      if (limiterRes) {
        res.set({
          'X-RateLimit-Limit': config.rateLimit.maxRequests.toString(),
          'X-RateLimit-Remaining': limiterRes.remainingPoints?.toString() || '0',
          'X-RateLimit-Reset': new Date(
            Date.now() + limiterRes.msBeforeNext
          ).toISOString(),
        });
      }
    } catch (error) {
      // Silently ignore errors
    }
  });
  
  next();
}