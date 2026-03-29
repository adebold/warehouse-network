import validator from 'validator'
import DOMPurify from 'isomorphic-dompurify'

export interface SanitizationOptions {
  allowHTML?: boolean
  allowedTags?: string[]
  maxLength?: number
  trimWhitespace?: boolean
  escapeHTML?: boolean
  normalizeWhitespace?: boolean
}

export interface ValidationRule {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  customValidator?: (value: string) => boolean | string
}

export interface SanitizedInput {
  value: string
  isValid: boolean
  errors: string[]
  originalValue: string
  sanitized: boolean
}

/**
 * Comprehensive input sanitization function
 */
export function sanitizeInput(
  input: string,
  options: SanitizationOptions = {}
): string {
  if (typeof input !== 'string') {
    return ''
  }

  let sanitized = input

  // Trim whitespace if requested
  if (options.trimWhitespace !== false) {
    sanitized = sanitized.trim()
  }

  // Normalize whitespace
  if (options.normalizeWhitespace) {
    sanitized = sanitized.replace(/\s+/g, ' ')
  }

  // Apply length limit
  if (options.maxLength && sanitized.length > options.maxLength) {
    sanitized = sanitized.substring(0, options.maxLength)
  }

  // Handle HTML content
  if (options.allowHTML) {
    // Use DOMPurify to clean HTML
    const config = options.allowedTags
      ? { ALLOWED_TAGS: options.allowedTags }
      : {
          ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
          ALLOWED_ATTR: ['href', 'target', 'rel'],
        }

    sanitized = DOMPurify.sanitize(sanitized, config)
  } else if (options.escapeHTML !== false) {
    // Escape HTML entities
    sanitized = validator.escape(sanitized)
  }

  return sanitized
}

/**
 * Validate and sanitize input with comprehensive rules
 */
export function validateAndSanitize(
  input: string,
  rules: ValidationRule = {},
  options: SanitizationOptions = {}
): SanitizedInput {
  const originalValue = input
  const errors: string[] = []
  let sanitized = sanitizeInput(input, options)

  // Required validation
  if (rules.required && (!sanitized || sanitized.length === 0)) {
    errors.push('This field is required')
  }

  // Length validations
  if (rules.minLength && sanitized.length < rules.minLength) {
    errors.push(`Minimum length is ${rules.minLength} characters`)
  }

  if (rules.maxLength && sanitized.length > rules.maxLength) {
    errors.push(`Maximum length is ${rules.maxLength} characters`)
  }

  // Pattern validation
  if (rules.pattern && !rules.pattern.test(sanitized)) {
    errors.push('Invalid format')
  }

  // Custom validation
  if (rules.customValidator) {
    const customResult = rules.customValidator(sanitized)
    if (typeof customResult === 'string') {
      errors.push(customResult)
    } else if (!customResult) {
      errors.push('Invalid value')
    }
  }

  return {
    value: sanitized,
    isValid: errors.length === 0,
    errors,
    originalValue,
    sanitized: sanitized !== originalValue,
  }
}

/**
 * Sanitize email addresses
 */
export function sanitizeEmail(email: string): SanitizedInput {
  return validateAndSanitize(
    email,
    {
      required: true,
      maxLength: 254,
      customValidator: (value) => validator.isEmail(value) || 'Invalid email address',
    },
    { trimWhitespace: true, escapeHTML: true }
  )
}

/**
 * Sanitize passwords (no transformation, just validation)
 */
export function validatePassword(password: string): SanitizedInput {
  return validateAndSanitize(
    password,
    {
      required: true,
      minLength: 8,
      maxLength: 128,
      customValidator: (value) => {
        const hasUpperCase = /[A-Z]/.test(value)
        const hasLowerCase = /[a-z]/.test(value)
        const hasNumbers = /\d/.test(value)
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value)

        if (!hasUpperCase) return 'Password must contain at least one uppercase letter'
        if (!hasLowerCase) return 'Password must contain at least one lowercase letter'
        if (!hasNumbers) return 'Password must contain at least one number'
        if (!hasSpecialChar) return 'Password must contain at least one special character'

        return true
      },
    },
    { trimWhitespace: false, escapeHTML: false } // Don't modify passwords
  )
}

/**
 * Sanitize names (person names, organization names, etc.)
 */
export function sanitizeName(name: string): SanitizedInput {
  return validateAndSanitize(
    name,
    {
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9\s\-.']+$/,
    },
    { trimWhitespace: true, escapeHTML: true, normalizeWhitespace: true }
  )
}

/**
 * Sanitize slugs (URL-safe identifiers)
 */
export function sanitizeSlug(slug: string): SanitizedInput {
  let sanitized = slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s\-]/g, '') // Remove invalid characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove duplicate hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens

  return validateAndSanitize(
    sanitized,
    {
      required: true,
      minLength: 1,
      maxLength: 50,
      pattern: /^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/,
    },
    { trimWhitespace: false, escapeHTML: false }
  )
}

/**
 * Sanitize rich text content
 */
export function sanitizeRichText(html: string): SanitizedInput {
  return validateAndSanitize(
    html,
    {
      maxLength: 10000,
    },
    {
      allowHTML: true,
      allowedTags: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'a', 'blockquote', 'code', 'pre',
      ],
      trimWhitespace: true,
    }
  )
}

/**
 * Sanitize phone numbers
 */
export function sanitizePhoneNumber(phone: string): SanitizedInput {
  // Remove all non-digit characters except + for international format
  const cleaned = phone.replace(/[^\d+]/g, '')

  return validateAndSanitize(
    cleaned,
    {
      customValidator: (value) => {
        if (!value) return true // Optional field
        return validator.isMobilePhone(value, 'any', { strictMode: false }) ||
               'Invalid phone number format'
      },
    },
    { trimWhitespace: true, escapeHTML: true }
  )
}

/**
 * Sanitize URLs
 */
export function sanitizeURL(url: string): SanitizedInput {
  return validateAndSanitize(
    url,
    {
      customValidator: (value) => {
        if (!value) return true // Optional field
        return validator.isURL(value, {
          protocols: ['http', 'https'],
          require_protocol: true,
        }) || 'Invalid URL format'
      },
    },
    { trimWhitespace: true, escapeHTML: true }
  )
}

/**
 * Prevent SQL injection by escaping SQL special characters
 */
export function escapeSQLString(input: string): string {
  return input.replace(/[\0\x08\x09\x1a\n\r"'\\%]/g, (char) => {
    switch (char) {
      case '\0': return '\\0'
      case '\x08': return '\\b'
      case '\x09': return '\\t'
      case '\x1a': return '\\z'
      case '\n': return '\\n'
      case '\r': return '\\r'
      case '"':
      case "'":
      case '\\':
      case '%': return '\\' + char
      default: return char
    }
  })
}

/**
 * Prevent NoSQL injection
 */
export function sanitizeNoSQLInput(input: any): any {
  if (typeof input === 'string') {
    return sanitizeInput(input, { escapeHTML: true, trimWhitespace: true })
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(input)) {
      const sanitizedKey = sanitizeInput(key, { escapeHTML: true })
      sanitized[sanitizedKey] = sanitizeNoSQLInput(value)
    }
    return sanitized
  }

  return input
}

/**
 * Sanitize file names for safe storage
 */
export function sanitizeFileName(fileName: string): SanitizedInput {
  const extension = fileName.split('.').pop() || ''
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')

  const sanitizedName = nameWithoutExt
    .replace(/[^a-zA-Z0-9\-_.]/g, '') // Remove unsafe characters
    .replace(/\.+/g, '.') // Remove multiple dots
    .substring(0, 100) // Limit length

  const result = extension ? `${sanitizedName}.${extension}` : sanitizedName

  return validateAndSanitize(
    result,
    {
      required: true,
      minLength: 1,
      maxLength: 255,
      pattern: /^[a-zA-Z0-9\-_.]+$/,
      customValidator: (value) => {
        const dangerousExtensions = [
          'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar',
          'sh', 'php', 'asp', 'aspx', 'jsp', 'py', 'rb', 'pl'
        ]
        const ext = value.split('.').pop()?.toLowerCase()
        if (ext && dangerousExtensions.includes(ext)) {
          return 'File type not allowed'
        }
        return true
      },
    },
    { trimWhitespace: true, escapeHTML: false }
  )
}

/**
 * Comprehensive input sanitization for API endpoints
 */
export function sanitizeAPIInput(input: any): any {
  if (typeof input === 'string') {
    return sanitizeInput(input, {
      trimWhitespace: true,
      escapeHTML: true,
      maxLength: 10000,
      normalizeWhitespace: true,
    })
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeAPIInput)
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(input)) {
      if (typeof key === 'string') {
        const sanitizedKey = sanitizeInput(key, {
          trimWhitespace: true,
          escapeHTML: true,
          maxLength: 100,
        })
        sanitized[sanitizedKey] = sanitizeAPIInput(value)
      }
    }
    return sanitized
  }

  return input
}

/**
 * Rate limit-aware sanitization (more intensive for suspicious patterns)
 */
export function adaptiveSanitization(
  input: string,
  suspiciousScore: number = 0
): SanitizedInput {
  const intensiveOptions: SanitizationOptions = {
    trimWhitespace: true,
    escapeHTML: true,
    normalizeWhitespace: true,
    maxLength: suspiciousScore > 0.5 ? 1000 : 10000,
  }

  const rules: ValidationRule = {
    customValidator: (value) => {
      // More strict validation for suspicious inputs
      if (suspiciousScore > 0.7) {
        // Check for common attack patterns
        const attackPatterns = [
          /<script/i,
          /javascript:/i,
          /vbscript:/i,
          /onload=/i,
          /onerror=/i,
          /onclick=/i,
          /eval\(/i,
          /expression\(/i,
          /url\(/i,
          /import\(/i,
        ]

        for (const pattern of attackPatterns) {
          if (pattern.test(value)) {
            return 'Potentially malicious content detected'
          }
        }
      }

      return true
    },
  }

  return validateAndSanitize(input, rules, intensiveOptions)
}