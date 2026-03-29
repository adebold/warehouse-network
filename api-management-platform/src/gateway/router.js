const express = require('express');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { asyncHandler } = require('../shared/middleware/errorHandler');
const rateLimitMiddleware = require('../shared/middleware/rateLimiting');
const logger = require('../shared/utils/logger');
const GatewayController = require('./controller');
const ProxyService = require('./services/ProxyService');
const DocumentationService = require('./services/DocumentationService');

const router = express.Router();
const gatewayController = new GatewayController();
const proxyService = new ProxyService();
const documentationService = new DocumentationService();

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Management Platform',
      version: '1.0.0',
      description: 'Enterprise-grade API management and integration platform',
      contact: {
        name: 'API Support',
        email: 'support@apiplatform.com',
        url: 'https://apiplatform.com/support'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:8000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      },
      {
        apiKeyAuth: []
      }
    ]
  },
  apis: ['./src/**/*.js'], // Paths to files containing OpenAPI definitions
};

const specs = swaggerJSDoc(swaggerOptions);

// API Documentation
router.use('/docs', swaggerUi.serve);
router.get('/docs', swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'API Platform Documentation'
}));

// OpenAPI spec endpoint
router.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

/**
 * @swagger
 * /api/gateway/status:
 *   get:
 *     summary: Get gateway status and metrics
 *     tags: [Gateway]
 *     responses:
 *       200:
 *         description: Gateway status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 activeConnections:
 *                   type: number
 *                 totalRequests:
 *                   type: number
 */
router.get('/gateway/status', asyncHandler(gatewayController.getStatus));

/**
 * @swagger
 * /api/gateway/routes:
 *   get:
 *     summary: List all configured routes
 *     tags: [Gateway]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of configured routes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 routes:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/gateway/routes', rateLimitMiddleware.api, asyncHandler(gatewayController.getRoutes));

/**
 * @swagger
 * /api/gateway/routes:
 *   post:
 *     summary: Create a new route
 *     tags: [Gateway]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - path
 *               - target
 *               - method
 *             properties:
 *               path:
 *                 type: string
 *               target:
 *                 type: string
 *               method:
 *                 type: string
 *               middleware:
 *                 type: array
 *               rateLimit:
 *                 type: object
 *     responses:
 *       201:
 *         description: Route created successfully
 */
router.post('/gateway/routes', rateLimitMiddleware.api, asyncHandler(gatewayController.createRoute));

/**
 * @swagger
 * /api/gateway/routes/{routeId}:
 *   put:
 *     summary: Update an existing route
 *     tags: [Gateway]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Route updated successfully
 */
router.put('/gateway/routes/:routeId', rateLimitMiddleware.api, asyncHandler(gatewayController.updateRoute));

/**
 * @swagger
 * /api/gateway/routes/{routeId}:
 *   delete:
 *     summary: Delete a route
 *     tags: [Gateway]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Route deleted successfully
 */
router.delete('/gateway/routes/:routeId', rateLimitMiddleware.api, asyncHandler(gatewayController.deleteRoute));

// Dynamic proxy routing
router.use('/proxy', rateLimitMiddleware.dynamic, asyncHandler(async (req, res, next) => {
  try {
    // Extract target service from headers or path
    const targetService = req.headers['x-target-service'] || req.query.service;

    if (!targetService) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Target service not specified',
          code: 'MISSING_TARGET_SERVICE'
        }
      });
    }

    // Log proxy request
    logger.info('Proxy request', {
      targetService,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
      ip: req.ip
    });

    // Proxy the request
    await proxyService.proxyRequest(req, res, targetService);

  } catch (error) {
    logger.error('Proxy error:', error);
    next(error);
  }
}));

// API transformation and validation
router.use('/transform', rateLimitMiddleware.api, asyncHandler(async (req, res, next) => {
  try {
    // Apply request transformations
    const transformed = await gatewayController.transformRequest(req);

    // Validate against schema
    await gatewayController.validateRequest(transformed);

    // Continue to next middleware
    req.transformed = transformed;
    next();

  } catch (error) {
    next(error);
  }
}));

// API Mock service
/**
 * @swagger
 * /api/mock/{serviceName}:
 *   get:
 *     summary: Mock API endpoint
 *     tags: [Gateway, Mock]
 *     parameters:
 *       - in: path
 *         name: serviceName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mock response
 */
router.use('/mock/:serviceName', rateLimitMiddleware.api, asyncHandler(async (req, res) => {
  const mockResponse = await gatewayController.generateMockResponse(req.params.serviceName, req);
  res.json(mockResponse);
}));

// Load balancing endpoint
router.use('/lb', rateLimitMiddleware.burst, asyncHandler(async (req, res, next) => {
  try {
    const targetEndpoint = await gatewayController.getLoadBalancedEndpoint(req);
    req.targetEndpoint = targetEndpoint;
    next();
  } catch (error) {
    next(error);
  }
}));

// Circuit breaker middleware
router.use('/circuit', (req, res, next) => {
  const circuitBreaker = gatewayController.getCircuitBreaker(req.headers['x-service-name']);

  circuitBreaker.fire(req, res)
    .then((result) => {
      res.json(result);
    })
    .catch((error) => {
      next(error);
    });
});

// Request/Response logging
router.use('*', (req, res, next) => {
  const startTime = Date.now();

  // Override res.json to capture response
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - startTime;

    logger.apiCall(
      req.method,
      req.originalUrl,
      res.statusCode,
      duration,
      {
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        apiVersion: req.apiVersion,
        responseSize: JSON.stringify(body).length
      }
    );

    return originalJson.call(this, body);
  };

  next();
});

module.exports = router;