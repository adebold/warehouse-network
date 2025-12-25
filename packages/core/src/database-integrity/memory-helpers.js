/**
 * Memory Helper Functions for Claude Flow Database Integrity System
 * Provides utility functions for memory operations, analytics, and insights
 * Optimized for Claude Flow memory system
 */

const { ClaudeFlowIntegration, MEMORY_NAMESPACES, LOG_LEVELS, LOG_CATEGORIES } = require('./claude-flow-integration');
const { v4: uuidv4 } = require('uuid');

/**
 * Memory helper class for database integrity operations
 */
class MemoryHelpers {
  constructor(config = {}) {
    this.claudeFlow = new ClaudeFlowIntegration(config);
    this.initialized = false;
  }

  /**
   * Initialize memory helpers
   */
  async initialize() {
    if (!this.initialized) {
      const result = await this.claudeFlow.initialize();
      this.initialized = result.success;
      return result;
    }
    return { success: true };
  }

  /**
   * Store operation log with automatic categorization
   */
  async logOperation(operation, component, message, details = {}) {
    await this.initialize();

    const entry = {
      category: this.detectCategory(operation, component),
      level: details.error ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO,
      operation,
      component,
      message,
      details: details.data || details,
      duration: details.duration,
      success: !details.error,
      error: details.error,
      userId: details.userId,
      correlationId: details.correlationId
    };

    return this.claudeFlow.storeLog(entry);
  }

  /**
   * Store drift detection results with analysis
   */
  async storeDriftAnalysis(driftReport) {
    await this.initialize();

    // Store the main drift report
    const driftEntry = await this.claudeFlow.storeDriftResults(driftReport);

    // Log the drift detection
    await this.logOperation(
      'drift_detection',
      'DriftDetector',
      `Detected ${driftReport.summary.totalDrifts} drifts`,
      {
        data: {
          totalDrifts: driftReport.summary.totalDrifts,
          bySeverity: driftReport.summary.bySeverity,
          fixableDrifts: driftReport.drifts.filter(d => d.fixable).length
        }
      }
    );

    // Store individual drifts for detailed analysis
    for (const drift of driftReport.drifts) {
      await this.claudeFlow.storeMemory(
        MEMORY_NAMESPACES.DRIFT,
        `drift-detail-${uuidv4()}`,
        {
          ...drift,
          reportId: driftEntry.id,
          timestamp: new Date().toISOString()
        },
        72 // 3 days TTL for detailed drift data
      );
    }

    return driftEntry;
  }

  /**
   * Store migration execution with tracking
   */
  async storeMigrationExecution(migration, executionDetails) {
    await this.initialize();

    // Store migration history
    const migrationEntry = await this.claudeFlow.storeMigrationHistory({
      ...migration,
      ...executionDetails
    });

    // Log the migration
    await this.logOperation(
      'migration_execution',
      'MigrationEngine',
      `Executed migration: ${migration.name}`,
      {
        data: {
          migrationId: migration.id,
          executionTime: executionDetails.executionTime,
          status: executionDetails.status
        },
        duration: executionDetails.executionTime
      }
    );

    // Store performance metrics
    await this.claudeFlow.storeMetric({
      component: 'MigrationEngine',
      name: 'execution_time',
      value: executionDetails.executionTime || 0,
      unit: 'milliseconds',
      tags: {
        migrationId: migration.id,
        migrationName: migration.name,
        status: executionDetails.status
      }
    });

    return migrationEntry;
  }

  /**
   * Store validation results with categorization
   */
  async storeValidationResults(validationType, results, metadata = {}) {
    await this.initialize();

    // Store validation results
    const validationEntry = await this.claudeFlow.storeValidationResults(validationType, results);

    // Log the validation
    const summary = this.claudeFlow.generateValidationSummary(results);
    await this.logOperation(
      `${validationType}_validation`,
      'Validator',
      `Validation completed: ${summary.passed}/${summary.total} passed`,
      {
        data: {
          ...summary,
          validationType,
          ...metadata
        }
      }
    );

    // Store metrics
    await this.claudeFlow.storeMetric({
      component: 'Validator',
      name: 'validation_success_rate',
      value: summary.total > 0 ? (summary.passed / summary.total) * 100 : 100,
      unit: 'percentage',
      tags: {
        validationType,
        total: summary.total
      }
    });

    return validationEntry;
  }

  /**
   * Store schema analysis results
   */
  async storeSchemaAnalysis(schema, analysisMetadata = {}) {
    await this.initialize();

    const schemaSnapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      version: schema.version,
      tables: schema.tables?.length || 0,
      indexes: schema.indexes?.length || 0,
      constraints: schema.constraints?.length || 0,
      enums: schema.enums?.length || 0,
      prismaModels: schema.prismaModels?.length || 0,
      schemaHash: this.generateSchemaHash(schema),
      metadata: analysisMetadata
    };

    // Store schema snapshot
    await this.claudeFlow.storeMemory(
      MEMORY_NAMESPACES.SNAPSHOTS,
      `schema-snapshot-${schemaSnapshot.id}`,
      schemaSnapshot,
      2160 // 90 days TTL
    );

    // Log the analysis
    await this.logOperation(
      'schema_analysis',
      'SchemaAnalyzer',
      `Schema analyzed: ${schemaSnapshot.tables} tables, ${schemaSnapshot.prismaModels} Prisma models`,
      { data: schemaSnapshot }
    );

    return schemaSnapshot;
  }

  /**
   * Get comprehensive analytics
   */
  async getComprehensiveAnalytics(days = 7) {
    await this.initialize();

    const analytics = {
      overview: await this.claudeFlow.getAnalytics(days),
      driftAnalysis: await this.getDriftAnalytics(days),
      migrationAnalysis: await this.getMigrationAnalytics(days),
      validationAnalysis: await this.getValidationAnalytics(days),
      performanceMetrics: await this.getPerformanceMetrics(days),
      alerts: await this.getActiveAlerts(),
      trends: await this.getTrends(days)
    };

    // Store analytics snapshot
    await this.claudeFlow.storeAnalytics({
      type: 'comprehensive_analytics',
      period: `${days}_days`,
      ...analytics,
      generatedAt: new Date().toISOString()
    });

    return analytics;
  }

  /**
   * Get drift-specific analytics
   */
  async getDriftAnalytics(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      const driftData = await this.claudeFlow.retrieveMemory(MEMORY_NAMESPACES.DRIFT);
      
      if (!driftData.success || !driftData.data) {
        return { totalReports: 0, totalDrifts: 0, severityBreakdown: {}, trends: [] };
      }

      const recentDrifts = driftData.data
        .map(entry => entry.data)
        .filter(drift => new Date(drift.timestamp) >= startDate);

      const analytics = {
        totalReports: recentDrifts.length,
        totalDrifts: recentDrifts.reduce((sum, report) => sum + (report.summary?.totalDrifts || 0), 0),
        severityBreakdown: {},
        fixableCount: 0,
        affectedTables: new Set(),
        trends: []
      };

      recentDrifts.forEach(report => {
        if (report.drifts) {
          report.drifts.forEach(drift => {
            // Severity breakdown
            analytics.severityBreakdown[drift.severity] = 
              (analytics.severityBreakdown[drift.severity] || 0) + 1;
            
            // Fixable count
            if (drift.fixable) {
              analytics.fixableCount++;
            }

            // Affected tables
            if (drift.object) {
              analytics.affectedTables.add(drift.object);
            }
          });
        }
      });

      analytics.affectedTablesCount = analytics.affectedTables.size;
      delete analytics.affectedTables; // Remove Set for JSON serialization

      return analytics;
    } catch (error) {
      console.error('Failed to get drift analytics:', error);
      return { totalReports: 0, totalDrifts: 0, severityBreakdown: {}, trends: [] };
    }
  }

  /**
   * Get migration-specific analytics
   */
  async getMigrationAnalytics(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      const migrationData = await this.claudeFlow.retrieveMemory(MEMORY_NAMESPACES.MIGRATIONS);
      
      if (!migrationData.success || !migrationData.data) {
        return { totalMigrations: 0, successRate: 100, avgExecutionTime: 0, trends: [] };
      }

      const recentMigrations = migrationData.data
        .map(entry => entry.data)
        .filter(migration => new Date(migration.timestamp) >= startDate);

      const analytics = {
        totalMigrations: recentMigrations.length,
        successfulMigrations: recentMigrations.filter(m => m.status === 'completed').length,
        failedMigrations: recentMigrations.filter(m => m.status === 'failed').length,
        successRate: 100,
        avgExecutionTime: 0,
        trends: []
      };

      if (analytics.totalMigrations > 0) {
        analytics.successRate = (analytics.successfulMigrations / analytics.totalMigrations) * 100;
        
        const executionTimes = recentMigrations
          .filter(m => m.executionTime)
          .map(m => m.executionTime);
        
        if (executionTimes.length > 0) {
          analytics.avgExecutionTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
        }
      }

      return analytics;
    } catch (error) {
      console.error('Failed to get migration analytics:', error);
      return { totalMigrations: 0, successRate: 100, avgExecutionTime: 0, trends: [] };
    }
  }

  /**
   * Get validation-specific analytics
   */
  async getValidationAnalytics(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      const validationData = await this.claudeFlow.retrieveMemory(MEMORY_NAMESPACES.VALIDATIONS);
      
      if (!validationData.success || !validationData.data) {
        return { totalValidations: 0, overallSuccessRate: 100, byType: {}, trends: [] };
      }

      const recentValidations = validationData.data
        .map(entry => entry.data)
        .filter(validation => new Date(validation.timestamp) >= startDate);

      const analytics = {
        totalValidations: recentValidations.length,
        overallSuccessRate: 100,
        byType: {},
        trends: []
      };

      let totalPassed = 0;
      let totalChecks = 0;

      recentValidations.forEach(validation => {
        const type = validation.type;
        const summary = validation.summary;

        if (!analytics.byType[type]) {
          analytics.byType[type] = {
            total: 0,
            passed: 0,
            failed: 0,
            warnings: 0,
            successRate: 100
          };
        }

        analytics.byType[type].total += summary.total;
        analytics.byType[type].passed += summary.passed;
        analytics.byType[type].failed += summary.failed;
        analytics.byType[type].warnings += summary.warnings;

        totalPassed += summary.passed;
        totalChecks += summary.total;
      });

      // Calculate success rates
      if (totalChecks > 0) {
        analytics.overallSuccessRate = (totalPassed / totalChecks) * 100;
      }

      Object.keys(analytics.byType).forEach(type => {
        const typeData = analytics.byType[type];
        if (typeData.total > 0) {
          typeData.successRate = (typeData.passed / typeData.total) * 100;
        }
      });

      return analytics;
    } catch (error) {
      console.error('Failed to get validation analytics:', error);
      return { totalValidations: 0, overallSuccessRate: 100, byType: {}, trends: [] };
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      const metricsData = await this.claudeFlow.retrieveMemory(MEMORY_NAMESPACES.METRICS);
      
      if (!metricsData.success || !metricsData.data) {
        return { components: {}, trends: [] };
      }

      const recentMetrics = metricsData.data
        .map(entry => entry.data)
        .filter(metric => new Date(metric.timestamp) >= startDate);

      const analytics = {
        components: {},
        trends: []
      };

      recentMetrics.forEach(metric => {
        const component = metric.component;
        const name = metric.name;

        if (!analytics.components[component]) {
          analytics.components[component] = {};
        }

        if (!analytics.components[component][name]) {
          analytics.components[component][name] = {
            values: [],
            avg: 0,
            min: Infinity,
            max: -Infinity,
            unit: metric.unit
          };
        }

        const metricData = analytics.components[component][name];
        metricData.values.push(metric.value);
        metricData.min = Math.min(metricData.min, metric.value);
        metricData.max = Math.max(metricData.max, metric.value);
      });

      // Calculate averages
      Object.keys(analytics.components).forEach(component => {
        Object.keys(analytics.components[component]).forEach(name => {
          const metricData = analytics.components[component][name];
          if (metricData.values.length > 0) {
            metricData.avg = metricData.values.reduce((sum, val) => sum + val, 0) / metricData.values.length;
            delete metricData.values; // Remove raw values to reduce size
          }
        });
      });

      return analytics;
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return { components: {}, trends: [] };
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts() {
    try {
      const alertsData = await this.claudeFlow.retrieveMemory(MEMORY_NAMESPACES.ALERTS);
      
      if (!alertsData.success || !alertsData.data) {
        return [];
      }

      return alertsData.data
        .map(entry => entry.data)
        .filter(alert => alert.status === 'ACTIVE')
        .sort((a, b) => {
          // Sort by severity, then by timestamp
          const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
          if (severityDiff !== 0) return severityDiff;
          return new Date(b.timestamp) - new Date(a.timestamp);
        });
    } catch (error) {
      console.error('Failed to get active alerts:', error);
      return [];
    }
  }

  /**
   * Get trends analysis
   */
  async getTrends(days = 7) {
    const trends = [];

    try {
      // Get basic analytics for trend calculation
      const analytics = await this.claudeFlow.getAnalytics(days);
      
      // Error rate trend
      if (analytics.errorRate > 5) {
        trends.push({
          type: 'error_rate',
          severity: analytics.errorRate > 20 ? 'HIGH' : 'MEDIUM',
          message: `High error rate: ${analytics.errorRate.toFixed(1)}%`,
          value: analytics.errorRate
        });
      }

      // Activity trend
      const avgActivityPerDay = analytics.totalLogs / days;
      if (avgActivityPerDay > 1000) {
        trends.push({
          type: 'high_activity',
          severity: 'MEDIUM',
          message: `High activity: ${avgActivityPerDay.toFixed(0)} operations/day`,
          value: avgActivityPerDay
        });
      }

      // Get drift trends
      const driftAnalytics = await this.getDriftAnalytics(days);
      if (driftAnalytics.totalDrifts > 10) {
        trends.push({
          type: 'drift_accumulation',
          severity: 'HIGH',
          message: `High drift count: ${driftAnalytics.totalDrifts} drifts`,
          value: driftAnalytics.totalDrifts
        });
      }

      // Get migration trends
      const migrationAnalytics = await this.getMigrationAnalytics(days);
      if (migrationAnalytics.successRate < 90) {
        trends.push({
          type: 'migration_failures',
          severity: 'HIGH',
          message: `Low migration success rate: ${migrationAnalytics.successRate.toFixed(1)}%`,
          value: migrationAnalytics.successRate
        });
      }

      return trends;
    } catch (error) {
      console.error('Failed to get trends:', error);
      return [];
    }
  }

  /**
   * Search across all memory namespaces
   */
  async globalSearch(query, limit = 100) {
    await this.initialize();

    const results = {
      logs: [],
      drifts: [],
      migrations: [],
      validations: [],
      alerts: []
    };

    try {
      // Search in each namespace
      const searchPromises = [
        this.claudeFlow.searchMemory(MEMORY_NAMESPACES.LOGS, `*${query}*`, limit),
        this.claudeFlow.searchMemory(MEMORY_NAMESPACES.DRIFT, `*${query}*`, limit),
        this.claudeFlow.searchMemory(MEMORY_NAMESPACES.MIGRATIONS, `*${query}*`, limit),
        this.claudeFlow.searchMemory(MEMORY_NAMESPACES.VALIDATIONS, `*${query}*`, limit),
        this.claudeFlow.searchMemory(MEMORY_NAMESPACES.ALERTS, `*${query}*`, limit)
      ];

      const searchResults = await Promise.all(searchPromises);

      results.logs = searchResults[0].success ? searchResults[0].data : [];
      results.drifts = searchResults[1].success ? searchResults[1].data : [];
      results.migrations = searchResults[2].success ? searchResults[2].data : [];
      results.validations = searchResults[3].success ? searchResults[3].data : [];
      results.alerts = searchResults[4].success ? searchResults[4].data : [];

      // Calculate total matches
      const totalMatches = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

      return {
        query,
        totalMatches,
        results,
        searchedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Global search failed:', error);
      return {
        query,
        totalMatches: 0,
        results,
        error: error.message,
        searchedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(days = 7, format = 'json') {
    await this.initialize();

    const report = {
      metadata: {
        generatedAt: new Date().toISOString(),
        period: `${days} days`,
        format
      },
      analytics: await this.getComprehensiveAnalytics(days),
      recentLogs: await this.claudeFlow.getRecentLogs(50),
      activeAlerts: await this.getActiveAlerts(),
      summary: {
        status: 'HEALTHY', // Will be calculated
        issues: [],
        recommendations: []
      }
    };

    // Calculate overall system health
    report.summary = this.calculateSystemHealth(report.analytics);

    // Store the report
    await this.claudeFlow.storeAnalytics({
      type: 'comprehensive_report',
      period: `${days}_days`,
      report,
      generatedAt: new Date().toISOString()
    });

    if (format === 'json') {
      return report;
    }

    // TODO: Implement other formats (CSV, HTML) if needed
    return JSON.stringify(report, null, 2);
  }

  /**
   * Calculate system health based on analytics
   */
  calculateSystemHealth(analytics) {
    const issues = [];
    const recommendations = [];
    let status = 'HEALTHY';

    // Check error rate
    if (analytics.overview.errorRate > 20) {
      status = 'CRITICAL';
      issues.push(`High error rate: ${analytics.overview.errorRate.toFixed(1)}%`);
      recommendations.push('Investigate error patterns and implement fixes');
    } else if (analytics.overview.errorRate > 5) {
      if (status === 'HEALTHY') status = 'WARNING';
      issues.push(`Elevated error rate: ${analytics.overview.errorRate.toFixed(1)}%`);
      recommendations.push('Monitor error trends closely');
    }

    // Check drift accumulation
    if (analytics.driftAnalysis.totalDrifts > 20) {
      if (status !== 'CRITICAL') status = 'WARNING';
      issues.push(`High drift count: ${analytics.driftAnalysis.totalDrifts} drifts`);
      recommendations.push('Address schema drifts to maintain consistency');
    }

    // Check migration success rate
    if (analytics.migrationAnalysis.successRate < 90) {
      status = 'CRITICAL';
      issues.push(`Low migration success rate: ${analytics.migrationAnalysis.successRate.toFixed(1)}%`);
      recommendations.push('Review migration processes and error handling');
    }

    // Check validation success rate
    if (analytics.validationAnalysis.overallSuccessRate < 95) {
      if (status === 'HEALTHY') status = 'WARNING';
      issues.push(`Low validation success rate: ${analytics.validationAnalysis.overallSuccessRate.toFixed(1)}%`);
      recommendations.push('Review and fix validation failures');
    }

    // Check active alerts
    const criticalAlerts = analytics.alerts?.filter(a => a.severity === 'CRITICAL')?.length || 0;
    if (criticalAlerts > 0) {
      status = 'CRITICAL';
      issues.push(`${criticalAlerts} critical alerts active`);
      recommendations.push('Address critical alerts immediately');
    }

    return { status, issues, recommendations };
  }

  // Helper methods

  detectCategory(operation, component) {
    if (operation.includes('migration')) return LOG_CATEGORIES.MIGRATION;
    if (operation.includes('drift')) return LOG_CATEGORIES.DRIFT_DETECTION;
    if (operation.includes('validation')) return LOG_CATEGORIES.VALIDATION;
    if (operation.includes('schema')) return LOG_CATEGORIES.SCHEMA_ANALYSIS;
    if (operation.includes('form')) return LOG_CATEGORIES.FORM_SCANNING;
    if (operation.includes('route')) return LOG_CATEGORIES.ROUTE_VALIDATION;
    if (operation.includes('warehouse')) return LOG_CATEGORIES.WAREHOUSE_VALIDATION;
    if (operation.includes('cleanup') || operation.includes('maintenance')) return LOG_CATEGORIES.MAINTENANCE;
    if (operation.includes('performance') || operation.includes('metric')) return LOG_CATEGORIES.PERFORMANCE;
    if (operation.includes('security') || operation.includes('auth')) return LOG_CATEGORIES.SECURITY;
    
    // Default category based on component
    if (component.includes('Migration')) return LOG_CATEGORIES.MIGRATION;
    if (component.includes('Drift')) return LOG_CATEGORIES.DRIFT_DETECTION;
    if (component.includes('Validator')) return LOG_CATEGORIES.VALIDATION;
    
    return LOG_CATEGORIES.MAINTENANCE; // Default fallback
  }

  generateSchemaHash(schema) {
    // Simple hash generation based on schema structure
    const crypto = require('crypto');
    const schemaString = JSON.stringify({
      tables: schema.tables?.map(t => ({ name: t.name, columns: t.columns?.length })) || [],
      indexes: schema.indexes?.length || 0,
      constraints: schema.constraints?.length || 0,
      enums: schema.enums?.length || 0,
      prismaModels: schema.prismaModels?.length || 0
    });
    
    return crypto.createHash('sha256').update(schemaString).digest('hex').substring(0, 16);
  }

  /**
   * Cleanup and end session
   */
  async cleanup() {
    if (this.initialized) {
      await this.claudeFlow.cleanupMemory();
      await this.claudeFlow.endSession();
      this.initialized = false;
    }
  }
}

module.exports = {
  MemoryHelpers,
  MEMORY_NAMESPACES,
  LOG_LEVELS,
  LOG_CATEGORIES
};
