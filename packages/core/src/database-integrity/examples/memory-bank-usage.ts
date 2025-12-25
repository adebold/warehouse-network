/**
 * Example usage of the Database Integrity Memory Bank system
 */

import { memoryBank } from '../memory-bank/memory-bank';
import { 
  IntegrityLogCategory, 
  IntegrityLogLevel,
  IntegrityAlertType,
  IntegrityAlertSeverity,
  IntegrityMetricType,
  SnapshotType
} from '@warehouse-network/db';

async function demonstrateMemoryBank() {
  console.log('🔍 Database Integrity Memory Bank Demo\n');

  // 1. Set a correlation ID for tracking related operations
  const correlationId = memoryBank.setCorrelationId();
  console.log(`📌 Correlation ID: ${correlationId}\n`);

  // 2. Log various operations
  console.log('📝 Logging operations...');
  
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

  console.log('✅ Logs recorded\n');

  // 3. Create an alert
  console.log('🚨 Creating alert...');
  
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
  
  console.log(`✅ Alert created: ${alert.id}\n`);

  // 4. Record metrics
  console.log('📊 Recording metrics...');
  
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

  console.log('✅ Metrics recorded\n');

  // 5. Create a snapshot
  console.log('📸 Creating snapshot...');
  
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

  console.log(`✅ Snapshot created: ${snapshot.id}\n`);

  // 6. Search logs
  console.log('🔍 Searching logs...');
  
  const searchResults = await memoryBank.searchLogs({
    category: IntegrityLogCategory.VALIDATION,
    level: IntegrityLogLevel.INFO,
    limit: 5
  });

  console.log(`Found ${searchResults.total} logs:`);
  searchResults.logs.forEach(log => {
    console.log(`  - [${log.level}] ${log.message} (${log.duration}ms)`);
  });
  console.log();

  // 7. Get analytics
  console.log('📈 Generating analytics...\n');
  
  const analytics = await memoryBank.getAnalytics(7); // Last 7 days
  
  console.log('Analytics Summary:');
  console.log(`  Health Score: ${analytics.summary.healthScore}%`);
  console.log(`  Total Logs: ${analytics.logs.totalLogs}`);
  console.log(`  Error Rate: ${(analytics.logs.errorRate * 100).toFixed(2)}%`);
  console.log(`  Average Duration: ${analytics.logs.avgDuration.toFixed(0)}ms`);
  console.log(`  Active Alerts: ${analytics.alerts.activeAlerts}`);
  
  if (analytics.summary.recommendations.length > 0) {
    console.log('\nRecommendations:');
    analytics.summary.recommendations.forEach((rec, idx) => {
      console.log(`  ${idx + 1}. ${rec}`);
    });
  }
  console.log();

  // 8. Export logs
  console.log('💾 Exporting logs...');
  
  const exportedData = await memoryBank.exportLogs({
    format: 'json',
    category: IntegrityLogCategory.VALIDATION
  });
  
  console.log(`✅ Exported ${exportedData.length} bytes of log data\n`);

  // 9. Demonstrate retention cleanup (dry run)
  console.log('🧹 Retention policy info:');
  
  const retentionStats = await memoryBank.retentionManager.getRetentionStats();
  console.log('Current retention statistics:');
  console.log(`  Logs: ${retentionStats.logs.length} categories tracked`);
  console.log(`  Snapshots: ${retentionStats.snapshots.length} types tracked`);
  console.log(`  Alerts: ${retentionStats.alerts.length} statuses tracked`);
  console.log();

  console.log('✨ Memory Bank demo completed!');
}

// Run the demo
if (require.main === module) {
  demonstrateMemoryBank().catch(console.error);
}