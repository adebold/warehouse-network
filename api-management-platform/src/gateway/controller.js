const { ValidationError, NotFoundError } = require('../shared/middleware/errorHandler');
const logger = require('../shared/utils/logger');
const RouteModel = require('./models/Route');
const CircuitBreaker = require('./services/CircuitBreaker');
const LoadBalancer = require('./services/LoadBalancer');
const RequestTransformer = require('./services/RequestTransformer');
const MockService = require('./services/MockService');

class GatewayController {
  constructor() {
    this.circuitBreakers = new Map();
    this.loadBalancer = new LoadBalancer();
    this.requestTransformer = new RequestTransformer();
    this.mockService = new MockService();
    this.metrics = {
      totalRequests: 0,
      activeConnections: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Get gateway status and metrics
   */
  getStatus = async (req, res) => {
    const uptime = Date.now() - this.metrics.startTime;

    const status = {
      success: true,
      data: {
        status: 'healthy',
        uptime: Math.floor(uptime / 1000),
        activeConnections: this.metrics.activeConnections,
        totalRequests: this.metrics.totalRequests,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      }
    };

    res.json(status);
  };

  /**
   * Get all configured routes
   */
  getRoutes = async (req, res) => {
    const { page = 1, limit = 50, search, status } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { path: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) {
      query.status = status;
    }

    const routes = await RouteModel.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await RouteModel.countDocuments(query);

    res.json({
      success: true,
      data: {
        routes,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  };

  /**
   * Create a new route
   */
  createRoute = async (req, res) => {
    const {
      path,
      target,
      method = 'GET',
      middleware = [],
      rateLimit,
      authentication,
      transformation,
      description,
    } = req.body;

    // Validation
    if (!path || !target) {
      throw new ValidationError('Path and target are required');
    }

    if (!/^\//.test(path)) {
      throw new ValidationError('Path must start with /');
    }

    // Check for duplicate route
    const existingRoute = await RouteModel.findOne({
      path,
      method: method.toUpperCase(),
      status: 'active',
    });

    if (existingRoute) {
      throw new ValidationError('Route already exists for this path and method');
    }

    const route = new RouteModel({
      path,
      target,
      method: method.toUpperCase(),
      middleware,
      rateLimit,
      authentication,
      transformation,
      description,
      createdBy: req.user.id,
      status: 'active',
    });

    await route.save();

    logger.info('Route created', {
      routeId: route._id,
      path,
      target,
      method,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: { route },
      message: 'Route created successfully',
    });
  };

  /**
   * Update an existing route
   */
  updateRoute = async (req, res) => {
    const { routeId } = req.params;
    const updates = req.body;

    const route = await RouteModel.findById(routeId);
    if (!route) {
      throw new NotFoundError('Route');
    }

    // Update fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && key !== '_id') {
        route[key] = updates[key];
      }
    });

    route.updatedBy = req.user.id;
    route.updatedAt = new Date();

    await route.save();

    logger.info('Route updated', {
      routeId,
      updates: Object.keys(updates),
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: { route },
      message: 'Route updated successfully',
    });
  };

  /**
   * Delete a route
   */
  deleteRoute = async (req, res) => {
    const { routeId } = req.params;

    const route = await RouteModel.findById(routeId);
    if (!route) {
      throw new NotFoundError('Route');
    }

    route.status = 'deleted';
    route.deletedBy = req.user.id;
    route.deletedAt = new Date();

    await route.save();

    logger.info('Route deleted', {
      routeId,
      path: route.path,
      userId: req.user.id,
    });

    res.status(204).send();
  };

  /**
   * Transform request based on route configuration
   */
  transformRequest = async (req) => {
    const route = await this.findRouteForRequest(req);

    if (!route || !route.transformation) {
      return req;
    }

    return this.requestTransformer.transform(req, route.transformation);
  };

  /**
   * Validate request against route schema
   */
  validateRequest = async (req) => {
    const route = await this.findRouteForRequest(req);

    if (!route || !route.validation) {
      return true;
    }

    return this.requestTransformer.validate(req, route.validation);
  };

  /**
   * Generate mock response for development
   */
  generateMockResponse = async (serviceName, req) => {
    return this.mockService.generateResponse(serviceName, req.method, req.path, req.body);
  };

  /**
   * Get load balanced endpoint for service
   */
  getLoadBalancedEndpoint = async (req) => {
    const serviceName = req.headers['x-service-name'] || 'default';
    return this.loadBalancer.getEndpoint(serviceName);
  };

  /**
   * Get or create circuit breaker for service
   */
  getCircuitBreaker = (serviceName) => {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreaker({
        name: serviceName,
        errorThreshold: 5,
        timeout: 30000,
        resetTimeout: 60000,
      }));
    }

    return this.circuitBreakers.get(serviceName);
  };

  /**
   * Find route configuration for request
   */
  findRouteForRequest = async (req) => {
    const method = req.method.toUpperCase();
    const path = req.path;

    // Try exact match first
    let route = await RouteModel.findOne({
      path,
      method,
      status: 'active',
    });

    // Try pattern matching if no exact match
    if (!route) {
      const routes = await RouteModel.find({
        method,
        status: 'active',
        path: { $regex: '\\*|:' }, // Routes with wildcards or parameters
      });

      route = routes.find(r => this.matchPattern(r.path, path));
    }

    return route;
  };

  /**
   * Match path pattern with wildcards and parameters
   */
  matchPattern = (pattern, path) => {
    const regexPattern = pattern
      .replace(/:[^/]+/g, '([^/]+)') // Replace :param with regex group
      .replace(/\*/g, '.*'); // Replace * with regex wildcard

    const regex = new RegExp(\`^\${regexPattern}$\`);
    return regex.test(path);
  };

  /**
   * Increment request metrics
   */
  incrementMetrics = () => {
    this.metrics.totalRequests++;
  };

  /**
   * Track active connections
   */
  trackConnection = (increment = true) => {
    if (increment) {
      this.metrics.activeConnections++;
    } else {
      this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
    }
  };
}

module.exports = GatewayController;