/**
 * Secure Middleware with Comprehensive Security Measures
 * Includes CSRF protection, rate limiting, CSP headers, and security monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth-secure';
import { prisma } from '@/lib/prisma';
import { SecurityConfig } from '@/lib/security/config';
import { rateLimiter, getClientIP, createRateLimitMiddleware } from '@/lib/security/rate-limiter';
import { createCSRFMiddleware, csrfProtection } from '@/lib/security/csrf';
import { ValidationUtils } from '@/lib/security/input-validation';

// Define route patterns for different security levels
const PUBLIC_ROUTES = [
  '/',
  '/auth',
  '/api/auth',
  '/api/public',
  '/api/health',
  '/favicon.ico',
  '/_next',
  '/images',
  '/static',
];

const PROTECTED_ROUTES = [
  '/dashboard',
  '/organizations',
  '/warehouses',
  '/users',
  '/settings',
  '/api/protected',
];

const SUPER_ADMIN_ROUTES = [
  '/admin/super',
  '/admin/organizations',
  '/admin/system',
  '/api/admin/super',
];

const HIGH_SECURITY_ROUTES = [
  '/admin/super/users',
  '/admin/super/security',
  '/api/admin/super/security',
];

const API_ROUTES = [
  '/api/',
];

const AUTH_ROUTES = [
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/register',
  '/auth/signin',
  '/auth/register',
];

const RATE_LIMITED_ROUTES = [
  { pattern: '/api/auth', config: SecurityConfig.rateLimit.auth },
  { pattern: '/api/register', config: SecurityConfig.rateLimit.registration },
  { pattern: '/api/password-reset', config: SecurityConfig.rateLimit.passwordReset },
  { pattern: '/api/2fa', config: SecurityConfig.rateLimit.twoFactor },
];

/**
 * Generate Content Security Policy header
 */
function generateCSP(nonce: string): string {
  const config = SecurityConfig.csp;
  const directives = { ...config.directives };

  // Replace nonce placeholder in production
  if (process.env.NODE_ENV === 'production') {
    directives.scriptSrc = directives.scriptSrc.map(src =>
      src.replace('{NONCE}', nonce)
    );
    directives.styleSrc = directives.styleSrc.map(src =>
      src.replace('{NONCE}', nonce)
    );
  }

  const cspString = Object.entries(directives)
    .filter(([_, value]) => value !== false)
    .map(([key, value]) => {
      if (key === 'upgradeInsecureRequests') {
        return value ? 'upgrade-insecure-requests' : '';
      }
      const directive = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${directive} ${Array.isArray(value) ? value.join(' ') : value}`;
    })
    .filter(Boolean)
    .join('; ');

  return cspString;
}

/**
 * Check if route matches pattern
 */
function matchesRoute(pathname: string, patterns: string[]): boolean {
  return patterns.some(pattern => pathname.startsWith(pattern));
}

/**
 * Get rate limiting configuration for route
 */
function getRateLimitConfig(pathname: string) {
  for (const { pattern, config } of RATE_LIMITED_ROUTES) {
    if (pathname.startsWith(pattern)) {
      return config;
    }
  }
  return SecurityConfig.rateLimit.api; // Default
}

/**
 * Security logging function
 */
async function logSecurityEvent(
  eventType: string,
  request: NextRequest,
  details: Record<string, any> = {},
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
) {
  try {
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    await prisma.auditLog.create({
      data: {
        userId: null,
        organizationId: null,
        action: `security.${eventType}`,
        resource: request.nextUrl.pathname,
        details: {
          ipAddress: clientIP,
          userAgent,
          method: request.method,
          url: request.url,
          severity,
          ...details,
        },
        status: 'failure',
      },
    });

    // Alert for critical events
    if (severity === 'critical' && SecurityConfig.monitoring.alertWebhookUrl) {
      // Could implement webhook alerting here
      console.error(`CRITICAL SECURITY EVENT: ${eventType}`, {
        ip: clientIP,
        path: request.nextUrl.pathname,
        details,
      });
    }
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

/**
 * Validate request headers for security threats
 */
function validateRequestHeaders(request: NextRequest): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const headers = request.headers;

  // Check for suspicious user agents
  const userAgent = headers.get('user-agent') || '';
  const suspiciousUAPatterns = [
    /sqlmap/i,
    /nmap/i,
    /nikto/i,
    /whatweb/i,
    /burp/i,
    /w3af/i,
    /<script/i,
  ];

  if (suspiciousUAPatterns.some(pattern => pattern.test(userAgent))) {
    issues.push('Suspicious user agent detected');
  }

  // Check for suspicious headers
  const suspiciousHeaders = ['x-forwarded-host', 'x-rewrite-url', 'x-original-url'];
  for (const header of suspiciousHeaders) {
    if (headers.has(header)) {
      issues.push(`Potentially dangerous header: ${header}`);
    }
  }

  // Check for Host header injection
  const host = headers.get('host');
  if (host && !/^[a-zA-Z0-9.-]+(\:\d+)?$/.test(host)) {
    issues.push('Invalid host header format');
  }

  // Check for content length attacks
  const contentLength = headers.get('content-length');
  if (contentLength && parseInt(contentLength) > SecurityConfig.validation.maxRequestSize) {
    issues.push('Request too large');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Main middleware function
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clientIP = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';

  // Generate nonce for CSP
  const nonce = require('crypto').randomBytes(16).toString('base64');

  // Create response
  let response = NextResponse.next();

  try {
    // 1. Basic security validation
    const headerValidation = validateRequestHeaders(request);
    if (!headerValidation.valid) {
      await logSecurityEvent('invalid_headers', request, {
        issues: headerValidation.issues,
      }, 'high');

      return NextResponse.json(
        { error: 'Invalid request headers' },
        { status: 400 }
      );
    }

    // 2. Check for suspicious activity patterns
    const isSuspicious = await rateLimiter.checkSuspiciousActivity(clientIP);
    if (isSuspicious) {
      await logSecurityEvent('suspicious_activity_pattern', request, {}, 'critical');

      return NextResponse.json(
        { error: 'Request blocked due to suspicious activity' },
        { status: 429 }
      );
    }

    // 3. Skip security checks for truly public routes
    if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
      response = addSecurityHeaders(response, nonce);
      return response;
    }

    // 4. Rate limiting for API and auth routes
    if (matchesRoute(pathname, API_ROUTES) || matchesRoute(pathname, AUTH_ROUTES)) {
      const rateLimitConfig = getRateLimitConfig(pathname);
      const identifier = `${clientIP}:${pathname}`;

      const rateLimitResult = await rateLimiter.checkLimit(
        identifier,
        rateLimitConfig,
        'middleware'
      );

      if (!rateLimitResult.allowed) {
        await logSecurityEvent('rate_limit_exceeded', request, {
          limit: rateLimitConfig.max,
          window: rateLimitConfig.windowMs,
        });

        return NextResponse.json(
          {
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000),
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': rateLimitConfig.max.toString(),
              'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
              'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime.getTime() / 1000).toString(),
            },
          }
        );
      }

      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', rateLimitConfig.max.toString());
      response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
      response.headers.set('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime.getTime() / 1000).toString());
    }

    // 5. CSRF protection for state-changing requests
    if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(request.method)) {
      const csrfValidation = createCSRFMiddleware();
      const csrfResult = await csrfValidation(request, null);

      if (!csrfResult.valid) {
        await logSecurityEvent('csrf_violation', request, {
          error: csrfResult.error,
        });

        return NextResponse.json(
          { error: 'CSRF validation failed', message: csrfResult.error },
          { status: 403 }
        );
      }
    }

    // 6. Input validation for suspicious content
    const url = request.nextUrl;
    const queryString = url.search;

    // Check for SQL injection in query parameters
    if (queryString && ValidationUtils.hasSQLInjection(queryString)) {
      await logSecurityEvent('sql_injection_attempt', request, {
        queryString,
      }, 'critical');

      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

    // Check for XSS in query parameters
    if (queryString && ValidationUtils.hasXSS(queryString)) {
      await logSecurityEvent('xss_attempt', request, {
        queryString,
      }, 'high');

      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

    // 7. Authentication check
    const session = await auth();

    // Handle protected routes
    if (matchesRoute(pathname, PROTECTED_ROUTES)) {
      if (!session?.user) {
        const signInUrl = new URL('/auth/signin', request.url);
        signInUrl.searchParams.set('callbackUrl', request.url);
        return NextResponse.redirect(signInUrl);
      }

      // Check if user account is still active
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { status: true, organizationId: true },
      });

      if (!user || user.status !== 'ACTIVE') {
        await logSecurityEvent('inactive_user_access', request, {
          userId: session.user.id,
          userStatus: user?.status,
        });

        const signInUrl = new URL('/auth/signin', request.url);
        signInUrl.searchParams.set('error', 'AccountDisabled');
        return NextResponse.redirect(signInUrl);
      }
    }

    // Handle super admin routes
    if (matchesRoute(pathname, SUPER_ADMIN_ROUTES)) {
      if (!session?.user) {
        return NextResponse.redirect(new URL('/auth/signin', request.url));
      }

      const isSuperAdmin = session.user.roles?.some(role =>
        role.slug === 'super-admin' || role.slug === 'platform-admin'
      );

      if (!isSuperAdmin) {
        await logSecurityEvent('unauthorized_admin_access', request, {
          userId: session.user.id,
          userRoles: session.user.roles?.map(r => r.slug),
        }, 'high');

        return NextResponse.redirect(new URL('/auth/unauthorized', request.url));
      }

      // Extra security for high-security admin routes
      if (matchesRoute(pathname, HIGH_SECURITY_ROUTES)) {
        // Require recent authentication (within last 15 minutes)
        const sessionAge = Date.now() - new Date(session.expires || 0).getTime();
        if (sessionAge > 15 * 60 * 1000) {
          const signInUrl = new URL('/auth/signin', request.url);
          signInUrl.searchParams.set('callbackUrl', request.url);
          signInUrl.searchParams.set('prompt', 'reauthenticate');
          return NextResponse.redirect(signInUrl);
        }

        // Check 2FA requirement for super admin
        if (!session.user.isTwoFactorVerified) {
          return NextResponse.redirect(new URL('/auth/2fa-required', request.url));
        }
      }
    }

    // 8. Organization context validation
    if (session?.user && pathname.includes('/organizations/')) {
      const orgSlug = pathname.split('/organizations/')[1]?.split('/')[0];

      if (orgSlug && session.user.organization?.slug !== orgSlug) {
        const hasAccess = await prisma.userRole.findFirst({
          where: {
            userId: session.user.id,
            role: {
              organization: {
                slug: orgSlug,
              },
            },
          },
        });

        if (!hasAccess) {
          await logSecurityEvent('unauthorized_org_access', request, {
            userId: session.user.id,
            requestedOrg: orgSlug,
            userOrg: session.user.organization?.slug,
          });

          return NextResponse.redirect(new URL('/auth/unauthorized', request.url));
        }
      }
    }

    // 9. Add security headers and context
    response = addSecurityHeaders(response, nonce);

    // Add user context headers for API routes
    if (matchesRoute(pathname, API_ROUTES) && session?.user) {
      response.headers.set('x-user-id', session.user.id);
      if (session.user.organizationId) {
        response.headers.set('x-user-organization-id', session.user.organizationId);
      }

      // Add CSRF token for next requests
      const csrfToken = csrfProtection.generateToken(session.user.id);
      response.headers.set('x-csrf-token', csrfToken);
    }

    return response;
  } catch (error) {
    console.error('Middleware error:', error);

    await logSecurityEvent('middleware_error', request, {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'high');

    // Fail safely - allow request but with security headers
    response = addSecurityHeaders(response, nonce);
    return response;
  }
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  const headers = SecurityConfig.headers;

  // Add static security headers
  Object.entries(headers).forEach(([key, value]) => {
    if (value) {
      response.headers.set(key, value);
    }
  });

  // Add CSP header with nonce
  const csp = generateCSP(nonce);
  if (SecurityConfig.csp.reportOnly) {
    response.headers.set('Content-Security-Policy-Report-Only', csp);
  } else {
    response.headers.set('Content-Security-Policy', csp);
  }

  // Add custom security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Add HSTS header in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  // Add security nonce
  response.headers.set('X-Nonce', nonce);

  return response;
}

export const config = {
  // Match all paths except static files and internal Next.js routes
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};