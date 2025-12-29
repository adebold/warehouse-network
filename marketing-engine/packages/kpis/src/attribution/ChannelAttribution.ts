import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { 
  ChannelAttributionMetrics, 
  AttributionModel,
  KPIFilters, 
  ChannelType,
  ChannelTouchpoint,
  Customer,
  Revenue 
} from '../types/kpi.types';

export class ChannelAttributionCalculator {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:attribution:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(
    model: AttributionModel,
    filters: KPIFilters
  ): Promise<ChannelAttributionMetrics> {
    const cacheKey = this.getCacheKey(model, filters);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('Attribution metrics retrieved from cache', { model, filters });
        return this.deserializeMetrics(JSON.parse(cached));
      }

      // Calculate metrics
      const metrics = await this.calculateMetrics(model, filters);

      // Cache the results
      await this.redis.set(
        cacheKey, 
        JSON.stringify(this.serializeMetrics(metrics)), 
        this.cacheTTL
      );

      // Store in database for historical tracking
      await this.storeCalculation(metrics, model, filters);

      return metrics;
    } catch (error) {
      logger.error('Error calculating attribution metrics', { error, model, filters });
      throw error;
    }
  }

  private async calculateMetrics(
    model: AttributionModel,
    filters: KPIFilters
  ): Promise<ChannelAttributionMetrics> {
    const { customers, touchpoints, revenues } = await this.fetchData(filters);
    
    // Apply attribution model to assign weights
    const weightedTouchpoints = this.applyAttributionModel(model, touchpoints);

    // Calculate total revenue
    const totalRevenue = revenues.reduce(
      (sum, rev) => sum.plus(rev.amount), 
      new Decimal(0)
    );

    // Calculate channel contributions
    const channelContributions = this.calculateChannelContributions(
      weightedTouchpoints,
      revenues,
      totalRevenue
    );

    // Analyze conversion paths
    const pathAnalysis = this.analyzeConversionPaths(
      customers,
      touchpoints,
      revenues
    );

    // Generate budget optimization recommendations
    const recommendations = await this.generateRecommendations(
      channelContributions,
      totalRevenue
    );

    return {
      model,
      totalRevenue,
      channelContributions,
      pathAnalysis,
      recommendations
    };
  }

  private async fetchData(filters: KPIFilters): Promise<{
    customers: Customer[];
    touchpoints: ChannelTouchpoint[];
    revenues: Revenue[];
  }> {
    const dateFilter = filters.dateRange 
      ? `AND c.acquisition_date BETWEEN $1 AND $2`
      : '';
    
    let params: any[] = [];
    
    if (filters.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
    }

    // Fetch customers who converted
    const customersQuery = `
      SELECT 
        c.id,
        c.lead_id as "leadId",
        c.external_id as "externalId",
        c.email,
        c.acquisition_date as "acquisitionDate",
        c.acquisition_channel as "acquisitionChannel",
        c.acquisition_cost as "acquisitionCost",
        c.lifetime_value as "lifetimeValue",
        c.churn_date as "churnDate",
        c.created_at as "createdAt",
        c.updated_at as "updatedAt",
        c.metadata
      FROM customers c
      WHERE EXISTS (
        SELECT 1 FROM revenue r WHERE r.customer_id = c.id
      )
      ${dateFilter}
    `;
    
    const customersResult = await this.db.query<Customer>(customersQuery, params);
    const customers = customersResult.rows;

    const customerIds = customers.map(c => c.id);
    const leadIds = customers.filter(c => c.leadId).map(c => c.leadId!);

    if (customerIds.length === 0) {
      return { customers: [], touchpoints: [], revenues: [] };
    }

    // Fetch all touchpoints for these customers
    const touchpointsQuery = `
      SELECT 
        t.id,
        t.lead_id as "leadId",
        t.customer_id as "customerId",
        t.channel,
        t.touchpoint_date as "touchpointDate",
        t.position_in_journey as "positionInJourney",
        t.interaction_type as "interactionType",
        t.attribution_weight as "attributionWeight",
        t.created_at as "createdAt",
        t.metadata
      FROM channel_touchpoints t
      WHERE (
        t.customer_id = ANY($1) 
        OR t.lead_id = ANY($2)
      )
      ORDER BY t.touchpoint_date
    `;
    
    const touchpointsResult = await this.db.query<ChannelTouchpoint>(
      touchpointsQuery, 
      [customerIds, leadIds]
    );
    const touchpoints = touchpointsResult.rows;

    // Fetch revenues
    const revenuesQuery = `
      SELECT 
        id,
        customer_id as "customerId",
        amount,
        revenue_date as "revenueDate",
        type,
        recurring,
        created_at as "createdAt",
        metadata
      FROM revenue
      WHERE customer_id = ANY($1)
      ${filters.dateRange ? 'AND revenue_date BETWEEN $2 AND $3' : ''}
    `;
    
    const revenueParams = filters.dateRange 
      ? [customerIds, filters.dateRange.startDate, filters.dateRange.endDate]
      : [customerIds];
    
    const revenuesResult = await this.db.query<Revenue>(revenuesQuery, revenueParams);
    const revenues = revenuesResult.rows;

    return { customers, touchpoints, revenues };
  }

  private applyAttributionModel(
    model: AttributionModel,
    touchpoints: ChannelTouchpoint[]
  ): ChannelTouchpoint[] {
    // Group touchpoints by customer/lead journey
    const journeys = new Map<string, ChannelTouchpoint[]>();
    
    touchpoints.forEach(tp => {
      const key = tp.customerId || tp.leadId || 'unknown';
      if (!journeys.has(key)) {
        journeys.set(key, []);
      }
      journeys.get(key)!.push(tp);
    });

    const weightedTouchpoints: ChannelTouchpoint[] = [];

    for (const [journeyKey, journeyTouchpoints] of journeys) {
      // Sort by position in journey
      journeyTouchpoints.sort((a, b) => a.positionInJourney - b.positionInJourney);
      
      const weights = this.calculateWeights(model, journeyTouchpoints.length);
      
      journeyTouchpoints.forEach((tp, index) => {
        weightedTouchpoints.push({
          ...tp,
          attributionWeight: weights[index]
        });
      });
    }

    return weightedTouchpoints;
  }

  private calculateWeights(model: AttributionModel, touchpointCount: number): number[] {
    const weights: number[] = new Array(touchpointCount).fill(0);

    switch (model) {
      case 'first_touch':
        weights[0] = 1;
        break;
        
      case 'last_touch':
        weights[touchpointCount - 1] = 1;
        break;
        
      case 'linear':
        const linearWeight = 1 / touchpointCount;
        weights.fill(linearWeight);
        break;
        
      case 'time_decay':
        // More recent touchpoints get higher weight
        const decayRate = 0.7;
        let totalWeight = 0;
        
        for (let i = 0; i < touchpointCount; i++) {
          weights[i] = Math.pow(decayRate, touchpointCount - 1 - i);
          totalWeight += weights[i];
        }
        
        // Normalize weights to sum to 1
        for (let i = 0; i < touchpointCount; i++) {
          weights[i] /= totalWeight;
        }
        break;
        
      case 'u_shaped':
        if (touchpointCount === 1) {
          weights[0] = 1;
        } else if (touchpointCount === 2) {
          weights[0] = 0.5;
          weights[1] = 0.5;
        } else {
          weights[0] = 0.4; // First touch
          weights[touchpointCount - 1] = 0.4; // Last touch
          const middleWeight = 0.2 / (touchpointCount - 2);
          for (let i = 1; i < touchpointCount - 1; i++) {
            weights[i] = middleWeight;
          }
        }
        break;
        
      case 'w_shaped':
        if (touchpointCount === 1) {
          weights[0] = 1;
        } else if (touchpointCount === 2) {
          weights[0] = 0.5;
          weights[1] = 0.5;
        } else if (touchpointCount === 3) {
          weights[0] = 0.3;
          weights[1] = 0.4;
          weights[2] = 0.3;
        } else {
          const middleIndex = Math.floor(touchpointCount / 2);
          weights[0] = 0.3; // First touch
          weights[middleIndex] = 0.3; // Middle touch
          weights[touchpointCount - 1] = 0.3; // Last touch
          
          const remainingWeight = 0.1 / (touchpointCount - 3);
          for (let i = 0; i < touchpointCount; i++) {
            if (i !== 0 && i !== middleIndex && i !== touchpointCount - 1) {
              weights[i] = remainingWeight;
            }
          }
        }
        break;
        
      case 'data_driven':
        // Simplified data-driven model based on conversion probability
        // In production, this would use ML models
        const conversionImpact = this.calculateConversionImpact(touchpointCount);
        return conversionImpact;
        
      default:
        weights[touchpointCount - 1] = 1; // Default to last touch
    }

    return weights;
  }

  private calculateConversionImpact(touchpointCount: number): number[] {
    // Simplified conversion impact calculation
    // In production, this would be based on historical conversion data
    const weights: number[] = new Array(touchpointCount).fill(0);
    
    // Assign higher weights to early and late touchpoints
    for (let i = 0; i < touchpointCount; i++) {
      const position = i / (touchpointCount - 1);
      // U-shaped curve with higher weights at beginning and end
      weights[i] = 0.3 * Math.exp(-10 * Math.pow(position - 0, 2)) + 
                   0.7 * Math.exp(-10 * Math.pow(position - 1, 2));
    }
    
    // Normalize
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }

  private calculateChannelContributions(
    touchpoints: ChannelTouchpoint[],
    revenues: Revenue[],
    totalRevenue: Decimal
  ): Record<ChannelType, {
    revenue: Decimal;
    percentage: Decimal;
    touchpoints: number;
    averagePosition: number;
  }> {
    const contributions: Record<string, {
      revenue: Decimal;
      touchpointCount: number;
      positionSum: number;
    }> = {};

    // Group revenues by customer
    const revenueByCustomer = revenues.reduce((acc, rev) => {
      if (!acc[rev.customerId]) {
        acc[rev.customerId] = new Decimal(0);
      }
      acc[rev.customerId] = acc[rev.customerId].plus(rev.amount);
      return acc;
    }, {} as Record<string, Decimal>);

    // Calculate contribution per channel
    touchpoints.forEach(tp => {
      const customerId = tp.customerId || '';
      const customerRevenue = revenueByCustomer[customerId] || new Decimal(0);
      const attributedRevenue = customerRevenue.times(tp.attributionWeight);

      if (!contributions[tp.channel]) {
        contributions[tp.channel] = {
          revenue: new Decimal(0),
          touchpointCount: 0,
          positionSum: 0
        };
      }

      contributions[tp.channel].revenue = contributions[tp.channel].revenue.plus(
        attributedRevenue
      );
      contributions[tp.channel].touchpointCount++;
      contributions[tp.channel].positionSum += tp.positionInJourney;
    });

    // Calculate final metrics
    const result: Record<ChannelType, {
      revenue: Decimal;
      percentage: Decimal;
      touchpoints: number;
      averagePosition: number;
    }> = {};

    Object.entries(contributions).forEach(([channel, data]) => {
      const percentage = totalRevenue.greaterThan(0)
        ? data.revenue.dividedBy(totalRevenue).times(100)
        : new Decimal(0);

      const averagePosition = data.touchpointCount > 0
        ? data.positionSum / data.touchpointCount
        : 0;

      result[channel as ChannelType] = {
        revenue: data.revenue,
        percentage,
        touchpoints: data.touchpointCount,
        averagePosition
      };
    });

    return result;
  }

  private analyzeConversionPaths(
    customers: Customer[],
    touchpoints: ChannelTouchpoint[],
    revenues: Revenue[]
  ): {
    path: ChannelType[];
    frequency: number;
    revenue: Decimal;
    conversionRate: Decimal;
  }[] {
    // Group touchpoints by customer
    const touchpointsByCustomer = touchpoints.reduce((acc, tp) => {
      const key = tp.customerId || tp.leadId || 'unknown';
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(tp);
      return acc;
    }, {} as Record<string, ChannelTouchpoint[]>);

    // Group revenues by customer
    const revenueByCustomer = revenues.reduce((acc, rev) => {
      if (!acc[rev.customerId]) {
        acc[rev.customerId] = new Decimal(0);
      }
      acc[rev.customerId] = acc[rev.customerId].plus(rev.amount);
      return acc;
    }, {} as Record<string, Decimal>);

    // Analyze paths
    const pathMap = new Map<string, {
      frequency: number;
      revenue: Decimal;
      conversions: number;
    }>();

    customers.forEach(customer => {
      const customerTouchpoints = touchpointsByCustomer[customer.id] || [];
      
      if (customerTouchpoints.length === 0) return;

      // Sort by position
      customerTouchpoints.sort((a, b) => a.positionInJourney - b.positionInJourney);
      
      // Create path string
      const path = customerTouchpoints.map(tp => tp.channel);
      const pathKey = path.join(' → ');
      
      const customerRevenue = revenueByCustomer[customer.id] || new Decimal(0);
      
      if (!pathMap.has(pathKey)) {
        pathMap.set(pathKey, {
          frequency: 0,
          revenue: new Decimal(0),
          conversions: 0
        });
      }
      
      const pathData = pathMap.get(pathKey)!;
      pathData.frequency++;
      pathData.revenue = pathData.revenue.plus(customerRevenue);
      if (customerRevenue.greaterThan(0)) {
        pathData.conversions++;
      }
    });

    // Convert to array and calculate conversion rates
    const pathAnalysis: {
      path: ChannelType[];
      frequency: number;
      revenue: Decimal;
      conversionRate: Decimal;
    }[] = [];

    pathMap.forEach((data, pathKey) => {
      const path = pathKey.split(' → ') as ChannelType[];
      const conversionRate = data.frequency > 0
        ? new Decimal(data.conversions).dividedBy(data.frequency)
        : new Decimal(0);

      pathAnalysis.push({
        path,
        frequency: data.frequency,
        revenue: data.revenue,
        conversionRate
      });
    });

    // Sort by frequency descending
    pathAnalysis.sort((a, b) => b.frequency - a.frequency);
    
    return pathAnalysis.slice(0, 20); // Return top 20 paths
  }

  private async generateRecommendations(
    channelContributions: Record<ChannelType, {
      revenue: Decimal;
      percentage: Decimal;
      touchpoints: number;
      averagePosition: number;
    }>,
    totalRevenue: Decimal
  ): Promise<{
    channel: ChannelType;
    currentBudget: Decimal;
    recommendedBudget: Decimal;
    expectedImpact: Decimal;
  }[]> {
    // Fetch current budget allocation
    const budgetQuery = `
      SELECT 
        channel,
        SUM(amount) as total_budget
      FROM marketing_costs
      WHERE cost_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY channel
    `;
    
    const budgetResult = await this.db.query<{
      channel: ChannelType;
      total_budget: string;
    }>(budgetQuery);
    
    const currentBudgets = budgetResult.rows.reduce((acc, row) => {
      acc[row.channel] = new Decimal(row.total_budget);
      return acc;
    }, {} as Record<ChannelType, Decimal>);

    const totalBudget = Object.values(currentBudgets).reduce(
      (sum, budget) => sum.plus(budget),
      new Decimal(0)
    );

    const recommendations: {
      channel: ChannelType;
      currentBudget: Decimal;
      recommendedBudget: Decimal;
      expectedImpact: Decimal;
    }[] = [];

    // Generate recommendations based on ROI efficiency
    Object.entries(channelContributions).forEach(([channel, contribution]) => {
      const currentBudget = currentBudgets[channel as ChannelType] || new Decimal(0);
      
      // Calculate ROI efficiency
      const roiEfficiency = currentBudget.greaterThan(0)
        ? contribution.revenue.dividedBy(currentBudget)
        : new Decimal(0);

      // Recommend budget based on revenue contribution
      const recommendedBudgetPercent = contribution.percentage.dividedBy(100);
      const recommendedBudget = totalBudget.times(recommendedBudgetPercent);

      // Calculate expected impact
      const budgetChange = recommendedBudget.minus(currentBudget);
      const expectedImpact = budgetChange.times(roiEfficiency);

      recommendations.push({
        channel: channel as ChannelType,
        currentBudget,
        recommendedBudget,
        expectedImpact
      });
    });

    // Sort by expected impact descending
    recommendations.sort((a, b) => 
      b.expectedImpact.minus(a.expectedImpact).toNumber()
    );

    return recommendations;
  }

  private async storeCalculation(
    metrics: ChannelAttributionMetrics,
    model: AttributionModel,
    filters: KPIFilters
  ): Promise<void> {
    const query = `
      INSERT INTO kpi_calculations (
        kpi_type,
        calculation_date,
        time_period,
        channel,
        value,
        details
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const details = {
      model,
      totalRevenue: metrics.totalRevenue.toString(),
      channelContributions: Object.entries(metrics.channelContributions).map(
        ([channel, data]) => ({
          channel,
          revenue: data.revenue.toString(),
          percentage: data.percentage.toString(),
          touchpoints: data.touchpoints,
          averagePosition: data.averagePosition
        })
      ),
      topPaths: metrics.pathAnalysis.slice(0, 10).map(path => ({
        path: path.path,
        frequency: path.frequency,
        revenue: path.revenue.toString(),
        conversionRate: path.conversionRate.toString()
      })),
      recommendations: metrics.recommendations.map(rec => ({
        channel: rec.channel,
        currentBudget: rec.currentBudget.toString(),
        recommendedBudget: rec.recommendedBudget.toString(),
        expectedImpact: rec.expectedImpact.toString()
      }))
    };

    await this.db.query(query, [
      'channel_attribution',
      new Date(),
      filters.groupBy || 'custom',
      null,
      metrics.totalRevenue.toNumber(),
      details
    ]);
  }

  private getCacheKey(model: AttributionModel, filters: KPIFilters): string {
    const parts = [this.cachePrefix, model];
    
    if (filters.dateRange) {
      parts.push(
        `${filters.dateRange.startDate.toISOString()}-${filters.dateRange.endDate.toISOString()}`
      );
    }
    
    if (filters.channels?.length) {
      parts.push(filters.channels.sort().join(','));
    }
    
    if (filters.campaigns?.length) {
      parts.push(filters.campaigns.sort().join(','));
    }
    
    if (filters.groupBy) {
      parts.push(filters.groupBy);
    }

    return parts.join(':');
  }

  private serializeMetrics(metrics: ChannelAttributionMetrics): any {
    return {
      ...metrics,
      totalRevenue: metrics.totalRevenue.toString(),
      channelContributions: Object.entries(metrics.channelContributions).reduce(
        (acc, [channel, data]) => ({
          ...acc,
          [channel]: {
            revenue: data.revenue.toString(),
            percentage: data.percentage.toString(),
            touchpoints: data.touchpoints,
            averagePosition: data.averagePosition
          }
        }),
        {}
      ),
      pathAnalysis: metrics.pathAnalysis.map(path => ({
        ...path,
        revenue: path.revenue.toString(),
        conversionRate: path.conversionRate.toString()
      })),
      recommendations: metrics.recommendations.map(rec => ({
        ...rec,
        currentBudget: rec.currentBudget.toString(),
        recommendedBudget: rec.recommendedBudget.toString(),
        expectedImpact: rec.expectedImpact.toString()
      }))
    };
  }

  private deserializeMetrics(data: any): ChannelAttributionMetrics {
    return {
      ...data,
      totalRevenue: new Decimal(data.totalRevenue),
      channelContributions: Object.entries(data.channelContributions).reduce(
        (acc, [channel, info]: [string, any]) => ({
          ...acc,
          [channel]: {
            revenue: new Decimal(info.revenue),
            percentage: new Decimal(info.percentage),
            touchpoints: info.touchpoints,
            averagePosition: info.averagePosition
          }
        }),
        {} as Record<ChannelType, {
          revenue: Decimal;
          percentage: Decimal;
          touchpoints: number;
          averagePosition: number;
        }>
      ),
      pathAnalysis: data.pathAnalysis.map((path: any) => ({
        ...path,
        revenue: new Decimal(path.revenue),
        conversionRate: new Decimal(path.conversionRate)
      })),
      recommendations: data.recommendations.map((rec: any) => ({
        ...rec,
        currentBudget: new Decimal(rec.currentBudget),
        recommendedBudget: new Decimal(rec.recommendedBudget),
        expectedImpact: new Decimal(rec.expectedImpact)
      }))
    };
  }

  public async compareModels(
    models: AttributionModel[],
    filters: KPIFilters
  ): Promise<Map<AttributionModel, ChannelAttributionMetrics>> {
    const results = new Map<AttributionModel, ChannelAttributionMetrics>();
    
    for (const model of models) {
      const metrics = await this.calculate(model, filters);
      results.set(model, metrics);
    }
    
    return results;
  }
}