const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: '../../apps/web',
})

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/config/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',

  // Test patterns
  testMatch: [
    '<rootDir>/**/__tests__/**/*.(js|jsx|ts|tsx)',
    '<rootDir>/**/*.(test|spec).(js|jsx|ts|tsx)',
  ],

  // Module path mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/../../apps/web/src/$1',
    '^@/auth/(.*)$': '<rootDir>/../../packages/auth/src/$1',
    '^@/db/(.*)$': '<rootDir>/../../packages/db/src/$1',
    '^@/security/(.*)$': '<rootDir>/../../packages/security/src/$1',
    '^@/types/(.*)$': '<rootDir>/../../packages/types/src/$1',
  },

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/coverage/',
    '/tests/fixtures/',
    '/tests/utils/',
  ],
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './packages/auth/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './packages/security/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },

  // Test environment setup
  setupFiles: ['<rootDir>/config/env.setup.js'],

  // Transform patterns
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Test timeout
  testTimeout: 30000,

  // Globals
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react-jsx',
      },
    },
  },
}

module.exports = createJestConfig(customJestConfig)