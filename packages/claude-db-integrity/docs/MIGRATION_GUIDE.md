# Migration Guide

## 🔄 Migrating from Custom Database Integrity Solutions

### From Custom Validation Scripts

If you currently have custom database validation scripts, here's how to migrate:

#### 1. Assess Current Implementation

```bash
# Analyze your current validation patterns
find . -name "*.js" -o -name "*.ts" | xargs grep -l "validate\|schema\|integrity" > current-validation-files.txt

# Review your current database setup
grep -r "CREATE TABLE\|ALTER TABLE\|DROP TABLE" . --include="*.sql" > schema-changes.txt
```

#### 2. Map Current Validations

```javascript
// Before: Custom validation function
function validateUser(userData) {
  const errors = [];
  
  if (!userData.email || !isValidEmail(userData.email)) {
    errors.push('Invalid email');
  }
  
  if (!userData.name || userData.name.length < 2) {
    errors.push('Name must be at least 2 characters');
  }
  
  return { isValid: errors.length === 0, errors };
}

// After: Claude DB Integrity schema
// schemas/user.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "description": "User email address"
    },
    "name": {
      "type": "string",
      "minLength": 2,
      "description": "User full name"
    }
  },
  "required": ["email", "name"]
}
```

#### 3. Migration Script

```javascript
// migration/migrate-validations.js
import { ValidationManager, SchemaManager } from 'claude-db-integrity';
import fs from 'fs/promises';
import path from 'path';

async function migrateValidations() {
  const schemaManager = new SchemaManager();
  const validator = new ValidationManager();
  
  // 1. Convert existing validations to JSON Schema
  const existingValidations = await loadExistingValidations();
  
  for (const [entityName, validation] of existingValidations) {
    const schema = convertToJsonSchema(validation);
    await schemaManager.saveSchema(entityName, schema);
  }
  
  // 2. Test new validations against existing data
  const testData = await loadTestData();
  
  for (const [entityName, data] of testData) {
    console.log(`Testing ${entityName}...`);
    const results = await validator.validateBatch(entityName, data);
    
    if (results.some(r => !r.isValid)) {
      console.warn(`⚠️ Validation failures found in ${entityName}`);
      await fs.writeFile(
        `migration-issues-${entityName}.json`,
        JSON.stringify(results.filter(r => !r.isValid), null, 2)
      );
    }
  }
  
  console.log('✅ Migration completed');
}

function convertToJsonSchema(validation) {
  // Convert your existing validation logic to JSON Schema
  // This function would be customized based on your current validation format
}
```

### From Prisma Schema Validation

#### Migration Steps

```bash
# 1. Install claude-db-integrity
npm install claude-db-integrity

# 2. Initialize with Prisma integration
npx claude-db-integrity init --template=prisma

# 3. Generate schemas from Prisma models
npx claude-db-integrity generate-schemas --source=prisma
```

#### Prisma Integration

```javascript
// Before: Prisma-only validation
// prisma/schema.prisma
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String
  posts Post[]
}

// After: Enhanced with Claude DB Integrity
// claude-db-integrity.config.js
export default {
  database: {
    type: 'prisma',
    schemaPath: './prisma/schema.prisma'
  },
  schemas: {
    user: {
      email: { format: 'email', unique: true },
      name: { minLength: 2, maxLength: 100 },
      businessRules: [
        {
          name: 'email-domain-whitelist',
          rule: 'email.endsWith("@company.com") || email.endsWith("@partner.com")'
        }
      ]
    }
  }
};
```

### From TypeORM with Class Validators

#### Migration Process

```typescript
// Before: TypeORM with class-validator
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { IsEmail, MinLength, MaxLength } from 'class-validator';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @IsEmail()
  email: string;

  @Column()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

// After: Enhanced with Claude DB Integrity
import { Entity, Column, PrimaryGeneratedColumn, BeforeInsert, BeforeUpdate } from 'typeorm';
import { ValidationManager } from 'claude-db-integrity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  name: string;

  private static validator = new ValidationManager();

  @BeforeInsert()
  @BeforeUpdate()
  async validateEntity() {
    const result = await User.validator.validate('user', this);
    if (!result.isValid) {
      throw new Error(`Validation failed: ${result.errors.join(', ')}`);
    }
  }
}
```

## 📊 From Manual Database Monitoring

### Current State Assessment

```sql
-- Before: Manual monitoring queries
-- Check for orphaned records
SELECT COUNT(*) FROM orders WHERE user_id NOT IN (SELECT id FROM users);

-- Check data consistency
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public';

-- Check for constraint violations
SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE NOT convalidated;
```

### After: Automated Monitoring

```javascript
// monitoring/integrity-monitor.js
import { IntegrityEngine, ClaudeMemoryManager } from 'claude-db-integrity';
import cron from 'node-cron';

class IntegrityMonitor {
  constructor() {
    this.engine = new IntegrityEngine();
    this.memory = new ClaudeMemoryManager();
  }

  async setupAutomatedChecks() {
    // Daily comprehensive check
    cron.schedule('0 2 * * *', async () => {
      console.log('Starting daily integrity check...');
      const report = await this.engine.runIntegrityChecks();
      
      // Store results in Claude memory for analysis
      await this.memory.store('daily-integrity-report', {
        date: new Date().toISOString(),
        summary: report.summary,
        issues: report.issues,
        recommendations: report.recommendations
      });
      
      if (report.summary.failed > 0) {
        await this.sendAlert(report);
      }
    });

    // Hourly drift detection
    cron.schedule('0 * * * *', async () => {
      const drift = await this.engine.checkSchemaDrift();
      if (drift.hasChanges) {
        await this.memory.store('schema-drift-alert', drift);
        await this.notifyDevelopers(drift);
      }
    });
  }

  async sendAlert(report) {
    // Send alerts via your preferred method (Slack, email, etc.)
    console.error('🚨 Integrity check failures detected:', report.summary);
  }

  async notifyDevelopers(drift) {
    console.warn('⚠️ Schema drift detected:', drift.changes);
  }
}

export default IntegrityMonitor;
```

## 🔧 From Custom Logging Solutions

### Database Change Tracking Migration

```javascript
// Before: Custom audit logging
function logDatabaseChange(table, operation, oldData, newData, userId) {
  const auditLog = {
    table,
    operation,
    old_data: JSON.stringify(oldData),
    new_data: JSON.stringify(newData),
    user_id: userId,
    timestamp: new Date()
  };
  
  // Insert into custom audit_log table
  db.query('INSERT INTO audit_log SET ?', auditLog);
}

// After: Claude DB Integrity with enhanced tracking
import { IntegrityEngine, ClaudeMemoryManager } from 'claude-db-integrity';

class EnhancedAuditLogger {
  constructor() {
    this.integrity = new IntegrityEngine();
    this.memory = new ClaudeMemoryManager();
  }

  async logChange(table, operation, changes, context = {}) {
    // Enhanced logging with Claude memory integration
    const auditEntry = {
      table,
      operation,
      changes,
      context,
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      userId: context.userId,
      clientInfo: context.clientInfo
    };

    // Store in database
    await this.integrity.logChange(auditEntry);

    // Store in Claude memory for pattern analysis
    await this.memory.store(`audit:${table}:${Date.now()}`, {
      ...auditEntry,
      metadata: {
        risk_score: this.calculateRiskScore(changes),
        patterns: await this.detectPatterns(table, operation),
        recommendations: await this.generateRecommendations(changes)
      }
    });

    // Trigger integrity checks if high-risk change
    if (this.calculateRiskScore(changes) > 7) {
      await this.integrity.runTargetedCheck(table);
    }
  }

  calculateRiskScore(changes) {
    // Implement risk scoring logic
    let score = 0;
    
    if (changes.deletedRecords > 100) score += 3;
    if (changes.modifiedCriticalFields) score += 5;
    if (changes.structuralChanges) score += 8;
    
    return Math.min(score, 10);
  }

  async detectPatterns(table, operation) {
    // Use Claude memory to detect patterns
    const recentChanges = await this.memory.search(
      `audit:${table}:*`,
      { limit: 100, timeRange: '24h' }
    );
    
    return this.analyzePatterns(recentChanges);
  }
}
```

## 🧪 Testing Migration

### Comprehensive Migration Test Suite

```javascript
// tests/migration.test.js
import { IntegrityEngine, ValidationManager } from 'claude-db-integrity';
import { describe, test, beforeAll, afterAll } from '@jest/globals';

describe('Migration from Custom Solution', () => {
  let integrityEngine;
  let validator;
  let legacyData;

  beforeAll(async () => {
    integrityEngine = new IntegrityEngine({
      database: { type: 'test' } // Use test database
    });
    validator = new ValidationManager();
    
    // Load legacy test data
    legacyData = await loadLegacyTestData();
  });

  test('all legacy validations pass with new system', async () => {
    for (const [entityType, records] of legacyData) {
      console.log(`Testing ${records.length} ${entityType} records...`);
      
      for (const record of records) {
        const result = await validator.validate(entityType, record);
        
        if (!result.isValid) {
          console.error(`Validation failed for ${entityType}:`, {
            record: record.id,
            errors: result.errors
          });
        }
        
        expect(result.isValid).toBe(true);
      }
    }
  });

  test('performance is acceptable', async () => {
    const startTime = Date.now();
    
    // Run integrity checks on legacy data
    const report = await integrityEngine.runIntegrityChecks();
    
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    expect(report.summary.failed).toBe(0);
  });

  test('schema drift detection works', async () => {
    // Simulate schema change
    await simulateSchemaChange('users', {
      added: [{ name: 'new_column', type: 'VARCHAR(255)' }]
    });
    
    const drift = await integrityEngine.checkSchemaDrift();
    
    expect(drift.hasChanges).toBe(true);
    expect(drift.changes.added).toHaveLength(1);
  });

  afterAll(async () => {
    await integrityEngine.shutdown();
  });
});

async function loadLegacyTestData() {
  // Load your existing test data
  return new Map([
    ['user', await loadUserData()],
    ['order', await loadOrderData()],
    ['product', await loadProductData()]
  ]);
}
```

## 📋 Migration Checklist

### Pre-Migration

- [ ] **Backup all databases and configurations**
- [ ] **Document current validation logic**
- [ ] **Identify all database tables and relationships**
- [ ] **Map current error handling workflows**
- [ ] **Document current monitoring processes**
- [ ] **Test migration on staging environment**

### During Migration

- [ ] **Install claude-db-integrity package**
- [ ] **Initialize with appropriate template**
- [ ] **Configure database connections**
- [ ] **Migrate validation schemas**
- [ ] **Set up Claude memory integration**
- [ ] **Configure monitoring and alerts**
- [ ] **Test all validations with existing data**

### Post-Migration

- [ ] **Verify all validations work correctly**
- [ ] **Confirm monitoring is functioning**
- [ ] **Test error handling and recovery**
- [ ] **Validate performance metrics**
- [ ] **Update documentation**
- [ ] **Train team on new system**
- [ ] **Set up automated tests**
- [ ] **Monitor for issues in production**

### Rollback Plan

```javascript
// rollback/rollback-plan.js
class MigrationRollback {
  constructor() {
    this.backupPath = './migration-backup';
  }

  async createBackup() {
    // Backup current validation logic
    await this.backupValidationFiles();
    await this.backupDatabaseSchema();
    await this.backupConfigurations();
  }

  async rollback() {
    console.log('🔄 Starting rollback process...');
    
    try {
      // 1. Restore original validation files
      await this.restoreValidationFiles();
      
      // 2. Restore database schema if needed
      await this.restoreDatabaseSchema();
      
      // 3. Remove claude-db-integrity package
      await this.uninstallPackage();
      
      // 4. Restore original configurations
      await this.restoreConfigurations();
      
      console.log('✅ Rollback completed successfully');
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }

  async verifyRollback() {
    // Verify system is working with original validation
    const tests = await this.runOriginalTests();
    return tests.allPassed;
  }
}
```

## 🔗 Integration with Existing Workflows

### Git Hooks Integration

```bash
#!/bin/sh
# .git/hooks/pre-commit

# Run integrity checks before commit
echo "Running database integrity checks..."

# Check for schema drift
npx claude-db-integrity drift --check-only

# Validate any schema changes
if git diff --cached --name-only | grep -E '\.(sql|prisma)$'; then
    echo "Schema changes detected, running validation..."
    npx claude-db-integrity validate --staged-files
fi

# Run quick integrity check
npx claude-db-integrity check --quick --fail-fast

if [ $? -ne 0 ]; then
    echo "❌ Integrity checks failed. Commit aborted."
    exit 1
fi

echo "✅ Integrity checks passed"
```

### CI/CD Pipeline Updates

```yaml
# .github/workflows/database-integrity.yml
name: Database Integrity
on: [push, pull_request]

jobs:
  integrity-check:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: |
          npm ci
          npm install claude-db-integrity
          
      - name: Run migration verification
        run: npm run test:migration
        
      - name: Run integrity checks
        run: npx claude-db-integrity check --format=junit
        
      - name: Upload results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: integrity-results
          path: integrity-results.xml
```

## 💡 Best Practices for Migration

### 1. Gradual Migration Strategy

```javascript
// Implement feature flags for gradual rollout
const MIGRATION_FLAGS = {
  USE_CLAUDE_INTEGRITY: process.env.FEATURE_CLAUDE_INTEGRITY === 'true',
  MIGRATION_PERCENTAGE: parseInt(process.env.MIGRATION_PERCENTAGE) || 0
};

function shouldUseClaude(entityType, entityId) {
  if (!MIGRATION_FLAGS.USE_CLAUDE_INTEGRITY) return false;
  
  // Use consistent hashing for gradual rollout
  const hash = require('crypto')
    .createHash('md5')
    .update(`${entityType}-${entityId}`)
    .digest('hex');
    
  const percentage = parseInt(hash.slice(0, 2), 16) / 255 * 100;
  return percentage < MIGRATION_FLAGS.MIGRATION_PERCENTAGE;
}

async function validateEntity(entityType, data) {
  if (shouldUseClaude(entityType, data.id)) {
    // Use new Claude DB Integrity system
    const validator = new ValidationManager();
    return await validator.validate(entityType, data);
  } else {
    // Use legacy validation
    return await legacyValidation(entityType, data);
  }
}
```

### 2. Monitoring During Migration

```javascript
// Monitor both systems during migration
import { IntegrityEngine } from 'claude-db-integrity';

class MigrationMonitor {
  constructor() {
    this.metrics = {
      claudeValidations: 0,
      legacyValidations: 0,
      claudeFailures: 0,
      legacyFailures: 0,
      discrepancies: 0
    };
  }

  async compareValidationResults(entityType, data) {
    // Run both validations
    const [claudeResult, legacyResult] = await Promise.all([
      this.runClaudeValidation(entityType, data),
      this.runLegacyValidation(entityType, data)
    ]);

    // Track metrics
    this.updateMetrics(claudeResult, legacyResult);

    // Alert on discrepancies
    if (claudeResult.isValid !== legacyResult.isValid) {
      await this.alertDiscrepancy(entityType, data, claudeResult, legacyResult);
    }

    return claudeResult; // Use Claude result going forward
  }

  updateMetrics(claudeResult, legacyResult) {
    this.metrics.claudeValidations++;
    this.metrics.legacyValidations++;
    
    if (!claudeResult.isValid) this.metrics.claudeFailures++;
    if (!legacyResult.isValid) this.metrics.legacyFailures++;
    
    if (claudeResult.isValid !== legacyResult.isValid) {
      this.metrics.discrepancies++;
    }
  }
}
```

## 🎯 Success Metrics

Track these metrics to measure migration success:

- **Validation Accuracy**: 99.9% agreement between old and new systems
- **Performance**: Response time within 10% of legacy system
- **Coverage**: 100% of existing validation rules migrated
- **Reliability**: Zero false positives in production
- **Team Adoption**: 100% of team trained on new system

## 🆘 Emergency Procedures

### Immediate Rollback

```bash
#!/bin/bash
# emergency-rollback.sh

echo "🚨 Emergency rollback initiated"

# 1. Switch to maintenance mode
kubectl patch deployment app -p '{"spec":{"replicas":0}}'

# 2. Restore from backup
./scripts/restore-from-backup.sh

# 3. Remove claude-db-integrity
npm uninstall claude-db-integrity

# 4. Restore original validation
git checkout HEAD~1 -- lib/validation/

# 5. Restart application
kubectl patch deployment app -p '{"spec":{"replicas":3}}'

echo "✅ Emergency rollback completed"
```

### Recovery Verification

```javascript
// emergency-verification.js
async function verifyEmergencyRecovery() {
  console.log('🔍 Verifying emergency recovery...');
  
  const checks = [
    () => testDatabaseConnection(),
    () => runLegacyValidationTests(),
    () => checkApplicationHealth(),
    () => verifyUserFunctionality()
  ];
  
  for (const check of checks) {
    try {
      await check();
      console.log('✅ Check passed');
    } catch (error) {
      console.error('❌ Check failed:', error);
      throw new Error('Recovery verification failed');
    }
  }
  
  console.log('🎉 Emergency recovery verified successfully');
}
```

This comprehensive migration guide provides step-by-step instructions for migrating from various existing database integrity solutions to the claude-db-integrity package, with detailed examples, testing strategies, and emergency procedures.