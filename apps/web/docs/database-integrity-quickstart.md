# Database Integrity Quick Start Guide

Get up and running with the Database Integrity System in minutes!

## Installation

### 1. Install Required Packages

```bash
# Install core package
npm install @warehouse-network/db-integrity

# Install peer dependencies if not already installed
npm install @prisma/client prisma
```

### 2. Setup Prisma Schema

Ensure your Prisma schema includes the integrity model:

```prisma
// prisma/schema.prisma

model IntegrityCheck {
  id          String   @id @default(cuid())
  table       String
  operation   String
  status      String
  details     Json?
  createdAt   DateTime @default(now())
  resolvedAt  DateTime?
  
  @@index([table, status])
  @@index([createdAt])
}

model AuditLog {
  id          String   @id @default(cuid())
  table       String
  recordId    String
  operation   String
  userId      String?
  changes     Json
  timestamp   DateTime @default(now())
  
  @@index([table, recordId])
  @@index([timestamp])
}
```

### 3. Initialize Database Integrity

```typescript
// lib/db-integrity.ts
import { PrismaClient } from '@prisma/client';
import { DatabaseIntegrity } from '@warehouse-network/db-integrity';

const prisma = new PrismaClient();

export const dbIntegrity = new DatabaseIntegrity({
  prisma,
  config: {
    enableAutoRecovery: true,
    enableAuditLog: true,
    enablePerformanceMonitoring: true
  }
});

// Apply middleware to Prisma
prisma.$use(dbIntegrity.middleware());

export { prisma };
```

## Basic Usage

### 1. Simple Validation Rules

```typescript
// Add a validation rule for user emails
dbIntegrity.addRule({
  table: 'user',
  field: 'email',
  validate: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  message: 'Invalid email format'
});

// Add a rule for inventory quantities
dbIntegrity.addRule({
  table: 'inventory',
  field: 'quantity',
  validate: (value) => value >= 0,
  message: 'Inventory quantity cannot be negative'
});
```

### 2. Monitor Database Operations

```typescript
// Monitor slow queries
dbIntegrity.monitor.slowQuery({
  threshold: 1000, // milliseconds
  callback: (query) => {
    console.warn(`Slow query detected: ${query.duration}ms`);
    console.warn(`SQL: ${query.sql}`);
  }
});

// Monitor connection health
dbIntegrity.monitor.connectionHealth({
  interval: 60000, // Check every minute
  callback: (health) => {
    if (!health.isHealthy) {
      console.error('Database connection issues detected');
    }
  }
});
```

### 3. Handle Events

```typescript
// Listen for integrity violations
dbIntegrity.events.on('violation', (event) => {
  console.error('Integrity violation:', {
    table: event.table,
    field: event.field,
    value: event.value,
    rule: event.rule
  });
});

// Listen for successful recoveries
dbIntegrity.events.on('recovery', (event) => {
  console.log('Automatic recovery successful:', event);
});
```

## Common Commands

### CLI Commands

```bash
# Check database integrity
npx db-integrity check

# Generate integrity report
npx db-integrity report

# Fix common issues
npx db-integrity fix --auto

# Monitor in real-time
npx db-integrity monitor

# View audit logs
npx db-integrity audit --last 24h
```

### Programmatic Commands

```typescript
// Run integrity check
const results = await dbIntegrity.check();
console.log(`Found ${results.violations.length} violations`);

// Generate report
const report = await dbIntegrity.generateReport();
console.log(report.summary);

// Fix violations
const fixed = await dbIntegrity.fix({
  auto: true,
  types: ['orphaned-records', 'invalid-references']
});
console.log(`Fixed ${fixed.count} issues`);
```

## Common Use Cases

### 1. Prevent Invalid Data Entry

```typescript
// Validate before saving
const user = await prisma.user.create({
  data: {
    email: 'invalid-email', // Will throw validation error
    name: 'John Doe'
  }
});
```

### 2. Monitor Performance

```typescript
// Set up performance alerts
dbIntegrity.monitor.performance({
  slowQueryThreshold: 500,
  highLoadThreshold: 80,
  alerts: {
    email: 'admin@example.com',
    slack: process.env.SLACK_WEBHOOK
  }
});
```

### 3. Audit Trail

```typescript
// Query audit logs
const changes = await dbIntegrity.audit.query({
  table: 'user',
  dateFrom: new Date('2024-01-01'),
  dateTo: new Date(),
  operation: 'UPDATE'
});

changes.forEach(change => {
  console.log(`User ${change.recordId} updated by ${change.userId}`);
  console.log('Changes:', change.changes);
});
```

### 4. Batch Operations

```typescript
// Validate batch operations
const results = await dbIntegrity.validateBatch([
  { table: 'user', data: { email: 'user1@example.com' } },
  { table: 'user', data: { email: 'user2@example.com' } },
  { table: 'user', data: { email: 'invalid-email' } }
]);

console.log(`Valid: ${results.valid.length}`);
console.log(`Invalid: ${results.invalid.length}`);
```

## Troubleshooting

### Common Issues

#### 1. "Cannot find module '@warehouse-network/db-integrity'"
```bash
# Solution: Ensure package is installed
npm install @warehouse-network/db-integrity
```

#### 2. "Prisma client is not initialized"
```typescript
// Solution: Initialize Prisma before Database Integrity
const prisma = new PrismaClient();
await prisma.$connect();

const dbIntegrity = new DatabaseIntegrity({ prisma });
```

#### 3. "Validation rules not triggering"
```typescript
// Solution: Ensure middleware is applied
prisma.$use(dbIntegrity.middleware());
```

#### 4. "Performance impact on queries"
```typescript
// Solution: Adjust validation level
dbIntegrity.configure({
  validationLevel: 'essential', // 'full' | 'essential' | 'minimal'
  asyncValidation: true
});
```

### Debug Mode

Enable debug mode for detailed logging:

```typescript
// Enable debug logging
dbIntegrity.configure({
  debug: true,
  logLevel: 'verbose'
});

// Or via environment variable
process.env.DB_INTEGRITY_DEBUG = 'true';
```

### Performance Tips

1. **Use Async Validation** for non-critical operations
   ```typescript
   dbIntegrity.configure({ asyncValidation: true });
   ```

2. **Cache Validation Results** for repeated operations
   ```typescript
   dbIntegrity.configure({ cacheValidation: true });
   ```

3. **Selective Monitoring** to reduce overhead
   ```typescript
   dbIntegrity.monitor.configure({
     tables: ['user', 'order'], // Only monitor specific tables
     operations: ['CREATE', 'UPDATE'] // Only monitor specific operations
   });
   ```

## Quick Examples

### Example 1: E-commerce Order Validation

```typescript
// Ensure order totals are correct
dbIntegrity.addRule({
  table: 'order',
  validate: async (data, { prisma }) => {
    const items = await prisma.orderItem.findMany({
      where: { orderId: data.id }
    });
    
    const calculatedTotal = items.reduce((sum, item) => 
      sum + (item.quantity * item.price), 0
    );
    
    return Math.abs(calculatedTotal - data.total) < 0.01;
  },
  message: 'Order total does not match item sum'
});
```

### Example 2: User Authentication Security

```typescript
// Validate password changes
dbIntegrity.addRule({
  table: 'user',
  field: 'password',
  validate: async (value, { prisma, recordId }) => {
    // Ensure password is hashed
    if (value.length < 60) {
      return false;
    }
    
    // Check password history
    const history = await prisma.passwordHistory.findMany({
      where: { userId: recordId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    // Ensure password is not reused
    return !history.some(h => h.hash === value);
  },
  message: 'Invalid password or password recently used'
});
```

### Example 3: Real-time Monitoring Dashboard

```typescript
// Set up real-time monitoring
const monitoring = dbIntegrity.monitor.realtime({
  websocket: true,
  port: 3001
});

// Connect from frontend
const ws = new WebSocket('ws://localhost:3001');
ws.on('message', (data) => {
  const event = JSON.parse(data);
  updateDashboard(event);
});
```

## Next Steps

- Read the [full documentation](./database-integrity.md)
- Explore the [API reference](./database-integrity-api.md)
- Check out [advanced configuration](./database-integrity-config.md)
- Learn [best practices](./database-integrity-best-practices.md)

## Support

- GitHub Issues: [github.com/warehouse-network/db-integrity/issues](https://github.com/warehouse-network/db-integrity/issues)
- Documentation: [docs.warehouse-network.com/db-integrity](https://docs.warehouse-network.com/db-integrity)
- Community Discord: [discord.gg/warehouse-network](https://discord.gg/warehouse-network)