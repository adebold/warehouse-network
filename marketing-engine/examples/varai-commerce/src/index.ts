import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { register as prometheusRegister } from 'prom-client';
import tracer from 'dd-trace';

// Initialize Datadog APM
tracer.init({
  service: 'varai-marketing',
  env: process.env.NODE_ENV || 'development',
  version: process.env.APP_VERSION || '1.0.0',
  logInjection: true,
  profiling: true
});

// Import internal modules
import { config } from './config';
import { database } from './database';
import { redis } from './services/redis';
import { logger } from './services/logger';
import { queues } from './queues';
import { 
  authMiddleware, 
  errorHandler, 
  requestIdMiddleware,
  contextMiddleware 
} from './middleware';
import {
  campaignRouter,
  customerRouter,
  productRouter,
  automationRouter,
  analyticsRouter,
  webhookRouter,
  healthRouter
} from './routes';
import { startWorkers } from './workers';
import { initializeServices } from './services';

// Initialize Sentry
Sentry.init({
  dsn: config.monitoring.sentry.dsn,
  environment: config.monitoring.sentry.environment,
  tracesSampleRate: config.monitoring.sentry.tracesSampleRate,
  profilesSampleRate: config.monitoring.sentry.profilesSampleRate,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app: express() }),
  ],
});

export async function createApp(): Promise<Express> {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  app.use(cors({
    origin: config.server.cors.origin,
    credentials: config.server.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining']
  }));

  // Compression
  app.use(compression());

  // Request parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request ID middleware
  app.use(requestIdMiddleware);

  // Logging
  app.use(morgan('combined', {
    stream: { write: (message: string) => logger.info(message.trim()) }
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.server.rateLimit.windowMs,
    max: config.server.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', { 
        ip: req.ip, 
        path: req.path,
        userId: req.user?.id 
      });
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: res.getHeader('Retry-After')
      });
    }
  });
  app.use('/api/', limiter);

  // Sentry request handler
  app.use(Sentry.Handlers.requestHandler());

  // Context middleware
  app.use(contextMiddleware);

  // Health checks (no auth required)
  app.use('/health', healthRouter);

  // Prometheus metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheusRegister.contentType);
    res.end(await prometheusRegister.metrics());
  });

  // Bull Board for queue monitoring
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  
  createBullBoard({
    queues: Object.values(queues).map(queue => new BullMQAdapter(queue)),
    serverAdapter
  });
  
  app.use('/admin/queues', authMiddleware({ roles: ['admin'] }), serverAdapter.getRouter());

  // API routes
  app.use('/api/campaigns', authMiddleware(), campaignRouter);
  app.use('/api/customers', authMiddleware(), customerRouter);
  app.use('/api/products', authMiddleware(), productRouter);
  app.use('/api/automation', authMiddleware(), automationRouter);
  app.use('/api/analytics', authMiddleware(), analyticsRouter);
  
  // Webhook routes (custom auth)
  app.use('/webhooks', webhookRouter);

  // Sentry error handler
  app.use(Sentry.Handlers.errorHandler());

  // Global error handler
  app.use(errorHandler);

  return app;
}

async function startServer() {
  try {
    // Connect to databases
    await database.connect();
    await redis.connect();
    
    // Run migrations
    await database.migrate();
    
    // Initialize services
    await initializeServices();
    
    // Start background workers
    await startWorkers();
    
    // Create Express app
    const app = await createApp();
    
    // Start server
    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(`VarAI Marketing Engine started`, {
        host: config.server.host,
        port: config.server.port,
        environment: process.env.NODE_ENV,
        pid: process.pid
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown`);
      
      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Close queue connections
        await Promise.all(
          Object.values(queues).map(queue => queue.close())
        );
        logger.info('Queue connections closed');
        
        // Close database connections
        await database.disconnect();
        await redis.disconnect();
        logger.info('Database connections closed');
        
        // Exit
        process.exit(0);
      });
      
      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      Sentry.captureException(error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      Sentry.captureException(reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    Sentry.captureException(error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export { startServer };