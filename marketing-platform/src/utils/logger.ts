import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Create transports array
const transports: winston.transport[] = [];

// Add console transport for development and test
if (!isProduction) {
  transports.push(
    new winston.transports.Console({
      format: isTest ? winston.format.simple() : consoleFormat,
      silent: isTest && process.env.JEST_SILENT !== 'false'
    })
  );
}

// Add file transports for production
if (isProduction) {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: customFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: customFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  defaultMeta: {
    service: 'marketing-platform',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports,
  exceptionHandlers: isProduction ? [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ] : [],
  rejectionHandlers: isProduction ? [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ] : [],
  exitOnError: false
});

// Add request logging helper
export const logRequest = (req: any, res: any, responseTime: number) => {
  const { method, originalUrl, ip, headers } = req;
  const { statusCode } = res;
  
  logger.info('HTTP Request', {
    method,
    url: originalUrl,
    statusCode,
    responseTime: `${responseTime}ms`,
    ip,
    userAgent: headers['user-agent'],
    timestamp: new Date().toISOString()
  });
};

// Add database query logging helper
export const logQuery = (query: string, params?: any[], duration?: number) => {
  logger.debug('Database Query', {
    query: query.replace(/\s+/g, ' ').trim(),
    params,
    duration: duration ? `${duration}ms` : undefined,
    timestamp: new Date().toISOString()
  });
};

// Add security event logging
export const logSecurityEvent = (event: string, details: any, req?: any) => {
  logger.warn('Security Event', {
    event,
    details,
    ip: req?.ip,
    userAgent: req?.headers['user-agent'],
    userId: req?.user?.id,
    timestamp: new Date().toISOString()
  });
};

// Add error logging with context
export const logError = (error: Error, context?: any) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

export default logger;