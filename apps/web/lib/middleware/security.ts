import rateLimit from 'express-rate-limit';
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextApiHandler } from 'next';

// Extend NextApiRequest to include rateLimit property
declare module 'next' {
  interface NextApiRequest {
    rateLimit?: {
      limit: number;
      current: number;
      remaining: number;
      resetTime: Date;
    };
  }
}

// Rate limiting configurations for different endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs for auth endpoints
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: any, res: any) => {
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later',
      retryAfter: (req as NextApiRequest).rateLimit?.resetTime,
    });
  },
  skip: (req: any) => {
    // Skip rate limiting in development mode if needed
    return process.env.NODE_ENV === 'development' && process.env.DISABLE_RATE_LIMIT === 'true';
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs for general API
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: any, res: any) => {
    res.status(429).json({
      error: 'Too many requests, please try again later',
      retryAfter: (req as NextApiRequest).rateLimit?.resetTime,
    });
  },
});

// Strict rate limiter for password reset endpoints
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: 'Too many password reset attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req: any, res: any) => {
    res.status(429).json({
      error: 'Too many password reset attempts, please try again later',
      retryAfter: (req as NextApiRequest).rateLimit?.resetTime,
    });
  },
});

// Helper to apply rate limiting to Next.js API routes
export function withRateLimit(
  handler: NextApiHandler,
  limiter: ReturnType<typeof rateLimit>
): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Apply rate limiting
    await new Promise<void>((resolve, reject) => {
      limiter(req as any, res as any, (result: any) => {
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve();
        }
      });
    });

    // If rate limit wasn't exceeded, continue to handler
    return handler(req, res);
  };
}

// Security headers middleware
export function setSecurityHeaders(res: NextApiResponse) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://apis.google.com https://www.google.com https://www.gstatic.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://vitals.vercel-insights.com https://www.google-analytics.com;"
  );
  
  // HSTS header (only in production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

// Combined security middleware
export function withSecurity(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Set security headers
    setSecurityHeaders(res);
    
    // Continue to handler
    return handler(req, res);
  };
}

// Authentication endpoint security middleware
export function withAuthSecurity(handler: NextApiHandler): NextApiHandler {
  return withSecurity(withRateLimit(handler, authRateLimiter));
}

// General API endpoint security middleware
export function withApiSecurity(handler: NextApiHandler): NextApiHandler {
  return withSecurity(withRateLimit(handler, apiRateLimiter));
}