const { execSync } = require('child_process');

module.exports = async () => {
  console.log('🔧 Setting up integration test environment...');

  try {
    // Load test environment variables
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/warehouse_test';
    process.env.REDIS_URL = 'redis://localhost:6380';
    process.env.NODE_ENV = 'test';

    // Set up test database
    console.log('📦 Setting up test database...');
    execSync('bash scripts/test-db.sh setup', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    console.log('✅ Integration test environment ready');
  } catch (error) {
    console.error('❌ Failed to setup integration test environment:', error);
    throw error;
  }
};
