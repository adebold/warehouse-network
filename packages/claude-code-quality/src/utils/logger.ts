/**
 * Logger Utility
 * 
 * Structured logging for the code quality analyzer
 */

import * as path from 'path';

import winston from 'winston';

export class Logger {
  private winston: winston.Logger;
  private context: string;

  constructor(context: string) {
    this.context = context;
    
    // Create winston logger
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        service: 'claude-code-quality',
        context: this.context
      },
      transports: this.getTransports()
    });
  }

  /**
   * Get logger transports based on environment
   */
  private getTransports(): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport for development
    if (process.env.NODE_ENV !== 'production') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      );
    }

    // File transport for production
    if (process.env.NODE_ENV === 'production') {
      transports.push(
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'error.log'),
          level: 'error'
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'combined.log')
        })
      );
    }

    return transports;
  }

  /**
   * Log info message
   */
  info(message: string, meta?: any) {
    this.winston.info(message, meta);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: any) {
    this.winston.warn(message, meta);
  }

  /**
   * Log error message
   */
  error(message: string, error?: any) {
    if (error instanceof Error) {
      this.winston.error(message, {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      });
    } else {
      this.winston.error(message, { error });
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: any) {
    this.winston.debug(message, meta);
  }

  /**
   * Create child logger with additional context
   */
  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`);
  }

  /**
   * Measure and log operation duration
   */
  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      this.info(`Operation completed: ${operation}`, { duration });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      this.error(`Operation failed: ${operation}`, {
        duration,
        error
      });
      
      throw error;
    }
  }
}