module.exports = {
  database: {
    provider: 'prisma',
    url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/dbname',
    schema: 'public',
    migrations: {
      directory: './prisma/migrations',
      tableName: '_prisma_migrations'
    },
    backup: {
      enabled: true,
      schedule: '0 2 * * *', // Daily at 2 AM
      retention: 7 // Keep 7 days of backups
    }
  },
  validation: {
    forms: {
      enabled: true,
      directory: './src/components',
      patterns: ['**/*.tsx', '**/forms/*.ts']
    },
    routes: {
      enabled: true,
      directory: './src/pages/api',
      patterns: ['**/*.ts', '**/*.js']
    },
    schemas: {
      strict: true,
      allowExtraFields: false
    }
  },
  memory: {
    claude: {
      enabled: true,
      namespace: 'claude-db-integrity',
      ttl: 3600, // 1 hour
      syncInterval: 300 // 5 minutes
    },
    cache: {
      provider: 'memory',
      options: {
        maxSize: 100, // MB
        ttl: 3600
      }
    }
  },
  monitoring: {
    enabled: true,
    interval: 30, // seconds
    alerts: {
      email: process.env.ALERT_EMAIL ? [process.env.ALERT_EMAIL] : [],
      webhook: process.env.ALERT_WEBHOOK,
      slack: process.env.SLACK_WEBHOOK
    },
    logging: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      file: './logs/claude-db-integrity.log',
      maxSize: '10m',
      maxFiles: 5
    }
  },
  templates: {
    framework: 'nextjs',
    features: ['prisma', 'typescript', 'tailwind', 'api-routes'],
    customizations: {
      prismaSchema: './prisma/schema.prisma',
      apiRoutes: './src/pages/api',
      components: './src/components',
      middleware: './src/middleware.ts'
    }
  }
};