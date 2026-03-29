/**
 * Logger utility with structured logging for AI/ML operations
 */

import winston from 'winston';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Define colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

winston.addColors(colors);

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }

    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  })
);

// File format without colors
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: logFormat
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'ai-platform.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),

    // Separate file for errors
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 3,
      tailable: true
    }),

    // Separate file for AI/ML operations
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'ml-operations.log'),
      format: fileFormat,
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      tailable: true
    })
  ],

  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'exceptions.log'),
      format: fileFormat
    })
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'rejections.log'),
      format: fileFormat
    })
  ]
});

// ML-specific logging functions
export const mlLogger = {
  /**
   * Log model training events
   */
  training: (modelName: string, epoch: number, metrics: any) => {
    logger.info('ML Training Progress', {
      category: 'ml_training',
      modelName,
      epoch,
      ...metrics
    });
  },

  /**
   * Log model inference events
   */
  inference: (modelName: string, latency: number, inputSize?: number) => {
    logger.info('ML Inference', {
      category: 'ml_inference',
      modelName,
      latency,
      inputSize
    });
  },

  /**
   * Log model performance metrics
   */
  performance: (modelName: string, metrics: any) => {
    logger.info('ML Performance Metrics', {
      category: 'ml_performance',
      modelName,
      ...metrics
    });
  },

  /**
   * Log data pipeline events
   */
  pipeline: (pipelineName: string, stage: string, duration?: number, recordCount?: number) => {
    logger.info('Data Pipeline', {
      category: 'data_pipeline',
      pipelineName,
      stage,
      duration,
      recordCount
    });
  },

  /**
   * Log model deployment events
   */
  deployment: (modelName: string, version: string, status: string, environment: string) => {
    logger.info('Model Deployment', {
      category: 'ml_deployment',
      modelName,
      version,
      status,
      environment
    });
  },

  /**
   * Log A/B testing results
   */
  abTest: (testName: string, variant: string, metrics: any) => {
    logger.info('A/B Test Result', {
      category: 'ab_testing',
      testName,
      variant,
      ...metrics
    });
  },

  /**
   * Log feature engineering operations
   */
  featureEngineering: (operation: string, features: string[], duration?: number) => {
    logger.info('Feature Engineering', {
      category: 'feature_engineering',
      operation,
      features,
      duration
    });
  },

  /**
   * Log data quality issues
   */
  dataQuality: (issue: string, severity: 'low' | 'medium' | 'high', details: any) => {
    const logLevel = severity === 'high' ? 'error' : severity === 'medium' ? 'warn' : 'info';
    logger.log(logLevel, 'Data Quality Issue', {
      category: 'data_quality',
      issue,
      severity,
      ...details
    });
  }
};

// Create logs directory if it doesn't exist
import fs from 'fs';
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export default logger;