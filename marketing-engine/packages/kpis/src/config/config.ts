import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  env: z.enum(['development', 'production', 'test']),
  port: z.number(),
  database: z.object({
    host: z.string(),
    port: z.number(),
    name: z.string(),
    user: z.string(),
    password: z.string(),
    poolMax: z.number(),
    idleTimeout: z.number(),
    connectionTimeout: z.number(),
    ssl: z.boolean()
  }),
  redis: z.object({
    host: z.string(),
    port: z.number(),
    password: z.string().optional(),
    db: z.number(),
    ttl: z.object({
      default: z.number(),
      kpiData: z.number(),
      aggregations: z.number()
    })
  }),
  kpi: z.object({
    batchSize: z.number(),
    calculationInterval: z.number(),
    retentionDays: z.number(),
    leadQualityThreshold: z.number(),
    contentEngagementWeight: z.object({
      views: z.number(),
      shares: z.number(),
      comments: z.number(),
      conversions: z.number()
    })
  }),
  monitoring: z.object({
    logLevel: z.enum(['error', 'warn', 'info', 'debug']),
    metricsPort: z.number(),
    healthCheckInterval: z.number()
  })
});

export const config = configSchema.parse({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'marketing_kpis',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10),
    ssl: process.env.DB_SSL === 'true'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    ttl: {
      default: parseInt(process.env.REDIS_TTL_DEFAULT || '3600', 10),
      kpiData: parseInt(process.env.REDIS_TTL_KPI || '300', 10),
      aggregations: parseInt(process.env.REDIS_TTL_AGG || '600', 10)
    }
  },
  kpi: {
    batchSize: parseInt(process.env.KPI_BATCH_SIZE || '100', 10),
    calculationInterval: parseInt(process.env.KPI_CALC_INTERVAL || '60000', 10),
    retentionDays: parseInt(process.env.KPI_RETENTION_DAYS || '730', 10),
    leadQualityThreshold: parseFloat(process.env.LEAD_QUALITY_THRESHOLD || '0.7'),
    contentEngagementWeight: {
      views: parseFloat(process.env.WEIGHT_VIEWS || '0.1'),
      shares: parseFloat(process.env.WEIGHT_SHARES || '0.3'),
      comments: parseFloat(process.env.WEIGHT_COMMENTS || '0.2'),
      conversions: parseFloat(process.env.WEIGHT_CONVERSIONS || '0.4')
    }
  },
  monitoring: {
    logLevel: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10)
  }
});

export type Config = z.infer<typeof configSchema>;