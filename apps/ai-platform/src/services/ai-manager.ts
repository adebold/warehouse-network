/**
 * AI Manager - Central coordinator for all AI/ML operations
 * Orchestrates model inference, training, and management
 */

import { logger } from '@/utils/logger';
import { ModelRegistry } from './model-registry';
import { InferenceEngine } from './inference-engine';
import { PipelineOrchestrator } from '@/pipelines/orchestrator';
import { MLOpsManager } from './mlops-manager';
import {
  ModelType,
  WarehouseMatchingInput,
  WarehouseMatchingOutput,
  PricingOptimizationInput,
  PricingOptimizationOutput,
  PredictiveMaintenanceInput,
  PredictiveMaintenanceOutput,
  InventoryOptimizationInput,
  InventoryOptimizationOutput,
  FraudDetectionInput,
  FraudDetectionOutput,
  BehaviorAnalysisInput,
  BehaviorAnalysisOutput,
  DemandForecastingInput,
  DemandForecastingOutput,
  ChatbotInput,
  ChatbotOutput,
  APIResponse
} from '@/types';

export interface AIManagerConfig {
  modelRegistry: ModelRegistry;
  inferenceEngine: InferenceEngine;
  pipelineOrchestrator: PipelineOrchestrator;
  mlopsManager: MLOpsManager;
}

export class AIManager {
  private modelRegistry: ModelRegistry;
  private inferenceEngine: InferenceEngine;
  private pipelineOrchestrator: PipelineOrchestrator;
  private mlopsManager: MLOpsManager;
  private isInitialized = false;

  constructor(config: AIManagerConfig) {
    this.modelRegistry = config.modelRegistry;
    this.inferenceEngine = config.inferenceEngine;
    this.pipelineOrchestrator = config.pipelineOrchestrator;
    this.mlopsManager = config.mlopsManager;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info('🧠 Initializing AI Manager...');

    try {
      // Initialize all dependent services
      await Promise.all([
        this.modelRegistry.initialize(),
        this.inferenceEngine.initialize(),
        this.pipelineOrchestrator.initialize(),
        this.mlopsManager.initialize()
      ]);

      this.isInitialized = true;
      logger.info('✅ AI Manager initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize AI Manager:', error);
      throw error;
    }
  }

  /**
   * Intelligent Warehouse Matching
   * Uses ML to match customers with optimal warehouses
   */
  async matchWarehouses(input: WarehouseMatchingInput): Promise<APIResponse<WarehouseMatchingOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`🏗️ Processing warehouse matching for customer: ${input.customerId}`);

      // Validate model availability
      const model = await this.modelRegistry.getModel(ModelType.WAREHOUSE_MATCHING);
      if (!model || model.status !== 'deployed') {
        throw new Error('Warehouse matching model not available');
      }

      // Preprocess input data
      const processedInput = await this.preprocessWarehouseMatchingInput(input);

      // Run inference
      const result = await this.inferenceEngine.predict<WarehouseMatchingInput, WarehouseMatchingOutput>(
        ModelType.WAREHOUSE_MATCHING,
        processedInput
      );

      // Post-process and enhance results
      const enhancedResult = await this.postprocessWarehouseMatching(result, input);

      // Log metrics
      await this.mlopsManager.logPrediction({
        modelType: ModelType.WAREHOUSE_MATCHING,
        input: processedInput,
        output: enhancedResult,
        latency: Date.now() - startTime,
        userId: input.customerId
      });

      return {
        success: true,
        data: enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: model.version,
          confidence: this.calculateOverallConfidence(enhancedResult.matches)
        }
      };
    } catch (error) {
      logger.error('❌ Warehouse matching failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: 'unknown'
        }
      };
    }
  }

  /**
   * Dynamic Pricing Optimization
   * Calculates optimal pricing based on market conditions and demand
   */
  async optimizePricing(input: PricingOptimizationInput): Promise<APIResponse<PricingOptimizationOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`💰 Processing pricing optimization for warehouse: ${input.warehouseId}`);

      const model = await this.modelRegistry.getModel(ModelType.PRICING_OPTIMIZATION);
      if (!model || model.status !== 'deployed') {
        throw new Error('Pricing optimization model not available');
      }

      const processedInput = await this.preprocessPricingInput(input);
      const result = await this.inferenceEngine.predict<PricingOptimizationInput, PricingOptimizationOutput>(
        ModelType.PRICING_OPTIMIZATION,
        processedInput
      );

      const enhancedResult = await this.postprocessPricingResult(result, input);

      await this.mlopsManager.logPrediction({
        modelType: ModelType.PRICING_OPTIMIZATION,
        input: processedInput,
        output: enhancedResult,
        latency: Date.now() - startTime,
        warehouseId: input.warehouseId
      });

      return {
        success: true,
        data: enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: model.version,
          confidence: enhancedResult.confidence
        }
      };
    } catch (error) {
      logger.error('❌ Pricing optimization failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: 'unknown'
        }
      };
    }
  }

  /**
   * Predictive Maintenance
   * Predicts equipment failures and maintenance needs
   */
  async predictMaintenance(input: PredictiveMaintenanceInput): Promise<APIResponse<PredictiveMaintenanceOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`🔧 Processing predictive maintenance for equipment: ${input.equipmentId}`);

      const model = await this.modelRegistry.getModel(ModelType.PREDICTIVE_MAINTENANCE);
      if (!model || model.status !== 'deployed') {
        throw new Error('Predictive maintenance model not available');
      }

      const processedInput = await this.preprocessMaintenanceInput(input);
      const result = await this.inferenceEngine.predict<PredictiveMaintenanceInput, PredictiveMaintenanceOutput>(
        ModelType.PREDICTIVE_MAINTENANCE,
        processedInput
      );

      const enhancedResult = await this.postprocessMaintenanceResult(result, input);

      await this.mlopsManager.logPrediction({
        modelType: ModelType.PREDICTIVE_MAINTENANCE,
        input: processedInput,
        output: enhancedResult,
        latency: Date.now() - startTime,
        equipmentId: input.equipmentId
      });

      return {
        success: true,
        data: enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: model.version,
          confidence: enhancedResult.confidenceLevel
        }
      };
    } catch (error) {
      logger.error('❌ Predictive maintenance failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: 'unknown'
        }
      };
    }
  }

  /**
   * Smart Inventory Optimization
   * Optimizes inventory levels based on demand patterns
   */
  async optimizeInventory(input: InventoryOptimizationInput): Promise<APIResponse<InventoryOptimizationOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`📦 Processing inventory optimization for warehouse: ${input.warehouseId}`);

      const model = await this.modelRegistry.getModel(ModelType.INVENTORY_OPTIMIZATION);
      if (!model || model.status !== 'deployed') {
        throw new Error('Inventory optimization model not available');
      }

      const processedInput = await this.preprocessInventoryInput(input);
      const result = await this.inferenceEngine.predict<InventoryOptimizationInput, InventoryOptimizationOutput>(
        ModelType.INVENTORY_OPTIMIZATION,
        processedInput
      );

      const enhancedResult = await this.postprocessInventoryResult(result, input);

      await this.mlopsManager.logPrediction({
        modelType: ModelType.INVENTORY_OPTIMIZATION,
        input: processedInput,
        output: enhancedResult,
        latency: Date.now() - startTime,
        warehouseId: input.warehouseId
      });

      return {
        success: true,
        data: enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: model.version,
          confidence: this.calculateInventoryConfidence(enhancedResult.recommendations)
        }
      };
    } catch (error) {
      logger.error('❌ Inventory optimization failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: 'unknown'
        }
      };
    }
  }

  /**
   * Fraud Detection
   * Detects fraudulent transactions and suspicious activities
   */
  async detectFraud(input: FraudDetectionInput): Promise<APIResponse<FraudDetectionOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`🛡️ Processing fraud detection for transaction/account`);

      const model = await this.modelRegistry.getModel(ModelType.FRAUD_DETECTION);
      if (!model || model.status !== 'deployed') {
        throw new Error('Fraud detection model not available');
      }

      const processedInput = await this.preprocessFraudInput(input);
      const result = await this.inferenceEngine.predict<FraudDetectionInput, FraudDetectionOutput>(
        ModelType.FRAUD_DETECTION,
        processedInput
      );

      const enhancedResult = await this.postprocessFraudResult(result, input);

      await this.mlopsManager.logPrediction({
        modelType: ModelType.FRAUD_DETECTION,
        input: processedInput,
        output: enhancedResult,
        latency: Date.now() - startTime,
        riskScore: enhancedResult.riskScore
      });

      return {
        success: true,
        data: enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: model.version,
          confidence: enhancedResult.confidence
        }
      };
    } catch (error) {
      logger.error('❌ Fraud detection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: 'unknown'
        }
      };
    }
  }

  /**
   * Customer Behavior Analysis
   * Analyzes customer behavior for personalization and insights
   */
  async analyzeBehavior(input: BehaviorAnalysisInput): Promise<APIResponse<BehaviorAnalysisOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`👤 Processing behavior analysis for user: ${input.userId}`);

      const model = await this.modelRegistry.getModel(ModelType.BEHAVIOR_ANALYSIS);
      if (!model || model.status !== 'deployed') {
        throw new Error('Behavior analysis model not available');
      }

      const processedInput = await this.preprocessBehaviorInput(input);
      const result = await this.inferenceEngine.predict<BehaviorAnalysisInput, BehaviorAnalysisOutput>(
        ModelType.BEHAVIOR_ANALYSIS,
        processedInput
      );

      const enhancedResult = await this.postprocessBehaviorResult(result, input);

      await this.mlopsManager.logPrediction({
        modelType: ModelType.BEHAVIOR_ANALYSIS,
        input: processedInput,
        output: enhancedResult,
        latency: Date.now() - startTime,
        userId: input.userId
      });

      return {
        success: true,
        data: enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: model.version,
          confidence: this.calculateBehaviorConfidence(enhancedResult)
        }
      };
    } catch (error) {
      logger.error('❌ Behavior analysis failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: 'unknown'
        }
      };
    }
  }

  /**
   * Demand Forecasting
   * Predicts future demand patterns for capacity planning
   */
  async forecastDemand(input: DemandForecastingInput): Promise<APIResponse<DemandForecastingOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`📈 Processing demand forecasting for ${input.timeHorizon} days`);

      const model = await this.modelRegistry.getModel(ModelType.DEMAND_FORECASTING);
      if (!model || model.status !== 'deployed') {
        throw new Error('Demand forecasting model not available');
      }

      const processedInput = await this.preprocessForecastingInput(input);
      const result = await this.inferenceEngine.predict<DemandForecastingInput, DemandForecastingOutput>(
        ModelType.DEMAND_FORECASTING,
        processedInput
      );

      const enhancedResult = await this.postprocessForecastingResult(result, input);

      await this.mlopsManager.logPrediction({
        modelType: ModelType.DEMAND_FORECASTING,
        input: processedInput,
        output: enhancedResult,
        latency: Date.now() - startTime,
        timeHorizon: input.timeHorizon
      });

      return {
        success: true,
        data: enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: model.version,
          confidence: enhancedResult.confidence
        }
      };
    } catch (error) {
      logger.error('❌ Demand forecasting failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: 'unknown'
        }
      };
    }
  }

  /**
   * Chatbot NLP Processing
   * Processes natural language input for customer support
   */
  async processChatbot(input: ChatbotInput): Promise<APIResponse<ChatbotOutput>> {
    const startTime = Date.now();

    try {
      logger.info(`🤖 Processing chatbot interaction for session: ${input.sessionId}`);

      const model = await this.modelRegistry.getModel(ModelType.CHATBOT_NLP);
      if (!model || model.status !== 'deployed') {
        throw new Error('Chatbot NLP model not available');
      }

      const processedInput = await this.preprocessChatbotInput(input);
      const result = await this.inferenceEngine.predict<ChatbotInput, ChatbotOutput>(
        ModelType.CHATBOT_NLP,
        processedInput
      );

      const enhancedResult = await this.postprocessChatbotResult(result, input);

      await this.mlopsManager.logPrediction({
        modelType: ModelType.CHATBOT_NLP,
        input: processedInput,
        output: enhancedResult,
        latency: Date.now() - startTime,
        sessionId: input.sessionId
      });

      return {
        success: true,
        data: enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: model.version,
          confidence: enhancedResult.confidence
        }
      };
    } catch (error) {
      logger.error('❌ Chatbot processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: 'unknown'
        }
      };
    }
  }

  // Preprocessing methods
  private async preprocessWarehouseMatchingInput(input: WarehouseMatchingInput): Promise<WarehouseMatchingInput> {
    // Add data normalization, feature engineering, etc.
    return {
      ...input,
      preferences: {
        proximity: 0.3,
        price: 0.3,
        amenities: 0.2,
        rating: 0.2,
        ...input.preferences
      }
    };
  }

  private async preprocessPricingInput(input: PricingOptimizationInput): Promise<PricingOptimizationInput> {
    // Add market condition normalization, feature scaling, etc.
    return input;
  }

  private async preprocessMaintenanceInput(input: PredictiveMaintenanceInput): Promise<PredictiveMaintenanceInput> {
    // Add sensor data normalization, anomaly detection, etc.
    return input;
  }

  private async preprocessInventoryInput(input: InventoryOptimizationInput): Promise<InventoryOptimizationInput> {
    // Add inventory data normalization, demand smoothing, etc.
    return input;
  }

  private async preprocessFraudInput(input: FraudDetectionInput): Promise<FraudDetectionInput> {
    // Add feature engineering for fraud detection
    return input;
  }

  private async preprocessBehaviorInput(input: BehaviorAnalysisInput): Promise<BehaviorAnalysisInput> {
    // Add behavioral feature extraction and normalization
    return input;
  }

  private async preprocessForecastingInput(input: DemandForecastingInput): Promise<DemandForecastingInput> {
    // Add time series preprocessing, trend removal, etc.
    return input;
  }

  private async preprocessChatbotInput(input: ChatbotInput): Promise<ChatbotInput> {
    // Add text preprocessing, tokenization, etc.
    return input;
  }

  // Postprocessing methods
  private async postprocessWarehouseMatching(result: WarehouseMatchingOutput, input: WarehouseMatchingInput): Promise<WarehouseMatchingOutput> {
    // Add business logic, result filtering, etc.
    return result;
  }

  private async postprocessPricingResult(result: PricingOptimizationOutput, input: PricingOptimizationInput): Promise<PricingOptimizationOutput> {
    // Add business constraints, price bounds, etc.
    return result;
  }

  private async postprocessMaintenanceResult(result: PredictiveMaintenanceOutput, input: PredictiveMaintenanceInput): Promise<PredictiveMaintenanceOutput> {
    // Add maintenance scheduling logic, cost optimization, etc.
    return result;
  }

  private async postprocessInventoryResult(result: InventoryOptimizationOutput, input: InventoryOptimizationInput): Promise<InventoryOptimizationOutput> {
    // Add business constraints, budget optimization, etc.
    return result;
  }

  private async postprocessFraudResult(result: FraudDetectionOutput, input: FraudDetectionInput): Promise<FraudDetectionOutput> {
    // Add risk thresholds, business rules, etc.
    return result;
  }

  private async postprocessBehaviorResult(result: BehaviorAnalysisOutput, input: BehaviorAnalysisInput): Promise<BehaviorAnalysisOutput> {
    // Add personalization rules, privacy filtering, etc.
    return result;
  }

  private async postprocessForecastingResult(result: DemandForecastingOutput, input: DemandForecastingInput): Promise<DemandForecastingOutput> {
    // Add business constraints, capacity limits, etc.
    return result;
  }

  private async postprocessChatbotResult(result: ChatbotOutput, input: ChatbotInput): Promise<ChatbotOutput> {
    // Add response personalization, context enhancement, etc.
    return result;
  }

  // Utility methods
  private calculateOverallConfidence(matches: any[]): number {
    if (!matches.length) return 0;
    return matches.reduce((sum, match) => sum + match.confidence, 0) / matches.length;
  }

  private calculateInventoryConfidence(recommendations: any[]): number {
    if (!recommendations.length) return 0;
    return 0.85; // Placeholder - implement actual confidence calculation
  }

  private calculateBehaviorConfidence(result: BehaviorAnalysisOutput): number {
    return Math.min(
      result.personalityProfile.loyaltyScore,
      result.churnRisk > 0.5 ? 1 - result.churnRisk : result.churnRisk
    );
  }

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<{ status: string; services: Record<string, boolean> }> {
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      services: {
        aiManager: this.isInitialized,
        modelRegistry: this.modelRegistry?.isHealthy() || false,
        inferenceEngine: this.inferenceEngine?.isHealthy() || false,
        pipelineOrchestrator: this.pipelineOrchestrator?.isHealthy() || false,
        mlopsManager: this.mlopsManager?.isHealthy() || false
      }
    };
  }
}