// Deployment Manager - Comprehensive deployment management with zero-downtime strategies
import { logger, LogContext } from '../utils/logger.js';
import { ComponentHealth } from './devops-engine.js';
import fs from 'fs-extra';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { v4 as uuid } from 'uuid';

export interface DeploymentConfig {
  strategy: 'rolling' | 'blue-green' | 'canary' | 'recreate';
  environment: string;
  version: string;
  replicas: number;
  healthCheckUrl?: string;
  healthCheckTimeout?: number;
  maxSurge?: string;
  maxUnavailable?: string;
  canarySteps?: CanaryStep[];
  rollbackOnFailure?: boolean;
  preDeployHooks?: Hook[];
  postDeployHooks?: Hook[];
  migrationScripts?: string[];
  secretsManagement?: SecretsConfig;
}

export interface CanaryStep {
  weight: number;
  duration: string;
  successCriteria: SuccessCriteria;
}

export interface SuccessCriteria {
  errorRate?: number;
  responseTime?: number;
  successRate?: number;
}

export interface Hook {
  name: string;
  command: string;
  args?: string[];
  environment?: Record<string, string>;
  timeout?: number;
  continueOnFailure?: boolean;
}

export interface SecretsConfig {
  provider: 'kubernetes' | 'vault' | 'aws-secrets' | 'azure-keyvault';
  vault?: {
    address: string;
    token: string;
    mountPath: string;
  };
  kubernetes?: {
    namespace: string;
    secretName: string;
  };
}

export interface DeploymentResult {
  deploymentId: string;
  status: 'success' | 'failed' | 'partial' | 'in-progress' | 'rolling-back';
  environment: string;
  version: string;
  services: DeploymentService[];
  rollbackId?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  strategy: string;
  logs: string[];
}

export interface DeploymentService {
  name: string;
  status: 'deployed' | 'failed' | 'pending' | 'rolling-back' | 'healthy';
  version: string;
  replicas: number;
  endpoints: string[];
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
  metrics?: ServiceMetrics;
}

export interface ServiceMetrics {
  cpu: number;
  memory: number;
  requests: number;
  errors: number;
  responseTime: number;
}

export interface RollbackOptions {
  targetVersion?: string;
  targetDeploymentId?: string;
  services?: string[];
  skipHealthCheck?: boolean;
  timeout?: number;
}

export interface RollbackResult {
  rollbackId: string;
  targetVersion: string;
  status: 'success' | 'failed' | 'partial';
  affectedServices: string[];
  duration: number;
  logs: string[];
}

export interface MigrationResult {
  migrationId: string;
  status: 'success' | 'failed' | 'in-progress';
  executedScripts: string[];
  failedScripts: string[];
  duration: number;
  logs: string[];
}

export class DeploymentManager {
  private deployments: Map<string, DeploymentResult> = new Map();
  private activeDeployments: Set<string> = new Set();

  constructor() {
    logger.info('DeploymentManager initialized');
  }

  /**
   * Deploy to environment with specified strategy
   */
  async deployToEnvironment(
    environment: string, 
    deploymentId: string, 
    config: DeploymentConfig
  ): Promise<DeploymentResult> {
    const logContext: LogContext = {
      deploymentId,
      environment,
      component: 'deployment-manager'
    };

    logger.deployment('starting', deploymentId, logContext);

    try {
      this.activeDeployments.add(deploymentId);

      const deploymentResult: DeploymentResult = {
        deploymentId,
        status: 'in-progress',
        environment,
        version: config.version,
        services: [],
        startTime: new Date().toISOString(),
        strategy: config.strategy,
        logs: []
      };

      this.deployments.set(deploymentId, deploymentResult);

      // Run pre-deployment hooks
      if (config.preDeployHooks) {
        await this.runHooks(config.preDeployHooks, 'pre-deploy', logContext);
      }

      // Run database migrations if specified
      if (config.migrationScripts && config.migrationScripts.length > 0) {
        const migrationResult = await this.runMigrations(config.migrationScripts, logContext);
        if (migrationResult.status === 'failed') {
          throw new Error(`Database migration failed: ${migrationResult.failedScripts.join(', ')}`);
        }
      }

      // Execute deployment strategy
      switch (config.strategy) {
        case 'rolling':
          await this.rollingDeployment(deploymentResult, config, logContext);
          break;
        case 'blue-green':
          await this.blueGreenDeployment(deploymentResult, config, logContext);
          break;
        case 'canary':
          await this.canaryDeployment(deploymentResult, config, logContext);
          break;
        case 'recreate':
          await this.recreateDeployment(deploymentResult, config, logContext);
          break;
        default:
          throw new Error(`Unsupported deployment strategy: ${config.strategy}`);
      }

      // Run post-deployment hooks
      if (config.postDeployHooks) {
        await this.runHooks(config.postDeployHooks, 'post-deploy', logContext);
      }

      // Final health check
      await this.performHealthChecks(deploymentResult, config, logContext);

      deploymentResult.status = 'success';
      deploymentResult.endTime = new Date().toISOString();
      deploymentResult.duration = new Date(deploymentResult.endTime).getTime() - 
                                  new Date(deploymentResult.startTime).getTime();

      this.deployments.set(deploymentId, deploymentResult);
      this.activeDeployments.delete(deploymentId);

      logger.deployment('completed', deploymentId, {
        ...logContext,
        duration: deploymentResult.duration,
        status: deploymentResult.status
      });

      return deploymentResult;

    } catch (error) {
      const deploymentResult = this.deployments.get(deploymentId);
      if (deploymentResult) {
        deploymentResult.status = 'failed';
        deploymentResult.endTime = new Date().toISOString();
        deploymentResult.duration = new Date(deploymentResult.endTime).getTime() - 
                                    new Date(deploymentResult.startTime).getTime();

        // Auto-rollback if enabled
        if (config.rollbackOnFailure) {
          logger.warn('Auto-rollback triggered due to deployment failure', logContext);
          try {
            await this.rollbackDeployment(deploymentId, {});
          } catch (rollbackError) {
            logger.error('Auto-rollback failed', rollbackError, logContext);
          }
        }

        this.deployments.set(deploymentId, deploymentResult);
      }

      this.activeDeployments.delete(deploymentId);
      logger.error('Deployment failed', error instanceof Error ? error : new Error(String(error)), logContext);
      throw error;
    }
  }

  /**
   * Rolling deployment strategy
   */
  private async rollingDeployment(
    deployment: DeploymentResult,
    config: DeploymentConfig,
    logContext: LogContext
  ): Promise<void> {
    logger.info('Executing rolling deployment', logContext);

    const maxSurge = this.parsePercentage(config.maxSurge || '25%', config.replicas);
    const maxUnavailable = this.parsePercentage(config.maxUnavailable || '25%', config.replicas);

    // Update deployment manifest
    await this.updateKubernetesManifest(config, logContext);

    // Apply rolling update
    const updateCommand = `kubectl set image deployment/${config.environment}-app app=${config.environment}-app:${config.version} --namespace=${config.environment}`;
    
    try {
      await this.executeCommand(updateCommand, logContext);
      
      // Wait for rollout to complete
      const rolloutCommand = `kubectl rollout status deployment/${config.environment}-app --namespace=${config.environment} --timeout=600s`;
      await this.executeCommand(rolloutCommand, logContext);

      // Get deployment status
      const services = await this.getServiceStatus(config.environment, logContext);
      deployment.services = services;
      
    } catch (error) {
      throw new Error(`Rolling deployment failed: ${error}`);
    }
  }

  /**
   * Blue-green deployment strategy
   */
  private async blueGreenDeployment(
    deployment: DeploymentResult,
    config: DeploymentConfig,
    logContext: LogContext
  ): Promise<void> {
    logger.info('Executing blue-green deployment', logContext);

    const greenEnvironment = `${config.environment}-green`;
    
    try {
      // Deploy to green environment
      await this.deployToGreenEnvironment(greenEnvironment, config, logContext);
      
      // Perform health checks on green environment
      const healthCheck = await this.performGreenHealthCheck(greenEnvironment, config, logContext);
      if (!healthCheck) {
        throw new Error('Green environment health check failed');
      }

      // Switch traffic from blue to green
      await this.switchTraffic(config.environment, greenEnvironment, logContext);
      
      // Update deployment services
      const services = await this.getServiceStatus(config.environment, logContext);
      deployment.services = services;

      // Clean up old blue environment after successful switch
      setTimeout(() => {
        this.cleanupBlueEnvironment(config.environment, logContext).catch(error => {
          logger.warn('Failed to cleanup blue environment', { ...logContext, error });
        });
      }, 300000); // Wait 5 minutes before cleanup

    } catch (error) {
      // Rollback to blue if green deployment fails
      await this.rollbackToBlue(config.environment, logContext);
      throw error;
    }
  }

  /**
   * Canary deployment strategy
   */
  private async canaryDeployment(
    deployment: DeploymentResult,
    config: DeploymentConfig,
    logContext: LogContext
  ): Promise<void> {
    logger.info('Executing canary deployment', logContext);

    if (!config.canarySteps || config.canarySteps.length === 0) {
      throw new Error('Canary steps not configured');
    }

    try {
      // Deploy canary version
      await this.deployCanaryVersion(config, logContext);
      
      // Execute canary steps
      for (const step of config.canarySteps) {
        logger.info(`Executing canary step: ${step.weight}% traffic`, logContext);
        
        // Update traffic routing
        await this.updateTrafficRouting(step.weight, config, logContext);
        
        // Wait for step duration
        await this.sleep(this.parseDuration(step.duration));
        
        // Evaluate success criteria
        const success = await this.evaluateSuccessCriteria(step.successCriteria, config, logContext);
        if (!success) {
          throw new Error(`Canary step failed success criteria at ${step.weight}% traffic`);
        }
      }

      // Promote canary to full traffic
      await this.promoteCanaryToProduction(config, logContext);
      
      // Update deployment services
      const services = await this.getServiceStatus(config.environment, logContext);
      deployment.services = services;

    } catch (error) {
      // Rollback canary
      await this.rollbackCanary(config, logContext);
      throw error;
    }
  }

  /**
   * Recreate deployment strategy
   */
  private async recreateDeployment(
    deployment: DeploymentResult,
    config: DeploymentConfig,
    logContext: LogContext
  ): Promise<void> {
    logger.info('Executing recreate deployment', logContext);

    try {
      // Delete existing deployment
      const deleteCommand = `kubectl delete deployment ${config.environment}-app --namespace=${config.environment}`;
      await this.executeCommand(deleteCommand, logContext);
      
      // Wait for pods to terminate
      await this.sleep(30000);
      
      // Create new deployment
      await this.createNewDeployment(config, logContext);
      
      // Wait for deployment to be ready
      const rolloutCommand = `kubectl rollout status deployment/${config.environment}-app --namespace=${config.environment} --timeout=600s`;
      await this.executeCommand(rolloutCommand, logContext);

      // Update deployment services
      const services = await this.getServiceStatus(config.environment, logContext);
      deployment.services = services;

    } catch (error) {
      throw new Error(`Recreate deployment failed: ${error}`);
    }
  }

  /**
   * Rollback deployment to previous version
   */
  async rollbackDeployment(deploymentId: string, options: RollbackOptions): Promise<RollbackResult> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const rollbackId = uuid();
    const logContext: LogContext = {
      deploymentId,
      rollbackId,
      component: 'deployment-manager'
    };

    logger.info('Starting rollback', logContext);

    const startTime = Date.now();
    const rollbackResult: RollbackResult = {
      rollbackId,
      targetVersion: options.targetVersion || 'previous',
      status: 'success',
      affectedServices: [],
      duration: 0,
      logs: []
    };

    try {
      // Determine target version
      const targetVersion = options.targetVersion || await this.getPreviousVersion(deployment.environment);
      
      // Execute rollback based on original deployment strategy
      switch (deployment.strategy) {
        case 'rolling':
          await this.rollbackRollingDeployment(deployment.environment, targetVersion, logContext);
          break;
        case 'blue-green':
          await this.rollbackBlueGreenDeployment(deployment.environment, logContext);
          break;
        case 'canary':
          await this.rollbackCanary({ environment: deployment.environment } as DeploymentConfig, logContext);
          break;
        case 'recreate':
          await this.rollbackRecreateDeployment(deployment.environment, targetVersion, logContext);
          break;
      }

      // Perform health checks unless skipped
      if (!options.skipHealthCheck) {
        const healthCheck = await this.performRollbackHealthCheck(deployment.environment, logContext);
        if (!healthCheck) {
          throw new Error('Rollback health check failed');
        }
      }

      rollbackResult.duration = Date.now() - startTime;
      rollbackResult.affectedServices = deployment.services.map(s => s.name);

      logger.info('Rollback completed successfully', {
        ...logContext,
        duration: rollbackResult.duration
      });

      return rollbackResult;

    } catch (error) {
      rollbackResult.status = 'failed';
      rollbackResult.duration = Date.now() - startTime;
      
      logger.error('Rollback failed', error instanceof Error ? error : new Error(String(error)), logContext);
      throw error;
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(scripts: string[], logContext: LogContext): Promise<MigrationResult> {
    const migrationId = uuid();
    logger.info(`Running ${scripts.length} database migrations`, { ...logContext, migrationId });

    const migrationResult: MigrationResult = {
      migrationId,
      status: 'in-progress',
      executedScripts: [],
      failedScripts: [],
      duration: 0,
      logs: []
    };

    const startTime = Date.now();

    try {
      for (const script of scripts) {
        logger.info(`Executing migration script: ${script}`, logContext);
        
        try {
          await this.executeMigrationScript(script, logContext);
          migrationResult.executedScripts.push(script);
          logger.info(`Migration script completed: ${script}`, logContext);
        } catch (error) {
          migrationResult.failedScripts.push(script);
          logger.error(`Migration script failed: ${script}`, error instanceof Error ? error : new Error(String(error)), logContext);
          throw error;
        }
      }

      migrationResult.status = 'success';
      migrationResult.duration = Date.now() - startTime;

      logger.info('All migration scripts completed successfully', {
        ...logContext,
        migrationId,
        duration: migrationResult.duration
      });

      return migrationResult;

    } catch (error) {
      migrationResult.status = 'failed';
      migrationResult.duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Check health of deployed services
   */
  async checkHealth(): Promise<ComponentHealth[]> {
    logger.info('Checking deployment health');

    const healthChecks: ComponentHealth[] = [];

    try {
      // Get all deployments
      const deploymentsOutput = await this.executeCommand('kubectl get deployments --all-namespaces -o json');
      const deployments = JSON.parse(deploymentsOutput);

      for (const deployment of deployments.items || []) {
        const name = deployment.metadata.name;
        const namespace = deployment.metadata.namespace;
        
        const readyReplicas = deployment.status.readyReplicas || 0;
        const replicas = deployment.spec.replicas || 1;
        const isHealthy = readyReplicas === replicas;

        healthChecks.push({
          name: `${namespace}/${name}`,
          status: isHealthy ? 'healthy' : 'unhealthy',
          last_check: new Date().toISOString(),
          uptime: this.calculateDeploymentUptime(deployment),
          error_rate: isHealthy ? 0 : ((replicas - readyReplicas) / replicas) * 100
        });
      }

      return healthChecks;

    } catch (error) {
      logger.error('Failed to check deployment health', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  // Private helper methods

  private parsePercentage(value: string, total: number): number {
    if (value.endsWith('%')) {
      const percentage = parseInt(value.slice(0, -1));
      return Math.ceil((percentage / 100) * total);
    }
    return parseInt(value);
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) throw new Error(`Invalid duration format: ${duration}`);
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: throw new Error(`Unknown duration unit: ${unit}`);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async executeCommand(command: string, logContext: LogContext): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.debug(`Executing command: ${command}`, logContext);
      
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'] });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          logger.debug(`Command completed successfully: ${command}`, logContext);
          resolve(stdout);
        } else {
          logger.error(`Command failed: ${command}`, new Error(stderr), logContext);
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private async runHooks(hooks: Hook[], stage: string, logContext: LogContext): Promise<void> {
    logger.info(`Running ${stage} hooks`, logContext);

    for (const hook of hooks) {
      logger.info(`Executing hook: ${hook.name}`, logContext);
      
      try {
        const command = `${hook.command} ${hook.args?.join(' ') || ''}`;
        await this.executeCommand(command, logContext);
        logger.info(`Hook completed: ${hook.name}`, logContext);
      } catch (error) {
        if (!hook.continueOnFailure) {
          throw error;
        }
        logger.warn(`Hook failed but continuing: ${hook.name}`, { ...logContext, error });
      }
    }
  }

  private async updateKubernetesManifest(config: DeploymentConfig, logContext: LogContext): Promise<void> {
    // Implementation would update Kubernetes deployment manifests
    logger.debug('Updating Kubernetes manifests', logContext);
  }

  private async getServiceStatus(environment: string, logContext: LogContext): Promise<DeploymentService[]> {
    // Implementation would get actual service status from Kubernetes
    return [
      {
        name: `${environment}-app`,
        status: 'deployed',
        version: '1.0.0',
        replicas: 3,
        endpoints: [`http://${environment}-app.${environment}.svc.cluster.local`],
        healthStatus: 'healthy'
      }
    ];
  }

  private async performHealthChecks(deployment: DeploymentResult, config: DeploymentConfig, logContext: LogContext): Promise<void> {
    if (!config.healthCheckUrl) return;

    logger.info('Performing health checks', logContext);
    
    // Implementation would perform actual health checks
    // This is a simplified version
    const timeout = config.healthCheckTimeout || 30000;
    await this.sleep(5000); // Simulate health check
  }

  private calculateDeploymentUptime(deployment: any): string {
    const creationTime = new Date(deployment.metadata.creationTimestamp);
    const now = new Date();
    const uptimeMs = now.getTime() - creationTime.getTime();
    
    const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${days}d ${hours}h ${minutes}m`;
  }

  // Blue-Green deployment helpers
  private async deployToGreenEnvironment(greenEnv: string, config: DeploymentConfig, logContext: LogContext): Promise<void> {
    logger.debug('Deploying to green environment', { ...logContext, greenEnvironment: greenEnv });
    // Implementation would deploy to green environment
  }

  private async performGreenHealthCheck(greenEnv: string, config: DeploymentConfig, logContext: LogContext): Promise<boolean> {
    logger.debug('Performing green environment health check', { ...logContext, greenEnvironment: greenEnv });
    // Implementation would perform health checks on green environment
    return true;
  }

  private async switchTraffic(blueEnv: string, greenEnv: string, logContext: LogContext): Promise<void> {
    logger.info('Switching traffic from blue to green', { ...logContext, blueEnvironment: blueEnv, greenEnvironment: greenEnv });
    // Implementation would switch traffic routing
  }

  private async cleanupBlueEnvironment(environment: string, logContext: LogContext): Promise<void> {
    logger.info('Cleaning up blue environment', logContext);
    // Implementation would cleanup old blue environment
  }

  private async rollbackToBlue(environment: string, logContext: LogContext): Promise<void> {
    logger.info('Rolling back to blue environment', logContext);
    // Implementation would rollback to blue environment
  }

  // Canary deployment helpers
  private async deployCanaryVersion(config: DeploymentConfig, logContext: LogContext): Promise<void> {
    logger.debug('Deploying canary version', logContext);
    // Implementation would deploy canary version
  }

  private async updateTrafficRouting(weight: number, config: DeploymentConfig, logContext: LogContext): Promise<void> {
    logger.debug(`Updating traffic routing to ${weight}%`, logContext);
    // Implementation would update traffic routing weights
  }

  private async evaluateSuccessCriteria(criteria: SuccessCriteria, config: DeploymentConfig, logContext: LogContext): Promise<boolean> {
    logger.debug('Evaluating success criteria', { ...logContext, criteria });
    // Implementation would evaluate success criteria based on metrics
    return true;
  }

  private async promoteCanaryToProduction(config: DeploymentConfig, logContext: LogContext): Promise<void> {
    logger.info('Promoting canary to production', logContext);
    // Implementation would promote canary to full production
  }

  private async rollbackCanary(config: DeploymentConfig, logContext: LogContext): Promise<void> {
    logger.info('Rolling back canary deployment', logContext);
    // Implementation would rollback canary deployment
  }

  private async createNewDeployment(config: DeploymentConfig, logContext: LogContext): Promise<void> {
    logger.debug('Creating new deployment', logContext);
    // Implementation would create new deployment
  }

  private async executeMigrationScript(script: string, logContext: LogContext): Promise<void> {
    logger.debug(`Executing migration script: ${script}`, logContext);
    // Implementation would execute migration script
    await this.sleep(1000); // Simulate script execution
  }

  private async getPreviousVersion(environment: string): Promise<string> {
    // Implementation would get previous version from deployment history
    return 'previous-version';
  }

  private async rollbackRollingDeployment(environment: string, targetVersion: string, logContext: LogContext): Promise<void> {
    const rollbackCommand = `kubectl rollout undo deployment/${environment}-app --namespace=${environment}`;
    await this.executeCommand(rollbackCommand, logContext);
  }

  private async rollbackBlueGreenDeployment(environment: string, logContext: LogContext): Promise<void> {
    // Implementation would rollback blue-green deployment
  }

  private async rollbackRecreateDeployment(environment: string, targetVersion: string, logContext: LogContext): Promise<void> {
    // Implementation would rollback recreate deployment
  }

  private async performRollbackHealthCheck(environment: string, logContext: LogContext): Promise<boolean> {
    // Implementation would perform health check after rollback
    return true;
  }
}