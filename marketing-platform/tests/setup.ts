import { config } from 'dotenv';
import { join } from 'path';

// Load test environment variables
config({ path: join(__dirname, '..', '.env.test') });

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'marketing_platform_test';
process.env.REDIS_DB = '1'; // Use different Redis DB for tests
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing-only-32-chars';
process.env.BCRYPT_ROUNDS = '4'; // Faster for tests

// Extend Jest timeout for database operations
jest.setTimeout(30000);

// Mock console.log in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

// Global test utilities
global.testUtils = {
  generateTestUser: () => ({
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
  }),
  
  generateTestOrganization: () => ({
    name: `Test Org ${Date.now()}`,
    description: 'Test organization for testing',
    website: 'https://test.example.com',
    industry: 'Technology',
    sizeCategory: 'startup',
  }),
  
  generateTestCampaign: () => ({
    name: `Test Campaign ${Date.now()}`,
    description: 'Test marketing campaign',
    objectives: {
      primary: 'lead_generation',
      secondary: 'brand_awareness'
    },
    targetAudience: {
      demographics: { age_range: '25-45' },
      interests: ['technology', 'marketing']
    },
    budgetTotal: 10000.00,
    status: 'draft'
  })
};

// Cleanup function for tests
afterEach(async () => {
  // Clear Redis cache after each test
  const { redisClient } = await import('@/utils/redis');
  if (redisClient?.isReady) {
    await redisClient.flushDb();
  }
});