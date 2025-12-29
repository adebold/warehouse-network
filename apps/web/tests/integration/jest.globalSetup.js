const { execSync } = require('child_process');
const { logger } = require('./utils/logger');

module.exports = async () => {
  logger.info('🔧 Setting up integration test environment...');

  try {
    // Load test environment variables
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/warehouse_test';
    process.env.REDIS_URL = 'redis://localhost:6380';
    process.env.NODE_ENV = 'test';

    // Set up test database
    logger.info('📦 Setting up test database...');
    execSync('bash scripts/test-db.sh setup', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    logger.info('✅ Integration test environment ready');
  } catch (error) {
    logger.error('❌ Failed to setup integration test environment:', error);
    throw error;
  }
};
