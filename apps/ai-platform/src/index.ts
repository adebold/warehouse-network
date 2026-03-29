/**
 * AI/ML Platform Entry Point
 * Enterprise-grade machine learning platform for warehouse marketplace
 */

import 'reflect-metadata';
import { config } from 'dotenv';
import { logger } from '@/utils/logger';
import { AIManager } from '@/services/ai-manager';
import { DatabaseManager } from '@/utils/database';
import { RedisManager } from '@/utils/redis';
import { ModelRegistry } from '@/services/model-registry';
import { PipelineOrchestrator } from '@/pipelines/orchestrator';
import { InferenceEngine } from '@/services/inference-engine';
import { MLOpsManager } from '@/services/mlops-manager';

// Load environment configuration
config();

/**
 * AI Platform Main Class
 * Coordinates all AI/ML services and components
 */
class AIPlatform {
  private static instance: AIPlatform;
  private isInitialized = false;

  public aiManager!: AIManager;
  public databaseManager!: DatabaseManager;
  public redisManager!: RedisManager;
  public modelRegistry!: ModelRegistry;
  public pipelineOrchestrator!: PipelineOrchestrator;
  public inferenceEngine!: InferenceEngine;
  public mlopsManager!: MLOpsManager;

  static getInstance(): AIPlatform {
    if (!AIPlatform.instance) {
      AIPlatform.instance = new AIPlatform();
    }
    return AIPlatform.instance;
  }

  /**
   * Initialize the AI platform with all services
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('AI Platform already initialized');
      return;
    }

    try {
      logger.info('🚀 Initializing AI/ML Platform...');

      // Initialize core infrastructure
      this.databaseManager = new DatabaseManager();
      await this.databaseManager.connect();
      logger.info('✅ Database connected');

      this.redisManager = new RedisManager();
      await this.redisManager.connect();
      logger.info('✅ Redis connected');

      // Initialize AI services
      this.modelRegistry = new ModelRegistry();
      await this.modelRegistry.initialize();
      logger.info('✅ Model Registry initialized');

      this.inferenceEngine = new InferenceEngine();
      await this.inferenceEngine.initialize();
      logger.info('✅ Inference Engine initialized');

      this.pipelineOrchestrator = new PipelineOrchestrator();
      await this.pipelineOrchestrator.initialize();
      logger.info('✅ Pipeline Orchestrator initialized');

      this.mlopsManager = new MLOpsManager();
      await this.mlopsManager.initialize();
      logger.info('✅ MLOps Manager initialized');

      this.aiManager = new AIManager({
        modelRegistry: this.modelRegistry,
        inferenceEngine: this.inferenceEngine,
        pipelineOrchestrator: this.pipelineOrchestrator,
        mlopsManager: this.mlopsManager
      });
      await this.aiManager.initialize();
      logger.info('✅ AI Manager initialized');

      // Load and validate all models
      await this.loadModels();

      // Start background services
      await this.startServices();

      this.isInitialized = true;
      logger.info('🎉 AI Platform fully initialized and ready');
    } catch (error) {
      logger.error('❌ Failed to initialize AI Platform:', error);
      throw error;
    }
  }

  /**
   * Load all AI/ML models
   */
  private async loadModels(): Promise<void> {
    const models = [
      'warehouse-matcher',
      'pricing-optimizer',
      'maintenance-predictor',
      'inventory-optimizer',
      'fraud-detector',
      'behavior-analyzer',
      'demand-forecaster'
    ];

    for (const modelName of models) {
      try {
        await this.modelRegistry.loadModel(modelName);
        logger.info(`✅ Loaded model: ${modelName}`);
      } catch (error) {
        logger.warn(`⚠️ Failed to load model ${modelName}:`, error);
      }
    }
  }

  /**
   * Start background services
   */
  private async startServices(): Promise<void> {
    // Start model training scheduler
    await this.mlopsManager.startScheduler();
    logger.info('✅ MLOps scheduler started');

    // Start data pipeline processors
    await this.pipelineOrchestrator.startProcessors();
    logger.info('✅ Pipeline processors started');

    // Start model monitoring
    await this.mlopsManager.startMonitoring();
    logger.info('✅ Model monitoring started');

    // Start inference cache warming
    await this.inferenceEngine.warmCache();
    logger.info('✅ Inference cache warmed');
  }

  /**
   * Graceful shutdown of the platform
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    logger.info('🔄 Shutting down AI Platform...');

    try {
      // Stop services in reverse order
      if (this.mlopsManager) {
        await this.mlopsManager.shutdown();
        logger.info('✅ MLOps Manager stopped');
      }

      if (this.pipelineOrchestrator) {
        await this.pipelineOrchestrator.shutdown();
        logger.info('✅ Pipeline Orchestrator stopped');
      }

      if (this.inferenceEngine) {
        await this.inferenceEngine.shutdown();
        logger.info('✅ Inference Engine stopped');
      }

      if (this.redisManager) {
        await this.redisManager.disconnect();
        logger.info('✅ Redis disconnected');
      }

      if (this.databaseManager) {
        await this.databaseManager.disconnect();
        logger.info('✅ Database disconnected');
      }

      this.isInitialized = false;
      logger.info('✅ AI Platform shutdown complete');
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Health check for the platform
   */
  async healthCheck(): Promise<{ status: string; services: Record<string, boolean> }> {
    const services = {
      database: this.databaseManager?.isConnected() || false,
      redis: this.redisManager?.isConnected() || false,
      modelRegistry: this.modelRegistry?.isHealthy() || false,
      inferenceEngine: this.inferenceEngine?.isHealthy() || false,
      pipelineOrchestrator: this.pipelineOrchestrator?.isHealthy() || false,
      mlopsManager: this.mlopsManager?.isHealthy() || false
    };

    const allHealthy = Object.values(services).every(healthy => healthy);

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      services
    };
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await AIPlatform.getInstance().shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await AIPlatform.getInstance().shutdown();
  process.exit(0);
});

// Main execution
async function main(): Promise<void> {
  try {
    const platform = AIPlatform.getInstance();
    await platform.initialize();

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    logger.error('Failed to start AI Platform:', error);
    process.exit(1);
  }
}

// Export platform instance and main function
export { AIPlatform, main };
export default AIPlatform;

// Start the platform if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}