import database from '@/utils/database';
import { redisService } from '@/utils/redis';
import { logger } from '@/utils/logger';

interface TrackEventData {
  organizationId: string;
  campaignId?: string;
  channelId?: string;
  eventType: string;
  eventData: any;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
}

interface DateRange {
  start: Date;
  end: Date;
}

interface CampaignMetrics {
  clicks: number;
  impressions: number;
  conversions: number;
  cost: number;
  ctr: number; // Click-through rate
  conversionRate: number;
  costPerClick: number;
  costPerConversion: number;
}

interface ChannelMetrics {
  reach: number;
  engagement: number;
  cost: number;
  engagementRate: number;
  costPerEngagement: number;
  impressions: number;
  clicks: number;
}

interface ReportConfig {
  organizationId: string;
  campaignIds?: string[];
  channelIds?: string[];
  dateRange: DateRange;
  metrics: string[];
}

interface AnalyticsReport {
  summary: {
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    totalCost: number;
    overallCTR: number;
    overallConversionRate: number;
  };
  campaigns: Array<{
    campaignId: string;
    metrics: Partial<CampaignMetrics>;
  }>;
  channels: Array<{
    channelId: string;
    metrics: Partial<ChannelMetrics>;
  }>;
  timeRange: DateRange;
}

interface AggregateConfig {
  organizationId: string;
  campaignId?: string;
  channelId?: string;
  startDate: Date;
  endDate: Date;
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly';
}

interface ConversionFunnel {
  impressions: number;
  clicks: number;
  landingPageViews: number;
  formSubmits: number;
  conversions: number;
  clickThroughRate: number;
  conversionRate: number;
  dropOffRates: {
    clickToLanding: number;
    landingToForm: number;
    formToConversion: number;
  };
}

export class AnalyticsService {
  private readonly cachePrefix = 'analytics:';
  private readonly cacheExpiry = 1800; // 30 minutes

  async trackEvent(data: TrackEventData): Promise<{ id: string }> {
    this.validateEventData(data);

    try {
      const result = await database.query(
        `INSERT INTO analytics_events (
          organization_id, campaign_id, channel_id, event_type, event_data,
          user_agent, ip_address, session_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          data.organizationId,
          data.campaignId || null,
          data.channelId || null,
          data.eventType,
          JSON.stringify(data.eventData),
          data.userAgent || null,
          data.ipAddress || null,
          data.sessionId || null
        ]
      );

      const eventId = result.rows[0].id;
      
      // Trigger real-time aggregation for high-frequency events
      await this.updateRealTimeMetrics(data);
      
      logger.info('Analytics event tracked', {
        eventId,
        organizationId: data.organizationId,
        eventType: data.eventType
      });

      return { id: eventId };
    } catch (error) {
      logger.error('Failed to track analytics event', {
        error: error.message,
        organizationId: data.organizationId,
        eventType: data.eventType
      });
      throw error;
    }
  }

  async getCampaignMetrics(
    campaignId: string,
    dateRange: DateRange
  ): Promise<CampaignMetrics> {
    const cacheKey = `${this.cachePrefix}campaign:${campaignId}:${dateRange.start.getTime()}:${dateRange.end.getTime()}`;
    
    try {
      // Check cache first
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get metrics from database
      const result = await database.query(
        `SELECT metric_type, metric_value, metric_data
         FROM performance_metrics
         WHERE campaign_id = $1 
           AND date_range_start >= $2 
           AND date_range_end <= $3`,
        [campaignId, dateRange.start, dateRange.end]
      );

      const metrics = this.processMetricRows(result.rows);
      const calculatedMetrics = this.calculateCampaignMetrics(metrics);
      
      // Cache the results
      await redisService.set(cacheKey, JSON.stringify(calculatedMetrics), this.cacheExpiry);
      
      return calculatedMetrics;
    } catch (error) {
      logger.error('Failed to get campaign metrics', {
        error: error.message,
        campaignId,
        dateRange
      });
      throw error;
    }
  }

  async getChannelMetrics(
    channelId: string,
    organizationId: string,
    dateRange: DateRange
  ): Promise<ChannelMetrics> {
    const cacheKey = `${this.cachePrefix}channel:${channelId}:${organizationId}:${dateRange.start.getTime()}:${dateRange.end.getTime()}`;
    
    try {
      // Check cache first
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get metrics from database
      const result = await database.query(
        `SELECT metric_type, metric_value, metric_data
         FROM performance_metrics
         WHERE channel_id = $1 
           AND organization_id = $2
           AND date_range_start >= $3 
           AND date_range_end <= $4`,
        [channelId, organizationId, dateRange.start, dateRange.end]
      );

      const metrics = this.processMetricRows(result.rows);
      const calculatedMetrics = this.calculateChannelMetrics(metrics);
      
      // Cache the results
      await redisService.set(cacheKey, JSON.stringify(calculatedMetrics), this.cacheExpiry);
      
      return calculatedMetrics;
    } catch (error) {
      logger.error('Failed to get channel metrics', {
        error: error.message,
        channelId,
        organizationId,
        dateRange
      });
      throw error;
    }
  }

  async generateReport(config: ReportConfig): Promise<AnalyticsReport> {
    try {
      const report: AnalyticsReport = {
        summary: {
          totalImpressions: 0,
          totalClicks: 0,
          totalConversions: 0,
          totalCost: 0,
          overallCTR: 0,
          overallConversionRate: 0
        },
        campaigns: [],
        channels: [],
        timeRange: config.dateRange
      };

      // Get campaign metrics
      if (config.campaignIds?.length) {
        for (const campaignId of config.campaignIds) {
          const metrics = await this.getCampaignMetrics(campaignId, config.dateRange);
          report.campaigns.push({ campaignId, metrics });
          
          // Add to summary
          report.summary.totalImpressions += metrics.impressions;
          report.summary.totalClicks += metrics.clicks;
          report.summary.totalConversions += metrics.conversions;
          report.summary.totalCost += metrics.cost;
        }
      }

      // Get channel metrics
      if (config.channelIds?.length) {
        for (const channelId of config.channelIds) {
          const metrics = await this.getChannelMetrics(
            channelId, config.organizationId, config.dateRange
          );
          report.channels.push({ channelId, metrics });
        }
      }

      // Calculate overall rates
      if (report.summary.totalImpressions > 0) {
        report.summary.overallCTR = (report.summary.totalClicks / report.summary.totalImpressions) * 100;
      }
      
      if (report.summary.totalClicks > 0) {
        report.summary.overallConversionRate = (report.summary.totalConversions / report.summary.totalClicks) * 100;
      }

      logger.info('Analytics report generated', {
        organizationId: config.organizationId,
        campaignCount: config.campaignIds?.length || 0,
        channelCount: config.channelIds?.length || 0
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate analytics report', {
        error: error.message,
        organizationId: config.organizationId
      });
      throw error;
    }
  }

  async aggregateMetrics(config: AggregateConfig): Promise<void> {
    try {
      // Get raw events for the time period
      const result = await database.query(
        `SELECT event_type, campaign_id, channel_id, event_data, timestamp
         FROM analytics_events
         WHERE organization_id = $1
           AND timestamp >= $2
           AND timestamp <= $3
           ${config.campaignId ? 'AND campaign_id = $4' : ''}
           ${config.channelId ? 'AND channel_id = $5' : ''}`,
        [
          config.organizationId,
          config.startDate,
          config.endDate,
          ...(config.campaignId ? [config.campaignId] : []),
          ...(config.channelId ? [config.channelId] : [])
        ]
      );

      // Group events by time period
      const aggregatedData = this.groupEventsByTimePeriod(
        result.rows,
        config.granularity
      );

      // Save aggregated metrics
      for (const [timePeriod, events] of aggregatedData) {
        await this.saveAggregatedMetrics(
          config.organizationId,
          config.campaignId,
          config.channelId,
          timePeriod,
          events
        );
      }

      logger.info('Metrics aggregated successfully', {
        organizationId: config.organizationId,
        periodsProcessed: aggregatedData.size
      });
    } catch (error) {
      logger.error('Failed to aggregate metrics', {
        error: error.message,
        organizationId: config.organizationId
      });
      throw error;
    }
  }

  async getTopPerformingContent(
    organizationId: string,
    metric: string,
    limit: number = 10,
    dateRange: DateRange
  ): Promise<Array<{
    contentId: string;
    title: string;
    metricValue: number;
    campaignName: string;
  }>> {
    try {
      const result = await database.query(
        `SELECT 
           ca.id as content_id,
           ca.title,
           pm.metric_value,
           c.name as campaign_name
         FROM content_assets ca
         JOIN campaign_content cc ON ca.id = cc.content_asset_id
         JOIN campaigns c ON cc.campaign_id = c.id
         JOIN performance_metrics pm ON c.id = pm.campaign_id
         WHERE ca.organization_id = $1
           AND pm.metric_type = $2
           AND pm.date_range_start >= $3
           AND pm.date_range_end <= $4
         ORDER BY pm.metric_value DESC
         LIMIT $5`,
        [organizationId, metric, dateRange.start, dateRange.end, limit]
      );

      return result.rows.map(row => ({
        contentId: row.content_id,
        title: row.title,
        metricValue: parseFloat(row.metric_value),
        campaignName: row.campaign_name
      }));
    } catch (error) {
      logger.error('Failed to get top performing content', {
        error: error.message,
        organizationId,
        metric
      });
      throw error;
    }
  }

  async getConversionFunnel(
    campaignId: string,
    dateRange: DateRange
  ): Promise<ConversionFunnel> {
    try {
      const result = await database.query(
        `SELECT event_type, COUNT(*) as count
         FROM analytics_events
         WHERE campaign_id = $1
           AND timestamp >= $2
           AND timestamp <= $3
         GROUP BY event_type`,
        [campaignId, dateRange.start, dateRange.end]
      );

      const eventCounts = result.rows.reduce((acc, row) => {
        acc[row.event_type] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);

      const funnel: ConversionFunnel = {
        impressions: eventCounts.impression || 0,
        clicks: eventCounts.click || 0,
        landingPageViews: eventCounts.landing_page_view || 0,
        formSubmits: eventCounts.form_submit || 0,
        conversions: eventCounts.conversion || 0,
        clickThroughRate: 0,
        conversionRate: 0,
        dropOffRates: {
          clickToLanding: 0,
          landingToForm: 0,
          formToConversion: 0
        }
      };

      // Calculate rates
      if (funnel.impressions > 0) {
        funnel.clickThroughRate = (funnel.clicks / funnel.impressions) * 100;
      }
      
      if (funnel.clicks > 0) {
        funnel.conversionRate = (funnel.conversions / funnel.clicks) * 100;
      }

      // Calculate drop-off rates
      if (funnel.clicks > 0 && funnel.landingPageViews > 0) {
        funnel.dropOffRates.clickToLanding = ((funnel.clicks - funnel.landingPageViews) / funnel.clicks) * 100;
      }
      
      if (funnel.landingPageViews > 0 && funnel.formSubmits > 0) {
        funnel.dropOffRates.landingToForm = ((funnel.landingPageViews - funnel.formSubmits) / funnel.landingPageViews) * 100;
      }
      
      if (funnel.formSubmits > 0 && funnel.conversions > 0) {
        funnel.dropOffRates.formToConversion = ((funnel.formSubmits - funnel.conversions) / funnel.formSubmits) * 100;
      }

      return funnel;
    } catch (error) {
      logger.error('Failed to get conversion funnel', {
        error: error.message,
        campaignId,
        dateRange
      });
      throw error;
    }
  }

  private validateEventData(data: TrackEventData): void {
    if (!data.organizationId) {
      throw new Error('Organization ID is required');
    }
    
    if (!data.eventType) {
      throw new Error('Event type is required');
    }
    
    if (!data.eventData || typeof data.eventData !== 'object') {
      throw new Error('Event data is required and must be an object');
    }
  }

  private async updateRealTimeMetrics(data: TrackEventData): Promise<void> {
    try {
      // Update real-time counters in Redis for dashboard
      const redisKey = `realtime:${data.organizationId}:${data.eventType}`;
      await redisService.increment(redisKey, 3600); // 1 hour expiry
      
      if (data.campaignId) {
        const campaignKey = `realtime:campaign:${data.campaignId}:${data.eventType}`;
        await redisService.increment(campaignKey, 3600);
      }
    } catch (error) {
      // Don't throw on real-time update failures
      logger.warn('Failed to update real-time metrics', {
        error: error.message,
        organizationId: data.organizationId
      });
    }
  }

  private processMetricRows(rows: any[]): Record<string, number> {
    return rows.reduce((acc, row) => {
      acc[row.metric_type] = parseFloat(row.metric_value);
      return acc;
    }, {} as Record<string, number>);
  }

  private calculateCampaignMetrics(metrics: Record<string, number>): CampaignMetrics {
    const clicks = metrics.clicks || 0;
    const impressions = metrics.impressions || 0;
    const conversions = metrics.conversions || 0;
    const cost = metrics.cost || 0;

    return {
      clicks,
      impressions,
      conversions,
      cost,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      costPerClick: clicks > 0 ? cost / clicks : 0,
      costPerConversion: conversions > 0 ? cost / conversions : 0
    };
  }

  private calculateChannelMetrics(metrics: Record<string, number>): ChannelMetrics {
    const reach = metrics.reach || 0;
    const engagement = metrics.engagement || 0;
    const cost = metrics.cost || 0;
    const impressions = metrics.impressions || 0;
    const clicks = metrics.clicks || 0;

    return {
      reach,
      engagement,
      cost,
      impressions,
      clicks,
      engagementRate: reach > 0 ? (engagement / reach) * 100 : 0,
      costPerEngagement: engagement > 0 ? cost / engagement : 0
    };
  }

  private groupEventsByTimePeriod(
    events: any[],
    granularity: string
  ): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    
    events.forEach(event => {
      const timestamp = new Date(event.timestamp);
      let periodKey: string;
      
      switch (granularity) {
        case 'hourly':
          periodKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}-${timestamp.getHours()}`;
          break;
        case 'daily':
          periodKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
          break;
        case 'weekly':
          const weekStart = new Date(timestamp);
          weekStart.setDate(timestamp.getDate() - timestamp.getDay());
          periodKey = `${weekStart.getFullYear()}-W${Math.ceil(weekStart.getDate() / 7)}`;
          break;
        case 'monthly':
          periodKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}`;
          break;
        default:
          periodKey = timestamp.toISOString().split('T')[0];
      }
      
      if (!groups.has(periodKey)) {
        groups.set(periodKey, []);
      }
      groups.get(periodKey)!.push(event);
    });
    
    return groups;
  }

  private async saveAggregatedMetrics(
    organizationId: string,
    campaignId: string | undefined,
    channelId: string | undefined,
    timePeriod: string,
    events: any[]
  ): Promise<void> {
    // Count events by type
    const eventCounts = events.reduce((acc, event) => {
      acc[event.event_type] = (acc[event.event_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Save each metric type
    for (const [metricType, value] of Object.entries(eventCounts)) {
      const [startDate, endDate] = this.parseTimePeriod(timePeriod);
      
      await database.query(
        `INSERT INTO performance_metrics (
          organization_id, campaign_id, channel_id, metric_type, metric_value,
          date_range_start, date_range_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (organization_id, campaign_id, channel_id, metric_type, date_range_start, date_range_end)
        DO UPDATE SET metric_value = performance_metrics.metric_value + EXCLUDED.metric_value`,
        [
          organizationId,
          campaignId || null,
          channelId || null,
          metricType,
          value,
          startDate,
          endDate
        ]
      );
    }
  }

  private parseTimePeriod(timePeriod: string): [Date, Date] {
    // Simple parsing - in production, use a more robust date library
    const parts = timePeriod.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parts[2] ? parseInt(parts[2]) : 1;
    
    const startDate = new Date(year, month, day);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    return [startDate, endDate];
  }
}