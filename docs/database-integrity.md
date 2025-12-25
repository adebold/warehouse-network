# Database Integrity System Documentation

## Overview

The Database Integrity System provides comprehensive database management, validation, and audit logging for the Warehouse Network platform. It includes migration management, drift detection, schema validation, and a memory bank system for detailed logging and compliance tracking.

## Features

- **Migration Management**: Track and execute database migrations with full audit trail
- **Drift Detection**: Identify discrepancies between schema and database state
- **Schema Validation**: Validate forms and API routes against database models
- **Memory Bank**: Comprehensive logging system for audit trails and debugging
- **Performance Monitoring**: Track execution times and resource usage
- **Alert System**: Proactive notifications for integrity issues

## Memory Bank System

### Overview

The Memory Bank is a persistent logging and auditing system that tracks all database integrity operations. It provides:

- Detailed operation logs with timestamps and metadata
- Performance metrics and execution times
- Error tracking with stack traces
- Compliance audit trails
- Alert management for critical issues

### Log Categories

- `VALIDATION`: Form and route validation operations
- `MIGRATION`: Database migration activities
- `DRIFT_DETECTION`: Schema drift analysis
- `SCHEMA_ANALYSIS`: Database schema examination
- `FORM_VALIDATION`: Form field validation against models
- `ROUTE_VALIDATION`: API route parameter validation
- `PERFORMANCE`: Performance metrics and benchmarks
- `ERROR`: Error logs with details
- `AUDIT`: Compliance and audit events
- `MAINTENANCE`: System maintenance activities

### Log Levels

- `DEBUG`: Detailed debugging information
- `INFO`: General informational messages
- `WARNING`: Warning conditions that should be reviewed
- `ERROR`: Error conditions that need attention
- `CRITICAL`: Critical failures requiring immediate action

## CLI Commands

### Basic Commands

```bash
# Check migration status
npm run db:integrity migrate:status

# Run pending migrations
npm run db:integrity migrate:run [--dry-run] [--force]

# Run Prisma migrations
npm run db:integrity migrate:prisma [--deploy]

# Detect schema drifts
npm run db:integrity drift:detect [--fix]

# Check Prisma schema drift
npm run db:integrity drift:prisma

# Validate forms
npm run db:integrity validate:forms

# Validate API routes
npm run db:integrity validate:routes

# Validate warehouse-specific integrity
npm run db:integrity validate:warehouse

# Analyze database schema
npm run db:integrity schema:analyze

# Run full integrity check
npm run db:integrity check
```

### Memory Bank Commands

```bash
# View recent logs
npm run db:integrity logs:view [options]
  -l, --limit <number>      Number of logs to show (default: 20)
  -c, --category <category> Filter by category
  --level <level>           Filter by level
  -f, --format <format>     Output format: table or json (default: table)

# Export logs
npm run db:integrity logs:export [options]
  -s, --start <date>        Start date (YYYY-MM-DD)
  -e, --end <date>          End date (YYYY-MM-DD)
  -f, --format <format>     Export format: json or csv (default: json)
  -o, --output <file>       Output file

# View log statistics
npm run db:integrity logs:stats [options]
  -d, --days <number>       Number of days to analyze (default: 7)
```

### Verbose Mode

Add `-v` or `--verbose` to any command to see detailed logs:

```bash
npm run db:integrity -v migrate:status
npm run db:integrity --verbose check
```

## Examples

### Viewing Recent Migration Logs

```bash
# View last 10 migration logs
npm run db:integrity logs:view -l 10 -c MIGRATION

# View all error logs from today
npm run db:integrity logs:view --level ERROR -l 50
```

### Exporting Logs for Compliance

```bash
# Export last 30 days of logs as CSV
npm run db:integrity logs:export -f csv -o audit-logs.csv

# Export specific date range as JSON
npm run db:integrity logs:export -s 2024-01-01 -e 2024-01-31 -o january-logs.json
```

### Monitoring System Health

```bash
# View log statistics for the last week
npm run db:integrity logs:stats

# Run full check with verbose logging
npm run db:integrity -v check

# Check for drifts and view detailed logs
npm run db:integrity -v drift:detect
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/warehouse_network
LOG_LEVEL=info  # debug, info, warning, error

# Memory Bank Configuration
MEMORY_BANK_RETENTION_DAYS=90  # How long to keep logs
MEMORY_BANK_MAX_SIZE_MB=1000   # Maximum size for log storage
MEMORY_BANK_ALERT_EMAIL=admin@example.com  # Email for critical alerts

# Session Configuration
SESSION_ID=unique-session-id  # Optional: Track operations by session
```

### Configuration File

Create a `db-integrity.config.js` file in your project root:

```javascript
module.exports = {
  database: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production',
    poolSize: 10,
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  memoryBank: {
    retentionDays: parseInt(process.env.MEMORY_BANK_RETENTION_DAYS || '90'),
    maxSizeMB: parseInt(process.env.MEMORY_BANK_MAX_SIZE_MB || '1000'),
    alertEmail: process.env.MEMORY_BANK_ALERT_EMAIL,
    categories: {
      // Custom category configurations
      MIGRATION: { level: 'INFO', retention: 180 },
      ERROR: { level: 'ERROR', retention: 365 }
    }
  },
  alerts: {
    enabled: true,
    channels: ['email', 'slack'],
    thresholds: {
      errorRate: 0.05,  // Alert if error rate exceeds 5%
      driftCount: 10,   // Alert if more than 10 drifts detected
      migrationFailure: 1  // Alert on any migration failure
    }
  }
};
```

## Database Schema

The memory bank uses the following tables:

### IntegrityLog
- Stores all operation logs
- Indexed by category, level, component, and timestamp
- Includes metadata and context for each log entry

### IntegritySnapshot
- Periodic snapshots of system state
- Tracks schema changes and drift detection
- Performance metrics over time

### IntegrityAlert
- Active alerts requiring attention
- Severity levels and acknowledgment tracking
- Resolution notes and history

### IntegrityMetric
- Performance and resource usage metrics
- Time-series data for trend analysis
- Component-level measurements

## Best Practices

1. **Run integrity checks regularly**: Schedule `npm run db:integrity check` in your CI/CD pipeline

2. **Monitor logs proactively**: Set up alerts for ERROR and CRITICAL level logs

3. **Export logs for compliance**: Regularly export and archive logs for audit purposes

4. **Use verbose mode for debugging**: When troubleshooting, use `-v` flag for detailed output

5. **Fix drifts immediately**: Address schema drifts as soon as they're detected

6. **Review performance metrics**: Monitor execution times to identify performance degradation

## Troubleshooting

### Common Issues

**Migration fails with "table already exists"**
- Check drift detection: `npm run db:integrity drift:detect`
- Review migration history: `npm run db:integrity migrate:status`

**Logs not appearing**
- Ensure memory bank tables exist: `npm run db:integrity migrate:prisma`
- Check database connection: `npm run db:integrity -v schema:analyze`

**Performance degradation**
- View performance metrics: `npm run db:integrity logs:view -c PERFORMANCE`
- Check log table size: May need to archive old logs

### Debug Mode

Enable debug logging for maximum detail:

```bash
LOG_LEVEL=debug npm run db:integrity -v check
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Database Integrity Check

on:
  pull_request:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight

jobs:
  integrity-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run integrity check
        run: npm run db:integrity check
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          
      - name: Export logs on failure
        if: failure()
        run: |
          npm run db:integrity logs:export -f json -o integrity-logs.json
          npm run db:integrity logs:view --level ERROR -l 50
          
      - name: Upload logs
        if: failure()
        uses: actions/upload-artifact@v2
        with:
          name: integrity-logs
          path: integrity-logs.json
```

## API Usage

The integrity system can also be used programmatically:

```javascript
const { DatabaseIntegritySystem } = require('@warehouse/core/database-integrity');

const integrity = new DatabaseIntegritySystem(config);
await integrity.initialize();

// Run checks
const result = await integrity.runFullIntegrityCheck();

// Access logs
const recentErrors = await integrity.getRecentLogs(10, 'ERROR');

// Create custom log
await integrity.log('CUSTOM', 'INFO', 'Custom operation completed', {
  duration: 1234,
  recordsProcessed: 5000
});
```

## Maintenance

### Log Cleanup

Implement regular log cleanup to manage storage:

```sql
-- Archive logs older than retention period
INSERT INTO integrity_log_archive 
SELECT * FROM "IntegrityLog" 
WHERE timestamp < NOW() - INTERVAL '90 days';

-- Delete archived logs
DELETE FROM "IntegrityLog" 
WHERE timestamp < NOW() - INTERVAL '90 days';
```

### Performance Optimization

Create additional indexes if needed:

```sql
-- Add index for frequent queries
CREATE INDEX CONCURRENTLY idx_integrity_log_user_timestamp 
ON "IntegrityLog"("userId", "timestamp") 
WHERE "userId" IS NOT NULL;
```

## Support

For issues or questions:
- Check logs first: `npm run db:integrity logs:view --level ERROR`
- Review documentation and examples
- Submit issues with log exports attached