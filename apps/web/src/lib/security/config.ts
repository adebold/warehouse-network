/**
 * Security Configuration
 * Centralized security settings for the application
 */

export const SecurityConfig = {
  // Authentication settings
  auth: {
    sessionMaxAge: 24 * 60 * 60, // 24 hours
    sessionUpdateAge: 60 * 60, // 1 hour
    jwtMaxAge: 24 * 60 * 60, // 24 hours
    passwordMinLength: 12,
    passwordRequireSpecialChar: true,
    passwordRequireNumber: true,
    passwordRequireUppercase: true,
    passwordRequireLowercase: true,
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60, // 15 minutes
    allowDangerousEmailAccountLinking: false,
  },

  // Rate limiting settings
  rateLimit: {
    // General API rate limit
    api: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // requests per window
    },
    // Authentication rate limit
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // login attempts per window
    },
    // Registration rate limit
    registration: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // registration attempts per window
    },
    // Password reset rate limit
    passwordReset: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // reset attempts per window
    },
    // 2FA rate limit
    twoFactor: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // 2FA attempts per window
    },
  },

  // CSRF protection settings
  csrf: {
    secret: process.env.CSRF_SECRET || 'csrf-secret-key-change-in-production',
    cookieName: '__Host-csrf-token',
    headerName: 'x-csrf-token',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  },

  // Content Security Policy
  csp: {
    reportOnly: process.env.NODE_ENV === 'development',
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // For Next.js development only
        "'unsafe-eval'", // For Next.js development only
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https:",
      ],
      connectSrc: [
        "'self'",
        "https://api.github.com",
        "https://accounts.google.com",
        "https://login.microsoftonline.com",
      ],
      frameSrc: [
        "'none'",
      ],
      objectSrc: [
        "'none'",
      ],
      baseUri: [
        "'self'",
      ],
      formAction: [
        "'self'",
      ],
      frameAncestors: [
        "'none'",
      ],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production',
    },
  },

  // Two-Factor Authentication
  twoFactor: {
    issuer: 'Warehouse Network',
    algorithm: 'SHA1' as const,
    digits: 6,
    period: 30,
    window: 2,
    qrCodeSize: 200,
    backupCodesCount: 10,
    backupCodeLength: 8,
  },

  // Security headers
  headers: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Strict-Transport-Security': process.env.NODE_ENV === 'production'
      ? 'max-age=63072000; includeSubDomains; preload'
      : undefined,
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: 'wn:',
    maxRetries: 3,
    retryDelay: 1000,
    connectTimeout: 10000,
  },

  // Security monitoring
  monitoring: {
    enableSecurityLogs: true,
    enablePerformanceLogs: process.env.NODE_ENV === 'production',
    logLevel: process.env.LOG_LEVEL || 'info',
    maxLogSize: 10 * 1024 * 1024, // 10MB
    maxLogFiles: 5,
    alertWebhookUrl: process.env.SECURITY_WEBHOOK_URL,
    sensitiveFields: ['password', 'token', 'secret', 'key', 'authorization'],
  },

  // Input validation
  validation: {
    maxRequestSize: 5 * 1024 * 1024, // 5MB
    maxFieldLength: 10000,
    maxArrayLength: 1000,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/json',
    ],
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },

  // Environment-specific overrides
  ...(process.env.NODE_ENV === 'production' && {
    csp: {
      reportOnly: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'nonce-{NONCE}'",
        ],
        styleSrc: [
          "'self'",
          "'nonce-{NONCE}'",
          "https://fonts.googleapis.com",
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https:",
        ],
        connectSrc: [
          "'self'",
          "https://api.github.com",
          "https://accounts.google.com",
          "https://login.microsoftonline.com",
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: true,
      },
    },
  }),
} as const;

export type SecurityConfigType = typeof SecurityConfig;