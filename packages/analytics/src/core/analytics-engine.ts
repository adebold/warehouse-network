/**
 * Core Analytics Engine
 * Central processing engine for all analytics operations in the Skidspace platform
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import cron from 'node-cron';
import { Logger } from 'winston';

import {
  AnalyticsEventData,
  SessionData,
  KPIMetrics,
  MetricFilter,
  MetricTrend,
  CustomerJourneyData,
  AlertRule,
  AnalyticsConfig,
  SystemPerformanceMetrics,
  AnalyticsResponse
} from '../types';

import { MetricsCalculator } from '../services/metrics-calculator';
import { EventProcessor } from '../services/event-processor';
import { AlertManager } from '../services/alert-manager';
import { ForecastEngine } from '../services/forecast-engine';
import { CustomerBehaviorAnalyzer } from '../services/customer-behavior';
import { PerformanceMonitor } from '../services/performance-monitor';
import { createLogger } from '../utils/logger';

export class AnalyticsEngine extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: Logger;
  private config: AnalyticsConfig;

  // Service instances
  private metricsCalculator: MetricsCalculator;
  private eventProcessor: EventProcessor;
  private alertManager: AlertManager;
  private forecastEngine: ForecastEngine;
  private customerBehaviorAnalyzer: CustomerBehaviorAnalyzer;
  private performanceMonitor: PerformanceMonitor;

  // Processing state
  private isProcessing: boolean = false;
  private processingQueue: Map<string, any[]> = new Map();
  private cronJobs: Map<string, any> = new Map();

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    config: AnalyticsConfig,
    logger?: Logger
  ) {
    super();

    this.prisma = prisma;
    this.redis = redis;
    this.config = config;
    this.logger = logger || createLogger('analytics-engine');

    // Initialize services
    this.initializeServices();
    this.setupEventHandlers();
    this.startBackgroundProcessing();

    this.logger.info('Analytics Engine initialized successfully', {
      realtimeEnabled: this.config.realtimeEnabled,
      batchProcessingInterval: this.config.batchProcessingInterval
    });
  }

  /**
   * Initialize all analytics services
   */
  private initializeServices(): void {
    this.metricsCalculator = new MetricsCalculator(this.prisma, this.redis, this.logger);
    this.eventProcessor = new EventProcessor(this.prisma, this.redis, this.logger);
    this.alertManager = new AlertManager(this.prisma, this.redis, this.logger);
    this.forecastEngine = new ForecastEngine(this.prisma, this.redis, this.logger);
    this.customerBehaviorAnalyzer = new CustomerBehaviorAnalyzer(this.prisma, this.redis, this.logger);
    this.performanceMonitor = new PerformanceMonitor(this.prisma, this.redis, this.logger);
  }

  /**
   * Set up event handlers between services
   */
  private setupEventHandlers(): void {
    // Event processing events
    this.eventProcessor.on('event_processed', (eventData) => {
      this.emit('event_processed', eventData);
    });

    this.eventProcessor.on('batch_completed', (batchStats) => {
      this.logger.info('Event batch processing completed', batchStats);
    });

    // Alert events
    this.alertManager.on('alert_triggered', (alert) => {
      this.emit('alert_triggered', alert);
      this.logger.warn('Alert triggered', { alertId: alert.id, severity: alert.alertLevel });
    });

    // Performance monitoring events
    this.performanceMonitor.on('performance_issue', (issue) => {
      this.emit('performance_issue', issue);
      this.logger.error('Performance issue detected', issue);
    });

    // Customer behavior events
    this.customerBehaviorAnalyzer.on('journey_completed', (journey) => {
      this.emit('journey_completed', journey);
    });
  }

  /**
   * Start background processing tasks
   */
  private startBackgroundProcessing(): void {
    // Batch event processing
    const batchProcessingJob = cron.schedule(`*/${this.config.batchProcessingInterval} * * * *`, async () => {
      if (!this.isProcessing) {
        await this.processBatch();
      }
    });

    this.cronJobs.set('batch_processing', batchProcessingJob);

    // Daily metrics aggregation
    const dailyMetricsJob = cron.schedule('0 1 * * *', async () => {
      await this.aggregateDailyMetrics();
    });

    this.cronJobs.set('daily_metrics', dailyMetricsJob);

    // Hourly alert evaluation
    const alertEvaluationJob = cron.schedule('0 * * * *', async () => {
      await this.evaluateAlerts();
    });

    this.cronJobs.set('alert_evaluation', alertEvaluationJob);

    // Performance monitoring (every 5 minutes)
    const performanceMonitoringJob = cron.schedule('*/5 * * * *', async () => {
      await this.collectPerformanceMetrics();
    });

    this.cronJobs.set('performance_monitoring', performanceMonitoringJob);

    this.logger.info('Background processing jobs started');
  }

  // =============================================================================
  // EVENT TRACKING METHODS
  // =============================================================================

  /**
   * Track a single analytics event
   */
  async trackEvent(eventData: AnalyticsEventData): Promise<AnalyticsResponse<void>> {
    try {
      const processedEvent = await this.eventProcessor.processEvent(eventData);

      // For real-time processing
      if (this.config.realtimeEnabled) {
        await this.updateRealtimeMetrics(processedEvent);
      }

      // Add to batch queue for delayed processing
      const queueKey = eventData.tenantId || 'global';
      if (!this.processingQueue.has(queueKey)) {
        this.processingQueue.set(queueKey, []);
      }
      this.processingQueue.get(queueKey)?.push(processedEvent);

      this.emit('event_tracked', processedEvent);

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      this.logger.error('Failed to track event', { error: error.message, eventData });
      return {
        success: false,
        data: undefined,
        errors: [error.message]
      };
    }
  }

  /**
   * Track multiple events in batch
   */
  async trackEvents(events: AnalyticsEventData[]): Promise<AnalyticsResponse<{ processed: number; failed: number }>> {
    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await this.trackEvent(event);
        processed++;
      } catch (error) {
        failed++;
        this.logger.error('Failed to track event in batch', { error: error.message, event });
      }
    }

    return {
      success: failed === 0,
      data: { processed, failed },
      warnings: failed > 0 ? [`${failed} events failed to process`] : undefined
    };
  }

  /**
   * Track user session data
   */
  async trackSession(sessionData: SessionData): Promise<AnalyticsResponse<void>> {
    try {
      await this.eventProcessor.processSession(sessionData);

      this.emit('session_tracked', sessionData);

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      this.logger.error('Failed to track session', { error: error.message, sessionData });
      return {
        success: false,
        data: undefined,
        errors: [error.message]
      };
    }
  }

  // =============================================================================
  // METRICS AND KPI METHODS
  // =============================================================================

  /**
   * Get current KPI metrics
   */
  async getKPIMetrics(filter: MetricFilter): Promise<AnalyticsResponse<KPIMetrics>> {
    try {
      const metrics = await this.metricsCalculator.calculateKPIMetrics(filter);

      return {
        success: true,
        data: metrics,
        metadata: {
          executionTime: Date.now()
        }
      };
    } catch (error) {
      this.logger.error('Failed to get KPI metrics', { error: error.message, filter });
      return {
        success: false,
        data: {} as KPIMetrics,
        errors: [error.message]
      };
    }
  }

  /**
   * Get metric trends over time
   */
  async getMetricTrends(
    metricName: string,
    filter: MetricFilter
  ): Promise<AnalyticsResponse<MetricTrend[]>> {
    try {
      const trends = await this.metricsCalculator.calculateMetricTrends(metricName, filter);

      return {
        success: true,
        data: trends
      };
    } catch (error) {
      this.logger.error('Failed to get metric trends', { error: error.message, metricName, filter });
      return {
        success: false,
        data: [],
        errors: [error.message]
      };
    }
  }

  /**
   * Get warehouse performance metrics
   */
  async getWarehousePerformance(
    warehouseId: string,
    filter: MetricFilter
  ): Promise<AnalyticsResponse<any>> {
    try {
      const performance = await this.metricsCalculator.calculateWarehousePerformance(warehouseId, filter);

      return {
        success: true,
        data: performance
      };
    } catch (error) {
      this.logger.error('Failed to get warehouse performance', {
        error: error.message,
        warehouseId,
        filter
      });
      return {
        success: false,
        data: null,
        errors: [error.message]
      };
    }
  }

  // =============================================================================
  // CUSTOMER BEHAVIOR ANALYSIS
  // =============================================================================

  /**
   * Analyze customer journey
   */
  async analyzeCustomerJourney(
    userId: string,
    timeframe?: { startDate: Date; endDate: Date }
  ): Promise<AnalyticsResponse<CustomerJourneyData>> {
    try {
      const journey = await this.customerBehaviorAnalyzer.analyzeJourney(userId, timeframe);

      return {
        success: true,
        data: journey
      };
    } catch (error) {
      this.logger.error('Failed to analyze customer journey', {
        error: error.message,
        userId,
        timeframe
      });
      return {
        success: false,
        data: {} as CustomerJourneyData,
        errors: [error.message]
      };
    }
  }

  /**
   * Get funnel analysis
   */
  async getFunnelAnalysis(
    funnelName: string,
    tenantId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<AnalyticsResponse<any>> {
    try {
      const funnel = await this.customerBehaviorAnalyzer.analyzeFunnel(funnelName, tenantId, dateRange);

      return {
        success: true,
        data: funnel
      };
    } catch (error) {
      this.logger.error('Failed to get funnel analysis', {
        error: error.message,
        funnelName,
        tenantId,
        dateRange
      });
      return {
        success: false,
        data: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Get cohort analysis
   */
  async getCohortAnalysis(
    cohortType: string,
    tenantId: string,
    params: any
  ): Promise<AnalyticsResponse<any>> {
    try {
      const cohorts = await this.customerBehaviorAnalyzer.analyzeCohorts(cohortType, tenantId, params);

      return {
        success: true,
        data: cohorts
      };
    } catch (error) {
      this.logger.error('Failed to get cohort analysis', {
        error: error.message,
        cohortType,
        tenantId,
        params
      });
      return {
        success: false,
        data: null,
        errors: [error.message]
      };
    }
  }

  // =============================================================================
  // FORECASTING METHODS
  // =============================================================================

  /**
   * Generate revenue forecast
   */
  async generateForecast(
    forecastType: string,
    tenantId: string,
    params: any
  ): Promise<AnalyticsResponse<any>> {
    try {
      const forecast = await this.forecastEngine.generateForecast(forecastType, tenantId, params);

      return {
        success: true,
        data: forecast
      };
    } catch (error) {
      this.logger.error('Failed to generate forecast', {
        error: error.message,
        forecastType,
        tenantId,
        params
      });
      return {
        success: false,
        data: null,
        errors: [error.message]
      };
    }
  }

  // =============================================================================
  // ALERT MANAGEMENT
  // =============================================================================

  /**
   * Create alert rule
   */
  async createAlertRule(alertRule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AnalyticsResponse<AlertRule>> {
    try {
      const rule = await this.alertManager.createRule(alertRule);

      return {
        success: true,
        data: rule
      };
    } catch (error) {
      this.logger.error('Failed to create alert rule', { error: error.message, alertRule });
      return {
        success: false,
        data: {} as AlertRule,
        errors: [error.message]
      };
    }
  }

  /**
   * Update alert rule
   */
  async updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<AnalyticsResponse<AlertRule>> {
    try {
      const rule = await this.alertManager.updateRule(ruleId, updates);

      return {
        success: true,
        data: rule
      };
    } catch (error) {
      this.logger.error('Failed to update alert rule', { error: error.message, ruleId, updates });
      return {
        success: false,
        data: {} as AlertRule,
        errors: [error.message]
      };
    }
  }

  /**
   * Get alert rules for tenant
   */
  async getAlertRules(tenantId: string): Promise<AnalyticsResponse<AlertRule[]>> {
    try {
      const rules = await this.alertManager.getRules(tenantId);

      return {
        success: true,
        data: rules
      };
    } catch (error) {
      this.logger.error('Failed to get alert rules', { error: error.message, tenantId });
      return {
        success: false,
        data: [],
        errors: [error.message]
      };
    }
  }

  // =============================================================================
  // PRIVATE PROCESSING METHODS
  // =============================================================================

  /**
   * Process queued events in batch
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      let totalProcessed = 0;

      for (const [tenantId, events] of this.processingQueue.entries()) {
        if (events.length === 0) continue;

        try {
          await this.eventProcessor.processBatch(events);
          totalProcessed += events.length;

          // Clear processed events
          this.processingQueue.set(tenantId, []);
        } catch (error) {
          this.logger.error('Failed to process batch for tenant', {
            error: error.message,
            tenantId,
            eventCount: events.length
          });
        }
      }

      const processingTime = Date.now() - startTime;
      this.logger.info('Batch processing completed', {
        totalProcessed,
        processingTime: `${processingTime}ms`
      });

      this.emit('batch_processed', { totalProcessed, processingTime });
    } catch (error) {
      this.logger.error('Batch processing failed', { error: error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Aggregate daily metrics for all tenants
   */
  private async aggregateDailyMetrics(): Promise<void> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await this.metricsCalculator.aggregateDailyMetrics(yesterday);

      this.logger.info('Daily metrics aggregation completed', {
        date: yesterday.toISOString().split('T')[0]
      });
    } catch (error) {
      this.logger.error('Daily metrics aggregation failed', { error: error.message });
    }
  }

  /**
   * Evaluate all active alert rules
   */
  private async evaluateAlerts(): Promise<void> {
    try {
      const triggeredAlerts = await this.alertManager.evaluateAllRules();

      if (triggeredAlerts.length > 0) {
        this.logger.info('Alert evaluation completed', {
          triggeredCount: triggeredAlerts.length
        });
      }
    } catch (error) {
      this.logger.error('Alert evaluation failed', { error: error.message });
    }
  }

  /**
   * Collect system performance metrics
   */
  private async collectPerformanceMetrics(): Promise<void> {
    try {
      const metrics = await this.performanceMonitor.collectMetrics();

      // Store metrics in database
      await this.prisma.systemPerformance.create({
        data: {
          metricTimestamp: new Date(),
          cpuUsage: metrics.cpuUsage,
          memoryUsage: metrics.memoryUsage,
          diskUsage: metrics.diskUsage,
          networkIo: metrics.networkIo || {},
          dbConnections: metrics.dbConnections,
          dbSlowQueries: metrics.dbSlowQueries,
          dbAvgResponseTime: metrics.dbAvgResponseTime,
          apiRequestsPerSecond: metrics.apiRequestsPerSecond,
          apiAvgResponseTime: metrics.apiAvgResponseTime,
          apiErrorRate: metrics.apiErrorRate,
          activeSessions: metrics.activeSessions,
          concurrentBookings: metrics.concurrentBookings,
          searchQueriesPerSecond: metrics.searchQueriesPerSecond,
          paymentSuccessRate: metrics.paymentSuccessRate
        }
      });

      this.emit('performance_metrics_collected', metrics);
    } catch (error) {
      this.logger.error('Failed to collect performance metrics', { error: error.message });
    }
  }

  /**
   * Update real-time metrics cache
   */
  private async updateRealtimeMetrics(eventData: any): Promise<void> {
    try {
      // Update Redis with real-time metrics
      const tenantKey = `realtime:metrics:${eventData.tenantId || 'global'}`;
      const currentMetrics = await this.redis.hgetall(tenantKey);

      // Update relevant counters based on event type
      const updates: Record<string, string> = {};

      switch (eventData.eventCategory) {
        case 'user_action':
          updates.user_actions = String(parseInt(currentMetrics.user_actions || '0') + 1);
          break;
        case 'business':
          if (eventData.eventName === 'booking_created') {
            updates.bookings_today = String(parseInt(currentMetrics.bookings_today || '0') + 1);
          }
          break;
      }

      if (Object.keys(updates).length > 0) {
        await this.redis.hmset(tenantKey, updates);
        await this.redis.expire(tenantKey, 86400); // 24 hours
      }
    } catch (error) {
      this.logger.error('Failed to update realtime metrics', { error: error.message });
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<AnalyticsResponse<any>> {
    try {
      const health = {
        status: 'healthy',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        processingQueue: {
          total: Array.from(this.processingQueue.values()).reduce((sum, arr) => sum + arr.length, 0),
          byTenant: Object.fromEntries(
            Array.from(this.processingQueue.entries()).map(([k, v]) => [k, v.length])
          )
        },
        services: {
          database: await this.checkDatabaseHealth(),
          redis: await this.checkRedisHealth(),
          backgroundJobs: this.cronJobs.size
        }
      };

      return {
        success: true,
        data: health
      };
    } catch (error) {
      return {
        success: false,
        data: { status: 'unhealthy', error: error.message },
        errors: [error.message]
      };
    }
  }

  /**
   * Shutdown the analytics engine gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Analytics Engine...');

    // Stop cron jobs
    for (const [name, job] of this.cronJobs.entries()) {
      job.stop();
      this.logger.info(`Stopped cron job: ${name}`);
    }

    // Process remaining queued events
    if (!this.isProcessing) {
      await this.processBatch();
    }

    // Close connections
    await this.redis.quit();
    await this.prisma.$disconnect();

    this.logger.info('Analytics Engine shutdown complete');
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis health check failed', { error: error.message });
      return false;
    }
  }
}