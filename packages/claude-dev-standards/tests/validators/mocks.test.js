const mockValidator = require('../../lib/validators/mocks');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { logger } = require('../../../../../../utils/logger');

describe('Mock Validator', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('should pass when no mocks are found', async () => {
    // Create clean files
    await fs.writeFile(
      path.join(tempDir, 'index.js'),
      `const db = require('./database');\nlogger.info('Hello');`
    );

    const result = await mockValidator.check(tempDir, {});
    
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should fail when mock database is found', async () => {
    // Create file with mock
    await fs.writeFile(
      path.join(tempDir, 'db.js'),
      `const mockDB = createMockDatabase();\nmodule.exports = mockDB;`
    );

    const result = await mockValidator.check(tempDir, {});
    
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('mock usage');
  });

  test('should ignore mocks in test files', async () => {
    // Create test file with mocks
    await fs.writeFile(
      path.join(tempDir, 'db.test.js'),
      `const mockDB = createMockDatabase();\ntest('should work', () => {});`
    );

    const result = await mockValidator.check(tempDir, {});
    
    expect(result.passed).toBe(true);
  });

  test('should warn about mock-like dependencies', async () => {
    // Create package.json with mock dependency
    await fs.writeJSON(path.join(tempDir, 'package.json'), {
      dependencies: {
        'mock-aws-s3': '^1.0.0',
        'express': '^4.0.0'
      }
    });

    const result = await mockValidator.check(tempDir, {});
    
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('mock-like dependencies');
  });
});