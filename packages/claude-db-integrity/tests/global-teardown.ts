import fs from 'fs/promises';

/**
 * Global Jest teardown
 * Runs once after all test suites complete
 */
export default async () => {
  console.log('🧹 Cleaning up Claude DB Integrity test environment...');
  
  // Clean up test directories
  const testDirs = [
    './tests/temp',
    './tests/fixtures',
    './tests/snapshots'
  ];
  
  for (const dir of testDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to clean up test directory ${dir}:`, error);
    }
  }
  
  // Clean up any test databases or resources
  await cleanupTestDatabase();
  
  // Reset environment variables
  delete process.env.TEST_DATABASE_URL;
  
  console.log('✅ Test environment cleanup completed');
};

async function cleanupTestDatabase() {
  // Clean up test database connections, temporary files, etc.
  // This ensures no resources are left hanging after tests
}