const winston = require('winston');
const path = require('path');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({
    all: process.env.NODE_ENV !== 'production'
  }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = \`\${timestamp} [\${level}]: \${message}\`;

    if (Object.keys(meta).length > 0) {
      log += \` \${JSON.stringify(meta)}\`;
    }

    if (stack) {
      log += \`\n\${stack}\`;
    }

    return log;
  })
);

// Create transports
const transports = [
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
  }),
];

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: {
    service: 'api-platform',
    version: process.env.npm_package_version || '1.0.0',
  },
  transports,
});

// Add request correlation ID support
logger.withRequestId = (requestId) => {
  return logger.child({ requestId });
};

// Performance logging helper
logger.time = (label) => {
  const start = Date.now();
  return {
    end: (meta = {}) => {
      const duration = Date.now() - start;
      logger.info(\`\${label} completed\`, { ...meta, duration: \`\${duration}ms\` });
    }
  };
};

// Structured logging methods
logger.apiCall = (method, path, statusCode, duration, meta = {}) => {
  logger.info('API call', {
    method,
    path,
    statusCode,
    duration: \`\${duration}ms\`,
    ...meta,
  });
};

logger.dbOperation = (operation, collection, duration, meta = {}) => {
  logger.info('Database operation', {
    operation,
    collection,
    duration: \`\${duration}ms\`,
    ...meta,
  });
};

logger.authEvent = (event, userId, success, meta = {}) => {
  logger.info('Authentication event', {
    event,
    userId,
    success,
    ...meta,
  });
};

logger.webhookEvent = (event, webhookId, success, meta = {}) => {
  logger.info('Webhook event', {
    event,
    webhookId,
    success,
    ...meta,
  });
};

module.exports = logger;