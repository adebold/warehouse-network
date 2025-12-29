# @warehouse-network/claude-dev-standards

Enterprise development standards enforcement with automated security validation, RBAC implementation, and production-grade CI/CD pipelines.

## 🚀 Features

- **Zero Mocks Policy** - Enforces production-ready code from day one
- **Enterprise Security** - RBAC, JWT, security headers, input validation
- **Database Standards** - PostgreSQL optimization, migrations, pooling
- **CI/CD Automation** - GitHub Actions, quality gates, security scanning
- **Compliance Monitoring** - SOC2, ISO 27001, GDPR compliance checks
- **Code Quality** - ESLint rules, Prettier, TypeScript strict mode
- **Security Scanning** - Automated vulnerability detection
- **Template Generation** - Production-ready project templates

## 📦 Installation

```bash
npm install -g @warehouse-network/claude-dev-standards
```

## 🛠️ Quick Start

### Initialize New Project

```bash
# Create enterprise-grade project
claude-dev-standards init --template enterprise --name my-app

# Initialize existing project
claude-dev-standards init --existing

# Setup security standards
claude-dev-standards setup --security --rbac --database
```

### Validate Project

```bash
# Check all standards
claude-dev-standards check

# Security-only validation  
claude-dev-standards security

# Fix common issues
claude-dev-standards fix --auto
```

### Programmatic Usage

```typescript
import { StandardsEngine, ValidationEngine } from '@warehouse-network/claude-dev-standards';

// Create standards engine
const engine = new StandardsEngine({
  standards: 'enterprise',
  noMocks: true,
  productionReady: true
});

// Validate project
const results = await engine.validateProject('./src');
console.log(results);

// Auto-fix issues
await engine.fixIssues('./src', { 
  autoFix: true,
  backup: true 
});
```

## 🔧 Configuration

### `.claude-standards.json`

```json
{
  "standards": "enterprise",
  "enforcements": {
    "noMocks": true,
    "productionReady": true,
    "realDatabases": true,
    "authentication": true,
    "encryption": true,
    "auditLogging": true
  },
  "security": {
    "rbac": {
      "enabled": true,
      "roles": ["admin", "operator", "customer"],
      "permissions": ["read", "write", "delete", "admin"]
    },
    "authentication": {
      "jwt": true,
      "refreshTokens": true,
      "passwordPolicy": "strong"
    },
    "headers": {
      "helmet": true,
      "cors": true,
      "csp": true
    }
  },
  "database": {
    "type": "postgresql",
    "ssl": true,
    "pooling": true,
    "migrations": true,
    "backup": true
  },
  "monitoring": {
    "logging": "structured",
    "metrics": "prometheus",
    "tracing": "opentelemetry",
    "healthChecks": true
  }
}
```

## 🛡️ Security Standards

### Authentication & Authorization

```typescript
// Enforced RBAC implementation
import { RBACManager, AuthMiddleware } from '@warehouse-network/claude-dev-standards';

const rbac = new RBACManager({
  roles: {
    admin: ['read', 'write', 'delete', 'admin'],
    operator: ['read', 'write'],
    customer: ['read']
  }
});

// JWT middleware
app.use(AuthMiddleware({
  jwtSecret: process.env.JWT_SECRET,
  refreshTokens: true,
  rbac: rbac
}));
```

### Security Headers

```typescript
// Automatically configured security headers
import { SecurityHeaders } from '@warehouse-network/claude-dev-standards';

app.use(SecurityHeaders({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));
```

## 🗄️ Database Standards

### PostgreSQL Configuration

```typescript
// Enforced database standards
const dbConfig = {
  type: 'postgresql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production',
  pool: {
    min: 5,
    max: 20,
    acquire: 30000,
    idle: 10000
  },
  logging: process.env.NODE_ENV !== 'production',
  synchronize: false, // Always use migrations
  migrations: ['dist/migrations/*.js'],
  entities: ['dist/entities/*.js']
};
```

### Migration Standards

```sql
-- All migrations must include rollback
-- Up migration
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Down migration  
DROP TABLE IF EXISTS users;
```

## 🔍 Code Quality Standards

### ESLint Configuration

```json
{
  "extends": [
    "@warehouse-network/claude-dev-standards/eslint-config"
  ],
  "rules": {
    "no-mocks": "error",
    "require-real-auth": "error", 
    "require-ssl": "error",
    "no-hardcoded-secrets": "error",
    "require-input-validation": "error"
  }
}
```

### TypeScript Strict Mode

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## 🔄 CI/CD Standards

### GitHub Actions Template

```yaml
# .github/workflows/ci.yml (auto-generated)
name: CI/CD Pipeline

on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Security Scan
        run: claude-dev-standards security --ci

  quality-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Quality Gates
        run: |
          claude-dev-standards check --strict
          npm run test:coverage -- --threshold 90
          npm run lint
          npm run typecheck

  deploy:
    needs: [security-scan, quality-gates]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Production
        run: claude-dev-standards deploy --environment production
```

## 📊 Monitoring Standards

### Structured Logging

```typescript
// Enforced logging standards
import { Logger } from '@warehouse-network/claude-dev-standards';

const logger = Logger.create({
  service: 'warehouse-api',
  version: '1.0.0',
  environment: process.env.NODE_ENV
});

// All logs include correlation ID
logger.info('User logged in', {
  userId: '123',
  correlationId: req.correlationId,
  timestamp: new Date().toISOString()
});
```

### Health Checks

```typescript
// Required health check endpoints
app.get('/health', async (req, res) => {
  const health = await HealthChecker.check({
    database: true,
    redis: true,
    externalApis: ['payment-service', 'notification-service']
  });
  
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

## 🧪 Testing Standards

### Test Requirements

- **90%+ Code Coverage** - Enforced at CI level
- **Integration Tests** - Database and API tests required
- **Security Tests** - Authentication and authorization tests
- **Performance Tests** - Load testing for critical paths
- **E2E Tests** - User journey validation

```typescript
// Example test structure
describe('UserService', () => {
  beforeEach(async () => {
    // Real database setup, no mocks
    await database.migrate.latest();
    await database.seed.run();
  });

  it('should authenticate user with valid credentials', async () => {
    const user = await UserService.authenticate({
      email: 'test@example.com',
      password: 'ValidPassword123!'
    });
    
    expect(user).toBeDefined();
    expect(user.token).toMatch(/^eyJ/); // JWT format
  });
});
```

## 📋 Validation Rules

### Anti-Patterns Detection

The standards engine detects and prevents:

- ❌ Mock databases (`sqlite`, in-memory DBs)
- ❌ Hardcoded credentials
- ❌ Weak authentication (no JWT, no RBAC)
- ❌ Missing input validation
- ❌ Synchronous operations for I/O
- ❌ Global state or singletons
- ❌ Direct database queries (no ORM/query builder)
- ❌ Missing error handling
- ❌ No rate limiting
- ❌ Unencrypted sensitive data

### Production Requirements

All projects must include:

- ✅ Real PostgreSQL database
- ✅ JWT authentication with refresh tokens
- ✅ RBAC implementation
- ✅ Input validation (Joi/Zod)
- ✅ Rate limiting
- ✅ Security headers
- ✅ Structured logging
- ✅ Health checks
- ✅ Database migrations
- ✅ Error boundaries
- ✅ Environment configuration
- ✅ SSL/TLS encryption

## 🚀 Deployment Standards

### Docker Requirements

```dockerfile
# Enforced Dockerfile standards
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node healthcheck.js

CMD ["npm", "run", "start:prod"]
```

## 📈 Compliance Monitoring

### SOC 2 Compliance

- Data encryption at rest and in transit
- Audit logging for all operations
- Access controls and authentication
- Security incident response
- Data backup and recovery

### ISO 27001 Compliance

- Information security management
- Risk assessment and treatment
- Security awareness and training
- Continuous monitoring

## 🆘 Support & Documentation

- **CLI Reference**: `claude-dev-standards --help`
- **Full Documentation**: [Standards Guide](./standards-guide.md)
- **Security Guidelines**: [Security Best Practices](./security.md)
- **Issues**: [GitHub Issues](https://github.com/warehouse-network/platform/issues)

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.

---

**Enforce Enterprise Standards** - Build production-ready applications from day one.