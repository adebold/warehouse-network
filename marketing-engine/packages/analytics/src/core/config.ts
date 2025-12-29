/**
 * Analytics configuration management
 */

import Joi from 'joi';
import { DataRetentionPolicy } from './types';

export interface AnalyticsConfig {
  // Database
  database: {
    url: string;
    poolMin: number;
    poolMax: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
    ssl?: {
      rejectUnauthorized: boolean;
      ca?: string;
    };
  };

  // Redis
  redis: {
    url: string;
    cluster?: string[];
    password?: string;
    db: number;
    keyPrefix: string;
    streamKey: string;
    consumerGroup: string;
    maxRetries: number;
    retryStrategy?: (times: number) => number | undefined;
  };

  // Google Analytics 4
  ga4: {
    measurementId: string;
    apiSecret: string;
    propertyId: string;
    serviceAccountKeyPath?: string;
    batchSize: number;
    flushInterval: number;
    enabled: boolean;
  };

  // Mixpanel
  mixpanel: {
    projectToken: string;
    apiKey?: string;
    apiSecret?: string;
    euResidency: boolean;
    batchSize: number;
    flushInterval: number;
    enabled: boolean;
  };

  // Attribution
  attribution: {
    lookbackWindowDays: number;
    modelUpdateInterval: number;
    defaultModel: string;
    enableMLModels: boolean;
    modelPath?: string;
  };

  // Processing
  processing: {
    realtimeBatchSize: number;
    realtimeInterval: number;
    maxRetries: number;
    retryDelay: number;
    deadLetterQueueEnabled: boolean;
  };

  // Security & Compliance
  security: {
    jwtSecret: string;
    jwtExpiry: string;
    encryptionKey: string;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
  };

  compliance: {
    gdpr: {
      enabled: boolean;
      dataRetention: DataRetentionPolicy;
      consentRequired: boolean;
      anonymizeIP: boolean;
    };
    ccpa: {
      enabled: boolean;
      doNotSell: boolean;
    };
  };

  // Monitoring
  monitoring: {
    otelEndpoint?: string;
    serviceName: string;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    logFormat: 'json' | 'text';
    metricsEnabled: boolean;
    tracingEnabled: boolean;
  };

  // API
  api?: {
    port: number;
    host: string;
    basePath: string;
    corsOrigin: string | string[];
    bodyLimit: string;
    trustProxy: boolean;
  };
}

// Configuration schema for validation
export const configSchema = Joi.object<AnalyticsConfig>({
  database: Joi.object({
    url: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
    poolMin: Joi.number().min(0).default(2),
    poolMax: Joi.number().min(1).default(20),
    idleTimeoutMillis: Joi.number().min(0).default(10000),
    connectionTimeoutMillis: Joi.number().min(0).default(3000),
    ssl: Joi.object({
      rejectUnauthorized: Joi.boolean(),
      ca: Joi.string()
    }).optional()
  }).required(),

  redis: Joi.object({
    url: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
    cluster: Joi.array().items(Joi.string()).optional(),
    password: Joi.string().optional(),
    db: Joi.number().min(0).default(0),
    keyPrefix: Joi.string().default('analytics:'),
    streamKey: Joi.string().default('analytics:events'),
    consumerGroup: Joi.string().default('analytics-consumers'),
    maxRetries: Joi.number().min(0).default(3)
  }).required(),

  ga4: Joi.object({
    measurementId: Joi.string().pattern(/^G-[A-Z0-9]+$/).required(),
    apiSecret: Joi.string().required(),
    propertyId: Joi.string().required(),
    serviceAccountKeyPath: Joi.string().optional(),
    batchSize: Joi.number().min(1).max(25).default(20),
    flushInterval: Joi.number().min(100).default(1000),
    enabled: Joi.boolean().default(true)
  }).required(),

  mixpanel: Joi.object({
    projectToken: Joi.string().required(),
    apiKey: Joi.string().optional(),
    apiSecret: Joi.string().optional(),
    euResidency: Joi.boolean().default(false),
    batchSize: Joi.number().min(1).max(50).default(50),
    flushInterval: Joi.number().min(100).default(1000),
    enabled: Joi.boolean().default(true)
  }).required(),

  attribution: Joi.object({
    lookbackWindowDays: Joi.number().min(1).max(90).default(30),
    modelUpdateInterval: Joi.number().min(3600).default(21600), // 6 hours
    defaultModel: Joi.string().valid(
      'first_touch',
      'last_touch',
      'linear',
      'time_decay',
      'position_based',
      'data_driven'
    ).default('linear'),
    enableMLModels: Joi.boolean().default(true),
    modelPath: Joi.string().optional()
  }).required(),

  processing: Joi.object({
    realtimeBatchSize: Joi.number().min(1).default(1000),
    realtimeInterval: Joi.number().min(10).default(100),
    maxRetries: Joi.number().min(0).default(3),
    retryDelay: Joi.number().min(100).default(1000),
    deadLetterQueueEnabled: Joi.boolean().default(true)
  }).required(),

  security: Joi.object({
    jwtSecret: Joi.string().min(32).required(),
    jwtExpiry: Joi.string().default('7d'),
    encryptionKey: Joi.string().base64().length(44).required(), // 32 bytes base64
    rateLimitWindowMs: Joi.number().min(1000).default(900000), // 15 minutes
    rateLimitMaxRequests: Joi.number().min(1).default(1000)
  }).required(),

  compliance: Joi.object({
    gdpr: Joi.object({
      enabled: Joi.boolean().default(true),
      dataRetention: Joi.object({
        retentionDays: Joi.number().min(1).default(365),
        anonymizeAfterDays: Joi.number().min(1).default(730),
        deleteAfterDays: Joi.number().min(1).default(1095), // 3 years
        excludeFields: Joi.array().items(Joi.string()).optional()
      }).required(),
      consentRequired: Joi.boolean().default(true),
      anonymizeIP: Joi.boolean().default(true)
    }).required(),
    ccpa: Joi.object({
      enabled: Joi.boolean().default(true),
      doNotSell: Joi.boolean().default(false)
    }).required()
  }).required(),

  monitoring: Joi.object({
    otelEndpoint: Joi.string().uri().optional(),
    serviceName: Joi.string().default('marketing-analytics'),
    logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    logFormat: Joi.string().valid('json', 'text').default('json'),
    metricsEnabled: Joi.boolean().default(true),
    tracingEnabled: Joi.boolean().default(true)
  }).required(),

  api: Joi.object({
    port: Joi.number().port().default(3001),
    host: Joi.string().default('0.0.0.0'),
    basePath: Joi.string().default('/api/v1'),
    corsOrigin: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).default('*'),
    bodyLimit: Joi.string().default('10mb'),
    trustProxy: Joi.boolean().default(false)
  }).optional()
});

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): AnalyticsConfig {
  const config: AnalyticsConfig = {
    database: {
      url: process.env.DATABASE_URL!,
      poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2'),
      poolMax: parseInt(process.env.DATABASE_POOL_MAX || '20'),
      idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MILLIS || '10000'),
      connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MILLIS || '3000')
    },
    redis: {
      url: process.env.REDIS_URL!,
      cluster: process.env.REDIS_CLUSTER_NODES?.split(',').filter(Boolean),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'analytics:',
      streamKey: process.env.REDIS_STREAM_KEY || 'analytics:events',
      consumerGroup: process.env.REDIS_STREAM_CONSUMER_GROUP || 'analytics-consumers',
      maxRetries: 3
    },
    ga4: {
      measurementId: process.env.GA4_MEASUREMENT_ID!,
      apiSecret: process.env.GA4_API_SECRET!,
      propertyId: process.env.GA4_PROPERTY_ID!,
      serviceAccountKeyPath: process.env.GA4_SERVICE_ACCOUNT_KEY_PATH,
      batchSize: 20,
      flushInterval: 1000,
      enabled: true
    },
    mixpanel: {
      projectToken: process.env.MIXPANEL_PROJECT_TOKEN!,
      apiKey: process.env.MIXPANEL_API_KEY,
      apiSecret: process.env.MIXPANEL_API_SECRET,
      euResidency: process.env.MIXPANEL_EU_RESIDENCY === 'true',
      batchSize: 50,
      flushInterval: 1000,
      enabled: true
    },
    attribution: {
      lookbackWindowDays: parseInt(process.env.ATTRIBUTION_LOOKBACK_WINDOW_DAYS || '30'),
      modelUpdateInterval: parseInt(process.env.ATTRIBUTION_MODEL_UPDATE_INTERVAL_HOURS || '6') * 3600,
      defaultModel: 'linear',
      enableMLModels: process.env.ML_TRAINING_ENABLED === 'true',
      modelPath: process.env.ML_MODEL_PATH
    },
    processing: {
      realtimeBatchSize: parseInt(process.env.REAL_TIME_PROCESSING_BATCH_SIZE || '1000'),
      realtimeInterval: parseInt(process.env.REAL_TIME_PROCESSING_INTERVAL_MS || '100'),
      maxRetries: 3,
      retryDelay: 1000,
      deadLetterQueueEnabled: true
    },
    security: {
      jwtSecret: process.env.JWT_SECRET!,
      jwtExpiry: process.env.JWT_EXPIRY || '7d',
      encryptionKey: process.env.ENCRYPTION_KEY!,
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
      rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000')
    },
    compliance: {
      gdpr: {
        enabled: true,
        dataRetention: {
          retentionDays: parseInt(process.env.GDPR_DATA_RETENTION_DAYS || '365'),
          anonymizeAfterDays: parseInt(process.env.GDPR_ANONYMIZE_AFTER_DAYS || '730'),
          deleteAfterDays: 1095,
          excludeFields: []
        },
        consentRequired: true,
        anonymizeIP: true
      },
      ccpa: {
        enabled: true,
        doNotSell: false
      }
    },
    monitoring: {
      otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      serviceName: process.env.OTEL_SERVICE_NAME || 'marketing-analytics',
      logLevel: (process.env.LOG_LEVEL || 'info') as any,
      logFormat: (process.env.LOG_FORMAT || 'json') as any,
      metricsEnabled: process.env.METRICS_ENABLED !== 'false',
      tracingEnabled: process.env.TRACING_ENABLED !== 'false'
    },
    api: process.env.API_PORT ? {
      port: parseInt(process.env.API_PORT),
      host: process.env.API_HOST || '0.0.0.0',
      basePath: process.env.API_BASE_PATH || '/api/v1',
      corsOrigin: process.env.API_CORS_ORIGIN || '*',
      bodyLimit: process.env.API_BODY_LIMIT || '10mb',
      trustProxy: false
    } : undefined
  };

  // Validate configuration
  const { error, value } = configSchema.validate(config, { abortEarly: false });
  if (error) {
    throw new Error(`Invalid analytics configuration: ${error.details.map(d => d.message).join(', ')}`);
  }

  return value;
}