// Input Validation and Sanitization Template
const joi = require('joi');
const validator = require('validator');
const DOMPurify = require('isomorphic-dompurify');
const { logger } = require('../../../../../../utils/logger');

/**
 * Common validation schemas
 */
const schemas = {
  // User registration/login
  email: joi.string().email().required().max(254),
  password: joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
  username: joi.string().alphanum().min(3).max(30).required(),
  
  // Common fields
  id: joi.string().uuid().required(),
  name: joi.string().trim().min(1).max(100).required(),
  description: joi.string().trim().max(500).allow(''),
  url: joi.string().uri().max(2048),
  phone: joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
  
  // Pagination
  page: joi.number().integer().min(1).default(1),
  limit: joi.number().integer().min(1).max(100).default(20),
  
  // Dates
  date: joi.date().iso(),
  dateRange: joi.object({
    from: joi.date().iso().required(),
    to: joi.date().iso().min(joi.ref('from')).required()
  }),

  // File upload
  file: joi.object({
    originalname: joi.string().required(),
    mimetype: joi.string().valid('image/jpeg', 'image/png', 'image/gif', 'application/pdf').required(),
    size: joi.number().max(5 * 1024 * 1024) // 5MB max
  })
};

/**
 * Input sanitization functions
 */
const sanitize = {
  /**
   * Sanitize HTML content
   */
  html: (input) => {
    if (typeof input !== 'string') return input;
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      ALLOWED_ATTR: ['href', 'target'],
      ALLOW_DATA_ATTR: false
    });
  },

  /**
   * Sanitize for SQL (escape special characters)
   */
  sql: (input) => {
    if (typeof input !== 'string') return input;
    return input.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
      switch (char) {
        case "\0": return "\\0";
        case "\x08": return "\\b";
        case "\x09": return "\\t";
        case "\x1a": return "\\z";
        case "\n": return "\\n";
        case "\r": return "\\r";
        case "\"":
        case "'":
        case "\\":
        case "%": return "\\" + char;
        default: return char;
      }
    });
  },

  /**
   * Remove all HTML tags
   */
  stripHtml: (input) => {
    if (typeof input !== 'string') return input;
    return input.replace(/<[^>]*>/g, '');
  },

  /**
   * Normalize whitespace
   */
  whitespace: (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/\s+/g, ' ');
  },

  /**
   * Remove dangerous characters for file paths
   */
  filename: (input) => {
    if (typeof input !== 'string') return input;
    return input.replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 255);
  },

  /**
   * Validate and sanitize email
   */
  email: (input) => {
    if (typeof input !== 'string') return null;
    const normalized = validator.normalizeEmail(input.toLowerCase().trim());
    return validator.isEmail(normalized) ? normalized : null;
  },

  /**
   * Sanitize URL
   */
  url: (input) => {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    return validator.isURL(trimmed, { require_protocol: true }) ? trimmed : null;
  }
};

/**
 * Validation middleware factory
 */
const validate = (schema, options = {}) => {
  return (req, res, next) => {
    const { location = 'body', allowUnknown = false, stripUnknown = true } = options;
    const data = req[location];

    const validationOptions = {
      abortEarly: false,
      allowUnknown,
      stripUnknown
    };

    const { error, value } = schema.validate(data, validationOptions);

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors
      });
    }

    // Replace original data with validated/sanitized data
    req[location] = value;
    next();
  };
};

/**
 * Sanitization middleware
 */
const sanitizeInput = (options = {}) => {
  return (req, res, next) => {
    const { htmlFields = [], stripHtmlFields = [] } = options;

    // Sanitize HTML fields
    htmlFields.forEach(field => {
      if (req.body[field]) {
        req.body[field] = sanitize.html(req.body[field]);
      }
    });

    // Strip HTML from specified fields
    stripHtmlFields.forEach(field => {
      if (req.body[field]) {
        req.body[field] = sanitize.stripHtml(req.body[field]);
      }
    });

    // Normalize whitespace for all string fields
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitize.whitespace(req.body[key]);
      }
    });

    next();
  };
};

/**
 * File upload validation middleware
 */
const validateFileUpload = (options = {}) => {
  const {
    allowedMimes = ['image/jpeg', 'image/png', 'image/gif'],
    maxSize = 5 * 1024 * 1024, // 5MB
    maxFiles = 1
  } = options;

  return (req, res, next) => {
    if (!req.files || req.files.length === 0) {
      return next();
    }

    if (req.files.length > maxFiles) {
      return res.status(400).json({
        error: `Too many files. Maximum ${maxFiles} allowed.`,
        code: 'TOO_MANY_FILES'
      });
    }

    for (const file of req.files) {
      // Check file size
      if (file.size > maxSize) {
        return res.status(400).json({
          error: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`,
          code: 'FILE_TOO_LARGE',
          filename: file.originalname
        });
      }

      // Check MIME type
      if (!allowedMimes.includes(file.mimetype)) {
        return res.status(400).json({
          error: `Invalid file type. Allowed types: ${allowedMimes.join(', ')}`,
          code: 'INVALID_FILE_TYPE',
          filename: file.originalname
        });
      }

      // Sanitize filename
      file.originalname = sanitize.filename(file.originalname);
    }

    next();
  };
};

/**
 * SQL injection detection middleware
 */
const detectSQLInjection = (req, res, next) => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(UNION\s+SELECT)/i,
    /(OR\s+1\s*=\s*1)/i,
    /(AND\s+1\s*=\s*1)/i,
    /('|\"|;|--|\|\|)/,
    /(xp_cmdshell|sp_executesql)/i
  ];

  const checkObject = (obj, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'string') {
        for (const pattern of sqlPatterns) {
          if (pattern.test(value)) {
            return {
              detected: true,
              field: currentPath,
              pattern: pattern.toString(),
              value: value.substring(0, 100) // Limit logged value
            };
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        const result = checkObject(value, currentPath);
        if (result.detected) return result;
      }
    }
    return { detected: false };
  };

  // Check request body, query, and params
  const locations = [
    { data: req.body, name: 'body' },
    { data: req.query, name: 'query' },
    { data: req.params, name: 'params' }
  ];

  for (const location of locations) {
    if (location.data) {
      const result = checkObject(location.data);
      if (result.detected) {
        // Log potential SQL injection attempt
        logger.warn('SQL Injection attempt detected:', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          location: location.name,
          field: result.field,
          pattern: result.pattern,
          timestamp: new Date().toISOString()
        });

        return res.status(400).json({
          error: 'Invalid input detected',
          code: 'SUSPICIOUS_INPUT'
        });
      }
    }
  }

  next();
};

/**
 * Rate limiting for specific endpoints
 */
const createRateLimit = (windowMs, max, message) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message || 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for trusted IPs (if configured)
      const trustedIPs = (process.env.TRUSTED_IPS || '').split(',').filter(Boolean);
      return trustedIPs.includes(req.ip);
    }
  });
};

module.exports = {
  schemas,
  sanitize,
  validate,
  sanitizeInput,
  validateFileUpload,
  detectSQLInjection,
  createRateLimit
};