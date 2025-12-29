/**
 * Example usage of the Database Integrity Memory Bank system
 */

import { 
import { logger } from '../../../../../../../../utils/logger';
  IntegrityLogCategory, 
  IntegrityLogLevel,
  IntegrityAlertType,
  IntegrityAlertSeverity,
  IntegrityMetricType,
  SnapshotType
} from '@warehouse-network/db';

import { memoryBank } from '../memory-bank/memory-bank';

async function demonstrateMemoryBank() {
  logger.info('🔍 Database Integrity Memory Bank Demo\n');

  // 1. Set a correlation ID for tracking related operations
  const correlationId = memoryBank.setCorrelationId();
  logger.info(`📌 Correlation ID: ${correlationId}\n`);

  // 2. Log various operations
  logger.info('📝 Logging operations...');
  
  // Log a successful validation
  await memoryBank.log({
    category: IntegrityLogCategory.VALIDATION,
    level: IntegrityLogLevel.INFO,
    operation: 'validateSchema',
    component: 'SchemaValidator',
    message: 'Schema validation completed successfully',
    details: { models: 15, fields: 127, relations: 23 },
    duration: 234,
    success: true,
    correlationId
  });

  // Log a warning
  await memoryBank.log({
    category: IntegrityLogCategory.DRIFT_DETECTION,
    level: IntegrityLogLevel.WARNING,
    operation: 'detectDrift',
    component: 'DriftDetector',
    message: 'Minor schema drift detected',
    details: { 
      drifts: [
        { table: 'users', field: 'lastLogin', type: 'type_mismatch' }
      ]
    },
    duration: 456,
    success: true,
    correlationId
  });

  // Log an error
  await memoryBank.log({
    category: IntegrityLogCategory.MIGRATION,
    level: IntegrityLogLevel.ERROR,
    operation: 'runMigration',
    component: 'MigrationEngine',
    message: 'Migration failed: constraint violation',
    duration: 789,
    success: false,
    error: new Error('Foreign key constraint violation'),
    correlationId
  });

  logger.info('✅ Logs recorded\n');

  // 3. Create an alert
  logger.info('🚨 Creating alert...');
  
  const alert = await memoryBank.createAlert({
    alertType: IntegrityAlertType.DRIFT_DETECTED,
    severity: IntegrityAlertSeverity.MEDIUM,
    title: 'Schema drift requires attention',
    description: 'The database schema has drifted from the expected state. Manual review recommended.',
    affectedModels: ['User', 'Customer'],
    affectedFields: ['users.lastLogin', 'customers.paymentStatus'],
    details: {
      driftsCount: 2,
      autoFixable: 1,
      correlationId
    }
  });
  
  logger.info(`✅ Alert created: ${alert.id}\n`);

  // 4. Record metrics
  logger.info('📊 Recording metrics...');
  
  await memoryBank.recordMetric({
    metricType: IntegrityMetricType.VALIDATION_TIME,
    component: 'SchemaValidator',
    name: 'schema_validation_duration',
    value: 234,
    unit: 'ms'
  });

  await memoryBank.recordMetric({
    metricType: IntegrityMetricType.ERROR_RATE,
    component: 'MigrationEngine',
    name: 'migration_error_rate',
    value: 0.05,
    unit: 'ratio'
  });

  logger.info('✅ Metrics recorded\n');

  // 5. Create a snapshot
  logger.info('📸 Creating snapshot...');
  
  const snapshot = await memoryBank.createSnapshot(
    SnapshotType.ON_DEMAND,
    {
      schemaHash: 'a1b2c3d4e5f6',
      modelCount: 15,
      fieldCount: 127,
      relationCount: 23,
      indexCount: 45,
      enumCount: 8,
      validationsPassed: 125,
      validationsFailed: 2,
      driftDetected: true,
      driftDetails: {
        driftsCount: 2,
        criticalDrifts: 0
      },
      performanceMetrics: {
        avgValidationTime: 234,
        avgMigrationTime: 567
      }
    }
  );

  logger.info(`✅ Snapshot created: ${snapshot.id}\n`);

  // 6. Search logs
  logger.info('🔍 Searching logs...');
  
  const searchResults = await memoryBank.searchLogs({
    category: IntegrityLogCategory.VALIDATION,
    level: IntegrityLogLevel.INFO,
    limit: 5
  });

  logger.info(`Found ${searchResults.total} logs:`);
  searchResults.logs.forEach(log => {
    logger.info(`  - [${log.level}] ${log.message} (${log.duration}ms)`);
  });
  logger.info();

  // 7. Get analytics
  logger.info('📈 Generating analytics...\n');
  
  const analytics = await memoryBank.getAnalytics(7); // Last 7 days
  
  logger.info('Analytics Summary:');
  logger.info(`  Health Score: ${analytics.summary.healthScore}%`);
  logger.info(`  Total Logs: ${analytics.logs.totalLogs}`);
  logger.info(`  Error Rate: ${(analytics.logs.errorRate * 100).toFixed(2)}%`);
  logger.info(`  Average Duration: ${analytics.logs.avgDuration.toFixed(0)}ms`);
  logger.info(`  Active Alerts: ${analytics.alerts.activeAlerts}`);
  
  if (analytics.summary.recommendations.length > 0) {
    logger.info('\nRecommendations:');
    analytics.summary.recommendations.forEach((rec, idx) => {
      logger.info(`  ${idx + 1}. ${rec}`);
    });
  }
  logger.info();

  // 8. Export logs
  logger.info('💾 Exporting logs...');
  
  const exportedData = await memoryBank.exportLogs({
    format: 'json',
    category: IntegrityLogCategory.VALIDATION
  });
  
  logger.info(`✅ Exported ${exportedData.length} bytes of log data\n`);

  // 9. Demonstrate retention cleanup (dry run)
  logger.info('🧹 Retention policy info:');
  
  const retentionStats = await memoryBank.retentionManager.getRetentionStats();
  logger.info('Current retention statistics:');
  logger.info(`  Logs: ${retentionStats.logs.length} categories tracked`);
  logger.info(`  Snapshots: ${retentionStats.snapshots.length} types tracked`);
  logger.info(`  Alerts: ${retentionStats.alerts.length} statuses tracked`);
  logger.info();

  logger.info('✨ Memory Bank demo completed!');
}

// Run the demo
if (require.main === module) {
  demonstrateMemoryBank().catch(console.error);
}