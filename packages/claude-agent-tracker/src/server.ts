/**
 * Agent Tracker HTTP/WebSocket Server
 */

import { createServer } from 'http';
import { join } from 'path';

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import WebSocket from 'ws';


import { agentManager } from './agents/manager.js';
import { apiRouter } from './api/index.js';
import config, { validateConfig } from './config/index.js';
import { initializeDatabase, db } from './database/index.js';
import { redis } from './database/redis.js';
import { gitIntegration } from './integrations/git.js';
import { logger } from './monitoring/logger.js';
import { startMetricsServer } from './monitoring/metrics.js';
import { initializeTracing, shutdownTracing } from './monitoring/tracing.js';
import { eventStreamer } from './streaming/events.js';

export async function startServer(): Promise<void> {
  // Validate configuration
  validateConfig();

  // Initialize tracing
  initializeTracing();

  // Initialize database
  await initializeDatabase();
  await redis.connect();

  // Initialize git integration
  await gitIntegration.initialize();

  // Create Express app
  const app = express();
  const server = createServer(app);

  // Setup middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"]
      }
    }
  }));

  app.use(compression());
  app.use(cors(config.security.cors));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    skipSuccessfulRequests: config.security.rateLimit.skipSuccessfulRequests,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use('/api/', limiter);

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    });
    
    next();
  });

  // Health check endpoint
  app.get('/health', async (req, res) => {
    const [pgHealth, redisHealth] = await Promise.all([
      db.healthCheck().catch(() => false),
      redis.healthCheck().catch(() => false)
    ]);

    const healthy = pgHealth && redisHealth;
    const status = healthy ? 200 : 503;

    res.status(status).json({
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        postgres: pgHealth,
        redis: redisHealth
      }
    });
  });

  // API routes
  app.use('/api', apiRouter);

  // Static files (if you have a web UI)
  app.use(express.static(join(process.cwd(), 'public')));

  // WebSocket server for event streaming
  const wss = new WebSocket.Server({ server, path: '/ws' });
  eventStreamer.attachWebSocketServer(wss);

  // Error handling
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Express error handler', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method
    });

    res.status(err.status || 500).json({
      error: {
        message: config.env === 'production' ? 'Internal server error' : err.message,
        ...(config.env !== 'production' && { stack: err.stack })
      }
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: {
        message: 'Not found'
      }
    });
  });

  // Start metrics server
  startMetricsServer();

  // Start HTTP server
  server.listen(config.port, config.host, () => {
    logger.info('Claude Agent Tracker server started', {
      host: config.host,
      port: config.port,
      env: config.env,
      pid: process.pid
    });

    console.log(`
🚀 Claude Agent Tracker Server
================================
Environment: ${config.env}
Server: http://${config.host}:${config.port}
WebSocket: ws://${config.host}:${config.port}/ws
Metrics: http://localhost:${config.monitoring.prometheus.port}${config.monitoring.prometheus.path}
================================
    `);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close WebSocket connections
    await eventStreamer.shutdown();

    // Shutdown agent manager
    await agentManager.shutdown();

    // Close database connections
    await db.close();
    await redis.close();

    // Shutdown tracing
    await shutdownTracing();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Fatal: Uncaught exception', { error });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Fatal: Unhandled rejection', { reason, promise });
    process.exit(1);
  });
}