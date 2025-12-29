import { Pool } from 'pg';
import { createClient } from 'redis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from './utils/logger';

let testDb: Pool;
let testRedis: ReturnType<typeof createClient>;

export const setupTestDatabase = async (): Promise<Pool> => {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'marketing_platform_test',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true'
  };

  testDb = new Pool(dbConfig);

  // Test connection
  try {
    await testDb.query('SELECT 1');
  } catch (error) {
    logger.error('Failed to connect to test database:', error);
    throw error;
  }

  // Drop and recreate schema for clean test state
  await testDb.query('DROP SCHEMA IF EXISTS public CASCADE');
  await testDb.query('CREATE SCHEMA public');
  await testDb.query('GRANT ALL ON SCHEMA public TO public');

  // Load schema
  const schemaPath = join(__dirname, '..', '..', 'src', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  await testDb.query(schema);

  return testDb;
};

export const setupTestRedis = async () => {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: parseInt(process.env.REDIS_DB || '1'),
  };

  testRedis = createClient(redisConfig);
  
  testRedis.on('error', (err) => {
    logger.error('Redis test client error:', err);
  });

  await testRedis.connect();
  await testRedis.flushDb(); // Clear test database

  return testRedis;
};

export const cleanupTestDatabase = async () => {
  if (testDb) {
    await testDb.end();
  }
};

export const cleanupTestRedis = async () => {
  if (testRedis) {
    await testRedis.quit();
  }
};

export const getTestDb = () => testDb;
export const getTestRedis = () => testRedis;

// Test data factory functions
export const createTestUser = async (userData: any = {}) => {
  const defaultUser = {
    email: `test-${Date.now()}@example.com`,
    password_hash: '$2b$04$test.hash.for.testing.only', // Pre-hashed test password
    first_name: 'Test',
    last_name: 'User',
    role: 'user',
    ...userData
  };

  const result = await testDb.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role) 
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [defaultUser.email, defaultUser.password_hash, defaultUser.first_name, defaultUser.last_name, defaultUser.role]
  );

  return result.rows[0];
};

export const createTestOrganization = async (orgData: any = {}, createdBy?: string) => {
  const userId = createdBy || (await createTestUser()).id;
  
  const defaultOrg = {
    name: `Test Org ${Date.now()}`,
    description: 'Test organization',
    website: 'https://test.example.com',
    industry: 'Technology',
    size_category: 'startup',
    ...orgData
  };

  const result = await testDb.query(
    `INSERT INTO organizations (name, description, website, industry, size_category, created_by) 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [defaultOrg.name, defaultOrg.description, defaultOrg.website, defaultOrg.industry, defaultOrg.size_category, userId]
  );

  return result.rows[0];
};

export const createTestCampaign = async (campaignData: any = {}, organizationId?: string, createdBy?: string) => {
  const orgId = organizationId || (await createTestOrganization()).id;
  const userId = createdBy || (await createTestUser()).id;
  
  const defaultCampaign = {
    name: `Test Campaign ${Date.now()}`,
    description: 'Test campaign',
    objectives: JSON.stringify({ primary: 'lead_generation' }),
    target_audience: JSON.stringify({ demographics: { age_range: '25-45' } }),
    budget_total: 10000.00,
    status: 'draft',
    ...campaignData
  };

  const result = await testDb.query(
    `INSERT INTO campaigns (organization_id, name, description, objectives, target_audience, budget_total, status, created_by) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, defaultCampaign.name, defaultCampaign.description, defaultCampaign.objectives, defaultCampaign.target_audience, defaultCampaign.budget_total, defaultCampaign.status, userId]
  );

  return result.rows[0];
};