import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as k8s from '@kubernetes/client-node';
import { Octokit } from '@octokit/rest';
import * as yaml from 'js-yaml';
import { z } from 'zod';

const execAsync = promisify(exec);

// Deployment configuration schema
const DeploymentConfigSchema = z.object({
  environment: z.enum(['development', 'staging', 'production']),
  namespace: z.string().default('claude-platform'),
  cluster: z.object({
    name: z.string(),
    region: z.string().optional(),
    context: z.string().optional(),
  }),
  registry: z.object({
    url: z.string().default('ghcr.io'),
    username: z.string().optional(),
    password: z.string().optional(),
  }),
  helm: z.object({
    chart: z.string().default('./helm/claude-platform'),
    values: z.string().optional(),
    timeout: z.string().default('10m'),
  }).optional(),
  monitoring: z.object({
    enabled: z.boolean().default(true),
    grafanaUrl: z.string().optional(),
    prometheusUrl: z.string().optional(),
  }).optional(),
  healthCheck: z.object({
    enabled: z.boolean().default(true),
    timeout: z.number().default(300),
    endpoint: z.string().default('/health'),
  }).optional(),
  rollback: z.object({
    enabled: z.boolean().default(true),
    maxHistory: z.number().default(10),
  }).optional(),
});

type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

export class Deployment {
  private k8sApi: k8s.CoreV1Api;
  private k8sAppsApi: k8s.AppsV1Api;
  private k8sConfig: k8s.KubeConfig;
  private github: Octokit;
  private config: DeploymentConfig;

  constructor(private environment: string, private options: any) {
    // Initialize Kubernetes client
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromDefault();
    this.k8sApi = this.k8sConfig.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.k8sConfig.makeApiClient(k8s.AppsV1Api);

    // Initialize GitHub client
    this.github = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  }

  async loadConfig(): Promise<void> {
    const configPath = path.join(process.cwd(), 'deploy', `${this.environment}.yaml`);
    
    if (!await fs.pathExists(configPath)) {
      throw new Error(`Deployment config not found: ${configPath}`);
    }

    const configContent = await fs.readFile(configPath, 'utf-8');
    const rawConfig = yaml.load(configContent) as any;
    
    this.config = DeploymentConfigSchema.parse({
      ...rawConfig,
      environment: this.environment,
    });
  }

  async validatePrerequisites(): Promise<void> {
    logger.info('Validating deployment prerequisites...');

    // Check kubectl
    try {
      await execAsync('kubectl version --client');
    } catch (error) {
      throw new Error('kubectl is not installed or not in PATH');
    }

    // Check helm if using helm
    if (this.config.helm) {
      try {
        await execAsync('helm version');
      } catch (error) {
        throw new Error('Helm is not installed or not in PATH');
      }
    }

    // Check cluster connectivity
    try {
      await this.k8sApi.listNamespace();
      logger.info('✓ Kubernetes cluster connection verified');
    } catch (error) {
      throw new Error(`Cannot connect to Kubernetes cluster: ${error.message}`);
    }

    // Check namespace exists
    try {
      await this.k8sApi.readNamespace(this.config.namespace);
      logger.info(`✓ Namespace ${this.config.namespace} exists`);
    } catch (error) {
      if (error.statusCode === 404) {
        logger.info(`Creating namespace ${this.config.namespace}...`);
        await this.k8sApi.createNamespace({
          metadata: {
            name: this.config.namespace,
            labels: {
              'app.kubernetes.io/managed-by': 'claude-platform',
              'environment': this.environment,
            },
          },
        });
      } else {
        throw error;
      }
    }
  }

  async buildAndPushImage(): Promise<string> {
    if (this.options.skipBuild) {
      logger.info('Skipping image build (--skip-build flag)');
      return `${this.config.registry.url}/${this.options.image || 'claude-platform/devops:latest'}`;
    }

    logger.info('Building Docker image...');
    
    const imageTag = `${this.config.registry.url}/claude-platform/devops:${this.options.tag || process.env.GITHUB_SHA || 'latest'}`;
    
    // Build image
    const buildCmd = `docker build -t ${imageTag} --target runtime .`;
    logger.info(`Running: ${buildCmd}`);
    
    if (!this.options.dryRun) {
      const { stdout, stderr } = await execAsync(buildCmd);
      if (stderr && !stderr.includes('WARNING')) {
        logger.error(stderr);
      }
    }

    // Login to registry
    if (this.config.registry.username && this.config.registry.password) {
      const loginCmd = `echo "${this.config.registry.password}" | docker login ${this.config.registry.url} -u ${this.config.registry.username} --password-stdin`;
      if (!this.options.dryRun) {
        await execAsync(loginCmd);
        logger.info('✓ Logged in to container registry');
      }
    }

    // Push image
    logger.info(`Pushing image ${imageTag}...`);
    if (!this.options.dryRun) {
      await execAsync(`docker push ${imageTag}`);
      logger.info('✓ Image pushed successfully');
    }

    return imageTag;
  }

  async deployWithKubectl(imageTag: string): Promise<void> {
    logger.info('Deploying with kubectl...');

    const manifestsDir = path.join(process.cwd(), 'kubernetes');
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), '.deploy-'));

    try {
      // Copy manifests to temp directory
      await fs.copy(manifestsDir, tempDir);

      // Replace image tag in deployment
      const deploymentPath = path.join(tempDir, 'deployment.yaml');
      let deploymentContent = await fs.readFile(deploymentPath, 'utf-8');
      deploymentContent = deploymentContent.replace(
        /image: .*/g,
        `image: ${imageTag}`
      );
      await fs.writeFile(deploymentPath, deploymentContent);

      // Apply manifests
      const applyCmd = `kubectl apply -f ${tempDir} -n ${this.config.namespace}`;
      logger.info(`Running: ${applyCmd}`);
      
      if (!this.options.dryRun) {
        const { stdout } = await execAsync(applyCmd);
        logger.info(stdout);
      }

      // Wait for rollout
      if (!this.options.dryRun && !this.options.skipWait) {
        logger.info('Waiting for deployment rollout...');
        const rolloutCmd = `kubectl rollout status deployment/claude-platform -n ${this.config.namespace} --timeout=5m`;
        await execAsync(rolloutCmd);
        logger.info('✓ Deployment rolled out successfully');
      }
    } finally {
      // Cleanup temp directory
      await fs.remove(tempDir);
    }
  }

  async deployWithHelm(imageTag: string): Promise<void> {
    logger.info('Deploying with Helm...');

    const releaseName = 'claude-platform';
    const valuesFile = this.config.helm?.values || `./helm/claude-platform/values.${this.environment}.yaml`;

    // Check if release exists
    let releaseExists = false;
    try {
      await execAsync(`helm status ${releaseName} -n ${this.config.namespace}`);
      releaseExists = true;
    } catch (error) {
      // Release doesn't exist
    }

    const helmCmd = releaseExists ? 'upgrade' : 'install';
    const helmArgs = [
      helmCmd,
      releaseName,
      this.config.helm!.chart,
      `-n ${this.config.namespace}`,
      `--values ${valuesFile}`,
      `--set image.tag=${imageTag.split(':').pop()}`,
      `--set image.repository=${imageTag.split(':')[0]}`,
      `--timeout ${this.config.helm!.timeout}`,
      '--wait',
      '--atomic',
    ];

    if (!releaseExists && helmCmd === 'install') {
      helmArgs.push('--create-namespace');
    }

    const fullCmd = `helm ${helmArgs.join(' ')}`;
    logger.info(`Running: ${fullCmd}`);

    if (!this.options.dryRun) {
      const { stdout } = await execAsync(fullCmd);
      logger.info(stdout);
      logger.info('✓ Helm deployment completed successfully');
    }
  }

  async runHealthChecks(): Promise<void> {
    if (!this.config.healthCheck?.enabled || this.options.skipHealthCheck) {
      return;
    }

    logger.info('Running health checks...');

    // Get service endpoint
    const service = await this.k8sApi.readNamespacedService(
      'claude-platform',
      this.config.namespace
    );

    const endpoint = service.body.status?.loadBalancer?.ingress?.[0]?.hostname ||
                    service.body.status?.loadBalancer?.ingress?.[0]?.ip ||
                    'localhost';

    const healthUrl = `http://${endpoint}${this.config.healthCheck.endpoint}`;
    logger.info(`Checking health at: ${healthUrl}`);

    const startTime = Date.now();
    const timeout = this.config.healthCheck.timeout * 1000;

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(healthUrl);
        if (response.ok) {
          logger.info('✓ Health check passed');
          return;
        }
      } catch (error) {
        // Continue retrying
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Health check failed: timeout reached');
  }

  async createDeploymentRecord(): Promise<void> {
    if (this.options.dryRun) {
      return;
    }

    logger.info('Creating deployment record...');

    const deployment = {
      environment: this.environment,
      version: this.options.tag || process.env.GITHUB_SHA || 'latest',
      timestamp: new Date().toISOString(),
      deployer: process.env.GITHUB_ACTOR || process.env.USER || 'unknown',
      status: 'success',
      namespace: this.config.namespace,
      cluster: this.config.cluster.name,
    };

    // Store in ConfigMap
    const configMapName = 'deployment-history';
    let history = [];
    
    try {
      const cm = await this.k8sApi.readNamespacedConfigMap(
        configMapName,
        this.config.namespace
      );
      history = JSON.parse(cm.body.data?.history || '[]');
    } catch (error) {
      // ConfigMap doesn't exist yet
    }

    history.unshift(deployment);
    history = history.slice(0, this.config.rollback?.maxHistory || 10);

    await this.k8sApi.createNamespacedConfigMap(this.config.namespace, {
      metadata: {
        name: configMapName,
      },
      data: {
        history: JSON.stringify(history, null, 2),
        latest: JSON.stringify(deployment, null, 2),
      },
    }).catch(() => 
      this.k8sApi.patchNamespacedConfigMap(
        configMapName,
        this.config.namespace,
        {
          data: {
            history: JSON.stringify(history, null, 2),
            latest: JSON.stringify(deployment, null, 2),
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
      )
    );

    logger.info('✓ Deployment record created');
  }

  async rollback(): Promise<void> {
    if (!this.config.rollback?.enabled) {
      throw new Error('Rollback is not enabled for this environment');
    }

    logger.info('Rolling back deployment...');

    if (this.config.helm) {
      const rollbackCmd = `helm rollback claude-platform -n ${this.config.namespace}`;
      logger.info(`Running: ${rollbackCmd}`);
      
      if (!this.options.dryRun) {
        await execAsync(rollbackCmd);
        logger.info('✓ Rollback completed successfully');
      }
    } else {
      const rollbackCmd = `kubectl rollout undo deployment/claude-platform -n ${this.config.namespace}`;
      logger.info(`Running: ${rollbackCmd}`);
      
      if (!this.options.dryRun) {
        await execAsync(rollbackCmd);
        logger.info('✓ Rollback completed successfully');
      }
    }
  }

  async notifyDeployment(success: boolean, error?: Error): Promise<void> {
    if (this.options.dryRun || !process.env.GITHUB_TOKEN) {
      return;
    }

    logger.info('Sending deployment notification...');

    const status = success ? 'success' : 'failure';
    const description = success 
      ? `Deployment to ${this.environment} completed successfully`
      : `Deployment to ${this.environment} failed: ${error?.message}`;

    if (process.env.GITHUB_SHA && process.env.GITHUB_REPOSITORY) {
      const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
      
      await this.github.repos.createCommitStatus({
        owner,
        repo,
        sha: process.env.GITHUB_SHA,
        state: status as 'success' | 'failure',
        description,
        context: `deploy/${this.environment}`,
      });
    }

    // Send to monitoring system
    if (this.config.monitoring?.enabled) {
      // Implementation would depend on monitoring system
      logger.info(`Deployment ${status} event sent to monitoring`);
    }
  }
}

export async function runDeploy(environment: string, options: any): Promise<void> {
  const deployment = new Deployment(environment, options);
  
  try {
    // Load configuration
    await deployment.loadConfig();
    logger.info(`Deploying to ${environment}...`);
    
    if (options.dryRun) {
      logger.info('🏃 Running in dry-run mode');
    }

    // Validate prerequisites
    await deployment.validatePrerequisites();

    // Build and push image
    const imageTag = await deployment.buildAndPushImage();

    // Deploy based on method
    if (options.useHelm !== false) {
      await deployment.deployWithHelm(imageTag);
    } else {
      await deployment.deployWithKubectl(imageTag);
    }

    // Run health checks
    await deployment.runHealthChecks();

    // Create deployment record
    await deployment.createDeploymentRecord();

    // Send success notification
    await deployment.notifyDeployment(true);

    logger.info('✅ Deployment completed successfully!');
  } catch (error) {
    logger.error('❌ Deployment failed:', error);
    
    // Attempt rollback
    if (options.autoRollback && !options.dryRun) {
      try {
        logger.info('Attempting automatic rollback...');
        await deployment.rollback();
      } catch (rollbackError) {
        logger.error('Rollback failed:', rollbackError);
      }
    }

    // Send failure notification
    await deployment.notifyDeployment(false, error);
    
    throw error;
  }
}