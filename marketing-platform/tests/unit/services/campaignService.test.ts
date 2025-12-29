import { CampaignService } from '@/services/campaignService';
import database from '@/utils/database';
import { redisService } from '@/utils/redis';

// Mock dependencies
jest.mock('@/utils/database');
jest.mock('@/utils/redis');

const mockDatabase = database as jest.Mocked<typeof database>;
const mockRedis = redisService as jest.Mocked<typeof redisService>;

describe('CampaignService', () => {
  let campaignService: CampaignService;
  
  beforeEach(() => {
    campaignService = new CampaignService();
    jest.clearAllMocks();
  });

  describe('createCampaign', () => {
    it('should create a new campaign successfully', async () => {
      const campaignData = {
        organizationId: 'org-123',
        name: 'Test Campaign',
        description: 'Test campaign description',
        objectives: {
          primary: 'lead_generation',
          secondary: 'brand_awareness'
        },
        targetAudience: {
          demographics: { age_range: '25-45' },
          interests: ['technology', 'marketing']
        },
        budgetTotal: 10000.00
      };

      const userId = 'user-123';
      const campaignId = 'campaign-123';

      // Mock organization exists check
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: campaignData.organizationId }]
      });

      // Mock campaign creation
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{
          id: campaignId,
          organization_id: campaignData.organizationId,
          name: campaignData.name,
          description: campaignData.description,
          objectives: JSON.stringify(campaignData.objectives),
          target_audience: JSON.stringify(campaignData.targetAudience),
          budget_total: campaignData.budgetTotal,
          budget_spent: 0,
          status: 'draft',
          created_by: userId,
          created_at: new Date().toISOString()
        }]
      });

      const result = await campaignService.createCampaign(campaignData, userId);

      expect(result).toMatchObject({
        id: campaignId,
        name: campaignData.name,
        status: 'draft'
      });

      expect(mockDatabase.query).toHaveBeenCalledTimes(2);
    });

    it('should throw error if organization does not exist', async () => {
      const campaignData = {
        organizationId: 'nonexistent-org',
        name: 'Test Campaign',
        description: 'Test campaign description',
        objectives: { primary: 'lead_generation' },
        targetAudience: { demographics: {} },
        budgetTotal: 10000.00
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(campaignService.createCampaign(campaignData, 'user-123'))
        .rejects.toThrow('Organization not found');
    });

    it('should validate campaign budget', async () => {
      const campaignData = {
        organizationId: 'org-123',
        name: 'Test Campaign',
        description: 'Test campaign description',
        objectives: { primary: 'lead_generation' },
        targetAudience: { demographics: {} },
        budgetTotal: -100.00 // Invalid budget
      };

      await expect(campaignService.createCampaign(campaignData, 'user-123'))
        .rejects.toThrow('Budget must be a positive number');
    });
  });

  describe('getCampaignById', () => {
    it('should retrieve campaign by ID successfully', async () => {
      const campaignId = 'campaign-123';
      const userId = 'user-123';

      const campaignData = {
        id: campaignId,
        organization_id: 'org-123',
        name: 'Test Campaign',
        description: 'Test description',
        objectives: JSON.stringify({ primary: 'lead_generation' }),
        target_audience: JSON.stringify({ demographics: {} }),
        budget_total: 10000.00,
        budget_spent: 2500.00,
        status: 'active',
        created_by: userId,
        created_at: new Date().toISOString()
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [campaignData] });
      
      // Mock Redis cache miss
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue();

      const result = await campaignService.getCampaignById(campaignId, userId);

      expect(result).toMatchObject({
        id: campaignId,
        name: 'Test Campaign',
        status: 'active',
        budgetTotal: 10000.00,
        budgetSpent: 2500.00
      });
    });

    it('should return cached campaign data', async () => {
      const campaignId = 'campaign-123';
      const userId = 'user-123';
      
      const cachedData = JSON.stringify({
        id: campaignId,
        name: 'Cached Campaign',
        status: 'active'
      });

      mockRedis.get.mockResolvedValue(cachedData);

      const result = await campaignService.getCampaignById(campaignId, userId);

      expect(result.name).toBe('Cached Campaign');
      expect(mockDatabase.query).not.toHaveBeenCalled();
    });

    it('should throw error if campaign not found', async () => {
      const campaignId = 'nonexistent-campaign';
      const userId = 'user-123';

      mockRedis.get.mockResolvedValue(null);
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(campaignService.getCampaignById(campaignId, userId))
        .rejects.toThrow('Campaign not found');
    });
  });

  describe('updateCampaign', () => {
    it('should update campaign successfully', async () => {
      const campaignId = 'campaign-123';
      const userId = 'user-123';
      const updateData = {
        name: 'Updated Campaign Name',
        budgetTotal: 15000.00
      };

      // Mock existing campaign
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: campaignId, created_by: userId, status: 'draft' }]
      });

      // Mock update query
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{
          id: campaignId,
          name: updateData.name,
          budget_total: updateData.budgetTotal,
          updated_at: new Date().toISOString()
        }]
      });

      // Mock cache invalidation
      mockRedis.del.mockResolvedValue();

      const result = await campaignService.updateCampaign(campaignId, updateData, userId);

      expect(result.name).toBe(updateData.name);
      expect(result.budgetTotal).toBe(updateData.budgetTotal);
    });

    it('should throw error if campaign is not found', async () => {
      const campaignId = 'nonexistent-campaign';
      const userId = 'user-123';
      const updateData = { name: 'Updated Name' };

      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(campaignService.updateCampaign(campaignId, updateData, userId))
        .rejects.toThrow('Campaign not found');
    });

    it('should throw error if user is not the campaign owner', async () => {
      const campaignId = 'campaign-123';
      const userId = 'user-123';
      const updateData = { name: 'Updated Name' };

      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: campaignId, created_by: 'other-user', status: 'draft' }]
      });

      await expect(campaignService.updateCampaign(campaignId, updateData, userId))
        .rejects.toThrow('Not authorized to update this campaign');
    });
  });

  describe('deleteCampaign', () => {
    it('should delete campaign successfully', async () => {
      const campaignId = 'campaign-123';
      const userId = 'user-123';

      // Mock existing campaign
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: campaignId, created_by: userId, status: 'draft' }]
      });

      // Mock deletion
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 1 });
      mockRedis.del.mockResolvedValue();

      await campaignService.deleteCampaign(campaignId, userId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        'DELETE FROM campaigns WHERE id = $1',
        [campaignId]
      );
    });

    it('should throw error if campaign is active', async () => {
      const campaignId = 'campaign-123';
      const userId = 'user-123';

      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: campaignId, created_by: userId, status: 'active' }]
      });

      await expect(campaignService.deleteCampaign(campaignId, userId))
        .rejects.toThrow('Cannot delete active campaign');
    });
  });

  describe('getCampaignsByOrganization', () => {
    it('should retrieve campaigns by organization', async () => {
      const organizationId = 'org-123';
      const userId = 'user-123';
      const limit = 10;
      const offset = 0;

      const campaigns = [
        {
          id: 'campaign-1',
          name: 'Campaign 1',
          status: 'active',
          budget_total: 10000,
          budget_spent: 2500
        },
        {
          id: 'campaign-2',
          name: 'Campaign 2',
          status: 'draft',
          budget_total: 5000,
          budget_spent: 0
        }
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: campaigns });
      mockDatabase.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const result = await campaignService.getCampaignsByOrganization(
        organizationId, userId, limit, offset
      );

      expect(result.campaigns).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.campaigns[0].name).toBe('Campaign 1');
    });
  });

  describe('updateCampaignStatus', () => {
    it('should update campaign status successfully', async () => {
      const campaignId = 'campaign-123';
      const userId = 'user-123';
      const newStatus = 'active';

      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: campaignId, created_by: userId, status: 'draft' }]
      });

      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: campaignId, status: newStatus }]
      });

      mockRedis.del.mockResolvedValue();

      const result = await campaignService.updateCampaignStatus(campaignId, newStatus, userId);

      expect(result.status).toBe(newStatus);
    });

    it('should validate status transition', async () => {
      const campaignId = 'campaign-123';
      const userId = 'user-123';
      const newStatus = 'completed';

      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ id: campaignId, created_by: userId, status: 'draft' }]
      });

      await expect(campaignService.updateCampaignStatus(campaignId, newStatus, userId))
        .rejects.toThrow('Invalid status transition');
    });
  });
});