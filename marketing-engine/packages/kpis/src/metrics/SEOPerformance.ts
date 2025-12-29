import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { 
  SEOMetrics, 
  KPIFilters 
} from '../types/kpi.types';

export class SEOPerformanceCalculator {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:seo:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(filters: KPIFilters): Promise<SEOMetrics> {
    const cacheKey = this.getCacheKey(filters);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('SEO metrics retrieved from cache', { filters });
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
      logger.error('Error calculating SEO metrics', { error, filters });
      throw error;
    }
  }

  private async calculateMetrics(filters: KPIFilters): Promise<SEOMetrics> {
    const seoData = await this.fetchSEOData(filters);
    
    if (seoData.length === 0) {
      // Return empty metrics
      return {
        organicTraffic: 0,
        trafficGrowth: new Decimal(0),
        keywordRankings: [],
        backlinks: 0,
        domainAuthority: 0,
        pageAuthority: 0,
        bounceRate: new Decimal(0),
        avgSessionDuration: 0,
        pagesPerSession: new Decimal(0),
        conversions: 0,
        conversionRate: new Decimal(0),
        estimatedValue: new Decimal(0)
      };
    }

    // Get latest metrics
    const latestData = seoData[0];
    const previousData = seoData.find(d => 
      this.monthsBetween(new Date(d.metric_date), new Date(latestData.metric_date)) === 1
    );

    // Calculate traffic growth
    const trafficGrowth = previousData && previousData.organic_traffic > 0
      ? new Decimal(latestData.organic_traffic - previousData.organic_traffic)
          .dividedBy(previousData.organic_traffic)
      : new Decimal(0);

    // Parse keyword rankings
    const keywordRankings = this.parseKeywordRankings(
      latestData.keyword_rankings,
      previousData?.keyword_rankings
    );

    // Calculate conversion metrics
    const conversionRate = latestData.organic_traffic > 0
      ? new Decimal(latestData.conversions).dividedBy(latestData.organic_traffic)
      : new Decimal(0);

    // Estimate value based on conversions and average order value
    const estimatedValue = await this.calculateEstimatedValue(
      latestData.conversions,
      filters
    );

    return {
      organicTraffic: latestData.organic_traffic,
      trafficGrowth,
      keywordRankings,
      backlinks: latestData.backlinks,
      domainAuthority: latestData.domain_authority,
      pageAuthority: latestData.page_authority,
      bounceRate: new Decimal(latestData.bounce_rate || 0),
      avgSessionDuration: latestData.avg_session_duration,
      pagesPerSession: new Decimal(latestData.pages_per_session || 0),
      conversions: latestData.conversions,
      conversionRate,
      estimatedValue
    };
  }

  private async fetchSEOData(filters: KPIFilters): Promise<any[]> {
    const dateFilter = filters.dateRange
      ? `WHERE metric_date BETWEEN $1 AND $2`
      : '';
    
    const params = filters.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];

    const query = `
      SELECT 
        metric_date,
        organic_traffic,
        keyword_rankings,
        backlinks,
        domain_authority,
        page_authority,
        bounce_rate,
        avg_session_duration,
        pages_per_session,
        conversions
      FROM seo_metrics
      ${dateFilter}
      ORDER BY metric_date DESC
      LIMIT 12
    `;
    
    const result = await this.db.query(query, params);
    return result.rows;
  }

  private parseKeywordRankings(
    currentRankings: any,
    previousRankings?: any
  ): {
    keyword: string;
    position: number;
    previousPosition: number;
    searchVolume: number;
    difficulty: number;
  }[] {
    if (!currentRankings || !Array.isArray(currentRankings)) {
      return [];
    }

    const previousMap = new Map<string, any>();
    if (previousRankings && Array.isArray(previousRankings)) {
      previousRankings.forEach((ranking: any) => {
        previousMap.set(ranking.keyword, ranking);
      });
    }

    return currentRankings.map((ranking: any) => {
      const previous = previousMap.get(ranking.keyword);
      return {
        keyword: ranking.keyword,
        position: ranking.position,
        previousPosition: previous?.position || 0,
        searchVolume: ranking.search_volume || 0,
        difficulty: ranking.difficulty || 0
      };
    });
  }

  private async calculateEstimatedValue(
    conversions: number,
    filters: KPIFilters
  ): Promise<Decimal> {
    // Calculate average order value from organic search conversions
    const dateFilter = filters.dateRange
      ? `AND r.revenue_date BETWEEN $1 AND $2`
      : '';
    
    const params = filters.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];

    const query = `
      SELECT AVG(r.amount) as avg_order_value
      FROM revenue r
      JOIN customers c ON c.id = r.customer_id
      WHERE c.acquisition_channel = 'organic_search'
      ${dateFilter}
    `;
    
    const result = await this.db.query(query, params);
    const avgOrderValue = new Decimal(result.rows[0]?.avg_order_value || 0);
    
    return avgOrderValue.times(conversions);
  }

  public async analyzePagePerformance(
    filters: KPIFilters
  ): Promise<{
    url: string;
    organicTraffic: number;
    avgPosition: Decimal;
    clickThroughRate: Decimal;
    conversions: number;
    conversionRate: Decimal;
  }[]> {
    // This would typically integrate with Google Analytics/Search Console
    // For now, we'll use metadata from touchpoints
    const query = `
      SELECT 
        metadata->>'landing_page' as url,
        COUNT(DISTINCT metadata->>'session_id') as organic_traffic,
        AVG(CAST(metadata->>'search_position' AS DECIMAL)) as avg_position,
        AVG(CASE 
          WHEN metadata->>'impressions' IS NOT NULL AND CAST(metadata->>'impressions' AS INT) > 0
          THEN CAST(metadata->>'clicks' AS DECIMAL) / CAST(metadata->>'impressions' AS INT)
          ELSE 0
        END) as click_through_rate,
        COUNT(DISTINCT CASE 
          WHEN customer_id IS NOT NULL 
          THEN customer_id 
        END) as conversions
      FROM channel_touchpoints
      WHERE channel = 'organic_search'
        AND metadata->>'landing_page' IS NOT NULL
        ${filters.dateRange ? 'AND touchpoint_date BETWEEN $1 AND $2' : ''}
      GROUP BY metadata->>'landing_page'
      HAVING COUNT(*) >= 10
      ORDER BY organic_traffic DESC
      LIMIT 50
    `;
    
    const params = filters.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];
    
    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      url: row.url,
      organicTraffic: parseInt(row.organic_traffic),
      avgPosition: new Decimal(row.avg_position || 0),
      clickThroughRate: new Decimal(row.click_through_rate || 0),
      conversions: parseInt(row.conversions),
      conversionRate: parseInt(row.organic_traffic) > 0
        ? new Decimal(row.conversions).dividedBy(row.organic_traffic)
        : new Decimal(0)
    }));
  }

  public async analyzeTechnicalSEO(): Promise<{
    metric: string;
    status: 'good' | 'warning' | 'critical';
    value: string;
    recommendation: string;
  }[]> {
    const technicalMetrics: {
      metric: string;
      status: 'good' | 'warning' | 'critical';
      value: string;
      recommendation: string;
    }[] = [];

    // Page speed analysis
    const pageSpeedQuery = `
      SELECT 
        AVG(CAST(metadata->>'page_speed' AS DECIMAL)) as avg_page_speed,
        COUNT(CASE 
          WHEN CAST(metadata->>'page_speed' AS DECIMAL) > 3 
          THEN 1 
        END) as slow_pages
      FROM channel_touchpoints
      WHERE metadata->>'page_speed' IS NOT NULL
        AND touchpoint_date >= CURRENT_DATE - INTERVAL '7 days'
    `;
    
    const pageSpeedResult = await this.db.query(pageSpeedQuery);
    const avgPageSpeed = pageSpeedResult.rows[0]?.avg_page_speed || 0;
    
    technicalMetrics.push({
      metric: 'Page Speed',
      status: avgPageSpeed <= 2 ? 'good' : avgPageSpeed <= 3 ? 'warning' : 'critical',
      value: `${avgPageSpeed.toFixed(2)}s average`,
      recommendation: avgPageSpeed > 2 
        ? 'Optimize images, enable compression, and minimize JavaScript'
        : 'Page speed is good'
    });

    // Mobile usability
    const mobileQuery = `
      SELECT 
        COUNT(CASE 
          WHEN metadata->>'is_mobile' = 'true' 
          THEN 1 
        END) * 100.0 / COUNT(*) as mobile_percentage
      FROM channel_touchpoints
      WHERE touchpoint_date >= CURRENT_DATE - INTERVAL '30 days'
    `;
    
    const mobileResult = await this.db.query(mobileQuery);
    const mobilePercentage = mobileResult.rows[0]?.mobile_percentage || 0;
    
    technicalMetrics.push({
      metric: 'Mobile Traffic',
      status: mobilePercentage >= 50 ? 'good' : 'warning',
      value: `${mobilePercentage.toFixed(1)}%`,
      recommendation: mobilePercentage < 50 
        ? 'Ensure your site is mobile-responsive'
        : 'Mobile traffic share is healthy'
    });

    // Crawl errors
    const crawlErrorsQuery = `
      SELECT 
        COUNT(CASE 
          WHEN metadata->>'status_code' = '404' 
          THEN 1 
        END) as not_found_errors,
        COUNT(CASE 
          WHEN metadata->>'status_code' LIKE '5%' 
          THEN 1 
        END) as server_errors
      FROM channel_touchpoints
      WHERE metadata->>'status_code' IS NOT NULL
        AND touchpoint_date >= CURRENT_DATE - INTERVAL '7 days'
    `;
    
    const crawlErrorsResult = await this.db.query(crawlErrorsQuery);
    const notFoundErrors = crawlErrorsResult.rows[0]?.not_found_errors || 0;
    const serverErrors = crawlErrorsResult.rows[0]?.server_errors || 0;
    
    technicalMetrics.push({
      metric: 'Crawl Errors',
      status: notFoundErrors + serverErrors === 0 ? 'good' : 
              serverErrors > 0 ? 'critical' : 'warning',
      value: `${notFoundErrors} 404s, ${serverErrors} server errors`,
      recommendation: notFoundErrors + serverErrors > 0 
        ? 'Fix broken links and server errors immediately'
        : 'No crawl errors detected'
    });

    return technicalMetrics;
  }

  public async getKeywordOpportunities(
    filters?: KPIFilters
  ): Promise<{
    keyword: string;
    currentPosition: number;
    searchVolume: number;
    difficulty: number;
    opportunityScore: Decimal;
    estimatedTrafficGain: number;
  }[]> {
    // Identify keywords with high potential
    const query = `
      SELECT 
        kr.keyword,
        kr.position as current_position,
        kr.search_volume,
        kr.difficulty,
        CASE 
          WHEN kr.position BETWEEN 4 AND 10 THEN kr.search_volume * 0.15
          WHEN kr.position BETWEEN 11 AND 20 THEN kr.search_volume * 0.05
          ELSE 0
        END as estimated_traffic_gain
      FROM (
        SELECT 
          jsonb_array_elements(keyword_rankings) as ranking
        FROM seo_metrics
        WHERE metric_date = (SELECT MAX(metric_date) FROM seo_metrics)
      ) t,
      LATERAL (
        SELECT 
          ranking->>'keyword' as keyword,
          CAST(ranking->>'position' AS INT) as position,
          CAST(ranking->>'search_volume' AS INT) as search_volume,
          CAST(ranking->>'difficulty' AS INT) as difficulty
      ) kr
      WHERE kr.position BETWEEN 4 AND 20
        AND kr.search_volume > 100
      ORDER BY estimated_traffic_gain DESC
      LIMIT 20
    `;
    
    const result = await this.db.query(query);
    
    return result.rows.map(row => {
      // Calculate opportunity score based on position, volume, and difficulty
      const positionScore = new Decimal(21 - row.current_position).dividedBy(20);
      const volumeScore = new Decimal(Math.min(row.search_volume, 10000)).dividedBy(10000);
      const difficultyScore = new Decimal(100 - row.difficulty).dividedBy(100);
      
      const opportunityScore = positionScore
        .times(0.4)
        .plus(volumeScore.times(0.4))
        .plus(difficultyScore.times(0.2));
      
      return {
        keyword: row.keyword,
        currentPosition: row.current_position,
        searchVolume: row.search_volume,
        difficulty: row.difficulty,
        opportunityScore,
        estimatedTrafficGain: Math.round(row.estimated_traffic_gain)
      };
    });
  }

  public async getContentGapAnalysis(): Promise<{
    topic: string;
    competitorCoverage: number;
    ourCoverage: number;
    gap: number;
    searchVolume: number;
    priority: 'high' | 'medium' | 'low';
  }[]> {
    // Analyze content gaps compared to competitors
    const query = `
      WITH competitor_content AS (
        SELECT 
          metadata->>'topic' as topic,
          COUNT(*) as coverage
        FROM content
        WHERE metadata->>'is_competitor' = 'true'
          AND metadata->>'topic' IS NOT NULL
        GROUP BY metadata->>'topic'
      ),
      our_content AS (
        SELECT 
          metadata->>'topic' as topic,
          COUNT(*) as coverage
        FROM content
        WHERE (metadata->>'is_competitor' IS NULL OR metadata->>'is_competitor' = 'false')
          AND metadata->>'topic' IS NOT NULL
        GROUP BY metadata->>'topic'
      ),
      topic_search_volume AS (
        SELECT 
          unnest(ARRAY(
            SELECT DISTINCT ranking->>'keyword' 
            FROM seo_metrics,
            LATERAL jsonb_array_elements(keyword_rankings) as ranking
          )) as topic,
          COALESCE(AVG(CAST(ranking->>'search_volume' AS INT)), 0) as avg_search_volume
        FROM seo_metrics,
        LATERAL jsonb_array_elements(keyword_rankings) as ranking
        GROUP BY topic
      )
      SELECT 
        COALESCE(cc.topic, oc.topic) as topic,
        COALESCE(cc.coverage, 0) as competitor_coverage,
        COALESCE(oc.coverage, 0) as our_coverage,
        COALESCE(cc.coverage, 0) - COALESCE(oc.coverage, 0) as gap,
        COALESCE(tsv.avg_search_volume, 0) as search_volume
      FROM competitor_content cc
      FULL OUTER JOIN our_content oc ON cc.topic = oc.topic
      LEFT JOIN topic_search_volume tsv ON COALESCE(cc.topic, oc.topic) = tsv.topic
      WHERE COALESCE(cc.coverage, 0) > COALESCE(oc.coverage, 0)
      ORDER BY gap DESC, search_volume DESC
      LIMIT 20
    `;
    
    const result = await this.db.query(query);
    
    return result.rows.map(row => {
      const gap = row.gap;
      const searchVolume = row.search_volume;
      
      let priority: 'high' | 'medium' | 'low';
      if (gap >= 3 && searchVolume >= 1000) {
        priority = 'high';
      } else if (gap >= 2 || searchVolume >= 500) {
        priority = 'medium';
      } else {
        priority = 'low';
      }
      
      return {
        topic: row.topic,
        competitorCoverage: row.competitor_coverage,
        ourCoverage: row.our_coverage,
        gap,
        searchVolume,
        priority
      };
    });
  }

  public async getBacklinkAnalysis(
    filters?: KPIFilters
  ): Promise<{
    totalBacklinks: number;
    doFollowLinks: number;
    noFollowLinks: number;
    uniqueDomains: number;
    averageDomainAuthority: Decimal;
    topReferrers: {
      domain: string;
      links: number;
      domainAuthority: number;
    }[];
  }> {
    // This would typically integrate with backlink APIs
    // For now, we'll use stored metadata
    const query = `
      WITH backlink_data AS (
        SELECT 
          metadata->>'referring_domain' as domain,
          CAST(metadata->>'domain_authority' AS INT) as domain_authority,
          metadata->>'link_type' as link_type,
          COUNT(*) as link_count
        FROM channel_touchpoints
        WHERE channel = 'referral'
          AND metadata->>'referring_domain' IS NOT NULL
          ${filters?.dateRange ? 'AND touchpoint_date BETWEEN $1 AND $2' : ''}
        GROUP BY domain, domain_authority, link_type
      )
      SELECT 
        SUM(link_count) as total_backlinks,
        SUM(CASE WHEN link_type = 'dofollow' THEN link_count ELSE 0 END) as dofollow_links,
        SUM(CASE WHEN link_type = 'nofollow' THEN link_count ELSE 0 END) as nofollow_links,
        COUNT(DISTINCT domain) as unique_domains,
        AVG(domain_authority) as avg_domain_authority
      FROM backlink_data
    `;
    
    const params = filters?.dateRange
      ? [filters.dateRange.startDate, filters.dateRange.endDate]
      : [];
    
    const summaryResult = await this.db.query(query, params);
    const summary = summaryResult.rows[0];
    
    // Get top referrers
    const topReferrersQuery = `
      SELECT 
        metadata->>'referring_domain' as domain,
        COUNT(*) as links,
        MAX(CAST(metadata->>'domain_authority' AS INT)) as domain_authority
      FROM channel_touchpoints
      WHERE channel = 'referral'
        AND metadata->>'referring_domain' IS NOT NULL
        ${filters?.dateRange ? 'AND touchpoint_date BETWEEN $1 AND $2' : ''}
      GROUP BY domain
      ORDER BY links DESC
      LIMIT 10
    `;
    
    const topReferrersResult = await this.db.query(topReferrersQuery, params);
    
    return {
      totalBacklinks: parseInt(summary?.total_backlinks || 0),
      doFollowLinks: parseInt(summary?.dofollow_links || 0),
      noFollowLinks: parseInt(summary?.nofollow_links || 0),
      uniqueDomains: parseInt(summary?.unique_domains || 0),
      averageDomainAuthority: new Decimal(summary?.avg_domain_authority || 0),
      topReferrers: topReferrersResult.rows.map(row => ({
        domain: row.domain,
        links: parseInt(row.links),
        domainAuthority: parseInt(row.domain_authority || 0)
      }))
    };
  }

  private monthsBetween(date1: Date, date2: Date): number {
    const months = (date2.getFullYear() - date1.getFullYear()) * 12;
    return months + date2.getMonth() - date1.getMonth();
  }

  private async storeCalculation(
    metrics: SEOMetrics, 
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
      organicTraffic: metrics.organicTraffic,
      trafficGrowth: metrics.trafficGrowth.toString(),
      keywordRankings: metrics.keywordRankings.slice(0, 20),
      backlinks: metrics.backlinks,
      domainAuthority: metrics.domainAuthority,
      pageAuthority: metrics.pageAuthority,
      bounceRate: metrics.bounceRate.toString(),
      avgSessionDuration: metrics.avgSessionDuration,
      pagesPerSession: metrics.pagesPerSession.toString(),
      conversions: metrics.conversions,
      conversionRate: metrics.conversionRate.toString(),
      estimatedValue: metrics.estimatedValue.toString()
    };

    await this.db.query(query, [
      'seo_performance',
      new Date(),
      filters.groupBy || 'custom',
      'organic_search',
      metrics.organicTraffic,
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
    
    if (filters.groupBy) {
      parts.push(filters.groupBy);
    }

    return parts.join(':');
  }

  private serializeMetrics(metrics: SEOMetrics): any {
    return {
      ...metrics,
      trafficGrowth: metrics.trafficGrowth.toString(),
      bounceRate: metrics.bounceRate.toString(),
      pagesPerSession: metrics.pagesPerSession.toString(),
      conversionRate: metrics.conversionRate.toString(),
      estimatedValue: metrics.estimatedValue.toString()
    };
  }

  private deserializeMetrics(data: any): SEOMetrics {
    return {
      ...data,
      trafficGrowth: new Decimal(data.trafficGrowth),
      bounceRate: new Decimal(data.bounceRate),
      pagesPerSession: new Decimal(data.pagesPerSession),
      conversionRate: new Decimal(data.conversionRate),
      estimatedValue: new Decimal(data.estimatedValue)
    };
  }
}