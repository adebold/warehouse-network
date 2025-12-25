/**
 * Database Integrity System Configuration
 * This file configures the behavior of the database integrity system
 */

module.exports = {
  // Database connection settings
  database: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production',
    poolSize: 10,
    logLevel: process.env.LOG_LEVEL || 'info'
  },

  // Memory Bank settings
  memoryBank: {
    enabled: true,
    retentionDays: parseInt(process.env.MEMORY_BANK_RETENTION_DAYS || '90'),
    maxSizeMB: parseInt(process.env.MEMORY_BANK_MAX_SIZE_MB || '1000'),
    alertEmail: process.env.MEMORY_BANK_ALERT_EMAIL,
    cleanupEnabled: process.env.MEMORY_BANK_CLEANUP_ENABLED !== 'false',
    cleanupSchedule: process.env.MEMORY_BANK_CLEANUP_SCHEDULE || '0 2 * * *',
    
    // Category-specific configurations
    categories: {
      MIGRATION: { 
        level: 'INFO', 
        retention: 180,  // Keep migration logs for 6 months
        alertOnError: true 
      },
      ERROR: { 
        level: 'ERROR', 
        retention: 365,  // Keep error logs for 1 year
        alertOnError: true 
      },
      DRIFT_DETECTION: { 
        level: 'WARNING', 
        retention: 90,
        alertThreshold: parseInt(process.env.ALERT_DRIFT_THRESHOLD || '10')
      },
      VALIDATION: { 
        level: 'INFO', 
        retention: 30 
      },
      PERFORMANCE: { 
        level: 'INFO', 
        retention: 30,
        slowQueryThreshold: parseInt(process.env.PERF_SLOW_QUERY_THRESHOLD || '1000')
      }
    }
  },

  // Migration settings
  migration: {
    migrationsDir: __dirname + '/packages/db/prisma/migrations',
    tableName: '_migration_history',
    autoRun: false,
    validateChecksums: true,
    transactional: true
  },

  // Schema settings
  schema: {
    schemaFiles: [__dirname + '/packages/db/prisma/schema.prisma'],
    includeViews: true,
    includeIndexes: true,
    includeConstraints: true
  },

  // Validation settings
  validation: {
    enabled: true,
    routes: {
      apiDir: __dirname + '/apps/web/pages/api',
      patterns: ['**/*.ts', '**/*.js'],
      validatePagination: true,
      validateFilters: true
    },
    forms: {
      scanDirs: [
        __dirname + '/apps/web/components',
        __dirname + '/apps/web/pages'
      ],
      filePatterns: ['**/*.tsx', '**/*.jsx'],
      frameworks: ['nextjs', 'react'],
      validateRequired: true,
      validateTypes: true
    },
    prismaModels: {
      validateRelations: true,
      validateEnums: true,
      validateDefaults: true
    }
  },

  // Drift detection settings
  drift: {
    enabled: true,
    autoFix: false,
    severity: 'HIGH',
    checkInterval: process.env.NODE_ENV === 'production' ? 3600000 : 0  // 1 hour in prod
  },

  // Prisma settings
  prisma: {
    schemaPath: __dirname + '/packages/db/prisma/schema.prisma',
    migrationsDir: __dirname + '/packages/db/prisma/migrations',
    datasourceProvider: 'postgresql'
  },

  // Alert settings
  alerts: {
    enabled: process.env.ALERT_ENABLED !== 'false',
    channels: (process.env.ALERT_CHANNELS || 'email').split(','),
    thresholds: {
      errorRate: parseFloat(process.env.ALERT_ERROR_THRESHOLD || '0.05'),
      driftCount: parseInt(process.env.ALERT_DRIFT_THRESHOLD || '10'),
      migrationFailure: 1,
      criticalLogCount: 1,
      memoryUsage: parseInt(process.env.PERF_MEMORY_WARNING_THRESHOLD || '80')
    },
    webhooks: {
      general: process.env.ALERT_WEBHOOK_URL,
      slack: process.env.SLACK_WEBHOOK_URL
    }
  },

  // Performance tracking
  performance: {
    enabled: process.env.PERF_TRACKING_ENABLED !== 'false',
    slowQueryThreshold: parseInt(process.env.PERF_SLOW_QUERY_THRESHOLD || '1000'),
    memoryWarningThreshold: parseInt(process.env.PERF_MEMORY_WARNING_THRESHOLD || '80'),
    trackExecutionTime: true,
    trackMemoryUsage: true,
    trackCPUUsage: true
  }
};