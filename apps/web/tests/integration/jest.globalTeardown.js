const { execSync } = require('child_process');

module.exports = async () => {
  console.log('🧹 Cleaning up integration test environment...');

  try {
    // Clean up test database containers
    execSync('bash scripts/test-db.sh clean', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    console.log('✅ Integration test environment cleaned');
  } catch (error) {
    console.error('⚠️  Failed to clean up test environment:', error);
    // Don't throw error - teardown should be best effort
  }
};
