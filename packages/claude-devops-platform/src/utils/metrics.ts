import { Registry, Counter, Gauge, Histogram, Summary } from 'prom-client';
import { logger } from './logger';

export interface MetricLabels {
  [key: string]: string | number;
}

export class MetricsCollector {
  private static registry: Registry;
  private static metrics: Map<string, any> = new Map();
  
  // Deployment metrics
  private static deploymentCounter: Counter;
  private static deploymentDuration: Histogram;
  private static activeDeployments: Gauge;
  
  // Pipeline metrics
  private static pipelineCounter: Counter;
  private static pipelineDuration: Histogram;
  private static pipelineStagesDuration: Histogram;
  
  // Kubernetes metrics
  private static k8sOperations: Counter;
  private static k8sOperationDuration: Histogram;
  private static podCount: Gauge;
  private static podRestarts: Counter;
  
  // Docker metrics
  private static dockerOperations: Counter;
  private static dockerBuildDuration: Histogram;
  private static dockerImageSize: Gauge;
  private static dockerPullDuration: Histogram;
  
  // GitHub metrics
  private static githubApiCalls: Counter;
  private static githubApiDuration: Histogram;
  private static githubRateLimit: Gauge;
  
  // Terraform metrics
  private static terraformOperations: Counter;
  private static terraformOperationDuration: Histogram;
  private static terraformResourceCount: Gauge;
  
  // Queue metrics
  private static queueJobsProcessed: Counter;
  private static queueJobsFailed: Counter;
  private static queueJobDuration: Histogram;
  private static queueLength: Gauge;
  
  // System metrics
  private static httpRequestDuration: Histogram;
  private static httpRequestTotal: Counter;
  private static errorTotal: Counter;
  private static databaseQueryDuration: Histogram;
  private static databaseConnectionPool: Gauge;
  
  static {
    MetricsCollector.initialize();
  }
  
  private static initialize(): void {
    MetricsCollector.registry = new Registry();
    
    // Deployment metrics
    MetricsCollector.deploymentCounter = new Counter({
      name: 'devops_deployments_total',
      help: 'Total number of deployments',
      labelNames: ['environment', 'application', 'status', 'strategy'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.deploymentDuration = new Histogram({
      name: 'devops_deployment_duration_seconds',
      help: 'Deployment duration in seconds',
      labelNames: ['environment', 'application', 'status'],
      buckets: [10, 30, 60, 120, 300, 600, 1200, 2400],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.activeDeployments = new Gauge({
      name: 'devops_active_deployments',
      help: 'Number of active deployments',
      labelNames: ['environment'],
      registers: [MetricsCollector.registry],
    });
    
    // Pipeline metrics
    MetricsCollector.pipelineCounter = new Counter({
      name: 'devops_pipelines_total',
      help: 'Total number of pipeline executions',
      labelNames: ['pipeline', 'status'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.pipelineDuration = new Histogram({
      name: 'devops_pipeline_duration_seconds',
      help: 'Pipeline execution duration in seconds',
      labelNames: ['pipeline', 'status'],
      buckets: [30, 60, 120, 300, 600, 1200, 2400, 3600],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.pipelineStagesDuration = new Histogram({
      name: 'devops_pipeline_stage_duration_seconds',
      help: 'Pipeline stage execution duration in seconds',
      labelNames: ['pipeline', 'stage', 'status'],
      buckets: [5, 10, 30, 60, 120, 300, 600],
      registers: [MetricsCollector.registry],
    });
    
    // Kubernetes metrics
    MetricsCollector.k8sOperations = new Counter({
      name: 'devops_k8s_operations_total',
      help: 'Total number of Kubernetes operations',
      labelNames: ['operation', 'status', 'namespace'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.k8sOperationDuration = new Histogram({
      name: 'devops_k8s_operation_duration_seconds',
      help: 'Kubernetes operation duration in seconds',
      labelNames: ['operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.podCount = new Gauge({
      name: 'devops_k8s_pod_count',
      help: 'Number of pods',
      labelNames: ['namespace', 'deployment', 'status'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.podRestarts = new Counter({
      name: 'devops_k8s_pod_restarts_total',
      help: 'Total number of pod restarts',
      labelNames: ['namespace', 'deployment', 'pod'],
      registers: [MetricsCollector.registry],
    });
    
    // Docker metrics
    MetricsCollector.dockerOperations = new Counter({
      name: 'devops_docker_operations_total',
      help: 'Total number of Docker operations',
      labelNames: ['operation', 'status'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.dockerBuildDuration = new Histogram({
      name: 'devops_docker_build_duration_seconds',
      help: 'Docker build duration in seconds',
      labelNames: ['repository', 'tag'],
      buckets: [10, 30, 60, 120, 300, 600, 1200],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.dockerImageSize = new Gauge({
      name: 'devops_docker_image_size_bytes',
      help: 'Docker image size in bytes',
      labelNames: ['repository', 'tag'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.dockerPullDuration = new Histogram({
      name: 'devops_docker_pull_duration_seconds',
      help: 'Docker pull duration in seconds',
      labelNames: ['repository', 'tag'],
      buckets: [1, 5, 10, 30, 60, 120, 300],
      registers: [MetricsCollector.registry],
    });
    
    // GitHub metrics
    MetricsCollector.githubApiCalls = new Counter({
      name: 'devops_github_api_calls_total',
      help: 'Total number of GitHub API calls',
      labelNames: ['endpoint', 'method', 'status'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.githubApiDuration = new Histogram({
      name: 'devops_github_api_duration_seconds',
      help: 'GitHub API call duration in seconds',
      labelNames: ['endpoint', 'method'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.githubRateLimit = new Gauge({
      name: 'devops_github_rate_limit_remaining',
      help: 'GitHub API rate limit remaining',
      registers: [MetricsCollector.registry],
    });
    
    // Terraform metrics
    MetricsCollector.terraformOperations = new Counter({
      name: 'devops_terraform_operations_total',
      help: 'Total number of Terraform operations',
      labelNames: ['operation', 'status', 'workspace'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.terraformOperationDuration = new Histogram({
      name: 'devops_terraform_operation_duration_seconds',
      help: 'Terraform operation duration in seconds',
      labelNames: ['operation', 'workspace'],
      buckets: [5, 10, 30, 60, 120, 300, 600, 1200],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.terraformResourceCount = new Gauge({
      name: 'devops_terraform_resource_count',
      help: 'Number of Terraform resources',
      labelNames: ['workspace', 'type'],
      registers: [MetricsCollector.registry],
    });
    
    // Queue metrics
    MetricsCollector.queueJobsProcessed = new Counter({
      name: 'devops_queue_jobs_processed_total',
      help: 'Total number of queue jobs processed',
      labelNames: ['queue', 'status'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.queueJobsFailed = new Counter({
      name: 'devops_queue_jobs_failed_total',
      help: 'Total number of queue jobs failed',
      labelNames: ['queue', 'reason'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.queueJobDuration = new Histogram({
      name: 'devops_queue_job_duration_seconds',
      help: 'Queue job processing duration in seconds',
      labelNames: ['queue'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.queueLength = new Gauge({
      name: 'devops_queue_length',
      help: 'Current queue length',
      labelNames: ['queue', 'status'],
      registers: [MetricsCollector.registry],
    });
    
    // System metrics
    MetricsCollector.httpRequestDuration = new Histogram({
      name: 'devops_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.httpRequestTotal = new Counter({
      name: 'devops_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.errorTotal = new Counter({
      name: 'devops_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'component'],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.databaseQueryDuration = new Histogram({
      name: 'devops_database_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [MetricsCollector.registry],
    });
    
    MetricsCollector.databaseConnectionPool = new Gauge({
      name: 'devops_database_connection_pool',
      help: 'Database connection pool metrics',
      labelNames: ['status'],
      registers: [MetricsCollector.registry],
    });
  }
  
  // Metric recording methods
  public static recordDeploymentOperation(operation: string, status: string, duration?: number): void {
    MetricsCollector.deploymentCounter.inc({ 
      environment: process.env.NODE_ENV || 'unknown',
      application: 'unknown',
      status,
      strategy: 'unknown',
    });
    
    if (duration) {
      MetricsCollector.deploymentDuration.observe(
        { environment: process.env.NODE_ENV || 'unknown', application: 'unknown', status },
        duration / 1000
      );
    }
  }
  
  public static recordPipelineOperation(operation: string, status: string, duration?: number): void {
    MetricsCollector.pipelineCounter.inc({ pipeline: 'unknown', status });
    
    if (duration) {
      MetricsCollector.pipelineDuration.observe(
        { pipeline: 'unknown', status },
        duration / 1000
      );
    }
  }
  
  public static recordKubernetesOperation(operation: string, status: string, duration?: number): void {
    MetricsCollector.k8sOperations.inc({ 
      operation, 
      status, 
      namespace: 'default',
    });
    
    if (duration) {
      MetricsCollector.k8sOperationDuration.observe({ operation }, duration / 1000);
    }
  }
  
  public static recordDockerOperation(operation: string, status: string, duration?: number): void {
    MetricsCollector.dockerOperations.inc({ operation, status });
    
    if (duration && operation === 'build') {
      MetricsCollector.dockerBuildDuration.observe(
        { repository: 'unknown', tag: 'unknown' },
        duration / 1000
      );
    } else if (duration && operation === 'pull') {
      MetricsCollector.dockerPullDuration.observe(
        { repository: 'unknown', tag: 'unknown' },
        duration / 1000
      );
    }
  }
  
  public static recordGitHubOperation(endpoint: string, status: string, duration?: number): void {
    MetricsCollector.githubApiCalls.inc({ 
      endpoint, 
      method: 'unknown', 
      status,
    });
    
    if (duration) {
      MetricsCollector.githubApiDuration.observe(
        { endpoint, method: 'unknown' },
        duration / 1000
      );
    }
  }
  
  public static recordTerraformOperation(operation: string, status: string, duration?: number): void {
    MetricsCollector.terraformOperations.inc({ 
      operation, 
      status, 
      workspace: 'default',
    });
    
    if (duration) {
      MetricsCollector.terraformOperationDuration.observe(
        { operation, workspace: 'default' },
        duration / 1000
      );
    }
  }
  
  public static recordQueueOperation(operation: string, queueName: string, count: number = 1): void {
    switch (operation) {
      case 'job_completed':
        MetricsCollector.queueJobsProcessed.inc({ queue: queueName, status: 'completed' }, count);
        break;
      case 'job_failed':
        MetricsCollector.queueJobsFailed.inc({ queue: queueName, reason: 'unknown' }, count);
        break;
      case 'job_added':
      case 'bulk_jobs_added':
        MetricsCollector.queueLength.inc({ queue: queueName, status: 'waiting' }, count);
        break;
      case 'job_active':
        MetricsCollector.queueLength.dec({ queue: queueName, status: 'waiting' });
        MetricsCollector.queueLength.inc({ queue: queueName, status: 'active' });
        break;
    }
  }
  
  public static recordHttpRequest(method: string, route: string, status: number, duration: number): void {
    const labels = { method, route, status: status.toString() };
    
    MetricsCollector.httpRequestTotal.inc(labels);
    MetricsCollector.httpRequestDuration.observe(labels, duration / 1000);
  }
  
  public static recordError(type: string, component: string): void {
    MetricsCollector.errorTotal.inc({ type, component });
  }
  
  public static recordDatabaseQuery(operation: string, table: string, duration: number): void {
    MetricsCollector.databaseQueryDuration.observe(
      { operation, table },
      duration / 1000
    );
  }
  
  // Update gauge values
  public static updateActiveDeployments(environment: string, count: number): void {
    MetricsCollector.activeDeployments.set({ environment }, count);
  }
  
  public static updatePodCount(namespace: string, deployment: string, status: string, count: number): void {
    MetricsCollector.podCount.set({ namespace, deployment, status }, count);
  }
  
  public static updateQueueLength(queue: string, status: string, length: number): void {
    MetricsCollector.queueLength.set({ queue, status }, length);
  }
  
  public static updateGitHubRateLimit(remaining: number): void {
    MetricsCollector.githubRateLimit.set(remaining);
  }
  
  public static updateDatabaseConnectionPool(status: string, count: number): void {
    MetricsCollector.databaseConnectionPool.set({ status }, count);
  }
  
  // Get metrics
  public static async getMetrics(): Promise<string> {
    return MetricsCollector.registry.metrics();
  }
  
  public static getContentType(): string {
    return MetricsCollector.registry.contentType;
  }
  
  // Start collection of system metrics
  public static startCollection(): void {
    // Collect process metrics every 10 seconds
    setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        MetricsCollector.metrics.set('process_memory_heap_used', memUsage.heapUsed);
        MetricsCollector.metrics.set('process_memory_heap_total', memUsage.heapTotal);
        MetricsCollector.metrics.set('process_memory_rss', memUsage.rss);
        MetricsCollector.metrics.set('process_memory_external', memUsage.external);
        
        const cpuUsage = process.cpuUsage();
        MetricsCollector.metrics.set('process_cpu_user', cpuUsage.user);
        MetricsCollector.metrics.set('process_cpu_system', cpuUsage.system);
      } catch (error) {
        logger.error('Failed to collect process metrics:', error instanceof Error ? error : new Error(String(error)));
      }
    }, 10000);
    
    logger.info('Metrics collection started');
  }
  
  // Custom metric registration
  public static registerCustomMetric(name: string, metric: any): void {
    MetricsCollector.registry.registerMetric(metric);
    MetricsCollector.metrics.set(name, metric);
  }
  
  // Get specific metric
  public static getMetric(name: string): any {
    return MetricsCollector.metrics.get(name);
  }
}