export const DEFAULT_CONFIG = {
  database: {
    provider: 'generic' as const,
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/mydb',
    schema: 'public',
    migrations: {
      directory: './migrations',
      tableName: '__migrations'
    }
  },
  validation: {
    forms: {
      enabled: true,
      directory: './src/forms',
      patterns: ['**/*.tsx', '**/*.jsx']
    },
    routes: {
      enabled: true,
      directory: './src/routes',
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
      ttl: 86400000, // 24 hours
      syncInterval: 300000 // 5 minutes
    },
    cache: {
      provider: 'memory' as const,
      options: {}
    }
  },
  monitoring: {
    enabled: true,
    interval: 300000, // 5 minutes
    alerts: {
      email: []
    },
    logging: {
      level: 'info' as const,
      file: './logs/claude-db-integrity.log',
      maxSize: '10m',
      maxFiles: 5
    }
  },
  templates: {
    framework: 'generic' as const,
    features: [],
    customizations: {}
  }
};