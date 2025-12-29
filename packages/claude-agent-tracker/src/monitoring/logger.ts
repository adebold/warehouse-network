/**
 * Structured logging with Winston
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import config from '../config/index.js';

// Ensure log directory exists
const logDir = config.monitoring.logging.directory;
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, metadata }) => {
    let log = `${timestamp} ${level}: ${message}`;
    if (metadata && Object.keys(metadata).length) {
      log += ` ${JSON.stringify(metadata)}`;
    }
    return log;
  })
);

// Create transports
const transports: winston.transport[] = [];

// Console transport
if (config.env !== 'test') {
  transports.push(
    new winston.transports.Console({
      format: config.env === 'development' ? consoleFormat : structuredFormat,
      level: config.monitoring.logging.level
    })
  );
}

// File transport with rotation
transports.push(
  new DailyRotateFile({
    filename: join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: config.monitoring.logging.maxSize,
    maxFiles: `${config.monitoring.logging.maxFiles}d`,
    format: structuredFormat,
    level: config.monitoring.logging.level
  })
);

// Error file transport
transports.push(
  new DailyRotateFile({
    filename: join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: config.monitoring.logging.maxSize,
    maxFiles: `${config.monitoring.logging.maxFiles}d`,
    format: structuredFormat,
    level: 'error'
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.monitoring.logging.level,
  format: structuredFormat,
  defaultMeta: { service: 'claude-agent-tracker' },
  transports,
  exitOnError: false
});

// Add request ID to context
export function addRequestContext(requestId: string) {
  return logger.child({ requestId });
}

// Add agent context
export function addAgentContext(agentId: string) {
  return logger.child({ agentId });
}

// Export logger instance
export { logger };

// Export convenience methods
export const log = {
  trace: (message: string, meta?: any) => logger.log('trace', message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  fatal: (message: string, meta?: any) => logger.log('fatal', message, meta)
};