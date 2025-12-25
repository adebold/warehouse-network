import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
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
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: customFormat,
  defaultMeta: { 
    service: 'claude-db-integrity',
    version: '1.0.0'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: customFormat
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'claude-db-integrity.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
      tailable: true
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add Claude Flow integration logging
logger.add(new winston.transports.File({
  filename: path.join(logsDir, 'claude-flow.log'),
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'claude-flow' }),
    winston.format.json()
  ),
  // Only log messages related to Claude Flow
  filter: (info) => {
    return info.message?.includes('claude-flow') || 
           info.message?.includes('memory') || 
           info.message?.includes('sync');
  }
}));

// Performance timing logger
export const perfLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'performance' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3
    })
  ]
});

// Audit logger for security events
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'audit' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10 // Keep more audit logs
    })
  ]
});

// Helper functions for structured logging
export const loggers = {
  // Performance timing
  time: (label: string, metadata?: any) => {
    const startTime = Date.now();
    return {
      end: (additionalMeta?: any) => {
        const duration = Date.now() - startTime;
        perfLogger.debug('Performance timing', {
          label,
          duration,
          ...metadata,
          ...additionalMeta
        });
        return duration;
      }
    };
  },

  // Database operations
  db: {
    query: (sql: string, duration: number, metadata?: any) => {
      logger.debug('Database query', {
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        duration,
        ...metadata
      });
    },
    error: (error: Error, sql?: string) => {
      logger.error('Database error', {
        error: error.message,
        stack: error.stack,
        sql: sql?.substring(0, 100)
      });
    }
  },

  // Claude Flow operations
  claude: {
    sync: (operation: string, duration: number, result?: any) => {
      logger.info('Claude Flow sync', {
        operation,
        duration,
        success: !!result,
        entries: result?.entries || 0
      });
    },
    error: (operation: string, error: Error) => {
      logger.error('Claude Flow error', {
        operation,
        error: error.message,
        stack: error.stack
      });
    }
  },

  // Integrity checks
  integrity: {
    start: (checkType: string, metadata?: any) => {
      logger.info('Starting integrity check', {
        type: checkType,
        ...metadata
      });
    },
    complete: (checkType: string, result: any) => {
      logger.info('Integrity check complete', {
        type: checkType,
        passed: result.passed,
        failed: result.failed,
        duration: result.duration
      });
    },
    issue: (severity: string, message: string, details?: any) => {
      const logLevel = severity === 'error' ? 'error' : 'warn';
      logger[logLevel]('Integrity issue detected', {
        severity,
        message,
        details
      });
    }
  },

  // Security events
  security: {
    unauthorized: (path: string, ip: string, userAgent?: string) => {
      auditLogger.warn('Unauthorized access attempt', {
        path,
        ip,
        userAgent,
        timestamp: new Date().toISOString()
      });
    },
    suspicious: (event: string, details: any) => {
      auditLogger.error('Suspicious activity', {
        event,
        details,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Request tracking
  request: {
    start: (requestId: string, path: string, method: string) => {
      logger.debug('Request start', {
        requestId,
        path,
        method,
        timestamp: new Date().toISOString()
      });
    },
    complete: (requestId: string, statusCode: number, duration: number) => {
      logger.info('Request complete', {
        requestId,
        statusCode,
        duration,
        timestamp: new Date().toISOString()
      });
    }
  }
};

// Graceful shutdown handling
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  logger.end();
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  logger.end();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  
  // Give logger time to write before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise)
  });
});

export default logger;