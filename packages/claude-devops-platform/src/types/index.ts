// Re-export types with specific aliases for conflicts
export { 
  KubernetesService,
  DeploymentOptions as K8sDeploymentOptions,
  ServiceOptions,
  PodOptions,
  ConfigMapOptions,
  SecretOptions,
  CanaryOptions,
  BlueGreenOptions
} from '../services/kubernetes';

export * from '../services/docker';

export { 
  GitHubService,
  DeploymentOptions as GitHubDeploymentOptions,
  WorkflowOptions,
  PullRequestOptions,
  IssueOptions,
  WebhookEvent,
  DeploymentStatus,
  CheckRunOptions,
  ReleaseOptions
} from '../services/github';

export { 
  PipelineService,
  PipelineDefinition,
  PipelineExecution,
  PipelineStage,
  StageDefinition,
  StageExecution,
  PipelineStatus,
  NotificationConfig as PipelineNotificationConfig
} from '../services/pipeline';

export {
  DeploymentService,
  NotificationConfig as DeploymentNotificationConfig
} from '../services/deployment';

export * from '../services/monitoring';
export * from '../services/terraform';
export * from '../services/queue';

// Additional common types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: Date;
    requestId: string;
    version: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  permissions: string[];
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: number;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: Date;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    kubernetes?: HealthCheck;
    docker?: HealthCheck;
    github?: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  message?: string;
  lastCheck: Date;
  responseTime?: number;
}

export interface SystemInfo {
  platform: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  memory: {
    total: number;
    free: number;
    used: number;
  };
  cpu: {
    cores: number;
    model: string;
    speed: number;
  };
  uptime: number;
}

export enum Permission {
  // Deployment permissions
  DEPLOYMENT_VIEW = 'deployment:view',
  DEPLOYMENT_CREATE = 'deployment:create',
  DEPLOYMENT_UPDATE = 'deployment:update',
  DEPLOYMENT_DELETE = 'deployment:delete',
  DEPLOYMENT_ROLLBACK = 'deployment:rollback',
  
  // Pipeline permissions
  PIPELINE_VIEW = 'pipeline:view',
  PIPELINE_CREATE = 'pipeline:create',
  PIPELINE_UPDATE = 'pipeline:update',
  PIPELINE_DELETE = 'pipeline:delete',
  PIPELINE_EXECUTE = 'pipeline:execute',
  
  // Kubernetes permissions
  KUBERNETES_VIEW = 'kubernetes:view',
  KUBERNETES_CREATE = 'kubernetes:create',
  KUBERNETES_UPDATE = 'kubernetes:update',
  KUBERNETES_DELETE = 'kubernetes:delete',
  
  // Docker permissions
  DOCKER_BUILD = 'docker:build',
  DOCKER_PUSH = 'docker:push',
  DOCKER_PULL = 'docker:pull',
  DOCKER_SCAN = 'docker:scan',
  
  // Terraform permissions
  TERRAFORM_PLAN = 'terraform:plan',
  TERRAFORM_APPLY = 'terraform:apply',
  TERRAFORM_DESTROY = 'terraform:destroy',
  
  // Monitoring permissions
  MONITORING_VIEW = 'monitoring:view',
  MONITORING_CONFIGURE = 'monitoring:configure',
  
  // Admin permissions
  ADMIN_USERS = 'admin:users',
  ADMIN_SETTINGS = 'admin:settings',
  ADMIN_API_KEYS = 'admin:api_keys',
}

export enum Role {
  VIEWER = 'viewer',
  DEVELOPER = 'developer',
  OPERATOR = 'operator',
  ADMIN = 'admin',
}

// Define base permissions first
const viewerPermissions = [
  Permission.DEPLOYMENT_VIEW,
  Permission.PIPELINE_VIEW,
  Permission.KUBERNETES_VIEW,
  Permission.MONITORING_VIEW,
];

const developerPermissions = [
  ...viewerPermissions,
  Permission.DEPLOYMENT_CREATE,
  Permission.PIPELINE_CREATE,
  Permission.PIPELINE_EXECUTE,
  Permission.DOCKER_BUILD,
  Permission.DOCKER_PULL,
  Permission.TERRAFORM_PLAN,
];

const operatorPermissions = [
  ...developerPermissions,
  Permission.DEPLOYMENT_UPDATE,
  Permission.DEPLOYMENT_ROLLBACK,
  Permission.PIPELINE_UPDATE,
  Permission.KUBERNETES_CREATE,
  Permission.KUBERNETES_UPDATE,
  Permission.DOCKER_PUSH,
  Permission.DOCKER_SCAN,
  Permission.TERRAFORM_APPLY,
  Permission.MONITORING_CONFIGURE,
];

export const RolePermissions: Record<Role, Permission[]> = {
  [Role.VIEWER]: viewerPermissions,
  [Role.DEVELOPER]: developerPermissions,
  [Role.OPERATOR]: operatorPermissions,
  [Role.ADMIN]: Object.values(Permission),
};