import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { initializeOpenTelemetry } from './utils/telemetry';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { rateLimiter } from './middleware/rate-limiter';
import { authenticate } from './middleware/auth';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes/api';
import { config } from './config';
import { logger } from './utils/logger';
import { redis } from './utils/redis';
import { db } from './utils/database';
import { gracefulShutdown } from './utils/shutdown';

// Initialize OpenTelemetry
initializeOpenTelemetry();

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = config.cors.origins.split(',');
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  maxAge: 86400, // 24 hours
}));

// Body parsing and compression
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Request logging
app.use(requestLogger);

// Global rate limiting
app.use(rateLimiter);

// Health checks (no auth required)
app.use('/health', healthRouter);

// Auth routes
app.use('/auth', authRouter);

// API routes (protected)
app.use('/api', authenticate, apiRouter);

// Error handling
app.use(errorHandler);

// Start server
async function start() {
  try {
    // Test database connection
    await db.raw('SELECT 1');
    logger.info('Database connection established');

    // Test Redis connection
    await redis.ping();
    logger.info('Redis connection established');

    // Start HTTP server
    server.listen(config.port, () => {
      logger.info(`API Gateway listening on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`CORS Origins: ${config.cors.origins}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();