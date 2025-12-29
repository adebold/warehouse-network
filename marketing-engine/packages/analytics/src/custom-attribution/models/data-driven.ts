/**
 * Data-driven attribution model using machine learning
 */

import * as tf from '@tensorflow/tfjs';
import { AttributionTouchpoint, AttributionModel, AttributionResult } from '../../core/types';
import { BaseAttributionModel } from './base';
import { Logger } from '../../core/logger';

export interface DataDrivenModelOptions {
  model: AttributionModel;
  modelPath?: string;
  logger: Logger;
}

export class DataDrivenModel extends BaseAttributionModel {
  private mlModel?: tf.LayersModel;
  private logger: Logger;
  private modelPath?: string;
  private isModelLoaded: boolean = false;

  constructor(options: DataDrivenModelOptions) {
    super(options.model);
    this.logger = options.logger.child({ model: 'DataDrivenAttribution' });
    this.modelPath = options.modelPath;
  }

  /**
   * Initialize ML model
   */
  async initialize(): Promise<void> {
    try {
      if (this.modelPath) {
        this.mlModel = await tf.loadLayersModel(`file://${this.modelPath}`);
        this.isModelLoaded = true;
        this.logger.info('Data-driven model loaded', { modelPath: this.modelPath });
      } else {
        // Create default model if none provided
        this.mlModel = this.createDefaultModel();
        this.isModelLoaded = true;
        this.logger.info('Default data-driven model created');
      }
    } catch (error) {
      this.logger.error('Failed to initialize data-driven model', error);
      throw error;
    }
  }

  /**
   * Calculate attribution using ML model
   */
  calculate(
    touchpoints: AttributionTouchpoint[],
    conversionValue: number
  ): AttributionResult {
    const filteredTouchpoints = this.filterTouchpoints(
      touchpoints,
      new Date()
    );

    if (filteredTouchpoints.length === 0) {
      return this.createResult(`conv_${Date.now()}`, conversionValue, []);
    }

    // If ML model not loaded, fall back to linear model
    if (!this.isModelLoaded) {
      this.logger.warn('ML model not loaded, using linear attribution');
      const credit = 1 / filteredTouchpoints.length;
      filteredTouchpoints.forEach(tp => {
        tp.credit = credit;
      });
      return this.createResult(
        `conv_${Date.now()}`,
        conversionValue,
        filteredTouchpoints
      );
    }

    try {
      // Extract features from touchpoints
      const features = this.extractFeatures(filteredTouchpoints);
      
      // Predict attribution credits
      const predictions = this.predict(features);
      
      // Assign credits
      filteredTouchpoints.forEach((tp, index) => {
        tp.credit = predictions[index] || 0;
      });

      // Ensure credits sum to 1
      this.normalizeCredits(filteredTouchpoints);

      return this.createResult(
        `conv_${Date.now()}`,
        conversionValue,
        filteredTouchpoints
      );
    } catch (error) {
      this.logger.error('Failed to calculate data-driven attribution', error);
      // Fall back to linear model
      const credit = 1 / filteredTouchpoints.length;
      filteredTouchpoints.forEach(tp => {
        tp.credit = credit;
      });
      return this.createResult(
        `conv_${Date.now()}`,
        conversionValue,
        filteredTouchpoints
      );
    }
  }

  /**
   * Extract features from touchpoints for ML model
   */
  private extractFeatures(touchpoints: AttributionTouchpoint[]): tf.Tensor2D {
    const features: number[][] = [];
    const conversionTime = new Date();

    touchpoints.forEach((tp, index) => {
      const touchpointFeatures = [
        // Position features
        index / (touchpoints.length - 1), // Normalized position
        index === 0 ? 1 : 0, // Is first touch
        index === touchpoints.length - 1 ? 1 : 0, // Is last touch
        
        // Time features
        (conversionTime.getTime() - tp.timestamp.getTime()) / (1000 * 60 * 60 * 24), // Days since touch
        this.getHourOfDay(tp.timestamp) / 24, // Normalized hour
        this.getDayOfWeek(tp.timestamp) / 7, // Normalized day of week
        
        // Channel features (one-hot encoded)
        tp.channel === 'organic' ? 1 : 0,
        tp.channel === 'paid' ? 1 : 0,
        tp.channel === 'social' ? 1 : 0,
        tp.channel === 'email' ? 1 : 0,
        tp.channel === 'direct' ? 1 : 0,
        tp.channel === 'referral' ? 1 : 0,
        
        // Interaction features
        touchpoints.length, // Total touchpoints
        this.getChannelDiversity(touchpoints), // Channel diversity score
        this.getTimeSpan(touchpoints) / (24 * 60 * 60 * 1000), // Journey duration in days
      ];

      features.push(touchpointFeatures);
    });

    return tf.tensor2d(features);
  }

  /**
   * Predict attribution credits using ML model
   */
  private predict(features: tf.Tensor2D): number[] {
    if (!this.mlModel) {
      throw new Error('Model not initialized');
    }

    const predictions = this.mlModel.predict(features) as tf.Tensor;
    const values = Array.from(predictions.dataSync());
    
    predictions.dispose();
    features.dispose();
    
    return values;
  }

  /**
   * Create default neural network model
   */
  private createDefaultModel(): tf.Sequential {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [15], // Number of features
          units: 32,
          activation: 'relu',
          kernelInitializer: 'glorotUniform'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.1 }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid' // Output between 0 and 1
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  /**
   * Train the model with historical data
   */
  async train(
    trainingData: Array<{
      touchpoints: AttributionTouchpoint[];
      conversionOccurred: boolean;
    }>,
    epochs: number = 50
  ): Promise<void> {
    if (!this.mlModel) {
      await this.initialize();
    }

    this.logger.info('Training data-driven attribution model', {
      samples: trainingData.length,
      epochs
    });

    // Prepare training data
    const features: number[][] = [];
    const labels: number[] = [];

    trainingData.forEach(({ touchpoints, conversionOccurred }) => {
      const touchpointFeatures = this.extractFeatures(touchpoints);
      const featureArray = Array.from(touchpointFeatures.dataSync());
      touchpointFeatures.dispose();

      // For each touchpoint, add features and label
      for (let i = 0; i < touchpoints.length; i++) {
        const startIdx = i * 15;
        const endIdx = startIdx + 15;
        features.push(featureArray.slice(startIdx, endIdx));
        labels.push(conversionOccurred ? 1 / touchpoints.length : 0);
      }
    });

    // Convert to tensors
    const xTrain = tf.tensor2d(features);
    const yTrain = tf.tensor1d(labels);

    // Train model
    const history = await this.mlModel!.fit(xTrain, yTrain, {
      epochs,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          this.logger.debug('Training epoch completed', {
            epoch,
            loss: logs?.loss,
            accuracy: logs?.acc
          });
        }
      }
    });

    // Cleanup
    xTrain.dispose();
    yTrain.dispose();

    this.logger.info('Model training completed', {
      finalLoss: history.history.loss[history.history.loss.length - 1],
      finalAccuracy: history.history.acc[history.history.acc.length - 1]
    });
  }

  /**
   * Save trained model
   */
  async saveModel(path: string): Promise<void> {
    if (!this.mlModel) {
      throw new Error('No model to save');
    }

    await this.mlModel.save(`file://${path}`);
    this.logger.info('Model saved', { path });
  }

  /**
   * Helper functions
   */
  private getHourOfDay(date: Date): number {
    return date.getHours();
  }

  private getDayOfWeek(date: Date): number {
    return date.getDay();
  }

  private getChannelDiversity(touchpoints: AttributionTouchpoint[]): number {
    const uniqueChannels = new Set(touchpoints.map(tp => tp.channel));
    return uniqueChannels.size / touchpoints.length;
  }

  private getTimeSpan(touchpoints: AttributionTouchpoint[]): number {
    if (touchpoints.length < 2) return 0;
    const first = touchpoints[0].timestamp.getTime();
    const last = touchpoints[touchpoints.length - 1].timestamp.getTime();
    return last - first;
  }
}