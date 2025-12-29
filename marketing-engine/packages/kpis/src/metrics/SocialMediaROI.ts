import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { 
  SocialMediaROIMetrics, 
  KPIFilters 
} from '../types/kpi.types';

export class SocialMediaROICalculator {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:social:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(
    platform: string,
    filters: KPIFilters
  ): Promise<SocialMediaROIMetrics> {
    const cacheKey = this.getCacheKey(platform, filters);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('Social media metrics retrieved from cache', { platform, filters });
        return this.deserializeMetrics(JSON.parse(cached));
      }

      // Calculate metrics
      const metrics = await this.calculateMetrics(platform, filters);

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
      logger.error('Error calculating social media metrics', { error, platform, filters });
      throw error;
    }
  }

  private async calculateMetrics(
    platform: string,
    filters: KPIFilters
  ): Promise<SocialMediaROIMetrics> {
    const data = await this.fetchSocialData(platform, filters);
    
    if (data.length === 0) {
      // Return empty metrics
      return {
        platform,
        spend: new Decimal(0),
        revenue: new Decimal(0),
        roi: new Decimal(0),
        followers: 0,
        impressions: 0,
        engagements: 0,
        engagementRate: new Decimal(0),
        clicks: 0,
        ctr: new Decimal(0),
        conversions: 0,
        conversionRate: new Decimal(0),
        costPerEngagement: new Decimal(0),
        costPerConversion: new Decimal(0)
      };
    }

    // Aggregate metrics
    const aggregated = this.aggregateMetrics(data);
    
    // Calculate derived metrics
    const roi = aggregated.spend.greaterThan(0)
      ? aggregated.revenue.minus(aggregated.spend).dividedBy(aggregated.spend)
      : new Decimal(0);

    const engagementRate = aggregated.impressions > 0
      ? new Decimal(aggregated.engagements).dividedBy(aggregated.impressions)
      : new Decimal(0);

    const ctr = aggregated.impressions > 0
      ? new Decimal(aggregated.clicks).dividedBy(aggregated.impressions)
      : new Decimal(0);

    const conversionRate = aggregated.clicks > 0
      ? new Decimal(aggregated.conversions).dividedBy(aggregated.clicks)
      : new Decimal(0);

    const costPerEngagement = aggregated.engagements > 0
      ? aggregated.spend.dividedBy(aggregated.engagements)
      : new Decimal(0);

    const costPerConversion = aggregated.conversions > 0
      ? aggregated.spend.dividedBy(aggregated.conversions)
      : new Decimal(0);

    return {
      platform,
      spend: aggregated.spend,
      revenue: aggregated.revenue,
      roi,
      followers: aggregated.followers,
      impressions: aggregated.impressions,
      engagements: aggregated.engagements,
      engagementRate,
      clicks: aggregated.clicks,
      ctr,
      conversions: aggregated.conversions,
      conversionRate,
      costPerEngagement,
      costPerConversion
    };
  }

  private async fetchSocialData(
    platform: string,
    filters: KPIFilters
  ): Promise<any[]> {
    const dateFilter = filters.dateRange
      ? `AND metric_date BETWEEN $2 AND $3`
      : '';
    
    const params = [platform];
    if (filters.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
    }

    const query = `
      SELECT 
        s.platform,
        s.metric_date,
        s.followers,
        s.impressions,
        s.engagements,
        s.clicks,
        s.shares,
        s.mentions,
        s.conversions,
        s.spend,
        COALESCE(r.revenue, 0) as revenue
      FROM social_media_metrics s
      LEFT JOIN (
        SELECT 
          DATE(t.touchpoint_date) as date,
          SUM(rev.amount) as revenue
        FROM channel_touchpoints t
        JOIN revenue rev ON rev.customer_id = t.customer_id
        WHERE t.channel = 'social_media'
          AND t.metadata->>'platform' = $1
          ${filters.dateRange ? 'AND t.touchpoint_date BETWEEN $2 AND $3' : ''}
        GROUP BY DATE(t.touchpoint_date)
      ) r ON r.date = s.metric_date
      WHERE s.platform = $1
      ${dateFilter}
      ORDER BY s.metric_date
    `;
    
    const result = await this.db.query(query, params);
    return result.rows;
  }

  private aggregateMetrics(data: any[]): {
    spend: Decimal;
    revenue: Decimal;
    followers: number;
    impressions: number;
    engagements: number;
    clicks: number;
    conversions: number;
  } {
    const aggregated = data.reduce((acc, row) => ({
      spend: acc.spend.plus(row.spend || 0),
      revenue: acc.revenue.plus(row.revenue || 0),
      followers: Math.max(acc.followers, row.followers || 0), // Take latest
      impressions: acc.impressions + (row.impressions || 0),
      engagements: acc.engagements + (row.engagements || 0),
      clicks: acc.clicks + (row.clicks || 0),
      conversions: acc.conversions + (row.conversions || 0)
    }), {
      spend: new Decimal(0),
      revenue: new Decimal(0),
      followers: 0,
      impressions: 0,
      engagements: 0,
      clicks: 0,
      conversions: 0
    });

    return aggregated;
  }

  public async calculateAllPlatforms(
    filters: KPIFilters
  ): Promise<SocialMediaROIMetrics[]> {
    // Get unique platforms
    const platformsQuery = `
      SELECT DISTINCT platform 
      FROM social_media_metrics
      ${filters.dateRange ? 'WHERE metric_date BETWEEN $1 AND $2' : ''}
    `;
    
    const params = filters.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];
    
    const platformsResult = await this.db.query(platformsQuery, params);
    const platforms = platformsResult.rows.map(r => r.platform);
    
    // Calculate metrics for each platform
    const results = await Promise.all(
      platforms.map(platform => this.calculate(platform, filters))
    );
    
    return results;
  }

  public async analyzeContentPerformance(
    platform: string,
    filters: KPIFilters
  ): Promise<{
    contentType: string;
    posts: number;
    avgEngagementRate: Decimal;
    avgReach: number;
    totalEngagements: number;
  }[]> {
    // Analyze performance by content type
    const query = `
      SELECT 
        metadata->>'content_type' as content_type,
        COUNT(*) as post_count,
        AVG(CASE 
          WHEN impressions > 0 
          THEN engagements::float / impressions 
          ELSE 0 
        END) as avg_engagement_rate,
        AVG(impressions) as avg_reach,
        SUM(engagements) as total_engagements
      FROM social_media_metrics
      WHERE platform = $1
        AND metadata->>'content_type' IS NOT NULL
        ${filters.dateRange ? 'AND metric_date BETWEEN $2 AND $3' : ''}
      GROUP BY metadata->>'content_type'
      ORDER BY avg_engagement_rate DESC
    `;
    
    const params = [platform];
    if (filters.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
    }
    
    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      contentType: row.content_type,
      posts: parseInt(row.post_count),
      avgEngagementRate: new Decimal(row.avg_engagement_rate || 0),
      avgReach: Math.round(row.avg_reach || 0),
      totalEngagements: parseInt(row.total_engagements || 0)
    }));
  }

  public async getOptimalPostingTimes(
    platform: string,
    filters?: KPIFilters
  ): Promise<{
    dayOfWeek: string;
    hourOfDay: number;
    avgEngagementRate: Decimal;
    avgReach: number;
  }[]> {
    // Analyze performance by posting time
    const query = `
      SELECT 
        TO_CHAR(metric_date, 'Day') as day_of_week,
        EXTRACT(HOUR FROM metadata->>'post_time') as hour_of_day,
        AVG(CASE 
          WHEN impressions > 0 
          THEN engagements::float / impressions 
          ELSE 0 
        END) as avg_engagement_rate,
        AVG(impressions) as avg_reach,
        COUNT(*) as post_count
      FROM social_media_metrics
      WHERE platform = $1
        AND metadata->>'post_time' IS NOT NULL
        ${filters?.dateRange ? 'AND metric_date BETWEEN $2 AND $3' : ''}
      GROUP BY day_of_week, hour_of_day
      HAVING COUNT(*) >= 5  -- Minimum posts for significance
      ORDER BY avg_engagement_rate DESC
    `;
    
    const params = [platform];
    if (filters?.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
    }
    
    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      dayOfWeek: row.day_of_week.trim(),
      hourOfDay: parseInt(row.hour_of_day),
      avgEngagementRate: new Decimal(row.avg_engagement_rate || 0),
      avgReach: Math.round(row.avg_reach || 0)
    }));
  }

  public async calculateInfluencerROI(
    platform: string,
    filters: KPIFilters
  ): Promise<{
    influencerId: string;
    name: string;
    posts: number;
    totalSpend: Decimal;
    totalRevenue: Decimal;
    roi: Decimal;
    avgEngagementRate: Decimal;
    totalReach: number;
  }[]> {
    // Calculate ROI for influencer partnerships
    const query = `
      SELECT 
        metadata->>'influencer_id' as influencer_id,
        metadata->>'influencer_name' as influencer_name,
        COUNT(*) as post_count,
        SUM(spend) as total_spend,
        SUM(COALESCE(
          (SELECT SUM(r.amount)
           FROM channel_touchpoints t
           JOIN revenue r ON r.customer_id = t.customer_id
           WHERE t.metadata->>'campaign_id' = s.metadata->>'campaign_id'
             AND t.touchpoint_date >= s.metric_date
             AND t.touchpoint_date <= s.metric_date + INTERVAL '30 days'
          ), 0
        )) as total_revenue,
        AVG(CASE 
          WHEN impressions > 0 
          THEN engagements::float / impressions 
          ELSE 0 
        END) as avg_engagement_rate,
        SUM(impressions) as total_reach
      FROM social_media_metrics s
      WHERE platform = $1
        AND metadata->>'influencer_id' IS NOT NULL
        ${filters.dateRange ? 'AND metric_date BETWEEN $2 AND $3' : ''}
      GROUP BY influencer_id, influencer_name
      ORDER BY total_revenue DESC
    `;
    
    const params = [platform];
    if (filters.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
    }
    
    const result = await this.db.query(query, params);
    
    return result.rows.map(row => {
      const spend = new Decimal(row.total_spend || 0);
      const revenue = new Decimal(row.total_revenue || 0);
      const roi = spend.greaterThan(0)
        ? revenue.minus(spend).dividedBy(spend)
        : new Decimal(0);
      
      return {
        influencerId: row.influencer_id,
        name: row.influencer_name || 'Unknown',
        posts: parseInt(row.post_count),
        totalSpend: spend,
        totalRevenue: revenue,
        roi,
        avgEngagementRate: new Decimal(row.avg_engagement_rate || 0),
        totalReach: parseInt(row.total_reach || 0)
      };
    });
  }

  public async calculateHashtagPerformance(
    platform: string,
    filters: KPIFilters
  ): Promise<{
    hashtag: string;
    usageCount: number;
    avgEngagementRate: Decimal;
    totalReach: number;
    totalEngagements: number;
  }[]> {
    // Analyze hashtag performance
    const query = `
      WITH hashtag_data AS (
        SELECT 
          unnest(string_to_array(metadata->>'hashtags', ',')) as hashtag,
          impressions,
          engagements
        FROM social_media_metrics
        WHERE platform = $1
          AND metadata->>'hashtags' IS NOT NULL
          ${filters.dateRange ? 'AND metric_date BETWEEN $2 AND $3' : ''}
      )
      SELECT 
        hashtag,
        COUNT(*) as usage_count,
        AVG(CASE 
          WHEN impressions > 0 
          THEN engagements::float / impressions 
          ELSE 0 
        END) as avg_engagement_rate,
        SUM(impressions) as total_reach,
        SUM(engagements) as total_engagements
      FROM hashtag_data
      GROUP BY hashtag
      HAVING COUNT(*) >= 3
      ORDER BY avg_engagement_rate DESC
      LIMIT 20
    `;
    
    const params = [platform];
    if (filters.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
    }
    
    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      hashtag: row.hashtag.trim(),
      usageCount: parseInt(row.usage_count),
      avgEngagementRate: new Decimal(row.avg_engagement_rate || 0),
      totalReach: parseInt(row.total_reach || 0),
      totalEngagements: parseInt(row.total_engagements || 0)
    }));
  }

  public async compareCompetitors(
    platform: string,
    filters: KPIFilters
  ): Promise<{
    competitor: string;
    followers: number;
    avgEngagementRate: Decimal;
    postFrequency: number;
    shareOfVoice: Decimal;
  }[]> {
    // Compare with competitors (requires competitor data in metadata)
    const query = `
      WITH our_metrics AS (
        SELECT 
          AVG(engagements) as avg_engagements,
          SUM(mentions) as total_mentions
        FROM social_media_metrics
        WHERE platform = $1
          AND (metadata->>'is_competitor' IS NULL OR metadata->>'is_competitor' = 'false')
          ${filters.dateRange ? 'AND metric_date BETWEEN $2 AND $3' : ''}
      ),
      competitor_data AS (
        SELECT 
          metadata->>'competitor_name' as competitor,
          MAX(followers) as followers,
          AVG(CASE 
            WHEN impressions > 0 
            THEN engagements::float / impressions 
            ELSE 0 
          END) as avg_engagement_rate,
          COUNT(*) as post_count,
          SUM(mentions) as mentions
        FROM social_media_metrics
        WHERE platform = $1
          AND metadata->>'is_competitor' = 'true'
          ${filters.dateRange ? 'AND metric_date BETWEEN $2 AND $3' : ''}
        GROUP BY metadata->>'competitor_name'
      ),
      total_mentions AS (
        SELECT SUM(mentions) as total FROM competitor_data
      )
      SELECT 
        competitor,
        followers,
        avg_engagement_rate,
        post_count as post_frequency,
        CASE 
          WHEN (SELECT total FROM total_mentions) > 0
          THEN mentions::float / (SELECT total FROM total_mentions)
          ELSE 0
        END as share_of_voice
      FROM competitor_data
      ORDER BY followers DESC
    `;
    
    const params = [platform];
    if (filters.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
    }
    
    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      competitor: row.competitor,
      followers: parseInt(row.followers || 0),
      avgEngagementRate: new Decimal(row.avg_engagement_rate || 0),
      postFrequency: parseInt(row.post_frequency || 0),
      shareOfVoice: new Decimal(row.share_of_voice || 0)
    }));
  }

  private async storeCalculation(
    metrics: SocialMediaROIMetrics, 
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
      platform: metrics.platform,
      spend: metrics.spend.toString(),
      revenue: metrics.revenue.toString(),
      roi: metrics.roi.toString(),
      followers: metrics.followers,
      impressions: metrics.impressions,
      engagements: metrics.engagements,
      engagementRate: metrics.engagementRate.toString(),
      clicks: metrics.clicks,
      ctr: metrics.ctr.toString(),
      conversions: metrics.conversions,
      conversionRate: metrics.conversionRate.toString(),
      costPerEngagement: metrics.costPerEngagement.toString(),
      costPerConversion: metrics.costPerConversion.toString()
    };

    await this.db.query(query, [
      'social_media_roi',
      new Date(),
      filters.groupBy || 'custom',
      'social_media',
      metrics.roi.toNumber(),
      details
    ]);
  }

  private getCacheKey(platform: string, filters: KPIFilters): string {
    const parts = [this.cachePrefix, platform];
    
    if (filters.dateRange) {
      parts.push(
        `${filters.dateRange.startDate.toISOString()}-${filters.dateRange.endDate.toISOString()}`
      );
    }
    
    if (filters.channels?.length) {
      parts.push(filters.channels.sort().join(','));
    }
    
    if (filters.groupBy) {
      parts.push(filters.groupBy);
    }

    return parts.join(':');
  }

  private serializeMetrics(metrics: SocialMediaROIMetrics): any {
    return {
      ...metrics,
      spend: metrics.spend.toString(),
      revenue: metrics.revenue.toString(),
      roi: metrics.roi.toString(),
      engagementRate: metrics.engagementRate.toString(),
      ctr: metrics.ctr.toString(),
      conversionRate: metrics.conversionRate.toString(),
      costPerEngagement: metrics.costPerEngagement.toString(),
      costPerConversion: metrics.costPerConversion.toString()
    };
  }

  private deserializeMetrics(data: any): SocialMediaROIMetrics {
    return {
      ...data,
      spend: new Decimal(data.spend),
      revenue: new Decimal(data.revenue),
      roi: new Decimal(data.roi),
      engagementRate: new Decimal(data.engagementRate),
      ctr: new Decimal(data.ctr),
      conversionRate: new Decimal(data.conversionRate),
      costPerEngagement: new Decimal(data.costPerEngagement),
      costPerConversion: new Decimal(data.costPerConversion)
    };
  }
}