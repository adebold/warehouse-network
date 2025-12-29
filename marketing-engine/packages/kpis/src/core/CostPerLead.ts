import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { 
  CostPerLeadMetrics, 
  KPIFilters, 
  ChannelType,
  Lead,
  MarketingCost 
} from '../types/kpi.types';

export class CostPerLeadCalculator {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:cpl:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(filters: KPIFilters): Promise<CostPerLeadMetrics> {
    const cacheKey = this.getCacheKey(filters);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('CPL metrics retrieved from cache', { filters });
        return this.deserializeMetrics(JSON.parse(cached));
      }

      // Calculate metrics
      const metrics = await this.calculateMetrics(filters);

      // Cache the results
      await this.redis.set(
        cacheKey, 
        JSON.stringify(this.serializeMetrics(metrics)), 
        this.cacheTTL
      );

      // Store in database for historical tracking
      await this.storeCalculation(metrics, filters);

      return metrics;
    } catch (error) {
      logger.error('Error calculating CPL metrics', { error, filters });
      throw error;
    }
  }

  private async calculateMetrics(filters: KPIFilters): Promise<CostPerLeadMetrics> {
    const { leads, costs } = await this.fetchData(filters);
    
    const totalCost = costs.reduce(
      (sum, cost) => sum.plus(cost.amount), 
      new Decimal(0)
    );
    
    const totalLeads = leads.length;
    const costPerLead = totalLeads > 0 
      ? totalCost.dividedBy(totalLeads) 
      : new Decimal(0);

    // Calculate channel breakdown
    const channelBreakdown = this.calculateChannelBreakdown(leads, costs);

    // Calculate quality-adjusted CPL
    const qualityAdjustedCPL = this.calculateQualityAdjustedCPL(
      leads, 
      totalCost
    );

    // Calculate trend
    const trend = await this.calculateTrend(filters, costPerLead);

    return {
      totalCost,
      totalLeads,
      costPerLead,
      channelBreakdown,
      qualityAdjustedCPL,
      trend
    };
  }

  private async fetchData(filters: KPIFilters): Promise<{
    leads: Lead[];
    costs: MarketingCost[];
  }> {
    const dateFilter = filters.dateRange 
      ? `AND created_at BETWEEN $1 AND $2`
      : '';
    
    const channelFilter = filters.channels?.length 
      ? `AND source_channel = ANY($${filters.dateRange ? 3 : 1})`
      : '';

    let paramIndex = 1;
    const params: any[] = [];
    
    if (filters.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
      paramIndex = 3;
    }
    
    if (filters.channels?.length) {
      params.push(filters.channels);
    }

    // Fetch leads
    const leadsQuery = `
      SELECT 
        id,
        external_id as "externalId",
        email,
        source_channel as "sourceChannel",
        campaign_id as "campaignId",
        status,
        quality_score as "qualityScore",
        created_at as "createdAt",
        updated_at as "updatedAt",
        metadata
      FROM leads
      WHERE 1=1 ${dateFilter} ${channelFilter}
    `;
    
    const leadsResult = await this.db.query<Lead>(leadsQuery, params);
    const leads = leadsResult.rows;

    // Fetch costs with proper date filtering for costs table
    const costsDateFilter = filters.dateRange 
      ? `AND cost_date BETWEEN $1::date AND $2::date`
      : '';
    
    const costsQuery = `
      SELECT 
        id,
        channel,
        campaign_id as "campaignId",
        cost_date as "costDate",
        amount,
        currency,
        impressions,
        clicks,
        created_at as "createdAt",
        metadata
      FROM marketing_costs
      WHERE 1=1 ${costsDateFilter} ${channelFilter.replace('source_channel', 'channel')}
    `;
    
    const costsResult = await this.db.query<MarketingCost>(costsQuery, params);
    const costs = costsResult.rows;

    return { leads, costs };
  }

  private calculateChannelBreakdown(
    leads: Lead[], 
    costs: MarketingCost[]
  ): Record<ChannelType, { cost: Decimal; leads: number; cpl: Decimal }> {
    const breakdown: Record<string, { 
      cost: Decimal; 
      leads: number; 
      cpl: Decimal 
    }> = {};

    // Group costs by channel
    const costsByChannel = costs.reduce((acc, cost) => {
      if (!acc[cost.channel]) {
        acc[cost.channel] = new Decimal(0);
      }
      acc[cost.channel] = acc[cost.channel].plus(cost.amount);
      return acc;
    }, {} as Record<string, Decimal>);

    // Group leads by channel
    const leadsByChannel = leads.reduce((acc, lead) => {
      if (!acc[lead.sourceChannel]) {
        acc[lead.sourceChannel] = 0;
      }
      acc[lead.sourceChannel]++;
      return acc;
    }, {} as Record<string, number>);

    // Calculate CPL per channel
    const allChannels = new Set([
      ...Object.keys(costsByChannel),
      ...Object.keys(leadsByChannel)
    ]);

    allChannels.forEach(channel => {
      const cost = costsByChannel[channel] || new Decimal(0);
      const leadCount = leadsByChannel[channel] || 0;
      const cpl = leadCount > 0 
        ? cost.dividedBy(leadCount) 
        : new Decimal(0);

      breakdown[channel] = { cost, leads: leadCount, cpl };
    });

    return breakdown as Record<ChannelType, { 
      cost: Decimal; 
      leads: number; 
      cpl: Decimal 
    }>;
  }

  private calculateQualityAdjustedCPL(
    leads: Lead[], 
    totalCost: Decimal
  ): Decimal {
    const qualifiedLeads = leads.filter(
      lead => (lead.qualityScore || 0) >= 0.7
    );
    
    const qualifiedCount = qualifiedLeads.length;
    
    return qualifiedCount > 0 
      ? totalCost.dividedBy(qualifiedCount) 
      : new Decimal(0);
  }

  private async calculateTrend(
    filters: KPIFilters, 
    currentCPL: Decimal
  ): Promise<{ previousPeriod: Decimal; changePercent: Decimal }> {
    if (!filters.dateRange) {
      return {
        previousPeriod: new Decimal(0),
        changePercent: new Decimal(0)
      };
    }

    const periodLength = filters.dateRange.endDate.getTime() - 
                        filters.dateRange.startDate.getTime();
    
    const previousStart = new Date(
      filters.dateRange.startDate.getTime() - periodLength
    );
    const previousEnd = new Date(
      filters.dateRange.endDate.getTime() - periodLength
    );

    const previousFilters: KPIFilters = {
      ...filters,
      dateRange: {
        startDate: previousStart,
        endDate: previousEnd
      }
    };

    const previousMetrics = await this.calculateMetrics(previousFilters);
    const previousCPL = previousMetrics.costPerLead;

    const changePercent = previousCPL.greaterThan(0)
      ? currentCPL.minus(previousCPL)
          .dividedBy(previousCPL)
          .times(100)
      : new Decimal(0);

    return {
      previousPeriod: previousCPL,
      changePercent
    };
  }

  private async storeCalculation(
    metrics: CostPerLeadMetrics, 
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
      totalCost: metrics.totalCost.toString(),
      totalLeads: metrics.totalLeads,
      qualityAdjustedCPL: metrics.qualityAdjustedCPL.toString(),
      channelBreakdown: Object.entries(metrics.channelBreakdown).map(
        ([channel, data]) => ({
          channel,
          cost: data.cost.toString(),
          leads: data.leads,
          cpl: data.cpl.toString()
        })
      ),
      trend: {
        previousPeriod: metrics.trend.previousPeriod.toString(),
        changePercent: metrics.trend.changePercent.toString()
      }
    };

    await this.db.query(query, [
      'cost_per_lead',
      new Date(),
      filters.groupBy || 'custom',
      null, // Can be specific channel if filtered
      metrics.costPerLead.toNumber(),
      details
    ]);
  }

  private getCacheKey(filters: KPIFilters): string {
    const parts = [this.cachePrefix];
    
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

  private serializeMetrics(metrics: CostPerLeadMetrics): any {
    return {
      ...metrics,
      totalCost: metrics.totalCost.toString(),
      costPerLead: metrics.costPerLead.toString(),
      qualityAdjustedCPL: metrics.qualityAdjustedCPL.toString(),
      channelBreakdown: Object.entries(metrics.channelBreakdown).reduce(
        (acc, [channel, data]) => ({
          ...acc,
          [channel]: {
            cost: data.cost.toString(),
            leads: data.leads,
            cpl: data.cpl.toString()
          }
        }),
        {}
      ),
      trend: {
        previousPeriod: metrics.trend.previousPeriod.toString(),
        changePercent: metrics.trend.changePercent.toString()
      }
    };
  }

  private deserializeMetrics(data: any): CostPerLeadMetrics {
    return {
      ...data,
      totalCost: new Decimal(data.totalCost),
      costPerLead: new Decimal(data.costPerLead),
      qualityAdjustedCPL: new Decimal(data.qualityAdjustedCPL),
      channelBreakdown: Object.entries(data.channelBreakdown).reduce(
        (acc, [channel, info]: [string, any]) => ({
          ...acc,
          [channel]: {
            cost: new Decimal(info.cost),
            leads: info.leads,
            cpl: new Decimal(info.cpl)
          }
        }),
        {} as Record<ChannelType, { cost: Decimal; leads: number; cpl: Decimal }>
      ),
      trend: {
        previousPeriod: new Decimal(data.trend.previousPeriod),
        changePercent: new Decimal(data.trend.changePercent)
      }
    };
  }

  public async forecast(
    filters: KPIFilters, 
    periods: number = 3
  ): Promise<{ period: Date; forecast: Decimal }[]> {
    // Fetch historical data for trend analysis
    const historicalData = await this.fetchHistoricalData(filters);
    
    if (historicalData.length < 3) {
      logger.warn('Insufficient historical data for forecasting');
      return [];
    }

    // Simple moving average forecast
    const recentValues = historicalData
      .slice(-5)
      .map(d => new Decimal(d.value));
    
    const averageGrowth = this.calculateAverageGrowth(recentValues);
    const lastValue = recentValues[recentValues.length - 1];
    
    const forecasts: { period: Date; forecast: Decimal }[] = [];
    
    for (let i = 1; i <= periods; i++) {
      const forecastValue = lastValue.times(
        new Decimal(1).plus(averageGrowth.times(i))
      );
      
      const forecastDate = new Date();
      forecastDate.setMonth(forecastDate.getMonth() + i);
      
      forecasts.push({
        period: forecastDate,
        forecast: forecastValue
      });
    }

    return forecasts;
  }

  private async fetchHistoricalData(filters: KPIFilters): Promise<any[]> {
    const query = `
      SELECT 
        calculation_date,
        value,
        details
      FROM kpi_calculations
      WHERE kpi_type = 'cost_per_lead'
      ${filters.channels?.length ? 'AND channel = ANY($1)' : ''}
      ORDER BY calculation_date DESC
      LIMIT 30
    `;
    
    const params = filters.channels?.length ? [filters.channels] : [];
    const result = await this.db.query(query, params);
    
    return result.rows;
  }

  private calculateAverageGrowth(values: Decimal[]): Decimal {
    if (values.length < 2) return new Decimal(0);
    
    const growthRates: Decimal[] = [];
    
    for (let i = 1; i < values.length; i++) {
      const previous = values[i - 1];
      const current = values[i];
      
      if (previous.greaterThan(0)) {
        const growth = current.minus(previous).dividedBy(previous);
        growthRates.push(growth);
      }
    }
    
    if (growthRates.length === 0) return new Decimal(0);
    
    const sum = growthRates.reduce((acc, rate) => acc.plus(rate), new Decimal(0));
    return sum.dividedBy(growthRates.length);
  }
}