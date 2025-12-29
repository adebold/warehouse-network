/**
 * Structured logging with OpenTelemetry integration
 */

import pino from 'pino';
import { trace, context } from '@opentelemetry/api';
import { AnalyticsConfig } from './config';

export interface LogContext {
  userId?: string;
  eventId?: string;
  integration?: string;
  [key: string]: any;
}

export class Logger {
  private pino: pino.Logger;
  private config: AnalyticsConfig['monitoring'];

  constructor(config: AnalyticsConfig['monitoring']) {
    this.config = config;
    
    this.pino = pino({
      name: config.serviceName,
      level: config.logLevel,
      formatters: {
        level: (label) => {
          return { level: label };
        }
      },
      serializers: {
        error: pino.stdSerializers.err,
        request: pino.stdSerializers.req,
        response: pino.stdSerializers.res
      },
      ...(config.logFormat === 'json' ? {} : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname'
          }
        }
      })
    });
  }

  /**
   * Add OpenTelemetry trace context to logs
   */
  private addTraceContext(obj: any): any {
    if (!this.config.tracingEnabled) return obj;

    const span = trace.getActiveSpan();
    if (!span) return obj;

    const spanContext = span.spanContext();
    return {
      ...obj,
      trace: {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        flags: spanContext.traceFlags
      }
    };
  }

  /**
   * Log methods with trace context
   */
  debug(msg: string, context?: LogContext): void {
    this.pino.debug(this.addTraceContext(context || {}), msg);
  }

  info(msg: string, context?: LogContext): void {
    this.pino.info(this.addTraceContext(context || {}), msg);
  }

  warn(msg: string, context?: LogContext): void {
    this.pino.warn(this.addTraceContext(context || {}), msg);
  }

  error(msg: string, error?: Error | any, context?: LogContext): void {
    const logObj = this.addTraceContext({
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
    this.pino.error(logObj, msg);
  }

  /**
   * Create child logger with persistent context
   */
  child(bindings: LogContext): Logger {
    const childLogger = Object.create(this);
    childLogger.pino = this.pino.child(bindings);
    return childLogger;
  }

  /**
   * Measure and log operation duration
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = Date.now();
    const span = trace.getTracer(this.config.serviceName).startSpan(operation);
    
    try {
      const result = await context.with(trace.setSpan(context.active(), span), fn);
      const duration = Date.now() - start;
      
      this.info(`Operation completed: ${operation}`, {
        ...context,
        operation,
        duration,
        success: true
      });
      
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      this.error(`Operation failed: ${operation}`, error, {
        ...context,
        operation,
        duration,
        success: false
      });
      
      span.setStatus({ code: 2, message: error.message }); // ERROR
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Flush logs before shutdown
   */
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.pino.flush(() => resolve());
    });
  }
}

/**
 * Create logger instance
 */
export function createLogger(config: AnalyticsConfig['monitoring']): Logger {
  return new Logger(config);
}