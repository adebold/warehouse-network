import { Request, Response } from 'express';
import { CampaignService } from '@/services/campaignService';
import { logger } from '@/utils/logger';

const campaignService = new CampaignService();

export class CampaignController {
  async createCampaign(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const campaign = await campaignService.createCampaign(req.body, req.user.id);

      logger.info('Campaign created successfully', {
        campaignId: campaign.id,
        userId: req.user.id,
        organizationId: campaign.organizationId
      });

      res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        campaign
      });
    } catch (error) {
      logger.error('Failed to create campaign', {
        error: error.message,
        userId: req.user?.id,
        organizationId: req.body.organizationId
      });

      if (error.message === 'Organization not found or access denied') {
        res.status(404).json({
          success: false,
          error: 'Organization not found or access denied'
        });
        return;
      }

      if (error.message.includes('Budget') || error.message.includes('name') || error.message.includes('objectives')) {
        res.status(400).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create campaign'
      });
    }
  }

  async getCampaignById(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { id } = req.params;
      const campaign = await campaignService.getCampaignById(id, req.user.id);

      res.status(200).json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to get campaign', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id
      });

      if (error.message === 'Campaign not found') {
        res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get campaign'
      });
    }
  }

  async updateCampaign(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { id } = req.params;
      const campaign = await campaignService.updateCampaign(id, req.body, req.user.id);

      logger.info('Campaign updated successfully', {
        campaignId: campaign.id,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        message: 'Campaign updated successfully',
        campaign
      });
    } catch (error) {
      logger.error('Failed to update campaign', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id
      });

      if (error.message === 'Campaign not found') {
        res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
        return;
      }

      if (error.message === 'Not authorized to update this campaign') {
        res.status(403).json({
          success: false,
          error: 'Not authorized to update this campaign'
        });
        return;
      }

      if (error.message.includes('Budget') || error.message.includes('date')) {
        res.status(400).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update campaign'
      });
    }
  }

  async deleteCampaign(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { id } = req.params;
      await campaignService.deleteCampaign(id, req.user.id);

      logger.info('Campaign deleted successfully', {
        campaignId: id,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete campaign', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id
      });

      if (error.message === 'Campaign not found') {
        res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
        return;
      }

      if (error.message === 'Not authorized to delete this campaign') {
        res.status(403).json({
          success: false,
          error: 'Not authorized to delete this campaign'
        });
        return;
      }

      if (error.message === 'Cannot delete active campaign. Please pause it first.') {
        res.status(400).json({
          success: false,
          error: 'Cannot delete active campaign. Please pause it first.'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete campaign'
      });
    }
  }

  async getCampaignsByOrganization(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { organizationId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const result = await campaignService.getCampaignsByOrganization(
        organizationId,
        req.user.id,
        Number(limit),
        Number(offset)
      );

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Failed to get campaigns by organization', {
        error: error.message,
        organizationId: req.params.organizationId,
        userId: req.user?.id
      });

      if (error.message === 'Organization not found or access denied') {
        res.status(404).json({
          success: false,
          error: 'Organization not found or access denied'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get campaigns'
      });
    }
  }

  async updateCampaignStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { id } = req.params;
      const { status } = req.body;

      const campaign = await campaignService.updateCampaignStatus(id, status, req.user.id);

      logger.info('Campaign status updated successfully', {
        campaignId: campaign.id,
        newStatus: status,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        message: 'Campaign status updated successfully',
        campaign
      });
    } catch (error) {
      logger.error('Failed to update campaign status', {
        error: error.message,
        campaignId: req.params.id,
        status: req.body.status,
        userId: req.user?.id
      });

      if (error.message === 'Campaign not found') {
        res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
        return;
      }

      if (error.message === 'Not authorized to update this campaign') {
        res.status(403).json({
          success: false,
          error: 'Not authorized to update this campaign'
        });
        return;
      }

      if (error.message.includes('Invalid status transition')) {
        res.status(400).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update campaign status'
      });
    }
  }

  async getCampaignPerformance(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { id } = req.params;
      const { startDate, endDate } = req.query;

      // First verify user has access to this campaign
      await campaignService.getCampaignById(id, req.user.id);

      // Get performance metrics (implementation would use AnalyticsService)
      // For this example, we'll return mock data
      const performance = {
        impressions: 10000,
        clicks: 500,
        conversions: 25,
        cost: 750.00,
        ctr: 5.0,
        conversionRate: 5.0,
        costPerClick: 1.50,
        costPerConversion: 30.00,
        dateRange: { startDate, endDate }
      };

      res.status(200).json({
        success: true,
        performance
      });
    } catch (error) {
      logger.error('Failed to get campaign performance', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id
      });

      if (error.message === 'Campaign not found') {
        res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get campaign performance'
      });
    }
  }

  async duplicateCampaign(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { id } = req.params;
      const { name } = req.body;

      // Get original campaign
      const originalCampaign = await campaignService.getCampaignById(id, req.user.id);

      // Create duplicate with new name
      const duplicateData = {
        organizationId: originalCampaign.organizationId,
        name: name || `${originalCampaign.name} (Copy)`,
        description: originalCampaign.description,
        objectives: originalCampaign.objectives,
        targetAudience: originalCampaign.targetAudience,
        budgetTotal: originalCampaign.budgetTotal
      };

      const duplicatedCampaign = await campaignService.createCampaign(duplicateData, req.user.id);

      logger.info('Campaign duplicated successfully', {
        originalCampaignId: id,
        duplicatedCampaignId: duplicatedCampaign.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        message: 'Campaign duplicated successfully',
        campaign: duplicatedCampaign
      });
    } catch (error) {
      logger.error('Failed to duplicate campaign', {
        error: error.message,
        originalCampaignId: req.params.id,
        userId: req.user?.id
      });

      if (error.message === 'Campaign not found') {
        res.status(404).json({
          success: false,
          error: 'Original campaign not found'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to duplicate campaign'
      });
    }
  }
}