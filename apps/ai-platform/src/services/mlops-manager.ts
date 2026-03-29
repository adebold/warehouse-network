/**
 * MLOps Manager - Model lifecycle management, monitoring, and automation
 */

import { logger, mlLogger } from '@/utils/logger';
import { RedisManager } from '@/utils/redis';
import { DatabaseManager } from '@/utils/database';
import { ModelType } from '@/types';

export interface ModelPerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  latency: number;
  throughput: number;
  errorRate: number;
  lastUpdated: Date;
}

export interface PredictionLog {
  id: string;
  modelType: ModelType;
  modelVersion: string;
  input: any;
  output: any;
  latency: number;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  warehouseId?: string;
  equipmentId?: string;
  riskScore?: number;
  confidence?: number;
  timeHorizon?: number;
}

export interface ModelAlert {
  id: string;
  modelType: ModelType;
  alertType: 'performance_degradation' | 'high_latency' | 'error_rate' | 'data_drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metrics: Record<string, number>;
  timestamp: Date;
  resolved: boolean;
}

export class MLOpsManager {
  private redisManager: RedisManager | null = null;
  private databaseManager: DatabaseManager | null = null;
  private isInitialized = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private trainingScheduler: NodeJS.Timeout | null = null;

  // Performance tracking
  private modelMetrics = new Map<ModelType, ModelPerformanceMetrics>();
  private predictionLogs: PredictionLog[] = [];
  private alerts: ModelAlert[] = [];

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('🔧 Initializing MLOps Manager...');

      this.redisManager = new RedisManager();
      await this.redisManager.connect();

      this.databaseManager = new DatabaseManager();
      await this.databaseManager.connect();

      // Initialize metrics for all model types
      await this.initializeModelMetrics();

      // Load historical data
      await this.loadHistoricalMetrics();

      this.isInitialized = true;
      logger.info('✅ MLOps Manager initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize MLOps Manager:', error);
      throw error;
    }
  }

  /**
   * Log a prediction for monitoring and analysis
   */
  async logPrediction(log: Omit<PredictionLog, 'id' | 'timestamp'>): Promise<void> {
    try {
      const predictionLog: PredictionLog = {
        ...log,
        id: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date()
      };

      // Store in memory for immediate analysis
      this.predictionLogs.push(predictionLog);

      // Keep only last 1000 predictions in memory
      if (this.predictionLogs.length > 1000) {
        this.predictionLogs = this.predictionLogs.slice(-1000);
      }

      // Store in Redis for real-time access
      if (this.redisManager) {
        await this.redisManager.lpush(
          `predictions:${log.modelType}`,
          JSON.stringify(predictionLog)
        );

        // Keep only last 100 predictions per model in Redis
        await this.redisManager.getClient()?.ltrim(`predictions:${log.modelType}`, 0, 99);
      }

      // Store in database for long-term analytics (async)
      this.storePredictionInDatabase(predictionLog).catch(error =>
        logger.error('Failed to store prediction in database:', error)
      );

      // Update real-time metrics
      await this.updateModelMetrics(log.modelType, log);

      mlLogger.inference(log.modelType, log.latency);
    } catch (error) {
      logger.error('❌ Failed to log prediction:', error);
    }
  }

  /**
   * Start model monitoring
   */
  async startMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      return;
    }

    logger.info('📊 Starting model monitoring...');

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runMonitoringChecks();
      } catch (error) {
        logger.error('❌ Monitoring check failed:', error);
      }
    }, 60000); // Check every minute

    logger.info('✅ Model monitoring started');
  }

  /**
   * Start training scheduler
   */
  async startScheduler(): Promise<void> {
    if (this.trainingScheduler) {
      return;
    }

    logger.info('⏰ Starting training scheduler...');

    // Run training checks every hour
    this.trainingScheduler = setInterval(async () => {
      try {
        await this.checkTrainingNeeds();
      } catch (error) {
        logger.error('❌ Training scheduler check failed:', error);
      }
    }, 3600000); // Check every hour

    logger.info('✅ Training scheduler started');
  }

  /**
   * Get model performance metrics
   */
  getModelMetrics(modelType: ModelType): ModelPerformanceMetrics | null {
    return this.modelMetrics.get(modelType) || null;
  }

  /**
   * Get all model metrics
   */
  getAllModelMetrics(): Record<string, ModelPerformanceMetrics> {
    const metrics: Record<string, ModelPerformanceMetrics> = {};
    for (const [modelType, metric] of this.modelMetrics) {
      metrics[modelType] = metric;
    }
    return metrics;
  }

  /**
   * Get recent predictions for a model
   */
  async getRecentPredictions(
    modelType: ModelType,
    limit: number = 50
  ): Promise<PredictionLog[]> {
    if (!this.redisManager) {
      return this.predictionLogs
        .filter(log => log.modelType === modelType)
        .slice(-limit);
    }

    try {
      const logs = await this.redisManager.lrange(`predictions:${modelType}`, 0, limit - 1);
      return logs.map(log => JSON.parse(log));
    } catch (error) {
      logger.error('❌ Failed to get recent predictions:', error);
      return [];
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): ModelAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      logger.info(`📢 Alert resolved: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Trigger model retraining
   */
  async triggerRetraining(
    modelType: ModelType,
    reason: string = 'Manual trigger'
  ): Promise<void> {
    try {
      logger.info(`🎯 Triggering retraining for ${modelType}: ${reason}`);

      // Create retraining job
      const job = {
        id: `retrain_${modelType}_${Date.now()}`,
        modelType,
        reason,
        status: 'pending',
        createdAt: new Date()
      };

      // Store job in Redis
      if (this.redisManager) {
        await this.redisManager.lpush('training_jobs', JSON.stringify(job));
      }

      mlLogger.training(modelType, 0, { status: 'triggered', reason });
    } catch (error) {
      logger.error(`❌ Failed to trigger retraining for ${modelType}:`, error);
    }
  }

  /**
   * Run A/B test between model versions
   */
  async runABTest(
    modelType: ModelType,
    controlVersion: string,
    treatmentVersion: string,
    trafficSplit: number = 0.5
  ): Promise<string> {
    try {
      const testId = `ab_${modelType}_${Date.now()}`;

      const testConfig = {
        id: testId,
        modelType,
        controlVersion,
        treatmentVersion,
        trafficSplit,
        startDate: new Date(),
        status: 'active',
        metrics: {
          control: { predictions: 0, avgLatency: 0, avgAccuracy: 0 },
          treatment: { predictions: 0, avgLatency: 0, avgAccuracy: 0 }
        }
      };

      // Store A/B test config
      if (this.redisManager) {
        await this.redisManager.set(`ab_test:${testId}`, JSON.stringify(testConfig));
      }

      logger.info(`🧪 Started A/B test: ${testId} for ${modelType}`);
      mlLogger.abTest(testId, 'started', testConfig.metrics);

      return testId;
    } catch (error) {
      logger.error(`❌ Failed to start A/B test for ${modelType}:`, error);
      throw error;
    }
  }

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<{
    status: string;
    metrics: Record<string, any>;
    alerts: number;
    uptime: number;
  }> {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');

    let status = 'healthy';
    if (criticalAlerts.length > 0) {
      status = 'critical';
    } else if (activeAlerts.length > 5) {
      status = 'warning';
    }

    return {
      status,
      metrics: this.getAllModelMetrics(),
      alerts: activeAlerts.length,
      uptime: process.uptime()
    };
  }

  /**
   * Initialize metrics for all model types
   */
  private async initializeModelMetrics(): Promise<void> {
    const modelTypes = Object.values(ModelType);

    for (const modelType of modelTypes) {
      this.modelMetrics.set(modelType, {
        accuracy: 0.85, // Default values
        precision: 0.83,
        recall: 0.87,
        f1Score: 0.85,
        latency: 100,
        throughput: 10,
        errorRate: 0.02,
        lastUpdated: new Date()
      });
    }

    logger.info('✅ Model metrics initialized for all model types');
  }

  /**
   * Load historical metrics from database
   */
  private async loadHistoricalMetrics(): Promise<void> {
    try {
      // In production, load from actual database
      logger.info('📈 Loading historical metrics...');

      // Mock loading - replace with actual database queries
      const historicalMetrics = {
        [ModelType.WAREHOUSE_MATCHING]: {
          accuracy: 0.92,
          precision: 0.89,
          recall: 0.94,
          f1Score: 0.91,
          latency: 85,
          throughput: 12,
          errorRate: 0.01,
          lastUpdated: new Date()
        },
        [ModelType.PRICING_OPTIMIZATION]: {
          accuracy: 0.89,
          precision: 0.87,
          recall: 0.91,
          f1Score: 0.89,
          latency: 120,
          throughput: 8,
          errorRate: 0.015,
          lastUpdated: new Date()
        }
      };

      for (const [modelType, metrics] of Object.entries(historicalMetrics)) {
        this.modelMetrics.set(modelType as ModelType, metrics);
      }

      logger.info('✅ Historical metrics loaded');
    } catch (error) {
      logger.error('❌ Failed to load historical metrics:', error);
    }
  }

  /**
   * Update model metrics based on new prediction
   */
  private async updateModelMetrics(
    modelType: ModelType,
    log: Omit<PredictionLog, 'id' | 'timestamp'>
  ): Promise<void> {
    const currentMetrics = this.modelMetrics.get(modelType);
    if (!currentMetrics) {
      return;
    }

    // Update latency with exponential moving average
    const alpha = 0.1; // Smoothing factor
    currentMetrics.latency = currentMetrics.latency * (1 - alpha) + log.latency * alpha;

    // Update throughput (predictions per second)
    currentMetrics.throughput = this.calculateThroughput(modelType);

    // Update error rate if prediction failed (would check log.error in real implementation)
    // For now, assume all predictions succeed

    currentMetrics.lastUpdated = new Date();

    mlLogger.performance(modelType, {
      latency: currentMetrics.latency,
      throughput: currentMetrics.throughput,
      errorRate: currentMetrics.errorRate
    });
  }

  /**
   * Calculate throughput for a model
   */
  private calculateThroughput(modelType: ModelType): number {
    const recentPredictions = this.predictionLogs.filter(
      log => log.modelType === modelType &&
             Date.now() - log.timestamp.getTime() < 60000 // Last minute
    );

    return recentPredictions.length; // Predictions per minute
  }

  /**
   * Run monitoring checks
   */
  private async runMonitoringChecks(): Promise<void> {
    for (const [modelType, metrics] of this.modelMetrics) {
      await this.checkModelHealth(modelType, metrics);
    }

    // Clean up old alerts
    this.cleanupOldAlerts();
  }

  /**
   * Check individual model health
   */
  private async checkModelHealth(
    modelType: ModelType,
    metrics: ModelPerformanceMetrics
  ): Promise<void> {
    const alerts: ModelAlert[] = [];

    // Check latency
    if (metrics.latency > 500) {
      alerts.push({
        id: `alert_${Date.now()}_latency`,
        modelType,
        alertType: 'high_latency',
        severity: metrics.latency > 1000 ? 'critical' : 'high',
        message: `High latency detected: ${metrics.latency.toFixed(2)}ms`,
        metrics: { latency: metrics.latency, threshold: 500 },
        timestamp: new Date(),
        resolved: false
      });
    }

    // Check error rate
    if (metrics.errorRate > 0.05) {
      alerts.push({
        id: `alert_${Date.now()}_error`,
        modelType,
        alertType: 'error_rate',
        severity: metrics.errorRate > 0.1 ? 'critical' : 'high',
        message: `High error rate detected: ${(metrics.errorRate * 100).toFixed(2)}%`,
        metrics: { errorRate: metrics.errorRate, threshold: 0.05 },
        timestamp: new Date(),
        resolved: false
      });
    }

    // Check accuracy degradation
    const expectedAccuracy = 0.85; // Baseline
    if (metrics.accuracy < expectedAccuracy * 0.9) {
      alerts.push({
        id: `alert_${Date.now()}_accuracy`,
        modelType,
        alertType: 'performance_degradation',
        severity: metrics.accuracy < expectedAccuracy * 0.8 ? 'critical' : 'medium',
        message: `Accuracy degradation detected: ${(metrics.accuracy * 100).toFixed(2)}%`,
        metrics: { accuracy: metrics.accuracy, expected: expectedAccuracy },
        timestamp: new Date(),
        resolved: false
      });
    }

    // Add new alerts
    for (const alert of alerts) {
      this.addAlert(alert);
    }
  }

  /**
   * Add a new alert
   */
  private addAlert(alert: ModelAlert): void {
    // Check if similar alert already exists
    const existingAlert = this.alerts.find(
      a => a.modelType === alert.modelType &&
           a.alertType === alert.alertType &&
           !a.resolved &&
           Date.now() - a.timestamp.getTime() < 300000 // 5 minutes
    );

    if (!existingAlert) {
      this.alerts.push(alert);
      logger.warn(`🚨 New alert: ${alert.message}`);
    }
  }

  /**
   * Clean up old alerts
   */
  private cleanupOldAlerts(): void {
    const oneHourAgo = Date.now() - 3600000;
    this.alerts = this.alerts.filter(
      alert => alert.timestamp.getTime() > oneHourAgo || !alert.resolved
    );
  }

  /**
   * Check if models need retraining
   */
  private async checkTrainingNeeds(): Promise<void> {
    for (const [modelType, metrics] of this.modelMetrics) {
      const needsRetraining = await this.shouldRetrain(modelType, metrics);

      if (needsRetraining.needed) {
        await this.triggerRetraining(modelType, needsRetraining.reason);
      }
    }
  }

  /**
   * Determine if a model should be retrained
   */
  private async shouldRetrain(
    modelType: ModelType,
    metrics: ModelPerformanceMetrics
  ): Promise<{ needed: boolean; reason: string }> {
    // Check accuracy threshold
    if (metrics.accuracy < 0.8) {
      return { needed: true, reason: 'Accuracy below threshold' };
    }

    // Check data staleness
    const daysSinceUpdate = (Date.now() - metrics.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 7) {
      return { needed: true, reason: 'Data is stale (>7 days)' };
    }

    // Check prediction volume for data drift
    const recentPredictions = await this.getRecentPredictions(modelType, 100);
    if (recentPredictions.length > 1000) {
      return { needed: true, reason: 'High prediction volume suggests concept drift' };
    }

    return { needed: false, reason: '' };
  }

  /**
   * Store prediction in database (async)
   */
  private async storePredictionInDatabase(log: PredictionLog): Promise<void> {
    try {
      // In production, store in actual database
      // For now, just log the operation
      mlLogger.pipeline('prediction_storage', 'database_write', 0, 1);
    } catch (error) {
      logger.error('❌ Failed to store prediction in database:', error);
    }
  }

  /**
   * Shutdown MLOps services
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('🔄 Shutting down MLOps Manager...');

      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      if (this.trainingScheduler) {
        clearInterval(this.trainingScheduler);
        this.trainingScheduler = null;
      }

      this.isInitialized = false;
      logger.info('✅ MLOps Manager shut down');
    } catch (error) {
      logger.error('❌ Error shutting down MLOps Manager:', error);
    }
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return this.isInitialized &&
           this.redisManager?.isConnected() &&
           this.databaseManager?.isConnected();
  }
}