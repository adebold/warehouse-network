/**
 * AI/ML API Server
 * RESTful API for all AI/ML services
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from '@/utils/logger';
import { AIManager } from '@/services/ai-manager';
import { ModelRegistry } from '@/services/model-registry';
import { InferenceEngine } from '@/services/inference-engine';
import { PipelineOrchestrator } from '@/pipelines/orchestrator';
import { MLOpsManager } from '@/services/mlops-manager';
import { DatabaseManager } from '@/utils/database';
import { RedisManager } from '@/utils/redis';
import {
  WarehouseMatchingInput,
  PricingOptimizationInput,
  PredictiveMaintenanceInput,
  InventoryOptimizationInput,
  FraudDetectionInput,
  BehaviorAnalysisInput,
  DemandForecastingInput,
  ChatbotInput,
  APIResponse
} from '@/types';

export class AIAPIServer {
  private app: Application;
  private aiManager: AIManager;
  private modelRegistry: ModelRegistry;
  private inferenceEngine: InferenceEngine;
  private pipelineOrchestrator: PipelineOrchestrator;
  private mlopsManager: MLOpsManager;
  private databaseManager: DatabaseManager;
  private redisManager: RedisManager;
  private server: any = null;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeServices();
  }

  /**
   * Initialize all AI services
   */
  private async initializeServices(): Promise<void> {
    try {
      logger.info('🚀 Initializing AI API services...');

      // Initialize infrastructure
      this.databaseManager = new DatabaseManager();
      await this.databaseManager.connect();

      this.redisManager = new RedisManager();
      await this.redisManager.connect();

      // Initialize AI services
      this.modelRegistry = new ModelRegistry();
      await this.modelRegistry.initialize();

      this.inferenceEngine = new InferenceEngine();
      await this.inferenceEngine.initialize();

      this.pipelineOrchestrator = new PipelineOrchestrator();
      await this.pipelineOrchestrator.initialize();

      this.mlopsManager = new MLOpsManager();
      await this.mlopsManager.initialize();

      // Initialize AI manager
      this.aiManager = new AIManager({
        modelRegistry: this.modelRegistry,
        inferenceEngine: this.inferenceEngine,
        pipelineOrchestrator: this.pipelineOrchestrator,
        mlopsManager: this.mlopsManager
      });
      await this.aiManager.initialize();

      logger.info('✅ All AI API services initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize AI API services:', error);
      throw error;
    }
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      });
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const router = express.Router();

    // Health check
    router.get('/health', this.handleHealthCheck.bind(this));

    // Warehouse matching endpoints
    router.post('/warehouse/match', this.handleWarehouseMatching.bind(this));

    // Pricing optimization endpoints
    router.post('/pricing/optimize', this.handlePricingOptimization.bind(this));

    // Predictive maintenance endpoints
    router.post('/maintenance/predict', this.handlePredictiveMaintenance.bind(this));

    // Inventory optimization endpoints
    router.post('/inventory/optimize', this.handleInventoryOptimization.bind(this));

    // Fraud detection endpoints
    router.post('/fraud/detect', this.handleFraudDetection.bind(this));

    // Behavior analysis endpoints
    router.post('/behavior/analyze', this.handleBehaviorAnalysis.bind(this));

    // Demand forecasting endpoints
    router.post('/demand/forecast', this.handleDemandForecasting.bind(this));

    // Chatbot endpoints
    router.post('/chatbot/process', this.handleChatbotProcessing.bind(this));

    // Model management endpoints
    router.get('/models', this.handleListModels.bind(this));
    router.get('/models/:id', this.handleGetModel.bind(this));
    router.get('/models/:id/stats', this.handleGetModelStats.bind(this));

    // Inference engine endpoints
    router.get('/inference/metrics', this.handleInferenceMetrics.bind(this));
    router.post('/inference/cache/clear', this.handleClearCache.bind(this));

    // MLOps endpoints
    router.get('/mlops/status', this.handleMLOpsStatus.bind(this));
    router.get('/mlops/metrics', this.handleMLOpsMetrics.bind(this));

    // Batch processing endpoints
    router.post('/batch/warehouse-match', this.handleBatchWarehouseMatching.bind(this));
    router.post('/batch/pricing-optimize', this.handleBatchPricingOptimization.bind(this));

    // Mount routes
    this.app.use('/api/v1', router);

    // Error handling
    this.app.use(this.handleErrors.bind(this));

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });
  }

  /**
   * Health check endpoint
   */
  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.aiManager.getHealthStatus();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Warehouse matching endpoint
   */
  private async handleWarehouseMatching(req: Request, res: Response): Promise<void> {
    try {
      const input: WarehouseMatchingInput = req.body;
      const result = await this.aiManager.matchWarehouses(input);
      res.json(result);
    } catch (error) {
      this.handleError(res, error, 'Warehouse matching failed');
    }
  }

  /**
   * Pricing optimization endpoint
   */
  private async handlePricingOptimization(req: Request, res: Response): Promise<void> {
    try {
      const input: PricingOptimizationInput = req.body;
      const result = await this.aiManager.optimizePricing(input);
      res.json(result);
    } catch (error) {
      this.handleError(res, error, 'Pricing optimization failed');
    }
  }

  /**
   * Predictive maintenance endpoint
   */
  private async handlePredictiveMaintenance(req: Request, res: Response): Promise<void> {
    try {
      const input: PredictiveMaintenanceInput = req.body;
      const result = await this.aiManager.predictMaintenance(input);
      res.json(result);
    } catch (error) {
      this.handleError(res, error, 'Predictive maintenance failed');
    }
  }

  /**
   * Inventory optimization endpoint
   */
  private async handleInventoryOptimization(req: Request, res: Response): Promise<void> {
    try {
      const input: InventoryOptimizationInput = req.body;
      const result = await this.aiManager.optimizeInventory(input);
      res.json(result);
    } catch (error) {
      this.handleError(res, error, 'Inventory optimization failed');
    }
  }

  /**
   * Fraud detection endpoint
   */
  private async handleFraudDetection(req: Request, res: Response): Promise<void> {
    try {
      const input: FraudDetectionInput = req.body;
      const result = await this.aiManager.detectFraud(input);
      res.json(result);
    } catch (error) {
      this.handleError(res, error, 'Fraud detection failed');
    }
  }

  /**
   * Behavior analysis endpoint
   */
  private async handleBehaviorAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const input: BehaviorAnalysisInput = req.body;
      const result = await this.aiManager.analyzeBehavior(input);
      res.json(result);
    } catch (error) {
      this.handleError(res, error, 'Behavior analysis failed');
    }
  }

  /**
   * Demand forecasting endpoint
   */
  private async handleDemandForecasting(req: Request, res: Response): Promise<void> {
    try {
      const input: DemandForecastingInput = req.body;
      const result = await this.aiManager.forecastDemand(input);
      res.json(result);
    } catch (error) {
      this.handleError(res, error, 'Demand forecasting failed');
    }
  }

  /**
   * Chatbot processing endpoint
   */
  private async handleChatbotProcessing(req: Request, res: Response): Promise<void> {
    try {
      const input: ChatbotInput = req.body;
      const result = await this.aiManager.processChatbot(input);
      res.json(result);
    } catch (error) {
      this.handleError(res, error, 'Chatbot processing failed');
    }
  }

  /**
   * List models endpoint
   */
  private async handleListModels(req: Request, res: Response): Promise<void> {
    try {
      const models = this.modelRegistry.listModels();
      res.json({
        success: true,
        data: models,
        metadata: {
          count: models.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to list models');
    }
  }

  /**
   * Get model endpoint
   */
  private async handleGetModel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const model = await this.modelRegistry.loadModel(id);

      if (!model) {
        res.status(404).json({
          success: false,
          error: `Model '${id}' not found`
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: model.id,
          name: model.name,
          version: model.version,
          type: model.type,
          status: model.status,
          metadata: model.metadata,
          createdAt: model.createdAt,
          updatedAt: model.updatedAt
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to get model');
    }
  }

  /**
   * Get model stats endpoint
   */
  private async handleGetModelStats(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const stats = this.modelRegistry.getModelStats(id);

      if (!stats) {
        res.status(404).json({
          success: false,
          error: `Model stats for '${id}' not found`
        });
        return;
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to get model stats');
    }
  }

  /**
   * Inference metrics endpoint
   */
  private async handleInferenceMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = this.inferenceEngine.getMetrics();
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to get inference metrics');
    }
  }

  /**
   * Clear cache endpoint
   */
  private async handleClearCache(req: Request, res: Response): Promise<void> {
    try {
      const { modelType } = req.body;
      await this.inferenceEngine.clearCache(modelType);
      res.json({
        success: true,
        message: modelType ? `Cache cleared for ${modelType}` : 'All cache cleared'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to clear cache');
    }
  }

  /**
   * MLOps status endpoint
   */
  private async handleMLOpsStatus(req: Request, res: Response): Promise<void> {
    try {
      // Would get actual MLOps status in production
      res.json({
        success: true,
        data: {
          status: 'healthy',
          services: {
            training: true,
            monitoring: true,
            deployment: true
          }
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to get MLOps status');
    }
  }

  /**
   * MLOps metrics endpoint
   */
  private async handleMLOpsMetrics(req: Request, res: Response): Promise<void> {
    try {
      // Would get actual MLOps metrics in production
      res.json({
        success: true,
        data: {
          predictions: 12500,
          accuracy: 0.89,
          latency: 45,
          errors: 12
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to get MLOps metrics');
    }
  }

  /**
   * Batch warehouse matching endpoint
   */
  private async handleBatchWarehouseMatching(req: Request, res: Response): Promise<void> {
    try {
      const { inputs } = req.body;
      const results = [];

      for (const input of inputs) {
        const result = await this.aiManager.matchWarehouses(input);
        results.push(result);
      }

      res.json({
        success: true,
        data: results,
        metadata: {
          batchSize: inputs.length,
          processingTime: Date.now()
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Batch warehouse matching failed');
    }
  }

  /**
   * Batch pricing optimization endpoint
   */
  private async handleBatchPricingOptimization(req: Request, res: Response): Promise<void> {
    try {
      const { inputs } = req.body;
      const results = [];

      for (const input of inputs) {
        const result = await this.aiManager.optimizePricing(input);
        results.push(result);
      }

      res.json({
        success: true,
        data: results,
        metadata: {
          batchSize: inputs.length,
          processingTime: Date.now()
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Batch pricing optimization failed');
    }
  }

  /**
   * Error handling middleware
   */
  private handleErrors(error: any, req: Request, res: Response, next: NextFunction): void {
    logger.error('API Error:', error);

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    });
  }

  /**
   * Generic error handler
   */
  private handleError(res: Response, error: any, message: string): void {
    logger.error(message, error);

    res.status(500).json({
      success: false,
      error: message,
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start the API server
   */
  async start(port: number = 3001): Promise<void> {
    try {
      await this.initializeServices();

      this.server = this.app.listen(port, () => {
        logger.info(`🚀 AI/ML API Server running on port ${port}`);
        logger.info(`📊 Health check: http://localhost:${port}/api/v1/health`);
        logger.info(`📖 API docs: http://localhost:${port}/api/v1/docs`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully');
        this.shutdown();
      });

      process.on('SIGINT', () => {
        logger.info('SIGINT received, shutting down gracefully');
        this.shutdown();
      });
    } catch (error) {
      logger.error('❌ Failed to start AI API server:', error);
      throw error;
    }
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('🔄 Shutting down AI API server...');

      // Close HTTP server
      if (this.server) {
        this.server.close();
      }

      // Shutdown AI services
      if (this.aiManager) {
        await this.aiManager.shutdown?.();
      }
      if (this.inferenceEngine) {
        await this.inferenceEngine.shutdown();
      }
      if (this.redisManager) {
        await this.redisManager.disconnect();
      }
      if (this.databaseManager) {
        await this.databaseManager.disconnect();
      }

      logger.info('✅ AI API server shut down complete');
    } catch (error) {
      logger.error('❌ Error during server shutdown:', error);
    }
  }
}

// Export server instance
export default AIAPIServer;