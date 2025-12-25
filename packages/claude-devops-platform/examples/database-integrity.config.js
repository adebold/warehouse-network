/**
 * Database Integrity Configuration Example
 * 
 * This configuration file controls all aspects of database integrity management,
 * including migrations, drift detection, schema analysis, and validation.
 */

module.exports = {
  database: {
    // Database connection configuration
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'warehouse_network',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      // Connection pool settings
      pool: {
        min: 2,
        max: 10,
        idleTimeoutMillis: 30000,
      },
    },
    
    // Migration settings
    migrations: {
      directory: './migrations',
      tableName: 'database_migrations',
      extension: '.ts',
      template: 'default', // Options: default, sql, knex
      validateBeforeRun: true,
      transactionMode: 'each', // Options: each, all, none
      // Custom migration templates
      templates: {
        table: './templates/migration-table.ts',
        index: './templates/migration-index.ts',
        constraint: './templates/migration-constraint.ts',
      },
    },
    
    // Drift detection settings
    drift: {
      // Tables to ignore during drift detection
      ignoreTables: [
        'database_migrations',
        'sessions',
        'audit_logs',
        '_prisma_migrations', // If using Prisma
        'knex_migrations', // If using Knex
      ],
      // Columns to ignore (applies to all tables)
      ignoreColumns: ['created_at', 'updated_at', 'deleted_at'],
      // Patterns to ignore (regex)
      ignorePatterns: {
        tables: [/^tmp_/, /^_archived_/],
        columns: [/_temp$/, /_old$/],
      },
      // How often to check for drift (in milliseconds)
      checkInterval: 3600000, // 1 hour in production
      // Automatically create fix migrations
      autoFix: false,
      // Drift severity thresholds
      severity: {
        critical: ['missing_primary_key', 'type_mismatch', 'missing_not_null'],
        high: ['missing_index', 'missing_foreign_key'],
        medium: ['missing_constraint', 'column_order_change'],
        low: ['missing_comment', 'default_value_change'],
      },
    },
    
    // Schema analysis settings
    schema: {
      // Performance analysis thresholds
      performanceThresholds: {
        missingIndexRowCount: 10000, // Warn if table > 10k rows has no index
        tableSize: 1000000, // 1M rows
        indexedColumnRatio: 0.3, // Warn if > 30% columns are indexed
        unusedIndexDays: 30, // Warn if index unused for 30 days
      },
      // Naming convention rules
      namingConventions: {
        table: 'snake_case', // Options: snake_case, camelCase, PascalCase
        column: 'snake_case',
        constraint: 'snake_case',
        index: '{table}_{columns}_idx',
        foreignKey: '{table}_{column}_fk',
        primaryKey: '{table}_pkey',
        // Custom validation regex
        customRules: {
          table: /^[a-z][a-z0-9_]*$/,
          column: /^[a-z][a-z0-9_]*$/,
        },
      },
      // Schema best practices
      bestPractices: {
        requirePrimaryKey: true,
        requireCreatedAt: true,
        requireUpdatedAt: true,
        requireIndexOnForeignKey: true,
        maxColumnsPerTable: 50,
        maxIndexesPerTable: 15,
      },
    },
    
    // Validation settings
    validation: {
      // API route validation
      routes: {
        directories: ['./src/api', './src/routes', './pages/api'],
        frameworks: ['express', 'fastify', 'koa', 'next', 'hono'],
        // Patterns to check
        patterns: {
          paramValidation: true,
          queryValidation: true,
          bodyValidation: true,
          responseValidation: true,
        },
        // Custom validators
        validators: {
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        },
      },
      // Frontend form validation
      forms: {
        directories: ['./src/components', './src/pages', './components', './app'],
        frameworks: ['react', 'vue', 'angular', 'svelte', 'solid'],
        // Form libraries to check
        libraries: ['react-hook-form', 'formik', 'vee-validate', 'zod'],
        // Generate validation schemas
        generateSchemas: {
          zod: true,
          yup: true,
          joi: false,
        },
      },
      // GraphQL schema validation
      graphql: {
        enabled: true,
        schemaPath: './src/graphql/schema.graphql',
        resolverPaths: ['./src/graphql/resolvers'],
      },
    },
    
    // Monitoring and alerting
    monitoring: {
      enabled: process.env.NODE_ENV === 'production',
      // Real-time drift monitoring
      realtime: {
        enabled: true,
        maxDriftEvents: 100, // Max events to keep in memory
        debounceInterval: 5000, // 5 seconds
      },
      // Webhook notifications
      webhooks: [
        {
          url: process.env.DRIFT_WEBHOOK_URL,
          events: ['drift_detected', 'migration_failed', 'validation_error'],
          headers: {
            'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN}`,
          },
        },
      ],
      // Slack integration
      slack: {
        enabled: !!process.env.SLACK_WEBHOOK_URL,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_DRIFT_CHANNEL || '#database-alerts',
        mentions: {
          critical: ['@channel'],
          high: ['@database-team'],
          medium: [],
          low: [],
        },
      },
      // Email alerts
      email: {
        enabled: !!process.env.SMTP_HOST,
        smtp: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        },
        from: process.env.DRIFT_ALERT_FROM || 'alerts@example.com',
        to: (process.env.DRIFT_ALERT_EMAILS || '').split(','),
        templates: {
          driftDetected: './templates/email-drift.html',
          migrationFailed: './templates/email-migration-failed.html',
        },
      },
      // PagerDuty integration
      pagerduty: {
        enabled: !!process.env.PAGERDUTY_TOKEN,
        token: process.env.PAGERDUTY_TOKEN,
        serviceId: process.env.PAGERDUTY_SERVICE_ID,
        escalationPolicy: process.env.PAGERDUTY_ESCALATION_POLICY,
      },
    },
    
    // Type generation settings
    typeGeneration: {
      output: './src/types/database.generated.ts',
      // Type mapping overrides
      customTypes: {
        'uuid': 'string',
        'jsonb': 'Record<string, any>',
        'json': 'Record<string, any>',
        'timestamp': 'Date',
        'timestamptz': 'Date',
        'date': 'string',
        'time': 'string',
        'decimal': 'number',
        'numeric': 'number',
      },
      // Generate additional utilities
      utilities: {
        enums: true, // Generate enums from check constraints
        validators: true, // Generate Zod validators
        factories: true, // Generate test factories
        mocks: true, // Generate mock data generators
      },
      // Prettier configuration for generated files
      prettier: {
        semi: true,
        singleQuote: true,
        tabWidth: 2,
        trailingComma: 'es5',
      },
    },
    
    // Advanced features
    advanced: {
      // Multi-tenant support
      multiTenant: {
        enabled: false,
        strategy: 'schema', // Options: schema, table, database
        tenantColumn: 'tenant_id',
        tenantSchema: 'tenant_{id}',
      },
      // Partitioning support
      partitioning: {
        enabled: false,
        tables: {
          'audit_logs': {
            type: 'range',
            column: 'created_at',
            interval: 'monthly',
          },
        },
      },
      // Read replica configuration
      readReplicas: [
        {
          host: process.env.DB_READ_HOST_1,
          port: process.env.DB_READ_PORT_1 || 5432,
          weight: 1,
        },
      ],
    },
  },
  
  // Environment-specific overrides
  environments: {
    development: {
      database: {
        connection: {
          database: 'warehouse_network_dev',
        },
        drift: {
          checkInterval: 300000, // 5 minutes
          autoFix: true,
        },
        monitoring: {
          enabled: false,
        },
      },
    },
    test: {
      database: {
        connection: {
          database: 'warehouse_network_test',
          // Use separate schema for tests
          searchPath: ['test', 'public'],
        },
        migrations: {
          directory: './migrations',
          transactionMode: 'all', // Run all test migrations in one transaction
        },
        drift: {
          enabled: false, // Disable drift detection in tests
        },
        monitoring: {
          enabled: false,
        },
      },
    },
    staging: {
      database: {
        connection: {
          database: 'warehouse_network_staging',
          ssl: { rejectUnauthorized: true },
        },
        drift: {
          checkInterval: 1800000, // 30 minutes
          autoFix: false,
        },
        monitoring: {
          slack: {
            channel: '#database-staging',
          },
        },
      },
    },
    production: {
      database: {
        connection: {
          ssl: { rejectUnauthorized: true },
          pool: {
            min: 5,
            max: 20,
          },
        },
        migrations: {
          validateBeforeRun: true,
          backupBeforeMigration: true,
        },
        drift: {
          checkInterval: 300000, // 5 minutes
          autoFix: false,
        },
        monitoring: {
          enabled: true,
          realtime: {
            enabled: true,
          },
        },
      },
    },
  },
  
  // Feature flags
  features: {
    autoMigration: process.env.AUTO_MIGRATION === 'true',
    driftDetection: process.env.DRIFT_DETECTION !== 'false',
    schemaValidation: process.env.SCHEMA_VALIDATION !== 'false',
    typeGeneration: process.env.TYPE_GENERATION !== 'false',
  },
};