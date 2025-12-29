import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, service, correlationId, ...metadata }) => {
  let msg = `${timestamp} [${service}] ${level}: ${message}`;
  if (correlationId) {
    msg += ` [${correlationId}]`;
  }
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger factory
export function createLogger(service: string): winston.Logger {
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

  return winston.createLogger({
    level: logLevel,
    format: combine(
      errors({ stack: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      isProduction ? json() : combine(colorize(), devFormat)
    ),
    defaultMeta: { service },
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true
      })
    ],
    exitOnError: false
  });
}

// Request context for correlation
export class RequestContext {
  private static storage = new Map<string, any>();

  static set(key: string, value: any): void {
    this.storage.set(key, value);
  }

  static get(key: string): any {
    return this.storage.get(key);
  }

  static getCorrelationId(): string {
    let id = this.storage.get('correlationId');
    if (!id) {
      id = uuidv4();
      this.storage.set('correlationId', id);
    }
    return id;
  }

  static clear(): void {
    this.storage.clear();
  }
}

// Express middleware for correlation ID
export function correlationMiddleware(req: any, res: any, next: any): void {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  RequestContext.set('correlationId', correlationId);
  res.setHeader('x-correlation-id', correlationId);
  next();
}

// Enhanced logger with correlation ID
export class Logger {
  private logger: winston.Logger;

  constructor(service: string) {
    this.logger = createLogger(service);
  }

  private getMetadata(meta?: any): any {
    const correlationId = RequestContext.getCorrelationId();
    return {
      correlationId,
      ...meta
    };
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, this.getMetadata(meta));
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, this.getMetadata(meta));
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, this.getMetadata(meta));
  }

  error(message: string, error?: Error | any, meta?: any): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        ...this.getMetadata(meta),
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      });
    } else {
      this.logger.error(message, this.getMetadata({ error, ...meta }));
    }
  }

  metric(name: string, value: number, unit: string, meta?: any): void {
    this.logger.info('metric', {
      ...this.getMetadata(meta),
      metric: { name, value, unit }
    });
  }

  audit(action: string, userId: string, resource: string, meta?: any): void {
    this.logger.info('audit', {
      ...this.getMetadata(meta),
      audit: { action, userId, resource, timestamp: new Date() }
    });
  }
}

// Default logger instance
export const defaultLogger = createLogger('MarketingEngine');