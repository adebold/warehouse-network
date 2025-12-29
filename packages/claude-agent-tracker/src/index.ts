/**
 * @warehouse-network/claude-agent-tracker
 * Enterprise agent tracking and change management platform
 * 
 * Production-ready with PostgreSQL persistence, JWT authentication,
 * real-time monitoring, and comprehensive audit logging.
 */

// Export core components
export { agentManager, AgentManager } from './agents/manager.js';
export { db, Database, initializeDatabase } from './database/index.js';
export { redis, RedisCache } from './database/redis.js';
export { gitIntegration, GitIntegration } from './integrations/git.js';
export { authService, AuthService, authenticate, authorize, requirePermission } from './security/auth.js';
export { eventStreamer, EventStreamer } from './streaming/events.js';
export { logger, log, addRequestContext, addAgentContext } from './monitoring/logger.js';
export * as metrics from './monitoring/metrics.js';
export { 
  initializeTracing, 
  shutdownTracing, 
  traceAsync, 
  traceSync, 
  getTracer, 
  Trace,
  getTraceContext 
} from './monitoring/tracing.js';

// Export types
export * from './types/index.js';

// Export server
export { startServer } from './server.js';

// Export configuration
export { default as config } from './config/index.js';
export type { Config, DatabaseConfig, RedisConfig, MonitoringConfig, SecurityConfig } from './config/index.js';

// Export API routers for custom integration
export { apiRouter } from './api/index.js';
export { agentRoutes } from './api/agents.js';
export { taskRoutes } from './api/tasks.js';
export { changeRoutes } from './api/changes.js';
export { authRoutes } from './api/auth.js';
export { metricsRoutes } from './api/metrics.js';

// Version
export const version = '1.0.0';

// Initialize function
export async function initialize() {
  const { initializeDatabase: initDb, db: database } = await import('./database/index.js');
  const { redis: redisCache } = await import('./database/redis.js');
  const { gitIntegration: git } = await import('./integrations/git.js');
  const { authService: auth } = await import('./security/auth.js');
  const { eventStreamer: events } = await import('./streaming/events.js');
  const { agentManager: agents } = await import('./agents/manager.js');
  const { logger: log } = await import('./monitoring/logger.js');
  
  await initDb();
  await redisCache.connect();
  await git.initialize();
  
  log.info('Claude Agent Tracker initialized');
  
  return {
    agentManager: agents,
    db: database,
    redis: redisCache,
    gitIntegration: git,
    authService: auth,
    eventStreamer: events,
    logger: log
  };
}