import { execSync } from 'child_process';

import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { logger } from './utils/logger';

// Global test setup for integration tests
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/warehouse_test',
    },
  },
});

// Global setup - runs once before all tests
beforeAll(async () => {
  // Ensure test database is running and seeded
  try {
    logger.info('🔧 Setting up integration test environment...');

    // Check if test DB is accessible
    await prisma.$connect();
    logger.info('✅ Connected to test database');

    // Verify we have test data
    const testUsersCount = await prisma.user.count({
      where: { isTestUser: true },
    });

    if (testUsersCount === 0) {
      logger.info('⚠️  No test data found, running seeder...');
      execSync('npm run seed:test', { stdio: 'inherit' });
    }

    logger.info(`📊 Found ${testUsersCount} test users`);
  } catch (error) {
    logger.error('❌ Failed to set up test environment:', error);
    throw error;
  }
}, 30000); // 30 second timeout

// Global teardown
afterAll(async () => {
  await prisma.$disconnect();
});

// Before each test - create clean state
beforeEach(async () => {
  // Start a transaction for test isolation
  await prisma.$executeRaw`BEGIN;`;
});

// After each test - rollback transaction
afterEach(async () => {
  // Rollback transaction to clean state
  await prisma.$executeRaw`ROLLBACK;`;
});

// Export prisma instance for tests
export { prisma };

// Helper function to create isolated test environment
export async function withTestTransaction<T>(
  callback: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(async tx => {
    return await callback(tx as PrismaClient);
  });
}

// Helper to get test users by role
export async function getTestUsers() {
  return {
    admin: await prisma.user.findFirstOrThrow({
      where: { role: 'ADMIN', isTestUser: true },
    }),
    operator: await prisma.user.findFirstOrThrow({
      where: { role: 'OPERATOR', isTestUser: true },
    }),
    customer: await prisma.user.findFirstOrThrow({
      where: { role: 'CUSTOMER_ADMIN', isTestUser: true },
    }),
  };
}

// Helper to get test customers by scenario
export async function getTestCustomers() {
  const customers = await prisma.customer.findMany({
    where: { isTestData: true },
    include: {
      users: { take: 1 },
      _count: { select: { skids: true } },
    },
  });

  return {
    active: customers.find(c => c.testScenario === 'active_customer_-_good_standing'),
    overdue: customers.find(c => c.testScenario === 'overdue_customer_-_15_days'),
    delinquent: customers.find(c => c.testScenario === 'delinquent_customer_-_45_days'),
    locked: customers.find(c => c.testScenario === 'locked_customer_-_non-payment'),
    suspended: customers.find(c => c.testScenario === 'suspended_customer'),
    regular: customers.find(c => c.testScenario === 'regular'),
  };
}
