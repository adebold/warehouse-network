/**
 * API Input Validation Middleware
 * Comprehensive validation and sanitization for API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ValidationSchemas, ValidationUtils } from './input-validation';
import { SecurityConfig } from './config';
import { logSecurityEvent } from './monitoring';
import { getClientIP } from './rate-limiter';

export interface ValidationConfig {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
  headers?: z.ZodSchema;
  maxBodySize?: number;
  allowedMethods?: string[];
  requireAuth?: boolean;
  requireCsrf?: boolean;
  sanitizeInput?: boolean;
  logValidationErrors?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  path: (string | number)[];
}

export interface ValidationResult {
  success: boolean;
  data?: any;
  errors?: ValidationError[];
  sanitizedData?: any;
}

/**
 * Create API validation middleware
 */
export function createAPIValidation(config: ValidationConfig) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const clientIP = getClientIP(request);
    const method = request.method;
    const pathname = request.nextUrl.pathname;

    try {
      // 1. Method validation
      if (config.allowedMethods && !config.allowedMethods.includes(method)) {
        await logSecurityEvent('invalid_method', 'low', {
          ipAddress: clientIP,
          resource: pathname,
          method,
          allowedMethods: config.allowedMethods,
        });

        return NextResponse.json(
          {
            error: 'Method Not Allowed',
            message: `Method ${method} is not allowed for this endpoint`,
          },
          { status: 405 }
        );
      }

      // 2. Content-Length validation
      const contentLength = request.headers.get('content-length');
      const maxSize = config.maxBodySize || SecurityConfig.validation.maxRequestSize;

      if (contentLength && parseInt(contentLength) > maxSize) {
        await logSecurityEvent('request_too_large', 'medium', {
          ipAddress: clientIP,
          resource: pathname,
          contentLength: parseInt(contentLength),
          maxSize,
        });

        return NextResponse.json(
          {
            error: 'Request Too Large',
            message: 'Request body exceeds maximum allowed size',
          },
          { status: 413 }
        );
      }

      // 3. Content-Type validation for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const contentType = request.headers.get('content-type');

        if (contentType && !contentType.includes('application/json')) {
          await logSecurityEvent('invalid_content_type', 'low', {
            ipAddress: clientIP,
            resource: pathname,
            contentType,
          });

          return NextResponse.json(
            {
              error: 'Invalid Content Type',
              message: 'Content-Type must be application/json',
            },
            { status: 415 }
          );
        }
      }

      // 4. Parse and validate request data
      let body: any = null;
      let query: any = null;
      let params: any = null;

      // Parse body for methods that typically have one
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        try {
          const text = await request.text();
          if (text) {
            body = JSON.parse(text);
          }
        } catch (error) {
          await logSecurityEvent('invalid_json', 'medium', {
            ipAddress: clientIP,
            resource: pathname,
            error: error instanceof Error ? error.message : 'Invalid JSON',
          });

          return NextResponse.json(
            {
              error: 'Invalid JSON',
              message: 'Request body contains invalid JSON',
            },
            { status: 400 }
          );
        }
      }

      // Parse query parameters
      const url = new URL(request.url);
      query = Object.fromEntries(url.searchParams.entries());

      // Parse path parameters (would need to be passed in config or extracted from route)
      // For now, we'll skip this as Next.js handles it differently

      // 5. Security validation before schema validation
      const securityValidation = await performSecurityValidation(
        { body, query },
        clientIP,
        pathname
      );

      if (!securityValidation.success) {
        return NextResponse.json(
          {
            error: 'Security Validation Failed',
            message: securityValidation.message,
          },
          { status: 400 }
        );
      }

      // 6. Schema validation
      const validationResult = await validateWithSchemas(
        { body, query, params },
        config
      );

      if (!validationResult.success) {
        if (config.logValidationErrors) {
          await logSecurityEvent('validation_error', 'low', {
            ipAddress: clientIP,
            resource: pathname,
            errors: validationResult.errors,
          });
        }

        return NextResponse.json(
          {
            error: 'Validation Error',
            message: 'Request validation failed',
            errors: validationResult.errors,
          },
          { status: 400 }
        );
      }

      // 7. Sanitize input if requested
      if (config.sanitizeInput) {
        validationResult.sanitizedData = sanitizeRequestData(validationResult.data);
      }

      // Validation passed - middleware should continue
      return null;
    } catch (error) {
      console.error('API validation error:', error);

      await logSecurityEvent('validation_middleware_error', 'high', {
        ipAddress: clientIP,
        resource: pathname,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Validation service temporarily unavailable',
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Perform security validation checks
 */
async function performSecurityValidation(
  data: { body?: any; query?: any },
  clientIP: string,
  pathname: string
): Promise<{ success: boolean; message?: string }> {
  // Check for SQL injection patterns
  const checkSqlInjection = (input: any): boolean => {
    if (typeof input === 'string') {
      return ValidationUtils.hasSQLInjection(input);
    }
    if (typeof input === 'object' && input !== null) {
      return Object.values(input).some(value => checkSqlInjection(value));
    }
    return false;
  };

  // Check for XSS patterns
  const checkXSS = (input: any): boolean => {
    if (typeof input === 'string') {
      return ValidationUtils.hasXSS(input);
    }
    if (typeof input === 'object' && input !== null) {
      return Object.values(input).some(value => checkXSS(value));
    }
    return false;
  };

  // SQL injection check
  if (checkSqlInjection(data.body) || checkSqlInjection(data.query)) {
    await logSecurityEvent('sql_injection_attempt', 'critical', {
      ipAddress: clientIP,
      resource: pathname,
      details: { body: data.body, query: data.query },
    });

    return {
      success: false,
      message: 'Request contains potentially malicious content',
    };
  }

  // XSS check
  if (checkXSS(data.body) || checkXSS(data.query)) {
    await logSecurityEvent('xss_attempt', 'high', {
      ipAddress: clientIP,
      resource: pathname,
      details: { body: data.body, query: data.query },
    });

    return {
      success: false,
      message: 'Request contains potentially malicious content',
    };
  }

  // Check for excessively large arrays or objects
  const checkSize = (input: any, depth = 0): boolean => {
    if (depth > 10) return true; // Too deep nesting

    if (Array.isArray(input)) {
      return input.length > SecurityConfig.validation.maxArrayLength ||
             input.some(item => checkSize(item, depth + 1));
    }

    if (typeof input === 'object' && input !== null) {
      const keys = Object.keys(input);
      return keys.length > 100 || // Too many properties
             keys.some(key => key.length > 100) || // Property name too long
             Object.values(input).some(value => checkSize(value, depth + 1));
    }

    if (typeof input === 'string') {
      return input.length > SecurityConfig.validation.maxFieldLength;
    }

    return false;
  };

  if (checkSize(data.body) || checkSize(data.query)) {
    await logSecurityEvent('oversized_request', 'medium', {
      ipAddress: clientIP,
      resource: pathname,
    });

    return {
      success: false,
      message: 'Request data exceeds size limits',
    };
  }

  return { success: true };
}

/**
 * Validate request data against schemas
 */
async function validateWithSchemas(
  data: { body?: any; query?: any; params?: any },
  config: ValidationConfig
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const validatedData: any = {};

  // Validate body
  if (config.body && data.body !== null) {
    try {
      validatedData.body = config.body.parse(data.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(
          ...error.errors.map(e => ({
            field: 'body',
            message: e.message,
            code: e.code,
            path: ['body', ...e.path],
          }))
        );
      }
    }
  }

  // Validate query
  if (config.query && data.query) {
    try {
      validatedData.query = config.query.parse(data.query);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(
          ...error.errors.map(e => ({
            field: 'query',
            message: e.message,
            code: e.code,
            path: ['query', ...e.path],
          }))
        );
      }
    }
  }

  // Validate params
  if (config.params && data.params) {
    try {
      validatedData.params = config.params.parse(data.params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(
          ...error.errors.map(e => ({
            field: 'params',
            message: e.message,
            code: e.code,
            path: ['params', ...e.path],
          }))
        );
      }
    }
  }

  return {
    success: errors.length === 0,
    data: validatedData,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Sanitize request data
 */
function sanitizeRequestData(data: any): any {
  if (typeof data === 'string') {
    // Remove potentially dangerous characters
    return data
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeRequestData(item));
  }

  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Sanitize object keys
      const sanitizedKey = key.replace(/[<>]/g, '').trim();
      if (sanitizedKey && sanitizedKey.length < 100) {
        sanitized[sanitizedKey] = sanitizeRequestData(value);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Common validation schemas for API endpoints
 */
export const CommonValidationSchemas = {
  // Pagination
  pagination: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val) || 10, 100) : 10),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional().default('asc'),
  }),

  // ID parameters
  id: z.object({
    id: z.string().uuid('Invalid ID format'),
  }),

  // Search query
  search: z.object({
    q: z.string().min(1).max(100).optional(),
    filters: z.string().optional(),
  }),

  // Date range
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),

  // File upload
  fileUpload: z.object({
    file: z.object({
      name: z.string().max(255),
      size: z.number().max(SecurityConfig.validation.maxFileSize),
      type: z.string().refine(
        type => SecurityConfig.validation.allowedMimeTypes.includes(type),
        'File type not allowed'
      ),
    }),
  }),
};

/**
 * Helper function to create validation middleware with common patterns
 */
export const createValidation = {
  // GET endpoint with pagination
  paginated: (additionalQuery?: z.ZodSchema) =>
    createAPIValidation({
      query: additionalQuery
        ? CommonValidationSchemas.pagination.merge(additionalQuery)
        : CommonValidationSchemas.pagination,
      allowedMethods: ['GET'],
      sanitizeInput: true,
    }),

  // POST endpoint with body validation
  create: (bodySchema: z.ZodSchema) =>
    createAPIValidation({
      body: bodySchema,
      allowedMethods: ['POST'],
      requireCsrf: true,
      sanitizeInput: true,
      logValidationErrors: true,
    }),

  // PUT/PATCH endpoint with ID and body
  update: (bodySchema: z.ZodSchema) =>
    createAPIValidation({
      body: bodySchema,
      params: CommonValidationSchemas.id,
      allowedMethods: ['PUT', 'PATCH'],
      requireCsrf: true,
      sanitizeInput: true,
      logValidationErrors: true,
    }),

  // DELETE endpoint with ID
  delete: () =>
    createAPIValidation({
      params: CommonValidationSchemas.id,
      allowedMethods: ['DELETE'],
      requireCsrf: true,
    }),

  // Search endpoint
  search: (additionalQuery?: z.ZodSchema) =>
    createAPIValidation({
      query: additionalQuery
        ? CommonValidationSchemas.search.merge(additionalQuery)
        : CommonValidationSchemas.search,
      allowedMethods: ['GET'],
      sanitizeInput: true,
    }),
};