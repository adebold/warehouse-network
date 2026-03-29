const rateLimit = require('express-rate-limit');
const { RateLimitError } = require('./errorHandler');
const logger = require('../utils/logger');

// Redis store for distributed rate limiting
const RedisStore = require('rate-limit-redis');
let redisClient;

const setRedisClient = (client) => {
  redisClient = client;
};

// Rate limit configurations
const rateLimitConfigs = {
  global: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
      resetTime: null,
    },
    standardHeaders: true,
    legacyHeaders: false,
  },

  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit login attempts
    skipSuccessfulRequests: true,
    message: {
      error: 'Too many authentication attempts, please try again later.',
      resetTime: null,
    },
  },

  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
      error: 'API rate limit exceeded, please try again later.',
      resetTime: null,
    },
  },

  webhook: {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 webhook deliveries per minute
    message: {
      error: 'Webhook delivery rate limit exceeded.',
      resetTime: null,
    },
  },

  premium: {
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // Premium tier gets higher limits
    message: {
      error: 'Premium rate limit exceeded.',
      resetTime: null,
    },
  },
};

// Custom key generator for user-based rate limiting
const createKeyGenerator = (type) => {
  return (req) => {
    // Use user ID if authenticated, otherwise IP
    const userId = req.user?.id;
    const ip = req.ip || req.connection.remoteAddress;

    if (userId) {
      return \`rl:\${type}:user:\${userId}\`;
    }
    return \`rl:\${type}:ip:\${ip}\`;
  };
};

// Custom skip function for different user tiers
const createSkipFunction = (tierLimits) => {
  return (req) => {
    // Skip rate limiting for admins
    if (req.user?.role === 'admin') {
      return true;
    }

    // Apply different limits based on user tier
    const userTier = req.user?.tier || 'free';
    if (tierLimits[userTier]) {
      req.rateLimit = { max: tierLimits[userTier] };
    }

    return false;
  };
};

// Handler for rate limit exceeded
const onLimitReached = (req, res, options) => {
  const resetTime = new Date(Date.now() + options.windowMs);

  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    userId: req.user?.id,
    path: req.path,
    method: req.method,
    resetTime,
  });

  const error = new RateLimitError();
  error.resetTime = resetTime;

  res.status(429).json({
    success: false,
    error: {
      message: options.message.error,
      code: 'RATE_LIMIT_EXCEEDED',
      resetTime,
      retryAfter: Math.ceil(options.windowMs / 1000),
      timestamp: new Date().toISOString(),
    },
  });
};

// Create rate limiter with Redis store
const createRateLimiter = (config, keyGenerator = null) => {
  const options = {
    ...config,
    store: redisClient ? new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    }) : undefined,
    keyGenerator: keyGenerator || createKeyGenerator('default'),
    handler: onLimitReached,
    onLimitReached: (req, res, options) => {
      logger.warn('Rate limit reached', {
        ip: req.ip,
        userId: req.user?.id,
        path: req.path,
      });
    },
  };

  return rateLimit(options);
};

// Middleware factories
const global = createRateLimiter(rateLimitConfigs.global);

const auth = createRateLimiter(
  rateLimitConfigs.auth,
  createKeyGenerator('auth')
);

const api = createRateLimiter(
  rateLimitConfigs.api,
  createKeyGenerator('api')
);

const webhook = createRateLimiter(
  rateLimitConfigs.webhook,
  createKeyGenerator('webhook')
);

// Dynamic rate limiter based on user tier
const dynamic = (req, res, next) => {
  const userTier = req.user?.tier || 'free';

  const tierLimits = {
    free: 100,
    basic: 1000,
    premium: 10000,
    enterprise: 100000,
  };

  const config = {
    ...rateLimitConfigs.api,
    max: tierLimits[userTier] || tierLimits.free,
  };

  const limiter = createRateLimiter(config, createKeyGenerator(\`tier-\${userTier}\`));
  limiter(req, res, next);
};

// API key based rate limiting
const apiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return next();
    }

    // Get API key info from database (placeholder)
    // const keyInfo = await ApiKey.findOne({ key: apiKey });
    const keyInfo = { limit: 1000, windowMs: 60000 }; // Mock data

    if (keyInfo) {
      const config = {
        windowMs: keyInfo.windowMs || 60000,
        max: keyInfo.limit || 100,
        keyGenerator: () => \`rl:apikey:\${apiKey}\`,
        message: {
          error: 'API key rate limit exceeded.',
          resetTime: null,
        },
      };

      const limiter = createRateLimiter(config);
      limiter(req, res, next);
    } else {
      next();
    }
  } catch (error) {
    logger.error('API key rate limiting error:', error);
    next(error);
  }
};

// Burst protection for intensive operations
const burst = createRateLimiter({
  windowMs: 1000, // 1 second
  max: 10, // 10 requests per second
  message: {
    error: 'Request burst limit exceeded, slow down.',
    resetTime: null,
  },
});

// Reset rate limit for user (admin function)
const resetUserLimit = async (userId, type = 'api') => {
  if (!redisClient) {
    return false;
  }

  try {
    const key = \`rl:\${type}:user:\${userId}\`;
    await redisClient.del(key);

    logger.info('Rate limit reset', { userId, type });
    return true;
  } catch (error) {
    logger.error('Failed to reset rate limit:', error);
    return false;
  }
};

// Get current rate limit status
const getRateLimitStatus = async (req) => {
  if (!redisClient) {
    return null;
  }

  try {
    const keyGen = createKeyGenerator('api');
    const key = keyGen(req);

    const current = await redisClient.get(key);
    const ttl = await redisClient.ttl(key);

    return {
      current: parseInt(current) || 0,
      limit: rateLimitConfigs.api.max,
      remaining: Math.max(0, rateLimitConfigs.api.max - (parseInt(current) || 0)),
      resetTime: ttl > 0 ? new Date(Date.now() + ttl * 1000) : null,
    };
  } catch (error) {
    logger.error('Failed to get rate limit status:', error);
    return null;
  }
};

// Middleware to add rate limit headers
const addRateLimitHeaders = async (req, res, next) => {
  try {
    const status = await getRateLimitStatus(req);

    if (status) {
      res.set({
        'X-RateLimit-Limit': status.limit,
        'X-RateLimit-Remaining': status.remaining,
        'X-RateLimit-Reset': status.resetTime ? Math.floor(status.resetTime.getTime() / 1000) : null,
      });
    }

    next();
  } catch (error) {
    logger.error('Failed to add rate limit headers:', error);
    next();
  }
};

module.exports = {
  global,
  auth,
  api,
  webhook,
  dynamic,
  apiKey,
  burst,
  setRedisClient,
  resetUserLimit,
  getRateLimitStatus,
  addRateLimitHeaders,
};