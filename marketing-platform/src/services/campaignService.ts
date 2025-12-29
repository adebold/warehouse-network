import database from '@/utils/database';
import { redisService } from '@/utils/redis';
import { logger } from '@/utils/logger';

interface CreateCampaignData {
  organizationId: string;
  name: string;
  description?: string;
  objectives: any;
  targetAudience: any;
  budgetTotal: number;
  startDate?: Date;
  endDate?: Date;
}

interface UpdateCampaignData {
  name?: string;
  description?: string;
  objectives?: any;
  targetAudience?: any;
  budgetTotal?: number;
  startDate?: Date;
  endDate?: Date;
}

interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  objectives: any;
  targetAudience: any;
  budgetTotal: number;
  budgetSpent: number;
  status: string;
  startDate?: Date;
  endDate?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CampaignListResult {
  campaigns: Campaign[];
  total: number;
  limit: number;
  offset: number;
}

type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

export class CampaignService {
  private readonly cachePrefix = 'campaign:';
  private readonly cacheExpiry = 3600; // 1 hour

  async createCampaign(data: CreateCampaignData, userId: string): Promise<Campaign> {
    const {
      organizationId,
      name,
      description,
      objectives,
      targetAudience,
      budgetTotal,
      startDate,
      endDate
    } = data;

    // Validate input
    this.validateCampaignData(data);

    try {
      // Verify organization exists and user has access
      await this.verifyOrganizationAccess(organizationId, userId);

      // Create campaign
      const result = await database.query(
        `INSERT INTO campaigns (
          organization_id, name, description, objectives, target_audience,
          budget_total, start_date, end_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          organizationId,
          name.trim(),
          description?.trim(),
          JSON.stringify(objectives),
          JSON.stringify(targetAudience),
          budgetTotal,
          startDate,
          endDate,
          userId
        ]
      );

      const campaign = this.mapDatabaseRowToCampaign(result.rows[0]);
      
      // Cache the new campaign
      await this.setCampaignCache(campaign.id, campaign);
      
      logger.info('Campaign created successfully', {
        campaignId: campaign.id,
        userId,
        organizationId
      });

      return campaign;
    } catch (error) {
      logger.error('Failed to create campaign', {
        error: error.message,
        userId,
        organizationId
      });
      throw error;
    }
  }

  async getCampaignById(campaignId: string, userId: string): Promise<Campaign> {
    try {
      // Check cache first
      const cached = await this.getCampaignCache(campaignId);
      if (cached) {
        // Verify user access
        await this.verifyCampaignAccess(campaignId, userId);
        return cached;
      }

      // Get from database
      const result = await database.query(
        `SELECT c.*, uo.user_id
         FROM campaigns c
         JOIN user_organizations uo ON c.organization_id = uo.organization_id
         WHERE c.id = $1 AND uo.user_id = $2`,
        [campaignId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Campaign not found');
      }

      const campaign = this.mapDatabaseRowToCampaign(result.rows[0]);
      
      // Cache the campaign
      await this.setCampaignCache(campaignId, campaign);
      
      return campaign;
    } catch (error) {
      logger.error('Failed to get campaign', {
        error: error.message,
        campaignId,
        userId
      });
      throw error;
    }
  }

  async updateCampaign(
    campaignId: string,
    data: UpdateCampaignData,
    userId: string
  ): Promise<Campaign> {
    try {
      // Verify campaign exists and user has access
      const existingCampaign = await database.query(
        'SELECT * FROM campaigns WHERE id = $1',
        [campaignId]
      );

      if (existingCampaign.rows.length === 0) {
        throw new Error('Campaign not found');
      }

      const campaign = existingCampaign.rows[0];
      
      if (campaign.created_by !== userId) {
        // Check if user has organization admin access
        const orgAccess = await database.query(
          `SELECT uo.role FROM user_organizations uo
           WHERE uo.user_id = $1 AND uo.organization_id = $2 AND uo.role = 'admin'`,
          [userId, campaign.organization_id]
        );
        
        if (orgAccess.rows.length === 0) {
          throw new Error('Not authorized to update this campaign');
        }
      }

      // Validate update data
      if (data.budgetTotal !== undefined) {
        this.validateBudget(data.budgetTotal);
      }

      // Build update query dynamically
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(data.name.trim());
      }

      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(data.description?.trim());
      }

      if (data.objectives !== undefined) {
        updateFields.push(`objectives = $${paramIndex++}`);
        updateValues.push(JSON.stringify(data.objectives));
      }

      if (data.targetAudience !== undefined) {
        updateFields.push(`target_audience = $${paramIndex++}`);
        updateValues.push(JSON.stringify(data.targetAudience));
      }

      if (data.budgetTotal !== undefined) {
        updateFields.push(`budget_total = $${paramIndex++}`);
        updateValues.push(data.budgetTotal);
      }

      if (data.startDate !== undefined) {
        updateFields.push(`start_date = $${paramIndex++}`);
        updateValues.push(data.startDate);
      }

      if (data.endDate !== undefined) {
        updateFields.push(`end_date = $${paramIndex++}`);
        updateValues.push(data.endDate);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(campaignId);

      const result = await database.query(
        `UPDATE campaigns SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        updateValues
      );

      const updatedCampaign = this.mapDatabaseRowToCampaign(result.rows[0]);
      
      // Invalidate cache
      await this.invalidateCampaignCache(campaignId);
      
      logger.info('Campaign updated successfully', {
        campaignId,
        userId
      });

      return updatedCampaign;
    } catch (error) {
      logger.error('Failed to update campaign', {
        error: error.message,
        campaignId,
        userId
      });
      throw error;
    }
  }

  async deleteCampaign(campaignId: string, userId: string): Promise<void> {
    try {
      // Verify campaign exists and user has access
      const existingCampaign = await database.query(
        'SELECT * FROM campaigns WHERE id = $1',
        [campaignId]
      );

      if (existingCampaign.rows.length === 0) {
        throw new Error('Campaign not found');
      }

      const campaign = existingCampaign.rows[0];
      
      if (campaign.created_by !== userId) {
        throw new Error('Not authorized to delete this campaign');
      }

      if (campaign.status === 'active') {
        throw new Error('Cannot delete active campaign. Please pause it first.');
      }

      // Delete campaign (cascade will handle related records)
      await database.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
      
      // Invalidate cache
      await this.invalidateCampaignCache(campaignId);
      
      logger.info('Campaign deleted successfully', {
        campaignId,
        userId
      });
    } catch (error) {
      logger.error('Failed to delete campaign', {
        error: error.message,
        campaignId,
        userId
      });
      throw error;
    }
  }

  async getCampaignsByOrganization(
    organizationId: string,
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<CampaignListResult> {
    try {
      // Verify user has access to organization
      await this.verifyOrganizationAccess(organizationId, userId);

      // Get campaigns
      const result = await database.query(
        `SELECT * FROM campaigns 
         WHERE organization_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [organizationId, limit, offset]
      );

      // Get total count
      const countResult = await database.query(
        'SELECT COUNT(*) as count FROM campaigns WHERE organization_id = $1',
        [organizationId]
      );

      const campaigns = result.rows.map(row => this.mapDatabaseRowToCampaign(row));
      const total = parseInt(countResult.rows[0].count);

      return {
        campaigns,
        total,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Failed to get campaigns by organization', {
        error: error.message,
        organizationId,
        userId
      });
      throw error;
    }
  }

  async updateCampaignStatus(
    campaignId: string,
    newStatus: CampaignStatus,
    userId: string
  ): Promise<Campaign> {
    try {
      // Get current campaign
      const result = await database.query(
        'SELECT * FROM campaigns WHERE id = $1',
        [campaignId]
      );

      if (result.rows.length === 0) {
        throw new Error('Campaign not found');
      }

      const campaign = result.rows[0];
      
      if (campaign.created_by !== userId) {
        throw new Error('Not authorized to update this campaign');
      }

      // Validate status transition
      this.validateStatusTransition(campaign.status, newStatus);

      // Update status
      const updateResult = await database.query(
        `UPDATE campaigns SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [newStatus, campaignId]
      );

      const updatedCampaign = this.mapDatabaseRowToCampaign(updateResult.rows[0]);
      
      // Invalidate cache
      await this.invalidateCampaignCache(campaignId);
      
      logger.info('Campaign status updated', {
        campaignId,
        oldStatus: campaign.status,
        newStatus,
        userId
      });

      return updatedCampaign;
    } catch (error) {
      logger.error('Failed to update campaign status', {
        error: error.message,
        campaignId,
        newStatus,
        userId
      });
      throw error;
    }
  }

  private validateCampaignData(data: CreateCampaignData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Campaign name is required');
    }

    if (data.name.trim().length > 255) {
      throw new Error('Campaign name must be 255 characters or less');
    }

    this.validateBudget(data.budgetTotal);

    if (!data.objectives || typeof data.objectives !== 'object') {
      throw new Error('Campaign objectives are required');
    }

    if (!data.targetAudience || typeof data.targetAudience !== 'object') {
      throw new Error('Target audience is required');
    }

    if (data.startDate && data.endDate && data.startDate >= data.endDate) {
      throw new Error('End date must be after start date');
    }
  }

  private validateBudget(budget: number): void {
    if (typeof budget !== 'number' || budget < 0) {
      throw new Error('Budget must be a positive number');
    }

    if (budget > 1000000) {
      throw new Error('Budget cannot exceed $1,000,000');
    }
  }

  private validateStatusTransition(currentStatus: string, newStatus: string): void {
    const validTransitions: Record<string, string[]> = {
      draft: ['active', 'cancelled'],
      active: ['paused', 'completed', 'cancelled'],
      paused: ['active', 'cancelled'],
      completed: [],
      cancelled: []
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }
  }

  private async verifyOrganizationAccess(organizationId: string, userId: string): Promise<void> {
    const result = await database.query(
      'SELECT id FROM user_organizations WHERE organization_id = $1 AND user_id = $2',
      [organizationId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Organization not found or access denied');
    }
  }

  private async verifyCampaignAccess(campaignId: string, userId: string): Promise<void> {
    const result = await database.query(
      `SELECT c.id FROM campaigns c
       JOIN user_organizations uo ON c.organization_id = uo.organization_id
       WHERE c.id = $1 AND uo.user_id = $2`,
      [campaignId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found or access denied');
    }
  }

  private mapDatabaseRowToCampaign(row: any): Campaign {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      objectives: typeof row.objectives === 'string' ? JSON.parse(row.objectives) : row.objectives,
      targetAudience: typeof row.target_audience === 'string' ? JSON.parse(row.target_audience) : row.target_audience,
      budgetTotal: parseFloat(row.budget_total),
      budgetSpent: parseFloat(row.budget_spent || 0),
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private async getCampaignCache(campaignId: string): Promise<Campaign | null> {
    try {
      const cached = await redisService.get(`${this.cachePrefix}${campaignId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Failed to get campaign from cache', { campaignId, error: error.message });
      return null;
    }
  }

  private async setCampaignCache(campaignId: string, campaign: Campaign): Promise<void> {
    try {
      await redisService.set(
        `${this.cachePrefix}${campaignId}`,
        JSON.stringify(campaign),
        this.cacheExpiry
      );
    } catch (error) {
      logger.warn('Failed to set campaign cache', { campaignId, error: error.message });
    }
  }

  private async invalidateCampaignCache(campaignId: string): Promise<void> {
    try {
      await redisService.del(`${this.cachePrefix}${campaignId}`);
    } catch (error) {
      logger.warn('Failed to invalidate campaign cache', { campaignId, error: error.message });
    }
  }
}