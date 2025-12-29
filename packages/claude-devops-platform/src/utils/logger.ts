// Enhanced structured logger for DevOps platform
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../../../../utils/logger';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  [key: string]: any;
  requestId?: string;
  userId?: string;
  deploymentId?: string;
  stackId?: string;
  component?: string;
  environment?: string;
  timestamp?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableJson: boolean;
  enableCorrelationId: boolean;
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private config: LoggerConfig;
  private logDir: string;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: process.env.NODE_ENV === 'production',
      filePath: './logs',
      enableJson: process.env.NODE_ENV === 'production',
      enableCorrelationId: true,
      ...config
    };

    this.level = this.config.level;
    this.logDir = this.config.filePath || './logs';

    if (this.config.enableFile) {
      this.ensureLogDirectory();
    }
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.ensureDir(this.logDir);
    } catch (error) {
      logger.error('Failed to create log directory:', error);
    }
  }

  private generateCorrelationId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private formatMessage(level: string, message: string, context?: LogContext): any {
    const logEntry: LogContext & {
      timestamp: string;
      level: string;
      message: string;
      service: string;
      version: string;
      environment: string;
      pid: number;
      hostname: string;
    } = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'claude-devops-platform',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'unknown',
      ...context
    };

    if (this.config.enableCorrelationId && !logEntry.correlationId) {
      logEntry.correlationId = this.generateCorrelationId();
    }

    return logEntry;
  }

  private async writeToFile(level: string, logEntry: any): Promise<void> {
    if (!this.config.enableFile) return;

    try {
      const filename = level === 'ERROR' ? 'error.log' : 'application.log';
      const logPath = path.join(this.logDir, filename);
      
      const logLine = this.config.enableJson 
        ? JSON.stringify(logEntry) + '\n'
        : `${logEntry.timestamp} [${logEntry.level}] ${logEntry.message} ${JSON.stringify(logEntry.context || {})} \n`;

      await fs.appendFile(logPath, logLine);
    } catch (error) {
      logger.error('Failed to write to log file:', error);
    }
  }

  private consoleLog(level: string, message: string, ...args: any[]): void {
    if (!this.config.enableConsole) return;

    const timestamp = new Date().toISOString();
    const prefix = `${timestamp} [${level}]`;

    switch (level) {
      case 'DEBUG':
        logger.info(chalk.gray(prefix), chalk.gray(message), ...args);
        break;
      case 'INFO':
        logger.info(chalk.blue(prefix), message, ...args);
        break;
      case 'WARN':
        logger.warn(chalk.yellow(prefix), chalk.yellow(message), ...args);
        break;
      case 'ERROR':
        logger.error(chalk.red(prefix), chalk.red(message), ...args);
        break;
      default:
        logger.info(prefix, message, ...args);
    }
  }

  setLevel(level: keyof typeof LogLevel | LogLevel) {
    if (typeof level === 'string') {
      this.level = LogLevel[level];
    } else {
      this.level = level;
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.DEBUG) {
      const logEntry = this.formatMessage('DEBUG', message, context);
      this.consoleLog('DEBUG', message, context);
      this.writeToFile('DEBUG', logEntry);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.INFO) {
      const logEntry = this.formatMessage('INFO', message, context);
      this.consoleLog('INFO', message, context);
      this.writeToFile('INFO', logEntry);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.WARN) {
      const logEntry = this.formatMessage('WARN', message, context);
      this.consoleLog('WARN', message, context);
      this.writeToFile('WARN', logEntry);
    }
  }

  error(message: string, error?: Error | LogContext, context?: LogContext): void {
    if (this.level <= LogLevel.ERROR) {
      let errorInfo = context || {};
      
      if (error instanceof Error) {
        errorInfo = {
          ...errorInfo,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        };
      } else if (error && typeof error === 'object') {
        errorInfo = { ...errorInfo, ...error };
      }

      const logEntry = this.formatMessage('ERROR', message, errorInfo);
      this.consoleLog('ERROR', message, errorInfo);
      this.writeToFile('ERROR', logEntry);
    }
  }

  success(message: string, context?: LogContext): void {
    logger.info(chalk.green('✓'), message, context);
    this.info(`SUCCESS: ${message}`, context);
  }

  fail(message: string, context?: LogContext): void {
    logger.info(chalk.red('✗'), message, context);
    this.error(`FAILURE: ${message}`, context);
  }

  /**
   * Log deployment event
   */
  deployment(event: string, deploymentId: string, context?: LogContext): void {
    this.info(`Deployment ${event}`, {
      ...context,
      deploymentId,
      eventType: 'deployment'
    });
  }

  /**
   * Log security event
   */
  security(event: string, context?: LogContext): void {
    this.warn(`Security event: ${event}`, {
      ...context,
      eventType: 'security'
    });
  }

  /**
   * Log performance metrics
   */
  performance(metric: string, value: number, unit: string, context?: LogContext): void {
    this.info(`Performance metric: ${metric}`, {
      ...context,
      metric,
      value,
      unit,
      eventType: 'performance'
    });
  }

  /**
   * Log audit event
   */
  audit(action: string, userId?: string, context?: LogContext): void {
    const auditContext: LogContext = {
      ...context,
      ...(userId && { userId }),
      action,
      eventType: 'audit'
    };
    this.info(`Audit: ${action}`, auditContext);
  }

  /**
   * Start timer for performance logging
   */
  startTimer(): () => number {
    const start = Date.now();
    return () => {
      return Date.now() - start;
    };
  }

  /**
   * Log with timer
   */
  async withTimer<T>(operation: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
    const timer = this.startTimer();
    this.info(`Starting ${operation}`, context);
    
    try {
      const result = await fn();
      const duration = timer();
      this.performance(operation, duration, 'ms', context);
      this.info(`Completed ${operation}`, { ...context, duration });
      return result;
    } catch (error) {
      const duration = timer();
      this.error(`Failed ${operation}`, error instanceof Error ? error : new Error(String(error)), { ...context, duration });
      throw error;
    }
  }

  /**
   * Create child logger with context
   */
  child(context: LogContext): Logger {
    const childConfig = { ...this.config };
    const childLogger = new Logger(childConfig);
    
    // Override methods to include parent context
    const originalMethods = ['debug', 'info', 'warn', 'error', 'deployment', 'security', 'performance', 'audit'];
    originalMethods.forEach(methodName => {
      const originalMethod = childLogger[methodName as keyof Logger] as any;
      if (typeof originalMethod === 'function') {
        (childLogger as any)[methodName] = function(...args: any[]) {
          if (args.length > 1 && typeof args[args.length - 1] === 'object') {
            args[args.length - 1] = { ...context, ...args[args.length - 1] };
          } else {
            args.push(context);
          }
          return originalMethod.apply(this, args);
        };
      }
    });

    return childLogger;
  }
}

export const logger = new Logger();