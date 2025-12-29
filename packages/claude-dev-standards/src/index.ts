/**
 * @warehouse-network/claude-dev-standards
 * Enterprise development standards enforcement platform
 * 
 * Automated security validation, RBAC implementation, 
 * production-grade CI/CD pipelines, and compliance monitoring.
 */

// Core Standards Engine
export { StandardsEngine } from './core/standards-engine';
export { ValidationEngine } from './core/validation-engine';
export { SecurityScanner } from './core/security-scanner';
export { ComplianceChecker } from './core/compliance-checker';
export { QualityEnforcement } from './core/enforcement';

// Validators
export { MockValidator } from './validators/mocks';
export { AuthValidator } from './validators/auth';
export { DatabaseValidator } from './validators/database';
export { SecurityValidator } from './validators/security';
export { TestingValidator } from './validators/testing';
export { LoggingValidator } from './validators/logging';

// Security & Authentication
export { RBACManager } from './security/rbac-manager';
export { AuthMiddleware } from './security/auth-middleware';
export { SecurityHeaders } from './security/headers';
export { InputValidator } from './security/input-validator';

// CI/CD & DevOps
export { PipelineGenerator } from './cicd/pipeline-generator';
export { GitHooksManager } from './cicd/git-hooks';
export { QualityGates } from './cicd/quality-gates';

// Template Management
export { TemplateManager } from './templates/template-manager';
export { ConfigGenerator } from './templates/config-generator';

// Project Detection & Setup
export { ProjectDetector } from './utils/project-detector';
export { Reporter } from './utils/reporter';
export { Logger } from './utils/logger';

// CLI Commands
export { InitCommand } from './commands/init';
export { CheckCommand } from './commands/check';
export { FixCommand } from './commands/fix';
export { SecurityCommand } from './commands/security';
export { SetupCommand } from './commands/setup';
export { ValidateCommand } from './commands/validate';

// Types
export type {
  StandardsConfig,
  ValidationResult,
  SecurityScanResult,
  ComplianceResult,
  ProjectInfo,
  TemplateConfig,
  PipelineConfig,
  RBACConfig,
  QualityGateConfig,
  QualityGateResult,
  MockValidationResult,
  AuthValidationResult,
  DatabaseValidationResult,
  SecurityValidationResult,
  TestingValidationResult,
  LoggingValidationResult
} from './types/index';

// Configuration
export { 
  getConfig, 
  mergeConfig,
  STRICT_CONFIG, 
  RECOMMENDED_CONFIG, 
  MINIMAL_CONFIG,
  type QualityConfig 
} from './config/quality-config';

// Configuration Standards
export const STANDARDS = {
  MINIMAL: 'minimal',
  RECOMMENDED: 'recommended', 
  STRICT: 'strict',
  ENTERPRISE: 'enterprise'
} as const;

// Default Enterprise Configuration (maps to STRICT_CONFIG)
export const defaultEnterpriseConfig = {
  standards: STANDARDS.ENTERPRISE,
  noMocks: true,
  productionReady: true,
  security: {
    rbac: true,
    jwt: true,
    helmet: true,
    cors: true,
    rateLimit: true,
    inputValidation: true,
    auditLogging: true
  },
  database: {
    postgresql: true,
    redis: true,
    migrations: true,
    pooling: true,
    ssl: true
  },
  monitoring: {
    logging: true,
    metrics: true,
    healthChecks: true,
    alerting: true,
    tracing: true
  },
  cicd: {
    githubActions: true,
    qualityGates: true,
    securityScanning: true,
    dependencyUpdates: true,
    deploymentPipelines: true
  }
};

// Factory Functions
import { QualityGates as QualityGatesClass } from './cicd/quality-gates';
import { getConfig } from './config/quality-config';
import { QualityEnforcement } from './core/enforcement';
import { ValidationEngine as ValidationEngineClass } from './core/validation-engine';

export function createEnforcement(configName: 'strict' | 'recommended' | 'minimal' = 'recommended') {
  return new QualityEnforcement({ configName });
}

export function createValidationEngine(configName: 'strict' | 'recommended' | 'minimal' = 'recommended') {
  const config = getConfig(configName);
  return new ValidationEngineClass(config.engine);
}

export function createQualityGates(configName: 'strict' | 'recommended' | 'minimal' = 'recommended') {
  const config = getConfig(configName);
  return new QualityGatesClass(config.qualityGates);
}

// Version
export const version = '1.0.0';