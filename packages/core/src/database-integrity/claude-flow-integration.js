/**
 * Claude Flow Integration for Database Integrity System
 * Replaces custom database tables with Claude Flow memory and hooks
 * Provides optimized memory management and coordination
 */

const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

/**
 * Claude Flow memory namespaces for different log types
 */
const MEMORY_NAMESPACES = {
  LOGS: 'db-integrity/logs',
  DRIFT: 'db-integrity/drift',
  MIGRATIONS: 'db-integrity/migrations',
  VALIDATIONS: 'db-integrity/validations',
  ANALYTICS: 'db-integrity/analytics',
  ALERTS: 'db-integrity/alerts',
  SNAPSHOTS: 'db-integrity/snapshots',
  METRICS: 'db-integrity/metrics'
};

/**
 * TTL settings for different types of data (in hours)
 */
const TTL_SETTINGS = {
  LOGS: 168, // 7 days
  DRIFT: 720, // 30 days
  MIGRATIONS: 2160, // 90 days
  VALIDATIONS: 168, // 7 days
  ANALYTICS: 720, // 30 days
  ALERTS: 2160, // 90 days
  SNAPSHOTS: 2160, // 90 days
  METRICS: 720 // 30 days
};

/**
 * Log levels for filtering
 */
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

/**
 * Log categories
 */
const LOG_CATEGORIES = {
  MIGRATION: 'MIGRATION',
  DRIFT_DETECTION: 'DRIFT_DETECTION',
  VALIDATION: 'VALIDATION',
  SCHEMA_ANALYSIS: 'SCHEMA_ANALYSIS',
  FORM_SCANNING: 'FORM_SCANNING',
  ROUTE_VALIDATION: 'ROUTE_VALIDATION',
  WAREHOUSE_VALIDATION: 'WAREHOUSE_VALIDATION',
  MAINTENANCE: 'MAINTENANCE',
  PERFORMANCE: 'PERFORMANCE',
  SECURITY: 'SECURITY'
};

/**
 * Alert types
 */
const ALERT_TYPES = {
  DRIFT_DETECTED: 'DRIFT_DETECTED',
  MIGRATION_ERROR: 'MIGRATION_ERROR',
  VALIDATION_FAILURE: 'VALIDATION_FAILURE',
  PERFORMANCE_DEGRADATION: 'PERFORMANCE_DEGRADATION',
  SECURITY_ISSUE: 'SECURITY_ISSUE',
  MAINTENANCE_REQUIRED: 'MAINTENANCE_REQUIRED'
};

/**
 * Alert severities
 */
const ALERT_SEVERITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

class ClaudeFlowIntegration {
  constructor(config = {}) {
    this.config = {
      enableHooks: config.enableHooks !== false,
      enableMemory: config.enableMemory !== false,
      sessionId: config.sessionId || `db-integrity-${Date.now()}`,
      correlationId: config.correlationId || uuidv4(),
      ...config
    };

    // Setup logger
    this.logger = winston.createLogger({
      level: config.logLevel || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.isInitialized = false;
  }

  /**
   * Initialize Claude Flow integration
   */
  async initialize() {
    if (this.isInitialized) {
      return { success: true };
    }

    try {
      this.logger.info('Initializing Claude Flow integration for database integrity');

      // Initialize memory namespaces
      if (this.config.enableMemory) {
        await this.initializeMemoryNamespaces();
      }

      // Setup session
      if (this.config.enableHooks) {
        await this.initializeSession();
      }

      this.isInitialized = true;
      this.logger.info('Claude Flow integration initialized successfully');

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to initialize Claude Flow integration', error);
      return {
        success: false,
        error: {
          code: 'CLAUDE_FLOW_INIT_FAILED',
          message: 'Failed to initialize Claude Flow integration',
          details: error.message
        }
      };
    }
  }

  /**
   * Initialize memory namespaces
   */
  async initializeMemoryNamespaces() {
    for (const [type, namespace] of Object.entries(MEMORY_NAMESPACES)) {
      try {
        // Create namespace if it doesn't exist
        await this.executeClaudeFlowCommand(
          'memory_namespace',
          { action: 'create', namespace }
        );
        this.logger.debug(`Initialized memory namespace: ${namespace}`);
      } catch (error) {
        this.logger.warn(`Failed to initialize namespace ${namespace}:`, error.message);
      }
    }
  }

  /**
   * Initialize session for hooks
   */
  async initializeSession() {
    try {
      await this.executeHook('pre-task', {
        description: 'Database integrity system session',
        sessionId: this.config.sessionId,
        correlationId: this.config.correlationId
      });
      this.logger.debug(`Session initialized: ${this.config.sessionId}`);
    } catch (error) {
      this.logger.warn('Failed to initialize session hooks:', error.message);
    }
  }

  /**
   * Execute Claude Flow command
   */
  async executeClaudeFlowCommand(command, params = {}) {
    const cmd = this.buildClaudeFlowCommand(command, params);
    
    try {
      const result = execSync(cmd, {
        encoding: 'utf8',
        timeout: 30000
      });
      return JSON.parse(result || '{}');
    } catch (error) {
      this.logger.error(`Claude Flow command failed: ${cmd}`, error.message);
      throw error;
    }
  }

  /**
   * Build Claude Flow command string
   */
  buildClaudeFlowCommand(command, params) {
    const baseCmd = 'npx claude-flow@alpha';
    const paramStr = Object.entries(params)
      .map(([key, value]) => `--${key} "${JSON.stringify(value).replace(/"/g, '\\"')}"`)
      .join(' ');
    
    return `${baseCmd} ${command} ${paramStr}`;
  }

  /**
   * Execute hook
   */
  async executeHook(hookType, params = {}) {
    if (!this.config.enableHooks) {
      return { success: true, message: 'Hooks disabled' };
    }

    const hookParams = {
      ...params,
      'session-id': this.config.sessionId,
      'correlation-id': this.config.correlationId
    };

    try {
      const cmd = `npx claude-flow@alpha hooks ${hookType} ${Object.entries(hookParams)
        .map(([key, value]) => `--${key} "${value}"`)
        .join(' ')}`;
      
      execSync(cmd, { encoding: 'utf8', timeout: 10000 });
      return { success: true };
    } catch (error) {
      this.logger.warn(`Hook execution failed (${hookType}):`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Store log entry in Claude Flow memory
   */
  async storeLog(entry) {
    if (!this.config.enableMemory) {
      this.logger.debug('Memory disabled, skipping log storage');
      return { success: true, data: { id: uuidv4() } };
    }

    try {
      const logEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        category: entry.category,
        level: entry.level,
        operation: entry.operation,
        component: entry.component,
        message: entry.message,
        details: entry.details,
        metadata: entry.metadata,
        duration: entry.duration,
        success: entry.success,
        error: entry.error ? {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        } : null,
        userId: entry.userId,
        correlationId: entry.correlationId || this.config.correlationId
      };

      // Store in general logs namespace
      await this.storeMemory(
        MEMORY_NAMESPACES.LOGS,
        `${logEntry.category.toLowerCase()}-${logEntry.id}`,
        logEntry,
        TTL_SETTINGS.LOGS
      );

      // Store in category-specific namespace if needed
      if (entry.category === LOG_CATEGORIES.DRIFT_DETECTION) {
        await this.storeMemory(
          MEMORY_NAMESPACES.DRIFT,
          `drift-${logEntry.id}`,
          logEntry,
          TTL_SETTINGS.DRIFT
        );
      } else if (entry.category === LOG_CATEGORIES.MIGRATION) {
        await this.storeMemory(
          MEMORY_NAMESPACES.MIGRATIONS,
          `migration-${logEntry.id}`,
          logEntry,
          TTL_SETTINGS.MIGRATIONS
        );
      } else if (entry.category === LOG_CATEGORIES.VALIDATION) {
        await this.storeMemory(
          MEMORY_NAMESPACES.VALIDATIONS,
          `validation-${logEntry.id}`,
          logEntry,
          TTL_SETTINGS.VALIDATIONS
        );
      }

      // Create alert if needed
      if (this.shouldCreateAlert(entry)) {
        await this.createAlert(logEntry);
      }

      return { success: true, data: logEntry };
    } catch (error) {
      this.logger.error('Failed to store log in memory:', error);
      return {
        success: false,
        error: {
          code: 'MEMORY_STORE_FAILED',
          message: 'Failed to store log in memory',
          details: error.message
        }
      };
    }
  }

  /**
   * Store data in Claude Flow memory
   */
  async storeMemory(namespace, key, data, ttlHours = 24) {
    const params = {
      action: 'store',
      namespace,
      key,
      value: JSON.stringify(data),
      ttl: ttlHours * 3600 // Convert to seconds
    };

    return this.executeClaudeFlowCommand('memory_usage', params);
  }

  /**
   * Retrieve data from Claude Flow memory
   */
  async retrieveMemory(namespace, key = null, limit = null) {
    const params = {
      action: key ? 'retrieve' : 'list',
      namespace
    };

    if (key) {
      params.key = key;
    }
    if (limit) {
      params.limit = limit;
    }

    try {
      const result = await this.executeClaudeFlowCommand('memory_usage', params);
      
      if (key && result.value) {
        return { success: true, data: JSON.parse(result.value) };
      } else if (!key && result.entries) {
        const data = result.entries
          .map(entry => {
            try {
              return {
                key: entry.key,
                data: JSON.parse(entry.value),
                timestamp: entry.timestamp
              };
            } catch (e) {
              return null;
            }
          })
          .filter(Boolean);
        return { success: true, data };
      }

      return { success: true, data: null };
    } catch (error) {
      this.logger.error('Failed to retrieve from memory:', error);
      return {
        success: false,
        error: {
          code: 'MEMORY_RETRIEVE_FAILED',
          message: 'Failed to retrieve from memory',
          details: error.message
        }
      };
    }
  }

  /**
   * Search memory with patterns
   */
  async searchMemory(namespace, pattern, limit = 100) {
    try {
      const params = {
        pattern: `${namespace}:${pattern}`,
        limit
      };

      const result = await this.executeClaudeFlowCommand('memory_search', params);
      
      if (result.matches) {
        const data = result.matches
          .map(match => {
            try {
              return {
                key: match.key,
                data: JSON.parse(match.value),
                timestamp: match.timestamp,
                score: match.score
              };
            } catch (e) {
              return null;
            }
          })
          .filter(Boolean);
        return { success: true, data };
      }

      return { success: true, data: [] };
    } catch (error) {
      this.logger.error('Failed to search memory:', error);
      return {
        success: false,
        error: {
          code: 'MEMORY_SEARCH_FAILED',
          message: 'Failed to search memory',
          details: error.message
        }
      };
    }
  }

  /**
   * Create alert
   */
  async createAlert(logEntry) {
    const alert = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: this.mapLogToAlertType(logEntry),
      severity: this.mapLogToAlertSeverity(logEntry),
      title: `${logEntry.component}: ${logEntry.operation} failed`,
      description: logEntry.message,
      logId: logEntry.id,
      status: 'ACTIVE',
      details: {
        category: logEntry.category,
        component: logEntry.component,
        operation: logEntry.operation,
        errorCode: logEntry.error?.name,
        ...logEntry.details
      }
    };

    await this.storeMemory(
      MEMORY_NAMESPACES.ALERTS,
      `alert-${alert.id}`,
      alert,
      TTL_SETTINGS.ALERTS
    );

    // Send notification hook
    await this.executeHook('notify', {
      message: `Alert created: ${alert.title}`,
      severity: alert.severity,
      'alert-id': alert.id
    });

    return alert;
  }

  /**
   * Store drift detection results
   */
  async storeDriftResults(driftReport) {
    const driftEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      summary: driftReport.summary,
      drifts: driftReport.drifts,
      correlationId: this.config.correlationId
    };

    await this.storeMemory(
      MEMORY_NAMESPACES.DRIFT,
      `drift-report-${driftEntry.id}`,
      driftEntry,
      TTL_SETTINGS.DRIFT
    );

    return driftEntry;
  }

  /**
   * Store migration history
   */
  async storeMigrationHistory(migration) {
    const migrationEntry = {
      id: migration.id || uuidv4(),
      timestamp: new Date().toISOString(),
      name: migration.name,
      status: migration.status,
      executedAt: migration.executedAt,
      executionTime: migration.executionTime,
      sql: migration.sql,
      rollbackSql: migration.rollbackSql,
      checksum: migration.checksum,
      correlationId: this.config.correlationId
    };

    await this.storeMemory(
      MEMORY_NAMESPACES.MIGRATIONS,
      `migration-${migrationEntry.id}`,
      migrationEntry,
      TTL_SETTINGS.MIGRATIONS
    );

    return migrationEntry;
  }

  /**
   * Store validation results
   */
  async storeValidationResults(validationType, results) {
    const validationEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: validationType,
      results,
      summary: this.generateValidationSummary(results),
      correlationId: this.config.correlationId
    };

    await this.storeMemory(
      MEMORY_NAMESPACES.VALIDATIONS,
      `validation-${validationType}-${validationEntry.id}`,
      validationEntry,
      TTL_SETTINGS.VALIDATIONS
    );

    return validationEntry;
  }

  /**
   * Store analytics data
   */
  async storeAnalytics(analyticsData) {
    const analyticsEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...analyticsData,
      correlationId: this.config.correlationId
    };

    await this.storeMemory(
      MEMORY_NAMESPACES.ANALYTICS,
      `analytics-${analyticsEntry.id}`,
      analyticsEntry,
      TTL_SETTINGS.ANALYTICS
    );

    return analyticsEntry;
  }

  /**
   * Store performance metrics
   */
  async storeMetric(metricData) {
    const metric = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...metricData,
      correlationId: this.config.correlationId
    };

    await this.storeMemory(
      MEMORY_NAMESPACES.METRICS,
      `metric-${metric.component}-${metric.name}-${metric.id}`,
      metric,
      TTL_SETTINGS.METRICS
    );

    return metric;
  }

  /**
   * Get recent logs
   */
  async getRecentLogs(limit = 20, category = null, level = null) {
    try {
      let namespace = MEMORY_NAMESPACES.LOGS;
      let pattern = '*';

      if (category) {
        pattern = `${category.toLowerCase()}-*`;
      }

      const result = await this.searchMemory(namespace, pattern, limit * 2);
      
      if (!result.success || !result.data) {
        return [];
      }

      let logs = result.data.map(entry => entry.data);

      // Filter by level if specified
      if (level) {
        logs = logs.filter(log => log.level === level);
      }

      // Sort by timestamp and limit
      return logs
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get recent logs:', error);
      return [];
    }
  }

  /**
   * Get analytics from memory
   */
  async getAnalytics(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get logs for analysis
      const logsResult = await this.retrieveMemory(MEMORY_NAMESPACES.LOGS);
      
      if (!logsResult.success || !logsResult.data) {
        return {
          totalLogs: 0,
          errorRate: 0,
          categoryBreakdown: {},
          levelBreakdown: {},
          componentBreakdown: {},
          timeSeriesData: [],
          trends: []
        };
      }

      const logs = logsResult.data
        .map(entry => entry.data)
        .filter(log => new Date(log.timestamp) >= startDate);

      return this.generateAnalyticsFromLogs(logs, days);
    } catch (error) {
      this.logger.error('Failed to get analytics:', error);
      return null;
    }
  }

  /**
   * Export logs with filters
   */
  async exportLogs(params = {}) {
    try {
      let namespace = MEMORY_NAMESPACES.LOGS;
      let pattern = '*';

      if (params.category) {
        pattern = `${params.category.toLowerCase()}-*`;
      }

      const result = await this.searchMemory(namespace, pattern, params.limit || 10000);
      
      if (!result.success || !result.data) {
        return params.format === 'csv' ? '' : JSON.stringify([]);
      }

      let logs = result.data.map(entry => entry.data);

      // Apply date filters
      if (params.startDate) {
        logs = logs.filter(log => new Date(log.timestamp) >= params.startDate);
      }
      if (params.endDate) {
        logs = logs.filter(log => new Date(log.timestamp) <= params.endDate);
      }

      // Sort by timestamp
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (params.format === 'csv') {
        return this.convertLogsToCSV(logs);
      }

      return JSON.stringify(logs, null, 2);
    } catch (error) {
      this.logger.error('Failed to export logs:', error);
      throw error;
    }
  }

  /**
   * Cleanup memory using TTL and manual cleanup
   */
  async cleanupMemory() {
    try {
      const results = {
        namespacesCleared: 0,
        entriesRemoved: 0,
        errors: []
      };

      for (const [type, namespace] of Object.entries(MEMORY_NAMESPACES)) {
        try {
          // Use Claude Flow's built-in cleanup
          await this.executeClaudeFlowCommand('memory_namespace', {
            action: 'cleanup',
            namespace,
            'max-age': `${TTL_SETTINGS[type]}h`
          });
          results.namespacesCleared++;
        } catch (error) {
          results.errors.push(`${namespace}: ${error.message}`);
        }
      }

      await this.storeLog({
        category: LOG_CATEGORIES.MAINTENANCE,
        level: LOG_LEVELS.INFO,
        operation: 'memory_cleanup',
        component: 'ClaudeFlowIntegration',
        message: 'Memory cleanup completed',
        details: results,
        success: true
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to cleanup memory:', error);
      throw error;
    }
  }

  /**
   * Session cleanup
   */
  async endSession() {
    try {
      await this.executeHook('post-task', {
        'task-id': this.config.sessionId
      });
      
      await this.executeHook('session-end', {
        'export-metrics': 'true'
      });

      this.logger.info(`Session ended: ${this.config.sessionId}`);
    } catch (error) {
      this.logger.warn('Failed to end session hooks:', error.message);
    }
  }

  // Helper methods

  shouldCreateAlert(entry) {
    return (
      !entry.success && 
      (entry.level === LOG_LEVELS.ERROR || entry.level === LOG_LEVELS.CRITICAL)
    );
  }

  mapLogToAlertType(logEntry) {
    switch (logEntry.category) {
      case LOG_CATEGORIES.MIGRATION:
        return ALERT_TYPES.MIGRATION_ERROR;
      case LOG_CATEGORIES.DRIFT_DETECTION:
        return ALERT_TYPES.DRIFT_DETECTED;
      case LOG_CATEGORIES.VALIDATION:
      case LOG_CATEGORIES.WAREHOUSE_VALIDATION:
        return ALERT_TYPES.VALIDATION_FAILURE;
      case LOG_CATEGORIES.PERFORMANCE:
        return ALERT_TYPES.PERFORMANCE_DEGRADATION;
      case LOG_CATEGORIES.SECURITY:
        return ALERT_TYPES.SECURITY_ISSUE;
      default:
        return ALERT_TYPES.MAINTENANCE_REQUIRED;
    }
  }

  mapLogToAlertSeverity(logEntry) {
    switch (logEntry.level) {
      case LOG_LEVELS.CRITICAL:
        return ALERT_SEVERITIES.CRITICAL;
      case LOG_LEVELS.ERROR:
        return ALERT_SEVERITIES.HIGH;
      case LOG_LEVELS.WARNING:
        return ALERT_SEVERITIES.MEDIUM;
      default:
        return ALERT_SEVERITIES.LOW;
    }
  }

  generateValidationSummary(results) {
    if (!Array.isArray(results)) {
      return { total: 0, passed: 0, failed: 0, warnings: 0 };
    }

    const total = results.length;
    const passed = results.filter(r => r.valid || r.success).length;
    const failed = results.filter(r => !(r.valid || r.success)).length;
    const warnings = results.filter(r => r.warnings && r.warnings.length > 0).length;

    return { total, passed, failed, warnings };
  }

  generateAnalyticsFromLogs(logs, days) {
    const analytics = {
      totalLogs: logs.length,
      errorRate: 0,
      categoryBreakdown: {},
      levelBreakdown: {},
      componentBreakdown: {},
      timeSeriesData: [],
      trends: []
    };

    if (logs.length === 0) {
      return analytics;
    }

    // Calculate error rate
    const errors = logs.filter(log => !log.success).length;
    analytics.errorRate = (errors / logs.length) * 100;

    // Generate breakdowns
    logs.forEach(log => {
      // Category breakdown
      analytics.categoryBreakdown[log.category] = 
        (analytics.categoryBreakdown[log.category] || 0) + 1;
      
      // Level breakdown
      analytics.levelBreakdown[log.level] = 
        (analytics.levelBreakdown[log.level] || 0) + 1;
      
      // Component breakdown
      analytics.componentBreakdown[log.component] = 
        (analytics.componentBreakdown[log.component] || 0) + 1;
    });

    // Generate time series data
    const timeGroups = {};
    logs.forEach(log => {
      const hour = new Date(log.timestamp).toISOString().slice(0, 13) + ':00:00.000Z';
      timeGroups[hour] = (timeGroups[hour] || 0) + 1;
    });

    analytics.timeSeriesData = Object.entries(timeGroups)
      .map(([timestamp, count]) => ({ timestamp, count }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Generate trends
    analytics.trends = this.calculateTrends(analytics, days);

    return analytics;
  }

  calculateTrends(analytics, days) {
    const trends = [];

    // Error rate trend
    if (analytics.errorRate > 5) {
      trends.push({
        type: 'error_rate',
        severity: analytics.errorRate > 20 ? 'HIGH' : 'MEDIUM',
        message: `High error rate: ${analytics.errorRate.toFixed(1)}%`
      });
    }

    // Volume trend
    const avgLogsPerDay = analytics.totalLogs / days;
    if (avgLogsPerDay > 1000) {
      trends.push({
        type: 'high_volume',
        severity: 'MEDIUM',
        message: `High log volume: ${avgLogsPerDay.toFixed(0)} logs/day`
      });
    }

    return trends;
  }

  convertLogsToCSV(logs) {
    const headers = ['Timestamp', 'Category', 'Level', 'Component', 'Operation', 'Message', 'Success', 'Duration', 'Error'];
    const csvLines = [headers.join(',')];

    logs.forEach(log => {
      const row = [
        log.timestamp,
        log.category,
        log.level,
        log.component,
        log.operation,
        `"${(log.message || '').replace(/"/g, '""')}"`,
        log.success.toString(),
        log.duration || '',
        log.error ? log.error.name || 'Unknown' : ''
      ];
      csvLines.push(row.join(','));
    });

    return csvLines.join('\n');
  }
}

module.exports = {
  ClaudeFlowIntegration,
  MEMORY_NAMESPACES,
  TTL_SETTINGS,
  LOG_LEVELS,
  LOG_CATEGORIES,
  ALERT_TYPES,
  ALERT_SEVERITIES
};
