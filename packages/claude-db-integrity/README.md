# Claude DB Integrity

[![npm version](https://badge.fury.io/js/claude-db-integrity.svg)](https://badge.fury.io/js/claude-db-integrity)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive database integrity system with Claude Flow memory integration for production applications. Monitor, validate, and maintain database health with zero-config setup and production-ready defaults.

## 🚀 Features

- **Zero-Config Setup**: Get started in minutes with automatic framework detection
- **Claude Flow Integration**: Seamless memory management and coordination
- **Multi-Framework Support**: Next.js, Express, NestJS, and generic Node.js projects
- **Real-Time Monitoring**: Continuous integrity checks with customizable intervals
- **Schema Drift Detection**: Track and alert on database schema changes
- **Form & Route Validation**: Automatic validation of API routes and form schemas
- **Production-Ready**: Built-in logging, monitoring, and error handling
- **TypeScript Support**: Full TypeScript definitions and IntelliSense

## 📦 Installation

### Global Installation (Recommended)

```bash
npm install -g claude-db-integrity
```

### Project-Specific Installation

```bash
npm install claude-db-integrity
```

## 🎯 Quick Start

### Initialize Your Project

```bash
# Auto-detect framework and initialize
claude-db-integrity init

# Or specify a framework template
claude-db-integrity init --template nextjs
claude-db-integrity init --template express
claude-db-integrity init --template nestjs
```

### Run Integrity Checks

```bash
# Basic integrity check
claude-db-integrity check

# Verbose output with auto-fix
claude-db-integrity check --verbose --fix

# Check for schema drift
claude-db-integrity drift

# Validate forms and routes
claude-db-integrity validate
```

### Start Monitoring

```bash
# Start continuous monitoring
claude-db-integrity monitor

# Monitor with custom interval
claude-db-integrity monitor --interval 60
```

## 🔧 Framework Templates

### Next.js + Prisma

Perfect for full-stack applications with API routes:

```bash
claude-db-integrity init --template nextjs
```

**Includes:**
- Prisma integration
- API route validation
- Form component validation
- Middleware for request tracking
- Real-time dashboard component

### Express + Prisma

Ideal for REST APIs and backend services:

```bash
claude-db-integrity init --template express
```

**Includes:**
- Express middleware
- Route validation
- Health check endpoints
- Error handling middleware
- Redis cache integration

### NestJS + TypeORM

Enterprise-grade applications with decorators:

```bash
claude-db-integrity init --template nestjs
```

**Includes:**
- TypeORM integration
- Decorator-based validation
- Guard integration
- Module setup
- Dependency injection

### Generic/Custom

Framework-agnostic setup:

```bash
claude-db-integrity init --template generic
```

## 📖 Usage Examples

### Programmatic Usage

```typescript
import { 
  IntegrityEngine, 
  ClaudeMemoryManager, 
  healthCheck 
} from 'claude-db-integrity';

// Quick health check
const health = await healthCheck();
console.log(health.status); // 'healthy' | 'unhealthy' | 'error'

// Full integrity engine
const engine = new IntegrityEngine();
await engine.initialize();

// Run integrity checks
const report = await engine.runIntegrityChecks({
  fix: true,
  verbose: true
});

// Check schema drift
const drift = await engine.checkSchemaDrift();

// Start monitoring
await engine.startMonitoring(30); // 30-second interval

// Cleanup
await engine.shutdown();
```

### Next.js Integration

```typescript
// pages/api/health.ts
import { healthCheck } from 'claude-db-integrity';

export default async function handler(req, res) {
  const health = await healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
}
```

```tsx
// components/IntegrityDashboard.tsx
import { IntegrityDashboard } from 'claude-db-integrity/templates/nextjs/components/IntegrityDashboard';

export default function AdminPage() {
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <IntegrityDashboard />
    </div>
  );
}
```

### Express Integration

```javascript
// app.js
const express = require('express');
const { createExpressMiddleware } = require('claude-db-integrity');

const app = express();
const integrity = createExpressMiddleware();

// Initialize middleware
await integrity.initialize();

// Add middleware
app.use(integrity.trackRequests());
app.use(integrity.checkIntegrity());
app.use(integrity.trackResponseTime());

// Health check endpoint
app.get('/health', integrity.healthCheck());

// Error handling
app.use(integrity.errorHandler());
```

### Memory Management

```typescript
import { ClaudeMemoryManager } from 'claude-db-integrity';

const memory = new ClaudeMemoryManager({
  claude: {
    enabled: true,
    namespace: 'my-app',
    ttl: 3600,
    syncInterval: 300
  }
});

await memory.initialize();

// Store data
await memory.store('user:123', {
  name: 'John Doe',
  lastLogin: new Date()
}, {
  tags: ['user', 'session'],
  ttl: 1800
});

// Retrieve data
const user = await memory.retrieve('user:123');

// Search
const users = await memory.search('user:', {
  tags: ['active'],
  limit: 10
});

// Get statistics
const stats = await memory.getStats();
```

## ⚙️ Configuration

### Configuration File

The system automatically creates a `claude-db-integrity.config.js` file:

```javascript
module.exports = {
  database: {
    provider: 'prisma',
    url: process.env.DATABASE_URL,
    schema: 'public',
    migrations: {
      directory: './prisma/migrations',
      tableName: '_prisma_migrations'
    }
  },
  validation: {
    forms: {
      enabled: true,
      directory: './src/components',
      patterns: ['**/*.tsx', '**/*.ts']
    },
    routes: {
      enabled: true,
      directory: './src/pages/api',
      patterns: ['**/*.ts', '**/*.js']
    }
  },
  memory: {
    claude: {
      enabled: true,
      namespace: 'claude-db-integrity',
      ttl: 3600,
      syncInterval: 300
    }
  },
  monitoring: {
    enabled: true,
    interval: 30,
    alerts: {
      email: [process.env.ALERT_EMAIL],
      webhook: process.env.ALERT_WEBHOOK
    }
  }
};
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Alerts
ALERT_EMAIL=admin@example.com
ALERT_WEBHOOK=https://hooks.slack.com/webhook
SLACK_WEBHOOK=https://hooks.slack.com/slack

# Redis (for Express template)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

## 🔍 CLI Commands

### Initialization

```bash
# Initialize with auto-detection
claude-db-integrity init

# Force overwrite existing config
claude-db-integrity init --force

# Skip dependency installation
claude-db-integrity init --skip-install

# Specify template
claude-db-integrity init --template nextjs
```

### Integrity Checks

```bash
# Basic check
claude-db-integrity check

# Verbose output
claude-db-integrity check --verbose

# Auto-fix issues
claude-db-integrity check --fix

# JSON output
claude-db-integrity check --format json
```

### Schema Management

```bash
# Check for drift
claude-db-integrity drift

# Compare with specific baseline
claude-db-integrity drift --baseline snapshot_123

# Show differences
claude-db-integrity drift --format diff
```

### Validation

```bash
# Validate all
claude-db-integrity validate

# Validate only forms
claude-db-integrity validate --forms

# Validate only routes
claude-db-integrity validate --routes

# Auto-fix validation issues
claude-db-integrity validate --fix
```

### Monitoring

```bash
# Start monitoring (30s interval)
claude-db-integrity monitor

# Custom interval
claude-db-integrity monitor --interval 60

# Silent mode
claude-db-integrity monitor --silent
```

### Data Export

```bash
# Export reports and logs
claude-db-integrity export

# Specify output file
claude-db-integrity export --output report.json

# Export as CSV
claude-db-integrity export --format csv

# Export since date
claude-db-integrity export --since 2024-01-01
```

### Memory Management

```bash
# Show memory statistics
claude-db-integrity memory --stats

# Clear memory cache
claude-db-integrity memory --clear

# Export memory data
claude-db-integrity memory --export
```

### Configuration

```bash
# Show current configuration
claude-db-integrity config --show

# Reset to defaults
claude-db-integrity config --reset

# Interactive configuration menu
claude-db-integrity config
```

## 🏗️ Architecture

### Core Components

- **IntegrityEngine**: Main orchestrator for all integrity operations
- **ClaudeMemoryManager**: Handles Claude Flow memory integration and caching
- **ValidationManager**: Form and route validation logic
- **SchemaManager**: Database schema analysis and drift detection
- **ConfigManager**: Configuration loading and validation

### Framework Integrations

- **NextJSIntegration**: Middleware, API routes, and React components
- **ExpressIntegration**: Express middleware and error handlers
- **NestJSIntegration**: Decorators, guards, and modules

### Memory System

The memory system provides:
- **Local Caching**: In-memory cache for fast access
- **Claude Flow Sync**: Automatic synchronization with Claude Flow
- **Namespacing**: Organized data storage
- **TTL Management**: Automatic expiration
- **Search Capabilities**: Pattern-based search with tags

## 🔧 Advanced Configuration

### Custom Validation Rules

```javascript
// claude-db-integrity.config.js
module.exports = {
  validation: {
    forms: {
      enabled: true,
      directory: './src/components',
      patterns: ['**/*.tsx'],
      customRules: [
        {
          name: 'required-fields',
          pattern: /required:\s*true/,
          message: 'All required fields must be validated'
        }
      ]
    }
  }
};
```

### Custom Memory Providers

```typescript
import { ClaudeMemoryManager } from 'claude-db-integrity';

const memory = new ClaudeMemoryManager({
  claude: {
    enabled: true,
    namespace: 'custom-app'
  },
  cache: {
    provider: 'redis',
    options: {
      host: 'redis-cluster.example.com',
      port: 6379,
      retryDelayOnFailover: 100
    }
  }
});
```

### Custom Integrity Checks

```typescript
import { IntegrityEngine } from 'claude-db-integrity';

class CustomIntegrityEngine extends IntegrityEngine {
  async runCustomChecks() {
    // Your custom integrity logic
    return [];
  }
}
```

## 📊 Monitoring & Alerts

### Real-Time Dashboard

Access the built-in dashboard (Next.js template):

```typescript
import { IntegrityDashboard } from 'claude-db-integrity/templates/nextjs/components/IntegrityDashboard';
```

### Alert Configuration

```javascript
// claude-db-integrity.config.js
module.exports = {
  monitoring: {
    alerts: {
      email: ['admin@company.com', 'devops@company.com'],
      webhook: 'https://api.company.com/alerts',
      slack: 'https://hooks.slack.com/services/...'
    }
  }
};
```

### Custom Monitoring

```typescript
import { IntegrityEngine } from 'claude-db-integrity';

const engine = new IntegrityEngine();

engine.on('monitoring:cycle', (event) => {
  console.log('Monitoring cycle:', event);
});

engine.on('monitoring:error', (event) => {
  // Send to your monitoring service
  sendToDatadog(event);
});
```

## 🚨 Production Deployment

### Docker Support

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install -g claude-db-integrity
RUN npm install

COPY . .

# Run integrity checks before starting
RUN claude-db-integrity check

CMD ["node", "server.js"]
```

### CI/CD Integration

```yaml
# .github/workflows/integrity.yml
name: Database Integrity

on: [push, pull_request]

jobs:
  integrity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm install
      
      - name: Install Claude DB Integrity
        run: npm install -g claude-db-integrity
      
      - name: Run integrity checks
        run: claude-db-integrity check --format json
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      - name: Check schema drift
        run: claude-db-integrity drift
```

### Health Checks

```bash
# Kubernetes health check
livenessProbe:
  exec:
    command:
    - /bin/sh
    - -c
    - "claude-db-integrity check --format json | jq -e '.status == \"healthy\"'"
  initialDelaySeconds: 30
  periodSeconds: 60
```

## 🔌 API Reference

### Core Classes

#### IntegrityEngine

```typescript
class IntegrityEngine {
  constructor(configPath?: string)
  
  async initialize(): Promise<void>
  async runIntegrityChecks(options?: CheckOptions): Promise<IntegrityReport>
  async checkSchemaDrift(baseline?: string): Promise<SchemaDrift>
  async validateFormsAndRoutes(options?: ValidationOptions): Promise<ValidationResult[]>
  async startMonitoring(interval?: number): Promise<void>
  async stopMonitoring(): Promise<void>
  async shutdown(): Promise<void>
}
```

#### ClaudeMemoryManager

```typescript
class ClaudeMemoryManager {
  constructor(config: MemoryConfig)
  
  async initialize(): Promise<void>
  async store(key: string, value: any, options?: StoreOptions): Promise<void>
  async retrieve(key: string, namespace?: string): Promise<any>
  async search(pattern: string, options?: SearchOptions): Promise<ClaudeMemoryEntry[]>
  async clear(namespace?: string): Promise<void>
  async export(options?: ExportOptions): Promise<any>
  async getStats(): Promise<MemoryStats>
  async shutdown(): Promise<void>
}
```

### Types

```typescript
interface IntegrityConfig {
  database: DatabaseConfig;
  validation: ValidationConfig;
  memory: MemoryConfig;
  monitoring: MonitoringConfig;
  templates: TemplateConfig;
}

interface IntegrityReport {
  id: string;
  timestamp: Date;
  checks: IntegrityCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  metadata: {
    version: string;
    database: string;
    schema: string;
  };
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/warehouse-network/claude-db-integrity.git
cd claude-db-integrity
npm install
npm run build
npm link

# Test the CLI
claude-db-integrity --help
```

### Running Tests

```bash
npm test
npm run test:watch
npm run test:coverage
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Documentation**: [https://claude-db-integrity.dev](https://claude-db-integrity.dev)
- **GitHub**: [https://github.com/warehouse-network/claude-db-integrity](https://github.com/warehouse-network/claude-db-integrity)
- **npm Package**: [https://www.npmjs.com/package/claude-db-integrity](https://www.npmjs.com/package/claude-db-integrity)
- **Issue Tracker**: [https://github.com/warehouse-network/claude-db-integrity/issues](https://github.com/warehouse-network/claude-db-integrity/issues)
- **Discussions**: [https://github.com/warehouse-network/claude-db-integrity/discussions](https://github.com/warehouse-network/claude-db-integrity/discussions)

## 🙋 Support

- **Discord**: [Join our community](https://discord.gg/claude-db-integrity)
- **Email**: [support@claude-db-integrity.com](mailto:support@claude-db-integrity.com)
- **Stack Overflow**: Tag your questions with `claude-db-integrity`

---

Made with ❤️ by the Claude DB Integrity Team