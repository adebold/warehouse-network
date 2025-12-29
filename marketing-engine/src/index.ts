import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

import { Database, getDatabase } from './config/database';
import { RedisClient, getRedis } from './config/redis';
import { createLogger, correlationMiddleware } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { AuthService, createAuthMiddleware } from './middleware/auth';
import { ContentManager } from './core/ContentManager';
import { ChannelPublisher } from './core/ChannelPublisher';
import { AnalyticsCollector } from './core/AnalyticsCollector';
import { KPICalculator } from './core/KPICalculator';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const logger = createLogger('MarketingEngine');

export class MarketingEngine {
  private app: Express;
  private server: any;
  private io: SocketIOServer;
  private db!: Database;
  private redis!: RedisClient;
  private authService!: AuthService;
  private contentManager!: ContentManager;
  private channelPublisher!: ChannelPublisher;
  private analyticsCollector!: AnalyticsCollector;
  private kpiCalculator!: KPICalculator;
  private telemetry?: opentelemetry.NodeSDK;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        methods: ['GET', 'POST']
      }
    });
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Marketing Engine');

    // Initialize telemetry if enabled
    if (process.env.OPENTELEMETRY_ENABLED === 'true') {
      this.initializeTelemetry();
    }

    // Initialize database and Redis
    await this.initializeDataStores();

    // Initialize core services
    await this.initializeServices();

    // Setup middleware
    this.setupMiddleware();

    // Setup routes
    this.setupRoutes();

    // Setup WebSocket handlers
    this.setupWebSocketHandlers();

    // Setup error handlers (must be last)
    this.setupErrorHandlers();

    logger.info('Marketing Engine initialized successfully');
  }

  async start(): Promise<void> {
    const port = process.env.PORT || 3000;

    // Start background jobs
    this.startBackgroundJobs();

    this.server.listen(port, () => {
      logger.info(`Marketing Engine running on port ${port}`);
    });
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Marketing Engine');

    // Close WebSocket connections
    this.io.close();

    // Close server
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });

    // Close analytics collector
    await this.analyticsCollector.close();

    // Close data stores
    await this.redis.close();
    await this.db.close();

    // Shutdown telemetry
    if (this.telemetry) {
      await this.telemetry.shutdown();
    }

    logger.info('Marketing Engine shutdown complete');
  }

  private initializeTelemetry(): void {
    const prometheusExporter = new PrometheusExporter({
      port: parseInt(process.env.METRICS_PORT || '9090'),
      endpoint: '/metrics'
    }, () => {
      logger.info(`Prometheus metrics available at http://localhost:${process.env.METRICS_PORT || '9090'}/metrics`);
    });

    this.telemetry = new opentelemetry.NodeSDK({
      metricReader: new PeriodicExportingMetricReader({
        exporter: prometheusExporter,
        exportIntervalMillis: 10000
      }),
      instrumentations: [getNodeAutoInstrumentations()]
    });

    this.telemetry.start();
  }

  private async initializeDataStores(): Promise<void> {
    // Initialize database
    this.db = getDatabase({
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT!),
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      ssl: process.env.DB_SSL === 'true',
      max: parseInt(process.env.DB_POOL_SIZE || '20')
    });

    await this.db.connect();

    // Initialize Redis
    this.redis = getRedis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_TLS === 'true'
    });

    // Test Redis connection
    const redisHealthy = await this.redis.healthCheck();
    if (!redisHealthy) {
      throw new Error('Failed to connect to Redis');
    }
  }

  private async initializeServices(): Promise<void> {
    // Initialize auth service
    this.authService = new AuthService(this.db, this.redis);

    // Initialize core services
    this.contentManager = new ContentManager(this.db, this.redis);
    this.channelPublisher = new ChannelPublisher(this.db, this.redis);
    this.analyticsCollector = new AnalyticsCollector(this.db, this.redis, {
      batchSize: parseInt(process.env.ANALYTICS_BATCH_SIZE || '100'),
      flushInterval: parseInt(process.env.ANALYTICS_FLUSH_INTERVAL || '5000'),
      enableStreaming: true
    });
    this.kpiCalculator = new KPICalculator(this.db, this.redis);

    // Initialize analytics collector
    await this.analyticsCollector.initialize();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Correlation ID
    this.app.use(correlationMiddleware);

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false
    });

    this.app.use('/api/', limiter);

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Request received', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      next();
    });
  }

  private setupRoutes(): void {
    const authMiddleware = createAuthMiddleware(this.authService);

    // Health check endpoints
    this.app.get('/health', async (req, res) => {
      const dbHealthy = await this.db.healthCheck();
      const redisHealthy = await this.redis.healthCheck();

      const status = dbHealthy && redisHealthy ? 'healthy' : 'unhealthy';
      const statusCode = status === 'healthy' ? 200 : 503;

      res.status(statusCode).json({
        status,
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealthy ? 'healthy' : 'unhealthy',
          redis: redisHealthy ? 'healthy' : 'unhealthy'
        },
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    this.app.get('/ready', async (req, res) => {
      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString()
      });
    });

    // API routes will be added here
    this.app.get('/api/v1', (req, res) => {
      res.json({
        name: 'Marketing Engine API',
        version: '1.0.0',
        endpoints: {
          auth: '/api/v1/auth',
          content: '/api/v1/content',
          channels: '/api/v1/channels',
          analytics: '/api/v1/analytics',
          kpis: '/api/v1/kpis'
        }
      });
    });

    // Mount route modules (to be implemented)
    // this.app.use('/api/v1/auth', authRoutes);
    // this.app.use('/api/v1/content', authMiddleware, contentRoutes);
    // this.app.use('/api/v1/channels', authMiddleware, channelRoutes);
    // this.app.use('/api/v1/analytics', authMiddleware, analyticsRoutes);
    // this.app.use('/api/v1/kpis', authMiddleware, kpiRoutes);
  }

  private setupWebSocketHandlers(): void {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        const user = await this.authService.verifyToken(token);
        socket.data.user = user;
        next();
      } catch (err) {
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.data.user.id;
      logger.info('WebSocket connection established', { userId });

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Handle real-time analytics
      socket.on('subscribe:analytics', (channelId) => {
        socket.join(`analytics:${channelId}`);
      });

      // Handle content updates
      socket.on('subscribe:content', (contentId) => {
        socket.join(`content:${contentId}`);
      });

      socket.on('disconnect', () => {
        logger.info('WebSocket connection closed', { userId });
      });
    });

    // Stream analytics events
    this.analyticsCollector.on('event', (event) => {
      this.io.to(`analytics:${event.channelId}`).emit('analytics:event', event);
    });
  }

  private setupErrorHandlers(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  private startBackgroundJobs(): void {
    // Retry failed publish jobs every 5 minutes
    setInterval(async () => {
      try {
        await this.channelPublisher.retryFailed();
      } catch (error) {
        logger.error('Failed to retry publish jobs', error);
      }
    }, 300000);

    // Aggregate analytics metrics every hour
    setInterval(async () => {
      try {
        await this.analyticsCollector.aggregateMetrics('hour');
      } catch (error) {
        logger.error('Failed to aggregate metrics', error);
      }
    }, 3600000);

    // Clean up old sessions every day
    setInterval(async () => {
      try {
        await this.db.query(`
          DELETE FROM refresh_tokens 
          WHERE expires_at < CURRENT_TIMESTAMP OR revoked = true
        `);
      } catch (error) {
        logger.error('Failed to clean up sessions', error);
      }
    }, 86400000);
  }

  // Getters for testing and external access
  getApp(): Express {
    return this.app;
  }

  getServices() {
    return {
      auth: this.authService,
      content: this.contentManager,
      publisher: this.channelPublisher,
      analytics: this.analyticsCollector,
      kpi: this.kpiCalculator
    };
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const engine = new MarketingEngine();

  // Handle graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown`);
    await engine.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', reason as any);
    process.exit(1);
  });

  // Start the engine
  engine.initialize()
    .then(() => engine.start())
    .catch((error) => {
      logger.error('Failed to start Marketing Engine', error);
      process.exit(1);
    });
}

export default MarketingEngine;