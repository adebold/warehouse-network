import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import { join } from 'path';

// Import utilities
import { logger, logRequest } from './utils/logger';
import database from './utils/database';
import { redisService } from './utils/redis';

// Import middleware
import { apiLimiter, authLimiter, createAccountLimiter, analyticsLimiter } from './middleware/rateLimiter';
import { authenticateToken } from './middleware/auth';
import { validate, schemas, validateParams, paramSchemas, validateQuery, querySchemas } from './middleware/validation';

// Import controllers
import { AuthController } from './controllers/authController';
import { CampaignController } from './controllers/campaignController';
import { AnalyticsController } from './controllers/analyticsController';

// Load environment variables
config({ path: join(__dirname, '..', '.env') });

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize controllers
const authController = new AuthController();
const campaignController = new CampaignController();
const analyticsController = new AnalyticsController();

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
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - start;
    logRequest(req, res, responseTime);
  });
  
  next();
});

// Health check endpoint (no rate limiting)
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();
    const redisHealth = await redisService.healthCheck();
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: dbHealth,
        redis: redisHealth
      }
    };
    
    const isHealthy = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';
    res.status(isHealthy ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// API routes
app.use('/api', apiLimiter);

// Authentication routes
app.post('/api/auth/register', 
  createAccountLimiter,
  validate(schemas.register),
  authController.register.bind(authController)
);

app.post('/api/auth/login',
  authLimiter,
  validate(schemas.login),
  authController.login.bind(authController)
);

app.post('/api/auth/refresh',
  authLimiter,
  validate(schemas.refreshToken),
  authController.refreshToken.bind(authController)
);

app.post('/api/auth/logout',
  authenticateToken,
  authController.logout.bind(authController)
);

app.get('/api/auth/profile',
  authenticateToken,
  authController.getProfile.bind(authController)
);

app.post('/api/auth/change-password',
  authenticateToken,
  validate(schemas.login), // Reuse login schema for current/new password
  authController.changePassword.bind(authController)
);

app.get('/api/auth/verify/:token',
  authController.verifyEmail.bind(authController)
);

app.post('/api/auth/password-reset',
  authLimiter,
  validate(schemas.login), // Just email validation
  authController.requestPasswordReset.bind(authController)
);

// Campaign routes (all require authentication)
app.post('/api/campaigns',
  authenticateToken,
  validate(schemas.createCampaign),
  campaignController.createCampaign.bind(campaignController)
);

app.get('/api/campaigns/:id',
  authenticateToken,
  validateParams(paramSchemas.id),
  campaignController.getCampaignById.bind(campaignController)
);

app.put('/api/campaigns/:id',
  authenticateToken,
  validateParams(paramSchemas.id),
  validate(schemas.updateCampaign),
  campaignController.updateCampaign.bind(campaignController)
);

app.delete('/api/campaigns/:id',
  authenticateToken,
  validateParams(paramSchemas.id),
  campaignController.deleteCampaign.bind(campaignController)
);

app.get('/api/organizations/:organizationId/campaigns',
  authenticateToken,
  validateParams(paramSchemas.organizationId),
  validateQuery(querySchemas.pagination),
  campaignController.getCampaignsByOrganization.bind(campaignController)
);

app.patch('/api/campaigns/:id/status',
  authenticateToken,
  validateParams(paramSchemas.id),
  validate(schemas.updateCampaignStatus),
  campaignController.updateCampaignStatus.bind(campaignController)
);

app.get('/api/campaigns/:id/performance',
  authenticateToken,
  validateParams(paramSchemas.id),
  validateQuery(querySchemas.dateRange),
  campaignController.getCampaignPerformance.bind(campaignController)
);

app.post('/api/campaigns/:id/duplicate',
  authenticateToken,
  validateParams(paramSchemas.id),
  campaignController.duplicateCampaign.bind(campaignController)
);

// Analytics routes
app.post('/api/analytics/track',
  analyticsLimiter, // Higher limit for tracking
  validate(schemas.trackEvent),
  analyticsController.trackEvent.bind(analyticsController)
);

app.get('/api/analytics/campaigns/:campaignId/metrics',
  authenticateToken,
  validateParams(paramSchemas.campaignId),
  validateQuery(querySchemas.dateRange),
  analyticsController.getCampaignMetrics.bind(analyticsController)
);

app.get('/api/analytics/channels/:channelId/metrics',
  authenticateToken,
  validateQuery({
    ...querySchemas.dateRange.describe().keys,
    organizationId: schemas.createCampaign.describe().keys.organizationId.required()
  }),
  analyticsController.getChannelMetrics.bind(analyticsController)
);

app.post('/api/analytics/reports',
  authenticateToken,
  analyticsController.generateReport.bind(analyticsController)
);

app.get('/api/analytics/campaigns/:campaignId/funnel',
  authenticateToken,
  validateParams(paramSchemas.campaignId),
  validateQuery(querySchemas.dateRange),
  analyticsController.getConversionFunnel.bind(analyticsController)
);

app.get('/api/analytics/content/top',
  authenticateToken,
  validateQuery({
    ...querySchemas.dateRange.describe().keys,
    organizationId: schemas.createCampaign.describe().keys.organizationId.required(),
    metric: require('joi').string().default('clicks'),
    limit: require('joi').number().integer().min(1).max(100).default(10)
  }),
  analyticsController.getTopContent.bind(analyticsController)
);

app.get('/api/analytics/organizations/:organizationId/realtime',
  authenticateToken,
  validateParams(paramSchemas.organizationId),
  analyticsController.getRealTimeMetrics.bind(analyticsController)
);

app.post('/api/analytics/aggregate',
  authenticateToken,
  analyticsController.aggregateMetrics.bind(analyticsController)
);

app.get('/api/analytics/organizations/:organizationId/dashboard',
  authenticateToken,
  validateParams(paramSchemas.organizationId),
  validateQuery({
    days: require('joi').number().integer().min(1).max(365).default(30)
  }),
  analyticsController.getDashboardData.bind(analyticsController)
);

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    userId: req.user?.id
  });

  if (error.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body'
    });
    return;
  }

  if (error.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: 'Request body too large'
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      await database.close();
      await redisService.close();
      logger.info('Database connections closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Force shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database
    await database.initialize();
    logger.info('Database connected successfully');
    
    // Initialize Redis
    await redisService.initialize();
    logger.info('Redis connected successfully');
    
    // Start server
    const server = app.listen(port, () => {
      logger.info(`Marketing Platform API server running on port ${port}`, {
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0'
      });
    });
    
    // Set up graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

// Export default app
export default app;

// Export server functions
export { startServer };

// Export utilities
export { logger } from './utils/logger';
export { default as database } from './utils/database';
export { redisService } from './utils/redis';

// Export middleware
export { authenticateToken } from './middleware/auth';
export * from './middleware/validation';
export * from './middleware/rateLimiter';

// Export controllers
export { AuthController } from './controllers/authController';
export { CampaignController } from './controllers/campaignController';
export { AnalyticsController } from './controllers/analyticsController';

// Export version
export const VERSION = process.env.npm_package_version || '1.0.0';