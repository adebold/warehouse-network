# Test Execution Guide for Skidspace Authentication & SaaS System

## Quick Start

### Prerequisites

Before running tests, ensure you have:

1. **Node.js 18+** installed
2. **PostgreSQL** database running (local or Docker)
3. **Environment variables** configured
4. **Dependencies** installed

### Setup

```bash
# Clone and install dependencies
git clone <repository-url>
cd warehouse-network
npm install

# Setup test database
createdb skidspace_test
npx prisma db push --force-reset

# Copy environment configuration
cp .env.example .env.test
```

### Environment Configuration

Create `.env.test` file:

```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/skidspace_test"
TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/skidspace_test"

# Authentication
NEXTAUTH_SECRET="test-secret-key-for-testing-only"
NEXTAUTH_URL="http://localhost:3000"

# OAuth (Mock values for testing)
GOOGLE_CLIENT_ID="mock-google-client-id"
GOOGLE_CLIENT_SECRET="mock-google-client-secret"
GITHUB_CLIENT_ID="mock-github-client-id"
GITHUB_CLIENT_SECRET="mock-github-client-secret"

# Security
BCRYPT_ROUNDS=4
JWT_EXPIRE_TIME="1h"

# Features
ENABLE_MFA=true
ENABLE_RATE_LIMITING=false
ENABLE_AUDIT_LOGGING=true
```

## Running Tests

### All Tests

```bash
# Run complete test suite
npm run test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Test Categories

#### Unit Tests

```bash
# All unit tests
npm run test:unit

# Specific unit test categories
npm run test:unit:auth
npm run test:unit:security
npm run test:unit:validation

# Single test file
npm run test tests/unit/auth/password-validation.test.ts

# With debug output
npm run test:unit -- --verbose
```

#### Integration Tests

```bash
# All integration tests
npm run test:integration

# Specific integration test categories
npm run test:integration:rbac
npm run test:integration:tenant
npm run test:integration:api

# Single test file
npm run test tests/integration/auth/rbac-permissions.test.ts

# With database debugging
DATABASE_DEBUG=true npm run test:integration
```

#### Security Tests

```bash
# All security tests
npm run test:security

# Vulnerability testing only
npm run test tests/security/vulnerability-testing.test.ts

# Penetration testing only
npm run test tests/security/penetration-testing.test.ts

# OWASP Top 10 testing
npm run test:security:owasp
```

#### End-to-End Tests

```bash
# All E2E tests
npm run test:e2e

# Headed mode (with browser UI)
npm run test:e2e:headed

# Specific browser
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=firefox
npm run test:e2e -- --project=webkit

# Single test file
npm run test:e2e tests/e2e/auth-workflows.spec.ts

# Debug mode
npm run test:e2e -- --debug
```

### Parallel Execution

```bash
# Run tests in parallel (faster)
npm run test -- --maxWorkers=4

# Run specific test files in parallel
npm run test -- tests/unit/auth/ tests/integration/auth/ --maxWorkers=2
```

### Test Filtering

```bash
# Run tests by name pattern
npm run test -- --testNamePattern="should login"

# Run tests in specific directory
npm run test -- tests/unit/auth/

# Run only changed tests (in CI/CD)
npm run test -- --changedSince=main

# Run tests matching tag
npm run test -- --testNamePattern="@security"
```

## Test Configuration

### Jest Configuration

Located in `tests/config/jest.config.js`:

```javascript
module.exports = {
  // Test environment
  testEnvironment: 'node', // or 'jsdom' for browser-like environment

  // Test patterns
  testMatch: [
    '<rootDir>/**/__tests__/**/*.(js|jsx|ts|tsx)',
    '<rootDir>/**/*.(test|spec).(js|jsx|ts|tsx)',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './packages/auth/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/config/jest.setup.js'],
  setupFiles: ['<rootDir>/config/env.setup.js'],
}
```

### Playwright Configuration

Located in `tests/config/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

## Database Testing

### Test Database Management

```bash
# Reset test database
npm run test:db:reset

# Run migrations
npx prisma db push --force-reset

# Seed test data
npm run test:db:seed

# View test database
npx prisma studio --schema=./tests/config/schema.prisma
```

### Database Test Utilities

```typescript
// Create isolated test database
import { createTestDatabase } from '../utils/test-database'

describe('Database Tests', () => {
  let testDb

  beforeAll(async () => {
    testDb = createTestDatabase()
    await testDb.setup()
  })

  afterAll(async () => {
    await testDb.cleanup()
  })

  beforeEach(async () => {
    await testDb.reset() // Clean slate for each test
  })
})
```

## Mock Services

### Authentication Mocks

```typescript
// Mock NextAuth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: { id: 'test-user', role: 'WAREHOUSE_ADMIN' },
      expires: new Date().toISOString(),
    },
    status: 'authenticated',
  })),
  signIn: jest.fn(),
  signOut: jest.fn(),
}))

// Mock external OAuth providers
const mockOAuthResponse = {
  google: {
    id: 'google-user-123',
    email: 'user@gmail.com',
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
  }
}
```

### External Service Mocks

```typescript
// Mock email service
jest.mock('../lib/email-service', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
}))

// Mock payment service
jest.mock('../lib/payment-service', () => ({
  processPayment: jest.fn().mockResolvedValue({
    success: true,
    transactionId: 'test-transaction'
  }),
}))
```

## Debugging Tests

### Debug Configuration

```bash
# Run with debug output
DEBUG=true npm run test

# Node.js debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# VS Code debugging configuration (.vscode/launch.json)
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Common Debugging Scenarios

#### 1. Test Database Issues

```typescript
// Add database logging
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
})

// Check database state
beforeEach(async () => {
  const userCount = await prisma.user.count()
  console.log(`Users in test DB: ${userCount}`)
})
```

#### 2. Authentication Failures

```typescript
// Debug authentication flow
describe('Auth Debug', () => {
  it('should debug login flow', async () => {
    const loginAttempt = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' })
      .expect(200)

    console.log('Login response:', loginAttempt.body)
    console.log('Session cookies:', loginAttempt.headers['set-cookie'])
  })
})
```

#### 3. Permission Issues

```typescript
// Debug RBAC
it('should debug permission check', async () => {
  const user = await createTestUser({ role: 'WAREHOUSE_ADMIN' })

  const hasPermission = await rbac.hasPermission(user.id, 'inventory:create')
  console.log(`User ${user.id} has permission inventory:create: ${hasPermission}`)

  const userRoles = await rbac.getUserRoles(user.id)
  console.log('User roles:', userRoles)
})
```

## Performance Testing

### Load Testing Setup

```bash
# Install k6 (load testing tool)
brew install k6  # macOS
# or
npm install -g k6

# Run authentication load test
k6 run tests/performance/auth-load-test.js

# Run with custom parameters
k6 run --vus 100 --duration 60s tests/performance/auth-load-test.js
```

### Performance Test Scripts

```javascript
// tests/performance/auth-load-test.js
import http from 'k6/http'
import { check } from 'k6'

export const options = {
  vus: 50, // 50 virtual users
  duration: '2m',
}

export default function () {
  // Test login endpoint
  const loginResponse = http.post('http://localhost:3000/api/auth/login', {
    email: 'test@example.com',
    password: 'password',
  })

  check(loginResponse, {
    'login status is 200': (r) => r.status === 200,
    'login time < 200ms': (r) => r.timings.duration < 200,
  })

  // Test permission check
  const token = loginResponse.json('token')
  const permissionResponse = http.get(
    'http://localhost:3000/api/user/permissions',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  check(permissionResponse, {
    'permission check status is 200': (r) => r.status === 200,
    'permission check time < 50ms': (r) => r.timings.duration < 50,
  })
}
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma db push --force-reset
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

### Test Result Reporting

```bash
# Generate test reports
npm run test:coverage:report

# Upload to codecov
bash <(curl -s https://codecov.io/bash)

# Generate HTML report
npm run test:html-report
open coverage/lcov-report/index.html
```

## Test Data Management

### Creating Test Data

```typescript
// Use test data factories
import { createTestUser, createTestOrganization } from '../fixtures/users'

describe('Multi-tenant Tests', () => {
  let tenant1User, tenant2User

  beforeEach(async () => {
    tenant1User = await createTestUser({
      email: 'user1@tenant1.com',
      tenantId: 'tenant-1',
      role: 'WAREHOUSE_ADMIN',
    })

    tenant2User = await createTestUser({
      email: 'user2@tenant2.com',
      tenantId: 'tenant-2',
      role: 'WAREHOUSE_ADMIN',
    })
  })
})
```

### Data Cleanup

```typescript
// Automatic cleanup after each test
afterEach(async () => {
  // Clean up test data
  await prisma.session.deleteMany()
  await prisma.user.deleteMany({
    where: { email: { endsWith: '@test.com' } }
  })
})
```

## Troubleshooting

### Common Issues and Solutions

#### Test Database Connection Errors

```bash
# Check database is running
pg_isready -h localhost -p 5432

# Recreate test database
dropdb skidspace_test
createdb skidspace_test
npx prisma db push --force-reset
```

#### Jest Memory Issues

```bash
# Increase memory limit
node --max-old-space-size=4096 node_modules/.bin/jest

# Run tests sequentially
npm run test -- --runInBand
```

#### Playwright Browser Issues

```bash
# Reinstall browsers
npx playwright install --with-deps

# Run in headed mode for debugging
npm run test:e2e -- --headed

# Generate trace for failed tests
npm run test:e2e -- --trace on
```

#### Flaky Tests

```typescript
// Add retries for flaky tests
describe('Flaky Test Suite', () => {
  jest.retryTimes(3)

  it('should eventually pass', async () => {
    // Test implementation
  })
})

// Add proper waits
await page.waitForSelector('[data-testid="element"]', { timeout: 10000 })
```

## Best Practices Checklist

- [ ] Tests are independent and can run in any order
- [ ] Test data is cleaned up after each test
- [ ] Tests use descriptive names that explain the scenario
- [ ] Edge cases and error conditions are tested
- [ ] Tests run quickly (< 5 seconds for unit tests)
- [ ] No hardcoded timeouts or sleep statements
- [ ] Mock external dependencies appropriately
- [ ] Security tests cover OWASP Top 10
- [ ] Performance tests validate SLA requirements
- [ ] Tests are maintained and updated with code changes

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Testing Library Guide](https://testing-library.com/docs/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices#-testing-and-overall-quality-practices)