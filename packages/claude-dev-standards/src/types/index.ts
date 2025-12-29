/**
 * Type definitions for claude-dev-standards
 */

export interface StandardsConfig {
  standards: string;
  noMocks: boolean;
  productionReady: boolean;
  security?: SecurityConfig;
  database?: DatabaseConfig;
  monitoring?: MonitoringConfig;
  cicd?: CICDConfig;
}

export interface SecurityConfig {
  rbac: boolean;
  jwt: boolean;
  helmet: boolean;
  cors: boolean;
  rateLimit: boolean;
  inputValidation: boolean;
  auditLogging: boolean;
}

export interface DatabaseConfig {
  postgresql: boolean;
  redis: boolean;
  migrations: boolean;
  pooling: boolean;
  ssl: boolean;
}

export interface MonitoringConfig {
  logging: boolean;
  metrics: boolean;
  healthChecks: boolean;
  alerting: boolean;
  tracing: boolean;
}

export interface CICDConfig {
  githubActions: boolean;
  qualityGates: boolean;
  securityScanning: boolean;
  dependencyUpdates: boolean;
  deploymentPipelines: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SecurityScanResult {
  issues: SecurityIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  message: string;
  file?: string;
  line?: number;
}

export interface ComplianceResult {
  compliant: boolean;
  violations: ComplianceViolation[];
}

export interface ComplianceViolation {
  rule: string;
  message: string;
  severity: string;
  file?: string;
}

export interface ProjectInfo {
  type: string;
  framework?: string;
  version?: string;
  dependencies?: Record<string, string>;
}

export interface TemplateConfig {
  name: string;
  description: string;
  files: string[];
  dependencies?: Record<string, string>;
}

export interface PipelineConfig {
  name: string;
  triggers: string[];
  jobs: PipelineJob[];
}

export interface PipelineJob {
  name: string;
  steps: string[];
  runsOn?: string;
  needs?: string[];
}

export interface RBACConfig {
  roles: RBACRole[];
  defaultRole?: string;
}

export interface RBACRole {
  name: string;
  permissions: string[];
  inherits?: string[];
}