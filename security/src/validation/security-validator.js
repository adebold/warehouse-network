/**
 * Enterprise security validation system
 * Implements comprehensive security checks and compliance validation
 */

import crypto from 'crypto';
import Joi from 'joi';
import { AuditLogger } from '../audit/audit-logger.js';

export class SecurityValidator {
  constructor(options = {}) {
    this.auditLogger = new AuditLogger();

    this.config = {
      passwordComplexity: {
        minLength: options.minPasswordLength || 12,
        maxLength: options.maxPasswordLength || 128,
        requireUppercase: options.requireUppercase !== false,
        requireLowercase: options.requireLowercase !== false,
        requireNumbers: options.requireNumbers !== false,
        requireSymbols: options.requireSymbols !== false,
        maxRepeatingChars: options.maxRepeatingChars || 3,
        minEntropy: options.minEntropy || 50,
        forbiddenPatterns: options.forbiddenPatterns || [
          'password', 'admin', 'user', 'test', '123456', 'qwerty'
        ]
      },

      complianceStandards: {
        nist: options.nistCompliance !== false,
        iso27001: options.iso27001Compliance !== false,
        soc2: options.soc2Compliance !== false,
        gdpr: options.gdprCompliance !== false,
        pciDss: options.pciDssCompliance !== false
      },

      encryptionStandards: {
        minKeyLength: 256,
        approvedAlgorithms: ['aes-256-gcm', 'chacha20-poly1305'],
        minHashIterations: 100000,
        approvedHashFunctions: ['sha256', 'sha384', 'sha512'],
        requireSalt: true,
        minSaltLength: 32
      },

      securityThresholds: {
        maxFailedAttempts: 5,
        lockoutDuration: 300000, // 5 minutes
        sessionTimeout: 3600000, // 1 hour
        maxConcurrentSessions: 5,
        ipRateLimitPerMinute: 100
      },

      ...options
    };

    this.initializeValidationRules();
    this.securityMetrics = new Map();
    this.validationCache = new Map();
    this.threatPatterns = this.initializeThreatPatterns();
  }

  /**
   * Validate password strength and complexity
   * @param {string} password - Password to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validatePasswordStrength(password, options = {}) {
    const sessionId = crypto.randomUUID();

    try {
      await this.auditLogger.logValidationOperation('password_strength_check', sessionId, {
        passwordLength: password.length,
        hasOptions: Object.keys(options).length > 0
      });

      const validation = {
        isValid: true,
        strength: 0,
        errors: [],
        warnings: [],
        complexity: {},
        entropy: 0,
        compliance: {}
      };

      // Basic length validation
      if (password.length < this.config.passwordComplexity.minLength) {
        validation.errors.push(`Password must be at least ${this.config.passwordComplexity.minLength} characters`);
        validation.isValid = false;
      }

      if (password.length > this.config.passwordComplexity.maxLength) {
        validation.errors.push(`Password must not exceed ${this.config.passwordComplexity.maxLength} characters`);
        validation.isValid = false;
      }

      // Character complexity validation
      validation.complexity = this.analyzePasswordComplexity(password);

      if (this.config.passwordComplexity.requireUppercase && !validation.complexity.hasUppercase) {
        validation.errors.push('Password must contain at least one uppercase letter');
        validation.isValid = false;
      }

      if (this.config.passwordComplexity.requireLowercase && !validation.complexity.hasLowercase) {
        validation.errors.push('Password must contain at least one lowercase letter');
        validation.isValid = false;
      }

      if (this.config.passwordComplexity.requireNumbers && !validation.complexity.hasNumbers) {
        validation.errors.push('Password must contain at least one number');
        validation.isValid = false;
      }

      if (this.config.passwordComplexity.requireSymbols && !validation.complexity.hasSymbols) {
        validation.errors.push('Password must contain at least one special character');
        validation.isValid = false;
      }

      // Repeating characters check
      const repeatingChars = this.checkRepeatingCharacters(password);
      if (repeatingChars > this.config.passwordComplexity.maxRepeatingChars) {
        validation.warnings.push(`Password contains ${repeatingChars} repeating characters`);
        validation.strength -= 0.5;
      }

      // Forbidden patterns check
      const forbiddenPattern = this.checkForbiddenPatterns(password);
      if (forbiddenPattern) {
        validation.errors.push(`Password contains forbidden pattern: ${forbiddenPattern}`);
        validation.isValid = false;
      }

      // Common password check
      const isCommon = await this.checkCommonPassword(password);
      if (isCommon) {
        validation.errors.push('Password is too common and easily guessable');
        validation.isValid = false;
      }

      // Entropy calculation
      validation.entropy = this.calculatePasswordEntropy(password);
      if (validation.entropy < this.config.passwordComplexity.minEntropy) {
        validation.warnings.push(`Password entropy (${validation.entropy.toFixed(1)} bits) is below recommended minimum (${this.config.passwordComplexity.minEntropy} bits)`);
        validation.strength -= 1;
      }

      // Calculate overall strength score
      validation.strength = this.calculatePasswordStrength(password, validation.complexity, validation.entropy);

      // Compliance checks
      validation.compliance = await this.checkPasswordCompliance(password, validation);

      await this.auditLogger.logValidationOperation('password_strength_success', sessionId, {
        isValid: validation.isValid,
        strength: validation.strength,
        entropy: validation.entropy,
        errorCount: validation.errors.length
      });

      return validation;

    } catch (error) {
      await this.auditLogger.logValidationOperation('password_strength_error', sessionId, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate encryption configuration
   * @param {Object} encryptionConfig - Encryption configuration to validate
   * @returns {Object} Validation result
   */
  async validateEncryptionConfig(encryptionConfig) {
    const sessionId = crypto.randomUUID();

    try {
      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        compliance: {},
        recommendations: []
      };

      // Algorithm validation
      if (!this.config.encryptionStandards.approvedAlgorithms.includes(encryptionConfig.algorithm)) {
        validation.errors.push(`Unsupported encryption algorithm: ${encryptionConfig.algorithm}`);
        validation.isValid = false;
      }

      // Key length validation
      const keyLength = encryptionConfig.keyLength || this.extractKeyLengthFromAlgorithm(encryptionConfig.algorithm);
      if (keyLength < this.config.encryptionStandards.minKeyLength) {
        validation.errors.push(`Key length ${keyLength} is below minimum required ${this.config.encryptionStandards.minKeyLength}`);
        validation.isValid = false;
      }

      // IV/Nonce validation
      if (encryptionConfig.algorithm.includes('gcm') || encryptionConfig.algorithm.includes('poly1305')) {
        if (!encryptionConfig.iv && !encryptionConfig.nonce) {
          validation.errors.push('Initialization vector or nonce is required for authenticated encryption');
          validation.isValid = false;
        }
      }

      // Key derivation validation
      if (encryptionConfig.keyDerivation) {
        const kdValidation = await this.validateKeyDerivation(encryptionConfig.keyDerivation);
        if (!kdValidation.isValid) {
          validation.errors.push(...kdValidation.errors);
          validation.isValid = false;
        }
      }

      // Compliance validation
      validation.compliance = await this.validateEncryptionCompliance(encryptionConfig);

      await this.auditLogger.logValidationOperation('encryption_config_validation', sessionId, {
        algorithm: encryptionConfig.algorithm,
        isValid: validation.isValid,
        errorCount: validation.errors.length
      });

      return validation;

    } catch (error) {
      await this.auditLogger.logValidationOperation('encryption_validation_error', sessionId, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate secret security (check for potential exposure risks)
   * @param {string} secretValue - Secret value to validate
   * @returns {Object} Validation result
   */
  async validateSecretSecurity(secretValue) {
    const sessionId = crypto.randomUUID();

    try {
      const validation = {
        isSecure: true,
        riskLevel: 'low',
        issues: [],
        recommendations: []
      };

      // Check for common patterns that might indicate exposure
      const exposureRisks = [
        { pattern: /^[a-z0-9]{32}$/, risk: 'Possible MD5 hash', level: 'low' },
        { pattern: /^[a-z0-9]{40}$/, risk: 'Possible SHA1 hash', level: 'low' },
        { pattern: /^[a-z0-9]{64}$/, risk: 'Possible SHA256 hash', level: 'low' },
        { pattern: /^sk_test_[a-zA-Z0-9]+/, risk: 'Stripe test key detected', level: 'medium' },
        { pattern: /^sk_live_[a-zA-Z0-9]+/, risk: 'Stripe live key detected', level: 'high' },
        { pattern: /^xoxb-[a-zA-Z0-9-]+/, risk: 'Slack bot token detected', level: 'high' },
        { pattern: /ghp_[a-zA-Z0-9]{36}/, risk: 'GitHub personal access token', level: 'high' },
        { pattern: /^AKIA[0-9A-Z]{16}/, risk: 'AWS access key ID', level: 'critical' }
      ];

      for (const risk of exposureRisks) {
        if (risk.pattern.test(secretValue)) {
          validation.issues.push(risk.risk);
          validation.riskLevel = this.escalateRiskLevel(validation.riskLevel, risk.level);

          if (risk.level === 'high' || risk.level === 'critical') {
            validation.isSecure = false;
          }
        }
      }

      // Check for suspicious patterns
      const suspiciousPatterns = await this.detectSuspiciousPatterns(secretValue);
      if (suspiciousPatterns.length > 0) {
        validation.issues.push(...suspiciousPatterns);
        validation.riskLevel = this.escalateRiskLevel(validation.riskLevel, 'medium');
      }

      // Entropy validation for secrets
      const entropy = this.calculateSecretEntropy(secretValue);
      if (entropy < 40) { // Minimum entropy for secrets
        validation.issues.push('Secret has low entropy and may be predictable');
        validation.riskLevel = this.escalateRiskLevel(validation.riskLevel, 'medium');
      }

      // Check for embedded credentials or keys
      const embeddedCredentials = this.detectEmbeddedCredentials(secretValue);
      if (embeddedCredentials.length > 0) {
        validation.issues.push('Secret contains embedded credentials or keys');
        validation.isSecure = false;
        validation.riskLevel = 'critical';
      }

      // Generate recommendations
      validation.recommendations = this.generateSecurityRecommendations(validation);

      await this.auditLogger.logValidationOperation('secret_security_validation', sessionId, {
        isSecure: validation.isSecure,
        riskLevel: validation.riskLevel,
        issueCount: validation.issues.length,
        entropy
      });

      return validation;

    } catch (error) {
      await this.auditLogger.logValidationOperation('secret_validation_error', sessionId, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate system health for security operations
   * @returns {Object} Health validation result
   */
  async validateSystemHealth() {
    const sessionId = crypto.randomUUID();

    try {
      const health = {
        isHealthy: true,
        checks: {},
        warnings: [],
        errors: []
      };

      // Memory usage check
      const memoryUsage = process.memoryUsage();
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      health.checks.memory = {
        status: memoryUsagePercent < 90 ? 'healthy' : 'warning',
        usage: memoryUsagePercent,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal
      };

      if (memoryUsagePercent > 90) {
        health.warnings.push('High memory usage detected');
      }

      // CPU load check (basic)
      health.checks.cpu = {
        status: 'healthy',
        loadAverage: process.loadavg ? process.loadavg() : [0, 0, 0]
      };

      // File system check
      try {
        const tmpFile = `/tmp/security-health-${Date.now()}`;
        await require('fs').promises.writeFile(tmpFile, 'test');
        await require('fs').promises.unlink(tmpFile);

        health.checks.filesystem = {
          status: 'healthy',
          writable: true
        };
      } catch (error) {
        health.checks.filesystem = {
          status: 'error',
          writable: false,
          error: error.message
        };
        health.errors.push('File system write test failed');
        health.isHealthy = false;
      }

      // Network connectivity check
      health.checks.network = await this.checkNetworkConnectivity();

      // Dependency health checks
      health.checks.dependencies = await this.checkDependencyHealth();

      await this.auditLogger.logValidationOperation('system_health_check', sessionId, {
        isHealthy: health.isHealthy,
        memoryUsage: memoryUsagePercent,
        warningCount: health.warnings.length,
        errorCount: health.errors.length
      });

      return health;

    } catch (error) {
      await this.auditLogger.logValidationOperation('system_health_error', sessionId, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate credential access permissions
   */
  async validateCredentialAccess(credentialId, userId = null) {
    const sessionId = crypto.randomUUID();

    try {
      const validation = {
        hasAccess: false,
        permissions: [],
        restrictions: [],
        riskFactors: []
      };

      // Check if credential exists and is accessible
      // This would integrate with your credential storage system
      validation.hasAccess = true; // Placeholder

      // Check user permissions
      if (userId) {
        validation.permissions = await this.getUserPermissions(userId, credentialId);
        validation.hasAccess = validation.permissions.includes('read') || validation.permissions.includes('admin');
      }

      // Check for access restrictions
      validation.restrictions = await this.getAccessRestrictions(credentialId);

      // Analyze risk factors
      validation.riskFactors = await this.analyzeAccessRiskFactors(credentialId, userId);

      await this.auditLogger.logValidationOperation('credential_access_validation', sessionId, {
        credentialId,
        userId,
        hasAccess: validation.hasAccess,
        permissionCount: validation.permissions.length,
        riskFactorCount: validation.riskFactors.length
      });

      return validation;

    } catch (error) {
      await this.auditLogger.logValidationOperation('access_validation_error', sessionId, {
        error: error.message,
        credentialId
      });
      throw error;
    }
  }

  /**
   * Validate maintenance window timing
   */
  async validateMaintenanceWindow(maintenanceWindows) {
    const sessionId = crypto.randomUUID();

    try {
      const currentTime = new Date();
      const validation = {
        inMaintenanceWindow: false,
        nextWindow: null,
        windowDetails: null
      };

      for (const window of maintenanceWindows) {
        const windowStart = new Date(window.start);
        const windowEnd = new Date(window.end);

        if (currentTime >= windowStart && currentTime <= windowEnd) {
          validation.inMaintenanceWindow = true;
          validation.windowDetails = window;
          break;
        } else if (windowStart > currentTime) {
          if (!validation.nextWindow || windowStart < new Date(validation.nextWindow.start)) {
            validation.nextWindow = window;
          }
        }
      }

      if (validation.inMaintenanceWindow) {
        throw new Error('Operations not allowed during maintenance window');
      }

      await this.auditLogger.logValidationOperation('maintenance_window_check', sessionId, {
        inMaintenanceWindow: validation.inMaintenanceWindow,
        hasNextWindow: validation.nextWindow !== null
      });

      return validation;

    } catch (error) {
      await this.auditLogger.logValidationOperation('maintenance_validation_error', sessionId, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  analyzePasswordComplexity(password) {
    return {
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSymbols: /[^A-Za-z0-9]/.test(password),
      uniqueChars: new Set(password).size,
      characterTypes: this.countCharacterTypes(password)
    };
  }

  countCharacterTypes(password) {
    let types = 0;
    if (/[a-z]/.test(password)) types++;
    if (/[A-Z]/.test(password)) types++;
    if (/\d/.test(password)) types++;
    if (/[^A-Za-z0-9]/.test(password)) types++;
    return types;
  }

  checkRepeatingCharacters(password) {
    let maxRepeating = 0;
    let currentRepeating = 1;

    for (let i = 1; i < password.length; i++) {
      if (password[i] === password[i - 1]) {
        currentRepeating++;
      } else {
        maxRepeating = Math.max(maxRepeating, currentRepeating);
        currentRepeating = 1;
      }
    }

    return Math.max(maxRepeating, currentRepeating);
  }

  checkForbiddenPatterns(password) {
    const lowerPassword = password.toLowerCase();

    for (const pattern of this.config.passwordComplexity.forbiddenPatterns) {
      if (lowerPassword.includes(pattern.toLowerCase())) {
        return pattern;
      }
    }

    return null;
  }

  async checkCommonPassword(password) {
    // This would check against a database of common passwords
    // For now, we'll check against a small set of common patterns
    const commonPatterns = [
      /^password\d*$/i,
      /^admin\d*$/i,
      /^user\d*$/i,
      /^test\d*$/i,
      /^123456\d*$/,
      /^qwerty\d*$/i,
      /^letmein\d*$/i
    ];

    return commonPatterns.some(pattern => pattern.test(password));
  }

  calculatePasswordEntropy(password) {
    const charsetSize = this.estimateCharsetSize(password);
    return password.length * Math.log2(charsetSize);
  }

  calculateSecretEntropy(secret) {
    // For secrets, we calculate based on actual character distribution
    const charFreq = new Map();
    for (const char of secret) {
      charFreq.set(char, (charFreq.get(char) || 0) + 1);
    }

    let entropy = 0;
    const length = secret.length;

    for (const freq of charFreq.values()) {
      const probability = freq / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy * length;
  }

  estimateCharsetSize(password) {
    let charsetSize = 0;

    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/\d/.test(password)) charsetSize += 10;
    if (/[^A-Za-z0-9]/.test(password)) {
      // Count unique symbols
      const symbols = password.match(/[^A-Za-z0-9]/g) || [];
      charsetSize += new Set(symbols).size;
    }

    return Math.max(charsetSize, 1);
  }

  calculatePasswordStrength(password, complexity, entropy) {
    let strength = 0;

    // Length factor
    strength += Math.min(password.length / 12, 2);

    // Character type factor
    strength += complexity.characterTypes * 0.5;

    // Entropy factor
    strength += Math.min(entropy / 50, 2);

    // Unique character factor
    strength += Math.min(complexity.uniqueChars / password.length, 0.5);

    return Math.round(Math.min(strength, 5));
  }

  async checkPasswordCompliance(password, validation) {
    const compliance = {};

    // NIST SP 800-63B compliance
    compliance.nist = {
      compliant: password.length >= 8 && validation.entropy >= 40,
      requirements: ['minimum 8 characters', 'sufficient entropy'],
      violations: []
    };

    // ISO 27001 compliance
    compliance.iso27001 = {
      compliant: validation.strength >= 3,
      requirements: ['strong password policy'],
      violations: validation.strength < 3 ? ['insufficient strength'] : []
    };

    // SOC 2 compliance
    compliance.soc2 = {
      compliant: validation.isValid && validation.complexity.characterTypes >= 3,
      requirements: ['complexity requirements', 'no common passwords'],
      violations: []
    };

    return compliance;
  }

  initializeValidationRules() {
    this.passwordSchema = Joi.string()
      .min(this.config.passwordComplexity.minLength)
      .max(this.config.passwordComplexity.maxLength)
      .required();

    this.encryptionConfigSchema = Joi.object({
      algorithm: Joi.string().valid(...this.config.encryptionStandards.approvedAlgorithms).required(),
      keyLength: Joi.number().min(this.config.encryptionStandards.minKeyLength).optional(),
      iv: Joi.string().optional(),
      nonce: Joi.string().optional()
    });
  }

  initializeThreatPatterns() {
    return new Map([
      ['sql_injection', /(\bOR\b|\bAND\b|\bUNION\b|\bSELECT\b)/gi],
      ['xss_attempt', /<script|javascript:|onclick|onload/gi],
      ['path_traversal', /(\.\.\/|\.\.\\|%2e%2e)/gi],
      ['command_injection', /(\||&&|;|\$\(|`)/gi],
      ['encoded_payload', /(%[0-9a-f]{2}){3,}/gi]
    ]);
  }

  async detectSuspiciousPatterns(secretValue) {
    const patterns = [];

    for (const [patternName, regex] of this.threatPatterns) {
      if (regex.test(secretValue)) {
        patterns.push(`Suspicious pattern detected: ${patternName}`);
      }
    }

    return patterns;
  }

  detectEmbeddedCredentials(secretValue) {
    const credentialPatterns = [
      /password\s*[:=]\s*[^\s]+/gi,
      /api[_-]?key\s*[:=]\s*[^\s]+/gi,
      /secret\s*[:=]\s*[^\s]+/gi,
      /token\s*[:=]\s*[^\s]+/gi,
      /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi
    ];

    const detected = [];

    for (const pattern of credentialPatterns) {
      if (pattern.test(secretValue)) {
        detected.push('Embedded credential pattern found');
        break;
      }
    }

    return detected;
  }

  escalateRiskLevel(currentLevel, newLevel) {
    const riskOrder = ['low', 'medium', 'high', 'critical'];
    const currentIndex = riskOrder.indexOf(currentLevel);
    const newIndex = riskOrder.indexOf(newLevel);

    return newIndex > currentIndex ? newLevel : currentLevel;
  }

  generateSecurityRecommendations(validation) {
    const recommendations = [];

    if (validation.riskLevel === 'high' || validation.riskLevel === 'critical') {
      recommendations.push('Generate a new secret immediately');
      recommendations.push('Audit systems that may have been exposed to this secret');
    }

    if (validation.issues.includes('low entropy')) {
      recommendations.push('Use a cryptographically secure random generator');
    }

    recommendations.push('Store secret in encrypted storage');
    recommendations.push('Implement regular secret rotation');
    recommendations.push('Monitor secret access patterns');

    return recommendations;
  }

  // Placeholder methods for external integrations
  async checkNetworkConnectivity() {
    return { status: 'healthy', latency: 'unknown' };
  }

  async checkDependencyHealth() {
    return { status: 'healthy', dependencies: [] };
  }

  async getUserPermissions(userId, credentialId) {
    return ['read']; // Placeholder
  }

  async getAccessRestrictions(credentialId) {
    return []; // Placeholder
  }

  async analyzeAccessRiskFactors(credentialId, userId) {
    return []; // Placeholder
  }

  extractKeyLengthFromAlgorithm(algorithm) {
    const match = algorithm.match(/(\d+)/);
    return match ? parseInt(match[1]) : 256;
  }

  async validateKeyDerivation(keyDerivationConfig) {
    return {
      isValid: true,
      errors: []
    };
  }

  async validateEncryptionCompliance(encryptionConfig) {
    return {
      fips140: true,
      nist: true,
      iso27001: true
    };
  }
}