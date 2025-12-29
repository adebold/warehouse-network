/**
 * Configuration management for Claude Agent Tracker
 */

import { existsSync } from 'fs';
import { join } from 'path';

import dotenv from 'dotenv';

// Load environment variables
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolSize: number;
  connectionTimeout: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  ttl: number;
}

export interface MonitoringConfig {
  openTelemetry: {
    enabled: boolean;
    serviceName: string;
    endpoint: string;
    headers?: Record<string, string>;
  };
  prometheus: {
    enabled: boolean;
    port: number;
    path: string;
  };
  logging: {
    level: string;
    format: string;
    directory: string;
    maxFiles: number;
    maxSize: string;
  };
}

export interface SecurityConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
    algorithm: string;
  };
  bcrypt: {
    rounds: number;
  };
  rateLimit: {
    windowMs: number;
    max: number;
    skipSuccessfulRequests: boolean;
  };
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
}

export interface AgentConfig {
  maxAgents: number;
  defaultTimeout: number;
  healthCheckInterval: number;
  cleanupInterval: number;
  maxRetries: number;
  spawnTimeout: number;
}

export interface GitConfig {
  enabled: boolean;
  autoCommit: boolean;
  branch: string;
  remote: string;
  author: {
    name: string;
    email: string;
  };
  commitMessage: string;
}

export interface Config {
  env: string;
  port: number;
  host: string;
  database: DatabaseConfig;
  redis: RedisConfig;
  monitoring: MonitoringConfig;
  security: SecurityConfig;
  agents: AgentConfig;
  git: GitConfig;
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'claude_agent_tracker',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '20', 10),
    connectionTimeout: parseInt(process.env.DB_TIMEOUT || '30000', 10)
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'cat:',
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10)
  },
  
  monitoring: {
    openTelemetry: {
      enabled: process.env.OTEL_ENABLED === 'true',
      serviceName: process.env.OTEL_SERVICE_NAME || 'claude-agent-tracker',
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS 
        ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) 
        : undefined
    },
    prometheus: {
      enabled: process.env.PROM_ENABLED !== 'false',
      port: parseInt(process.env.PROM_PORT || '9090', 10),
      path: process.env.PROM_PATH || '/metrics'
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
      directory: process.env.LOG_DIR || './logs',
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '7', 10),
      maxSize: process.env.LOG_MAX_SIZE || '10m'
    }
  },
  
  security: {
    jwt: {
      secret: process.env.JWT_SECRET || 'change-me-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      algorithm: process.env.JWT_ALGORITHM || 'HS256'
    },
    bcrypt: {
      rounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10)
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true'
    },
    cors: {
      origin: process.env.CORS_ORIGIN 
        ? process.env.CORS_ORIGIN.split(',') 
        : ['http://localhost:3000'],
      credentials: process.env.CORS_CREDENTIALS !== 'false'
    }
  },
  
  agents: {
    maxAgents: parseInt(process.env.MAX_AGENTS || '10', 10),
    defaultTimeout: parseInt(process.env.AGENT_TIMEOUT || '300000', 10),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '60000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    spawnTimeout: parseInt(process.env.SPAWN_TIMEOUT || '10000', 10)
  },
  
  git: {
    enabled: process.env.GIT_ENABLED !== 'false',
    autoCommit: process.env.GIT_AUTO_COMMIT === 'true',
    branch: process.env.GIT_BRANCH || 'main',
    remote: process.env.GIT_REMOTE || 'origin',
    author: {
      name: process.env.GIT_AUTHOR_NAME || 'Claude Agent Tracker',
      email: process.env.GIT_AUTHOR_EMAIL || 'agent-tracker@claude.ai'
    },
    commitMessage: process.env.GIT_COMMIT_MESSAGE || 'Auto-commit by Claude Agent Tracker'
  }
};

// Validate required configuration
export function validateConfig(): void {
  if (config.env === 'production') {
    if (config.security.jwt.secret === 'change-me-in-production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    
    if (!config.database.password) {
      throw new Error('DB_PASSWORD must be set in production');
    }
  }
}

export default config;