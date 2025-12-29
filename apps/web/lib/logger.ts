import { randomUUID } from 'crypto';

import winston from 'winston';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Format for development
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Format for production (JSON)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: './logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
  
  logger.add(
    new winston.transports.File({
      filename: './logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

// Request logger middleware
interface RequestLogContext {
  requestId: string;
  method: string;
  url: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
}

export function requestLogger(req: any, res: any, next: any) {
  const requestId = randomUUID();
  const startTime = Date.now();
  
  // Attach request ID to request object
  req.requestId = requestId;
  
  // Log request
  const context: RequestLogContext = {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  };
  
  logger.http('Incoming request', context);
  
  // Log response
  const originalSend = res.send;
  res.send = function (data: any) {
    const responseTime = Date.now() - startTime;
    
    logger.http('Request completed', {
      ...context,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: res.get('content-length'),
    });
    
    originalSend.call(this, data);
  };
  
  next();
}

// Structured logging functions
export const log = {
  error: (message: string, error?: Error | any, context?: any) => {
    logger.error(message, {
      error: error?.message || error,
      stack: error?.stack,
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  warn: (message: string, context?: any) => {
    logger.warn(message, {
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  info: (message: string, context?: any) => {
    logger.info(message, {
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  debug: (message: string, context?: any) => {
    logger.debug(message, {
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  // Specialized logging functions
  security: (event: string, context?: any) => {
    logger.warn(`SECURITY: ${event}`, {
      type: 'security',
      event,
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  audit: (action: string, userId: string, context?: any) => {
    logger.info(`AUDIT: ${action}`, {
      type: 'audit',
      action,
      userId,
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  performance: (operation: string, duration: number, context?: any) => {
    logger.info(`PERFORMANCE: ${operation}`, {
      type: 'performance',
      operation,
      duration,
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  database: (query: string, duration: number, context?: any) => {
    logger.debug(`DATABASE: Query executed`, {
      type: 'database',
      query: query.substring(0, 200), // Truncate long queries
      duration,
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  api: (endpoint: string, method: string, statusCode: number, context?: any) => {
    logger.info(`API: ${method} ${endpoint}`, {
      type: 'api',
      endpoint,
      method,
      statusCode,
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
  
  payment: (event: string, amount?: number, currency?: string, context?: any) => {
    logger.info(`PAYMENT: ${event}`, {
      type: 'payment',
      event,
      amount,
      currency,
      ...context,
      timestamp: new Date().toISOString(),
    });
  },
};

// Error tracking integration
export function logError(error: Error, context?: any) {
  log.error(error.message, error, context);
  
  // Send to Sentry in production (disabled for Edge Runtime compatibility)
  // if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  //   try {
  //     const Sentry = require('@sentry/node');
  //     Sentry.captureException(error, {
  //       extra: context,
  //     });
  //   } catch (sentryError) {
  //     log.error('Failed to send error to Sentry', sentryError);
  //   }
  // }
}

// OpenTelemetry integration
export function createTraceContext(operationName: string) {
  const traceId = randomUUID();
  const spanId = randomUUID().substring(0, 16);
  
  return {
    traceId,
    spanId,
    operationName,
    startTime: Date.now(),
    
    end: function(context?: any) {
      const duration = Date.now() - this.startTime;
      log.performance(operationName, duration, {
        traceId,
        spanId,
        ...context,
      });
    },
  };
}

export default log;