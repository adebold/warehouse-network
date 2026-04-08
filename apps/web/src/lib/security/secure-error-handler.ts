/**
 * Secure Error Handling System
 * Prevents information disclosure while maintaining security audit trails
 */

import crypto from 'crypto';
import { logSecurityEvent } from './monitoring';
import { NextRequest, NextResponse } from 'next/server';

export interface SecurityError {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  exposureRisk: 'none' | 'low' | 'medium' | 'high';
  internalDetails?: any;
  userMessage?: string;
  category: 'auth' | 'validation' | 'authorization' | 'system' | 'business';
}

export interface ErrorContext {
  requestId: string;
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  endpoint: string;
  timestamp: Date;
  sessionId?: string;
  organizationId?: string;
}

export interface ErrorHandlingConfig {
  enableDetailedErrors: boolean;
  logLevel: 'minimal' | 'standard' | 'detailed';
  sanitizeStackTraces: boolean;
  preventTimingAttacks: boolean;
  enableHoneypot: boolean;
  rateLimitErrorResponses: boolean;
}

export class SecureErrorHandler {
  private config: ErrorHandlingConfig;
  private errorCodes: Map<string, SecurityError>;
  private timingMap: Map<string, number>;
  private errorFrequency: Map<string, number>;
  private honeypotPatterns: Set<string>;

  constructor(config?: Partial<ErrorHandlingConfig>) {
    this.config = {
      enableDetailedErrors: process.env.NODE_ENV === 'development',
      logLevel: process.env.NODE_ENV === 'development' ? 'detailed' : 'standard',
      sanitizeStackTraces: true,
      preventTimingAttacks: true,
      enableHoneypot: false,
      rateLimitErrorResponses: true,
      ...config
    };

    this.errorCodes = new Map();
    this.timingMap = new Map();
    this.errorFrequency = new Map();
    this.honeypotPatterns = new Set();

    this.initializeErrorCodes();
    this.initializeHoneypotPatterns();
  }

  /**
   * Handle authentication errors with security considerations
   */
  async handleAuthError(
    error: any,
    context: ErrorContext,
    options?: {
      preventUserEnumeration?: boolean;
      uniformTiming?: boolean;
      logFailedAttempt?: boolean;
    }
  ): Promise<NextResponse> {
    const requestId = context.requestId;
    const startTime = Date.now();

    try {
      const securityError = this.categorizeAuthError(error);

      // Prevent user enumeration attacks
      if (options?.preventUserEnumeration !== false) {
        securityError.userMessage = this.getGenericAuthMessage(securityError.code);
      }

      // Log security event
      await logSecurityEvent('auth_error', securityError.severity, {
        requestId,
        errorCode: securityError.code,
        ipAddress: context.ipAddress,
        endpoint: context.endpoint,
        userAgent: context.userAgent,
        exposureRisk: securityError.exposureRisk,
        category: securityError.category,
        internalDetails: this.sanitizeInternalDetails(securityError.internalDetails)
      });

      // Track failed attempts for rate limiting
      if (options?.logFailedAttempt !== false) {
        await this.trackFailedAttempt(context);
      }

      // Apply uniform timing to prevent timing attacks
      if (options?.uniformTiming !== false) {
        await this.applyUniformTiming('auth_error', startTime);
      }

      // Check if this looks like an attack
      const isAttack = await this.detectAttackPattern(context, securityError);
      if (isAttack) {
        await this.handlePotentialAttack(context, securityError);
      }

      return this.createSecureErrorResponse(securityError, context);

    } catch (handlingError) {
      // Fallback error handling
      await logSecurityEvent('error_handler_failure', 'high', {
        requestId,
        originalError: this.sanitizeError(error),
        handlingError: this.sanitizeError(handlingError),
        ipAddress: context.ipAddress
      });

      return this.createFallbackErrorResponse(context);
    }
  }

  /**
   * Handle validation errors securely
   */
  async handleValidationError(
    error: any,
    context: ErrorContext,
    options?: {
      sanitizeFieldNames?: boolean;
      maskSensitiveValues?: boolean;
      preventInjectionLearning?: boolean;
    }
  ): Promise<NextResponse> {
    const requestId = context.requestId;

    try {
      const securityError = this.categorizeValidationError(error);

      // Sanitize field names to prevent information disclosure
      if (options?.sanitizeFieldNames !== false) {
        securityError.internalDetails = this.sanitizeFieldNames(securityError.internalDetails);
      }

      // Mask sensitive values in error messages
      if (options?.maskSensitiveValues !== false) {
        securityError.message = this.maskSensitiveValues(securityError.message);
        securityError.userMessage = this.maskSensitiveValues(securityError.userMessage || '');
      }

      // Check for injection attempts in validation errors
      if (options?.preventInjectionLearning !== false) {
        const injectionAttempt = this.detectInjectionAttempt(error, context);
        if (injectionAttempt) {
          securityError.severity = 'high';
          securityError.exposureRisk = 'high';

          await logSecurityEvent('injection_attempt_detected', 'high', {
            requestId,
            injectionType: injectionAttempt.type,
            payload: this.sanitizePayload(injectionAttempt.payload),
            ipAddress: context.ipAddress,
            endpoint: context.endpoint
          });
        }
      }

      // Log validation error
      await logSecurityEvent('validation_error', securityError.severity, {
        requestId,
        errorCode: securityError.code,
        category: securityError.category,
        exposureRisk: securityError.exposureRisk,
        ipAddress: context.ipAddress,
        endpoint: context.endpoint
      });

      return this.createSecureErrorResponse(securityError, context);

    } catch (handlingError) {
      await logSecurityEvent('validation_error_handler_failure', 'medium', {
        requestId,
        originalError: this.sanitizeError(error),
        handlingError: this.sanitizeError(handlingError),
        ipAddress: context.ipAddress
      });

      return this.createFallbackErrorResponse(context);
    }
  }

  /**
   * Handle authorization errors with RBAC context
   */
  async handleAuthorizationError(
    error: any,
    context: ErrorContext,
    rbacContext?: {
      userId: string;
      requestedResource: string;
      requestedAction: string;
      userRoles: string[];
      requiredPermissions: string[];
    }
  ): Promise<NextResponse> {
    const requestId = context.requestId;

    try {
      const securityError = this.categorizeAuthorizationError(error);

      // Enhanced logging for authorization failures
      await logSecurityEvent('authorization_failure', securityError.severity, {
        requestId,
        userId: rbacContext?.userId,
        requestedResource: rbacContext?.requestedResource,
        requestedAction: rbacContext?.requestedAction,
        userRoles: rbacContext?.userRoles,
        requiredPermissions: rbacContext?.requiredPermissions,
        ipAddress: context.ipAddress,
        endpoint: context.endpoint,
        exposureRisk: securityError.exposureRisk
      });

      // Check for privilege escalation attempts
      if (rbacContext) {
        const escalationAttempt = this.detectPrivilegeEscalation(rbacContext, context);
        if (escalationAttempt) {
          securityError.severity = 'high';
          await this.handlePrivilegeEscalationAttempt(context, rbacContext, escalationAttempt);
        }
      }

      // Generic authorization error message to prevent enumeration
      securityError.userMessage = 'Access denied. Insufficient permissions.';

      return this.createSecureErrorResponse(securityError, context);

    } catch (handlingError) {
      await logSecurityEvent('authorization_error_handler_failure', 'high', {
        requestId,
        userId: rbacContext?.userId,
        originalError: this.sanitizeError(error),
        handlingError: this.sanitizeError(handlingError),
        ipAddress: context.ipAddress
      });

      return this.createFallbackErrorResponse(context);
    }
  }

  /**
   * Handle system errors with minimal exposure
   */
  async handleSystemError(
    error: any,
    context: ErrorContext,
    options?: {
      includeErrorId?: boolean;
      enableRetry?: boolean;
      notifyAdmins?: boolean;
    }
  ): Promise<NextResponse> {
    const requestId = context.requestId;
    const errorId = crypto.randomUUID();

    try {
      const securityError: SecurityError = {
        code: 'SYSTEM_ERROR',
        message: 'An internal system error occurred',
        severity: 'high',
        exposureRisk: 'low',
        category: 'system',
        userMessage: 'We encountered a technical issue. Please try again later.',
        internalDetails: {
          errorId,
          originalError: this.sanitizeError(error),
          stackTrace: this.config.sanitizeStackTraces ?
            this.sanitizeStackTrace(error.stack) : error.stack
        }
      };

      if (options?.includeErrorId !== false) {
        securityError.userMessage += ` (Error ID: ${errorId})`;
      }

      // Enhanced logging for system errors
      await logSecurityEvent('system_error', 'high', {
        requestId,
        errorId,
        errorType: error.constructor.name,
        errorMessage: error.message,
        stackTrace: this.config.logLevel === 'detailed' ? error.stack : undefined,
        ipAddress: context.ipAddress,
        endpoint: context.endpoint,
        userId: context.userId,
        organizationId: context.organizationId
      });

      // Notify administrators for critical errors
      if (options?.notifyAdmins !== false && this.isCriticalSystemError(error)) {
        await this.notifyAdministrators(error, context, errorId);
      }

      // Check for potential system attacks
      const isSystemAttack = this.detectSystemAttack(error, context);
      if (isSystemAttack) {
        await this.handleSystemAttack(context, error);
      }

      return this.createSecureErrorResponse(securityError, context);

    } catch (handlingError) {
      // Ultimate fallback - log to console and return minimal response
      console.error('Critical error handler failure:', {
        requestId,
        originalError: error.message,
        handlingError: handlingError.message,
        timestamp: new Date().toISOString()
      });

      return new NextResponse(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'A system error occurred',
          requestId
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  /**
   * Create secure error response with appropriate headers
   */
  private createSecureErrorResponse(
    securityError: SecurityError,
    context: ErrorContext
  ): NextResponse {
    const statusCode = this.mapErrorToStatusCode(securityError);

    const responseBody = {
      error: securityError.code,
      message: securityError.userMessage || securityError.message,
      requestId: context.requestId,
      timestamp: context.timestamp.toISOString(),
      ...(this.config.enableDetailedErrors && {
        details: securityError.internalDetails
      })
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-Request-ID': context.requestId,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };

    // Add security headers for high-risk errors
    if (securityError.exposureRisk === 'high') {
      headers['X-Security-Alert'] = 'true';
    }

    return new NextResponse(JSON.stringify(responseBody), {
      status: statusCode,
      headers
    });
  }

  /**
   * Create fallback error response for handler failures
   */
  private createFallbackErrorResponse(context: ErrorContext): NextResponse {
    return new NextResponse(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        message: 'An internal error occurred while processing your request',
        requestId: context.requestId,
        timestamp: context.timestamp.toISOString()
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': context.requestId
        }
      }
    );
  }

  /**
   * Initialize error codes and messages
   */
  private initializeErrorCodes(): void {
    const errorDefinitions = [
      {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid authentication credentials',
        severity: 'medium' as const,
        exposureRisk: 'medium' as const,
        category: 'auth' as const,
        userMessage: 'Invalid email or password'
      },
      {
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User account not found',
        severity: 'medium' as const,
        exposureRisk: 'high' as const,
        category: 'auth' as const,
        userMessage: 'Invalid email or password'
      },
      {
        code: 'AUTH_ACCOUNT_LOCKED',
        message: 'User account is locked',
        severity: 'medium' as const,
        exposureRisk: 'medium' as const,
        category: 'auth' as const,
        userMessage: 'Account temporarily locked due to multiple failed attempts'
      },
      {
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Authentication token has expired',
        severity: 'low' as const,
        exposureRisk: 'low' as const,
        category: 'auth' as const,
        userMessage: 'Session expired. Please log in again'
      },
      {
        code: 'VALIDATION_FAILED',
        message: 'Input validation failed',
        severity: 'low' as const,
        exposureRisk: 'low' as const,
        category: 'validation' as const,
        userMessage: 'Please check your input and try again'
      },
      {
        code: 'AUTHORIZATION_DENIED',
        message: 'Access denied - insufficient permissions',
        severity: 'medium' as const,
        exposureRisk: 'low' as const,
        category: 'authorization' as const,
        userMessage: 'Access denied'
      },
      {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Requested resource not found',
        severity: 'low' as const,
        exposureRisk: 'medium' as const,
        category: 'business' as const,
        userMessage: 'Resource not found'
      }
    ];

    for (const errorDef of errorDefinitions) {
      this.errorCodes.set(errorDef.code, errorDef);
    }
  }

  /**
   * Initialize honeypot patterns for attack detection
   */
  private initializeHoneypotPatterns(): void {
    const patterns = [
      'admin', 'administrator', 'root', 'test', 'guest',
      'wp-admin', 'phpMyAdmin', '.env', 'config.php',
      'robots.txt', 'sitemap.xml'
    ];

    for (const pattern of patterns) {
      this.honeypotPatterns.add(pattern.toLowerCase());
    }
  }

  /**
   * Categorize authentication errors
   */
  private categorizeAuthError(error: any): SecurityError {
    if (error.message?.includes('Invalid credentials')) {
      return this.errorCodes.get('AUTH_INVALID_CREDENTIALS')!;
    }

    if (error.message?.includes('User not found')) {
      return this.errorCodes.get('AUTH_USER_NOT_FOUND')!;
    }

    if (error.message?.includes('Account locked')) {
      return this.errorCodes.get('AUTH_ACCOUNT_LOCKED')!;
    }

    if (error.message?.includes('Token expired')) {
      return this.errorCodes.get('AUTH_TOKEN_EXPIRED')!;
    }

    // Default authentication error
    return {
      code: 'AUTH_ERROR',
      message: 'Authentication failed',
      severity: 'medium',
      exposureRisk: 'medium',
      category: 'auth',
      userMessage: 'Authentication failed',
      internalDetails: { originalError: this.sanitizeError(error) }
    };
  }

  /**
   * Categorize validation errors
   */
  private categorizeValidationError(error: any): SecurityError {
    return {
      code: 'VALIDATION_FAILED',
      message: 'Input validation failed',
      severity: 'low',
      exposureRisk: 'low',
      category: 'validation',
      userMessage: 'Please check your input and try again',
      internalDetails: {
        validationErrors: this.sanitizeValidationErrors(error)
      }
    };
  }

  /**
   * Categorize authorization errors
   */
  private categorizeAuthorizationError(error: any): SecurityError {
    return this.errorCodes.get('AUTHORIZATION_DENIED') || {
      code: 'AUTHORIZATION_DENIED',
      message: 'Access denied',
      severity: 'medium',
      exposureRisk: 'low',
      category: 'authorization',
      userMessage: 'Access denied',
      internalDetails: { originalError: this.sanitizeError(error) }
    };
  }

  /**
   * Generic authentication message to prevent user enumeration
   */
  private getGenericAuthMessage(errorCode: string): string {
    // Return same message for different auth errors to prevent enumeration
    const genericMessages = {
      'AUTH_INVALID_CREDENTIALS': 'Invalid email or password',
      'AUTH_USER_NOT_FOUND': 'Invalid email or password',
      'AUTH_ACCOUNT_LOCKED': 'Invalid email or password',
      'AUTH_TOKEN_EXPIRED': 'Session expired. Please log in again'
    };

    return genericMessages[errorCode as keyof typeof genericMessages] || 'Authentication failed';
  }

  /**
   * Apply uniform timing to prevent timing attacks
   */
  private async applyUniformTiming(operation: string, startTime: number): Promise<void> {
    if (!this.config.preventTimingAttacks) return;

    const elapsed = Date.now() - startTime;
    const targetTime = this.getTargetTime(operation);

    if (elapsed < targetTime) {
      await new Promise(resolve => setTimeout(resolve, targetTime - elapsed));
    }
  }

  private getTargetTime(operation: string): number {
    // Standard timing targets to prevent timing attacks
    const timingTargets = {
      'auth_error': 200, // 200ms for auth operations
      'validation_error': 50, // 50ms for validation
      'authorization_error': 100 // 100ms for authorization
    };

    return timingTargets[operation as keyof typeof timingTargets] || 100;
  }

  /**
   * Sanitize error details for logging
   */
  private sanitizeError(error: any): any {
    if (!error) return null;

    return {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
      code: error.code,
      // Remove stack trace in production unless explicitly enabled
      ...(this.config.logLevel === 'detailed' && {
        stack: this.sanitizeStackTrace(error.stack)
      })
    };
  }

  private sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack || !this.config.sanitizeStackTraces) return stack;

    // Remove absolute paths and sensitive information
    return stack
      .replace(/\/[^\s]*/g, '/[PATH]')
      .replace(/at\s+[^\s]+/g, 'at [FUNCTION]')
      .split('\n')
      .slice(0, 5) // Limit stack trace depth
      .join('\n');
  }

  private sanitizeInternalDetails(details: any): any {
    if (!details) return null;

    // Remove sensitive fields
    const sanitized = { ...details };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private sanitizeFieldNames(details: any): any {
    if (!details || typeof details !== 'object') return details;

    const sanitized: any = {};

    for (const [key, value] of Object.entries(details)) {
      // Sanitize field names that might reveal system structure
      const sanitizedKey = key.replace(/^(database|db|sql|mongo|redis)_?/i, 'field_');
      sanitized[sanitizedKey] = value;
    }

    return sanitized;
  }

  private maskSensitiveValues(message: string): string {
    // Mask patterns that might contain sensitive information
    return message
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '****-****-****-****') // Credit cards
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Email addresses
      .replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '***-**-****') // SSN-like patterns
      .replace(/\b[A-Fa-f0-9]{32}\b/g, '[HASH]') // MD5 hashes
      .replace(/\b[A-Fa-f0-9]{40}\b/g, '[HASH]') // SHA1 hashes
      .replace(/\b[A-Fa-f0-9]{64}\b/g, '[HASH]'); // SHA256 hashes
  }

  private sanitizeValidationErrors(error: any): any {
    if (error.errors && Array.isArray(error.errors)) {
      return error.errors.map((err: any) => ({
        field: err.path?.join?.('.') || err.field || 'unknown',
        message: this.maskSensitiveValues(err.message || 'Validation failed'),
        code: err.code
      }));
    }

    return this.sanitizeError(error);
  }

  private sanitizePayload(payload: string): string {
    // Truncate and sanitize potentially malicious payloads
    const maxLength = 200;
    const truncated = payload.length > maxLength ? payload.substring(0, maxLength) + '...' : payload;

    // Remove null bytes and other problematic characters
    return truncated
      .replace(/\x00/g, '\\x00')
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '[CTRL]');
  }

  private detectInjectionAttempt(error: any, context: ErrorContext): { type: string; payload: string } | null {
    const errorMessage = error.message || '';
    const requestPath = context.endpoint;

    // SQL injection patterns
    if (/sql|syntax|mysql|postgres|oracle|sqlite/i.test(errorMessage)) {
      return { type: 'sql_injection', payload: errorMessage };
    }

    // NoSQL injection patterns
    if (/mongodb|mongoose|collection/i.test(errorMessage)) {
      return { type: 'nosql_injection', payload: errorMessage };
    }

    // XSS patterns in validation errors
    if (/<script|javascript:|on\w+=/i.test(errorMessage)) {
      return { type: 'xss_attempt', payload: errorMessage };
    }

    // Path traversal patterns
    if (/\.\.\/|\.\.\\|%2e%2e/i.test(requestPath)) {
      return { type: 'path_traversal', payload: requestPath };
    }

    return null;
  }

  private detectAttackPattern(context: ErrorContext, securityError: SecurityError): Promise<boolean> {
    // Implement attack pattern detection logic
    // This would analyze request patterns, frequency, etc.
    return Promise.resolve(false);
  }

  private detectPrivilegeEscalation(rbacContext: any, context: ErrorContext): any | null {
    // Implement privilege escalation detection
    return null;
  }

  private detectSystemAttack(error: any, context: ErrorContext): boolean {
    // Detect potential system-level attacks
    return false;
  }

  private async trackFailedAttempt(context: ErrorContext): Promise<void> {
    const key = `failed_attempts:${context.ipAddress}`;
    const current = this.errorFrequency.get(key) || 0;
    this.errorFrequency.set(key, current + 1);

    // Clean up old entries periodically
    if (current === 0) {
      setTimeout(() => {
        this.errorFrequency.delete(key);
      }, 15 * 60 * 1000); // 15 minutes
    }
  }

  private async handlePotentialAttack(context: ErrorContext, securityError: SecurityError): Promise<void> {
    await logSecurityEvent('potential_attack_detected', 'high', {
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      endpoint: context.endpoint,
      errorCode: securityError.code,
      attackIndicators: ['pattern_match']
    });
  }

  private async handlePrivilegeEscalationAttempt(context: ErrorContext, rbacContext: any, escalationAttempt: any): Promise<void> {
    await logSecurityEvent('privilege_escalation_attempt', 'critical', {
      requestId: context.requestId,
      userId: rbacContext.userId,
      requestedResource: rbacContext.requestedResource,
      requestedAction: rbacContext.requestedAction,
      userRoles: rbacContext.userRoles,
      ipAddress: context.ipAddress
    });
  }

  private async handleSystemAttack(context: ErrorContext, error: any): Promise<void> {
    await logSecurityEvent('system_attack_detected', 'critical', {
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      endpoint: context.endpoint,
      errorType: error.constructor.name
    });
  }

  private async notifyAdministrators(error: any, context: ErrorContext, errorId: string): Promise<void> {
    // Implementation would send notifications to administrators
    console.error(`CRITICAL SYSTEM ERROR [${errorId}]:`, {
      error: error.message,
      context: {
        requestId: context.requestId,
        endpoint: context.endpoint,
        ipAddress: context.ipAddress
      }
    });
  }

  private isCriticalSystemError(error: any): boolean {
    const criticalPatterns = [
      'ECONNREFUSED', // Database connection failed
      'ENOMEM', // Out of memory
      'ENOSPC', // No space left on device
      'EMFILE', // Too many open files
    ];

    return criticalPatterns.some(pattern =>
      error.message?.includes(pattern) || error.code === pattern
    );
  }

  private mapErrorToStatusCode(securityError: SecurityError): number {
    const statusMap = {
      'AUTH_INVALID_CREDENTIALS': 401,
      'AUTH_USER_NOT_FOUND': 401,
      'AUTH_ACCOUNT_LOCKED': 423,
      'AUTH_TOKEN_EXPIRED': 401,
      'VALIDATION_FAILED': 400,
      'AUTHORIZATION_DENIED': 403,
      'RESOURCE_NOT_FOUND': 404,
      'SYSTEM_ERROR': 500
    };

    return statusMap[securityError.code as keyof typeof statusMap] || 500;
  }
}

// Export singleton instance
export const secureErrorHandler = new SecureErrorHandler();

/**
 * Middleware wrapper for secure error handling
 */
export function withSecureErrorHandling(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const context: ErrorContext = {
      requestId: crypto.randomUUID(),
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      endpoint: req.nextUrl.pathname,
      timestamp: new Date()
    };

    try {
      return await handler(req);
    } catch (error) {
      return await secureErrorHandler.handleSystemError(error, context);
    }
  };
}