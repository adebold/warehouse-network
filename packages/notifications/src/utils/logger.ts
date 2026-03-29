/**
 * Logger utility for the notification system
 */

import winston, { Logger } from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create base logger configuration
const loggerConfig = {
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'notifications' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          return `${timestamp} [${service}] ${level}: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      )
    })
  ]
};

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  loggerConfig.transports.push(
    new winston.transports.File({
      filename: 'logs/notifications-error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/notifications.log'
    })
  );
}

// Create default logger
const defaultLogger = winston.createLogger(loggerConfig);

/**
 * Create a logger with a specific module name
 */
export function createLogger(moduleName: string): Logger {
  return defaultLogger.child({ module: moduleName });
}

/**
 * Get the default logger
 */
export function getDefaultLogger(): Logger {
  return defaultLogger;
}

export { Logger };
export default defaultLogger;