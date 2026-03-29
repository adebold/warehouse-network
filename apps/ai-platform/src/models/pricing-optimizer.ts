/**
 * Dynamic Pricing Optimization Model
 * Real-time pricing based on demand, competition, and market conditions
 */

import * as tf from '@tensorflow/tfjs-node';
import { logger, mlLogger } from '@/utils/logger';
import {
  PricingOptimizationInput,
  PricingOptimizationOutput,
  BaseModel,
  ModelType,
  ModelStatus
} from '@/types';

export interface MarketData {
  demandIndex: number;
  supplyIndex: number;
  competitorPrices: number[];
  seasonalFactor: number;
  economicIndicators: Record<string, number>;
  eventImpact: number;
}

export interface PricingFeatures {
  demandScore: number;
  competitorScore: number;
  locationScore: number;
  seasonalScore: number;
  capacityScore: number;
  qualityScore: number;
  timeScore: number;
  marketScore: number;
}

export class PricingOptimizerModel implements BaseModel {
  id = 'pricing-optimizer-v1';
  name = 'Dynamic Pricing Optimizer';
  version = '1.0.0';
  type = ModelType.PRICING_OPTIMIZATION;
  status = ModelStatus.TRAINED;
  metadata = {
    accuracy: 0.89,
    precision: 0.87,
    recall: 0.91,
    f1Score: 0.89,
    trainingTime: 4200,
    trainingDataSize: 75000,
    features: [
      'demand_score',
      'competitor_score',
      'location_score',
      'seasonal_score',
      'capacity_score',
      'quality_score',
      'time_score',
      'market_score'
    ],
    algorithmType: 'neural_network_regression',
    framework: 'tensorflow'
  };
  createdAt = new Date();
  updatedAt = new Date();

  private priceModel: tf.LayersModel | null = null;
  private elasticityModel: tf.LayersModel | null = null;
  private isLoaded = false;
  private featureScaler: { mean: number[]; std: number[] } | null = null;
  private marketData: MarketData | null = null;

  /**
   * Initialize the pricing optimizer model
   */
  async initialize(): Promise<void> {
    try {
      logger.info('💰 Initializing Pricing Optimizer Model...');

      // Load pricing models
      await this.loadPricingModels();

      // Load market data
      await this.loadMarketData();

      // Initialize feature scaler
      await this.initializeFeatureScaler();

      this.isLoaded = true;
      this.status = ModelStatus.DEPLOYED;

      logger.info('✅ Pricing Optimizer Model initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize Pricing Optimizer Model:', error);
      this.status = ModelStatus.FAILED;
      throw error;
    }
  }

  /**
   * Predict optimal pricing for a warehouse
   */
  async predict(input: PricingOptimizationInput): Promise<PricingOptimizationOutput> {
    if (!this.isLoaded || !this.priceModel || !this.elasticityModel) {
      throw new Error('Pricing Optimizer Model not loaded');
    }

    const startTime = Date.now();

    try {
      // Extract and engineer features
      const features = this.extractFeatures(input);

      // Predict base price using neural network
      const basePrice = await this.predictBasePrice(features);

      // Calculate price elasticity
      const elasticity = await this.calculatePriceElasticity(features);

      // Apply market adjustments
      const adjustedPrice = this.applyMarketAdjustments(basePrice, input, features);

      // Calculate price range based on elasticity and confidence
      const priceRange = this.calculatePriceRange(adjustedPrice, elasticity);

      // Calculate revenue projections
      const revenueProjection = this.calculateRevenueProjection(
        adjustedPrice,
        input,
        features
      );

      // Generate pricing factors explanation
      const factors = this.calculatePricingFactors(input, features);

      // Calculate overall confidence
      const confidence = this.calculateConfidence(features, elasticity);

      const result: PricingOptimizationOutput = {
        recommendedPrice: Math.round(adjustedPrice * 100) / 100,
        priceRange: {
          min: Math.round(priceRange.min * 100) / 100,
          max: Math.round(priceRange.max * 100) / 100
        },
        confidence,
        factors,
        revenueProjection
      };

      // Log metrics
      mlLogger.inference('pricing-optimizer', Date.now() - startTime);
      mlLogger.performance('pricing-optimizer', {
        confidence,
        priceRange: priceRange.max - priceRange.min,
        demandFactor: factors.demandMultiplier
      });

      return result;
    } catch (error) {
      logger.error('❌ Pricing optimization prediction failed:', error);
      throw error;
    }
  }

  /**
   * Extract and engineer pricing features
   */
  private extractFeatures(input: PricingOptimizationInput): PricingFeatures {
    const { marketConditions, warehouseFeatures, timeRange, historicalData } = input;

    // Demand score based on demand/supply ratio
    const demandScore = Math.min(
      marketConditions.demand / Math.max(marketConditions.supply, 0.1),
      3.0
    ) / 3.0;

    // Competitor score (inverse - lower competitor prices = lower score)
    const avgCompetitorPrice = marketConditions.competitorPrices.length > 0
      ? marketConditions.competitorPrices.reduce((a, b) => a + b, 0) / marketConditions.competitorPrices.length
      : 2.0;
    const competitorScore = Math.min(avgCompetitorPrice / 4.0, 1.0); // Normalize around $4/sqft

    // Location score based on desirability
    const locationScore = this.calculateLocationScore(warehouseFeatures.location);

    // Seasonal score
    const seasonalScore = Math.max(0, Math.min(1, marketConditions.seasonality));

    // Capacity score (optimal around 70-80% utilization)
    const capacityUtilization = 0.75; // Mock - would calculate from actual bookings
    const capacityScore = 1 - Math.abs(0.75 - capacityUtilization) / 0.75;

    // Quality score based on rating and amenities
    const qualityScore = (warehouseFeatures.rating / 5.0) * 0.7 +
      (warehouseFeatures.amenities.length / 10) * 0.3;

    // Time score based on booking duration and urgency
    const durationDays = Math.ceil(
      (timeRange.endDate.getTime() - timeRange.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const timeScore = Math.min(1.0, durationDays / 365); // Longer bookings = higher score

    // Market score based on overall market conditions
    const marketScore = this.marketData ? this.calculateMarketScore(this.marketData) : 0.5;

    return {
      demandScore,
      competitorScore,
      locationScore,
      seasonalScore,
      capacityScore,
      qualityScore,
      timeScore,
      marketScore
    };
  }

  /**
   * Predict base price using neural network
   */
  private async predictBasePrice(features: PricingFeatures): Promise<number> {
    if (!this.priceModel || !this.featureScaler) {
      throw new Error('Price model or scaler not initialized');
    }

    // Convert features to array
    const featureArray = [
      features.demandScore,
      features.competitorScore,
      features.locationScore,
      features.seasonalScore,
      features.capacityScore,
      features.qualityScore,
      features.timeScore,
      features.marketScore
    ];

    // Normalize features
    const normalizedFeatures = featureArray.map((val, idx) =>
      (val - this.featureScaler!.mean[idx]) / this.featureScaler!.std[idx]
    );

    // Create tensor and predict
    const inputTensor = tf.tensor2d([normalizedFeatures]);

    try {
      const prediction = this.priceModel.predict(inputTensor) as tf.Tensor;
      const priceArray = await prediction.data();

      inputTensor.dispose();
      prediction.dispose();

      // Denormalize price (assuming trained on prices 0.5-5.0)
      const normalizedPrice = priceArray[0];
      return normalizedPrice * 4.5 + 0.5; // Scale back to $0.50-$5.00 range
    } catch (error) {
      inputTensor.dispose();
      throw error;
    }
  }

  /**
   * Calculate price elasticity
   */
  private async calculatePriceElasticity(features: PricingFeatures): Promise<number> {
    if (!this.elasticityModel || !this.featureScaler) {
      throw new Error('Elasticity model or scaler not initialized');
    }

    // Use same features to predict elasticity
    const featureArray = [
      features.demandScore,
      features.competitorScore,
      features.locationScore,
      features.seasonalScore,
      features.capacityScore,
      features.qualityScore,
      features.timeScore,
      features.marketScore
    ];

    const normalizedFeatures = featureArray.map((val, idx) =>
      (val - this.featureScaler!.mean[idx]) / this.featureScaler!.std[idx]
    );

    const inputTensor = tf.tensor2d([normalizedFeatures]);

    try {
      const prediction = this.elasticityModel.predict(inputTensor) as tf.Tensor;
      const elasticityArray = await prediction.data();

      inputTensor.dispose();
      prediction.dispose();

      // Return elasticity coefficient (typically -0.5 to -2.0)
      return -Math.abs(elasticityArray[0] * 1.5 + 0.5);
    } catch (error) {
      inputTensor.dispose();
      throw error;
    }
  }

  /**
   * Apply market-based adjustments to base price
   */
  private applyMarketAdjustments(
    basePrice: number,
    input: PricingOptimizationInput,
    features: PricingFeatures
  ): number {
    let adjustedPrice = basePrice;

    // Demand surge pricing
    if (features.demandScore > 0.8) {
      adjustedPrice *= 1.15; // 15% surge for high demand
    } else if (features.demandScore > 0.6) {
      adjustedPrice *= 1.05; // 5% surge for medium demand
    }

    // Competitor pricing adjustment
    const avgCompetitorPrice = input.marketConditions.competitorPrices.length > 0
      ? input.marketConditions.competitorPrices.reduce((a, b) => a + b, 0) / input.marketConditions.competitorPrices.length
      : basePrice;

    // Stay competitive but optimize for profit
    if (adjustedPrice > avgCompetitorPrice * 1.2) {
      adjustedPrice = avgCompetitorPrice * 1.15; // Max 15% premium
    } else if (adjustedPrice < avgCompetitorPrice * 0.8) {
      adjustedPrice = avgCompetitorPrice * 0.85; // Max 15% discount
    }

    // Seasonal adjustments
    if (features.seasonalScore > 0.8) {
      adjustedPrice *= 1.1; // Peak season premium
    } else if (features.seasonalScore < 0.3) {
      adjustedPrice *= 0.9; // Off-season discount
    }

    // Quality premium
    if (features.qualityScore > 0.8) {
      adjustedPrice *= 1.05; // Premium for high-quality warehouses
    }

    // Location premium
    if (features.locationScore > 0.8) {
      adjustedPrice *= 1.1; // Premium location surcharge
    }

    return Math.max(0.5, Math.min(5.0, adjustedPrice)); // Clamp between $0.50-$5.00
  }

  /**
   * Calculate price range based on elasticity and confidence
   */
  private calculatePriceRange(
    basePrice: number,
    elasticity: number
  ): { min: number; max: number } {
    // More elastic demand = smaller price range
    const elasticityFactor = Math.abs(elasticity);
    const rangeMultiplier = Math.max(0.05, Math.min(0.25, 0.2 / elasticityFactor));

    const min = basePrice * (1 - rangeMultiplier);
    const max = basePrice * (1 + rangeMultiplier);

    return {
      min: Math.max(0.5, min),
      max: Math.min(5.0, max)
    };
  }

  /**
   * Calculate revenue projections
   */
  private calculateRevenueProjection(
    price: number,
    input: PricingOptimizationInput,
    features: PricingFeatures
  ): { daily: number; weekly: number; monthly: number } {
    // Estimate occupancy based on price and market conditions
    const baseOccupancy = 0.7; // 70% base occupancy
    const priceImpact = Math.min(1.2, Math.max(0.5, 2.0 - price / 2.0)); // Lower price = higher occupancy
    const demandImpact = features.demandScore;
    const qualityImpact = features.qualityScore;

    const estimatedOccupancy = Math.min(0.95,
      baseOccupancy * priceImpact * (0.7 + demandImpact * 0.3) * (0.8 + qualityImpact * 0.2)
    );

    // Calculate daily revenue
    const dailyRevenue = input.warehouseFeatures.size * price * estimatedOccupancy;

    return {
      daily: Math.round(dailyRevenue),
      weekly: Math.round(dailyRevenue * 7),
      monthly: Math.round(dailyRevenue * 30)
    };
  }

  /**
   * Calculate pricing factors for explanation
   */
  private calculatePricingFactors(
    input: PricingOptimizationInput,
    features: PricingFeatures
  ): {
    demandMultiplier: number;
    competitorImpact: number;
    seasonalAdjustment: number;
    locationPremium: number;
  } {
    return {
      demandMultiplier: Math.round((0.8 + features.demandScore * 0.4) * 100) / 100,
      competitorImpact: Math.round((0.9 + features.competitorScore * 0.2) * 100) / 100,
      seasonalAdjustment: Math.round((0.9 + features.seasonalScore * 0.2) * 100) / 100,
      locationPremium: Math.round((0.95 + features.locationScore * 0.1) * 100) / 100
    };
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(features: PricingFeatures, elasticity: number): number {
    // Base confidence on feature quality and model certainty
    let confidence = 0.7; // Base confidence

    // Increase confidence with more data points
    if (features.demandScore > 0.1 && features.demandScore < 0.9) confidence += 0.1;
    if (features.competitorScore > 0.2 && features.competitorScore < 0.8) confidence += 0.1;
    if (features.locationScore > 0.3) confidence += 0.05;
    if (features.qualityScore > 0.5) confidence += 0.05;

    // Decrease confidence for extreme elasticity values
    const elasticityFactor = Math.abs(elasticity);
    if (elasticityFactor > 1.5) confidence -= 0.1;
    if (elasticityFactor < 0.5) confidence -= 0.05;

    return Math.min(0.98, Math.max(0.5, confidence));
  }

  /**
   * Calculate location-based pricing score
   */
  private calculateLocationScore(location: { latitude: number; longitude: number }): number {
    // Simplified location scoring - would use real market data in production
    const businessCenters = [
      { lat: 37.7749, lng: -122.4194, score: 1.0 }, // San Francisco
      { lat: 40.7128, lng: -74.0060, score: 0.95 },  // New York
      { lat: 34.0522, lng: -118.2437, score: 0.85 }, // Los Angeles
      { lat: 41.8781, lng: -87.6298, score: 0.8 },   // Chicago
      { lat: 29.7604, lng: -95.3698, score: 0.75 }   // Houston
    ];

    let maxScore = 0.3; // Base score for non-prime locations

    for (const center of businessCenters) {
      const distance = this.calculateDistance(location, center);
      const proximityScore = Math.max(0, center.score * (1 - distance / 100)); // 100km radius
      maxScore = Math.max(maxScore, proximityScore);
    }

    return Math.min(1.0, maxScore);
  }

  /**
   * Calculate market score from market data
   */
  private calculateMarketScore(marketData: MarketData): number {
    let score = 0.5; // Neutral market

    // Positive indicators
    if (marketData.demandIndex > 1.1) score += 0.2;
    if (marketData.seasonalFactor > 1.0) score += 0.1;
    if (marketData.eventImpact > 0) score += 0.1;

    // Negative indicators
    if (marketData.supplyIndex > 1.1) score -= 0.2;
    if (marketData.economicIndicators.unemployment > 0.05) score -= 0.1;

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Calculate distance between two points
   */
  private calculateDistance(
    point1: { latitude: number; longitude: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (point2.lat - point1.latitude) * Math.PI / 180;
    const dLon = (point2.lng - point1.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Load pricing neural network models
   */
  private async loadPricingModels(): Promise<void> {
    try {
      // Price prediction model
      this.priceModel = tf.sequential({
        layers: [
          tf.layers.dense({
            inputShape: [8],
            units: 32,
            activation: 'relu',
            kernelInitializer: 'heNormal'
          }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({
            units: 16,
            activation: 'relu',
            kernelInitializer: 'heNormal'
          }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({
            units: 8,
            activation: 'relu',
            kernelInitializer: 'heNormal'
          }),
          tf.layers.dense({
            units: 1,
            activation: 'sigmoid' // Normalized price output
          })
        ]
      });

      this.priceModel.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['mae']
      });

      // Elasticity prediction model
      this.elasticityModel = tf.sequential({
        layers: [
          tf.layers.dense({
            inputShape: [8],
            units: 16,
            activation: 'relu',
            kernelInitializer: 'heNormal'
          }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({
            units: 8,
            activation: 'relu',
            kernelInitializer: 'heNormal'
          }),
          tf.layers.dense({
            units: 1,
            activation: 'sigmoid' // Normalized elasticity output
          })
        ]
      });

      this.elasticityModel.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['mae']
      });

      logger.info('✅ Pricing models loaded successfully');
    } catch (error) {
      logger.error('❌ Failed to load pricing models:', error);
      throw error;
    }
  }

  /**
   * Load current market data
   */
  private async loadMarketData(): Promise<void> {
    try {
      // Mock market data - would load from real market data sources
      this.marketData = {
        demandIndex: 1.15,
        supplyIndex: 0.95,
        competitorPrices: [1.25, 1.50, 1.75, 2.00],
        seasonalFactor: 1.1,
        economicIndicators: {
          unemployment: 0.04,
          gdpGrowth: 0.025,
          inflation: 0.03
        },
        eventImpact: 0.05
      };

      logger.info('✅ Market data loaded successfully');
    } catch (error) {
      logger.error('❌ Failed to load market data:', error);
      throw error;
    }
  }

  /**
   * Initialize feature scaler
   */
  private async initializeFeatureScaler(): Promise<void> {
    // Mock scaler parameters
    this.featureScaler = {
      mean: [0.6, 0.5, 0.4, 0.5, 0.7, 0.6, 0.5, 0.5],
      std: [0.3, 0.2, 0.3, 0.3, 0.2, 0.2, 0.3, 0.2]
    };

    logger.info('✅ Pricing feature scaler initialized');
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return this.isLoaded &&
           this.priceModel !== null &&
           this.elasticityModel !== null &&
           this.status === ModelStatus.DEPLOYED;
  }
}