const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Integration test configuration
const integrationJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.js'],
  moduleNameMapping: {
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'jest-environment-node', // Node environment for database access
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/*.test.{js,jsx,ts,tsx}',
    '!src/app/**/*.{js,jsx,ts,tsx}', // Exclude Next.js app directory
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',
    '<rootDir>/tests/unit/', // Exclude unit tests
  ],
  testMatch: [
    '**/tests/integration/**/*.(test|spec).(js|jsx|ts|tsx)',
    '**/tests/api/**/*.(test|spec).(js|jsx|ts|tsx)', // Include API tests as integration
  ],
  moduleDirectories: ['node_modules', '<rootDir>/'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  // Set test timeout for database operations
  testTimeout: 30000,
  // Run tests serially to avoid database conflicts
  maxWorkers: 1,
}

// Set environment variables for integration tests
process.env.NODE_ENV = 'test'
process.env.TEST_TYPE = 'integration'
process.env.INTEGRATION_TEST = 'true'

module.exports = createJestConfig(integrationJestConfig)