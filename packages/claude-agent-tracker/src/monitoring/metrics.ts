/**
 * Prometheus metrics collection
 */

import express from 'express';
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

import config from '../config/index.js';

import { logger } from './logger.js';

// Create metrics registry
export const register = new Registry();

// Enable default metrics collection
collectDefaultMetrics({ register });

// Agent metrics
export const agentsTotal = new Gauge({
  name: 'claude_agents_total',
  help: 'Total number of agents by status',
  labelNames: ['status', 'type'],
  registers: [register]
});

export const agentSpawnDuration = new Histogram({
  name: 'claude_agent_spawn_duration_seconds',
  help: 'Time taken to spawn an agent',
  labelNames: ['type', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const agentLifetime = new Histogram({
  name: 'claude_agent_lifetime_seconds',
  help: 'Lifetime of agents',
  labelNames: ['type'],
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400],
  registers: [register]
});

// Task metrics
export const tasksTotal = new Counter({
  name: 'claude_tasks_total',
  help: 'Total number of tasks processed',
  labelNames: ['agent_type', 'task_type', 'status'],
  registers: [register]
});

export const taskDuration = new Histogram({
  name: 'claude_task_duration_seconds',
  help: 'Duration of task execution',
  labelNames: ['agent_type', 'task_type', 'status'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

export const taskQueueSize = new Gauge({
  name: 'claude_task_queue_size',
  help: 'Number of tasks in queue',
  labelNames: ['priority'],
  registers: [register]
});

// Change tracking metrics
export const changesTotal = new Counter({
  name: 'claude_changes_total',
  help: 'Total number of changes tracked',
  labelNames: ['type', 'agent_type'],
  registers: [register]
});

export const changeSize = new Histogram({
  name: 'claude_change_size_bytes',
  help: 'Size of changes in bytes',
  labelNames: ['type'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register]
});

// Resource metrics
export const agentCpuUsage = new Gauge({
  name: 'claude_agent_cpu_usage_percent',
  help: 'CPU usage percentage by agent',
  labelNames: ['agent_id', 'agent_type'],
  registers: [register]
});

export const agentMemoryUsage = new Gauge({
  name: 'claude_agent_memory_usage_bytes',
  help: 'Memory usage in bytes by agent',
  labelNames: ['agent_id', 'agent_type'],
  registers: [register]
});

export const agentNetworkIO = new Counter({
  name: 'claude_agent_network_io_bytes',
  help: 'Network I/O in bytes',
  labelNames: ['agent_id', 'agent_type', 'direction'],
  registers: [register]
});

// Error metrics
export const errorsTotal = new Counter({
  name: 'claude_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'agent_type'],
  registers: [register]
});

// API metrics
export const apiRequestsTotal = new Counter({
  name: 'claude_api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'endpoint', 'status_code'],
  registers: [register]
});

export const apiRequestDuration = new Histogram({
  name: 'claude_api_request_duration_seconds',
  help: 'API request duration',
  labelNames: ['method', 'endpoint', 'status_code'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

// Database metrics
export const dbQueryDuration = new Histogram({
  name: 'claude_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

export const dbConnectionsActive = new Gauge({
  name: 'claude_db_connections_active',
  help: 'Number of active database connections',
  registers: [register]
});

// Redis metrics
export const redisCmdDuration = new Histogram({
  name: 'claude_redis_cmd_duration_seconds',
  help: 'Redis command duration',
  labelNames: ['command'],
  buckets: [0.0001, 0.001, 0.01, 0.05, 0.1],
  registers: [register]
});

export const redisConnectionsActive = new Gauge({
  name: 'claude_redis_connections_active',
  help: 'Number of active Redis connections',
  registers: [register]
});

// Custom metrics helper
export function recordAgentMetrics(agent: any): void {
  agentCpuUsage.set(
    { agent_id: agent.id, agent_type: agent.type },
    agent.resources.cpu
  );
  
  agentMemoryUsage.set(
    { agent_id: agent.id, agent_type: agent.type },
    agent.resources.memory
  );
  
  agentNetworkIO.inc(
    { agent_id: agent.id, agent_type: agent.type, direction: 'in' },
    agent.resources.network.bytesIn
  );
  
  agentNetworkIO.inc(
    { agent_id: agent.id, agent_type: agent.type, direction: 'out' },
    agent.resources.network.bytesOut
  );
}

// Metrics endpoint middleware
export function createMetricsEndpoint(): express.RequestHandler {
  return async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      logger.error('Error collecting metrics:', error);
      res.status(500).end();
    }
  };
}

// Start metrics server if configured
export function startMetricsServer(): void {
  if (!config.monitoring.prometheus.enabled) {
    logger.info('Prometheus metrics disabled');
    return;
  }

  const app = express();
  
  app.get(config.monitoring.prometheus.path, createMetricsEndpoint());
  
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
  });
  
  const server = app.listen(config.monitoring.prometheus.port, () => {
    logger.info('Prometheus metrics server started', {
      port: config.monitoring.prometheus.port,
      path: config.monitoring.prometheus.path
    });
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    server.close(() => {
      logger.info('Metrics server closed');
    });
  });
}