const { ClaudeMemoryManager } = require('claude-db-integrity');
const { logger } = require('../../../../../../../utils/logger');

/**
 * Claude DB Integrity Middleware for Express.js
 * Tracks requests and monitors database health
 */
class IntegrityMiddleware {
  constructor(config) {
    this.config = config;
    this.memoryManager = new ClaudeMemoryManager(config.memory);
    this.lastCheck = null;
    this.checkInterval = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    await this.memoryManager.initialize();
  }

  /**
   * Request tracking middleware
   */
  trackRequests() {
    return async (req, res, next) => {
      try {
        // Track API request
        await this.memoryManager.store(`api-requests/${req.path}`, {
          method: req.method,
          timestamp: new Date(),
          userAgent: req.get('user-agent'),
          ip: req.ip,
          body: req.body,
          query: req.query,
          params: req.params
        }, {
          tags: ['api-request', 'monitoring'],
          namespace: 'analytics',
          ttl: 3600 // 1 hour
        });

        // Add request ID for correlation
        req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store request ID in Claude memory for debugging
        await this.memoryManager.store(`request-correlation/${req.requestId}`, {
          path: req.path,
          method: req.method,
          timestamp: new Date(),
          headers: req.headers
        }, {
          namespace: 'debug',
          ttl: 1800 // 30 minutes
        });

        next();
      } catch (error) {
        logger.error('Request tracking error:', error);
        // Don't block requests on tracking errors
        next();
      }
    };
  }

  /**
   * Database integrity check middleware
   */
  checkIntegrity() {
    return async (req, res, next) => {
      try {
        const now = Date.now();
        
        // Skip check if recently performed
        if (this.lastCheck && (now - this.lastCheck) < this.checkInterval) {
          return next();
        }

        // Quick integrity check for critical routes
        if (this.isCriticalRoute(req.path)) {
          const integrityResult = await this.memoryManager.retrieve('quick-check-result', 'system');
          
          if (integrityResult && !integrityResult.passed) {
            return res.status(503).json({
              error: 'Database integrity issues detected',
              message: 'Service temporarily unavailable',
              requestId: req.requestId
            });
          }
        }

        this.lastCheck = now;
        next();
      } catch (error) {
        logger.error('Integrity check middleware error:', error);
        
        // Store error for debugging
        await this.memoryManager.store(`middleware-errors/${Date.now()}`, {
          error: error.message,
          stack: error.stack,
          path: req.path,
          timestamp: new Date()
        }, {
          namespace: 'errors',
          ttl: 7200 // 2 hours
        });

        // Don't block requests on check errors
        next();
      }
    };
  }

  /**
   * Error handling middleware
   */
  errorHandler() {
    return async (error, req, res, next) => {
      try {
        // Log error to Claude memory
        await this.memoryManager.store(`request-errors/${req.requestId}`, {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name
          },
          request: {
            path: req.path,
            method: req.method,
            body: req.body,
            query: req.query,
            headers: req.headers
          },
          timestamp: new Date()
        }, {
          namespace: 'errors',
          tags: ['error', 'request-error'],
          ttl: 86400 // 24 hours
        });

        // Check if error is database-related
        if (this.isDatabaseError(error)) {
          await this.memoryManager.store('last-db-error', {
            error: error.message,
            timestamp: new Date(),
            path: req.path
          }, {
            namespace: 'system'
          });
        }

        // Return error response
        const statusCode = error.status || error.statusCode || 500;
        res.status(statusCode).json({
          error: error.message,
          requestId: req.requestId,
          timestamp: new Date().toISOString()
        });
      } catch (memoryError) {
        logger.error('Error handler memory error:', memoryError);
        
        // Fallback error response
        res.status(500).json({
          error: 'Internal server error',
          requestId: req.requestId
        });
      }
    };
  }

  /**
   * Response time tracking
   */
  trackResponseTime() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', async () => {
        try {
          const responseTime = Date.now() - startTime;
          
          await this.memoryManager.store(`response-times/${req.path}`, {
            method: req.method,
            statusCode: res.statusCode,
            responseTime,
            timestamp: new Date()
          }, {
            namespace: 'performance',
            tags: ['response-time', 'performance'],
            ttl: 3600
          });
        } catch (error) {
          logger.error('Response time tracking error:', error);
        }
      });
      
      next();
    };
  }

  /**
   * Health check endpoint
   */
  healthCheck() {
    return async (req, res) => {
      try {
        // Check database connection
        const dbStatus = await this.checkDatabaseConnection();
        
        // Check Claude memory status
        const memoryStats = await this.memoryManager.getStats();
        
        // Get recent errors
        const recentErrors = await this.memoryManager.search('errors/', {
          limit: 10,
          namespace: 'errors'
        });

        const health = {
          status: dbStatus.connected ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          checks: {
            database: {
              connected: dbStatus.connected,
              responseTime: dbStatus.responseTime
            },
            memory: {
              totalEntries: memoryStats.totalEntries,
              hitRate: memoryStats.hitRate,
              lastSync: memoryStats.lastSync
            },
            errors: {
              recentCount: recentErrors.length,
              lastError: recentErrors[0]?.value?.timestamp
            }
          }
        };

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(500).json({
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Check if route is critical (requires integrity check)
   */
  isCriticalRoute(path) {
    const criticalPaths = [
      '/api/users',
      '/api/orders',
      '/api/payments',
      '/api/auth'
    ];
    
    return criticalPaths.some(criticalPath => path.startsWith(criticalPath));
  }

  /**
   * Check if error is database-related
   */
  isDatabaseError(error) {
    const dbErrorIndicators = [
      'connection',
      'database',
      'prisma',
      'sql',
      'transaction',
      'constraint',
      'foreign key'
    ];
    
    const message = error.message.toLowerCase();
    return dbErrorIndicators.some(indicator => message.includes(indicator));
  }

  /**
   * Check database connection
   */
  async checkDatabaseConnection() {
    const startTime = Date.now();
    
    try {
      // This would typically use your actual database client
      // For now, we'll simulate a connection check
      await new Promise(resolve => setTimeout(resolve, 10));
      
      return {
        connected: true,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        connected: false,
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  async shutdown() {
    await this.memoryManager.shutdown();
  }
}

module.exports = IntegrityMiddleware;