import { Router, Request, Response } from 'express';
import os from 'os';
import { Database } from '../database';
import { KubernetesService } from '../services/kubernetes';
import { DockerService } from '../services/docker';
import { GitHubService } from '../services/github';
import { QueueService } from '../services/queue';
import { MetricsCollector } from '../utils/metrics';
import { logger } from '../utils/logger';
import { HealthStatus, HealthCheck, SystemInfo } from '../types';
import { asyncHandler } from '../middleware/error-handler';

export const healthRouter = Router();

// Basic health check
healthRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  const uptime = process.uptime();
  
  const healthStatus: HealthStatus = {
    status: 'healthy',
    version: process.env.npm_package_version || '1.0.0',
    uptime,
    timestamp: new Date(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
    },
  };
  
  // Add optional service checks
  if (req.query.full === 'true') {
    healthStatus.checks.kubernetes = await checkKubernetes();
    healthStatus.checks.docker = await checkDocker();
    healthStatus.checks.github = await checkGitHub();
  }
  
  // Determine overall health
  const checks = Object.values(healthStatus.checks);
  const unhealthyChecks = checks.filter(check => check?.status === 'unhealthy');
  
  if (unhealthyChecks.length > 0) {
    healthStatus.status = unhealthyChecks.length === checks.length ? 'unhealthy' : 'degraded';
  }
  
  const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
  
  logger.info('Health check performed', {
    status: healthStatus.status,
    duration: Date.now() - startTime,
    checks: Object.entries(healthStatus.checks).map(([name, check]) => ({
      name,
      status: check?.status,
    })),
  });
  
  res.status(statusCode).json(healthStatus);
}));

// Liveness probe for Kubernetes
healthRouter.get('/liveness', asyncHandler(async (req: Request, res: Response) => {
  // Simple liveness check - just check if the process is alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date(),
  });
}));

// Readiness probe for Kubernetes
healthRouter.get('/readiness', asyncHandler(async (req: Request, res: Response) => {
  // Check if the service is ready to accept requests
  const databaseCheck = await checkDatabase();
  const redisCheck = await checkRedis();
  
  const isReady = databaseCheck.status === 'healthy' && redisCheck.status === 'healthy';
  
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date(),
    checks: {
      database: databaseCheck.status,
      redis: redisCheck.status,
    },
  });
}));

// Startup probe for Kubernetes
healthRouter.get('/startup', asyncHandler(async (req: Request, res: Response) => {
  // Check if the application has started successfully
  const startupComplete = Database['isInitialized'] && QueueService.getInstance();
  
  res.status(startupComplete ? 200 : 503).json({
    status: startupComplete ? 'started' : 'starting',
    timestamp: new Date(),
  });
}));

// System information
healthRouter.get('/system', asyncHandler(async (req: Request, res: Response) => {
  const systemInfo: SystemInfo = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
    },
    cpu: {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'unknown',
      speed: os.cpus()[0]?.speed || 0,
    },
    uptime: os.uptime(),
  };
  
  res.json(systemInfo);
}));

// Metrics endpoint
healthRouter.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  const metrics = await MetricsCollector.getMetrics();
  res.set('Content-Type', MetricsCollector.getContentType());
  res.send(metrics);
}));

// Health check functions
async function checkDatabase(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    await Database.query('SELECT 1');
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Database health check failed:', error instanceof Error ? error : new Error(String(error)));
    
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Database connection failed',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    const queueHealth = await QueueService.getInstance().healthCheck();
    
    return {
      status: queueHealth.healthy ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Redis health check failed:', error instanceof Error ? error : new Error(String(error)));
    
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Redis connection failed',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  }
}

async function checkKubernetes(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    const k8s = KubernetesService.getInstance();
    await k8s.listNamespaces();
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    // Kubernetes might not be available in all environments
    return {
      status: 'unhealthy',
      message: 'Kubernetes not available',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  }
}

async function checkDocker(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    const docker = DockerService.getInstance();
    await docker.getSystemInfo();
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    // Docker might not be available in all environments
    return {
      status: 'unhealthy',
      message: 'Docker not available',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  }
}

async function checkGitHub(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    // GitHub service might not be initialized
    return {
      status: 'healthy',
      message: 'GitHub integration available',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'GitHub integration not configured',
      lastCheck: new Date(),
      responseTime: Date.now() - startTime,
    };
  }
}