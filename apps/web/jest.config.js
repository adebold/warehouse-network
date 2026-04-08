const path = require('path')
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  // CRITICAL: Constrain rootDir to current project only
  rootDir: path.resolve(__dirname),

  // Explicitly set testMatch to prevent scanning external directories
  testMatch: [
    '<rootDir>/src/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}',
  ],

  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Use environment-specific configuration
  projects: [
    // UI Tests (React components, hooks, etc.) - jsdom environment
    {
      displayName: 'UI Tests',
      rootDir: path.resolve(__dirname),
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      testMatch: [
        '<rootDir>/src/components/**/*.test.{js,jsx,ts,tsx}',
        '<rootDir>/src/hooks/**/*.test.{js,jsx,ts,tsx}',
        '<rootDir>/src/lib/**/*.ui.test.{js,jsx,ts,tsx}',
        '<rootDir>/src/utils/**/*.test.{js,jsx,ts,tsx}',
        '<rootDir>/src/**/*.ui.test.{js,jsx,ts,tsx}',
      ],
      testPathIgnorePatterns: [
        '<rootDir>/.next/',
        '<rootDir>/node_modules/',
        '<rootDir>/e2e/',
        '/Users/adebold/Documents/GitHub/',
        '/Users/adebold/.vscode/',
        '/Users/adebold/Library/',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      moduleDirectories: ['node_modules', '<rootDir>/'],
      transform: {
        '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
      },
    },
    // API Tests (API routes, server functions) - node environment
    {
      displayName: 'API Tests',
      rootDir: path.resolve(__dirname),
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      testMatch: [
        '<rootDir>/tests/api/**/*.test.{js,ts}',
        '<rootDir>/src/app/api/**/*.test.{js,ts}',
        '<rootDir>/src/**/*.api.test.{js,ts}',
      ],
      testPathIgnorePatterns: [
        '<rootDir>/.next/',
        '<rootDir>/node_modules/',
        '<rootDir>/e2e/',
        '/Users/adebold/Documents/GitHub/',
        '/Users/adebold/.vscode/',
        '/Users/adebold/Library/',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      moduleDirectories: ['node_modules', '<rootDir>/'],
      transform: {
        '^.+\\.(js|ts)$': ['ts-jest', {
          tsconfig: {
            target: 'es2020',
            module: 'commonjs',
            moduleResolution: 'node',
            allowJs: true,
            skipLibCheck: true,
          }
        }],
      },
      testEnvironmentOptions: {
        // Ensure clean Node.js environment for API tests
        customExportConditions: ['node'],
      },
    },
    // Payment & External Service Tests - node environment with specific mocks
    {
      displayName: 'Payment Tests',
      rootDir: path.resolve(__dirname),
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      testMatch: [
        '<rootDir>/src/lib/payments/**/*.test.{js,ts}',
        '<rootDir>/src/lib/stripe/**/*.test.{js,ts}',
        '<rootDir>/src/**/*.payment.test.{js,ts}',
      ],
      testPathIgnorePatterns: [
        '<rootDir>/.next/',
        '<rootDir>/node_modules/',
        '<rootDir>/e2e/',
        '/Users/adebold/Documents/GitHub/',
        '/Users/adebold/.vscode/',
        '/Users/adebold/Library/',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      moduleDirectories: ['node_modules', '<rootDir>/'],
      transform: {
        '^.+\\.(js|ts)$': ['ts-jest', {
          tsconfig: {
            target: 'es2020',
            module: 'commonjs',
            moduleResolution: 'node',
            allowJs: true,
            skipLibCheck: true,
          }
        }],
      },
    },
  ],

  // Coverage configuration constrained to project
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,jsx,ts,tsx}',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/*.stories.{js,jsx,ts,tsx}',
    '!<rootDir>/src/**/*.test.{js,jsx,ts,tsx}',
    '!<rootDir>/src/app/**/*.{js,jsx,ts,tsx}', // Exclude Next.js app directory
  ],

  // CRITICAL: Ignore patterns to prevent scanning external directories
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',
    // Explicitly ignore user directories that were causing 789 duplicate mock conflicts
    '/Users/adebold/Documents/GitHub/',
    '/Users/adebold/.vscode/',
    '/Users/adebold/Library/',
    '/Users/adebold/Desktop/',
    '/Users/adebold/Downloads/',
  ],

  // Constrain module directories to project scope
  moduleDirectories: ['node_modules', '<rootDir>/'],

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,

  // Additional constraints to prevent external scanning
  watchPathIgnorePatterns: [
    '/Users/adebold/Documents/GitHub/(?!warehouse-network)',
    '/Users/adebold/.vscode/',
    '/Users/adebold/Library/',
  ],

  // Ensure Jest only looks at this project
  maxConcurrency: 4,
  maxWorkers: 4,
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)