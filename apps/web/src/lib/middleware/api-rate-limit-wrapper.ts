/**
 * API Route Rate Limiting Wrapper
 * Higher-order function to add rate limiting to API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiRateLimit } from './rate-limit-middleware';
import { getClientIP } from '@/lib/security/rate-limiter';
import { logSecurityEvent } from '@/lib/security/monitoring';

export interface ApiRateLimitConfig {
  windowMs?: number;
  max?: number;
  userBased?: boolean;
  skipOnError?: boolean;
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  enableBurstProtection?: boolean;
  burstWindowMs?: number;
  burstMax?: number;
}

export interface ApiHandlerContext {
  request: NextRequest;
  params?: Record<string, string>;
}

export type ApiHandler = (
  context: ApiHandlerContext
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps an API handler with rate limiting
 */
export function withRateLimit(config: ApiRateLimitConfig = {}) {
  return function rateLimitDecorator(handler: ApiHandler) {
    return async function rateLimitedHandler(
      request: NextRequest,
      context: { params?: Record<string, string> } = {}
    ): Promise<NextResponse> {
      const clientIP = getClientIP(request);
      const { pathname } = request.nextUrl;

      try {
        // Apply primary rate limiting
        const rateLimitMiddleware = createApiRateLimit(config);
        const rateLimitResponse = await rateLimitMiddleware(request);

        if (rateLimitResponse) {
          return rateLimitResponse; // Rate limit exceeded
        }

        // Apply burst protection if enabled
        if (config.enableBurstProtection) {
          const burstResponse = await checkBurstProtection(request, config);
          if (burstResponse) {
            return burstResponse;
          }
        }

        // Execute the actual handler
        const handlerContext: ApiHandlerContext = {
          request,
          params: context.params,
        };

        const response = await handler(handlerContext);

        // Handle successful/failed request counting
        if (!config.skipSuccessfulRequests && response.status < 400) {
          await recordSuccessfulRequest(request, config);
        }

        if (!config.skipFailedRequests && response.status >= 400) {
          await recordFailedRequest(request, config, response.status);
        }

        return response;
      } catch (error) {
        console.error('Rate limited API handler error:', error);

        await logSecurityEvent('api_handler_error', 'high', {
          ipAddress: clientIP,
          pathname,
          error: error instanceof Error ? error.message : 'Unknown error',
          userAgent: request.headers.get('user-agent') || undefined,
        });

        return new NextResponse(
          JSON.stringify({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred',
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    };
  };
}

/**
 * Pre-configured rate limiting decorators for different endpoint types
 */
export const RateLimitPresets = {
  // Authentication endpoints - very strict
  auth: withRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    userBased: false, // IP-based for auth
    skipOnError: false,
    keyPrefix: 'auth',
    enableBurstProtection: true,
    burstWindowMs: 60 * 1000, // 1 minute
    burstMax: 3, // 3 attempts per minute
  }),

  // Registration endpoints - strict
  registration: withRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 attempts per hour
    userBased: false,
    skipOnError: false,
    keyPrefix: 'registration',
    enableBurstProtection: true,
    burstWindowMs: 10 * 60 * 1000, // 10 minutes
    burstMax: 2, // 2 attempts per 10 minutes
  }),

  // Password reset - strict
  passwordReset: withRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 attempts per hour
    userBased: false,
    skipOnError: false,
    keyPrefix: 'password_reset',
  }),

  // 2FA endpoints - moderate
  twoFactor: withRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    userBased: true,
    skipOnError: false,
    keyPrefix: 'two_factor',
    enableBurstProtection: true,
    burstWindowMs: 60 * 1000, // 1 minute
    burstMax: 5, // 5 attempts per minute
  }),

  // Admin endpoints - moderate
  admin: withRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    userBased: true,
    skipOnError: true,
    keyPrefix: 'admin',
  }),

  // General API endpoints - lenient
  api: withRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 requests per window
    userBased: true,
    skipOnError: true,
    keyPrefix: 'api',
  }),

  // Public endpoints - very lenient
  public: withRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per window
    userBased: false,
    skipOnError: true,
    keyPrefix: 'public',
  }),

  // File upload endpoints - strict
  upload: withRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 uploads per hour
    userBased: true,
    skipOnError: false,
    keyPrefix: 'upload',
  }),

  // Search endpoints - moderate
  search: withRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    userBased: true,
    skipOnError: true,
    keyPrefix: 'search',
  }),
};

/**
 * Check burst protection (rapid consecutive requests)
 */
async function checkBurstProtection(
  request: NextRequest,
  config: ApiRateLimitConfig
): Promise<NextResponse | null> {
  if (!config.enableBurstProtection || !config.burstWindowMs || !config.burstMax) {
    return null;
  }

  const burstConfig: ApiRateLimitConfig = {
    ...config,
    windowMs: config.burstWindowMs,
    max: config.burstMax,
    keyPrefix: `${config.keyPrefix || 'api'}_burst`,
  };

  const burstMiddleware = createApiRateLimit(burstConfig);
  return await burstMiddleware(request);
}

/**
 * Record successful request for analytics
 */
async function recordSuccessfulRequest(
  request: NextRequest,
  config: ApiRateLimitConfig
): Promise<void> {
  try {
    const { pathname } = request.nextUrl;
    const clientIP = getClientIP(request);

    await logSecurityEvent('api_request_success', 'low', {
      ipAddress: clientIP,
      pathname,
      method: request.method,
      keyPrefix: config.keyPrefix,
      userAgent: request.headers.get('user-agent') || undefined,
    });
  } catch (error) {
    console.error('Error recording successful request:', error);
  }
}

/**
 * Record failed request for monitoring
 */
async function recordFailedRequest(
  request: NextRequest,
  config: ApiRateLimitConfig,
  statusCode: number
): Promise<void> {
  try {
    const { pathname } = request.nextUrl;
    const clientIP = getClientIP(request);

    await logSecurityEvent('api_request_failure', 'medium', {
      ipAddress: clientIP,
      pathname,
      method: request.method,
      statusCode,
      keyPrefix: config.keyPrefix,
      userAgent: request.headers.get('user-agent') || undefined,
    });
  } catch (error) {
    console.error('Error recording failed request:', error);
  }
}

/**
 * Create a custom rate limiting configuration
 */
export function createCustomRateLimit(config: ApiRateLimitConfig) {
  return withRateLimit(config);
}