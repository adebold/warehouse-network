#!/usr/bin/env node

/**
 * Framework Integration Examples for Claude DB Integrity
 * 
 * This example demonstrates how to integrate with popular frameworks:
 * - Next.js (React)
 * - Express.js
 * - NestJS
 * - Generic Node.js applications
 */

const { 
  createIntegrityEngine,
  createExpressMiddleware,
  createNextJSMiddleware,
  ValidationManager
} = require('claude-db-integrity');
import { logger } from '../../../../../../utils/logger';

// Next.js Integration Example
function nextjsIntegrationExample() {
  logger.info('🚀 Next.js Integration Example');
  logger.info('==============================\n');

  // 1. API Route Integration
  const apiRouteExample = `
// pages/api/integrity/check.js
import { healthCheck } from 'claude-db-integrity';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await healthCheck();
    
    res.status(result.status === 'healthy' ? 200 : 503).json({
      status: result.status,
      checks: result.checks,
      timestamp: result.timestamp
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Health check failed',
      message: error.message 
    });
  }
}`;

  // 2. Middleware Integration
  const middlewareExample = `
// middleware.js
import { createNextJSMiddleware } from 'claude-db-integrity/nextjs';

const integrityMiddleware = createNextJSMiddleware({
  enableMonitoring: true,
  logViolations: true,
  strictMode: process.env.NODE_ENV === 'production',
  routes: {
    include: ['/api/*', '/admin/*'],
    exclude: ['/api/health']
  }
});

export function middleware(request) {
  // Run integrity checks on API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return integrityMiddleware(request);
  }
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*']
};`;

  // 3. React Hook Integration
  const reactHookExample = `
// hooks/useIntegrityValidation.js
import { useState, useCallback } from 'react';
import { ValidationManager } from 'claude-db-integrity';

const validator = new ValidationManager();

export function useIntegrityValidation(schemaName) {
  const [errors, setErrors] = useState([]);
  const [isValid, setIsValid] = useState(true);
  const [isValidating, setIsValidating] = useState(false);

  const validate = useCallback(async (data) => {
    setIsValidating(true);
    
    try {
      const result = await validator.validate(schemaName, data);
      
      setIsValid(result.isValid);
      setErrors(result.errors || []);
      
      return result;
    } catch (error) {
      setIsValid(false);
      setErrors([{ message: error.message }]);
      throw error;
    } finally {
      setIsValidating(false);
    }
  }, [schemaName]);

  return { validate, errors, isValid, isValidating };
}

// Usage in component:
// function UserForm() {
//   const { validate, errors, isValid } = useIntegrityValidation('user-schema');
//   
//   const handleSubmit = async (formData) => {
//     const result = await validate(formData);
//     if (result.isValid) {
//       // Submit to API
//     }
//   };
//   
//   return (
//     <form onSubmit={handleSubmit}>
//       {/* Form fields */}
//       {errors.map(error => (
//         <div key={error.field} className="error">
//           {error.message}
//         </div>
//       ))}
//     </form>
//   );
// }`;

  logger.info('📄 API Route Example:');
  logger.info(apiRouteExample);
  logger.info('\n📄 Middleware Example:');
  logger.info(middlewareExample);
  logger.info('\n📄 React Hook Example:');
  logger.info(reactHookExample);
  logger.info('\n');
}

// Express.js Integration Example
async function expressIntegrationExample() {
  logger.info('🚀 Express.js Integration Example');
  logger.info('==================================\n');

  // 1. Global Middleware Setup
  const globalMiddlewareExample = `
// app.js
const express = require('express');
const { createExpressMiddleware } = require('claude-db-integrity/express');

const app = express();

// Setup JSON parsing
app.use(express.json());

// Add Claude DB Integrity middleware
const integrityMiddleware = createExpressMiddleware({
  autoCheck: true,
  checkInterval: 300000, // 5 minutes
  logLevel: 'info',
  routes: {
    exclude: ['/health', '/metrics']
  }
});

app.use(integrityMiddleware);

// Health endpoint with integrity check
app.get('/health', async (req, res) => {
  const { healthCheck } = require('claude-db-integrity');
  const result = await healthCheck();
  res.json(result);
});

module.exports = app;`;

  // 2. Route-Specific Validation
  const routeValidationExample = `
// routes/users.js
const express = require('express');
const { ValidationManager } = require('claude-db-integrity');

const router = express.Router();
const validator = new ValidationManager();

// Load user schema
const userSchema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    name: { type: 'string', minLength: 2, maxLength: 100 },
    age: { type: 'number', minimum: 0, maximum: 150 }
  },
  required: ['email', 'name']
};

validator.loadSchema('user', userSchema);

// Validation middleware
const validateUser = async (req, res, next) => {
  try {
    const result = await validator.validate('user', req.body);
    
    if (!result.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.errors
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({
      error: 'Validation error',
      message: error.message
    });
  }
};

// Create user with validation
router.post('/users', validateUser, async (req, res) => {
  try {
    // Process validated data
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;`;

  // 3. Error Handling Middleware
  const errorHandlingExample = `
// middleware/errorHandler.js
const { IntegrityEngine } = require('claude-db-integrity');

const engine = new IntegrityEngine();

const errorHandler = async (err, req, res, next) => {
  // Log error with integrity context
  await engine.logError({
    error: err.message,
    stack: err.stack,
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body
    },
    user: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Send error response
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
};

module.exports = errorHandler;`;

  logger.info('📄 Global Middleware Example:');
  logger.info(globalMiddlewareExample);
  logger.info('\n📄 Route Validation Example:');
  logger.info(routeValidationExample);
  logger.info('\n📄 Error Handling Example:');
  logger.info(errorHandlingExample);
  logger.info('\n');
}

// NestJS Integration Example
function nestjsIntegrationExample() {
  logger.info('🚀 NestJS Integration Example');
  logger.info('==============================\n');

  // 1. Module Setup
  const moduleExample = `
// integrity.module.ts
import { Module } from '@nestjs/common';
import { IntegrityService } from './integrity.service';
import { IntegrityController } from './integrity.controller';
import { ValidationPipe } from './pipes/validation.pipe';

@Module({
  providers: [
    IntegrityService,
    {
      provide: 'VALIDATION_PIPE',
      useClass: ValidationPipe
    }
  ],
  controllers: [IntegrityController],
  exports: [IntegrityService]
})
export class IntegrityModule {}`;

  // 2. Service Implementation
  const serviceExample = `
// integrity.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { IntegrityEngine, ValidationManager } from 'claude-db-integrity';

@Injectable()
export class IntegrityService implements OnModuleInit {
  private engine: IntegrityEngine;
  private validator: ValidationManager;

  async onModuleInit() {
    this.engine = new IntegrityEngine({
      database: {
        type: 'postgresql',
        url: process.env.DATABASE_URL
      },
      claude: {
        enabled: true,
        namespace: 'nestjs-app'
      }
    });

    this.validator = new ValidationManager();
    
    await this.engine.initialize();
    
    // Load schemas
    await this.loadSchemas();
  }

  private async loadSchemas() {
    const userSchema = {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        name: { type: 'string', minLength: 2 }
      },
      required: ['email', 'name']
    };

    await this.validator.loadSchema('user', userSchema);
  }

  async validateEntity(schema: string, data: any) {
    return await this.validator.validate(schema, data);
  }

  async runIntegrityCheck() {
    return await this.engine.runIntegrityChecks();
  }

  async getHealth() {
    return await this.engine.getHealth();
  }
}`;

  // 3. Decorator-Based Validation
  const decoratorExample = `
// decorators/validate.decorator.ts
import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { ValidationManager } from 'claude-db-integrity';

const validator = new ValidationManager();

export const ValidateBody = createParamDecorator(
  async (schema: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    
    try {
      const result = await validator.validate(schema, request.body);
      
      if (!result.isValid) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: result.errors
        });
      }
      
      return request.body;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  },
);

// Usage in controller:
// @Controller('users')
// export class UsersController {
//   @Post()
//   async createUser(@ValidateBody('user') userData: CreateUserDto) {
//     return this.userService.create(userData);
//   }
// }`;

  // 4. Guard Implementation
  const guardExample = `
// guards/integrity.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IntegrityService } from '../integrity.service';

@Injectable()
export class IntegrityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly integrityService: IntegrityService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresIntegrityCheck = this.reflector.get<boolean>(
      'integrity-check',
      context.getHandler()
    );

    if (!requiresIntegrityCheck) {
      return true;
    }

    const health = await this.integrityService.getHealth();
    
    if (health.status !== 'healthy') {
      throw new ForbiddenException('System integrity check failed');
    }

    return true;
  }
}`;

  logger.info('📄 Module Example:');
  logger.info(moduleExample);
  logger.info('\n📄 Service Example:');
  logger.info(serviceExample);
  logger.info('\n📄 Decorator Example:');
  logger.info(decoratorExample);
  logger.info('\n📄 Guard Example:');
  logger.info(guardExample);
  logger.info('\n');
}

// Generic Node.js Integration Example
async function genericNodejsIntegrationExample() {
  logger.info('🚀 Generic Node.js Integration Example');
  logger.info('=======================================\n');

  try {
    // 1. Basic setup
    logger.info('1. Basic Node.js application setup...');
    
    const engine = createIntegrityEngine({
      database: { type: 'memory' },
      claude: { enabled: false }
    });

    await engine.initialize();
    logger.info('   ✅ Integrity engine initialized\n');

    // 2. Background integrity monitoring
    logger.info('2. Setting up background monitoring...');
    
    const setupBackgroundMonitoring = () => {
      const monitoringInterval = setInterval(async () => {
        try {
          const report = await engine.runIntegrityChecks();
          
          if (report.summary.failed > 0) {
            logger.info(`⚠️  Integrity issues detected: ${report.summary.failed} failed checks`);
          }
          
          // Store metrics
          const memory = engine.getMemoryManager();
          await memory.store('monitoring:last-check', {
            timestamp: new Date().toISOString(),
            summary: report.summary
          }, { ttl: 3600 });
          
        } catch (error) {
          logger.error('Monitoring error:', error.message);
        }
      }, 60000); // Every minute

      return monitoringInterval;
    };

    const monitoringInterval = setupBackgroundMonitoring();
    logger.info('   ✅ Background monitoring started\n');

    // 3. Event-driven validation
    logger.info('3. Event-driven validation example...');
    
    const EventEmitter = require('events');
    const eventBus = new EventEmitter();

    // Set up event listeners
    eventBus.on('user:created', async (userData) => {
      logger.info('   Validating new user creation...');
      
      const validator = engine.getValidator();
      const result = await validator.validate('user', userData);
      
      if (result.isValid) {
        logger.info(`   ✅ User ${userData.id} validated successfully`);
        eventBus.emit('user:validated', userData);
      } else {
        logger.info(`   ❌ User ${userData.id} validation failed`);
        eventBus.emit('user:validation-failed', userData, result.errors);
      }
    });

    eventBus.on('user:validated', async (userData) => {
      // Store in memory for auditing
      const memory = engine.getMemoryManager();
      await memory.store(`user:${userData.id}:created`, userData, {
        namespace: 'user-audit',
        ttl: 86400 // 24 hours
      });
    });

    // Load user schema
    await engine.getValidator().loadSchema('user', {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        name: { type: 'string', minLength: 2 }
      },
      required: ['id', 'email', 'name']
    });

    // Emit test events
    eventBus.emit('user:created', {
      id: 'user123',
      email: 'test@example.com',
      name: 'Test User'
    });

    eventBus.emit('user:created', {
      id: 'invalid',
      email: 'bad-email',
      name: 'X'
    });

    logger.info('   ✅ Event-driven validation demonstrated\n');

    // 4. Cleanup
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for events
    clearInterval(monitoringInterval);
    await engine.shutdown();

    logger.info('✅ Generic Node.js integration example completed!');

  } catch (error) {
    logger.error('❌ Error in generic Node.js example:', error);
  }
}

// Production deployment example
function productionDeploymentExample() {
  logger.info('🚀 Production Deployment Example');
  logger.info('=================================\n');

  const dockerExample = `
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm install claude-db-integrity

# Copy application
COPY . .

# Health check using Claude DB Integrity
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD node -e "import('claude-db-integrity').then(m => m.healthCheck()).then(r => process.exit(r.status === 'healthy' ? 0 : 1))"

EXPOSE 3000

CMD ["npm", "start"]`;

  const k8sExample = `
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-with-integrity
spec:
  replicas: 3
  selector:
    matchLabels:
      app: app-with-integrity
  template:
    metadata:
      labels:
        app: app-with-integrity
    spec:
      containers:
      - name: app
        image: app-with-integrity:latest
        ports:
        - containerPort: 3000
        - containerPort: 3001  # Integrity monitoring
        env:
        - name: CLAUDE_INTEGRITY_ENABLED
          value: "true"
        - name: CLAUDE_INTEGRITY_MONITORING_PORT
          value: "3001"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5`;

  const cicdExample = `
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
      
      - name: Install Claude DB Integrity
        run: npm install claude-db-integrity
      
      - name: Run integrity checks
        run: |
          npx claude-db-integrity init --template=generic
          npx claude-db-integrity check --format=junit > integrity-results.xml
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: integrity-results
          path: integrity-results.xml`;

  logger.info('📄 Docker Example:');
  logger.info(dockerExample);
  logger.info('\n📄 Kubernetes Example:');
  logger.info(k8sExample);
  logger.info('\n📄 CI/CD Example:');
  logger.info(cicdExample);
  logger.info('\n');
}

// Run all framework examples
async function runAllFrameworkExamples() {
  nextjsIntegrationExample();
  await expressIntegrationExample();
  nestjsIntegrationExample();
  await genericNodejsIntegrationExample();
  productionDeploymentExample();
  
  logger.info('🎉 All framework integration examples completed!');
  logger.info('');
  logger.info('Choose the integration that best fits your framework:');
  logger.info('- Next.js: Built-in middleware and API route integration');
  logger.info('- Express: Flexible middleware with route-specific validation');
  logger.info('- NestJS: Decorator-based validation with dependency injection');
  logger.info('- Generic Node.js: Event-driven validation and monitoring');
  logger.info('');
  logger.info('For production deployment:');
  logger.info('- Use Docker health checks for container orchestration');
  logger.info('- Set up monitoring endpoints for Kubernetes probes');
  logger.info('- Integrate integrity checks into your CI/CD pipeline');
}

// Run if called directly
if (require.main === module) {
  runAllFrameworkExamples().catch(console.error);
}

module.exports = {
  nextjsIntegrationExample,
  expressIntegrationExample,
  nestjsIntegrationExample,
  genericNodejsIntegrationExample,
  productionDeploymentExample,
  runAllFrameworkExamples
};