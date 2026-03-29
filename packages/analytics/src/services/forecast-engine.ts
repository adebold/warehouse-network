/**
 * Forecast Engine Service
 * Generates revenue, booking, and user forecasts using statistical models
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'winston';
import { format, subDays, addDays, startOfDay } from 'date-fns';

import {
  ForecastData,
  DataPoint,
  ForecastPoint
} from '../types';

export class ForecastEngine {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {}

  /**
   * Generate forecast using specified model
   */
  async generateForecast(
    forecastType: 'revenue' | 'bookings' | 'users',
    tenantId: string,
    params: {
      timePeriod: 'daily' | 'weekly' | 'monthly';
      forecastHorizon: number; // periods to forecast
      trainingDays?: number; // historical data to use
      modelType?: 'linear_regression' | 'exponential_smoothing';
    }
  ): Promise<ForecastData> {
    try {
      const {
        timePeriod,
        forecastHorizon,
        trainingDays = 90,
        modelType = 'linear_regression'
      } = params;

      // Get historical data
      const endDate = new Date();
      const startDate = subDays(endDate, trainingDays);
      const historicalData = await this.getHistoricalData(
        forecastType,
        tenantId,
        startDate,
        endDate,
        timePeriod
      );

      if (historicalData.length < 7) {
        throw new Error('Insufficient historical data for forecasting');
      }

      // Generate forecast based on model type
      let forecastData: ForecastPoint[];
      let modelAccuracy: number;

      switch (modelType) {
        case 'linear_regression':
          const linearResult = this.linearRegressionForecast(historicalData, forecastHorizon);
          forecastData = linearResult.forecast;
          modelAccuracy = linearResult.accuracy;
          break;

        case 'exponential_smoothing':
          const expResult = this.exponentialSmoothingForecast(historicalData, forecastHorizon);
          forecastData = expResult.forecast;
          modelAccuracy = expResult.accuracy;
          break;

        default:
          throw new Error(`Unsupported model type: ${modelType}`);
      }

      const forecast: ForecastData = {
        forecastName: `${forecastType}_${timePeriod}_forecast`,
        forecastType,
        timePeriod,
        forecastHorizon,
        modelType,
        modelAccuracy,
        historicalData,
        forecastData,
        generatedAt: new Date(),
        validUntil: addDays(new Date(), 7) // Valid for 1 week
      };

      // Cache forecast
      const cacheKey = `forecast:${forecastType}:${tenantId}:${timePeriod}`;
      await this.redis.setex(cacheKey, 3600, JSON.stringify(forecast)); // 1 hour cache

      this.logger.info('Forecast generated successfully', {
        forecastType,
        tenantId,
        timePeriod,
        forecastHorizon,
        modelAccuracy,
        historicalDataPoints: historicalData.length
      });

      return forecast;
    } catch (error) {
      this.logger.error('Failed to generate forecast', {
        error: error.message,
        forecastType,
        tenantId,
        params
      });
      throw error;
    }
  }

  /**
   * Get forecast trends and insights
   */
  async getForecastInsights(
    forecastType: string,
    tenantId: string,
    timePeriod: string
  ): Promise<any> {
    try {
      const cacheKey = `forecast:${forecastType}:${tenantId}:${timePeriod}`;
      const cached = await this.redis.get(cacheKey);

      if (!cached) {
        throw new Error('No forecast data available');
      }

      const forecast: ForecastData = JSON.parse(cached);
      const insights = this.generateForecastInsights(forecast);

      return {
        forecast: forecast.forecastData,
        insights,
        confidence: forecast.modelAccuracy,
        trend: this.calculateTrend(forecast.forecastData)
      };
    } catch (error) {
      this.logger.error('Failed to get forecast insights', {
        error: error.message,
        forecastType,
        tenantId
      });
      throw error;
    }
  }

  // =============================================================================
  // PRIVATE FORECASTING METHODS
  // =============================================================================

  /**
   * Get historical data for forecasting
   */
  private async getHistoricalData(
    forecastType: 'revenue' | 'bookings' | 'users',
    tenantId: string,
    startDate: Date,
    endDate: Date,
    timePeriod: 'daily' | 'weekly' | 'monthly'
  ): Promise<DataPoint[]> {
    switch (forecastType) {
      case 'revenue':
        return await this.getRevenueData(tenantId, startDate, endDate, timePeriod);
      case 'bookings':
        return await this.getBookingsData(tenantId, startDate, endDate, timePeriod);
      case 'users':
        return await this.getUsersData(tenantId, startDate, endDate, timePeriod);
      default:
        throw new Error(`Unsupported forecast type: ${forecastType}`);
    }
  }

  /**
   * Get revenue data for forecasting
   */
  private async getRevenueData(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    timePeriod: string
  ): Promise<DataPoint[]> {
    if (timePeriod === 'daily') {
      // Use daily metrics if available
      const dailyMetrics = await this.prisma.dailyMetrics.findMany({
        where: {
          tenantId,
          metricDate: { gte: startDate, lte: endDate }
        },
        orderBy: { metricDate: 'asc' },
        select: { metricDate: true, totalRevenue: true }
      });

      if (dailyMetrics.length > 0) {
        return dailyMetrics.map(m => ({
          period: format(m.metricDate, 'yyyy-MM-dd'),
          value: Number(m.totalRevenue)
        }));
      }
    }

    // Fallback to calculating from transactions
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        status: 'completed',
        transactionType: 'booking',
        createdAt: { gte: startDate, lte: endDate }
      },
      select: { createdAt: true, amount: true }
    });

    // Group by period
    const grouped = this.groupByPeriod(
      transactions.map(t => ({
        date: t.createdAt,
        value: Number(t.amount)
      })),
      timePeriod
    );

    return grouped;
  }

  /**
   * Get bookings data for forecasting
   */
  private async getBookingsData(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    timePeriod: string
  ): Promise<DataPoint[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        tenantId,
        status: 'confirmed',
        createdAt: { gte: startDate, lte: endDate }
      },
      select: { createdAt: true }
    });

    const grouped = this.groupByPeriod(
      bookings.map(b => ({
        date: b.createdAt,
        value: 1
      })),
      timePeriod
    );

    return grouped;
  }

  /**
   * Get users data for forecasting
   */
  private async getUsersData(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    timePeriod: string
  ): Promise<DataPoint[]> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate }
      },
      select: { createdAt: true }
    });

    const grouped = this.groupByPeriod(
      users.map(u => ({
        date: u.createdAt,
        value: 1
      })),
      timePeriod
    );

    return grouped;
  }

  /**
   * Group data points by time period
   */
  private groupByPeriod(
    data: Array<{ date: Date; value: number }>,
    timePeriod: string
  ): DataPoint[] {
    const grouped: Record<string, number> = {};

    data.forEach(item => {
      let period: string;
      switch (timePeriod) {
        case 'daily':
          period = format(item.date, 'yyyy-MM-dd');
          break;
        case 'weekly':
          period = format(item.date, 'yyyy-\\'W\\'II');
          break;
        case 'monthly':
          period = format(item.date, 'yyyy-MM');
          break;
        default:
          period = format(item.date, 'yyyy-MM-dd');
      }

      grouped[period] = (grouped[period] || 0) + item.value;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, value]) => ({ period, value }));
  }

  /**
   * Linear regression forecasting
   */
  private linearRegressionForecast(
    historicalData: DataPoint[],
    forecastHorizon: number
  ): { forecast: ForecastPoint[]; accuracy: number } {
    const n = historicalData.length;
    const xValues = historicalData.map((_, i) => i);
    const yValues = historicalData.map(d => d.value);

    // Calculate linear regression coefficients
    const sumX = xValues.reduce((sum, x) => sum + x, 0);
    const sumY = yValues.reduce((sum, y) => sum + y, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate forecast points
    const forecast: ForecastPoint[] = [];
    for (let i = 0; i < forecastHorizon; i++) {
      const x = n + i;
      const predictedValue = Math.max(0, slope * x + intercept); // Ensure non-negative

      // Simple confidence interval (±20% of predicted value)
      const margin = predictedValue * 0.2;

      forecast.push({
        period: this.getNextPeriod(historicalData[n - 1].period, i + 1),
        predictedValue,
        confidenceInterval: {
          lower: Math.max(0, predictedValue - margin),
          upper: predictedValue + margin
        }
      });
    }

    // Calculate model accuracy (R-squared)
    const meanY = sumY / n;
    const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const ssRes = yValues.reduce((sum, y, i) => {
      const predicted = slope * xValues[i] + intercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);

    const accuracy = Math.max(0, 1 - (ssRes / ssTotal));

    return { forecast, accuracy };
  }

  /**
   * Exponential smoothing forecasting
   */
  private exponentialSmoothingForecast(
    historicalData: DataPoint[],
    forecastHorizon: number
  ): { forecast: ForecastPoint[]; accuracy: number } {
    const alpha = 0.3; // Smoothing parameter
    const values = historicalData.map(d => d.value);

    // Calculate smoothed values
    const smoothed = [values[0]];
    for (let i = 1; i < values.length; i++) {
      smoothed[i] = alpha * values[i] + (1 - alpha) * smoothed[i - 1];
    }

    // Generate forecast
    const lastSmoothed = smoothed[smoothed.length - 1];
    const forecast: ForecastPoint[] = [];

    for (let i = 0; i < forecastHorizon; i++) {
      const predictedValue = Math.max(0, lastSmoothed);
      const margin = predictedValue * 0.25; // ±25% confidence interval

      forecast.push({
        period: this.getNextPeriod(historicalData[historicalData.length - 1].period, i + 1),
        predictedValue,
        confidenceInterval: {
          lower: Math.max(0, predictedValue - margin),
          upper: predictedValue + margin
        }
      });
    }

    // Calculate accuracy (MAPE - Mean Absolute Percentage Error)
    let mape = 0;
    for (let i = 1; i < values.length; i++) {
      const error = Math.abs((values[i] - smoothed[i]) / values[i]);
      mape += error;
    }
    mape = mape / (values.length - 1);
    const accuracy = Math.max(0, 1 - mape);

    return { forecast, accuracy };
  }

  /**
   * Generate next period string
   */
  private getNextPeriod(lastPeriod: string, increment: number): string {
    // Simplified - assumes daily format (yyyy-MM-dd)
    const lastDate = new Date(lastPeriod);
    const nextDate = addDays(lastDate, increment);
    return format(nextDate, 'yyyy-MM-dd');
  }

  /**
   * Generate forecast insights
   */
  private generateForecastInsights(forecast: ForecastData): string[] {
    const insights: string[] = [];
    const forecastValues = forecast.forecastData.map(f => f.predictedValue);
    const historicalValues = forecast.historicalData.map(h => h.value);

    // Trend analysis
    const trend = this.calculateTrend(forecast.forecastData);
    if (trend.direction === 'increasing') {
      insights.push(`${forecast.forecastType} is trending upward with ${trend.rate.toFixed(1)}% growth`);
    } else if (trend.direction === 'decreasing') {
      insights.push(`${forecast.forecastType} is trending downward with ${Math.abs(trend.rate).toFixed(1)}% decline`);
    } else {
      insights.push(`${forecast.forecastType} is remaining stable`);
    }

    // Accuracy insights
    if (forecast.modelAccuracy > 0.8) {
      insights.push('High confidence in forecast accuracy');
    } else if (forecast.modelAccuracy > 0.6) {
      insights.push('Moderate confidence in forecast accuracy');
    } else {
      insights.push('Lower confidence - consider collecting more historical data');
    }

    // Seasonality detection (simplified)
    const avgHistorical = historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
    const avgForecast = forecastValues.reduce((sum, v) => sum + v, 0) / forecastValues.length;

    if (avgForecast > avgHistorical * 1.1) {
      insights.push('Forecast suggests above-average performance ahead');
    } else if (avgForecast < avgHistorical * 0.9) {
      insights.push('Forecast suggests below-average performance ahead');
    }

    return insights;
  }

  /**
   * Calculate trend from forecast data
   */
  private calculateTrend(forecastData: ForecastPoint[]): { direction: string; rate: number } {
    if (forecastData.length < 2) {
      return { direction: 'stable', rate: 0 };
    }

    const firstValue = forecastData[0].predictedValue;
    const lastValue = forecastData[forecastData.length - 1].predictedValue;

    if (firstValue === 0) {
      return { direction: 'stable', rate: 0 };
    }

    const rate = ((lastValue - firstValue) / firstValue) * 100;

    let direction: string;
    if (rate > 2) {
      direction = 'increasing';
    } else if (rate < -2) {
      direction = 'decreasing';
    } else {
      direction = 'stable';
    }

    return { direction, rate };
  }
}