import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { redisService } from '@/utils/redis';
import { Request, Response } from 'express';
import { logSecurityEvent } from '@/utils/logger';

// Custom store using Redis for rate limiting
class RedisStore {
  async increment(key: string): Promise<{ totalHits: number; resetTime?: Date }> {
    try {
      const totalHits = await redisService.increment(key, 900); // 15 minutes window
      return { totalHits };
    } catch (error) {
      // Fallback to allow request if Redis is down
      return { totalHits: 1 };
    }
  }

  async decrement(key: string): Promise<void> {
    // Not implemented for this simple example
  }

  async resetKey(key: string): Promise<void> {
    try {
      await redisService.del(key);
    } catch (error) {
      // Silently fail
    }
  }
}

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(),
  keyGenerator: (req: Request): string => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip || 'unknown';
  },
  onLimitReached: (req: Request, res: Response) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      userId: req.user?.id
    }, req);
  }
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(),
  skipSuccessfulRequests: true, // Don't count successful requests
  onLimitReached: (req: Request, res: Response) => {
    logSecurityEvent('AUTH_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    }, req);
  }
});

// Speed limiter for heavy operations
export const heavyOperationLimiter = slowDown({
  windowMs: 5 * 60 * 1000, // 5 minutes
  delayAfter: 2, // allow 2 requests per windowMs without delay
  delayMs: 500, // add 500ms of delay for each request after delayAfter
  maxDelayMs: 10000, // maximum delay of 10 seconds
  keyGenerator: (req: Request): string => {
    return req.user?.id || req.ip || 'unknown';
  }
});

// Analytics tracking rate limiter (higher limits)
export const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // allow high-frequency analytics events
  message: {
    error: 'Analytics rate limit exceeded',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(),
  keyGenerator: (req: Request): string => {
    return req.user?.id || req.ip || 'unknown';
  }
});

// Create account rate limiter (very strict)
export const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // only 3 account creation attempts per hour per IP
  message: {
    error: 'Too many account creation attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(),
  onLimitReached: (req: Request, res: Response) => {
    logSecurityEvent('ACCOUNT_CREATION_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestBody: req.body.email // Log email for investigation
    }, req);
  }
});