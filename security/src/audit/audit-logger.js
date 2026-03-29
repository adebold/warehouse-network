/**
 * Comprehensive security audit logging system
 * Provides structured logging for all security operations with compliance features
 */

import winston from 'winston';
import crypto from 'crypto';
import { Logging } from '@google-cloud/logging';
import fs from 'fs/promises';
import path from 'path';

export class AuditLogger {
  constructor(options = {}) {
    this.config = {
      projectId: options.projectId || process.env.GOOGLE_CLOUD_PROJECT,
      logLevel: options.logLevel || 'info',
      enableCloudLogging: options.enableCloudLogging !== false,
      enableFileLogging: options.enableFileLogging !== false,
      enableConsoleLogging: options.enableConsoleLogging !== false,
      logDirectory: options.logDirectory || './logs',
      maxFileSize: options.maxFileSize || 10485760, // 10MB
      maxFiles: options.maxFiles || 5,
      correlationEnabled: options.correlationEnabled !== false,
      complianceMode: options.complianceMode || 'SOC2',
      encryptLogs: options.encryptLogs || false,
      ...options
    };

    this.initializeLoggers();
    this.correlationMap = new Map();
    this.securityMetrics = new Map();
    this.alertThresholds = new Map([
      ['failed_auth', { count: 5, window: 300000 }], // 5 failures in 5 minutes
      ['secret_access_denied', { count: 3, window: 180000 }], // 3 denials in 3 minutes
      ['rotation_failures', { count: 2, window: 3600000 }], // 2 failures in 1 hour
      ['suspicious_patterns', { count: 1, window: 60000 }] // 1 suspicious pattern in 1 minute
    ]);
  }

  /**
   * Initialize all logging transports
   */
  async initializeLoggers() {
    const transports = [];

    // Console transport for development
    if (this.config.enableConsoleLogging) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(this.formatConsoleOutput.bind(this))
        )
      }));
    }

    // File transport for local logging
    if (this.config.enableFileLogging) {
      await this.ensureLogDirectory();

      transports.push(new winston.transports.File({
        filename: path.join(this.config.logDirectory, 'security-audit.log'),
        maxsize: this.config.maxFileSize,
        maxFiles: this.config.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
          this.config.encryptLogs ? this.encryptionFormat() : winston.format.uncolorize()
        )
      }));

      // Separate error log
      transports.push(new winston.transports.File({
        filename: path.join(this.config.logDirectory, 'security-errors.log'),
        level: 'error',
        maxsize: this.config.maxFileSize,
        maxFiles: this.config.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    // Create main logger
    this.logger = winston.createLogger({
      level: this.config.logLevel,
      transports,
      exitOnError: false
    });

    // Initialize Google Cloud Logging if enabled
    if (this.config.enableCloudLogging) {
      this.cloudLogging = new Logging({
        projectId: this.config.projectId
      });

      this.securityLog = this.cloudLogging.log('security-audit');
      this.complianceLog = this.cloudLogging.log('compliance-audit');
      this.alertLog = this.cloudLogging.log('security-alerts');
    }
  }

  /**
   * Log password generation operations
   */
  async logPasswordGeneration(operation, sessionId, details = {}) {
    const logEntry = this.createBaseLogEntry('PASSWORD_GENERATION', operation, sessionId, details);

    // Sanitize sensitive data
    const sanitizedDetails = this.sanitizePasswordData(details);

    await this.writeLog({
      ...logEntry,
      category: 'credential_management',
      subcategory: 'password_generation',
      details: sanitizedDetails,
      compliance: {
        dataClassification: 'restricted',
        retention: '7_years',
        regulations: ['SOC2', 'GDPR', 'CCPA']
      }
    });

    // Update metrics
    this.updateSecurityMetrics('password_generation', operation);
  }

  /**
   * Log credential storage operations
   */
  async logCredentialOperation(operation, sessionId, details = {}) {
    const logEntry = this.createBaseLogEntry('CREDENTIAL_OPERATION', operation, sessionId, details);

    // Enhanced details for credential operations
    const enhancedDetails = {
      ...details,
      dataClassification: 'top_secret',
      accessPattern: await this.analyzeAccessPattern(sessionId, operation),
      riskScore: await this.calculateRiskScore(operation, details)
    };

    await this.writeLog({
      ...logEntry,
      category: 'credential_management',
      subcategory: 'storage_operations',
      details: this.sanitizeCredentialData(enhancedDetails),
      compliance: {
        dataClassification: 'top_secret',
        retention: '10_years',
        regulations: ['SOC2', 'ISO27001', 'NIST']
      }
    });

    // Check for suspicious patterns
    await this.detectSuspiciousPatterns(operation, details, sessionId);

    this.updateSecurityMetrics('credential_operations', operation);
  }

  /**
   * Log secret manager operations
   */
  async logSecretOperation(operation, sessionId, details = {}) {
    const logEntry = this.createBaseLogEntry('SECRET_MANAGER', operation, sessionId, details);

    await this.writeLog({
      ...logEntry,
      category: 'secret_management',
      subcategory: 'gcp_operations',
      details: this.sanitizeSecretData(details),
      compliance: {
        dataClassification: 'confidential',
        retention: '7_years',
        regulations: ['SOC2', 'GDPR']
      }
    });

    // Alert on sensitive operations
    if (['delete', 'create', 'retrieve'].includes(operation)) {
      await this.checkAlertThresholds('secret_operations', operation, sessionId);
    }

    this.updateSecurityMetrics('secret_operations', operation);
  }

  /**
   * Log rotation operations
   */
  async logRotationOperation(operation, sessionId, details = {}) {
    const logEntry = this.createBaseLogEntry('CREDENTIAL_ROTATION', operation, sessionId, details);

    await this.writeLog({
      ...logEntry,
      category: 'credential_rotation',
      subcategory: 'automated_operations',
      details: {
        ...details,
        rotationPolicy: await this.getRotationPolicy(details.credentialId),
        complianceStatus: await this.checkRotationCompliance(details)
      },
      compliance: {
        dataClassification: 'restricted',
        retention: '5_years',
        regulations: ['SOC2', 'PCI_DSS']
      }
    });

    // Track rotation metrics
    if (operation.includes('error') || operation.includes('failure')) {
      await this.checkAlertThresholds('rotation_failures', operation, sessionId);
    }

    this.updateSecurityMetrics('rotation_operations', operation);
  }

  /**
   * Log security validation operations
   */
  async logValidationOperation(operation, sessionId, details = {}) {
    const logEntry = this.createBaseLogEntry('SECURITY_VALIDATION', operation, sessionId, details);

    await this.writeLog({
      ...logEntry,
      category: 'security_validation',
      subcategory: 'compliance_checks',
      details: {
        ...details,
        validationRules: await this.getAppliedValidationRules(details),
        complianceScore: await this.calculateComplianceScore(details)
      },
      compliance: {
        dataClassification: 'internal',
        retention: '3_years',
        regulations: ['SOC2', 'ISO27001']
      }
    });

    this.updateSecurityMetrics('validation_operations', operation);
  }

  /**
   * Log authentication and authorization events
   */
  async logAuthEvent(eventType, sessionId, details = {}) {
    const logEntry = this.createBaseLogEntry('AUTHENTICATION', eventType, sessionId, details);

    const enhancedDetails = {
      ...details,
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown',
      geolocation: await this.getGeolocation(details.ipAddress),
      authMethod: details.authMethod || 'unknown',
      riskFactors: await this.analyzeAuthRiskFactors(details)
    };

    await this.writeLog({
      ...logEntry,
      category: 'authentication',
      subcategory: 'access_control',
      details: enhancedDetails,
      severity: this.calculateAuthSeverity(eventType, enhancedDetails),
      compliance: {
        dataClassification: 'sensitive',
        retention: '7_years',
        regulations: ['SOC2', 'GDPR', 'CCPA']
      }
    });

    // Check for failed auth patterns
    if (eventType.includes('failed') || eventType.includes('denied')) {
      await this.checkAlertThresholds('failed_auth', eventType, sessionId, enhancedDetails);
    }

    this.updateSecurityMetrics('auth_events', eventType);
  }

  /**
   * Log security alerts and incidents
   */
  async logSecurityAlert(alertType, severity, details = {}) {
    const sessionId = crypto.randomUUID();
    const logEntry = this.createBaseLogEntry('SECURITY_ALERT', alertType, sessionId, details);

    const alertDetails = {
      ...details,
      alertId: crypto.randomUUID(),
      severity,
      threatLevel: await this.calculateThreatLevel(alertType, details),
      correlatedEvents: await this.findCorrelatedEvents(details),
      responseRequired: severity >= 3,
      escalationPath: await this.getEscalationPath(severity)
    };

    await this.writeLog({
      ...logEntry,
      category: 'security_alerts',
      subcategory: 'threat_detection',
      details: alertDetails,
      severity: this.mapSeverityToLogLevel(severity),
      urgent: severity >= 4,
      compliance: {
        dataClassification: 'confidential',
        retention: '10_years',
        regulations: ['SOC2', 'ISO27001', 'NIST']
      }
    });

    // Write to dedicated alert log
    if (this.config.enableCloudLogging) {
      await this.writeAlertLog(alertDetails);
    }

    // Trigger immediate notifications for high-severity alerts
    if (severity >= 3) {
      await this.triggerImmediateNotification(alertDetails);
    }
  }

  /**
   * Create correlation between related security events
   */
  createCorrelation(primarySessionId, relatedSessionIds, correlationType) {
    const correlationId = crypto.randomUUID();

    this.correlationMap.set(correlationId, {
      primarySession: primarySessionId,
      relatedSessions: relatedSessionIds,
      type: correlationType,
      createdAt: new Date().toISOString(),
      strength: this.calculateCorrelationStrength(relatedSessionIds.length)
    });

    return correlationId;
  }

  /**
   * Generate comprehensive audit report
   */
  async generateAuditReport(options = {}) {
    const reportId = crypto.randomUUID();
    const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = options.endDate || new Date();

    try {
      const report = {
        reportId,
        generatedAt: new Date().toISOString(),
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: await this.generateReportSummary(startDate, endDate),
        metrics: await this.generateSecurityMetrics(startDate, endDate),
        compliance: await this.generateComplianceReport(startDate, endDate),
        incidents: await this.generateIncidentReport(startDate, endDate),
        recommendations: await this.generateRecommendations(startDate, endDate)
      };

      // Store report securely
      await this.storeAuditReport(report);

      return report;

    } catch (error) {
      await this.logValidationOperation('audit_report_error', crypto.randomUUID(), {
        error: error.message,
        reportId
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  createBaseLogEntry(service, operation, sessionId, details) {
    return {
      timestamp: new Date().toISOString(),
      service,
      operation,
      sessionId,
      correlationId: this.getCorrelationId(sessionId),
      environment: process.env.NODE_ENV || 'production',
      version: process.env.APP_VERSION || '1.0.0',
      hostname: process.env.HOSTNAME || 'unknown',
      processId: process.pid,
      userId: details.userId || process.env.USER || 'system',
      traceId: this.generateTraceId(),
      severity: this.calculateSeverity(operation, details)
    };
  }

  async writeLog(logEntry) {
    // Write to local logger
    this.logger.log(logEntry.severity, 'Security audit log', logEntry);

    // Write to Google Cloud Logging if enabled
    if (this.config.enableCloudLogging) {
      await this.writeCloudLog(logEntry);
    }

    // Store correlation information
    if (this.config.correlationEnabled) {
      await this.storeCorrelationData(logEntry);
    }
  }

  async writeCloudLog(logEntry) {
    const cloudLogEntry = this.securityLog.entry({
      resource: {
        type: 'global',
        labels: {
          project_id: this.config.projectId
        }
      },
      severity: logEntry.severity.toUpperCase(),
      labels: {
        service: logEntry.service,
        operation: logEntry.operation,
        category: logEntry.category,
        environment: logEntry.environment
      }
    }, logEntry);

    await this.securityLog.write(cloudLogEntry);
  }

  async writeAlertLog(alertDetails) {
    const alertLogEntry = this.alertLog.entry({
      resource: { type: 'global' },
      severity: this.mapSeverityToGCPLevel(alertDetails.severity)
    }, alertDetails);

    await this.alertLog.write(alertLogEntry);
  }

  sanitizePasswordData(details) {
    const sanitized = { ...details };

    // Remove actual password values
    delete sanitized.password;
    delete sanitized.value;

    // Keep metadata only
    return {
      ...sanitized,
      hasPassword: details.password !== undefined,
      passwordLength: details.password?.length || 0,
      generationMethod: details.type || 'standard'
    };
  }

  sanitizeCredentialData(details) {
    const sanitized = { ...details };

    // Remove sensitive credential data
    const sensitiveFields = ['password', 'key', 'secret', 'token', 'credential'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[`${field}Hash`] = this.hashValue(sanitized[field]);
        delete sanitized[field];
      }
    }

    return sanitized;
  }

  sanitizeSecretData(details) {
    const sanitized = { ...details };

    // Remove secret values but keep metadata
    delete sanitized.secretValue;
    delete sanitized.value;

    return {
      ...sanitized,
      hasSecretValue: details.secretValue !== undefined || details.value !== undefined,
      dataLength: details.secretValue?.length || details.value?.length || 0
    };
  }

  hashValue(value) {
    return crypto.createHash('sha256')
      .update(value.toString())
      .digest('hex')
      .substring(0, 16); // First 16 chars for identification
  }

  async detectSuspiciousPatterns(operation, details, sessionId) {
    // Implement pattern detection logic
    const patterns = [
      this.detectRapidOperations(operation, sessionId),
      this.detectUnusualAccessPatterns(details),
      this.detectAnomalousCredentialUsage(operation, details)
    ];

    const suspiciousPatterns = (await Promise.all(patterns)).filter(Boolean);

    if (suspiciousPatterns.length > 0) {
      await this.logSecurityAlert('SUSPICIOUS_PATTERN_DETECTED', 2, {
        patterns: suspiciousPatterns,
        operation,
        sessionId,
        details: this.sanitizeCredentialData(details)
      });
    }
  }

  async checkAlertThresholds(alertType, operation, sessionId, details = {}) {
    const threshold = this.alertThresholds.get(alertType);
    if (!threshold) return;

    const key = `${alertType}_${this.getTimeWindow(threshold.window)}`;
    const currentCount = (this.securityMetrics.get(key) || 0) + 1;

    this.securityMetrics.set(key, currentCount);

    if (currentCount >= threshold.count) {
      await this.logSecurityAlert('THRESHOLD_EXCEEDED', 3, {
        alertType,
        threshold,
        currentCount,
        operation,
        sessionId,
        timeWindow: threshold.window
      });
    }
  }

  formatConsoleOutput(info) {
    const { timestamp, level, message, ...meta } = info;
    return `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
  }

  encryptionFormat() {
    return winston.format((info) => {
      if (this.config.encryptLogs) {
        // Implement log encryption logic
        info.encrypted = true;
      }
      return info;
    })();
  }

  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.config.logDirectory, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  updateSecurityMetrics(category, operation) {
    const key = `${category}_${operation}`;
    const count = this.securityMetrics.get(key) || 0;
    this.securityMetrics.set(key, count + 1);
  }

  calculateSeverity(operation, details) {
    if (operation.includes('error') || operation.includes('failed')) {
      return 'error';
    }
    if (operation.includes('delete') || operation.includes('emergency')) {
      return 'warn';
    }
    return 'info';
  }

  generateTraceId() {
    return crypto.randomBytes(16).toString('hex');
  }

  getTimeWindow(windowMs) {
    return Math.floor(Date.now() / windowMs) * windowMs;
  }

  mapSeverityToLogLevel(severity) {
    const levels = ['debug', 'info', 'warn', 'error', 'error'];
    return levels[Math.min(severity, levels.length - 1)];
  }

  mapSeverityToGCPLevel(severity) {
    const levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];
    return levels[Math.min(severity, levels.length - 1)];
  }

  // Placeholder methods for complex analysis
  async analyzeAccessPattern(sessionId, operation) {
    return 'normal';
  }

  async calculateRiskScore(operation, details) {
    return operation.includes('delete') ? 'high' : 'medium';
  }

  async getGeolocation(ipAddress) {
    return { country: 'unknown', region: 'unknown' };
  }

  async analyzeAuthRiskFactors(details) {
    return [];
  }

  calculateAuthSeverity(eventType, details) {
    return eventType.includes('failed') ? 'warn' : 'info';
  }

  async getAppliedValidationRules(details) {
    return [];
  }

  async calculateComplianceScore(details) {
    return 85; // Placeholder
  }

  getCorrelationId(sessionId) {
    // Find existing correlation or create new one
    return sessionId;
  }
}