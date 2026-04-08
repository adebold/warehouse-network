/**
 * Input Validation and Sanitization
 * Comprehensive validation using Zod schemas with security considerations
 */

import { z } from 'zod';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { SecurityConfig } from './config';

// Initialize DOMPurify for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * Common validation schemas
 */
export const ValidationSchemas = {
  // Email validation
  email: z
    .string()
    .email('Invalid email format')
    .min(1, 'Email is required')
    .max(320, 'Email too long')
    .refine(
      (email) => {
        // Check for suspicious patterns
        const suspiciousPatterns = [
          /\+.*\+/, // Multiple plus signs
          /\.{2,}/, // Multiple consecutive dots
          /@.*@/, // Multiple @ symbols
          /[<>]/, // HTML brackets
        ];
        return !suspiciousPatterns.some(pattern => pattern.test(email));
      },
      'Email contains invalid characters'
    ),

  // Password validation with strength requirements
  password: z
    .string()
    .min(SecurityConfig.auth.passwordMinLength, `Password must be at least ${SecurityConfig.auth.passwordMinLength} characters`)
    .max(128, 'Password too long')
    .refine(
      (password) => SecurityConfig.auth.passwordRequireUppercase ? /[A-Z]/.test(password) : true,
      'Password must contain at least one uppercase letter'
    )
    .refine(
      (password) => SecurityConfig.auth.passwordRequireLowercase ? /[a-z]/.test(password) : true,
      'Password must contain at least one lowercase letter'
    )
    .refine(
      (password) => SecurityConfig.auth.passwordRequireNumber ? /\d/.test(password) : true,
      'Password must contain at least one number'
    )
    .refine(
      (password) => SecurityConfig.auth.passwordRequireSpecialChar ? /[!@#$%^&*(),.?":{}|<>]/.test(password) : true,
      'Password must contain at least one special character'
    )
    .refine(
      (password) => {
        // Check for common weak passwords
        const weakPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
        return !weakPasswords.some(weak => password.toLowerCase().includes(weak));
      },
      'Password is too common or weak'
    ),

  // Name validation
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name too long')
    .refine(
      (name) => {
        // Allow only letters, spaces, apostrophes, and hyphens
        return /^[a-zA-Z\s'\-]+$/.test(name);
      },
      'Name contains invalid characters'
    )
    .transform(name => name.trim()),

  // Organization/Company name
  organizationName: z
    .string()
    .min(1, 'Organization name is required')
    .max(100, 'Organization name too long')
    .refine(
      (name) => {
        // Allow letters, numbers, spaces, and common business characters
        return /^[a-zA-Z0-9\s&.,'\-()]+$/.test(name);
      },
      'Organization name contains invalid characters'
    )
    .transform(name => name.trim()),

  // Slug validation
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(50, 'Slug too long')
    .refine(
      (slug) => {
        // Only lowercase letters, numbers, and hyphens
        return /^[a-z0-9\-]+$/.test(slug);
      },
      'Slug can only contain lowercase letters, numbers, and hyphens'
    )
    .refine(
      (slug) => !slug.startsWith('-') && !slug.endsWith('-'),
      'Slug cannot start or end with a hyphen'
    )
    .refine(
      (slug) => !/--/.test(slug),
      'Slug cannot contain consecutive hyphens'
    ),

  // URL validation
  url: z
    .string()
    .url('Invalid URL format')
    .max(2048, 'URL too long')
    .refine(
      (url) => {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      },
      'Only HTTP and HTTPS URLs are allowed'
    ),

  // Phone number validation
  phoneNumber: z
    .string()
    .min(10, 'Phone number too short')
    .max(20, 'Phone number too long')
    .refine(
      (phone) => {
        // Remove all non-digit characters and check length
        const digits = phone.replace(/\D/g, '');
        return digits.length >= 10 && digits.length <= 15;
      },
      'Invalid phone number format'
    )
    .transform(phone => phone.replace(/\D/g, '')),

  // Text content with HTML sanitization
  htmlContent: z
    .string()
    .max(SecurityConfig.validation.maxFieldLength, 'Content too long')
    .transform(content => {
      // Sanitize HTML content
      return purify.sanitize(content, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'p', 'br'],
        ALLOWED_ATTR: ['href', 'target'],
      });
    }),

  // Plain text with XSS protection
  plainText: z
    .string()
    .max(SecurityConfig.validation.maxFieldLength, 'Text too long')
    .transform(text => {
      // Remove HTML tags and decode entities
      return purify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }),

  // JSON data validation
  jsonData: z
    .string()
    .refine(
      (data) => {
        try {
          const parsed = JSON.parse(data);
          return typeof parsed === 'object' && parsed !== null;
        } catch {
          return false;
        }
      },
      'Invalid JSON format'
    )
    .transform(data => JSON.parse(data)),

  // File upload validation
  file: z.object({
    name: z.string().max(255, 'Filename too long'),
    type: z.string().refine(
      (type) => SecurityConfig.validation.allowedMimeTypes.includes(type),
      'File type not allowed'
    ),
    size: z.number().max(SecurityConfig.validation.maxFileSize, 'File too large'),
  }),

  // Array validation with size limits
  array: <T>(schema: z.ZodType<T>) =>
    z.array(schema).max(SecurityConfig.validation.maxArrayLength, 'Array too large'),

  // IP address validation
  ipAddress: z
    .string()
    .refine(
      (ip) => {
        // IPv4 validation
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipv4Regex.test(ip)) {
          return ip.split('.').every(octet => parseInt(octet) <= 255);
        }
        // IPv6 basic validation
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv6Regex.test(ip);
      },
      'Invalid IP address format'
    ),

  // CSRF token validation
  csrfToken: z
    .string()
    .min(1, 'CSRF token is required')
    .max(512, 'CSRF token too long')
    .refine(
      (token) => {
        // Base64url format validation
        return /^[A-Za-z0-9_\-]+$/.test(token);
      },
      'Invalid CSRF token format'
    ),

  // 2FA token validation
  twoFactorToken: z
    .string()
    .length(6, '2FA code must be 6 digits')
    .refine(
      (token) => /^\d{6}$/.test(token),
      '2FA code must contain only digits'
    ),

  // Backup code validation
  backupCode: z
    .string()
    .min(6, 'Backup code too short')
    .max(20, 'Backup code too long')
    .refine(
      (code) => /^[A-Z0-9]+$/.test(code.replace(/\s/g, '')),
      'Invalid backup code format'
    )
    .transform(code => code.replace(/\s/g, '').toUpperCase()),
};

/**
 * Request validation middleware
 */
export interface ValidationOptions {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
  headers?: z.ZodSchema;
  sanitize?: boolean;
}

export function validateRequest(options: ValidationOptions) {
  return async (req: any, res: any, next: any) => {
    try {
      const errors: Record<string, string[]> = {};

      // Validate request body
      if (options.body && req.body) {
        try {
          req.body = options.body.parse(req.body);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.body = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          }
        }
      }

      // Validate query parameters
      if (options.query && req.query) {
        try {
          req.query = options.query.parse(req.query);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.query = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          }
        }
      }

      // Validate route parameters
      if (options.params && req.params) {
        try {
          req.params = options.params.parse(req.params);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.params = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          }
        }
      }

      // Validate headers
      if (options.headers && req.headers) {
        try {
          req.headers = { ...req.headers, ...options.headers.parse(req.headers) };
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.headers = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          }
        }
      }

      // Return validation errors
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Request validation failed',
          errors,
        });
      }

      // Additional sanitization
      if (options.sanitize) {
        sanitizeRequest(req);
      }

      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Validation process failed',
      });
    }
  };
}

/**
 * Sanitize request data
 */
function sanitizeRequest(req: any): void {
  const sensitiveFields = SecurityConfig.monitoring.sensitiveFields;

  const sanitizeObject = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Mask sensitive fields
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Recursively sanitize nested objects
      if (value && typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else if (typeof value === 'string') {
        // Basic string sanitization
        sanitized[key] = value.trim();
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  };

  // Sanitize request parts
  if (req.body) req.sanitizedBody = sanitizeObject(req.body);
  if (req.query) req.sanitizedQuery = sanitizeObject(req.query);
  if (req.params) req.sanitizedParams = sanitizeObject(req.params);
}

/**
 * Utility functions
 */
export const ValidationUtils = {
  /**
   * Check if string contains SQL injection patterns
   */
  hasSQLInjection: (input: string): boolean => {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
      /['";\\-]|\/\*|\*\//gi,
      /(OR\s+\d+\s*=\s*\d+)|(AND\s+\d+\s*=\s*\d+)/gi,
    ];
    return sqlPatterns.some(pattern => pattern.test(input));
  },

  /**
   * Check if string contains XSS patterns
   */
  hasXSS: (input: string): boolean => {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*>/gi,
    ];
    return xssPatterns.some(pattern => pattern.test(input));
  },

  /**
   * Sanitize filename for safe storage
   */
  sanitizeFilename: (filename: string): string => {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .substring(0, 255);
  },

  /**
   * Validate and normalize URL
   */
  normalizeURL: (url: string): string | null => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  },
};