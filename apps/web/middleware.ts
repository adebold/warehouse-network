import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge-compatible logger (no winston)
const edgeLog = {
  security: (message: string, meta?: Record<string, unknown>) => {
    console.log(JSON.stringify({ level: 'security', message, ...meta, timestamp: new Date().toISOString() }));
  },
};

// Security headers configuration
const securityHeaders = {
  'X-DNS-Prefetch-Control': 'on',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// CSP configuration for production
const getCSP = () => {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.warehouse-network.com https://www.googletagmanager.com https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.warehouse-network.com https://api.stripe.com https://www.google-analytics.com wss://warehouse-network.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  
  return csp.join('; ');
};

// Rate limiting configuration
interface RateLimitConfig {
  windowMs: number;
  max: number;
}

const rateLimitConfigs: Record<string, RateLimitConfig> = {
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 100,
  },
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
  },
  'password-reset': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
  },
};

// Simple in-memory rate limiter (use Redis in production for distributed systems)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, endpoint: string, config: RateLimitConfig): boolean {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return true;
  }
  
  if (record.count >= config.max) {
    return false;
  }
  
  record.count++;
  return true;
}

// Note: Rate limit cleanup happens on each request check
// setInterval not used as it's not compatible with Edge Runtime

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;
  
  // Apply security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Apply CSP in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', getCSP());
  }
  
  // Get client IP
  const ip = request.headers.get('x-real-ip') || 
             request.headers.get('x-forwarded-for')?.split(',')[0] || 
             'unknown';
  
  // Apply rate limiting
  if (pathname.startsWith('/api/')) {
    let rateLimitConfig: RateLimitConfig | undefined;
    let endpoint = 'api';
    
    // Check specific endpoints
    if (pathname.match(/\/api\/(auth|login|register)/)) {
      rateLimitConfig = rateLimitConfigs.auth;
      endpoint = 'auth';
    } else if (pathname.includes('password-reset')) {
      rateLimitConfig = rateLimitConfigs['password-reset'];
      endpoint = 'password-reset';
    } else {
      rateLimitConfig = rateLimitConfigs.api;
    }
    
    if (rateLimitConfig && !checkRateLimit(ip, endpoint, rateLimitConfig)) {
      edgeLog.security('Rate limit exceeded', {
        ip,
        endpoint,
        pathname,
        userAgent: request.headers.get('user-agent'),
      });
      
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitConfig.windowMs / 1000),
          'X-RateLimit-Limit': String(rateLimitConfig.max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(new Date(Date.now() + rateLimitConfig.windowMs).toISOString()),
        },
      });
    }
  }
  
  // Security: Block suspicious paths
  const suspiciousPaths = [
    /\/\.(env|git|svn|hg)/,
    /\/(wp-admin|wp-content|wordpress)/i,
    /\/(phpmyadmin|pma|admin|administrator)/i,
    /\.(php|asp|aspx|jsp|cgi)$/i,
    /\/cgi-bin\//,
    /\/(xmlrpc|wp-login)\.php/i,
  ];
  
  if (suspiciousPaths.some(pattern => pattern.test(pathname))) {
    edgeLog.security('Suspicious path blocked', {
      ip,
      pathname,
      userAgent: request.headers.get('user-agent'),
    });
    
    return new NextResponse('Forbidden', { status: 403 });
  }
  
  // Security: Check for SQL injection patterns in query strings
  const queryString = request.nextUrl.search;
  const sqlInjectionPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
  ];
  
  if (sqlInjectionPatterns.some(pattern => pattern.test(queryString))) {
    edgeLog.security('Potential SQL injection attempt blocked', {
      ip,
      pathname,
      queryString,
      userAgent: request.headers.get('user-agent'),
    });
    
    return new NextResponse('Bad Request', { status: 400 });
  }
  
  // Add request ID for tracing
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  response.headers.set('X-Request-ID', requestId);
  
  // Add response time header
  response.headers.set('X-Response-Time', String(Date.now()));
  
  return response;
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - monitoring endpoints
     */
    '/((?!_next/static|_next/image|favicon.ico|public/|health|metrics).*)',
  ],
};