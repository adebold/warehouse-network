module.exports = {
  ...require('./jest.config.js'),
  testMatch: ['**/tests/integration/**/*.test.ts'],
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
    '<rootDir>/tests/integration/setup.ts'
  ],
  testTimeout: 30000,
  globalSetup: '<rootDir>/tests/integration/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/integration/globalTeardown.ts'
};