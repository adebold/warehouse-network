# Integration Guide

## 🚀 Quick Integration Examples

### Next.js Applications

#### 1. API Routes Integration

```javascript
// pages/api/integrity/check.ts
import { createIntegrityEngine, healthCheck } from 'claude-db-integrity';

export default async function handler(req, res) {
  try {
    const result = await healthCheck();
    res.status(result.status === 'healthy' ? 200 : 503).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### 2. Middleware Integration

```javascript
// middleware.ts
import { createNextJSMiddleware } from 'claude-db-integrity/nextjs';

const integrityMiddleware = createNextJSMiddleware({
  enableMonitoring: true,
  logViolations: true,
  strictMode: process.env.NODE_ENV === 'production'
});

export function middleware(request) {
  return integrityMiddleware(request);
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*']
};
```

#### 3. Component-Level Validation

```tsx
// components/UserForm.tsx
import { useIntegrityValidation } from 'claude-db-integrity/react';

export function UserForm() {
  const { validate, errors, isValid } = useIntegrityValidation('user-schema');
  
  const handleSubmit = async (data) => {
    const result = await validate(data);
    if (result.isValid) {
      // Submit data
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      {errors.map(error => (
        <div key={error.field} className="error">
          {error.message}
        </div>
      ))}
    </form>
  );
}
```

### Express.js Applications

#### 1. Global Middleware

```javascript
// app.js
import express from 'express';
import { createExpressMiddleware } from 'claude-db-integrity/express';

const app = express();

// Integrity middleware
app.use(createExpressMiddleware({
  autoCheck: true,
  checkInterval: 300000, // 5 minutes
  logLevel: 'info'
}));

// Routes
app.get('/health', async (req, res) => {
  const { healthCheck } = await import('claude-db-integrity');
  const result = await healthCheck();
  res.json(result);
});

export default app;
```

#### 2. Route-Specific Validation

```javascript
// routes/users.js
import { Router } from 'express';
import { ValidationManager } from 'claude-db-integrity';

const router = Router();
const validator = new ValidationManager();

router.post('/users', async (req, res) => {
  // Validate request data
  const validation = await validator.validate('user', req.body);
  
  if (!validation.isValid) {
    return res.status(400).json({
      errors: validation.errors
    });
  }
  
  // Process valid data
  const user = await createUser(req.body);
  res.json(user);
});

export default router;
```

### NestJS Applications

#### 1. Module Integration

```typescript
// integrity.module.ts
import { Module } from '@nestjs/common';
import { IntegrityService } from './integrity.service';
import { IntegrityController } from './integrity.controller';

@Module({
  providers: [IntegrityService],
  controllers: [IntegrityController],
  exports: [IntegrityService]
})
export class IntegrityModule {}
```

#### 2. Service Implementation

```typescript
// integrity.service.ts
import { Injectable } from '@nestjs/common';
import { IntegrityEngine, ClaudeMemoryManager } from 'claude-db-integrity';

@Injectable()
export class IntegrityService {
  private engine: IntegrityEngine;
  private memory: ClaudeMemoryManager;
  
  constructor() {
    this.engine = new IntegrityEngine();
    this.memory = new ClaudeMemoryManager();
  }
  
  async checkIntegrity() {
    return await this.engine.runIntegrityChecks();
  }
  
  async validateEntity(schema: string, data: any) {
    // Implementation
  }
}
```

#### 3. Decorator-Based Validation

```typescript
// decorators/validate.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ValidationManager } from 'claude-db-integrity';

export const ValidateBody = createParamDecorator(
  async (schema: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const validator = new ValidationManager();
    
    const result = await validator.validate(schema, request.body);
    if (!result.isValid) {
      throw new BadRequestException(result.errors);
    }
    
    return request.body;
  },
);

// Usage in controller
@Post('users')
async createUser(@ValidateBody('user-schema') userData: CreateUserDto) {
  return this.userService.create(userData);
}
```

## 🗃 Database Integration Examples

### Prisma Integration

```javascript
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Add integrity tracking
model IntegrityLog {
  id        String   @id @default(cuid())
  tableName String
  operation String
  oldData   Json?
  newData   Json?
  userId    String?
  timestamp DateTime @default(now())
  
  @@map("integrity_logs")
}
```

```javascript
// lib/prisma-integrity.js
import { PrismaClient } from '@prisma/client';
import { IntegrityEngine } from 'claude-db-integrity';

const prisma = new PrismaClient();
const integrity = new IntegrityEngine({
  database: {
    type: 'prisma',
    client: prisma
  }
});

// Add middleware for automatic logging
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  
  // Log operation to integrity system
  await integrity.logOperation({
    model: params.model,
    action: params.action,
    args: params.args,
    duration: after - before
  });
  
  return result;
});

export { prisma, integrity };
```

### TypeORM Integration

```typescript
// entities/BaseEntity.ts
import { 
  BaseEntity as TypeORMBaseEntity,
  BeforeInsert,
  BeforeUpdate,
  AfterInsert,
  AfterUpdate
} from 'typeorm';
import { IntegrityEngine } from 'claude-db-integrity';

export abstract class BaseEntity extends TypeORMBaseEntity {
  private static integrity = new IntegrityEngine();
  
  @BeforeInsert()
  async validateBeforeInsert() {
    await BaseEntity.integrity.validateEntity(
      this.constructor.name.toLowerCase(),
      this
    );
  }
  
  @BeforeUpdate()
  async validateBeforeUpdate() {
    await BaseEntity.integrity.validateEntity(
      this.constructor.name.toLowerCase(),
      this
    );
  }
  
  @AfterInsert()
  @AfterUpdate()
  async logChange() {
    await BaseEntity.integrity.logChange(
      this.constructor.name.toLowerCase(),
      this
    );
  }
}
```

## 🔧 Configuration Examples

### Environment-Based Configuration

```javascript
// config/integrity.config.js
const config = {
  development: {
    database: {
      type: 'prisma',
      url: process.env.DATABASE_URL
    },
    claude: {
      enabled: true,
      namespace: 'dev-integrity',
      syncInterval: 60
    },
    monitoring: {
      enabled: true,
      level: 'debug'
    },
    validation: {
      strict: false,
      autoFix: true
    }
  },
  
  production: {
    database: {
      type: 'prisma',
      url: process.env.DATABASE_URL
    },
    claude: {
      enabled: true,
      namespace: 'prod-integrity',
      syncInterval: 300
    },
    monitoring: {
      enabled: true,
      level: 'error'
    },
    validation: {
      strict: true,
      autoFix: false
    }
  }
};

export default config[process.env.NODE_ENV || 'development'];
```

### Advanced Configuration

```javascript
// claude-db-integrity.config.js
export default {
  // Core settings
  database: {
    type: 'prisma',
    schemaPath: './prisma/schema.prisma',
    migrations: './prisma/migrations'
  },
  
  // Claude Flow integration
  claude: {
    enabled: true,
    namespace: 'warehouse-network-integrity',
    memoryTtl: 3600,
    syncInterval: 300,
    batchSize: 100
  },
  
  // Validation rules
  validation: {
    schemas: './schemas',
    strict: true,
    customRules: {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^\+?[\d\s\-\(\)]+$/
    }
  },
  
  // Monitoring
  monitoring: {
    enabled: true,
    dashboardPort: 3001,
    metricsInterval: 60,
    alerts: {
      email: process.env.ALERT_EMAIL,
      slack: process.env.SLACK_WEBHOOK
    }
  },
  
  // Persona testing
  personas: {
    enabled: true,
    directory: './personas',
    runInterval: 86400, // Daily
    browser: {
      headless: true,
      viewport: { width: 1280, height: 720 }
    }
  },
  
  // Security
  security: {
    enableAuditLog: true,
    encryptSensitiveData: true,
    maxRetries: 3,
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  }
};
```

## 🐳 Docker Integration

### Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Install claude-db-integrity
RUN npm install claude-db-integrity

# Build application
RUN npm run build

# Health check using integrity package
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "import('claude-db-integrity').then(m => m.healthCheck()).then(r => process.exit(r.status === 'healthy' ? 0 : 1))"

EXPOSE 3000

CMD ["npm", "start"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/app
      - CLAUDE_INTEGRITY_ENABLED=true
    depends_on:
      - db
      - redis
    healthcheck:
      test: ["CMD", "npm", "run", "health-check"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=app
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## 🔄 CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/integrity-check.yml
name: Database Integrity Check

on: [push, pull_request]

jobs:
  integrity-check:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run integrity checks
        run: |
          npm install claude-db-integrity
          npx claude-db-integrity init --template=generic
          npx claude-db-integrity check --verbose
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
```

### Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
        DATABASE_URL = credentials('database-url')
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'nvm use ${NODE_VERSION}'
                sh 'npm ci'
                sh 'npm install claude-db-integrity'
            }
        }
        
        stage('Integrity Check') {
            steps {
                sh 'npx claude-db-integrity check --format=junit > integrity-results.xml'
            }
            post {
                always {
                    junit 'integrity-results.xml'
                }
            }
        }
        
        stage('Deploy') {
            when { branch 'main' }
            steps {
                sh 'npm run deploy'
            }
        }
    }
}
```

## 🧪 Testing Integration

### Jest Configuration

```javascript
// jest.config.js
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};
```

```javascript
// jest.setup.js
import { IntegrityEngine } from 'claude-db-integrity';

// Setup integrity engine for tests
global.integrityEngine = new IntegrityEngine({
  database: {
    type: 'memory' // Use in-memory database for tests
  },
  claude: {
    enabled: false // Disable Claude integration in tests
  }
});

beforeEach(async () => {
  await global.integrityEngine.reset();
});

afterAll(async () => {
  await global.integrityEngine.shutdown();
});
```

### Test Examples

```javascript
// tests/integrity.test.js
import { ValidationManager } from 'claude-db-integrity';

describe('Integrity Validation', () => {
  const validator = new ValidationManager();
  
  test('validates user data correctly', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User',
      age: 25
    };
    
    const result = await validator.validate('user', userData);
    expect(result.isValid).toBe(true);
  });
  
  test('rejects invalid email format', async () => {
    const userData = {
      email: 'invalid-email',
      name: 'Test User',
      age: 25
    };
    
    const result = await validator.validate('user', userData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'email',
      message: 'Invalid email format'
    });
  });
});
```

## 📊 Monitoring Integration

### Application Performance Monitoring

```javascript
// lib/apm.js
import { IntegrityEngine } from 'claude-db-integrity';

const integrity = new IntegrityEngine();

// Custom APM integration
export function setupAPMIntegration(apmClient) {
  integrity.on('check-completed', (result) => {
    apmClient.addMetric('integrity.checks.total', result.total);
    apmClient.addMetric('integrity.checks.failed', result.failed);
  });
  
  integrity.on('drift-detected', (drift) => {
    apmClient.addAlert('Database Schema Drift Detected', {
      table: drift.table,
      changes: drift.changes
    });
  });
}
```

### Custom Metrics

```javascript
// lib/metrics.js
import { register, Counter, Histogram } from 'prom-client';
import { IntegrityEngine } from 'claude-db-integrity';

const integrityChecksTotal = new Counter({
  name: 'integrity_checks_total',
  help: 'Total number of integrity checks performed',
  labelNames: ['status', 'type']
});

const integrityCheckDuration = new Histogram({
  name: 'integrity_check_duration_seconds',
  help: 'Duration of integrity checks',
  labelNames: ['type']
});

// Export metrics endpoint
export async function getMetrics() {
  const integrity = new IntegrityEngine();
  const report = await integrity.getMetrics();
  
  integrityChecksTotal.labels('success', 'automated').inc(report.successfulChecks);
  integrityChecksTotal.labels('failed', 'automated').inc(report.failedChecks);
  
  return register.metrics();
}
```

## 💡 Best Practices

### 1. Gradual Rollout

```javascript
// gradual-rollout.js
import { IntegrityEngine } from 'claude-db-integrity';

// Start with monitoring only
const integrity = new IntegrityEngine({
  mode: 'monitor', // Don't fail operations, just log
  rollout: {
    percentage: 10, // Only apply to 10% of operations
    userBased: true // Consistent per user
  }
});

// Gradually increase percentage based on confidence
setTimeout(() => {
  integrity.updateConfig({ rollout: { percentage: 50 } });
}, 7 * 24 * 60 * 60 * 1000); // After 1 week
```

### 2. Feature Flags Integration

```javascript
// feature-flags.js
import { IntegrityEngine } from 'claude-db-integrity';

const integrity = new IntegrityEngine();

// LaunchDarkly integration example
integrity.setFeatureFlags({
  'strict-validation': () => ldClient.variation('strict-validation', user, false),
  'auto-fix-enabled': () => ldClient.variation('auto-fix-enabled', user, true),
  'claude-sync': () => ldClient.variation('claude-sync', user, true)
});
```

### 3. Error Boundaries

```tsx
// ErrorBoundary.tsx
import React from 'react';
import { IntegrityEngine } from 'claude-db-integrity';

class IntegrityErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.integrity = new IntegrityEngine();
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log to integrity system
    this.integrity.logError({
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong. Our team has been notified.</h1>;
    }

    return this.props.children;
  }
}
```

## 🚀 Advanced Use Cases

### Multi-Tenant Applications

```javascript
// multi-tenant.js
import { IntegrityEngine } from 'claude-db-integrity';

class TenantIntegrityManager {
  constructor() {
    this.engines = new Map();
  }
  
  getEngine(tenantId) {
    if (!this.engines.has(tenantId)) {
      const engine = new IntegrityEngine({
        database: {
          url: `postgresql://user:pass@db:5432/tenant_${tenantId}`
        },
        claude: {
          namespace: `tenant-${tenantId}-integrity`
        }
      });
      this.engines.set(tenantId, engine);
    }
    return this.engines.get(tenantId);
  }
  
  async checkAll() {
    const results = [];
    for (const [tenantId, engine] of this.engines) {
      try {
        const result = await engine.runIntegrityChecks();
        results.push({ tenantId, ...result });
      } catch (error) {
        results.push({ tenantId, error: error.message });
      }
    }
    return results;
  }
}
```

### Microservices Architecture

```javascript
// microservice-integrity.js
import { IntegrityEngine } from 'claude-db-integrity';

export class MicroserviceIntegrity {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.integrity = new IntegrityEngine({
      service: serviceName,
      claude: {
        namespace: `microservice-${serviceName}`,
        crossServiceSync: true
      }
    });
  }
  
  async registerWithDiscovery() {
    // Register integrity endpoint with service discovery
    await serviceDiscovery.register({
      name: this.serviceName,
      health: `/health/integrity`,
      metadata: {
        integrityVersion: this.integrity.version
      }
    });
  }
  
  async syncWithOtherServices() {
    const services = await serviceDiscovery.getServices();
    for (const service of services) {
      if (service.metadata?.integrityVersion) {
        await this.integrity.syncWith(service.name);
      }
    }
  }
}
```

This comprehensive integration guide provides examples for all major frameworks and use cases, making it easy for developers to adopt the claude-db-integrity package across different project types and architectures.