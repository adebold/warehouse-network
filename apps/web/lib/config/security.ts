// Security configuration with environment validation
export const securityConfig = {
  // Authentication
  auth: {
    sessionSecret: process.env.NEXTAUTH_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('NEXTAUTH_SECRET is required in production');
      }
      return 'development-secret-change-in-production';
    })(),
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    jwtMaxAge: parseInt(process.env.JWT_MAX_AGE || '86400', 10), // 24 hours in seconds
    sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '2592000', 10), // 30 days in seconds
  },

  // Rate limiting
  rateLimit: {
    auth: {
      windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      maxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
    },
    api: {
      windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      maxRequests: parseInt(process.env.API_RATE_LIMIT_MAX || '100', 10),
    },
    passwordReset: {
      windowMs: parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
      maxRequests: parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_MAX || '3', 10),
    },
  },

  // CSRF Protection
  csrf: {
    enabled: process.env.CSRF_PROTECTION_ENABLED !== 'false',
    tokenLength: parseInt(process.env.CSRF_TOKEN_LENGTH || '32', 10),
    cookieName: process.env.CSRF_COOKIE_NAME || '_csrf',
    headerName: process.env.CSRF_HEADER_NAME || 'x-csrf-token',
    tokenTTL: parseInt(process.env.CSRF_TOKEN_TTL || '86400000', 10), // 24 hours
  },

  // CORS settings
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    allowCredentials: process.env.CORS_ALLOW_CREDENTIALS !== 'false',
  },

  // Security headers
  headers: {
    contentSecurityPolicy: process.env.CONTENT_SECURITY_POLICY || 
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://apis.google.com https://www.google.com https://www.gstatic.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://vitals.vercel-insights.com https://www.google-analytics.com;",
    hstsMaxAge: parseInt(process.env.HSTS_MAX_AGE || '31536000', 10), // 1 year
    frameOptions: process.env.X_FRAME_OPTIONS || 'DENY',
  },

  // Password policy
  password: {
    minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
    requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
    requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
    requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
    requireSymbols: process.env.PASSWORD_REQUIRE_SYMBOLS === 'true',
    maxAttempts: parseInt(process.env.PASSWORD_MAX_ATTEMPTS || '5', 10),
    lockoutDuration: parseInt(process.env.PASSWORD_LOCKOUT_DURATION || '900000', 10), // 15 minutes
  },

  // Session security
  session: {
    cookieName: process.env.SESSION_COOKIE_NAME || '__Secure-next-auth.session-token',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.SESSION_SAME_SITE as 'strict' | 'lax' | 'none' || 'lax',
    path: '/',
  },

  // API Keys
  apiKeys: {
    stripeSecret: process.env.STRIPE_SECRET_KEY || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('STRIPE_SECRET_KEY is required in production');
      }
      return '';
    })(),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('STRIPE_WEBHOOK_SECRET is required in production');
      }
      return '';
    })(),
  },
};

// Password validation helper
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = securityConfig.password;

  if (password.length < config.minLength) {
    errors.push(`Password must be at least ${config.minLength} characters long`);
  }

  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (config.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (config.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (config.requireSymbols && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Environment validation on startup
export function validateSecurityEnvironment() {
  const requiredInProduction = [
    'NEXTAUTH_SECRET',
    'DATABASE_URL',
    'NEXTAUTH_URL',
  ];

  if (process.env.NODE_ENV === 'production') {
    const missing = requiredInProduction.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
    }
  }

  // Validate numeric environment variables
  const numericVars = [
    'BCRYPT_ROUNDS',
    'JWT_MAX_AGE',
    'SESSION_MAX_AGE',
    'AUTH_RATE_LIMIT_WINDOW_MS',
    'AUTH_RATE_LIMIT_MAX',
    'API_RATE_LIMIT_WINDOW_MS',
    'API_RATE_LIMIT_MAX',
    'PASSWORD_MIN_LENGTH',
  ];

  for (const varName of numericVars) {
    const value = process.env[varName];
    if (value && isNaN(parseInt(value, 10))) {
      throw new Error(`Environment variable ${varName} must be a valid number`);
    }
  }
}