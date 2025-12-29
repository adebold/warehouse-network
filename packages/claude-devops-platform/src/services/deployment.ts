import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { Database } from '../database';
import { KubernetesService } from './kubernetes';
import { DockerService } from './docker';
import { GitHubService } from './github';
import { MonitoringService } from './monitoring';
import { CodeQualityService } from './code-quality';
import { MetricsCollector } from '../utils/metrics';
import { QualityMetricsCollector } from '../utils/quality-metrics';
import { config } from '../config';

export interface DeploymentConfig {
  id?: string;
  name: string;
  application: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  strategy: 'rolling-update' | 'blue-green' | 'canary';
  target: DeploymentTarget;
  source: DeploymentSource;
  healthCheck?: HealthCheckConfig;
  rollbackConfig?: RollbackConfig;
  qualityGate?: QualityGateConfig;
  notifications?: NotificationConfig[];
  metadata?: { [key: string]: any };
}

export interface QualityGateConfig {
  enabled: boolean;
  blockOnFailure: boolean;
  projectPath: string;
  ignoreBlockers?: string[];
  thresholds?: {
    minScore?: number;
    maxSecurityIssues?: number;
    minCoverage?: number;
  };
}

export interface DeploymentTarget {
  type: 'kubernetes' | 'docker-swarm' | 'ecs' | 'cloud-run';
  config: any;
}

export interface DeploymentSource {
  type: 'docker-image' | 'git-repository' | 'helm-chart';
  config: any;
}

export interface HealthCheckConfig {
  enabled: boolean;
  type: 'http' | 'tcp' | 'exec';
  config: any;
  interval: number;
  timeout: number;
  retries: number;
  startPeriod: number;
}

export interface RollbackConfig {
  enabled: boolean;
  automatic: boolean;
  maxHistory: number;
  failureThreshold: number;
}

export interface NotificationConfig {
  type: 'slack' | 'email' | 'webhook';
  events: string[];
  config: any;
}

export interface Deployment {
  id: string;
  configId: string;
  status: DeploymentStatus;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  previousVersion?: string;
  metrics?: DeploymentMetrics;
  error?: string;
  rollbackId?: string;
  qualityCheckId?: string;
  qualityScore?: number;
  qualityPassed?: boolean;
}

export enum DeploymentStatus {
  PENDING = 'pending',
  PREPARING = 'preparing',
  QUALITY_CHECK = 'quality_check',
  IN_PROGRESS = 'in_progress',
  VERIFYING = 'verifying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
  CANCELLED = 'cancelled',
  QUALITY_GATE_FAILED = 'quality_gate_failed',
}

export interface DeploymentMetrics {
  podCount: number;
  readyPods: number;
  cpu: number;
  memory: number;
  responseTime: number;
  errorRate: number;
  throughput: number;
}

export class DeploymentService {
  private static instance: DeploymentService;
  private activeDeployments: Map<string, Deployment> = new Map();

  private constructor() {}

  public static getInstance(): DeploymentService {
    if (!DeploymentService.instance) {
      DeploymentService.instance = new DeploymentService();
    }
    return DeploymentService.instance;
  }

  public async createDeploymentConfig(config: DeploymentConfig): Promise<string> {
    const configId = config.id || uuidv4();
    
    try {
      await Database.query(
        `INSERT INTO deployment_configs (id, name, application, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [configId, config.name, config.application, JSON.stringify(config)]
      );
      
      logger.info('Created deployment configuration', {
        configId,
        name: config.name,
        application: config.application,
      });
      
      return configId;
    } catch (error) {
      logger.error('Failed to create deployment configuration:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async deploy(configId: string, options?: { dryRun?: boolean }): Promise<string> {
    const deploymentId = uuidv4();
    const startTime = new Date();
    
    try {
      // Get deployment configuration
      const config = await this.getDeploymentConfig(configId);
      
      // Create deployment record
      const deployment: Deployment = {
        id: deploymentId,
        configId,
        status: DeploymentStatus.PENDING,
        startTime,
      };
      
      this.activeDeployments.set(deploymentId, deployment);
      await this.saveDeployment(deployment);
      
      // Start deployment process
      if (!options?.dryRun) {
        this.executeDeployment(deployment, config).catch(error => {
          logger.error('Deployment execution failed:', error instanceof Error ? error : new Error(String(error)));
        });
      } else {
        logger.info('Dry run mode - deployment not executed', { deploymentId });
        deployment.status = DeploymentStatus.COMPLETED;
        deployment.endTime = new Date();
        await this.updateDeployment(deployment);
      }
      
      logger.info('Started deployment', {
        deploymentId,
        application: config.application,
        version: config.version,
        environment: config.environment,
      });
      
      MetricsCollector.recordDeploymentOperation('start', 'success');
      
      return deploymentId;
    } catch (error) {
      MetricsCollector.recordDeploymentOperation('start', 'failure');
      logger.error('Failed to start deployment:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async executeDeployment(deployment: Deployment, config: DeploymentConfig): Promise<void> {
    try {
      // Update status to preparing
      deployment.status = DeploymentStatus.PREPARING;
      await this.updateDeployment(deployment);
      await this.sendNotification(config, deployment, 'deployment_started');
      
      // Get previous version for potential rollback
      deployment.previousVersion = await this.getCurrentVersion(config);
      
      // Run quality gate if enabled
      if (config.qualityGate?.enabled) {
        deployment.status = DeploymentStatus.QUALITY_CHECK;
        await this.updateDeployment(deployment);
        
        const qualityPassed = await this.runQualityGate(deployment, config);
        
        if (!qualityPassed && config.qualityGate.blockOnFailure) {
          deployment.status = DeploymentStatus.QUALITY_GATE_FAILED;
          deployment.error = 'Quality gate failed - deployment blocked';
          deployment.endTime = new Date();
          deployment.duration = deployment.endTime.getTime() - deployment.startTime.getTime();
          await this.updateDeployment(deployment);
          await this.sendNotification(config, deployment, 'quality_gate_failed');
          
          logger.warn('Deployment blocked by quality gate', {
            deploymentId: deployment.id,
            qualityScore: deployment.qualityScore,
            qualityPassed: deployment.qualityPassed
          });
          
          throw new Error('Quality gate failed');
        }
      }
      
      // Prepare deployment based on source type
      await this.prepareDeployment(config);
      
      // Update status to in progress
      deployment.status = DeploymentStatus.IN_PROGRESS;
      await this.updateDeployment(deployment);
      
      // Execute deployment based on strategy
      switch (config.strategy) {
        case 'rolling-update':
          await this.performRollingUpdate(config, deployment);
          break;
        case 'blue-green':
          await this.performBlueGreenDeployment(config, deployment);
          break;
        case 'canary':
          await this.performCanaryDeployment(config, deployment);
          break;
        default:
          throw new Error(`Unknown deployment strategy: ${config.strategy}`);
      }
      
      // Verify deployment
      deployment.status = DeploymentStatus.VERIFYING;
      await this.updateDeployment(deployment);
      
      const isHealthy = await this.verifyDeployment(config, deployment);
      
      if (!isHealthy) {
        throw new Error('Deployment verification failed');
      }
      
      // Collect metrics
      deployment.metrics = await this.collectDeploymentMetrics(config);
      
      // Set up quality monitoring for post-deployment
      if (config.qualityGate?.enabled && config.rollbackConfig?.automatic) {
        await this.setupQualityMonitoring(deployment, config);
      }
      
      // Complete deployment
      deployment.status = DeploymentStatus.COMPLETED;
      deployment.endTime = new Date();
      deployment.duration = deployment.endTime.getTime() - deployment.startTime.getTime();
      await this.updateDeployment(deployment);
      
      // Send success notification
      await this.sendNotification(config, deployment, 'deployment_completed');
      
      // Clean up old deployments
      await this.cleanupOldDeployments(config);
      
      MetricsCollector.recordDeploymentOperation('complete', 'success');
      
    } catch (error) {
      logger.error('Deployment failed:', error instanceof Error ? error : new Error(String(error)));
      deployment.status = DeploymentStatus.FAILED;
      deployment.error = error instanceof Error ? error.message : String(error);
      deployment.endTime = new Date();
      deployment.duration = deployment.endTime.getTime() - deployment.startTime.getTime();
      await this.updateDeployment(deployment);
      
      // Send failure notification
      await this.sendNotification(config, deployment, 'deployment_failed');
      
      // Perform automatic rollback if configured
      if (config.rollbackConfig?.enabled && config.rollbackConfig?.automatic) {
        await this.rollback(deployment.id);
      }
      
      MetricsCollector.recordDeploymentOperation('complete', 'failure');
      throw error;
    }
  }

  private async prepareDeployment(config: DeploymentConfig): Promise<void> {
    switch (config.source.type) {
      case 'docker-image':
        await this.prepareDockerImage(config.source.config);
        break;
      case 'git-repository':
        await this.prepareGitRepository(config.source.config);
        break;
      case 'helm-chart':
        await this.prepareHelmChart(config.source.config);
        break;
      default:
        throw new Error(`Unknown source type: ${config.source.type}`);
    }
  }

  private async prepareDockerImage(sourceConfig: any): Promise<void> {
    const dockerService = DockerService.getInstance();
    
    // Pull latest image
    await dockerService.pullImage(sourceConfig.repository, sourceConfig.tag || 'latest');
    
    // Run security scan if enabled
    if (config.features.securityScanning) {
      const scanResult = await dockerService.scanImage(
        sourceConfig.repository,
        sourceConfig.tag || 'latest'
      );
      
      // Check security thresholds
      if (scanResult.summary.critical > 0 || scanResult.summary.high > 5) {
        throw new Error('Security scan failed: too many vulnerabilities found');
      }
    }
  }

  private async prepareGitRepository(sourceConfig: any): Promise<void> {
    const githubService = GitHubService.getInstance();
    
    // Trigger build workflow
    await githubService.triggerWorkflow(
      sourceConfig.owner,
      sourceConfig.repo,
      sourceConfig.workflow || '.github/workflows/build.yml',
      sourceConfig.ref || 'main',
      sourceConfig.inputs
    );
    
    // Wait for build to complete
    // Implementation would poll for workflow status
  }

  private async prepareHelmChart(sourceConfig: any): Promise<void> {
    // Implementation would prepare Helm chart
    logger.info('Preparing Helm chart', sourceConfig);
  }

  private async performRollingUpdate(config: DeploymentConfig, deployment: Deployment): Promise<void> {
    if (config.target.type === 'kubernetes') {
      const k8sService = KubernetesService.getInstance();
      const targetConfig = config.target.config;
      
      await k8sService.performRollingUpdate(
        targetConfig.deployment,
        targetConfig.namespace || 'default',
        this.getImageFromSource(config)
      );
      
      // Monitor rollout status
      await this.monitorKubernetesRollout(targetConfig, deployment);
    } else {
      throw new Error(`Rolling update not supported for target type: ${config.target.type}`);
    }
  }

  private async performBlueGreenDeployment(config: DeploymentConfig, deployment: Deployment): Promise<void> {
    if (config.target.type === 'kubernetes') {
      const k8sService = KubernetesService.getInstance();
      const targetConfig = config.target.config;
      
      await k8sService.performBlueGreenDeployment(
        targetConfig.service,
        targetConfig.namespace || 'default',
        {
          name: targetConfig.deployment,
          image: this.getImageFromSource(config),
          replicas: targetConfig.replicas || 3,
          ports: targetConfig.ports,
          env: targetConfig.env,
          resources: targetConfig.resources,
          healthCheck: config.healthCheck ? {
            liveness: config.healthCheck.config,
            readiness: config.healthCheck.config,
          } : undefined,
        }
      );
    } else {
      throw new Error(`Blue-green deployment not supported for target type: ${config.target.type}`);
    }
  }

  private async performCanaryDeployment(config: DeploymentConfig, deployment: Deployment): Promise<void> {
    if (config.target.type === 'kubernetes') {
      const k8sService = KubernetesService.getInstance();
      const targetConfig = config.target.config;
      
      const { canaryDeployment } = await k8sService.performCanaryDeployment(
        targetConfig.service,
        targetConfig.namespace || 'default',
        {
          name: targetConfig.deployment,
          image: this.getImageFromSource(config),
          replicas: targetConfig.replicas || 3,
          ports: targetConfig.ports,
          env: targetConfig.env,
          resources: targetConfig.resources,
        },
        targetConfig.canaryPercentage || 10
      );
      
      // Monitor canary deployment
      await this.monitorCanaryDeployment(config, deployment, canaryDeployment);
      
      // Promote canary if successful
      await this.promoteCanaryDeployment(config, deployment);
    } else {
      throw new Error(`Canary deployment not supported for target type: ${config.target.type}`);
    }
  }

  private async verifyDeployment(config: DeploymentConfig, deployment: Deployment): Promise<boolean> {
    if (!config.healthCheck?.enabled) {
      logger.warn('Health check not configured, skipping verification');
      return true;
    }
    
    const startTime = Date.now();
    const timeout = config.healthCheck.timeout * 1000;
    const interval = config.healthCheck.interval * 1000;
    const maxRetries = config.healthCheck.retries;
    
    let retries = 0;
    
    while (Date.now() - startTime < timeout && retries < maxRetries) {
      try {
        const isHealthy = await this.performHealthCheck(config);
        
        if (isHealthy) {
          logger.info('Deployment health check passed');
          return true;
        }
        
        retries++;
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        logger.error('Health check error:', error instanceof Error ? error : new Error(String(error)));
        retries++;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    logger.error('Deployment health check failed after maximum retries');
    return false;
  }

  private async performHealthCheck(config: DeploymentConfig): Promise<boolean> {
    const healthConfig = config.healthCheck?.config;
    
    switch (config.healthCheck?.type) {
      case 'http':
        return await this.performHttpHealthCheck(healthConfig);
      case 'tcp':
        return await this.performTcpHealthCheck(healthConfig);
      case 'exec':
        return await this.performExecHealthCheck(healthConfig);
      default:
        throw new Error(`Unknown health check type: ${config.healthCheck?.type}`);
    }
  }

  private async performHttpHealthCheck(config: any): Promise<boolean> {
    try {
      const axios = require('axios');
      const response = await axios.get(config.url, {
        timeout: config.timeout || 5000,
        validateStatus: (status: number) => status >= 200 && status < 400,
      });
      
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.error('HTTP health check failed:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  private async performTcpHealthCheck(config: any): Promise<boolean> {
    const net = require('net');
    
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(config.timeout || 5000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (err: any) => {
        logger.error('TCP health check error:', err);
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(config.port, config.host);
    });
  }

  private async performExecHealthCheck(config: any): Promise<boolean> {
    if (config.target === 'kubernetes') {
      const k8sService = KubernetesService.getInstance();
      const pods = await k8sService.getPods(
        config.namespace,
        `app=${config.deployment}`
      );
      
      if (pods.length === 0) {
        return false;
      }
      
      // Check if all pods are ready
      return pods.every(pod => 
        pod.status?.phase === 'Running' &&
        pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True')
      );
    }
    
    return false;
  }

  private async collectDeploymentMetrics(config: DeploymentConfig): Promise<DeploymentMetrics> {
    const monitoringService = MonitoringService.getInstance();
    
    // Collect metrics based on deployment target
    if (config.target.type === 'kubernetes') {
      const metrics = await monitoringService.getApplicationMetrics(
        config.application,
        config.environment
      );
      
      return {
        podCount: metrics.podCount || 0,
        readyPods: metrics.readyPods || 0,
        cpu: metrics.cpuUsage || 0,
        memory: metrics.memoryUsage || 0,
        responseTime: metrics.responseTime || 0,
        errorRate: metrics.errorRate || 0,
        throughput: metrics.throughput || 0,
      };
    }
    
    return {
      podCount: 0,
      readyPods: 0,
      cpu: 0,
      memory: 0,
      responseTime: 0,
      errorRate: 0,
      throughput: 0,
    };
  }

  public async rollback(deploymentId: string): Promise<string> {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    
    const config = await this.getDeploymentConfig(deployment.configId);
    
    if (!deployment.previousVersion) {
      throw new Error('No previous version available for rollback');
    }
    
    const rollbackId = uuidv4();
    
    try {
      logger.info('Starting rollback', {
        deploymentId,
        previousVersion: deployment.previousVersion,
      });
      
      // Create new deployment with previous version
      const rollbackConfig: DeploymentConfig = {
        ...config,
        version: deployment.previousVersion,
        metadata: {
          ...config.metadata,
          isRollback: true,
          originalDeploymentId: deploymentId,
        },
      };
      
      const rollbackConfigId = await this.createDeploymentConfig(rollbackConfig);
      const rollbackDeploymentId = await this.deploy(rollbackConfigId);
      
      // Update original deployment status
      deployment.status = DeploymentStatus.ROLLED_BACK;
      deployment.rollbackId = rollbackDeploymentId;
      await this.updateDeployment(deployment);
      
      MetricsCollector.recordDeploymentOperation('rollback', 'success');
      
      return rollbackDeploymentId;
    } catch (error) {
      MetricsCollector.recordDeploymentOperation('rollback', 'failure');
      logger.error('Rollback failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getDeployment(deploymentId: string): Promise<Deployment | null> {
    const cached = this.activeDeployments.get(deploymentId);
    if (cached) return cached;
    
    const result = await Database.query(
      'SELECT * FROM deployments WHERE id = $1',
      [deploymentId]
    );
    
    if (result.rows.length === 0) return null;
    
    const deployment = this.mapRowToDeployment(result.rows[0]);
    this.activeDeployments.set(deploymentId, deployment);
    
    return deployment;
  }

  public async listDeployments(filters?: {
    application?: string;
    environment?: string;
    status?: DeploymentStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Deployment[]> {
    let query = 'SELECT * FROM deployments WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filters?.application) {
      query += ` AND application = $${paramIndex++}`;
      params.push(filters.application);
    }
    
    if (filters?.environment) {
      query += ` AND environment = $${paramIndex++}`;
      params.push(filters.environment);
    }
    
    if (filters?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }
    
    if (filters?.startDate) {
      query += ` AND start_time >= $${paramIndex++}`;
      params.push(filters.startDate);
    }
    
    if (filters?.endDate) {
      query += ` AND start_time <= $${paramIndex++}`;
      params.push(filters.endDate);
    }
    
    query += ' ORDER BY start_time DESC';
    
    const result = await Database.query(query, params);
    
    return result.rows.map(row => this.mapRowToDeployment(row));
  }

  public async getDeploymentHistory(
    application: string,
    environment: string,
    limit: number = 10
  ): Promise<Deployment[]> {
    const result = await Database.query(
      `SELECT * FROM deployments 
       WHERE application = $1 AND environment = $2
       ORDER BY start_time DESC
       LIMIT $3`,
      [application, environment, limit]
    );
    
    return result.rows.map(row => this.mapRowToDeployment(row));
  }

  public async cancelDeployment(deploymentId: string): Promise<void> {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    
    if (![DeploymentStatus.PENDING, DeploymentStatus.PREPARING, DeploymentStatus.IN_PROGRESS].includes(deployment.status)) {
      throw new Error(`Cannot cancel deployment in ${deployment.status} status`);
    }
    
    deployment.status = DeploymentStatus.CANCELLED;
    deployment.endTime = new Date();
    deployment.duration = deployment.endTime.getTime() - deployment.startTime.getTime();
    
    await this.updateDeployment(deployment);
    
    logger.info('Cancelled deployment', { deploymentId });
    MetricsCollector.recordDeploymentOperation('cancel', 'success');
  }

  // Helper methods
  private async getDeploymentConfig(configId: string): Promise<DeploymentConfig> {
    const result = await Database.query(
      'SELECT config FROM deployment_configs WHERE id = $1',
      [configId]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Deployment configuration ${configId} not found`);
    }
    
    return result.rows[0].config;
  }

  private async getCurrentVersion(config: DeploymentConfig): Promise<string | undefined> {
    const history = await this.getDeploymentHistory(
      config.application,
      config.environment,
      1
    );
    
    return history.length > 0 ? history[0].configId : undefined;
  }

  private getImageFromSource(config: DeploymentConfig): string {
    if (config.source.type === 'docker-image') {
      const { repository, tag } = config.source.config;
      return `${repository}:${tag || 'latest'}`;
    }
    
    throw new Error(`Cannot get image from source type: ${config.source.type}`);
  }

  private async monitorKubernetesRollout(targetConfig: any, deployment: Deployment): Promise<void> {
    const k8sService = KubernetesService.getInstance();
    
    await k8sService.watchDeployment(
      targetConfig.deployment,
      targetConfig.namespace || 'default',
      (phase, message) => {
        logger.info(`Deployment ${phase}: ${message}`);
      }
    );
  }

  private async monitorCanaryDeployment(
    config: DeploymentConfig,
    deployment: Deployment,
    canaryDeployment: any
  ): Promise<void> {
    const monitoringService = MonitoringService.getInstance();
    const monitoringDuration = config.target.config.canaryDuration || 300000; // 5 minutes default
    const startTime = Date.now();
    
    while (Date.now() - startTime < monitoringDuration) {
      const metrics = await monitoringService.getApplicationMetrics(
        config.application,
        config.environment
      );
      
      // Check error rate threshold
      if (metrics.errorRate > (config.target.config.errorRateThreshold || 0.05)) {
        throw new Error('Canary deployment failed: error rate too high');
      }
      
      // Check response time threshold
      if (metrics.responseTime > (config.target.config.responseTimeThreshold || 1000)) {
        throw new Error('Canary deployment failed: response time too high');
      }
      
      await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
    }
  }

  private async promoteCanaryDeployment(config: DeploymentConfig, deployment: Deployment): Promise<void> {
    if (config.target.type === 'kubernetes') {
      const k8sService = KubernetesService.getInstance();
      const targetConfig = config.target.config;
      
      // Scale up canary to 100%
      await k8sService.scaleDeployment(
        `${targetConfig.deployment}-canary`,
        targetConfig.namespace || 'default',
        targetConfig.replicas || 3
      );
      
      // Scale down stable to 0
      await k8sService.scaleDeployment(
        targetConfig.deployment,
        targetConfig.namespace || 'default',
        0
      );
      
      // Delete stable deployment
      await k8sService.deleteDeployment(
        targetConfig.deployment,
        targetConfig.namespace || 'default'
      );
      
      logger.info('Promoted canary deployment to stable');
    }
  }

  private async cleanupOldDeployments(config: DeploymentConfig): Promise<void> {
    if (!config.rollbackConfig?.maxHistory) return;
    
    const history = await this.getDeploymentHistory(
      config.application,
      config.environment,
      config.rollbackConfig.maxHistory + 10
    );
    
    if (history.length > config.rollbackConfig.maxHistory) {
      const toDelete = history.slice(config.rollbackConfig.maxHistory);
      
      for (const deployment of toDelete) {
        await Database.query(
          'DELETE FROM deployments WHERE id = $1',
          [deployment.id]
        );
        
        logger.info('Cleaned up old deployment', { deploymentId: deployment.id });
      }
    }
  }

  private async runQualityGate(deployment: Deployment, config: DeploymentConfig): Promise<boolean> {
    const qualityService = CodeQualityService.getInstance();
    const qualityMetrics = QualityMetricsCollector.getInstance();
    
    try {
      const projectPath = config.qualityGate?.projectPath || process.cwd();
      const projectId = config.metadata?.projectId || config.application;
      
      logger.info('Running pre-deployment quality gate', {
        deploymentId: deployment.id,
        projectId,
        projectPath
      });
      
      const startTime = Date.now();
      
      // Run quality analysis
      const qualityCheck = await qualityService.analyzeForDeployment(
        projectPath,
        projectId,
        {
          commitHash: config.metadata?.commitHash,
          branch: config.metadata?.branch,
          compareWithBaseline: true
        }
      );
      
      // Store quality results in deployment
      deployment.qualityCheckId = qualityCheck.id;
      deployment.qualityScore = qualityCheck.score.overall;
      deployment.qualityPassed = qualityCheck.passed;
      
      // Record quality metrics
      qualityMetrics.recordQualityCheck({
        projectId,
        checkId: qualityCheck.id,
        timestamp: new Date(),
        score: qualityCheck.score.overall,
        passed: qualityCheck.passed,
        blockers: qualityCheck.blockers.length,
        duration: Date.now() - startTime,
        type: 'pre-deployment'
      });
      
      // Check against custom thresholds if defined
      if (config.qualityGate?.thresholds) {
        const thresholds = config.qualityGate.thresholds;
        
        if (thresholds.minScore && qualityCheck.score.overall < thresholds.minScore) {
          logger.warn('Quality score below threshold', {
            score: qualityCheck.score.overall,
            threshold: thresholds.minScore
          });
          return false;
        }
        
        if (thresholds.maxSecurityIssues) {
          const criticalSecurityIssues = qualityCheck.blockers.filter(b => 
            b.type === 'security' && b.severity === 'critical'
          ).length;
          
          if (criticalSecurityIssues > thresholds.maxSecurityIssues) {
            logger.warn('Too many security issues', {
              issues: criticalSecurityIssues,
              threshold: thresholds.maxSecurityIssues
            });
            return false;
          }
        }
      }
      
      // Generate and log quality report
      const report = await qualityService.generateDeploymentReport(qualityCheck);
      
      logger.info('Quality gate completed', {
        deploymentId: deployment.id,
        passed: qualityCheck.passed,
        score: qualityCheck.score.overall,
        blockers: qualityCheck.blockers.length,
        duration: Date.now() - startTime
      });
      
      return qualityCheck.passed;
    } catch (error) {
      logger.error('Quality gate failed', error instanceof Error ? error : new Error(String(error)));
      
      // Record failed quality check
      qualityMetrics.recordQualityCheck({
        projectId: config.application,
        checkId: deployment.id,
        timestamp: new Date(),
        score: 0,
        passed: false,
        blockers: 0,
        duration: 0,
        type: 'pre-deployment'
      });
      
      // Fail open or closed based on configuration
      return !config.qualityGate?.blockOnFailure;
    }
  }

  private async setupQualityMonitoring(deployment: Deployment, config: DeploymentConfig): Promise<void> {
    const qualityService = CodeQualityService.getInstance();
    
    try {
      const projectId = config.metadata?.projectId || config.application;
      
      // Set up rollback triggers based on quality degradation
      await qualityService.setupRollbackTriggers(
        projectId,
        deployment.id,
        {
          maxQualityDrop: config.qualityGate?.thresholds?.minScore 
            ? (deployment.qualityScore || 10) - config.qualityGate.thresholds.minScore 
            : 2.0,
          maxNewBlockers: 5,
          maxSecurityIssues: config.qualityGate?.thresholds?.maxSecurityIssues || 0
        }
      );
      
      // Schedule post-deployment quality checks
      setTimeout(async () => {
        await this.checkPostDeploymentQuality(deployment, config);
      }, 300000); // 5 minutes after deployment
      
      logger.info('Set up post-deployment quality monitoring', {
        deploymentId: deployment.id,
        projectId
      });
    } catch (error) {
      logger.error('Failed to setup quality monitoring', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async checkPostDeploymentQuality(deployment: Deployment, config: DeploymentConfig): Promise<void> {
    const qualityService = CodeQualityService.getInstance();
    const qualityMetrics = QualityMetricsCollector.getInstance();
    
    try {
      const projectPath = config.qualityGate?.projectPath || process.cwd();
      const projectId = config.metadata?.projectId || config.application;
      
      logger.info('Running post-deployment quality check', {
        deploymentId: deployment.id,
        projectId
      });
      
      // Check if rollback is needed
      const rollbackCheck = await qualityService.checkRollbackNeeded(
        projectId,
        deployment.id,
        projectPath
      );
      
      if (rollbackCheck.needed) {
        logger.warn('Quality degradation detected, initiating rollback', {
          deploymentId: deployment.id,
          reason: rollbackCheck.reason
        });
        
        // Initiate automatic rollback
        await this.rollback(deployment.id, {
          reason: `Automatic rollback due to quality degradation: ${rollbackCheck.reason}`
        });
      } else {
        logger.info('Post-deployment quality check passed', {
          deploymentId: deployment.id
        });
      }
    } catch (error) {
      logger.error('Post-deployment quality check failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async sendNotification(
    config: DeploymentConfig,
    deployment: Deployment,
    event: string
  ): Promise<void> {
    if (!config.notifications) return;
    
    for (const notification of config.notifications) {
      if (!notification.events.includes(event)) continue;
      
      try {
        // Implementation would send actual notifications
        logger.info(`Would send ${notification.type} notification for ${event}`);
      } catch (error) {
        logger.error(`Failed to send notification:`, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private async saveDeployment(deployment: Deployment): Promise<void> {
    await Database.query(
      `INSERT INTO deployments (id, config_id, status, start_time, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [deployment.id, deployment.configId, deployment.status, deployment.startTime, JSON.stringify(deployment)]
    );
  }

  private async updateDeployment(deployment: Deployment): Promise<void> {
    await Database.query(
      `UPDATE deployments 
       SET status = $2, end_time = $3, data = $4, updated_at = NOW()
       WHERE id = $1`,
      [deployment.id, deployment.status, deployment.endTime, JSON.stringify(deployment)]
    );
  }

  private mapRowToDeployment(row: any): Deployment {
    return {
      id: row.id,
      configId: row.config_id,
      status: row.status,
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration,
      previousVersion: row.previous_version,
      metrics: row.metrics,
      error: row.error,
      rollbackId: row.rollback_id,
      ...row.data,
    };
  }
}