import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { 
  EmailMarketingMetrics, 
  KPIFilters 
} from '../types/kpi.types';

export class EmailMarketingKPICalculator {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:email:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(
    campaignId: string,
    filters?: KPIFilters
  ): Promise<EmailMarketingMetrics> {
    const cacheKey = this.getCacheKey(campaignId, filters);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('Email metrics retrieved from cache', { campaignId, filters });
        return this.deserializeMetrics(JSON.parse(cached));
      }

      // Calculate metrics
      const metrics = await this.calculateMetrics(campaignId, filters);

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
      logger.error('Error calculating email metrics', { error, campaignId, filters });
      throw error;
    }
  }

  private async calculateMetrics(
    campaignId: string,
    filters?: KPIFilters
  ): Promise<EmailMarketingMetrics> {
    // Fetch campaign data
    const campaignData = await this.fetchCampaignData(campaignId);
    
    if (!campaignData) {
      throw new Error(`Email campaign not found: ${campaignId}`);
    }

    // Calculate delivery rate
    const deliveryRate = campaignData.total_sent > 0
      ? new Decimal(campaignData.total_delivered).dividedBy(campaignData.total_sent)
      : new Decimal(0);

    // Calculate open rate
    const openRate = campaignData.total_delivered > 0
      ? new Decimal(campaignData.unique_opens).dividedBy(campaignData.total_delivered)
      : new Decimal(0);

    // Calculate click rate (based on delivered)
    const clickRate = campaignData.total_delivered > 0
      ? new Decimal(campaignData.unique_clicks).dividedBy(campaignData.total_delivered)
      : new Decimal(0);

    // Calculate CTR (click-through rate based on opens)
    const ctr = campaignData.unique_opens > 0
      ? new Decimal(campaignData.unique_clicks).dividedBy(campaignData.unique_opens)
      : new Decimal(0);

    // Calculate conversion rate
    const conversionRate = campaignData.total_delivered > 0
      ? new Decimal(campaignData.total_conversions).dividedBy(campaignData.total_delivered)
      : new Decimal(0);

    // Calculate ROI
    const revenue = new Decimal(campaignData.revenue_generated);
    const cost = new Decimal(campaignData.cost);
    const roi = cost.greaterThan(0)
      ? revenue.minus(cost).dividedBy(cost)
      : new Decimal(0);

    // Calculate unsubscribe rate
    const unsubscribeRate = campaignData.total_delivered > 0
      ? new Decimal(campaignData.total_unsubscribed).dividedBy(campaignData.total_delivered)
      : new Decimal(0);

    // Calculate bounce rate
    const bounceRate = campaignData.total_sent > 0
      ? new Decimal(campaignData.total_bounced).dividedBy(campaignData.total_sent)
      : new Decimal(0);

    return {
      campaignId,
      sent: campaignData.total_sent,
      delivered: campaignData.total_delivered,
      deliveryRate,
      opened: campaignData.total_opened,
      openRate,
      clicked: campaignData.total_clicked,
      clickRate,
      ctr,
      conversions: campaignData.total_conversions,
      conversionRate,
      revenue,
      roi,
      unsubscribed: campaignData.total_unsubscribed,
      unsubscribeRate,
      bounced: campaignData.total_bounced,
      bounceRate
    };
  }

  private async fetchCampaignData(campaignId: string): Promise<any> {
    const query = `
      SELECT 
        campaign_id,
        name,
        sent_date,
        total_sent,
        total_delivered,
        total_opened,
        unique_opens,
        total_clicked,
        unique_clicks,
        total_unsubscribed,
        total_bounced,
        total_conversions,
        revenue_generated,
        cost,
        metadata
      FROM email_campaigns
      WHERE campaign_id = $1
    `;
    
    const result = await this.db.query(query, [campaignId]);
    return result.rows[0];
  }

  public async calculateBatch(
    campaignIds: string[],
    filters?: KPIFilters
  ): Promise<EmailMarketingMetrics[]> {
    const results = await Promise.all(
      campaignIds.map(id => this.calculate(id, filters))
    );
    return results;
  }

  public async calculateAggregate(
    filters: KPIFilters
  ): Promise<{
    totalCampaigns: number;
    avgOpenRate: Decimal;
    avgClickRate: Decimal;
    avgConversionRate: Decimal;
    totalRevenue: Decimal;
    totalCost: Decimal;
    overallROI: Decimal;
    topPerformers: EmailMarketingMetrics[];
  }> {
    const dateFilter = filters.dateRange
      ? `WHERE sent_date BETWEEN $1 AND $2`
      : '';
    
    const params = filters.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];

    // Fetch aggregate data
    const aggregateQuery = `
      SELECT 
        COUNT(*) as total_campaigns,
        SUM(total_sent) as total_sent,
        SUM(total_delivered) as total_delivered,
        SUM(unique_opens) as total_opens,
        SUM(unique_clicks) as total_clicks,
        SUM(total_conversions) as total_conversions,
        SUM(revenue_generated) as total_revenue,
        SUM(cost) as total_cost
      FROM email_campaigns
      ${dateFilter}
    `;
    
    const aggregateResult = await this.db.query(aggregateQuery, params);
    const aggregateData = aggregateResult.rows[0];

    // Calculate average rates
    const avgOpenRate = aggregateData.total_delivered > 0
      ? new Decimal(aggregateData.total_opens).dividedBy(aggregateData.total_delivered)
      : new Decimal(0);

    const avgClickRate = aggregateData.total_delivered > 0
      ? new Decimal(aggregateData.total_clicks).dividedBy(aggregateData.total_delivered)
      : new Decimal(0);

    const avgConversionRate = aggregateData.total_delivered > 0
      ? new Decimal(aggregateData.total_conversions).dividedBy(aggregateData.total_delivered)
      : new Decimal(0);

    const totalRevenue = new Decimal(aggregateData.total_revenue || 0);
    const totalCost = new Decimal(aggregateData.total_cost || 0);
    const overallROI = totalCost.greaterThan(0)
      ? totalRevenue.minus(totalCost).dividedBy(totalCost)
      : new Decimal(0);

    // Fetch top performers
    const topPerformersQuery = `
      SELECT campaign_id
      FROM email_campaigns
      ${dateFilter}
      ORDER BY 
        CASE 
          WHEN total_delivered > 0 
          THEN (revenue_generated - cost) / NULLIF(cost, 0)
          ELSE 0 
        END DESC
      LIMIT 5
    `;
    
    const topPerformersResult = await this.db.query(topPerformersQuery, params);
    const topPerformerIds = topPerformersResult.rows.map(r => r.campaign_id);
    
    const topPerformers = await this.calculateBatch(topPerformerIds, filters);

    return {
      totalCampaigns: parseInt(aggregateData.total_campaigns),
      avgOpenRate,
      avgClickRate,
      avgConversionRate,
      totalRevenue,
      totalCost,
      overallROI,
      topPerformers
    };
  }

  public async analyzeSegmentPerformance(
    filters: KPIFilters
  ): Promise<Map<string, {
    campaigns: number;
    avgOpenRate: Decimal;
    avgClickRate: Decimal;
    avgConversionRate: Decimal;
    totalRevenue: Decimal;
  }>> {
    // Analyze performance by segment (stored in metadata)
    const query = `
      SELECT 
        metadata->>'segment' as segment,
        COUNT(*) as campaign_count,
        AVG(CASE 
          WHEN total_delivered > 0 
          THEN unique_opens::float / total_delivered 
          ELSE 0 
        END) as avg_open_rate,
        AVG(CASE 
          WHEN total_delivered > 0 
          THEN unique_clicks::float / total_delivered 
          ELSE 0 
        END) as avg_click_rate,
        AVG(CASE 
          WHEN total_delivered > 0 
          THEN total_conversions::float / total_delivered 
          ELSE 0 
        END) as avg_conversion_rate,
        SUM(revenue_generated) as total_revenue
      FROM email_campaigns
      WHERE metadata->>'segment' IS NOT NULL
      ${filters.dateRange ? 'AND sent_date BETWEEN $1 AND $2' : ''}
      GROUP BY metadata->>'segment'
    `;
    
    const params = filters.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];
    
    const result = await this.db.query(query, params);
    
    const segmentMap = new Map<string, {
      campaigns: number;
      avgOpenRate: Decimal;
      avgClickRate: Decimal;
      avgConversionRate: Decimal;
      totalRevenue: Decimal;
    }>();
    
    result.rows.forEach(row => {
      segmentMap.set(row.segment, {
        campaigns: parseInt(row.campaign_count),
        avgOpenRate: new Decimal(row.avg_open_rate || 0),
        avgClickRate: new Decimal(row.avg_click_rate || 0),
        avgConversionRate: new Decimal(row.avg_conversion_rate || 0),
        totalRevenue: new Decimal(row.total_revenue || 0)
      });
    });
    
    return segmentMap;
  }

  public async getOptimalSendTime(
    filters?: KPIFilters
  ): Promise<{
    dayOfWeek: string;
    hourOfDay: number;
    avgOpenRate: Decimal;
    avgClickRate: Decimal;
  }[]> {
    // Analyze performance by send time
    const query = `
      SELECT 
        TO_CHAR(sent_date, 'Day') as day_of_week,
        EXTRACT(HOUR FROM sent_date) as hour_of_day,
        AVG(CASE 
          WHEN total_delivered > 0 
          THEN unique_opens::float / total_delivered 
          ELSE 0 
        END) as avg_open_rate,
        AVG(CASE 
          WHEN total_delivered > 0 
          THEN unique_clicks::float / total_delivered 
          ELSE 0 
        END) as avg_click_rate,
        COUNT(*) as campaign_count
      FROM email_campaigns
      WHERE sent_date IS NOT NULL
      ${filters?.dateRange ? 'AND sent_date BETWEEN $1 AND $2' : ''}
      GROUP BY day_of_week, hour_of_day
      HAVING COUNT(*) >= 3  -- Minimum campaigns for statistical significance
      ORDER BY avg_open_rate DESC, avg_click_rate DESC
    `;
    
    const params = filters?.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];
    
    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      dayOfWeek: row.day_of_week.trim(),
      hourOfDay: parseInt(row.hour_of_day),
      avgOpenRate: new Decimal(row.avg_open_rate || 0),
      avgClickRate: new Decimal(row.avg_click_rate || 0)
    }));
  }

  public async calculateListGrowth(
    filters: KPIFilters
  ): Promise<{
    date: Date;
    totalSubscribers: number;
    newSubscribers: number;
    unsubscribed: number;
    netGrowth: number;
    growthRate: Decimal;
  }[]> {
    // This would typically integrate with your email service provider
    // For now, we'll calculate based on campaign data
    const query = `
      WITH daily_stats AS (
        SELECT 
          DATE(sent_date) as date,
          SUM(total_sent) as total_sent,
          SUM(total_unsubscribed) as total_unsubscribed
        FROM email_campaigns
        WHERE sent_date IS NOT NULL
        ${filters.dateRange ? 'AND sent_date BETWEEN $1 AND $2' : ''}
        GROUP BY DATE(sent_date)
      ),
      cumulative_stats AS (
        SELECT 
          date,
          total_sent,
          total_unsubscribed,
          SUM(total_sent) OVER (ORDER BY date) as cumulative_sent,
          SUM(total_unsubscribed) OVER (ORDER BY date) as cumulative_unsubscribed
        FROM daily_stats
      )
      SELECT 
        date,
        cumulative_sent as total_subscribers,
        total_sent as new_subscribers,
        total_unsubscribed as unsubscribed,
        total_sent - total_unsubscribed as net_growth,
        CASE 
          WHEN LAG(cumulative_sent) OVER (ORDER BY date) > 0
          THEN (total_sent - total_unsubscribed)::float / LAG(cumulative_sent) OVER (ORDER BY date)
          ELSE 0
        END as growth_rate
      FROM cumulative_stats
      ORDER BY date
    `;
    
    const params = filters.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];
    
    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      date: new Date(row.date),
      totalSubscribers: parseInt(row.total_subscribers),
      newSubscribers: parseInt(row.new_subscribers),
      unsubscribed: parseInt(row.unsubscribed),
      netGrowth: parseInt(row.net_growth),
      growthRate: new Decimal(row.growth_rate || 0)
    }));
  }

  private async storeCalculation(
    metrics: EmailMarketingMetrics, 
    filters?: KPIFilters
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
      campaignId: metrics.campaignId,
      sent: metrics.sent,
      delivered: metrics.delivered,
      deliveryRate: metrics.deliveryRate.toString(),
      opened: metrics.opened,
      openRate: metrics.openRate.toString(),
      clicked: metrics.clicked,
      clickRate: metrics.clickRate.toString(),
      ctr: metrics.ctr.toString(),
      conversions: metrics.conversions,
      conversionRate: metrics.conversionRate.toString(),
      revenue: metrics.revenue.toString(),
      roi: metrics.roi.toString(),
      unsubscribed: metrics.unsubscribed,
      unsubscribeRate: metrics.unsubscribeRate.toString(),
      bounced: metrics.bounced,
      bounceRate: metrics.bounceRate.toString()
    };

    await this.db.query(query, [
      'email_marketing',
      new Date(),
      filters?.groupBy || 'campaign',
      'email',
      metrics.roi.toNumber(),
      details
    ]);
  }

  private getCacheKey(campaignId: string, filters?: KPIFilters): string {
    const parts = [this.cachePrefix, campaignId];
    
    if (filters?.dateRange) {
      parts.push(
        `${filters.dateRange.startDate.toISOString()}-${filters.dateRange.endDate.toISOString()}`
      );
    }
    
    if (filters?.groupBy) {
      parts.push(filters.groupBy);
    }

    return parts.join(':');
  }

  private serializeMetrics(metrics: EmailMarketingMetrics): any {
    return {
      ...metrics,
      deliveryRate: metrics.deliveryRate.toString(),
      openRate: metrics.openRate.toString(),
      clickRate: metrics.clickRate.toString(),
      ctr: metrics.ctr.toString(),
      conversionRate: metrics.conversionRate.toString(),
      revenue: metrics.revenue.toString(),
      roi: metrics.roi.toString(),
      unsubscribeRate: metrics.unsubscribeRate.toString(),
      bounceRate: metrics.bounceRate.toString()
    };
  }

  private deserializeMetrics(data: any): EmailMarketingMetrics {
    return {
      ...data,
      deliveryRate: new Decimal(data.deliveryRate),
      openRate: new Decimal(data.openRate),
      clickRate: new Decimal(data.clickRate),
      ctr: new Decimal(data.ctr),
      conversionRate: new Decimal(data.conversionRate),
      revenue: new Decimal(data.revenue),
      roi: new Decimal(data.roi),
      unsubscribeRate: new Decimal(data.unsubscribeRate),
      bounceRate: new Decimal(data.bounceRate)
    };
  }
}