/**
 * Model Registry - Centralized model management and versioning
 */

import { logger } from '@/utils/logger';
import { BaseModel, ModelType, ModelStatus } from '@/types';
import { WarehouseMatcherModel } from '@/models/warehouse-matcher';

export interface ModelInfo {
  model: BaseModel;
  lastAccessed: Date;
  loadCount: number;
  isActive: boolean;
}

export class ModelRegistry {
  private models = new Map<string, ModelInfo>();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('📚 Initializing Model Registry...');

      // Register all available models
      await this.registerModels();

      this.isInitialized = true;
      logger.info('✅ Model Registry initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize Model Registry:', error);
      throw error;
    }
  }

  /**
   * Register all AI/ML models
   */
  private async registerModels(): Promise<void> {
    const models: BaseModel[] = [
      new WarehouseMatcherModel(),
      // Additional models will be added here
    ];

    for (const model of models) {
      try {
        await model.initialize();
        this.models.set(model.id, {
          model,
          lastAccessed: new Date(),
          loadCount: 0,
          isActive: true
        });
        logger.info(`✅ Registered model: ${model.name} (${model.id})`);
      } catch (error) {
        logger.error(`❌ Failed to register model ${model.name}:`, error);
      }
    }
  }

  /**
   * Get a model by type
   */
  async getModel(type: ModelType): Promise<BaseModel | null> {
    const modelInfo = this.findModelByType(type);
    if (!modelInfo) {
      logger.warn(`⚠️ Model of type ${type} not found`);
      return null;
    }

    // Update access statistics
    modelInfo.lastAccessed = new Date();
    modelInfo.loadCount++;

    return modelInfo.model;
  }

  /**
   * Load a specific model by name
   */
  async loadModel(modelName: string): Promise<BaseModel | null> {
    // First try to find by ID
    let modelInfo = this.models.get(modelName);

    if (!modelInfo) {
      // Try to find by name or type
      for (const [id, info] of this.models) {
        if (info.model.name === modelName || info.model.type === modelName) {
          modelInfo = info;
          break;
        }
      }
    }

    if (!modelInfo) {
      logger.warn(`⚠️ Model ${modelName} not found in registry`);
      return null;
    }

    if (!modelInfo.isActive) {
      logger.warn(`⚠️ Model ${modelName} is not active`);
      return null;
    }

    // Ensure model is initialized
    if (modelInfo.model.status !== ModelStatus.DEPLOYED) {
      try {
        await modelInfo.model.initialize();
        modelInfo.model.status = ModelStatus.DEPLOYED;
      } catch (error) {
        logger.error(`❌ Failed to initialize model ${modelName}:`, error);
        modelInfo.model.status = ModelStatus.FAILED;
        return null;
      }
    }

    // Update access statistics
    modelInfo.lastAccessed = new Date();
    modelInfo.loadCount++;

    logger.info(`🔄 Loaded model: ${modelName}`);
    return modelInfo.model;
  }

  /**
   * Find model by type
   */
  private findModelByType(type: ModelType): ModelInfo | null {
    for (const [id, modelInfo] of this.models) {
      if (modelInfo.model.type === type && modelInfo.isActive) {
        return modelInfo;
      }
    }
    return null;
  }

  /**
   * List all registered models
   */
  listModels(): Array<{
    id: string;
    name: string;
    type: ModelType;
    status: ModelStatus;
    version: string;
    lastAccessed: Date;
    loadCount: number;
    isActive: boolean;
  }> {
    return Array.from(this.models.entries()).map(([id, info]) => ({
      id,
      name: info.model.name,
      type: info.model.type,
      status: info.model.status,
      version: info.model.version,
      lastAccessed: info.lastAccessed,
      loadCount: info.loadCount,
      isActive: info.isActive
    }));
  }

  /**
   * Get model statistics
   */
  getModelStats(modelId: string): any {
    const modelInfo = this.models.get(modelId);
    if (!modelInfo) {
      return null;
    }

    return {
      ...modelInfo.model.metadata,
      lastAccessed: modelInfo.lastAccessed,
      loadCount: modelInfo.loadCount,
      isActive: modelInfo.isActive,
      uptime: Date.now() - modelInfo.model.createdAt.getTime()
    };
  }

  /**
   * Activate/deactivate a model
   */
  setModelStatus(modelId: string, isActive: boolean): boolean {
    const modelInfo = this.models.get(modelId);
    if (!modelInfo) {
      return false;
    }

    modelInfo.isActive = isActive;
    logger.info(`🔄 Model ${modelId} ${isActive ? 'activated' : 'deactivated'}`);
    return true;
  }

  /**
   * Register a new model
   */
  async registerModel(model: BaseModel): Promise<boolean> {
    try {
      await model.initialize();

      this.models.set(model.id, {
        model,
        lastAccessed: new Date(),
        loadCount: 0,
        isActive: true
      });

      logger.info(`✅ Registered new model: ${model.name} (${model.id})`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to register model ${model.name}:`, error);
      return false;
    }
  }

  /**
   * Unregister a model
   */
  unregisterModel(modelId: string): boolean {
    const removed = this.models.delete(modelId);
    if (removed) {
      logger.info(`🗑️ Unregistered model: ${modelId}`);
    }
    return removed;
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    if (!this.isInitialized) {
      return false;
    }

    // Check if at least one model is healthy
    for (const [id, modelInfo] of this.models) {
      if (modelInfo.isActive && modelInfo.model.status === ModelStatus.DEPLOYED) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get overall registry status
   */
  getStatus(): {
    isInitialized: boolean;
    totalModels: number;
    activeModels: number;
    deployedModels: number;
    failedModels: number;
  } {
    let activeModels = 0;
    let deployedModels = 0;
    let failedModels = 0;

    for (const [id, modelInfo] of this.models) {
      if (modelInfo.isActive) activeModels++;
      if (modelInfo.model.status === ModelStatus.DEPLOYED) deployedModels++;
      if (modelInfo.model.status === ModelStatus.FAILED) failedModels++;
    }

    return {
      isInitialized: this.isInitialized,
      totalModels: this.models.size,
      activeModels,
      deployedModels,
      failedModels
    };
  }
}