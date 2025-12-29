/**
 * Logging Validator - Validates logging implementation
 * Ensures proper production logging with structured logs, no console.log, and appropriate log levels
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { glob } from 'glob';

import { ValidationResult } from '../types';
import { Logger } from '../utils/logger';

export interface LoggingValidationOptions {
  requireStructuredLogging: boolean;
  requireCorrelationIds: boolean;
  requireLogLevels: boolean;
  bannedLoggingMethods: string[];
  requiredLoggers: string[];
  requireErrorLogging: boolean;
  requireRequestLogging: boolean;
  requirePerformanceLogging: boolean;
}

export interface LoggingValidationResult extends ValidationResult {
  issues: LoggingIssue[];
  coverage: {
    hasProductionLogger: boolean;
    hasStructuredLogging: boolean;
    hasCorrelationIds: boolean;
    hasLogLevels: boolean;
    hasErrorLogging: boolean;
    hasRequestLogging: boolean;
    hasPerformanceLogging: boolean;
  };
  consoleUsage: {
    total: number;
    files: string[];
  };
}

export interface LoggingIssue {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line?: number;
  recommendation: string;
}

export class LoggingValidator {
  private logger: Logger;
  private options: LoggingValidationOptions;

  constructor(options?: Partial<LoggingValidationOptions>) {
    this.logger = new Logger('LoggingValidator');
    this.options = {
      requireStructuredLogging: true,
      requireCorrelationIds: true,
      requireLogLevels: true,
      bannedLoggingMethods: [
        'console.log',
        'console.debug',
        'console.info',
        'console.warn',
        'console.error',
        'console.trace'
      ],
      requiredLoggers: ['winston', 'pino', 'bunyan', 'morgan'],
      requireErrorLogging: true,
      requireRequestLogging: true,
      requirePerformanceLogging: true,
      ...options
    };
  }

  /**
   * Validate logging implementation
   */
  async validate(target: string): Promise<LoggingValidationResult> {
    this.logger.info(`Validating logging for: ${target}`);
    
    const result: LoggingValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      issues: [],
      coverage: {
        hasProductionLogger: false,
        hasStructuredLogging: false,
        hasCorrelationIds: false,
        hasLogLevels: false,
        hasErrorLogging: false,
        hasRequestLogging: false,
        hasPerformanceLogging: false
      },
      consoleUsage: {
        total: 0,
        files: []
      }
    };
    
    try {
      // Check for logging configuration
      await this.checkLoggingConfiguration(target, result);
      
      // Find all source files
      const sourceFiles = await this.findSourceFiles(target);
      
      // Check each file for logging practices
      for (const file of sourceFiles) {
        await this.validateLoggingInFile(file, result);
      }
      
      // Check package dependencies
      await this.checkLoggingDependencies(target, result);
      
      // Check middleware for request logging
      await this.checkRequestLogging(target, result);
      
      // Check coverage requirements
      this.checkCoverageRequirements(result);
      
      // Validate overall implementation
      result.valid = result.errors.length === 0;
      
    } catch (error) {
      this.logger.error('Logging validation failed', error);
      result.valid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Check logging configuration files
   */
  private async checkLoggingConfiguration(target: string, result: LoggingValidationResult) {
    const configPatterns = [
      '**/config/logging.{js,ts,json}',
      '**/config/logger.{js,ts,json}',
      '**/utils/logger.{js,ts}',
      '**/lib/logger.{js,ts}',
      '**/services/logger.{js,ts}'
    ];
    
    for (const pattern of configPatterns) {
      const files = await glob(pattern, {
        cwd: target,
        absolute: true,
        ignore: ['**/node_modules/**']
      });
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          
          // Check for production logger
          for (const logger of this.options.requiredLoggers) {
            if (content.includes(logger)) {
              result.coverage.hasProductionLogger = true;
              
              // Check for structured logging
              if (content.includes('json') || content.includes('JSON') || 
                  content.includes('structured')) {
                result.coverage.hasStructuredLogging = true;
              }
              
              // Check for log levels
              if (content.includes('level') && 
                  (content.includes('error') || content.includes('warn') || 
                   content.includes('info') || content.includes('debug'))) {
                result.coverage.hasLogLevels = true;
              }
              
              break;
            }
          }
          
          // Check for correlation IDs
          if (content.includes('correlationId') || content.includes('correlation-id') ||
              content.includes('requestId') || content.includes('request-id') ||
              content.includes('traceId')) {
            result.coverage.hasCorrelationIds = true;
          }
          
        } catch (error) {
          this.logger.debug(`Could not read config file: ${file}`, error);
        }
      }
    }
  }

  /**
   * Find all source files
   */
  private async findSourceFiles(target: string): Promise<string[]> {
    return glob('**/*.{js,jsx,ts,tsx}', {
      cwd: target,
      absolute: true,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/*.test.*',
        '**/*.spec.*'
      ]
    });
  }

  /**
   * Validate logging in a single file
   */
  private async validateLoggingInFile(filePath: string, result: LoggingValidationResult) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Check for console usage
      for (const banned of this.options.bannedLoggingMethods) {
        const regex = new RegExp(`\\b${banned.replace('.', '\\.')}\\s*\\(`, 'g');
        let match;
        
        while ((match = regex.exec(content)) !== null) {
          result.consoleUsage.total++;
          
          if (!result.consoleUsage.files.includes(filePath)) {
            result.consoleUsage.files.push(filePath);
          }
          
          const lineNumber = content.substring(0, match.index).split('\n').length;
          
          result.errors.push(`${banned} used in production code`);
          result.issues.push({
            type: 'console-usage',
            severity: 'error',
            message: `${banned} found at line ${lineNumber}`,
            file: filePath,
            line: lineNumber,
            recommendation: 'Use a production logger like Winston or Pino instead'
          });
        }
      }
      
      // Check for error logging
      if (content.includes('catch') || content.includes('error')) {
        if (content.includes('logger.error') || content.includes('log.error') ||
            content.includes('this.logger.error')) {
          result.coverage.hasErrorLogging = true;
        } else if (content.includes('catch') && !content.includes('console.error')) {
          // Check if errors are being swallowed
          const catchBlocks = content.match(/catch\s*\([^)]*\)\s*{[^}]*}/g) || [];
          
          for (const block of catchBlocks) {
            if (!block.includes('log') && !block.includes('throw') && 
                !block.includes('return') && block.trim().length < 50) {
              result.warnings.push('Empty or inadequate error handling detected');
              result.issues.push({
                type: 'poor-error-logging',
                severity: 'warning',
                message: 'Error caught but not logged',
                file: filePath,
                recommendation: 'Log errors before handling them'
              });
              break;
            }
          }
        }
      }
      
      // Check for proper logging patterns
      this.checkLoggingPatterns(content, filePath, result);
      
    } catch (error) {
      this.logger.error(`Failed to validate logging in file: ${filePath}`, error);
    }
  }

  /**
   * Check for proper logging patterns
   */
  private checkLoggingPatterns(content: string, filePath: string, result: LoggingValidationResult) {
    // Check for sensitive data logging
    const sensitivePatterns = [
      /log.*password/i,
      /log.*apiKey/i,
      /log.*secret/i,
      /log.*token/i,
      /log.*creditCard/i,
      /log.*ssn/i
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        result.errors.push('Potential sensitive data logging detected');
        result.issues.push({
          type: 'sensitive-data-logging',
          severity: 'error',
          message: 'Logging potentially contains sensitive data',
          file: filePath,
          recommendation: 'Never log passwords, tokens, or other sensitive data'
        });
        break;
      }
    }
    
    // Check for structured logging patterns
    if (content.includes('logger.') || content.includes('log.')) {
      // Check if using structured format
      const hasStructuredCalls = 
        /log(ger)?\.(error|warn|info|debug)\s*\(\s*{/.test(content) ||
        /log(ger)?\.(error|warn|info|debug)\s*\([^,]+,\s*{/.test(content);
      
      if (!hasStructuredCalls && result.coverage.hasProductionLogger) {
        result.warnings.push('Logger used but not with structured format');
        result.issues.push({
          type: 'unstructured-logging',
          severity: 'warning',
          message: 'Logging should use structured format',
          file: filePath,
          recommendation: 'Use structured logging: logger.info({ key: value }, message)'
        });
      }
    }
    
    // Check for performance logging
    if (content.includes('performance') || content.includes('measure') ||
        content.includes('Date.now()') || content.includes('process.hrtime')) {
      if (content.includes('logger.') && (content.includes('duration') || 
          content.includes('elapsed') || content.includes('time'))) {
        result.coverage.hasPerformanceLogging = true;
      }
    }
  }

  /**
   * Check logging dependencies
   */
  private async checkLoggingDependencies(target: string, result: LoggingValidationResult) {
    try {
      const packagePath = path.join(target, 'package.json');
      const packageContent = await fs.readFile(packagePath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      // Check for production loggers
      let hasLogger = false;
      for (const logger of this.options.requiredLoggers) {
        if (allDeps[logger]) {
          hasLogger = true;
          result.coverage.hasProductionLogger = true;
          break;
        }
      }
      
      if (!hasLogger) {
        result.errors.push('No production logger found in dependencies');
        result.issues.push({
          type: 'no-production-logger',
          severity: 'error',
          message: 'Production logger not installed',
          file: 'package.json',
          recommendation: 'Install Winston, Pino, or another production logger'
        });
      }
      
      // Check for request logging middleware
      if (allDeps['morgan'] || allDeps['express-winston'] || allDeps['pino-http']) {
        result.coverage.hasRequestLogging = true;
      }
      
    } catch (error) {
      this.logger.debug('Could not check logging dependencies', error);
    }
  }

  /**
   * Check for request logging middleware
   */
  private async checkRequestLogging(target: string, result: LoggingValidationResult) {
    const middlewarePatterns = [
      '**/middleware/**/*.{js,ts}',
      '**/app.{js,ts}',
      '**/server.{js,ts}',
      '**/index.{js,ts}'
    ];
    
    for (const pattern of middlewarePatterns) {
      const files = await glob(pattern, {
        cwd: target,
        absolute: true,
        ignore: ['**/node_modules/**']
      });
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          
          // Check for request logging
          if (content.includes('morgan') || 
              content.includes('express-winston') ||
              content.includes('pino-http') ||
              (content.includes('middleware') && content.includes('req') && 
               content.includes('log'))) {
            result.coverage.hasRequestLogging = true;
            
            // Check if logging includes important request data
            if (content.includes('req.method') || content.includes('req.url') ||
                content.includes('req.ip') || content.includes('req.headers')) {
              // Good request logging
            } else {
              result.warnings.push('Request logging may be incomplete');
              result.issues.push({
                type: 'incomplete-request-logging',
                severity: 'warning',
                message: 'Request logging should include method, URL, and IP',
                file,
                recommendation: 'Log request method, URL, IP, and response time'
              });
            }
          }
          
        } catch (error) {
          this.logger.debug(`Could not check middleware file: ${file}`, error);
        }
      }
    }
  }

  /**
   * Check coverage requirements
   */
  private checkCoverageRequirements(result: LoggingValidationResult) {
    const { coverage, consoleUsage } = result;
    
    if (!coverage.hasProductionLogger) {
      result.errors.push('Production logger required but not found');
      result.issues.push({
        type: 'missing-production-logger',
        severity: 'error',
        message: 'No production logging solution found',
        file: 'project',
        recommendation: 'Implement Winston, Pino, or Bunyan for production logging'
      });
    }
    
    if (this.options.requireStructuredLogging && !coverage.hasStructuredLogging) {
      result.errors.push('Structured logging required but not found');
      result.issues.push({
        type: 'missing-structured-logging',
        severity: 'error',
        message: 'Structured logging is required',
        file: 'project',
        recommendation: 'Configure logger to output JSON formatted logs'
      });
    }
    
    if (this.options.requireCorrelationIds && !coverage.hasCorrelationIds) {
      result.warnings.push('Correlation IDs recommended but not found');
      result.issues.push({
        type: 'missing-correlation-ids',
        severity: 'warning',
        message: 'Correlation IDs help trace requests',
        file: 'project',
        recommendation: 'Add correlation IDs to all log entries'
      });
    }
    
    if (this.options.requireLogLevels && !coverage.hasLogLevels) {
      result.errors.push('Log levels required but not configured');
      result.issues.push({
        type: 'missing-log-levels',
        severity: 'error',
        message: 'Log levels must be properly configured',
        file: 'project',
        recommendation: 'Configure log levels (error, warn, info, debug)'
      });
    }
    
    if (this.options.requireErrorLogging && !coverage.hasErrorLogging) {
      result.warnings.push('Error logging not properly implemented');
      result.issues.push({
        type: 'missing-error-logging',
        severity: 'warning',
        message: 'Errors should be logged before handling',
        file: 'project',
        recommendation: 'Log all errors with stack traces'
      });
    }
    
    if (this.options.requireRequestLogging && !coverage.hasRequestLogging) {
      result.warnings.push('Request logging recommended but not found');
      result.issues.push({
        type: 'missing-request-logging',
        severity: 'warning',
        message: 'HTTP request logging is recommended',
        file: 'project',
        recommendation: 'Add request logging middleware (morgan, etc)'
      });
    }
    
    // Report console usage
    if (consoleUsage.total > 0) {
      result.errors.push(`Console statements found in ${consoleUsage.files.length} files`);
      result.issues.push({
        type: 'console-usage-summary',
        severity: 'error',
        message: `${consoleUsage.total} console statements found across ${consoleUsage.files.length} files`,
        file: 'project',
        recommendation: 'Replace all console statements with proper logging'
      });
    }
  }
}