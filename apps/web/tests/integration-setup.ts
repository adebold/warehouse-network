import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

// Create a test database instance
export const testDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/warehouse_test'
    }
  }
});

// Setup and teardown for integration tests
beforeAll(async () => {
  // Reset test database
  try {
    await testDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE;');
    await testDb.$executeRawUnsafe('CREATE SCHEMA public;');
    
    // Run migrations
    execSync('npx prisma migrate deploy', { 
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      stdio: 'inherit'
    });
  } catch (error) {
    console.warn('Database setup warning:', error.message);
  }
});

afterAll(async () => {
  await testDb.$disconnect();
});

beforeEach(async () => {
  // Clean tables before each test
  try {
    const tablenames = await testDb.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    ` as Array<{tablename: string}>;
    
    for (const { tablename } of tablenames) {
      if (tablename !== '_prisma_migrations') {
        await testDb.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
      }
    }
  } catch (error) {
    console.warn('Database cleanup warning:', error.message);
  }
});