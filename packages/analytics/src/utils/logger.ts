/**
 * Logger Utility
 * Winston-based logger configuration for analytics services
 */

import winston from 'winston';
import { format } from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = format;

/**
 * Create a logger instance with specified service name
 */
export function createLogger(serviceName: string): winston.Logger {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  const logFormat = isDevelopment
    ? combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] ${service || serviceName}: ${message} ${metaStr}`;
        })
      )
    : combine(
        timestamp(),
        errors({ stack: true }),
        json()
      );

  return winston.createLogger({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    format: logFormat,
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true
      }),
      // File transports for production
      ...(isDevelopment ? [] : [
        new winston.transports.File({
          filename: 'logs/analytics-error.log',
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: 'logs/analytics-combined.log',
          maxsize: 10485760, // 10MB
          maxFiles: 5
        })
      ])
    ]
  });
}

/**
 * Default logger instance
 */
export const logger = createLogger('analytics');