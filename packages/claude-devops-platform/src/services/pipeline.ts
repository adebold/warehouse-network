import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { Database } from '../database';
import { QueueService } from './queue';
import { KubernetesService } from './kubernetes';
import { DockerService } from './docker';
import { GitHubService } from './github';
import { CodeQualityService } from './code-quality';
import { MetricsCollector } from '../utils/metrics';
import { config } from '../config';

export interface PipelineConfig {
  id?: string;
  name: string;
  description?: string;
  stages: PipelineStage[];
  triggers?: PipelineTrigger[];
  environment?: { [key: string]: string };
  notifications?: NotificationConfig[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

export interface PipelineStage {
  name: string;
  type: 'build' | 'test' | 'security-scan' | 'quality-gate' | 'deploy' | 'rollback' | 'manual-approval' | 'custom';
  parallel?: boolean;
  dependsOn?: string[];
  steps: PipelineStep[];
  condition?: string;
  environment?: { [key: string]: string };
  timeout?: number;
  qualityGateConfig?: {
    enabled: boolean;
    blockOnFailure: boolean;
    ignoreBlockers?: string[];
  };
}

export interface PipelineStep {
  name: string;
  type: 'docker-build' | 'docker-push' | 'kubernetes-deploy' | 'script' | 'github-action' | 'terraform' | 'quality-analysis';
  config: any;
  retryCount?: number;
  continueOnError?: boolean;
}

export interface PipelineTrigger {
  type: 'webhook' | 'schedule' | 'manual' | 'git-push' | 'pull-request';
  config: any;
}

export interface NotificationConfig {
  type: 'slack' | 'email' | 'webhook' | 'pagerduty';
  events: ('start' | 'success' | 'failure' | 'stage-complete' | 'quality-check-failed' | 'quality-improved' | 'quality-degraded')[];
  config: any;
  includeQualityReport?: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
}

export interface PipelineExecution {
  id: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  stages: StageExecution[];
  triggeredBy: string;
  environment: { [key: string]: string };
  artifacts: PipelineArtifact[];
  qualityCheckId?: string;
  qualityScore?: number;
  qualityPassed?: boolean;
}

export interface StageExecution {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  steps: StepExecution[];
  error?: string;
}

export interface StepExecution {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  output?: string;
  error?: string;
  retryCount: number;
}

export interface PipelineArtifact {
  name: string;
  type: string;
  path: string;
  size: number;
  checksum: string;
  createdAt: Date;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string;
  stages: StageDefinition[];
  triggers?: PipelineTrigger[];
  environment?: { [key: string]: string };
  notifications?: NotificationConfig[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
  createdAt: Date;
  updatedAt: Date;
}

export interface StageDefinition {
  id: string;
  name: string;
  type: 'build' | 'test' | 'security-scan' | 'deploy' | 'rollback' | 'manual-approval' | 'custom';
  order: number;
  parallel?: boolean;
  dependsOn?: string[];
  steps: PipelineStep[];
  condition?: string;
  environment?: { [key: string]: string };
  timeout?: number;
}

export enum PipelineStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILURE = 'failure',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

export class PipelineService {
  private static instance: PipelineService;
  private executions: Map<string, PipelineExecution> = new Map();

  private constructor() {}

  public static getInstance(): PipelineService {
    if (!PipelineService.instance) {
      PipelineService.instance = new PipelineService();
    }
    return PipelineService.instance;
  }

  // Pipeline management
  public async createPipeline(config: PipelineConfig): Promise<string> {
    const pipelineId = config.id || uuidv4();
    
    try {
      await Database.query(
        `INSERT INTO pipelines (id, name, description, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [pipelineId, config.name, config.description, JSON.stringify(config)]
      );
      
      logger.info('Created pipeline', { pipelineId, name: config.name });
      MetricsCollector.recordPipelineOperation('create', 'success');
      
      return pipelineId;
    } catch (error) {
      MetricsCollector.recordPipelineOperation('create', 'failure');
      logger.error('Failed to create pipeline:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async updatePipeline(pipelineId: string, config: Partial<PipelineConfig>): Promise<void> {
    try {
      const result = await Database.query(
        `UPDATE pipelines 
         SET config = config || $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [pipelineId, JSON.stringify(config)]
      );
      
      if (result.rowCount === 0) {
        throw new Error(`Pipeline ${pipelineId} not found`);
      }
      
      logger.info('Updated pipeline', { pipelineId });
      MetricsCollector.recordPipelineOperation('update', 'success');
    } catch (error) {
      MetricsCollector.recordPipelineOperation('update', 'failure');
      logger.error('Failed to update pipeline:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async deletePipeline(pipelineId: string): Promise<void> {
    try {
      const result = await Database.query(
        'DELETE FROM pipelines WHERE id = $1',
        [pipelineId]
      );
      
      if (result.rowCount === 0) {
        throw new Error(`Pipeline ${pipelineId} not found`);
      }
      
      logger.info('Deleted pipeline', { pipelineId });
      MetricsCollector.recordPipelineOperation('delete', 'success');
    } catch (error) {
      MetricsCollector.recordPipelineOperation('delete', 'failure');
      logger.error('Failed to delete pipeline:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getPipeline(pipelineId: string): Promise<PipelineConfig> {
    try {
      const result = await Database.query(
        'SELECT config FROM pipelines WHERE id = $1',
        [pipelineId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Pipeline ${pipelineId} not found`);
      }
      
      return result.rows[0].config;
    } catch (error) {
      logger.error('Failed to get pipeline:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async listPipelines(): Promise<PipelineConfig[]> {
    try {
      const result = await Database.query(
        'SELECT config FROM pipelines ORDER BY created_at DESC'
      );
      
      return result.rows.map(row => row.config);
    } catch (error) {
      logger.error('Failed to list pipelines:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Pipeline execution
  public async executePipeline(
    pipelineId: string,
    triggeredBy: string,
    environment?: { [key: string]: string }
  ): Promise<string> {
    const executionId = uuidv4();
    const startTime = new Date();
    
    try {
      // Get pipeline configuration
      const pipeline = await this.getPipeline(pipelineId);
      
      // Create execution record
      const execution: PipelineExecution = {
        id: executionId,
        pipelineId,
        status: 'pending',
        startTime,
        stages: pipeline.stages.map(stage => ({
          name: stage.name,
          status: 'pending',
          steps: stage.steps.map(step => ({
            name: step.name,
            status: 'pending',
            retryCount: 0,
          })),
        })),
        triggeredBy,
        environment: { ...pipeline.environment, ...environment },
        artifacts: [],
      };
      
      this.executions.set(executionId, execution);
      
      // Save execution to database
      await this.saveExecution(execution);
      
      // Queue pipeline execution
      await QueueService.getInstance().addJob('pipeline-execution', {
        executionId,
        pipeline,
        execution,
      });
      
      logger.info('Started pipeline execution', { 
        executionId, 
        pipelineId,
        pipelineName: pipeline.name,
      });
      
      MetricsCollector.recordPipelineOperation('execute', 'success');
      
      // Start executing the pipeline
      this.processPipeline(executionId, pipeline, execution).catch(error => {
        logger.error('Pipeline execution failed:', error instanceof Error ? error : new Error(String(error)));
      });
      
      return executionId;
    } catch (error) {
      MetricsCollector.recordPipelineOperation('execute', 'failure');
      logger.error('Failed to execute pipeline:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async processPipeline(
    executionId: string,
    pipeline: PipelineConfig,
    execution: PipelineExecution
  ): Promise<void> {
    execution.status = 'running';
    await this.updateExecution(execution);
    
    try {
      // Send start notification
      await this.sendNotifications(pipeline, execution, 'start');
      
      // Execute stages
      for (const stageConfig of pipeline.stages) {
        const stageExecution = execution.stages.find(s => s.name === stageConfig.name);
        if (!stageExecution) continue;
        
        // Check if stage dependencies are met
        if (stageConfig.dependsOn) {
          const dependenciesMet = await this.checkStageDependencies(
            execution,
            stageConfig.dependsOn
          );
          
          if (!dependenciesMet) {
            stageExecution.status = 'skipped';
            continue;
          }
        }
        
        // Check stage condition
        if (stageConfig.condition && !this.evaluateCondition(stageConfig.condition, execution)) {
          stageExecution.status = 'skipped';
          continue;
        }
        
        // Execute stage
        await this.executeStage(pipeline, execution, stageConfig, stageExecution);
        
        // Check if stage failed
        if (stageExecution.status === 'failure') {
          execution.status = 'failure';
          break;
        }
        
        // Send stage complete notification
        await this.sendNotifications(pipeline, execution, 'stage-complete');
      }
      
      // Set final status
      if (execution.status === 'running') {
        execution.status = 'success';
      }
      
      execution.endTime = new Date();
      await this.updateExecution(execution);
      
      // Send completion notification
      await this.sendNotifications(
        pipeline,
        execution,
        execution.status === 'success' ? 'success' : 'failure'
      );
      
    } catch (error) {
      logger.error('Pipeline processing error:', error instanceof Error ? error : new Error(String(error)));
      execution.status = 'failure';
      execution.endTime = new Date();
      await this.updateExecution(execution);
      await this.sendNotifications(pipeline, execution, 'failure');
      throw error;
    }
  }

  private async executeStage(
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    stageConfig: PipelineStage,
    stageExecution: StageExecution
  ): Promise<void> {
    stageExecution.status = 'running';
    stageExecution.startTime = new Date();
    await this.updateExecution(execution);
    
    try {
      // Execute quality gate if configured
      if (stageConfig.type === 'quality-gate' || stageConfig.qualityGateConfig?.enabled) {
        const qualityPassed = await this.executeQualityGate(
          pipeline,
          execution,
          stageConfig,
          stageExecution
        );
        
        if (!qualityPassed && stageConfig.qualityGateConfig?.blockOnFailure) {
          stageExecution.status = 'failure';
          stageExecution.error = 'Quality gate failed';
          stageExecution.endTime = new Date();
          await this.updateExecution(execution);
          return;
        }
      }
      if (stageConfig.parallel) {
        // Execute steps in parallel
        await Promise.all(
          stageConfig.steps.map((stepConfig, index) => {
            const stepExecution = stageExecution.steps[index];
            if (!stepExecution) return;
            return this.executeStep(
              pipeline,
              execution,
              stageConfig,
              stepConfig,
              stepExecution
            );
          })
        );
      } else {
        // Execute steps sequentially
        for (let i = 0; i < stageConfig.steps.length; i++) {
          const stepConfig = stageConfig.steps[i];
          const stepExecution = stageExecution.steps[i];
          if (!stepExecution) continue;
          
          if (stepConfig) {
            await this.executeStep(
              pipeline,
              execution,
              stageConfig,
              stepConfig,
              stepExecution
            );
            
            // Check if step failed and not configured to continue on error
            if (stepExecution.status === 'failure' && !stepConfig.continueOnError) {
              stageExecution.status = 'failure';
              break;
            }
          }
        }
      }
      
      // Set stage status based on step results
      if (stageExecution.status === 'running') {
        const hasFailedStep = stageExecution.steps.some(s => s.status === 'failure');
        stageExecution.status = hasFailedStep ? 'failure' : 'success';
      }
      
      stageExecution.endTime = new Date();
      await this.updateExecution(execution);
      
    } catch (error) {
      logger.error(`Stage ${stageConfig.name} execution error:`, error instanceof Error ? error : new Error(String(error)));
      stageExecution.status = 'failure';
      stageExecution.error = error instanceof Error ? error.message : String(error);
      stageExecution.endTime = new Date();
      await this.updateExecution(execution);
      throw error;
    }
  }

  private async executeStep(
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    stage: PipelineStage,
    stepConfig: PipelineStep,
    stepExecution: StepExecution
  ): Promise<void> {
    stepExecution.status = 'running';
    stepExecution.startTime = new Date();
    await this.updateExecution(execution);
    
    const maxRetries = stepConfig.retryCount || 0;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`Retrying step ${stepConfig.name}, attempt ${attempt + 1}/${maxRetries + 1}`);
          stepExecution.retryCount = attempt;
        }
        
        // Execute step based on type
        switch (stepConfig.type) {
          case 'docker-build':
            await this.executeDockerBuild(stepConfig.config, execution);
            break;
            
          case 'docker-push':
            await this.executeDockerPush(stepConfig.config, execution);
            break;
            
          case 'kubernetes-deploy':
            await this.executeKubernetesDeploy(stepConfig.config, execution);
            break;
            
          case 'script':
            await this.executeScript(stepConfig.config, execution);
            break;
            
          case 'github-action':
            await this.executeGitHubAction(stepConfig.config, execution);
            break;
            
          case 'terraform':
            await this.executeTerraform(stepConfig.config, execution);
            break;
            
          case 'quality-analysis':
            await this.executeQualityAnalysis(stepConfig.config, execution, pipeline);
            break;
            
          default:
            throw new Error(`Unknown step type: ${stepConfig.type}`);
        }
        
        stepExecution.status = 'success';
        stepExecution.endTime = new Date();
        await this.updateExecution(execution);
        return;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`Step ${stepConfig.name} failed:`, error instanceof Error ? error : new Error(String(error)));
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    // All attempts failed
    stepExecution.status = 'failure';
    stepExecution.error = lastError?.message || 'Unknown error';
    stepExecution.endTime = new Date();
    await this.updateExecution(execution);
  }

  // Step executors
  private async executeDockerBuild(
    config: any,
    execution: PipelineExecution
  ): Promise<void> {
    const dockerService = DockerService.getInstance();
    
    const imageId = await dockerService.buildImage({
      context: config.context || '.',
      dockerfile: config.dockerfile,
      tags: config.tags || [`build-${execution.id}`],
      buildArgs: config.buildArgs,
      target: config.target,
      cache: config.cache !== false,
      platform: config.platform,
      labels: {
        ...config.labels,
        'pipeline.execution.id': execution.id,
        'pipeline.id': execution.pipelineId,
      },
    });
    
    // Store image ID as artifact
    execution.artifacts.push({
      name: 'docker-image',
      type: 'docker',
      path: imageId,
      size: 0,
      checksum: imageId,
      createdAt: new Date(),
    });
  }

  private async executeDockerPush(
    config: any,
    execution: PipelineExecution
  ): Promise<void> {
    const dockerService = DockerService.getInstance();
    
    for (const tag of config.tags || []) {
      await dockerService.pushImage(
        config.image || config.repository,
        tag,
        {
          registry: config.registry,
          username: config.username,
          password: config.password,
        }
      );
    }
  }

  private async executeKubernetesDeploy(
    config: any,
    execution: PipelineExecution
  ): Promise<void> {
    const k8sService = KubernetesService.getInstance();
    
    if (config.strategy === 'blue-green') {
      await k8sService.performBlueGreenDeployment(
        config.service,
        config.namespace || 'default',
        {
          name: config.deployment,
          image: config.image,
          replicas: config.replicas,
          ports: config.ports,
          env: config.env,
          resources: config.resources,
          healthCheck: config.healthCheck,
        }
      );
    } else if (config.strategy === 'canary') {
      await k8sService.performCanaryDeployment(
        config.service,
        config.namespace || 'default',
        {
          name: config.deployment,
          image: config.image,
          replicas: config.replicas,
          ports: config.ports,
          env: config.env,
          resources: config.resources,
        },
        config.canaryPercentage || 10
      );
    } else {
      // Standard rolling update
      await k8sService.createDeployment({
        name: config.deployment,
        namespace: config.namespace,
        image: config.image,
        replicas: config.replicas,
        ports: config.ports,
        env: config.env,
        resources: config.resources,
        labels: config.labels,
        annotations: config.annotations,
        strategy: 'RollingUpdate',
        healthCheck: config.healthCheck,
      });
    }
  }

  private async executeScript(
    config: any,
    execution: PipelineExecution
  ): Promise<void> {
    // Execute shell script
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const env = {
      ...process.env,
      ...execution.environment,
      PIPELINE_EXECUTION_ID: execution.id,
      PIPELINE_ID: execution.pipelineId,
    };
    
    const { stdout, stderr } = await execAsync(config.script, {
      env,
      shell: config.shell || '/bin/bash',
      cwd: config.workingDirectory,
      timeout: config.timeout || 300000, // 5 minutes default
    });
    
    if (stdout) {
      logger.info('Script output:', stdout);
    }
    
    if (stderr) {
      logger.warn('Script stderr:', stderr);
    }
  }

  private async executeGitHubAction(
    config: any,
    execution: PipelineExecution
  ): Promise<void> {
    const githubService = GitHubService.getInstance();
    
    await githubService.triggerWorkflow(
      config.owner,
      config.repo,
      config.workflow,
      config.ref || 'main',
      {
        ...config.inputs,
        pipeline_execution_id: execution.id,
      }
    );
    
    // Optionally wait for workflow completion
    if (config.waitForCompletion) {
      // Poll for workflow status
      let attempts = 0;
      const maxAttempts = config.maxWaitTime ? config.maxWaitTime / 10000 : 60; // 10 minutes default
      
      while (attempts < maxAttempts) {
        const runs = await githubService.listWorkflowRuns(
          config.owner,
          config.repo,
          config.workflow,
          { branch: config.ref, per_page: 1 }
        );
        
        const latestRun = runs[0];
        if (latestRun && latestRun.status === 'completed') {
          if (latestRun.conclusion !== 'success') {
            throw new Error(`GitHub Action failed with conclusion: ${latestRun.conclusion}`);
          }
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('GitHub Action timed out');
      }
    }
  }

  private async executeQualityAnalysis(
    config: any,
    execution: PipelineExecution,
    pipeline: PipelineConfig
  ): Promise<void> {
    const qualityService = CodeQualityService.getInstance();
    
    try {
      const projectPath = config.projectPath || process.cwd();
      const projectId = config.projectId || execution.pipelineId;
      
      logger.info('Running quality analysis', { projectId, projectPath });
      
      // Run quality analysis
      const qualityCheck = await qualityService.analyzeForDeployment(
        projectPath,
        projectId,
        {
          commitHash: config.commitHash || execution.environment.GIT_COMMIT,
          branch: config.branch || execution.environment.GIT_BRANCH,
          compareWithBaseline: config.compareWithBaseline !== false
        }
      );
      
      // Store quality check results
      execution.qualityCheckId = qualityCheck.id;
      execution.qualityScore = qualityCheck.score.overall;
      execution.qualityPassed = qualityCheck.passed;
      
      // Store quality report as artifact
      const report = await qualityService.generateDeploymentReport(qualityCheck);
      execution.artifacts.push({
        name: 'quality-report',
        type: 'json',
        path: `quality-reports/${qualityCheck.id}.json`,
        size: JSON.stringify(report).length,
        checksum: qualityCheck.id,
        createdAt: new Date()
      });
      
      // Send quality notifications if configured
      if (qualityCheck.passed) {
        await this.sendNotifications(pipeline, execution, 'quality-improved' as any);
      } else {
        await this.sendNotifications(pipeline, execution, 'quality-check-failed' as any);
        
        // Throw error if quality gate should block
        if (config.blockOnFailure !== false) {
          throw new Error(`Quality check failed: ${qualityCheck.blockers.length} blockers found`);
        }
      }
      
      logger.info('Quality analysis completed', {
        qualityCheckId: qualityCheck.id,
        score: qualityCheck.score.overall,
        passed: qualityCheck.passed,
        blockers: qualityCheck.blockers.length
      });
    } catch (error) {
      logger.error('Quality analysis failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async executeQualityGate(
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    stageConfig: PipelineStage,
    stageExecution: StageExecution
  ): Promise<boolean> {
    const qualityService = CodeQualityService.getInstance();
    
    try {
      const projectPath = execution.environment.PROJECT_PATH || process.cwd();
      const projectId = execution.environment.PROJECT_ID || execution.pipelineId;
      
      logger.info('Executing quality gate', {
        stage: stageConfig.name,
        projectId
      });
      
      // Check if deployment should be allowed
      const deploymentCheck = await qualityService.canDeploy(
        projectId,
        projectPath,
        {
          ignoreBlockers: stageConfig.qualityGateConfig?.ignoreBlockers
        }
      );
      
      if (!deploymentCheck.allowed) {
        stageExecution.error = deploymentCheck.reason;
        logger.warn('Quality gate failed', {
          reason: deploymentCheck.reason,
          blockers: deploymentCheck.check?.blockers
        });
        
        // Send quality failure notification
        await this.sendNotifications(pipeline, execution, 'quality-check-failed' as any);
        
        return false;
      }
      
      // Set up rollback triggers
      if (stageConfig.type === 'deploy' && deploymentCheck.check) {
        await qualityService.setupRollbackTriggers(
          projectId,
          execution.id,
          {
            maxQualityDrop: 2.0,
            maxNewBlockers: 5,
            maxSecurityIssues: 0
          }
        );
      }
      
      logger.info('Quality gate passed', {
        score: deploymentCheck.check?.score.overall,
        blockers: deploymentCheck.check?.blockers.length || 0
      });
      
      return true;
    } catch (error) {
      logger.error('Quality gate execution failed', error instanceof Error ? error : new Error(String(error)));
      stageExecution.error = 'Quality gate check failed';
      return false;
    }
  }

  private async executeTerraform(
    config: any,
    execution: PipelineExecution
  ): Promise<void> {
    // This would integrate with a Terraform service
    // For now, we'll execute terraform commands directly
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const env = {
      ...process.env,
      ...execution.environment,
      TF_IN_AUTOMATION: 'true',
    };
    
    const workDir = config.workingDirectory || '.';
    
    // Terraform init
    await execAsync('terraform init', { env, cwd: workDir });
    
    // Terraform plan
    const planFile = `tfplan-${execution.id}`;
    await execAsync(`terraform plan -out=${planFile}`, { env, cwd: workDir });
    
    // Terraform apply
    if (config.autoApprove) {
      await execAsync(`terraform apply -auto-approve ${planFile}`, { env, cwd: workDir });
    }
  }

  // Helper methods
  private async checkStageDependencies(
    execution: PipelineExecution,
    dependencies: string[]
  ): Promise<boolean> {
    for (const dep of dependencies) {
      const depStage = execution.stages.find(s => s.name === dep);
      if (!depStage || depStage.status !== 'success') {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(condition: string, execution: PipelineExecution): boolean {
    // Simple condition evaluation
    // In a real implementation, this would use a proper expression evaluator
    try {
      // WARNING: This is unsafe and should use a sandboxed evaluator in production
      const context = {
        execution,
        env: execution.environment,
      };
      
      return Function('context', `with(context) { return ${condition} }`)(context);
    } catch (error) {
      logger.error('Failed to evaluate condition:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  private async sendNotifications(
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    event: 'start' | 'success' | 'failure' | 'stage-complete' | 'quality-check-failed' | 'quality-improved' | 'quality-degraded'
  ): Promise<void> {
    if (!pipeline.notifications) return;
    
    for (const notification of pipeline.notifications) {
      if (!notification.events.includes(event)) continue;
      
      try {
        switch (notification.type) {
          case 'slack':
            await this.sendSlackNotification(notification.config, pipeline, execution, event);
            break;
          case 'email':
            await this.sendEmailNotification(notification.config, pipeline, execution, event);
            break;
          case 'webhook':
            await this.sendWebhookNotification(notification.config, pipeline, execution, event);
            break;
          case 'pagerduty':
            await this.sendPagerDutyNotification(notification.config, pipeline, execution, event);
            break;
        }
      } catch (error) {
        logger.error(`Failed to send ${notification.type} notification:`, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private async sendSlackNotification(
    config: any,
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    event: string
  ): Promise<void> {
    // Implementation would send Slack notification
    let message = `Pipeline *${pipeline.name}* - ${event}`;
    let color = 'good';
    
    switch (event) {
      case 'quality-check-failed':
        message = `🚨 Quality check failed for pipeline *${pipeline.name}*`;
        color = 'danger';
        if (execution.qualityScore !== undefined) {
          message += `\nQuality Score: ${execution.qualityScore.toFixed(1)}/10`;
        }
        break;
      case 'quality-improved':
        message = `✅ Quality improved for pipeline *${pipeline.name}*`;
        color = 'good';
        if (execution.qualityScore !== undefined) {
          message += `\nQuality Score: ${execution.qualityScore.toFixed(1)}/10`;
        }
        break;
      case 'quality-degraded':
        message = `⚠️ Quality degraded for pipeline *${pipeline.name}*`;
        color = 'warning';
        if (execution.qualityScore !== undefined) {
          message += `\nQuality Score: ${execution.qualityScore.toFixed(1)}/10`;
        }
        break;
    }
    
    logger.info('Would send Slack notification', { event, pipeline: pipeline.name, message });
  }

  private async sendEmailNotification(
    config: any,
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    event: string
  ): Promise<void> {
    // Implementation would send email notification
    logger.info('Would send email notification', { event, pipeline: pipeline.name });
  }

  private async sendWebhookNotification(
    config: any,
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    event: string
  ): Promise<void> {
    // Implementation would send webhook notification
    logger.info('Would send webhook notification', { event, pipeline: pipeline.name });
  }

  private async sendPagerDutyNotification(
    config: any,
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    event: string
  ): Promise<void> {
    // Implementation would send PagerDuty notification
    logger.info('Would send PagerDuty notification', { event, pipeline: pipeline.name });
  }

  // Database operations
  private async saveExecution(execution: PipelineExecution): Promise<void> {
    await Database.query(
      `INSERT INTO pipeline_executions (id, pipeline_id, status, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [execution.id, execution.pipelineId, execution.status, JSON.stringify(execution)]
    );
  }

  private async updateExecution(execution: PipelineExecution): Promise<void> {
    await Database.query(
      `UPDATE pipeline_executions 
       SET status = $2, data = $3, updated_at = NOW()
       WHERE id = $1`,
      [execution.id, execution.status, JSON.stringify(execution)]
    );
  }

  public async getExecution(executionId: string): Promise<PipelineExecution | null> {
    const cached = this.executions.get(executionId);
    if (cached) return cached;
    
    const result = await Database.query(
      'SELECT data FROM pipeline_executions WHERE id = $1',
      [executionId]
    );
    
    if (result.rows.length === 0) return null;
    
    const execution = result.rows[0].data;
    this.executions.set(executionId, execution);
    return execution;
  }

  public async listExecutions(pipelineId?: string): Promise<PipelineExecution[]> {
    const query = pipelineId
      ? 'SELECT data FROM pipeline_executions WHERE pipeline_id = $1 ORDER BY created_at DESC'
      : 'SELECT data FROM pipeline_executions ORDER BY created_at DESC';
    
    const params = pipelineId ? [pipelineId] : [];
    const result = await Database.query(query, params);
    
    return result.rows.map(row => row.data);
  }

  public async cancelExecution(executionId: string): Promise<void> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }
    
    if (execution.status !== 'running' && execution.status !== 'pending') {
      throw new Error(`Cannot cancel execution in ${execution.status} status`);
    }
    
    execution.status = 'cancelled';
    execution.endTime = new Date();
    
    await this.updateExecution(execution);
    logger.info('Cancelled pipeline execution', { executionId });
  }
}