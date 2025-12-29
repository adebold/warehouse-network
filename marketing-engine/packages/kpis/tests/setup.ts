import { config } from '../src/config/config';

// Override config for tests
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'marketing_kpis_test';
process.env.REDIS_DB = '1';
process.env.LOG_LEVEL = 'error';

// Mock timers for consistent testing
jest.useFakeTimers();

// Global test timeout
jest.setTimeout(30000);

// Clean up after tests
afterAll(async () => {
  jest.useRealTimers();
});