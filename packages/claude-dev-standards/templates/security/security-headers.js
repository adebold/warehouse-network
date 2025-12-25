// Security Headers Configuration Template
const helmet = require('helmet');
const cors = require('cors');

/**
 * Comprehensive security headers configuration
 */
const securityHeaders = () => {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        childSrc: ["'none'"],
        workerSrc: ["'none'"],
        manifestSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },

    // HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },

    // X-Frame-Options
    frameguard: {
      action: 'deny'
    },

    // X-Content-Type-Options
    noSniff: true,

    // X-XSS-Protection
    xssFilter: true,

    // Referrer Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },

    // Permissions Policy
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
      usb: [],
      magnetometer: [],
      gyroscope: [],
      speaker: [],
      vibrate: [],
      fullscreen: ['self'],
    },

    // Cross-Origin Embedder Policy
    crossOriginEmbedderPolicy: false, // Set to true if needed

    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: {
      policy: 'same-origin'
    },

    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: {
      policy: 'same-origin'
    },

    // Hide X-Powered-By header
    hidePoweredBy: true,

    // Expect-CT
    expectCt: {
      maxAge: 86400, // 24 hours
      enforce: true
    },

    // DNS Prefetch Control
    dnsPrefetchControl: {
      allow: false
    }
  });
};

/**
 * CORS configuration
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Request-ID'
  ],
  exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
  maxAge: 86400 // 24 hours
};

/**
 * Development CORS (more permissive)
 */
const developmentCorsOptions = {
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: '*'
};

/**
 * Security middleware setup function
 */
const setupSecurityMiddleware = (app, options = {}) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Security headers
  app.use(securityHeaders());

  // CORS
  if (isDevelopment && options.allowDevCors) {
    app.use(cors(developmentCorsOptions));
  } else {
    app.use(cors(corsOptions));
  }

  // Additional security middleware
  app.use((req, res, next) => {
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    
    // Add custom security headers
    res.setHeader('X-Request-ID', req.id || require('crypto').randomUUID());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    
    // Prevent caching of sensitive endpoints
    if (req.path.includes('/api/auth') || req.path.includes('/api/admin')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    next();
  });
};

/**
 * Content Security Policy for different environments
 */
const getCSPForEnvironment = (env) => {
  const baseCSP = {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  };

  if (env === 'development') {
    // More permissive for development
    baseCSP.scriptSrc.push("'unsafe-eval'", "'unsafe-inline'");
    baseCSP.connectSrc.push("ws:", "wss:");
  }

  return baseCSP;
};

module.exports = {
  securityHeaders,
  corsOptions,
  developmentCorsOptions,
  setupSecurityMiddleware,
  getCSPForEnvironment
};