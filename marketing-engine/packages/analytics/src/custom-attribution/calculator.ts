/**
 * ROI and value calculation for attribution
 */

import { Logger } from '../core/logger';
import { AttributionResult, AttributionTouchpoint } from '../core/types';

export interface CalculatorOptions {
  logger: Logger;
}

export interface ROIMetrics {
  touchpointId: string;
  channel: string;
  cost: number;
  revenue: number;
  roi: number;
  roas: number; // Return on Ad Spend
  attributedValue: number;
}

export interface ChannelROI {
  channel: string;
  totalCost: number;
  totalRevenue: number;
  roi: number;
  roas: number;
  touchpoints: number;
  conversions: number;
}

export class AttributionCalculator {
  private readonly logger: Logger;
  private channelCosts: Map<string, number> = new Map();

  constructor(options: CalculatorOptions) {
    this.logger = options.logger.child({ component: 'AttributionCalculator' });
    
    // Default channel costs (would be loaded from database in production)
    this.initializeChannelCosts();
  }

  /**
   * Initialize default channel costs
   */
  private initializeChannelCosts(): void {
    this.channelCosts.set('paid_search', 2.50); // Cost per click
    this.channelCosts.set('display', 0.50); // Cost per impression
    this.channelCosts.set('social', 1.00); // Cost per engagement
    this.channelCosts.set('email', 0.10); // Cost per send
    this.channelCosts.set('organic', 0); // No direct cost
    this.channelCosts.set('direct', 0); // No direct cost
    this.channelCosts.set('referral', 0.25); // Affiliate commission
  }

  /**
   * Calculate ROI for attribution result
   */
  async calculateROI(result: AttributionResult): Promise<ROIMetrics[]> {
    const metrics: ROIMetrics[] = [];

    for (const touchpoint of result.touchpoints) {
      const cost = await this.getTouchpointCost(touchpoint);
      const attributedValue = result.conversionValue * (touchpoint.credit || 0);
      
      const roi = cost > 0 ? ((attributedValue - cost) / cost) * 100 : 0;
      const roas = cost > 0 ? attributedValue / cost : 0;

      metrics.push({
        touchpointId: touchpoint.touchpointId,
        channel: touchpoint.channel,
        cost,
        revenue: attributedValue,
        roi,
        roas,
        attributedValue
      });
    }

    this.logger.debug('ROI calculated', {
      conversionId: result.conversionId,
      touchpoints: metrics.length
    });

    return metrics;
  }

  /**
   * Calculate channel-level ROI
   */
  async calculateChannelROI(
    results: AttributionResult[]
  ): Promise<ChannelROI[]> {
    const channelMetrics = new Map<string, ChannelROI>();

    // Aggregate metrics by channel
    for (const result of results) {
      const roiMetrics = await this.calculateROI(result);
      
      for (const metric of roiMetrics) {
        let channelROI = channelMetrics.get(metric.channel);
        
        if (!channelROI) {
          channelROI = {
            channel: metric.channel,
            totalCost: 0,
            totalRevenue: 0,
            roi: 0,
            roas: 0,
            touchpoints: 0,
            conversions: 0
          };
          channelMetrics.set(metric.channel, channelROI);
        }

        channelROI.totalCost += metric.cost;
        channelROI.totalRevenue += metric.revenue;
        channelROI.touchpoints += 1;
        if (metric.attributedValue > 0) {
          channelROI.conversions += 1;
        }
      }
    }

    // Calculate final ROI metrics
    const channelROIArray: ChannelROI[] = [];
    for (const channelROI of channelMetrics.values()) {
      channelROI.roi = channelROI.totalCost > 0 
        ? ((channelROI.totalRevenue - channelROI.totalCost) / channelROI.totalCost) * 100 
        : 0;
      channelROI.roas = channelROI.totalCost > 0 
        ? channelROI.totalRevenue / channelROI.totalCost 
        : 0;
      
      channelROIArray.push(channelROI);
    }

    // Sort by ROI descending
    channelROIArray.sort((a, b) => b.roi - a.roi);

    this.logger.info('Channel ROI calculated', {
      channels: channelROIArray.length,
      totalRevenue: channelROIArray.reduce((sum, c) => sum + c.totalRevenue, 0),
      totalCost: channelROIArray.reduce((sum, c) => sum + c.totalCost, 0)
    });

    return channelROIArray;
  }

  /**
   * Calculate customer lifetime value attribution
   */
  async calculateCLVAttribution(
    userId: string,
    historicalValue: number,
    predictedValue: number,
    touchpoints: AttributionTouchpoint[]
  ): Promise<Map<string, number>> {
    const totalValue = historicalValue + predictedValue;
    const channelValues = new Map<string, number>();

    // Distribute CLV across touchpoints
    for (const touchpoint of touchpoints) {
      const attributedValue = totalValue * (touchpoint.credit || 0);
      const currentValue = channelValues.get(touchpoint.channel) || 0;
      channelValues.set(touchpoint.channel, currentValue + attributedValue);
    }

    this.logger.debug('CLV attribution calculated', {
      userId,
      totalValue,
      channels: channelValues.size
    });

    return channelValues;
  }

  /**
   * Calculate incremental lift
   */
  async calculateIncrementalLift(
    testResults: AttributionResult[],
    controlResults: AttributionResult[]
  ): Promise<number> {
    const testValue = testResults.reduce(
      (sum, r) => sum + r.conversionValue, 
      0
    );
    const controlValue = controlResults.reduce(
      (sum, r) => sum + r.conversionValue, 
      0
    );

    const lift = controlValue > 0 
      ? ((testValue - controlValue) / controlValue) * 100 
      : 0;

    this.logger.info('Incremental lift calculated', {
      testValue,
      controlValue,
      lift
    });

    return lift;
  }

  /**
   * Get touchpoint cost
   */
  private async getTouchpointCost(
    touchpoint: AttributionTouchpoint
  ): Promise<number> {
    // In production, this would query actual cost data from campaigns
    const baseCost = this.channelCosts.get(touchpoint.channel) || 0;
    
    // Apply campaign-specific multipliers
    let multiplier = 1;
    if (touchpoint.campaign) {
      // Premium campaigns cost more
      if (touchpoint.campaign.includes('premium')) {
        multiplier = 2;
      } else if (touchpoint.campaign.includes('brand')) {
        multiplier = 1.5;
      }
    }

    return baseCost * multiplier;
  }

  /**
   * Update channel costs
   */
  updateChannelCost(channel: string, costPerAction: number): void {
    this.channelCosts.set(channel, costPerAction);
    
    this.logger.info('Channel cost updated', {
      channel,
      costPerAction
    });
  }

  /**
   * Calculate attribution efficiency
   */
  calculateEfficiency(result: AttributionResult): number {
    // Efficiency = (Conversion Value / Number of Touchpoints)
    const efficiency = result.touchpoints.length > 0
      ? result.conversionValue / result.touchpoints.length
      : 0;

    return efficiency;
  }

  /**
   * Calculate path efficiency metrics
   */
  async calculatePathEfficiency(
    paths: Array<{
      path: string[];
      conversions: number;
      value: number;
    }>
  ): Promise<Array<{
    path: string;
    efficiency: number;
    avgValue: number;
    touchpoints: number;
  }>> {
    return paths.map(p => ({
      path: p.path.join(' → '),
      efficiency: p.value / p.path.length,
      avgValue: p.value / p.conversions,
      touchpoints: p.path.length
    })).sort((a, b) => b.efficiency - a.efficiency);
  }
}