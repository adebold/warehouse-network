const EventEmitter = require('events');
const logger = require('../../shared/utils/logger');

class MetricsCollector extends EventEmitter {
  constructor(redisClient, options = {}) {
    super();

    this.redisClient = redisClient;
    this.options = {
      flushInterval: options.flushInterval || 60000, // 1 minute
      batchSize: options.batchSize || 1000,
      retentionPeriod: options.retentionPeriod || 30 * 24 * 60 * 60 * 1000, // 30 days
      enableRealtime: options.enableRealtime !== false,
      ...options
    };

    this.metricsBuffer = [];
    this.aggregationCache = new Map();
    this.timers = new Map();

    this.init();
  }

  async init() {
    try {
      // Start background processing
      this.startBackgroundJobs();

      // Setup event listeners
      this.setupEventListeners();

      logger.info('Metrics collector initialized', {
        flushInterval: this.options.flushInterval,
        batchSize: this.options.batchSize,
        enableRealtime: this.options.enableRealtime
      });

    } catch (error) {
      logger.error('Error initializing metrics collector:', error);
      throw error;
    }
  }

  /**
   * Record API request metrics
   */
  recordApiRequest(data) {
    const metric = {
      type: 'api_request',
      timestamp: new Date(),
      data: {
        apiId: data.apiId,
        endpoint: data.endpoint,
        method: data.method,
        statusCode: data.statusCode,
        responseTime: data.responseTime,
        userId: data.userId,
        userTier: data.userTier,
        userAgent: data.userAgent,
        ip: data.ip,
        requestSize: data.requestSize,
        responseSize: data.responseSize,
        cached: data.cached || false,
        version: data.version,
        region: data.region
      }
    };

    this.addMetric(metric);

    // Real-time processing
    if (this.options.enableRealtime) {
      this.processRealTimeMetric(metric);
    }
  }

  /**
   * Record authentication event
   */
  recordAuthEvent(data) {
    const metric = {
      type: 'auth_event',
      timestamp: new Date(),
      data: {
        event: data.event, // login, logout, token_refresh, etc.
        userId: data.userId,
        method: data.method, // password, oauth, api_key
        success: data.success,
        ip: data.ip,
        userAgent: data.userAgent,
        duration: data.duration,
        failureReason: data.failureReason
      }
    };

    this.addMetric(metric);
  }

  /**
   * Record webhook delivery
   */
  recordWebhookDelivery(data) {
    const metric = {
      type: 'webhook_delivery',
      timestamp: new Date(),
      data: {
        webhookId: data.webhookId,
        event: data.event,
        targetUrl: data.targetUrl,
        statusCode: data.statusCode,
        responseTime: data.responseTime,
        success: data.success,
        attemptNumber: data.attemptNumber,
        payloadSize: data.payloadSize,
        userId: data.userId
      }
    };

    this.addMetric(metric);
  }

  /**
   * Record error event
   */
  recordError(data) {
    const metric = {
      type: 'error',
      timestamp: new Date(),
      data: {
        type: data.type, // api_error, system_error, validation_error
        message: data.message,
        stack: data.stack,
        apiId: data.apiId,
        endpoint: data.endpoint,
        userId: data.userId,
        severity: data.severity, // low, medium, high, critical
        context: data.context
      }
    };

    this.addMetric(metric);

    // Immediate processing for errors
    this.processErrorMetric(metric);
  }

  /**
   * Record rate limit event
   */
  recordRateLimit(data) {
    const metric = {
      type: 'rate_limit',
      timestamp: new Date(),
      data: {
        type: data.type, // api, user, global
        identifier: data.identifier, // userId, apiKey, ip
        endpoint: data.endpoint,
        limit: data.limit,
        current: data.current,
        resetTime: data.resetTime,
        blocked: data.blocked
      }
    };

    this.addMetric(metric);
  }

  /**
   * Record system performance metrics
   */
  recordSystemMetrics(data) {
    const metric = {
      type: 'system_performance',
      timestamp: new Date(),
      data: {
        cpu: data.cpu,
        memory: data.memory,
        diskUsage: data.diskUsage,
        networkIO: data.networkIO,
        activeConnections: data.activeConnections,
        queueLength: data.queueLength,
        cacheHitRate: data.cacheHitRate
      }
    };

    this.addMetric(metric);
  }

  /**
   * Record business metrics
   */
  recordBusinessMetric(data) {
    const metric = {
      type: 'business',
      timestamp: new Date(),
      data: {
        metric: data.metric, // revenue, signups, conversions, etc.
        value: data.value,
        userId: data.userId,
        apiId: data.apiId,
        tier: data.tier,
        metadata: data.metadata
      }
    };

    this.addMetric(metric);
  }

  /**
   * Add metric to buffer
   */
  addMetric(metric) {
    this.metricsBuffer.push(metric);

    // Emit event for real-time subscribers
    this.emit('metric', metric);

    // Flush if buffer is full
    if (this.metricsBuffer.length >= this.options.batchSize) {
      this.flushMetrics();
    }
  }

  /**
   * Flush metrics to storage
   */
  async flushMetrics() {
    if (this.metricsBuffer.length === 0) return;

    const metrics = this.metricsBuffer.splice(0);
    const timestamp = Date.now();

    try {
      // Batch insert metrics
      await this.storeMetrics(metrics);

      // Update real-time aggregations
      await this.updateAggregations(metrics);

      logger.debug(\`Flushed \${metrics.length} metrics\`, {
        flushTime: Date.now() - timestamp
      });

    } catch (error) {
      logger.error('Error flushing metrics:', error);

      // Return metrics to buffer for retry
      this.metricsBuffer.unshift(...metrics.slice(0, Math.min(metrics.length, 100)));
    }
  }

  /**
   * Store metrics in database/cache
   */
  async storeMetrics(metrics) {
    const pipeline = this.redisClient.pipeline();
    const timeWindowKeys = new Set();

    for (const metric of metrics) {
      const timestamp = metric.timestamp.getTime();

      // Store individual metric
      const metricKey = \`metric:\${metric.type}:\${timestamp}:\${Math.random().toString(36).substr(2, 9)}\`;
      pipeline.setex(metricKey, this.options.retentionPeriod / 1000, JSON.stringify(metric));

      // Add to time series
      const timeSeriesKey = \`ts:\${metric.type}:\${this.getTimeWindow(timestamp, 'minute')}\`;
      pipeline.lpush(timeSeriesKey, JSON.stringify(metric));
      timeWindowKeys.add(timeSeriesKey);

      // Update counters
      const counterKey = \`counter:\${metric.type}:\${this.getTimeWindow(timestamp, 'hour')}\`;
      pipeline.incr(counterKey);
      pipeline.expire(counterKey, this.options.retentionPeriod / 1000);
    }

    // Set expiration for time series keys
    for (const key of timeWindowKeys) {
      pipeline.expire(key, this.options.retentionPeriod / 1000);
    }

    await pipeline.exec();
  }

  /**
   * Update real-time aggregations
   */
  async updateAggregations(metrics) {
    const aggregations = {};

    for (const metric of metrics) {
      const type = metric.type;
      if (!aggregations[type]) {
        aggregations[type] = {
          count: 0,
          lastUpdate: metric.timestamp
        };
      }
      aggregations[type].count++;
    }

    // Store aggregations in cache
    const pipeline = this.redisClient.pipeline();

    for (const [type, data] of Object.entries(aggregations)) {
      const key = \`agg:\${type}:realtime\`;
      pipeline.hmset(key, {
        count: data.count,
        lastUpdate: data.lastUpdate.getTime()
      });
      pipeline.expire(key, 3600); // 1 hour
    }

    await pipeline.exec();
  }

  /**
   * Process real-time metric
   */
  processRealTimeMetric(metric) {
    // Update in-memory aggregations
    const type = metric.type;
    const aggregation = this.aggregationCache.get(type) || {
      count: 0,
      lastMinute: 0,
      errorRate: 0
    };

    aggregation.count++;
    aggregation.lastUpdate = metric.timestamp;

    // Type-specific processing
    switch (type) {
      case 'api_request':
        this.processApiRequestRealTime(metric, aggregation);
        break;
      case 'error':
        this.processErrorRealTime(metric, aggregation);
        break;
      case 'rate_limit':
        this.processRateLimitRealTime(metric, aggregation);
        break;
    }

    this.aggregationCache.set(type, aggregation);

    // Emit real-time updates
    this.emit('realtime_update', {
      type,
      metric,
      aggregation
    });
  }

  /**
   * Process API request in real-time
   */
  processApiRequestRealTime(metric, aggregation) {
    const { statusCode, responseTime, apiId } = metric.data;

    // Update API-specific metrics
    const apiKey = \`api:\${apiId}\`;
    const apiAgg = this.aggregationCache.get(apiKey) || {
      requests: 0,
      errors: 0,
      totalResponseTime: 0,
      avgResponseTime: 0
    };

    apiAgg.requests++;
    apiAgg.totalResponseTime += responseTime;
    apiAgg.avgResponseTime = apiAgg.totalResponseTime / apiAgg.requests;

    if (statusCode >= 400) {
      apiAgg.errors++;
    }

    this.aggregationCache.set(apiKey, apiAgg);

    // Check for anomalies
    this.checkResponseTimeAnomaly(apiId, responseTime, apiAgg.avgResponseTime);
  }

  /**
   * Process error in real-time
   */
  processErrorRealTime(metric, aggregation) {
    const { severity, type } = metric.data;

    aggregation.errors = (aggregation.errors || 0) + 1;

    // Alert on critical errors
    if (severity === 'critical') {
      this.emit('critical_error', metric);
    }

    // Check error rate
    const errorRate = aggregation.errors / aggregation.count;
    if (errorRate > 0.1) { // 10% error rate threshold
      this.emit('high_error_rate', {
        type,
        errorRate,
        metric
      });
    }
  }

  /**
   * Process rate limit in real-time
   */
  processRateLimitRealTime(metric, aggregation) {
    const { identifier, endpoint } = metric.data;

    aggregation.rateLimits = (aggregation.rateLimits || 0) + 1;

    // Track rate limit abuse
    const rateLimitKey = \`ratelimit:\${identifier}\`;
    const rateLimitCount = this.aggregationCache.get(rateLimitKey) || 0;
    this.aggregationCache.set(rateLimitKey, rateLimitCount + 1);

    if (rateLimitCount > 10) { // 10 rate limits in the aggregation window
      this.emit('rate_limit_abuse', {
        identifier,
        endpoint,
        count: rateLimitCount,
        metric
      });
    }
  }

  /**
   * Check for response time anomalies
   */
  checkResponseTimeAnomaly(apiId, currentTime, avgTime) {
    if (currentTime > avgTime * 3 && avgTime > 100) { // 3x slower than average and > 100ms
      this.emit('response_time_anomaly', {
        apiId,
        currentTime,
        avgTime,
        factor: currentTime / avgTime
      });
    }
  }

  /**
   * Get analytics data for time range
   */
  async getAnalytics(type, timeRange, filters = {}) {
    try {
      const { startTime, endTime } = this.parseTimeRange(timeRange);
      const timeWindows = this.generateTimeWindows(startTime, endTime, 'hour');

      const results = {
        timeRange: { startTime, endTime },
        type,
        data: [],
        summary: {
          total: 0,
          average: 0,
          peak: 0,
          trend: 'stable'
        }
      };

      // Fetch data for each time window
      for (const window of timeWindows) {
        const windowData = await this.getWindowData(type, window, filters);
        results.data.push(windowData);
        results.summary.total += windowData.count;
      }

      // Calculate summary statistics
      results.summary.average = results.summary.total / timeWindows.length;
      results.summary.peak = Math.max(...results.data.map(d => d.count));
      results.summary.trend = this.calculateTrend(results.data);

      return results;

    } catch (error) {
      logger.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Get real-time metrics
   */
  async getRealTimeMetrics() {
    try {
      const keys = await this.redisClient.keys('agg:*:realtime');
      const metrics = {};

      for (const key of keys) {
        const data = await this.redisClient.hgetall(key);
        const type = key.split(':')[1];
        metrics[type] = {
          count: parseInt(data.count) || 0,
          lastUpdate: data.lastUpdate ? new Date(parseInt(data.lastUpdate)) : null
        };
      }

      // Add in-memory aggregations
      for (const [type, aggregation] of this.aggregationCache.entries()) {
        if (!metrics[type]) {
          metrics[type] = aggregation;
        } else {
          metrics[type].count += aggregation.count;
          if (aggregation.lastUpdate > metrics[type].lastUpdate) {
            metrics[type].lastUpdate = aggregation.lastUpdate;
          }
        }
      }

      return metrics;

    } catch (error) {
      logger.error('Error getting real-time metrics:', error);
      throw error;
    }
  }

  /**
   * Start background jobs
   */
  startBackgroundJobs() {
    // Periodic flush
    const flushTimer = setInterval(() => {
      this.flushMetrics();
    }, this.options.flushInterval);
    this.timers.set('flush', flushTimer);

    // Cleanup old data
    const cleanupTimer = setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000); // Every hour
    this.timers.set('cleanup', cleanupTimer);

    // Clear aggregation cache
    const cacheTimer = setInterval(() => {
      this.aggregationCache.clear();
    }, 5 * 60 * 1000); // Every 5 minutes
    this.timers.set('cache', cacheTimer);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in metrics collector:', error);
    });
  }

  /**
   * Utility methods
   */
  getTimeWindow(timestamp, unit) {
    const date = new Date(timestamp);
    switch (unit) {
      case 'minute':
        return Math.floor(timestamp / (60 * 1000));
      case 'hour':
        return Math.floor(timestamp / (60 * 60 * 1000));
      case 'day':
        return Math.floor(timestamp / (24 * 60 * 60 * 1000));
      default:
        return timestamp;
    }
  }

  parseTimeRange(timeRange) {
    const endTime = new Date();
    let startTime;

    switch (timeRange) {
      case '1h':
        startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    }

    return { startTime, endTime };
  }

  generateTimeWindows(startTime, endTime, unit) {
    const windows = [];
    const windowSize = unit === 'hour' ? 60 * 60 * 1000 : 60 * 1000;

    for (let time = startTime.getTime(); time < endTime.getTime(); time += windowSize) {
      windows.push(this.getTimeWindow(time, unit));
    }

    return windows;
  }

  calculateTrend(data) {
    if (data.length < 2) return 'stable';

    const recent = data.slice(-Math.min(5, data.length));
    const older = data.slice(0, Math.min(5, data.length));

    const recentAvg = recent.reduce((sum, d) => sum + d.count, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.count, 0) / older.length;

    const change = (recentAvg - olderAvg) / olderAvg;

    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  async getWindowData(type, window, filters) {
    const key = \`counter:\${type}:\${window}\`;
    const count = await this.redisClient.get(key);

    return {
      timestamp: new Date(window * (type.includes('minute') ? 60 * 1000 : 60 * 60 * 1000)),
      count: parseInt(count) || 0
    };
  }

  async cleanupOldData() {
    try {
      const cutoffTime = Date.now() - this.options.retentionPeriod;
      const pattern = 'metric:*';

      // This is a simplified cleanup - in production, you'd want batch processing
      logger.info('Starting metrics cleanup', { cutoffTime: new Date(cutoffTime) });

    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  async shutdown() {
    logger.info('Shutting down metrics collector...');

    // Clear all timers
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    // Flush remaining metrics
    await this.flushMetrics();

    logger.info('Metrics collector shutdown complete');
  }
}

module.exports = MetricsCollector;