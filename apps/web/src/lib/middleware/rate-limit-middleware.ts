/**
 * Comprehensive Redis-Based Rate Limiting Middleware
 * Provides consistent rate limiting across all API endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter, getClientIP, RateLimitConfig, RateLimitResult } from '@/lib/security/rate-limiter';
import { logSecurityEvent } from '@/lib/security/monitoring';

export interface RateLimitConfiguration {
  identifier: (req: NextRequest) => Promise<string>;
  config: RateLimitConfig | ((req: NextRequest) => Promise<RateLimitConfig>);
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (req: NextRequest, result: RateLimitResult) => Promise<void>;
  keyGenerator?: (req: NextRequest) => Promise<string>;
}

export interface RateLimitMiddlewareOptions {
  configs: RateLimitConfiguration[];
  fallbackConfig?: RateLimitConfig;
  enableMetrics?: boolean;
  enableSuspiciousActivityDetection?: boolean;
}

/**
 * Enhanced rate limiting middleware with multiple configurations
 */
export class RateLimitMiddleware {
  private options: RateLimitMiddlewareOptions;

  constructor(options: RateLimitMiddlewareOptions) {
    this.options = options;
  }

  async handle(request: NextRequest): Promise<NextResponse | null> {
    const { pathname } = request.nextUrl;
    const clientIP = getClientIP(request);

    try {
      // Find applicable configurations
      const applicableConfigs = await this.getApplicableConfigs(request);

      if (applicableConfigs.length === 0) {
        return null; // No rate limiting applied
      }

      // Check each configuration
      for (const config of applicableConfigs) {
        const identifier = await config.identifier(request);
        const rateLimitConfig = typeof config.config === 'function'
          ? await config.config(request)
          : config.config;

        const result = await rateLimiter.checkLimit(
          identifier,
          rateLimitConfig,
          config.keyGenerator ? await config.keyGenerator(request) : undefined
        );

        if (!result.allowed) {
          // Log rate limit violation
          await this.logRateLimitViolation(request, identifier, result, rateLimitConfig);

          // Call custom handler if provided
          if (config.onLimitReached) {
            await config.onLimitReached(request, result);
          }

          // Check for suspicious activity
          if (this.options.enableSuspiciousActivityDetection) {
            await this.checkSuspiciousActivity(identifier, clientIP, pathname);
          }

          return this.createRateLimitResponse(result, rateLimitConfig);
        }

        // Add rate limit headers to successful requests
        request.headers.set('x-rate-limit-remaining', result.remaining.toString());
        request.headers.set('x-rate-limit-reset', result.resetTime.toISOString());
      }

      return null; // All rate limits passed
    } catch (error) {
      console.error('Rate limit middleware error:', error);

      await logSecurityEvent('rate_limit_middleware_error', 'medium', {
        ipAddress: clientIP,
        pathname,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fail open for availability unless configured otherwise
      return null;
    }
  }

  private async getApplicableConfigs(request: NextRequest): Promise<RateLimitConfiguration[]> {
    // This could be enhanced with pattern matching or other logic
    return this.options.configs;
  }

  private async logRateLimitViolation(
    request: NextRequest,
    identifier: string,
    result: RateLimitResult,
    config: RateLimitConfig
  ): Promise<void> {
    await logSecurityEvent('rate_limit_exceeded', 'medium', {
      identifier,
      ipAddress: getClientIP(request),
      pathname: request.nextUrl.pathname,
      userAgent: request.headers.get('user-agent') || undefined,
      windowMs: config.windowMs,
      maxRequests: config.max,
      totalHits: result.totalHits,
      remaining: result.remaining,
    });
  }

  private async checkSuspiciousActivity(
    identifier: string,
    clientIP: string,
    pathname: string
  ): Promise<void> {
    try {
      const isSuspicious = await rateLimiter.checkSuspiciousActivity(identifier);

      if (isSuspicious) {
        await rateLimiter.flagSuspiciousActivity(identifier, 'rate_limit_pattern', {
          clientIP,
          pathname,
          timestamp: Date.now(),
        });

        await logSecurityEvent('suspicious_rate_limit_pattern', 'high', {
          identifier,
          ipAddress: clientIP,
          pathname,
          action: 'flagged_for_review',
        });
      }
    } catch (error) {
      console.error('Suspicious activity detection error:', error);
    }
  }

  private createRateLimitResponse(result: RateLimitResult, config: RateLimitConfig): NextResponse {
    const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);

    return new NextResponse(
      JSON.stringify({
        error: 'Rate Limit Exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter,
        limit: config.max,
        windowMs: config.windowMs,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': config.max.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(result.resetTime.getTime() / 1000).toString(),
          'X-RateLimit-RetryAfter': retryAfter.toString(),
          'Retry-After': retryAfter.toString(),
        },
      }
    );
  }
}

/**
 * Pre-configured rate limiting middleware for common scenarios
 */
export class StandardRateLimitMiddleware {
  static create(options: Partial<RateLimitMiddlewareOptions> = {}): RateLimitMiddleware {
    return new RateLimitMiddleware({
      configs: [
        // Authentication endpoints - strict
        {
          identifier: async (req) => `auth:${getClientIP(req)}`,
          config: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // 5 attempts per window
            skipOnError: false,
          },
          keyGenerator: async () => 'auth',
          onLimitReached: async (req, result) => {
            const clientIP = getClientIP(req);
            await rateLimiter.incrementFailedAttempts(`auth:${clientIP}`);
          },
        },
        // Registration endpoints - very strict
        {
          identifier: async (req) => `register:${getClientIP(req)}`,
          config: {
            windowMs: 60 * 60 * 1000, // 1 hour
            max: 3, // 3 attempts per hour
            skipOnError: false,
          },
          keyGenerator: async () => 'register',
        },
        // API endpoints - moderate
        {
          identifier: async (req) => {
            const userIdHeader = req.headers.get('x-user-id');
            if (userIdHeader) {
              return `api:user:${userIdHeader}`;
            }
            return `api:ip:${getClientIP(req)}`;
          },
          config: async (req) => {
            const { pathname } = req.nextUrl;

            // Admin endpoints get stricter limits
            if (pathname.includes('/api/admin/')) {
              return {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 50, // 50 requests per window
                skipOnError: true,
              };
            }

            // General API endpoints
            return {
              windowMs: 15 * 60 * 1000, // 15 minutes
              max: 100, // 100 requests per window
              skipOnError: true,
            };
          },
          keyGenerator: async () => 'api',
        },
      ],
      enableMetrics: true,
      enableSuspiciousActivityDetection: true,
      ...options,
    });
  }

  static createForEndpoint(endpointConfig: {
    path: string;
    windowMs: number;
    max: number;
    userBased?: boolean;
  }): RateLimitMiddleware {
    return new RateLimitMiddleware({
      configs: [
        {
          identifier: async (req) => {
            if (endpointConfig.userBased) {
              const userIdHeader = req.headers.get('x-user-id');
              if (userIdHeader) {
                return `${endpointConfig.path}:user:${userIdHeader}`;
              }
            }
            return `${endpointConfig.path}:ip:${getClientIP(req)}`;
          },
          config: {
            windowMs: endpointConfig.windowMs,
            max: endpointConfig.max,
            skipOnError: false,
          },
          keyGenerator: async () => endpointConfig.path.replace('/', '_'),
        },
      ],
      enableMetrics: true,
      enableSuspiciousActivityDetection: true,
    });
  }
}

/**
 * Utility function to create rate limit middleware for API routes
 */
export function createApiRateLimit(config: {
  windowMs?: number;
  max?: number;
  userBased?: boolean;
  skipOnError?: boolean;
  keyPrefix?: string;
}) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 60, // 60 requests per window
      userBased = true,
      skipOnError = true,
      keyPrefix = 'api',
    } = config;

    try {
      let identifier: string;

      if (userBased) {
        const userIdHeader = request.headers.get('x-user-id');
        identifier = userIdHeader
          ? `${keyPrefix}:user:${userIdHeader}`
          : `${keyPrefix}:ip:${getClientIP(request)}`;
      } else {
        identifier = `${keyPrefix}:ip:${getClientIP(request)}`;
      }

      const result = await rateLimiter.checkLimit(identifier, {
        windowMs,
        max,
        skipOnError,
      }, keyPrefix);

      if (!result.allowed) {
        await logSecurityEvent('api_rate_limit_exceeded', 'medium', {
          identifier,
          ipAddress: getClientIP(request),
          pathname: request.nextUrl.pathname,
          windowMs,
          max,
          totalHits: result.totalHits,
        });

        const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);

        return new NextResponse(
          JSON.stringify({
            error: 'Rate Limit Exceeded',
            message: 'API rate limit exceeded. Please try again later.',
            retryAfter,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': max.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.ceil(result.resetTime.getTime() / 1000).toString(),
              'Retry-After': retryAfter.toString(),
            },
          }
        );
      }

      // Add rate limit headers for successful requests
      const headers = new Headers();
      headers.set('X-RateLimit-Limit', max.toString());
      headers.set('X-RateLimit-Remaining', result.remaining.toString());
      headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime.getTime() / 1000).toString());

      return null; // Continue processing
    } catch (error) {
      console.error('API rate limit error:', error);

      if (skipOnError) {
        return null; // Continue processing
      } else {
        return new NextResponse(
          JSON.stringify({
            error: 'Rate Limiting Error',
            message: 'Rate limiting service temporarily unavailable',
          }),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60',
            },
          }
        );
      }
    }
  };
}