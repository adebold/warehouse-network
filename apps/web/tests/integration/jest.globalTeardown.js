const { execSync } = require('child_process');
const { logger } = require('./utils/logger');

module.exports = async () => {
  logger.info('🧹 Cleaning up integration test environment...');

  try {
    // Clean up test database containers
    execSync('bash scripts/test-db.sh clean', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    logger.info('✅ Integration test environment cleaned');
  } catch (error) {
    logger.error('⚠️  Failed to clean up test environment:', error);
    // Don't throw error - teardown should be best effort
  }
};
