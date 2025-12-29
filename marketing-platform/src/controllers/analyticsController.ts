import { Request, Response } from 'express';
import { AnalyticsService } from '@/services/analyticsService';
import { logger } from '@/utils/logger';

const analyticsService = new AnalyticsService();

export class AnalyticsController {
  async trackEvent(req: Request, res: Response): Promise<void> {
    try {
      // Extract IP and user agent for analytics
      const eventData = {
        ...req.body,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const result = await analyticsService.trackEvent(eventData);

      res.status(201).json({
        success: true,
        message: 'Event tracked successfully',
        eventId: result.id
      });
    } catch (error) {
      logger.error('Failed to track analytics event', {
        error: error.message,
        organizationId: req.body.organizationId,
        eventType: req.body.eventType
      });

      if (error.message.includes('required')) {
        res.status(400).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to track event'
      });
    }
  }

  async getCampaignMetrics(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { campaignId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Start date and end date are required'
        });
        return;
      }

      const dateRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };

      const metrics = await analyticsService.getCampaignMetrics(campaignId, dateRange);

      res.status(200).json({
        success: true,
        metrics,
        dateRange
      });
    } catch (error) {
      logger.error('Failed to get campaign metrics', {
        error: error.message,
        campaignId: req.params.campaignId,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get campaign metrics'
      });
    }
  }

  async getChannelMetrics(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { channelId } = req.params;
      const { organizationId, startDate, endDate } = req.query;

      if (!organizationId || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Organization ID, start date, and end date are required'
        });
        return;
      }

      const dateRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };

      const metrics = await analyticsService.getChannelMetrics(
        channelId,
        organizationId as string,
        dateRange
      );

      res.status(200).json({
        success: true,
        metrics,
        dateRange
      });
    } catch (error) {
      logger.error('Failed to get channel metrics', {
        error: error.message,
        channelId: req.params.channelId,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get channel metrics'
      });
    }
  }

  async generateReport(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const {
        organizationId,
        campaignIds,
        channelIds,
        startDate,
        endDate,
        metrics
      } = req.body;

      if (!organizationId || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Organization ID, start date, and end date are required'
        });
        return;
      }

      const reportConfig = {
        organizationId,
        campaignIds,
        channelIds,
        dateRange: {
          start: new Date(startDate),
          end: new Date(endDate)
        },
        metrics: metrics || ['impressions', 'clicks', 'conversions', 'cost']
      };

      const report = await analyticsService.generateReport(reportConfig);

      logger.info('Analytics report generated', {
        organizationId,
        campaignCount: campaignIds?.length || 0,
        channelCount: channelIds?.length || 0,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Failed to generate analytics report', {
        error: error.message,
        organizationId: req.body.organizationId,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate report'
      });
    }
  }

  async getConversionFunnel(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { campaignId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Start date and end date are required'
        });
        return;
      }

      const dateRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };

      const funnel = await analyticsService.getConversionFunnel(campaignId, dateRange);

      res.status(200).json({
        success: true,
        funnel,
        dateRange
      });
    } catch (error) {
      logger.error('Failed to get conversion funnel', {
        error: error.message,
        campaignId: req.params.campaignId,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get conversion funnel'
      });
    }
  }

  async getTopContent(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const {
        organizationId,
        metric = 'clicks',
        limit = 10,
        startDate,
        endDate
      } = req.query;

      if (!organizationId || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Organization ID, start date, and end date are required'
        });
        return;
      }

      const dateRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };

      const topContent = await analyticsService.getTopPerformingContent(
        organizationId as string,
        metric as string,
        Number(limit),
        dateRange
      );

      res.status(200).json({
        success: true,
        topContent,
        criteria: {
          metric,
          limit: Number(limit),
          dateRange
        }
      });
    } catch (error) {
      logger.error('Failed to get top performing content', {
        error: error.message,
        organizationId: req.query.organizationId,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get top content'
      });
    }
  }

  async getRealTimeMetrics(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { organizationId } = req.params;
      const { eventTypes = 'clicks,impressions,conversions' } = req.query;

      // Get real-time metrics from Redis
      const eventTypeArray = (eventTypes as string).split(',');
      const realTimeData: Record<string, number> = {};

      for (const eventType of eventTypeArray) {
        try {
          // This would get from Redis in real implementation
          realTimeData[eventType] = Math.floor(Math.random() * 1000); // Mock data
        } catch (error) {
          realTimeData[eventType] = 0;
        }
      }

      res.status(200).json({
        success: true,
        metrics: realTimeData,
        timestamp: new Date().toISOString(),
        organizationId
      });
    } catch (error) {
      logger.error('Failed to get real-time metrics', {
        error: error.message,
        organizationId: req.params.organizationId,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get real-time metrics'
      });
    }
  }

  async aggregateMetrics(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const {
        organizationId,
        campaignId,
        channelId,
        startDate,
        endDate,
        granularity = 'daily'
      } = req.body;

      if (!organizationId || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Organization ID, start date, and end date are required'
        });
        return;
      }

      const config = {
        organizationId,
        campaignId,
        channelId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        granularity: granularity as 'hourly' | 'daily' | 'weekly' | 'monthly'
      };

      await analyticsService.aggregateMetrics(config);

      logger.info('Metrics aggregated successfully', {
        organizationId,
        granularity,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        message: 'Metrics aggregated successfully'
      });
    } catch (error) {
      logger.error('Failed to aggregate metrics', {
        error: error.message,
        organizationId: req.body.organizationId,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to aggregate metrics'
      });
    }
  }

  async getDashboardData(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { organizationId } = req.params;
      const { days = 30 } = req.query;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - Number(days));

      const dateRange = { start: startDate, end: endDate };

      // Get summary metrics for dashboard
      // In real implementation, this would aggregate data from multiple sources
      const dashboardData = {
        summary: {
          totalImpressions: 45000,
          totalClicks: 2250,
          totalConversions: 112,
          totalCost: 3375.00,
          averageCTR: 5.0,
          averageConversionRate: 4.98
        },
        trends: {
          impressions: [1500, 1600, 1750, 1800, 1900, 2000, 2100],
          clicks: [75, 80, 87, 90, 95, 100, 105],
          conversions: [4, 4, 5, 4, 6, 5, 6]
        },
        topCampaigns: [
          { id: 'camp-1', name: 'Summer Sale', clicks: 800, conversions: 40 },
          { id: 'camp-2', name: 'Product Launch', clicks: 650, conversions: 35 },
          { id: 'camp-3', name: 'Brand Awareness', clicks: 500, conversions: 20 }
        ],
        channelBreakdown: {
          'Google Ads': { spend: 1500, conversions: 45 },
          'Facebook Ads': { spend: 1200, conversions: 38 },
          'LinkedIn': { spend: 675, conversions: 29 }
        },
        dateRange
      };

      res.status(200).json({
        success: true,
        dashboard: dashboardData
      });
    } catch (error) {
      logger.error('Failed to get dashboard data', {
        error: error.message,
        organizationId: req.params.organizationId,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard data'
      });
    }
  }
}