import { AnalyticsService } from '@/services/analyticsService';
import database from '@/utils/database';
import { redisService } from '@/utils/redis';

// Mock dependencies
jest.mock('@/utils/database');
jest.mock('@/utils/redis');

const mockDatabase = database as jest.Mocked<typeof database>;
const mockRedis = redisService as jest.Mocked<typeof redisService>;

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  
  beforeEach(() => {
    analyticsService = new AnalyticsService();
    jest.clearAllMocks();
  });

  describe('trackEvent', () => {
    it('should track analytics event successfully', async () => {
      const eventData = {
        organizationId: 'org-123',
        campaignId: 'campaign-123',
        channelId: 'channel-123',
        eventType: 'click',
        eventData: {
          url: 'https://example.com',
          source: 'google'
        },
        userAgent: 'Mozilla/5.0...',
        ipAddress: '192.168.1.1',
        sessionId: 'session-123'
      };

      const eventId = 'event-123';
      
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: eventId }]
      });

      const result = await analyticsService.trackEvent(eventData);

      expect(result.id).toBe(eventId);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics_events'),
        expect.arrayContaining([
          eventData.organizationId,
          eventData.campaignId,
          eventData.channelId,
          eventData.eventType,
          JSON.stringify(eventData.eventData)
        ])
      );
    });

    it('should handle tracking without campaign or channel', async () => {
      const eventData = {
        organizationId: 'org-123',
        eventType: 'page_view',
        eventData: {
          page: '/home',
          referrer: 'https://google.com'
        }
      };

      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: 'event-123' }]
      });

      const result = await analyticsService.trackEvent(eventData);

      expect(result.id).toBe('event-123');
    });

    it('should validate required fields', async () => {
      const invalidEventData = {
        eventType: 'click',
        eventData: {}
      };

      await expect(analyticsService.trackEvent(invalidEventData as any))
        .rejects.toThrow('Organization ID is required');
    });
  });

  describe('getCampaignMetrics', () => {
    it('should retrieve campaign metrics successfully', async () => {
      const campaignId = 'campaign-123';
      const dateRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31')
      };

      const mockMetrics = [
        {
          metric_type: 'clicks',
          metric_value: 150,
          date_range_start: dateRange.start,
          date_range_end: dateRange.end
        },
        {
          metric_type: 'impressions',
          metric_value: 5000,
          date_range_start: dateRange.start,
          date_range_end: dateRange.end
        },
        {
          metric_type: 'conversions',
          metric_value: 12,
          date_range_start: dateRange.start,
          date_range_end: dateRange.end
        }
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockMetrics });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue();

      const result = await analyticsService.getCampaignMetrics(campaignId, dateRange);

      expect(result).toMatchObject({
        clicks: 150,
        impressions: 5000,
        conversions: 12,
        ctr: 3.0, // 150/5000 * 100
        conversionRate: 8.0 // 12/150 * 100
      });
    });

    it('should return cached metrics when available', async () => {
      const campaignId = 'campaign-123';
      const dateRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31')
      };

      const cachedMetrics = {
        clicks: 100,
        impressions: 3000,
        conversions: 8
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedMetrics));

      const result = await analyticsService.getCampaignMetrics(campaignId, dateRange);

      expect(result).toMatchObject(cachedMetrics);
      expect(mockDatabase.query).not.toHaveBeenCalled();
    });

    it('should calculate performance ratios correctly', async () => {
      const campaignId = 'campaign-123';
      const dateRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31')
      };

      const mockMetrics = [
        { metric_type: 'clicks', metric_value: 200 },
        { metric_type: 'impressions', metric_value: 10000 },
        { metric_type: 'conversions', metric_value: 20 }
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockMetrics });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue();

      const result = await analyticsService.getCampaignMetrics(campaignId, dateRange);

      expect(result.ctr).toBe(2.0); // 200/10000 * 100
      expect(result.conversionRate).toBe(10.0); // 20/200 * 100
    });
  });

  describe('getChannelMetrics', () => {
    it('should retrieve channel metrics successfully', async () => {
      const channelId = 'channel-123';
      const organizationId = 'org-123';
      const dateRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31')
      };

      const mockMetrics = [
        { metric_type: 'reach', metric_value: 25000 },
        { metric_type: 'engagement', metric_value: 1250 },
        { metric_type: 'cost', metric_value: 500.00 }
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockMetrics });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue();

      const result = await analyticsService.getChannelMetrics(
        channelId, organizationId, dateRange
      );

      expect(result).toMatchObject({
        reach: 25000,
        engagement: 1250,
        cost: 500.00,
        engagementRate: 5.0, // 1250/25000 * 100
        costPerEngagement: 0.4 // 500/1250
      });
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive analytics report', async () => {
      const reportConfig = {
        organizationId: 'org-123',
        campaignIds: ['campaign-1', 'campaign-2'],
        channelIds: ['channel-1', 'channel-2'],
        dateRange: {
          start: new Date('2023-01-01'),
          end: new Date('2023-01-31')
        },
        metrics: ['clicks', 'impressions', 'conversions', 'cost']
      };

      // Mock campaign metrics
      mockDatabase.query
        .mockResolvedValueOnce({ // Campaign 1 metrics
          rows: [
            { metric_type: 'clicks', metric_value: 100 },
            { metric_type: 'impressions', metric_value: 5000 }
          ]
        })
        .mockResolvedValueOnce({ // Campaign 2 metrics
          rows: [
            { metric_type: 'clicks', metric_value: 150 },
            { metric_type: 'impressions', metric_value: 7000 }
          ]
        });

      // Mock channel metrics
      mockDatabase.query
        .mockResolvedValueOnce({ // Channel 1 metrics
          rows: [
            { metric_type: 'cost', metric_value: 300 }
          ]
        })
        .mockResolvedValueOnce({ // Channel 2 metrics
          rows: [
            { metric_type: 'cost', metric_value: 400 }
          ]
        });

      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue();

      const result = await analyticsService.generateReport(reportConfig);

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('campaigns');
      expect(result).toHaveProperty('channels');
      expect(result.summary.totalClicks).toBe(250);
      expect(result.summary.totalImpressions).toBe(12000);
    });
  });

  describe('aggregateMetrics', () => {
    it('should aggregate metrics for time periods', async () => {
      const config = {
        organizationId: 'org-123',
        campaignId: 'campaign-123',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-31'),
        granularity: 'daily' as const
      };

      const mockEvents = [
        {
          event_type: 'click',
          timestamp: '2023-01-01T10:00:00Z',
          campaign_id: 'campaign-123'
        },
        {
          event_type: 'click',
          timestamp: '2023-01-01T11:00:00Z',
          campaign_id: 'campaign-123'
        },
        {
          event_type: 'impression',
          timestamp: '2023-01-01T10:00:00Z',
          campaign_id: 'campaign-123'
        }
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockEvents });

      await analyticsService.aggregateMetrics(config);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO performance_metrics'),
        expect.any(Array)
      );
    });
  });

  describe('getTopPerformingContent', () => {
    it('should retrieve top performing content', async () => {
      const organizationId = 'org-123';
      const metric = 'clicks';
      const limit = 10;
      const dateRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31')
      };

      const mockContent = [
        {
          content_id: 'content-1',
          title: 'Top Performing Ad',
          metric_value: 500,
          campaign_name: 'Summer Campaign'
        },
        {
          content_id: 'content-2',
          title: 'Second Best Ad',
          metric_value: 350,
          campaign_name: 'Spring Campaign'
        }
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockContent });

      const result = await analyticsService.getTopPerformingContent(
        organizationId, metric, limit, dateRange
      );

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Top Performing Ad');
      expect(result[0].metricValue).toBe(500);
    });
  });

  describe('getConversionFunnel', () => {
    it('should calculate conversion funnel metrics', async () => {
      const campaignId = 'campaign-123';
      const dateRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31')
      };

      const mockEvents = [
        { event_type: 'impression', count: '10000' },
        { event_type: 'click', count: '500' },
        { event_type: 'landing_page_view', count: '450' },
        { event_type: 'form_submit', count: '50' },
        { event_type: 'conversion', count: '25' }
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockEvents });

      const result = await analyticsService.getConversionFunnel(campaignId, dateRange);

      expect(result).toMatchObject({
        impressions: 10000,
        clicks: 500,
        landingPageViews: 450,
        formSubmits: 50,
        conversions: 25,
        clickThroughRate: 5.0, // 500/10000 * 100
        conversionRate: 5.0 // 25/500 * 100
      });
    });
  });
});