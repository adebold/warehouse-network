# Database Integrity API Reference

Complete API reference for the Database Integrity System.

## Table of Contents

- [CLI Commands](#cli-commands)
- [Core API](#core-api)
- [Validation API](#validation-api)
- [Monitoring API](#monitoring-api)
- [Event System](#event-system)
- [Audit API](#audit-api)
- [Configuration](#configuration)
- [Integration Points](#integration-points)
- [TypeScript Types](#typescript-types)

## CLI Commands

### `db-integrity check`

Perform a comprehensive integrity check on the database.

```bash
npx db-integrity check [options]

Options:
  --table <name>     Check specific table only
  --deep             Perform deep validation (slower)
  --fix              Attempt to fix found issues
  --output <format>  Output format (json|table|csv)
  --silent           Suppress output except errors

Examples:
  npx db-integrity check
  npx db-integrity check --table user --deep
  npx db-integrity check --fix --output json
```

### `db-integrity monitor`

Start real-time monitoring of database operations.

```bash
npx db-integrity monitor [options]

Options:
  --port <number>    WebSocket port for real-time updates (default: 3001)
  --interval <ms>    Update interval in milliseconds (default: 1000)
  --metrics          Include performance metrics
  --alerts           Enable alerting

Examples:
  npx db-integrity monitor
  npx db-integrity monitor --port 8080 --metrics
  npx db-integrity monitor --interval 500 --alerts
```

### `db-integrity report`

Generate integrity reports.

```bash
npx db-integrity report [options]

Options:
  --period <range>   Report period (today|week|month|custom)
  --from <date>      Start date (YYYY-MM-DD)
  --to <date>        End date (YYYY-MM-DD)
  --format <type>    Output format (html|pdf|json|csv)
  --email <address>  Email report to address

Examples:
  npx db-integrity report --period week
  npx db-integrity report --from 2024-01-01 --to 2024-01-31
  npx db-integrity report --format pdf --email admin@example.com
```

### `db-integrity fix`

Fix common integrity issues.

```bash
npx db-integrity fix [options]

Options:
  --auto             Automatically fix safe issues
  --interactive      Interactive mode for manual decisions
  --type <types>     Comma-separated issue types to fix
  --dry-run          Show what would be fixed without applying

Examples:
  npx db-integrity fix --auto
  npx db-integrity fix --interactive
  npx db-integrity fix --type orphaned,duplicate --dry-run
```

### `db-integrity audit`

Query and manage audit logs.

```bash
npx db-integrity audit [options]

Options:
  --last <duration>  Show logs from last duration (e.g., 24h, 7d)
  --table <name>     Filter by table name
  --user <id>        Filter by user ID
  --operation <op>   Filter by operation (CREATE|UPDATE|DELETE)
  --export <file>    Export results to file

Examples:
  npx db-integrity audit --last 24h
  npx db-integrity audit --table user --operation UPDATE
  npx db-integrity audit --user user123 --export audit.csv
```

### `db-integrity init`

Initialize database integrity system.

```bash
npx db-integrity init [options]

Options:
  --schema <path>    Path to Prisma schema file
  --config <path>    Path to configuration file
  --force            Force re-initialization

Examples:
  npx db-integrity init
  npx db-integrity init --schema ./prisma/schema.prisma
  npx db-integrity init --config ./integrity.config.js --force
```

## Core API

### `DatabaseIntegrity`

Main class for database integrity operations.

```typescript
import { DatabaseIntegrity } from '@warehouse-network/db-integrity';

const dbIntegrity = new DatabaseIntegrity({
  prisma: prismaClient,
  config: {
    enableAutoRecovery: true,
    enableAuditLog: true,
    enablePerformanceMonitoring: true
  }
});
```

#### Methods

##### `check(options?: CheckOptions): Promise<CheckResult>`

Run integrity check.

```typescript
const result = await dbIntegrity.check({
  tables: ['user', 'order'],
  deep: true,
  concurrent: true
});

console.log(`Violations found: ${result.violations.length}`);
```

##### `fix(options?: FixOptions): Promise<FixResult>`

Fix integrity issues.

```typescript
const fixed = await dbIntegrity.fix({
  auto: true,
  types: ['orphaned-records', 'invalid-references'],
  dryRun: false
});

console.log(`Fixed ${fixed.count} issues`);
```

##### `generateReport(options?: ReportOptions): Promise<Report>`

Generate integrity report.

```typescript
const report = await dbIntegrity.generateReport({
  period: 'week',
  includeMetrics: true,
  format: 'html'
});
```

##### `middleware(): PrismaMiddleware`

Get Prisma middleware for automatic validation.

```typescript
prisma.$use(dbIntegrity.middleware());
```

## Validation API

### `addRule(rule: ValidationRule): void`

Add a validation rule.

```typescript
dbIntegrity.addRule({
  id: 'email-format',
  table: 'user',
  field: 'email',
  validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  message: 'Invalid email format',
  severity: 'error'
});
```

### `addAsyncRule(rule: AsyncValidationRule): void`

Add an asynchronous validation rule.

```typescript
dbIntegrity.addAsyncRule({
  id: 'unique-username',
  table: 'user',
  field: 'username',
  validate: async (value, context) => {
    const existing = await context.prisma.user.findFirst({
      where: { username: value, NOT: { id: context.recordId } }
    });
    return !existing;
  },
  message: 'Username already exists'
});
```

### `removeRule(ruleId: string): void`

Remove a validation rule.

```typescript
dbIntegrity.removeRule('email-format');
```

### `validateRecord(table: string, data: any): Promise<ValidationResult>`

Validate a single record.

```typescript
const result = await dbIntegrity.validateRecord('user', {
  email: 'invalid-email',
  name: 'John Doe'
});

if (!result.valid) {
  console.log('Validation errors:', result.errors);
}
```

### `validateBatch(records: BatchRecord[]): Promise<BatchValidationResult>`

Validate multiple records.

```typescript
const results = await dbIntegrity.validateBatch([
  { table: 'user', data: { email: 'user1@example.com' } },
  { table: 'user', data: { email: 'invalid' } }
]);

console.log(`Valid: ${results.valid.length}`);
console.log(`Invalid: ${results.invalid.length}`);
```

## Monitoring API

### `monitor.slowQuery(options: SlowQueryOptions): void`

Monitor slow queries.

```typescript
dbIntegrity.monitor.slowQuery({
  threshold: 1000, // ms
  callback: (query) => {
    console.log(`Slow query: ${query.sql}`);
    console.log(`Duration: ${query.duration}ms`);
  },
  filter: {
    tables: ['order', 'orderItem'],
    operations: ['SELECT', 'UPDATE']
  }
});
```

### `monitor.connectionHealth(options: ConnectionHealthOptions): void`

Monitor connection health.

```typescript
dbIntegrity.monitor.connectionHealth({
  interval: 60000, // Check every minute
  callback: (health) => {
    console.log(`Active connections: ${health.activeConnections}`);
    console.log(`Pool utilization: ${health.poolUtilization}%`);
    
    if (health.errors.length > 0) {
      console.error('Connection errors:', health.errors);
    }
  }
});
```

### `monitor.performance(options: PerformanceOptions): MonitoringHandle`

Monitor overall performance.

```typescript
const handle = dbIntegrity.monitor.performance({
  metrics: ['queryTime', 'connectionPool', 'transactionDuration'],
  interval: 5000,
  callback: (metrics) => {
    console.log('Average query time:', metrics.queryTime.avg);
    console.log('Active transactions:', metrics.transactions.active);
  }
});

// Stop monitoring
handle.stop();
```

### `monitor.realtime(options: RealtimeOptions): RealtimeMonitor`

Start real-time monitoring server.

```typescript
const monitor = dbIntegrity.monitor.realtime({
  port: 3001,
  auth: {
    enabled: true,
    token: process.env.MONITOR_TOKEN
  }
});

monitor.on('client-connected', (client) => {
  console.log(`Client connected: ${client.id}`);
});
```

## Event System

### Event Types

```typescript
type IntegrityEvent = 
  | 'violation'
  | 'recovery'
  | 'check-complete'
  | 'fix-applied'
  | 'slow-query'
  | 'connection-error'
  | 'audit-logged';
```

### `events.on(event: IntegrityEvent, handler: EventHandler): void`

Subscribe to events.

```typescript
dbIntegrity.events.on('violation', (event) => {
  console.log('Integrity violation:', {
    table: event.table,
    field: event.field,
    rule: event.ruleId,
    value: event.value
  });
});

dbIntegrity.events.on('recovery', (event) => {
  console.log('Recovery successful:', event.details);
});
```

### `events.once(event: IntegrityEvent, handler: EventHandler): void`

Subscribe to event once.

```typescript
dbIntegrity.events.once('check-complete', (result) => {
  console.log('Initial check complete:', result.summary);
});
```

### `events.off(event: IntegrityEvent, handler: EventHandler): void`

Unsubscribe from events.

```typescript
const handler = (event) => console.log(event);
dbIntegrity.events.on('violation', handler);
// Later...
dbIntegrity.events.off('violation', handler);
```

### `events.emit(event: IntegrityEvent, data: any): void`

Emit custom events.

```typescript
dbIntegrity.events.emit('custom-event', {
  type: 'manual-fix',
  table: 'user',
  fixed: 10
});
```

## Audit API

### `audit.log(entry: AuditEntry): Promise<void>`

Log an audit entry.

```typescript
await dbIntegrity.audit.log({
  table: 'user',
  recordId: 'user123',
  operation: 'UPDATE',
  userId: 'admin',
  changes: {
    email: {
      from: 'old@example.com',
      to: 'new@example.com'
    }
  }
});
```

### `audit.query(options: AuditQueryOptions): Promise<AuditEntry[]>`

Query audit logs.

```typescript
const logs = await dbIntegrity.audit.query({
  table: 'user',
  operation: 'UPDATE',
  userId: 'admin',
  dateFrom: new Date('2024-01-01'),
  dateTo: new Date(),
  limit: 100,
  offset: 0
});
```

### `audit.export(options: ExportOptions): Promise<void>`

Export audit logs.

```typescript
await dbIntegrity.audit.export({
  format: 'csv',
  path: './audit-export.csv',
  filters: {
    dateFrom: new Date('2024-01-01'),
    tables: ['user', 'order']
  }
});
```

### `audit.purge(options: PurgeOptions): Promise<number>`

Purge old audit logs.

```typescript
const deleted = await dbIntegrity.audit.purge({
  olderThan: 90, // days
  tables: ['session'], // Only purge specific tables
  dryRun: false
});

console.log(`Purged ${deleted} audit entries`);
```

## Configuration

### Configuration Options

```typescript
interface IntegrityConfig {
  // Core settings
  enableAutoRecovery: boolean;
  enableAuditLog: boolean;
  enablePerformanceMonitoring: boolean;
  
  // Validation settings
  validationLevel: 'full' | 'essential' | 'minimal';
  asyncValidation: boolean;
  cacheValidation: boolean;
  validationTimeout: number;
  
  // Monitoring settings
  monitoring: {
    slowQueryThreshold: number;
    connectionCheckInterval: number;
    metricsInterval: number;
    retentionDays: number;
  };
  
  // Recovery settings
  recovery: {
    maxRetries: number;
    retryDelay: number;
    autoRollback: boolean;
    recoveryStrategies: string[];
  };
  
  // Audit settings
  audit: {
    enabled: boolean;
    logLevel: 'all' | 'writes' | 'errors';
    excludeTables: string[];
    includeReadOperations: boolean;
  };
  
  // Performance settings
  performance: {
    maxConcurrentValidations: number;
    batchSize: number;
    cacheSize: number;
    cacheTTL: number;
  };
  
  // Debug settings
  debug: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
}
```

### `configure(config: Partial<IntegrityConfig>): void`

Update configuration.

```typescript
dbIntegrity.configure({
  validationLevel: 'essential',
  asyncValidation: true,
  monitoring: {
    slowQueryThreshold: 500,
    connectionCheckInterval: 30000
  },
  audit: {
    excludeTables: ['session', 'log']
  }
});
```

### `getConfig(): IntegrityConfig`

Get current configuration.

```typescript
const config = dbIntegrity.getConfig();
console.log('Current validation level:', config.validationLevel);
```

## Integration Points

### Prisma Middleware

```typescript
// Basic middleware
prisma.$use(dbIntegrity.middleware());

// Advanced middleware with options
prisma.$use(dbIntegrity.middleware({
  operations: ['create', 'update'],
  tables: ['user', 'order'],
  skipValidation: (params) => params.args.skipIntegrity === true
}));
```

### Express Middleware

```typescript
import { integrityMiddleware } from '@warehouse-network/db-integrity/express';

// Apply to all routes
app.use(integrityMiddleware(dbIntegrity));

// Apply to specific routes
app.post('/api/users', 
  integrityMiddleware(dbIntegrity, { table: 'user' }),
  userController.create
);
```

### GraphQL Integration

```typescript
import { integrityPlugin } from '@warehouse-network/db-integrity/graphql';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    integrityPlugin(dbIntegrity, {
      // Plugin options
      validateInputs: true,
      auditMutations: true
    })
  ]
});
```

### NestJS Integration

```typescript
import { IntegrityModule } from '@warehouse-network/db-integrity/nest';

@Module({
  imports: [
    IntegrityModule.forRoot({
      prisma: PrismaService,
      config: {
        enableAutoRecovery: true
      }
    })
  ]
})
export class AppModule {}
```

## TypeScript Types

### Core Types

```typescript
interface ValidationRule {
  id: string;
  table: string;
  field?: string;
  validate: (value: any, context?: ValidationContext) => boolean;
  message: string;
  severity?: 'error' | 'warning' | 'info';
}

interface AsyncValidationRule extends Omit<ValidationRule, 'validate'> {
  validate: (value: any, context: ValidationContext) => Promise<boolean>;
}

interface ValidationContext {
  prisma: PrismaClient;
  recordId?: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  user?: { id: string; role: string };
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  rule: string;
  message: string;
  value: any;
}
```

### Monitoring Types

```typescript
interface SlowQueryEvent {
  sql: string;
  params: any[];
  duration: number;
  table: string;
  operation: string;
  timestamp: Date;
}

interface ConnectionHealth {
  isHealthy: boolean;
  activeConnections: number;
  idleConnections: number;
  poolUtilization: number;
  errors: ConnectionError[];
  lastCheck: Date;
}

interface PerformanceMetrics {
  queryTime: {
    avg: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  };
  connectionPool: {
    size: number;
    active: number;
    idle: number;
    waiting: number;
  };
  transactions: {
    active: number;
    completed: number;
    failed: number;
    avgDuration: number;
  };
}
```

### Audit Types

```typescript
interface AuditEntry {
  id?: string;
  table: string;
  recordId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ';
  userId?: string;
  changes?: Record<string, { from: any; to: any }>;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

interface AuditQueryOptions {
  table?: string;
  recordId?: string;
  userId?: string;
  operation?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'table' | 'operation';
  order?: 'asc' | 'desc';
}
```

### Report Types

```typescript
interface IntegrityReport {
  summary: {
    totalChecks: number;
    violations: number;
    fixes: number;
    healthScore: number;
  };
  violations: ViolationDetail[];
  performance: PerformanceMetrics;
  recommendations: Recommendation[];
  generatedAt: Date;
}

interface ViolationDetail {
  table: string;
  field?: string;
  type: string;
  count: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  examples: any[];
}
```

## Advanced Usage

### Custom Recovery Strategies

```typescript
dbIntegrity.addRecoveryStrategy({
  name: 'restore-soft-deleted',
  canRecover: (violation) => violation.type === 'soft-delete-orphan',
  recover: async (violation, context) => {
    await context.prisma[violation.table].update({
      where: { id: violation.recordId },
      data: { deletedAt: null }
    });
    return { success: true, message: 'Restored soft-deleted record' };
  }
});
```

### Custom Metrics Collector

```typescript
dbIntegrity.metrics.addCollector({
  name: 'cache-hit-rate',
  interval: 5000,
  collect: async () => {
    const stats = await getCacheStats();
    return {
      hitRate: stats.hits / (stats.hits + stats.misses),
      size: stats.size,
      evictions: stats.evictions
    };
  }
});
```

### Webhook Integration

```typescript
dbIntegrity.webhooks.add({
  url: 'https://api.example.com/integrity-webhook',
  events: ['violation', 'recovery', 'check-complete'],
  headers: {
    'Authorization': 'Bearer ' + process.env.WEBHOOK_TOKEN
  },
  retries: 3
});
```

## Error Handling

All API methods throw typed errors:

```typescript
try {
  await dbIntegrity.check();
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.violations);
  } else if (error instanceof ConnectionError) {
    console.error('Database connection error:', error.message);
  } else if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message);
  }
}
```

## Best Practices

1. **Start with essential validation** and gradually increase
2. **Use async validation** for non-critical checks
3. **Cache validation results** for repeated operations
4. **Monitor performance impact** and adjust accordingly
5. **Regular audit log cleanup** to manage storage
6. **Test recovery strategies** in staging environment
7. **Use appropriate event handlers** for critical violations
8. **Document custom rules** for team understanding