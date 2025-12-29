import dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

export interface Config {
  // Application
  nodeEnv: string;
  port: number;
  apiVersion: string;
  
  // Database
  database: {
    url: string;
    poolSize: number;
    ssl?: boolean;
  };
  
  // Redis
  redis: {
    url: string;
    password?: string;
  };
  
  // Kubernetes
  kubernetes: {
    configPath?: string;
    inCluster: boolean;
    namespace: string;
  };
  
  // Docker
  docker: {
    socketPath: string;
    registryUrl?: string;
    registryUsername?: string;
    registryPassword?: string;
  };
  
  // GitHub
  github: {
    token?: string;
    webhookSecret?: string;
    appId?: string;
    privateKeyPath?: string;
  };
  
  // AWS
  aws: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    ecrRegistryUrl?: string;
  };
  
  // GCP
  gcp: {
    projectId?: string;
    serviceAccountPath?: string;
    region: string;
  };
  
  // Azure
  azure: {
    subscriptionId?: string;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    resourceGroup?: string;
  };
  
  // Monitoring
  monitoring: {
    prometheusUrl: string;
    grafanaUrl: string;
    grafanaApiKey?: string;
    alertmanagerUrl: string;
  };
  
  // Security
  security: {
    jwtSecret: string;
    jwtExpiry: string;
    refreshTokenExpiry: string;
    sessionSecret: string;
    trivyServerUrl?: string;
    sonarqubeUrl?: string;
    sonarqubeToken?: string;
  };
  
  // Terraform
  terraform: {
    backendBucket?: string;
    stateKey?: string;
    workspace: string;
  };
  
  // Deployment
  deployment: {
    timeout: number;
    rollbackOnFailure: boolean;
    healthCheckInterval: number;
    healthCheckTimeout: number;
    maxHistory: number;
  };
  
  // Features
  features: {
    canaryDeployments: boolean;
    blueGreenDeployments: boolean;
    autoScaling: boolean;
    securityScanning: boolean;
    costOptimization: boolean;
  };
  
  // Notifications
  notifications: {
    slackWebhookUrl?: string;
    pagerdutyApiKey?: string;
    email: {
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPass?: string;
      fromAddress?: string;
    };
  };
  
  // Rate limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  
  // CORS
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  
  // Logging
  logging: {
    level: string;
    format: string;
  };
}

export const config: Config = {
  // Application
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiVersion: process.env.API_VERSION || 'v1',
  
  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://devops:devops123@localhost:5432/devops_platform',
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '20', 10),
    ssl: process.env.NODE_ENV === 'production',
  },
  
  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  },
  
  // Kubernetes
  kubernetes: {
    ...(process.env.KUBE_CONFIG_PATH && { configPath: process.env.KUBE_CONFIG_PATH }),
    inCluster: process.env.KUBERNETES_SERVICE_HOST !== undefined,
    namespace: process.env.KUBE_NAMESPACE || 'default',
  },
  
  // Docker
  docker: {
    socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    ...(process.env.DOCKER_REGISTRY_URL && { registryUrl: process.env.DOCKER_REGISTRY_URL }),
    ...(process.env.DOCKER_REGISTRY_USERNAME && { registryUsername: process.env.DOCKER_REGISTRY_USERNAME }),
    ...(process.env.DOCKER_REGISTRY_PASSWORD && { registryPassword: process.env.DOCKER_REGISTRY_PASSWORD }),
  },
  
  // GitHub
  github: {
    ...(process.env.GITHUB_TOKEN && { token: process.env.GITHUB_TOKEN }),
    ...(process.env.GITHUB_WEBHOOK_SECRET && { webhookSecret: process.env.GITHUB_WEBHOOK_SECRET }),
    ...(process.env.GITHUB_APP_ID && { appId: process.env.GITHUB_APP_ID }),
    ...(process.env.GITHUB_PRIVATE_KEY_PATH && { privateKeyPath: process.env.GITHUB_PRIVATE_KEY_PATH }),
  },
  
  // AWS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    ...(process.env.AWS_ACCESS_KEY_ID && { accessKeyId: process.env.AWS_ACCESS_KEY_ID }),
    ...(process.env.AWS_SECRET_ACCESS_KEY && { secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }),
    ...(process.env.AWS_ECR_REGISTRY_URL && { ecrRegistryUrl: process.env.AWS_ECR_REGISTRY_URL }),
  },
  
  // GCP
  gcp: {
    ...(process.env.GCP_PROJECT_ID && { projectId: process.env.GCP_PROJECT_ID }),
    ...(process.env.GCP_SERVICE_ACCOUNT_PATH && { serviceAccountPath: process.env.GCP_SERVICE_ACCOUNT_PATH }),
    region: process.env.GCP_REGION || 'us-central1',
  },
  
  // Azure
  azure: {
    ...(process.env.AZURE_SUBSCRIPTION_ID && { subscriptionId: process.env.AZURE_SUBSCRIPTION_ID }),
    ...(process.env.AZURE_TENANT_ID && { tenantId: process.env.AZURE_TENANT_ID }),
    ...(process.env.AZURE_CLIENT_ID && { clientId: process.env.AZURE_CLIENT_ID }),
    ...(process.env.AZURE_CLIENT_SECRET && { clientSecret: process.env.AZURE_CLIENT_SECRET }),
    ...(process.env.AZURE_RESOURCE_GROUP && { resourceGroup: process.env.AZURE_RESOURCE_GROUP }),
  },
  
  // Monitoring
  monitoring: {
    prometheusUrl: process.env.PROMETHEUS_URL || 'http://localhost:9090',
    grafanaUrl: process.env.GRAFANA_URL || 'http://localhost:3000',
    ...(process.env.GRAFANA_API_KEY && { grafanaApiKey: process.env.GRAFANA_API_KEY }),
    alertmanagerUrl: process.env.ALERTMANAGER_URL || 'http://localhost:9093',
  },
  
  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
    sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-change-this',
    ...(process.env.TRIVY_SERVER_URL && { trivyServerUrl: process.env.TRIVY_SERVER_URL }),
    ...(process.env.SONARQUBE_URL && { sonarqubeUrl: process.env.SONARQUBE_URL }),
    ...(process.env.SONARQUBE_TOKEN && { sonarqubeToken: process.env.SONARQUBE_TOKEN }),
  },
  
  // Terraform
  terraform: {
    ...(process.env.TERRAFORM_BACKEND_BUCKET && { backendBucket: process.env.TERRAFORM_BACKEND_BUCKET }),
    ...(process.env.TERRAFORM_STATE_KEY && { stateKey: process.env.TERRAFORM_STATE_KEY }),
    workspace: process.env.TERRAFORM_WORKSPACE || 'default',
  },
  
  // Deployment
  deployment: {
    timeout: parseInt(process.env.DEPLOYMENT_TIMEOUT_SECONDS || '600', 10),
    rollbackOnFailure: process.env.ROLLBACK_ON_FAILURE === 'true',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30', 10),
    healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '10', 10),
    maxHistory: parseInt(process.env.MAX_DEPLOYMENT_HISTORY || '10', 10),
  },
  
  // Features
  features: {
    canaryDeployments: process.env.ENABLE_CANARY_DEPLOYMENTS === 'true',
    blueGreenDeployments: process.env.ENABLE_BLUE_GREEN_DEPLOYMENTS === 'true',
    autoScaling: process.env.ENABLE_AUTO_SCALING === 'true',
    securityScanning: process.env.ENABLE_SECURITY_SCANNING === 'true',
    costOptimization: process.env.ENABLE_COST_OPTIMIZATION === 'true',
  },
  
  // Notifications
  notifications: {
    ...(process.env.SLACK_WEBHOOK_URL && { slackWebhookUrl: process.env.SLACK_WEBHOOK_URL }),
    ...(process.env.PAGERDUTY_API_KEY && { pagerdutyApiKey: process.env.PAGERDUTY_API_KEY }),
    email: {
      ...(process.env.EMAIL_SMTP_HOST && { smtpHost: process.env.EMAIL_SMTP_HOST }),
      smtpPort: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
      ...(process.env.EMAIL_SMTP_USER && { smtpUser: process.env.EMAIL_SMTP_USER }),
      ...(process.env.EMAIL_SMTP_PASS && { smtpPass: process.env.EMAIL_SMTP_PASS }),
      ...(process.env.EMAIL_FROM_ADDRESS && { fromAddress: process.env.EMAIL_FROM_ADDRESS }),
    },
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
};

// Validate required configuration
export function validateConfig(): void {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
  ];
  
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate JWT secret strength in production
  if (config.nodeEnv === 'production') {
    if (config.security.jwtSecret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters in production');
    }
    
    if (config.security.jwtSecret.includes('change-this')) {
      throw new Error('Default JWT secret detected. Please change it in production');
    }
  }
}

// Export validated config
validateConfig();