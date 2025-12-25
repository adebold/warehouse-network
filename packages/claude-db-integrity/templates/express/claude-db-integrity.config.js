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
      directory: './src/routes',
      patterns: ['**/*.js', '**/*.ts']
    },
    routes: {
      enabled: true,
      directory: './src/routes',
      patterns: ['**/*.js', '**/*.ts']
    },
    schemas: {
      strict: true,
      allowExtraFields: false
    }
  },
  memory: {
    claude: {
      enabled: true,
      namespace: 'claude-db-integrity-express',
      ttl: 3600, // 1 hour
      syncInterval: 300 // 5 minutes
    },
    cache: {
      provider: 'redis',
      options: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: 0
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
    framework: 'express',
    features: ['prisma', 'typescript', 'redis', 'cors', 'helmet'],
    customizations: {
      prismaSchema: './prisma/schema.prisma',
      routes: './src/routes',
      middleware: './src/middleware',
      controllers: './src/controllers'
    }
  }
};