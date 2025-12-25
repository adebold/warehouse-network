# Database Integrity Memory Bank

A comprehensive logging and auditing system for the Database Integrity System in warehouse-network. The Memory Bank provides complete audit trails, performance analytics, and alerting capabilities for all database integrity operations.

## Features

- **Comprehensive Logging**: Track all integrity operations with detailed metadata
- **Alert Management**: Create and manage alerts for critical integrity issues
- **Performance Metrics**: Record and analyze performance metrics
- **Snapshots**: Periodic state captures for historical comparison
- **Analytics**: Generate insights and recommendations from logs
- **Retention Management**: Automatic cleanup based on configurable policies
- **Export Capabilities**: Export logs in JSON or CSV format

## Components

### 1. IntegrityLog
Stores all integrity operation logs with:
- Category-based organization (validation, migration, drift detection, etc.)
- Multiple severity levels (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- Operation tracking with duration metrics
- Error details and stack traces
- Correlation IDs for tracking related operations

### 2. IntegritySnapshot
Captures periodic system state including:
- Schema hash and statistics
- Validation results
- Drift detection status
- Performance metrics
- Configurable snapshot types (hourly, daily, weekly, monthly, on-demand)

### 3. IntegrityAlert
Manages important events requiring attention:
- Multiple alert types (drift, validation failure, migration error, etc.)
- Severity levels (LOW, MEDIUM, HIGH, CRITICAL)
- Acknowledgment and resolution tracking
- Affected models and fields tracking

### 4. IntegrityMetric
Records performance and operational metrics:
- Validation times
- Migration durations
- Error rates
- Throughput metrics
- Component-specific measurements

## Usage

### Basic Logging

```typescript
import { memoryBank } from '@warehouse-network/core';
import { IntegrityLogCategory, IntegrityLogLevel } from '@warehouse-network/db';

// Log an operation
await memoryBank.log({
  category: IntegrityLogCategory.VALIDATION,
  level: IntegrityLogLevel.INFO,
  operation: 'validateSchema',
  component: 'SchemaValidator',
  message: 'Schema validation completed',
  duration: 234,
  success: true
});
```

### Creating Alerts

```typescript
await memoryBank.createAlert({
  alertType: IntegrityAlertType.DRIFT_DETECTED,
  severity: IntegrityAlertSeverity.HIGH,
  title: 'Critical schema drift detected',
  description: 'Multiple tables have drifted from expected state',
  affectedModels: ['User', 'Customer', 'Warehouse']
});
```

### Recording Metrics

```typescript
await memoryBank.recordMetric({
  metricType: IntegrityMetricType.MIGRATION_TIME,
  component: 'MigrationEngine',
  name: 'migration_execution_time',
  value: 1234,
  unit: 'ms'
});
```

### Searching Logs

```typescript
const results = await memoryBank.searchLogs({
  category: IntegrityLogCategory.MIGRATION,
  level: IntegrityLogLevel.ERROR,
  startDate: new Date('2024-01-01'),
  searchText: 'constraint violation',
  limit: 50
});
```

### Generating Analytics

```typescript
const analytics = await memoryBank.getAnalytics(7); // Last 7 days

console.log(`Health Score: ${analytics.summary.healthScore}%`);
console.log(`Recommendations: ${analytics.summary.recommendations}`);
```

## CLI Commands

The memory bank includes a comprehensive CLI for log management:

```bash
# View recent logs
npm run memory-bank logs --category VALIDATION --days 7

# Search logs
npm run memory-bank search "error" --days 30

# View analytics
npm run memory-bank analytics --days 7

# Export logs
npm run memory-bank export --format csv --output logs.csv

# View alerts
npm run memory-bank alerts --status active

# Run retention cleanup
npm run memory-bank cleanup --dry-run
```

## Web UI

Access the Memory Bank UI at `/admin/integrity-logs` (requires SUPER_ADMIN role).

Features:
- Real-time log viewing with search and filters
- Alert management with acknowledgment/resolution
- Analytics dashboard with visualizations
- Log export functionality

## Retention Policies

Default retention periods:
- **Audit logs**: 365 days
- **Error logs**: 90 days
- **Migration logs**: 90 days
- **Performance logs**: 7 days
- **Form/Route validation**: 14 days
- **General logs**: 30 days

Snapshots:
- Hourly: Keep last 24
- Daily: Keep last 7
- Weekly: Keep last 4
- Monthly: Keep last 12

## Integration with Database Integrity System

The Memory Bank is automatically integrated with all integrity components:

1. **DriftDetector**: Logs all drift detection operations and creates alerts
2. **MigrationEngine**: Tracks migration execution with detailed metrics
3. **FormScanner**: Records form validation results
4. **RouteValidator**: Logs API route validation findings
5. **SchemaAnalyzer**: Captures schema analysis metrics

## Performance Considerations

- Logs are indexed by category, level, component, and timestamp
- Batch operations available for high-volume logging
- Configurable retention policies to manage data growth
- Asynchronous processing for non-critical operations

## Best Practices

1. **Use Correlation IDs**: Group related operations using correlation IDs
2. **Set Appropriate Levels**: Use DEBUG for detailed info, ERROR for failures
3. **Include Metadata**: Add relevant details to help with debugging
4. **Monitor Alerts**: Regularly check and address active alerts
5. **Review Analytics**: Use insights to improve system performance
6. **Configure Retention**: Adjust retention based on compliance needs