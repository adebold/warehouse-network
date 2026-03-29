const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const mongoose = require('mongoose');
const redis = require('redis');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
const promMiddleware = require('express-prometheus-middleware');
require('dotenv').config();

// Import modules
const gatewayRouter = require('./gateway/router');
const graphqlSchema = require('./graphql/schema');
const webhookRouter = require('./webhooks/router');
const authRouter = require('./auth/router');
const analyticsRouter = require('./analytics/router');
const marketplaceRouter = require('./marketplace/router');
const versioningMiddleware = require('./versioning/middleware');
const authMiddleware = require('./auth/middleware');
const rateLimitMiddleware = require('./shared/middleware/rateLimiting');
const errorHandler = require('./shared/middleware/errorHandler');
const logger = require('./shared/utils/logger');

class APIManagementPlatform {
  constructor() {
    this.app = express();
    this.server = null;
    this.redisClient = null;
    this.apolloServer = null;
  }

  async initialize() {
    try {
      // Initialize Redis
      await this.initializeRedis();

      // Initialize Database
      await this.initializeDatabase();

      // Setup middleware
      this.setupMiddleware();

      // Setup GraphQL
      await this.setupGraphQL();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      logger.info('API Management Platform initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize platform:', error);
      throw error;
    }
  }

  async initializeRedis() {
    this.redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0
    });

    this.redisClient.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    await this.redisClient.connect();
    logger.info('Redis connected successfully');
  }

  async initializeDatabase() {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/api-platform';

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info('MongoDB connected successfully');
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true,
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Prometheus metrics
    this.app.use(promMiddleware({
      metricsPath: '/metrics',
      collectDefaultMetrics: true,
      requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 3, 5, 10],
    }));

    // API versioning
    this.app.use(versioningMiddleware);

    // Rate limiting (applied globally)
    this.app.use(rateLimitMiddleware.global);

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(\`\${req.method} \${req.path}\`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        apiVersion: req.apiVersion,
      });
      next();
    });
  }

  async setupGraphQL() {
    this.apolloServer = new ApolloServer({
      typeDefs: graphqlSchema.typeDefs,
      resolvers: graphqlSchema.resolvers,
      context: ({ req }) => ({
        user: req.user,
        redisClient: this.redisClient,
        apiVersion: req.apiVersion,
      }),
      introspection: process.env.NODE_ENV !== 'production',
      playground: process.env.NODE_ENV !== 'production',
    });

    await this.apolloServer.start();
    this.apolloServer.applyMiddleware({
      app: this.app,
      path: '/graphql',
      cors: false // Already handled by express cors
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
      });
    });

    // API routes
    this.app.use('/auth', authRouter);
    this.app.use('/api', authMiddleware.optional, gatewayRouter);
    this.app.use('/webhooks', webhookRouter);
    this.app.use('/analytics', authMiddleware.required, analyticsRouter);
    this.app.use('/marketplace', marketplaceRouter);

    // API documentation
    this.app.get('/', (req, res) => {
      res.redirect('/docs');
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Resource not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    });

    // Global error handler
    this.app.use(errorHandler);
  }

  async start() {
    const port = process.env.PORT || 8000;

    this.server = this.app.listen(port, () => {
      logger.info(\`🚀 API Management Platform running on port \${port}\`);
      logger.info(\`📊 GraphQL Playground: http://localhost:\${port}/graphql\`);
      logger.info(\`📚 API Documentation: http://localhost:\${port}/docs\`);
      logger.info(\`📈 Metrics: http://localhost:\${port}/metrics\`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('Shutting down API Management Platform...');

    if (this.server) {
      this.server.close();
    }

    if (this.apolloServer) {
      await this.apolloServer.stop();
    }

    if (this.redisClient) {
      await this.redisClient.quit();
    }

    await mongoose.disconnect();

    logger.info('Platform shutdown complete');
    process.exit(0);
  }
}

// Bootstrap application
async function bootstrap() {
  try {
    const platform = new APIManagementPlatform();
    await platform.initialize();
    await platform.start();
  } catch (error) {
    logger.error('Failed to start platform:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = APIManagementPlatform;