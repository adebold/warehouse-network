/**
 * Quality Configuration - Central configuration for all quality gates and validators
 * This configuration enforces production-ready standards across all projects
 */

import type { QualityGateConfig } from '../cicd/quality-gates';
import type { ValidationEngineConfig } from '../core/validation-engine';
import type { AuthValidationOptions } from '../validators/auth';
import type { DatabaseValidationOptions } from '../validators/database';
import type { LoggingValidationOptions } from '../validators/logging';
import type { MockValidationOptions } from '../validators/mocks';
import type { SecurityValidationOptions } from '../validators/security';
import type { TestingValidationOptions } from '../validators/testing';

export interface QualityConfig {
  // Quality gate thresholds
  qualityGates: QualityGateConfig;
  
  // Validator configurations
  validators: {
    mocks: MockValidationOptions;
    auth: AuthValidationOptions;
    database: DatabaseValidationOptions;
    security: SecurityValidationOptions;
    testing: TestingValidationOptions;
    logging: LoggingValidationOptions;
  };
  
  // Validation engine configuration
  engine: ValidationEngineConfig;
  
  // Enforcement settings
  enforcement: {
    blockOnFailure: boolean;
    autoFix: boolean;
    generateReports: boolean;
    notifyOnFailure: boolean;
    githubIntegration: boolean;
  };
}

// Strict production configuration
export const STRICT_CONFIG: QualityConfig = {
  qualityGates: {
    complexity: {
      cyclomatic: 10,
      cognitive: 15,
      nesting: 4,
      linesPerFunction: 50,
      filesPerModule: 10
    },
    coverage: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90
    },
    documentation: {
      minCoverage: 80,
      requiredSections: ['Overview', 'Installation', 'Usage', 'API', 'Testing'],
      maxTodoCount: 0
    },
    security: {
      allowedVulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      requiredHeaders: [
        'helmet',
        'X-Frame-Options',
        'X-Content-Type-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy'
      ],
      bannedPatterns: [
        /eval\s*\(/,
        /innerHTML\s*=/,
        /document\.write/,
        /\.exec\s*\(/,
        /new\s+Function\s*\(/,
        /\$\{.*\}/  // Template literals in queries
      ]
    },
    performance: {
      maxBuildTime: 30, // seconds
      maxMemoryUsage: 256, // MB
      maxBundleSize: 200, // KB
      maxLoadTime: 2000 // ms
    },
    codeQuality: {
      maxEslintErrors: 0,
      maxEslintWarnings: 0,
      enforceFormatting: true
    }
  },
  
  validators: {
    mocks: {
      excludePaths: ['**/node_modules/**', '**/dist/**'],
      allowInTests: false, // No mocks even in tests
      strictMode: true,
      customPatterns: [
        {
          pattern: /fakeFetch|mockFetch|fetchMock/,
          message: 'Mock fetch detected',
          severity: 'error',
          category: 'mock-fetch'
        },
        {
          pattern: /testData|dummyData|sampleData/,
          message: 'Test data in production code',
          severity: 'error',
          category: 'test-data'
        }
      ]
    },
    
    auth: {
      requireJWT: true,
      requireRefreshTokens: true,
      requireSecureStorage: true,
      requirePasswordHashing: true,
      requireRBAC: true,
      minPasswordComplexity: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      }
    },
    
    database: {
      requirePostgreSQL: true,
      requireRedis: true,
      requireMigrations: true,
      requireConnectionPooling: true,
      requireSSL: true,
      requireTransactions: true,
      bannedDatabases: [
        'sqlite:memory',
        ':memory:',
        'mongodb-memory-server',
        'mock-database',
        'in-memory',
        'h2',
        'sqlite'
      ]
    },
    
    security: {
      requireHelmet: true,
      requireCORS: true,
      requireRateLimit: true,
      requireCSRF: true,
      requireInputValidation: true,
      requireSecurityHeaders: [
        'X-Frame-Options',
        'X-Content-Type-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'Referrer-Policy',
        'Permissions-Policy'
      ],
      bannedFunctions: [
        'eval',
        'Function',
        'setTimeout(.*string',
        'setInterval(.*string',
        'innerHTML',
        'outerHTML',
        'document.write',
        'document.writeln',
        'insertAdjacentHTML'
      ],
      maxVulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 2
      }
    },
    
    testing: {
      minCoverage: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90
      },
      requireUnitTests: true,
      requireIntegrationTests: true,
      requireE2ETests: true,
      maxSkippedTests: 0,
      requireTestDocumentation: true,
      testFilePatterns: [
        '**/*.test.{js,jsx,ts,tsx}',
        '**/*.spec.{js,jsx,ts,tsx}',
        '**/test/**/*.{js,jsx,ts,tsx}',
        '**/tests/**/*.{js,jsx,ts,tsx}',
        '**/__tests__/**/*.{js,jsx,ts,tsx}'
      ]
    },
    
    logging: {
      requireStructuredLogging: true,
      requireCorrelationIds: true,
      requireLogLevels: true,
      bannedLoggingMethods: [
        'console.log',
        'console.debug',
        'console.info',
        'console.warn',
        'console.error',
        'console.trace',
        'console.dir',
        'console.table'
      ],
      requiredLoggers: ['winston', 'pino', 'bunyan'],
      requireErrorLogging: true,
      requireRequestLogging: true,
      requirePerformanceLogging: true
    }
  },
  
  engine: {
    standards: {
      standards: 'strict',
      noMocks: true,
      productionReady: true
    },
    validators: {
      mocks: true,
      auth: true,
      database: true,
      security: true,
      testing: true,
      logging: true,
      qualityGates: true,
      codeQuality: true
    },
    parallel: true,
    failFast: false,
    reportFormat: 'markdown',
    outputDir: '.claude-standards/reports'
  },
  
  enforcement: {
    blockOnFailure: true,
    autoFix: false,
    generateReports: true,
    notifyOnFailure: true,
    githubIntegration: true
  }
};

// Recommended configuration (slightly more lenient)
export const RECOMMENDED_CONFIG: QualityConfig = {
  ...STRICT_CONFIG,
  qualityGates: {
    ...STRICT_CONFIG.qualityGates,
    coverage: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80
    },
    documentation: {
      minCoverage: 70,
      requiredSections: ['Overview', 'Installation', 'Usage', 'API'],
      maxTodoCount: 10
    },
    security: {
      ...STRICT_CONFIG.qualityGates.security,
      allowedVulnerabilities: {
        critical: 0,
        high: 0,
        medium: 2,
        low: 5
      }
    },
    performance: {
      maxBuildTime: 60,
      maxMemoryUsage: 512,
      maxBundleSize: 500,
      maxLoadTime: 3000
    },
    codeQuality: {
      maxEslintErrors: 0,
      maxEslintWarnings: 10,
      enforceFormatting: true
    }
  },
  validators: {
    ...STRICT_CONFIG.validators,
    testing: {
      ...STRICT_CONFIG.validators.testing,
      minCoverage: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      },
      requireE2ETests: false // Optional in recommended
    }
  }
};

// Minimal configuration (for gradual adoption)
export const MINIMAL_CONFIG: QualityConfig = {
  ...RECOMMENDED_CONFIG,
  qualityGates: {
    ...RECOMMENDED_CONFIG.qualityGates,
    complexity: {
      cyclomatic: 15,
      cognitive: 20,
      nesting: 5,
      linesPerFunction: 100,
      filesPerModule: 20
    },
    coverage: {
      statements: 60,
      branches: 50,
      functions: 60,
      lines: 60
    },
    documentation: {
      minCoverage: 50,
      requiredSections: ['Overview', 'Usage'],
      maxTodoCount: 20
    },
    security: {
      ...RECOMMENDED_CONFIG.qualityGates.security,
      allowedVulnerabilities: {
        critical: 0,
        high: 1,
        medium: 5,
        low: 10
      }
    },
    performance: {
      maxBuildTime: 120,
      maxMemoryUsage: 1024,
      maxBundleSize: 1000,
      maxLoadTime: 5000
    },
    codeQuality: {
      maxEslintErrors: 5,
      maxEslintWarnings: 20,
      enforceFormatting: false
    }
  },
  validators: {
    ...RECOMMENDED_CONFIG.validators,
    mocks: {
      ...RECOMMENDED_CONFIG.validators.mocks,
      allowInTests: true // Allow mocks in tests for minimal config
    },
    database: {
      ...RECOMMENDED_CONFIG.validators.database,
      requireRedis: false,
      requireSSL: false
    },
    security: {
      ...RECOMMENDED_CONFIG.validators.security,
      requireCSRF: false // Make CSRF optional
    },
    testing: {
      ...RECOMMENDED_CONFIG.validators.testing,
      minCoverage: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60
      },
      requireIntegrationTests: false,
      requireE2ETests: false,
      maxSkippedTests: 5
    },
    logging: {
      ...RECOMMENDED_CONFIG.validators.logging,
      requireCorrelationIds: false,
      requirePerformanceLogging: false
    }
  },
  enforcement: {
    ...RECOMMENDED_CONFIG.enforcement,
    blockOnFailure: false // Don't block in minimal config
  }
};

// Get configuration by name
export function getConfig(configName: 'strict' | 'recommended' | 'minimal' = 'recommended'): QualityConfig {
  switch (configName) {
    case 'strict':
      return STRICT_CONFIG;
    case 'minimal':
      return MINIMAL_CONFIG;
    case 'recommended':
    default:
      return RECOMMENDED_CONFIG;
  }
}

// Merge user configuration with base configuration
export function mergeConfig(baseConfig: QualityConfig, userConfig: Partial<QualityConfig>): QualityConfig {
  return deepMerge(baseConfig, userConfig);
}

// Deep merge utility
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] !== undefined) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key] as any;
      }
    }
  }
  
  return result;
}