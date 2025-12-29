import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { 
  ContentROIMetrics, 
  KPIFilters, 
  ChannelType,
  ContentItem,
  ContentMetrics as ContentMetricsType,
  Revenue,
  ChannelTouchpoint 
} from '../types/kpi.types';

export class ContentROICalculator {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:content_roi:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(
    contentId: string, 
    filters?: KPIFilters
  ): Promise<ContentROIMetrics> {
    const cacheKey = this.getCacheKey(contentId, filters);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('Content ROI metrics retrieved from cache', { contentId, filters });
        return this.deserializeMetrics(JSON.parse(cached));
      }

      // Calculate metrics
      const metrics = await this.calculateMetrics(contentId, filters);

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
      logger.error('Error calculating Content ROI metrics', { error, contentId, filters });
      throw error;
    }
  }

  public async calculateBatch(
    contentIds: string[], 
    filters?: KPIFilters
  ): Promise<ContentROIMetrics[]> {
    const results = await Promise.all(
      contentIds.map(id => this.calculate(id, filters))
    );
    return results;
  }

  private async calculateMetrics(
    contentId: string, 
    filters?: KPIFilters
  ): Promise<ContentROIMetrics> {
    const data = await this.fetchData(contentId, filters);
    
    if (!data.content) {
      throw new Error(`Content not found: ${contentId}`);
    }

    // Calculate total cost
    const productionCost = new Decimal(data.content.productionCost || 0);
    const distributionCost = new Decimal(data.content.distributionCost || 0);
    const totalCost = productionCost.plus(distributionCost);

    // Calculate total revenue attributed
    const totalRevenue = await this.calculateAttributedRevenue(
      contentId, 
      data.touchpoints,
      data.revenues
    );

    // Calculate ROI
    const roi = totalCost.greaterThan(0)
      ? totalRevenue.minus(totalCost).dividedBy(totalCost)
      : new Decimal(0);
    
    const roiPercent = roi.times(100);

    // Calculate engagement value
    const engagementValue = this.calculateEngagementValue(data.metrics);

    // Calculate performance metrics
    const performanceMetrics = this.calculatePerformanceMetrics(data.metrics);

    // Calculate distribution breakdown
    const distributionBreakdown = await this.calculateDistributionBreakdown(
      contentId,
      data.touchpoints,
      data.revenues,
      totalCost
    );

    return {
      contentId,
      totalCost,
      totalRevenue,
      roi,
      roiPercent,
      engagementValue,
      performanceMetrics,
      distributionBreakdown
    };
  }

  private async fetchData(
    contentId: string, 
    filters?: KPIFilters
  ): Promise<{
    content: ContentItem | null;
    metrics: ContentMetricsType[];
    touchpoints: ChannelTouchpoint[];
    revenues: Revenue[];
  }> {
    // Fetch content details
    const contentQuery = `
      SELECT 
        id,
        external_id as "externalId",
        title,
        type,
        channel,
        production_cost as "productionCost",
        distribution_cost as "distributionCost",
        published_date as "publishedDate",
        created_at as "createdAt",
        updated_at as "updatedAt",
        metadata
      FROM content
      WHERE id = $1
    `;
    
    const contentResult = await this.db.query<ContentItem>(contentQuery, [contentId]);
    const content = contentResult.rows[0] || null;

    if (!content) {
      return {
        content: null,
        metrics: [],
        touchpoints: [],
        revenues: []
      };
    }

    // Date filter for metrics
    const dateFilter = filters?.dateRange 
      ? `AND metric_date BETWEEN $2 AND $3`
      : '';
    
    const metricsParams = filters?.dateRange 
      ? [contentId, filters.dateRange.startDate, filters.dateRange.endDate]
      : [contentId];

    // Fetch content metrics
    const metricsQuery = `
      SELECT 
        id,
        content_id as "contentId",
        metric_date as "metricDate",
        views,
        unique_views as "uniqueViews",
        shares,
        comments,
        likes,
        conversions,
        revenue_attributed as "revenueAttributed",
        created_at as "createdAt"
      FROM content_metrics
      WHERE content_id = $1 ${dateFilter}
      ORDER BY metric_date
    `;
    
    const metricsResult = await this.db.query<ContentMetricsType>(
      metricsQuery, 
      metricsParams
    );
    const metrics = metricsResult.rows;

    // Fetch touchpoints that involved this content
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
      WHERE t.metadata->>'contentId' = $1
      ${filters?.dateRange ? 'AND t.touchpoint_date BETWEEN $2 AND $3' : ''}
    `;
    
    const touchpointsResult = await this.db.query<ChannelTouchpoint>(
      touchpointsQuery, 
      metricsParams
    );
    const touchpoints = touchpointsResult.rows;

    // Fetch associated revenues
    const customerIds = touchpoints
      .filter(t => t.customerId)
      .map(t => t.customerId!);
    
    if (customerIds.length === 0) {
      return { content, metrics, touchpoints, revenues: [] };
    }

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
      ${filters?.dateRange ? 'AND revenue_date BETWEEN $2 AND $3' : ''}
    `;
    
    const revenueParams = filters?.dateRange 
      ? [customerIds, filters.dateRange.startDate, filters.dateRange.endDate]
      : [customerIds];
    
    const revenuesResult = await this.db.query<Revenue>(
      revenuesQuery, 
      revenueParams
    );
    const revenues = revenuesResult.rows;

    return { content, metrics, touchpoints, revenues };
  }

  private async calculateAttributedRevenue(
    contentId: string,
    touchpoints: ChannelTouchpoint[],
    revenues: Revenue[]
  ): Promise<Decimal> {
    let attributedRevenue = new Decimal(0);

    // Group revenues by customer
    const revenueByCustomer = revenues.reduce((acc, rev) => {
      if (!acc[rev.customerId]) {
        acc[rev.customerId] = [];
      }
      acc[rev.customerId].push(rev);
      return acc;
    }, {} as Record<string, Revenue[]>);

    // Calculate attribution for each customer
    const customerTouchpoints = touchpoints.filter(t => t.customerId);
    const touchpointsByCustomer = customerTouchpoints.reduce((acc, tp) => {
      if (!acc[tp.customerId!]) {
        acc[tp.customerId!] = [];
      }
      acc[tp.customerId!].push(tp);
      return acc;
    }, {} as Record<string, ChannelTouchpoint[]>);

    for (const customerId of Object.keys(touchpointsByCustomer)) {
      const customerRevenues = revenueByCustomer[customerId] || [];
      const customerTouchpointList = touchpointsByCustomer[customerId];
      
      // Find content touchpoint position
      const contentTouchpoint = customerTouchpointList.find(
        tp => tp.metadata?.contentId === contentId
      );
      
      if (!contentTouchpoint) continue;

      // Calculate total customer revenue
      const totalCustomerRevenue = customerRevenues.reduce(
        (sum, rev) => sum.plus(rev.amount),
        new Decimal(0)
      );

      // Apply attribution weight
      const attributionWeight = new Decimal(contentTouchpoint.attributionWeight || 0);
      const attributedAmount = totalCustomerRevenue.times(attributionWeight);
      
      attributedRevenue = attributedRevenue.plus(attributedAmount);
    }

    return attributedRevenue;
  }

  private calculateEngagementValue(metrics: ContentMetricsType[]): Decimal {
    const weights = config.kpi.contentEngagementWeight;
    let totalValue = new Decimal(0);

    for (const metric of metrics) {
      const viewsValue = new Decimal(metric.views).times(weights.views);
      const sharesValue = new Decimal(metric.shares).times(weights.shares);
      const commentsValue = new Decimal(metric.comments).times(weights.comments);
      const conversionsValue = new Decimal(metric.conversions).times(weights.conversions);

      const metricValue = viewsValue
        .plus(sharesValue)
        .plus(commentsValue)
        .plus(conversionsValue);

      totalValue = totalValue.plus(metricValue);
    }

    return totalValue;
  }

  private calculatePerformanceMetrics(metrics: ContentMetricsType[]): {
    views: number;
    engagements: number;
    conversions: number;
    engagementRate: Decimal;
    conversionRate: Decimal;
  } {
    const totals = metrics.reduce((acc, metric) => ({
      views: acc.views + metric.views,
      uniqueViews: acc.uniqueViews + metric.uniqueViews,
      engagements: acc.engagements + metric.shares + metric.comments + metric.likes,
      conversions: acc.conversions + metric.conversions
    }), {
      views: 0,
      uniqueViews: 0,
      engagements: 0,
      conversions: 0
    });

    const engagementRate = totals.uniqueViews > 0
      ? new Decimal(totals.engagements).dividedBy(totals.uniqueViews)
      : new Decimal(0);

    const conversionRate = totals.uniqueViews > 0
      ? new Decimal(totals.conversions).dividedBy(totals.uniqueViews)
      : new Decimal(0);

    return {
      views: totals.views,
      engagements: totals.engagements,
      conversions: totals.conversions,
      engagementRate,
      conversionRate
    };
  }

  private async calculateDistributionBreakdown(
    contentId: string,
    touchpoints: ChannelTouchpoint[],
    revenues: Revenue[],
    totalCost: Decimal
  ): Promise<{
    channel: ChannelType;
    cost: Decimal;
    revenue: Decimal;
    roi: Decimal;
  }[]> {
    // Group touchpoints by channel
    const touchpointsByChannel = touchpoints.reduce((acc, tp) => {
      if (!acc[tp.channel]) {
        acc[tp.channel] = [];
      }
      acc[tp.channel].push(tp);
      return acc;
    }, {} as Record<ChannelType, ChannelTouchpoint[]>);

    // Calculate revenue and ROI per channel
    const breakdown: {
      channel: ChannelType;
      cost: Decimal;
      revenue: Decimal;
      roi: Decimal;
    }[] = [];

    const channelCount = Object.keys(touchpointsByChannel).length;
    const costPerChannel = channelCount > 0
      ? totalCost.dividedBy(channelCount)
      : new Decimal(0);

    for (const [channel, channelTouchpoints] of Object.entries(touchpointsByChannel)) {
      const channelRevenue = await this.calculateAttributedRevenue(
        contentId,
        channelTouchpoints,
        revenues
      );

      const channelROI = costPerChannel.greaterThan(0)
        ? channelRevenue.minus(costPerChannel).dividedBy(costPerChannel)
        : new Decimal(0);

      breakdown.push({
        channel: channel as ChannelType,
        cost: costPerChannel,
        revenue: channelRevenue,
        roi: channelROI
      });
    }

    // Sort by ROI descending
    breakdown.sort((a, b) => b.roi.minus(a.roi).toNumber());

    return breakdown;
  }

  private async storeCalculation(
    metrics: ContentROIMetrics, 
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
      contentId: metrics.contentId,
      totalCost: metrics.totalCost.toString(),
      totalRevenue: metrics.totalRevenue.toString(),
      roi: metrics.roi.toString(),
      roiPercent: metrics.roiPercent.toString(),
      engagementValue: metrics.engagementValue.toString(),
      performanceMetrics: {
        ...metrics.performanceMetrics,
        engagementRate: metrics.performanceMetrics.engagementRate.toString(),
        conversionRate: metrics.performanceMetrics.conversionRate.toString()
      },
      distributionBreakdown: metrics.distributionBreakdown.map(item => ({
        ...item,
        cost: item.cost.toString(),
        revenue: item.revenue.toString(),
        roi: item.roi.toString()
      }))
    };

    await this.db.query(query, [
      'content_roi',
      new Date(),
      filters?.groupBy || 'custom',
      null,
      metrics.roiPercent.toNumber(),
      details
    ]);
  }

  private getCacheKey(contentId: string, filters?: KPIFilters): string {
    const parts = [this.cachePrefix, contentId];
    
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

  private serializeMetrics(metrics: ContentROIMetrics): any {
    return {
      ...metrics,
      totalCost: metrics.totalCost.toString(),
      totalRevenue: metrics.totalRevenue.toString(),
      roi: metrics.roi.toString(),
      roiPercent: metrics.roiPercent.toString(),
      engagementValue: metrics.engagementValue.toString(),
      performanceMetrics: {
        ...metrics.performanceMetrics,
        engagementRate: metrics.performanceMetrics.engagementRate.toString(),
        conversionRate: metrics.performanceMetrics.conversionRate.toString()
      },
      distributionBreakdown: metrics.distributionBreakdown.map(item => ({
        ...item,
        cost: item.cost.toString(),
        revenue: item.revenue.toString(),
        roi: item.roi.toString()
      }))
    };
  }

  private deserializeMetrics(data: any): ContentROIMetrics {
    return {
      ...data,
      totalCost: new Decimal(data.totalCost),
      totalRevenue: new Decimal(data.totalRevenue),
      roi: new Decimal(data.roi),
      roiPercent: new Decimal(data.roiPercent),
      engagementValue: new Decimal(data.engagementValue),
      performanceMetrics: {
        ...data.performanceMetrics,
        engagementRate: new Decimal(data.performanceMetrics.engagementRate),
        conversionRate: new Decimal(data.performanceMetrics.conversionRate)
      },
      distributionBreakdown: data.distributionBreakdown.map((item: any) => ({
        ...item,
        cost: new Decimal(item.cost),
        revenue: new Decimal(item.revenue),
        roi: new Decimal(item.roi)
      }))
    };
  }

  public async rankContent(
    filters?: KPIFilters,
    limit: number = 10
  ): Promise<ContentROIMetrics[]> {
    // Fetch all content items
    const contentQuery = `
      SELECT id 
      FROM content
      WHERE published_date IS NOT NULL
      ${filters?.channels?.length ? 'AND channel = ANY($1)' : ''}
      ORDER BY published_date DESC
      LIMIT 100
    `;
    
    const params = filters?.channels?.length ? [filters.channels] : [];
    const contentResult = await this.db.query<{ id: string }>(contentQuery, params);
    
    // Calculate ROI for each content
    const contentROIs = await this.calculateBatch(
      contentResult.rows.map(r => r.id),
      filters
    );

    // Sort by ROI and return top performers
    contentROIs.sort((a, b) => b.roiPercent.minus(a.roiPercent).toNumber());
    
    return contentROIs.slice(0, limit);
  }
}