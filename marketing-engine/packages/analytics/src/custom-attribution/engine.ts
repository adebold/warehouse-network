/**
 * Attribution engine for managing and executing attribution models
 */

import { Pool } from 'pg';
import { Logger } from '../core/logger';
import {
  AttributionTouchpoint,
  AttributionModel,
  AttributionResult,
  ConversionEvent
} from '../core/types';
import {
  BaseAttributionModel,
  FirstTouchModel,
  LastTouchModel,
  LinearModel,
  TimeDecayModel,
  PositionBasedModel
} from './models/base';
import { DataDrivenModel } from './models/data-driven';
import { TouchpointRepository } from './repository';
import { AttributionCalculator } from './calculator';

export interface AttributionEngineOptions {
  pool: Pool;
  logger: Logger;
  modelPath?: string;
}

export class AttributionEngine {
  private readonly pool: Pool;
  private readonly logger: Logger;
  private readonly repository: TouchpointRepository;
  private readonly calculator: AttributionCalculator;
  private readonly models: Map<string, BaseAttributionModel> = new Map();
  private dataDrivenModel?: DataDrivenModel;

  constructor(options: AttributionEngineOptions) {
    this.pool = options.pool;
    this.logger = options.logger.child({ component: 'AttributionEngine' });
    
    this.repository = new TouchpointRepository({
      pool: this.pool,
      logger: this.logger
    });

    this.calculator = new AttributionCalculator({
      logger: this.logger
    });

    // Initialize standard models
    this.initializeModels();

    // Initialize data-driven model if path provided
    if (options.modelPath) {
      this.initializeDataDrivenModel(options.modelPath);
    }
  }

  /**
   * Initialize standard attribution models
   */
  private initializeModels(): void {
    const models: Array<[string, typeof BaseAttributionModel]> = [
      ['first_touch', FirstTouchModel],
      ['last_touch', LastTouchModel],
      ['linear', LinearModel],
      ['time_decay', TimeDecayModel],
      ['position_based', PositionBasedModel]
    ];

    models.forEach(([type, ModelClass]) => {
      const model: AttributionModel = {
        modelId: `model_${type}`,
        name: type.replace('_', ' ').toUpperCase(),
        type: type as any,
        lookbackWindow: 30
      };
      
      this.models.set(type, new ModelClass(model));
    });

    this.logger.info('Attribution models initialized', {
      models: Array.from(this.models.keys())
    });
  }

  /**
   * Initialize data-driven model
   */
  private async initializeDataDrivenModel(modelPath: string): Promise<void> {
    try {
      const model: AttributionModel = {
        modelId: 'model_data_driven',
        name: 'DATA DRIVEN',
        type: 'data_driven',
        lookbackWindow: 30
      };

      this.dataDrivenModel = new DataDrivenModel({
        model,
        modelPath,
        logger: this.logger
      });

      await this.dataDrivenModel.initialize();
      this.models.set('data_driven', this.dataDrivenModel);
      
      this.logger.info('Data-driven model initialized');
    } catch (error) {
      this.logger.error('Failed to initialize data-driven model', error);
    }
  }

  /**
   * Track a touchpoint
   */
  async trackTouchpoint(touchpoint: AttributionTouchpoint): Promise<void> {
    try {
      await this.repository.saveTouchpoint(touchpoint);
      
      this.logger.debug('Touchpoint tracked', {
        touchpointId: touchpoint.touchpointId,
        userId: touchpoint.userId,
        channel: touchpoint.channel
      });
    } catch (error) {
      this.logger.error('Failed to track touchpoint', error, {
        touchpointId: touchpoint.touchpointId
      });
      throw error;
    }
  }

  /**
   * Process conversion and calculate attribution
   */
  async processConversion(
    conversion: ConversionEvent,
    modelType: string = 'linear'
  ): Promise<AttributionResult> {
    try {
      // Get touchpoints for user
      const touchpoints = await this.repository.getTouchpointsByUser(
        conversion.userId!,
        30 // Default lookback window
      );

      if (touchpoints.length === 0) {
        this.logger.warn('No touchpoints found for conversion', {
          userId: conversion.userId,
          conversionId: conversion.eventId
        });
        return {
          conversionId: conversion.eventId,
          conversionValue: conversion.conversionValue,
          touchpoints: [],
          model: {
            modelId: 'model_' + modelType,
            name: modelType.toUpperCase(),
            type: modelType as any,
            lookbackWindow: 30
          },
          calculatedAt: new Date()
        };
      }

      // Get attribution model
      const model = this.models.get(modelType);
      if (!model) {
        throw new Error(`Unknown attribution model: ${modelType}`);
      }

      // Calculate attribution
      const result = model.calculate(
        touchpoints,
        conversion.conversionValue
      );

      // Save attribution result
      await this.repository.saveAttributionResult(result);

      // Calculate ROI for each touchpoint
      await this.calculator.calculateROI(result);

      this.logger.info('Conversion attributed', {
        conversionId: conversion.eventId,
        modelType,
        touchpointCount: touchpoints.length,
        conversionValue: conversion.conversionValue
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to process conversion', error, {
        conversionId: conversion.eventId
      });
      throw error;
    }
  }

  /**
   * Get attribution analysis for a user journey
   */
  async analyzeJourney(
    userId: string,
    modelTypes: string[] = ['linear']
  ): Promise<Map<string, AttributionResult[]>> {
    try {
      const results = new Map<string, AttributionResult[]>();

      // Get all conversions for user
      const conversions = await this.repository.getConversionsByUser(userId);
      
      this.logger.debug('Analyzing user journey', {
        userId,
        conversionCount: conversions.length,
        models: modelTypes
      });

      // Calculate attribution for each model type
      for (const modelType of modelTypes) {
        const modelResults: AttributionResult[] = [];

        for (const conversion of conversions) {
          const result = await this.processConversion(
            conversion,
            modelType
          );
          modelResults.push(result);
        }

        results.set(modelType, modelResults);
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to analyze journey', error, {
        userId
      });
      throw error;
    }
  }

  /**
   * Compare attribution models
   */
  async compareModels(
    conversionId: string,
    modelTypes: string[] = ['first_touch', 'last_touch', 'linear']
  ): Promise<Map<string, AttributionResult>> {
    try {
      const results = new Map<string, AttributionResult>();
      
      // Get conversion details
      const conversion = await this.repository.getConversion(conversionId);
      if (!conversion) {
        throw new Error(`Conversion not found: ${conversionId}`);
      }

      // Calculate attribution for each model
      for (const modelType of modelTypes) {
        const result = await this.processConversion(
          conversion,
          modelType
        );
        results.set(modelType, result);
      }

      this.logger.info('Model comparison completed', {
        conversionId,
        models: modelTypes
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to compare models', error, {
        conversionId
      });
      throw error;
    }
  }

  /**
   * Train data-driven model
   */
  async trainDataDrivenModel(
    trainingPeriod: { from: Date; to: Date },
    epochs: number = 50
  ): Promise<void> {
    if (!this.dataDrivenModel) {
      throw new Error('Data-driven model not initialized');
    }

    try {
      // Get training data
      const trainingData = await this.repository.getTrainingData(
        trainingPeriod.from,
        trainingPeriod.to
      );

      this.logger.info('Training data-driven model', {
        samples: trainingData.length,
        period: trainingPeriod
      });

      // Train model
      await this.dataDrivenModel.train(trainingData, epochs);

      // Save updated model
      if (this.dataDrivenModel && process.env.ML_MODEL_PATH) {
        await this.dataDrivenModel.saveModel(process.env.ML_MODEL_PATH);
      }
    } catch (error) {
      this.logger.error('Failed to train data-driven model', error);
      throw error;
    }
  }

  /**
   * Get channel performance metrics
   */
  async getChannelPerformance(
    dateRange: { from: Date; to: Date }
  ): Promise<Map<string, any>> {
    try {
      const performance = await this.repository.getChannelPerformance(
        dateRange.from,
        dateRange.to
      );

      return new Map(Object.entries(performance));
    } catch (error) {
      this.logger.error('Failed to get channel performance', error);
      throw error;
    }
  }

  /**
   * Get attribution insights
   */
  async getInsights(
    dateRange: { from: Date; to: Date }
  ): Promise<any> {
    try {
      const [channelPerformance, pathAnalysis, modelComparison] = await Promise.all([
        this.getChannelPerformance(dateRange),
        this.repository.getCommonPaths(dateRange.from, dateRange.to),
        this.repository.getModelPerformance(dateRange.from, dateRange.to)
      ]);

      return {
        channelPerformance: Object.fromEntries(channelPerformance),
        topPaths: pathAnalysis,
        modelPerformance: modelComparison,
        dateRange
      };
    } catch (error) {
      this.logger.error('Failed to get insights', error);
      throw error;
    }
  }
}