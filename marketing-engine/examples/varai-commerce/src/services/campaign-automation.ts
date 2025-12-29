import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { database } from '../database';
import { redis } from './redis';
import { logger } from './logger';
import { shopifyService } from './shopify';
import { sendgridService } from './sendgrid';
import { facebookService } from './facebook';
import { googleAdsService } from './google-ads';
import { segmentService } from './segment';
import { mlService } from './ml';
import { Campaign, Customer, Product, CampaignExecution } from '../types';
import { performanceTracker } from './performance-tracker';

// Campaign creation schema
const createCampaignSchema = z.object({
  type: z.enum(['product_launch', 'retention', 'win_back', 'seasonal', 'flash_sale']),
  name: z.string().min(1).max(255),
  product_id: z.string().optional(),
  channels: z.array(z.enum(['email', 'sms', 'push', 'facebook', 'google', 'instagram', 'tiktok'])).min(1),
  segments: z.array(z.string()).min(1),
  schedule: z.object({
    announcement: z.string().optional(),
    early_access: z.string().optional(),
    launch: z.string(),
    follow_up: z.string().optional()
  }),
  content: z.object({
    subject_lines: z.record(z.string()).optional(),
    preview_text: z.record(z.string()).optional(),
    email_templates: z.record(z.string()).optional(),
    sms_templates: z.record(z.string()).optional(),
    ad_creative: z.record(z.any()).optional()
  }).optional(),
  budget: z.object({
    total: z.number().positive().optional(),
    by_channel: z.record(z.number().positive()).optional()
  }).optional(),
  rules: z.object({
    inventory_threshold: z.number().optional(),
    weather_based: z.boolean().optional(),
    time_sensitive: z.boolean().optional(),
    personalization_level: z.enum(['basic', 'advanced', 'ai_driven']).optional()
  }).optional(),
  ab_test: z.object({
    enabled: z.boolean(),
    variants: z.array(z.object({
      name: z.string(),
      percentage: z.number().min(0).max(100),
      modifications: z.record(z.any())
    })).optional()
  }).optional()
});

export class CampaignAutomationService {
  private campaignQueue: Queue;
  private executionQueue: Queue;
  private attributionQueue: Queue;

  constructor() {
    this.campaignQueue = new Queue('campaigns', { connection: redis.duplicate() });
    this.executionQueue = new Queue('campaign-executions', { connection: redis.duplicate() });
    this.attributionQueue = new Queue('attribution', { connection: redis.duplicate() });
  }

  async createCampaign(data: z.infer<typeof createCampaignSchema>, userId: string) {
    try {
      // Validate input
      const validated = createCampaignSchema.parse(data);
      
      // Start performance tracking
      const perfTracker = performanceTracker.startOperation('campaign_creation');
      
      // Begin transaction
      const trx = await database.transaction();
      
      try {
        // Check inventory if product-based campaign
        if (validated.product_id) {
          const inventory = await shopifyService.getInventoryLevel(validated.product_id);
          if (inventory < (validated.rules?.inventory_threshold || 100)) {
            throw new Error(`Insufficient inventory for product ${validated.product_id}: ${inventory} units available`);
          }
        }
        
        // Get target audience size
        const audienceSize = await this.calculateAudienceSize(validated.segments);
        
        // Estimate costs
        const costEstimate = await this.estimateCampaignCost(validated, audienceSize);
        
        // Create campaign record
        const campaign = await trx('campaigns').insert({
          id: uuidv4(),
          name: validated.name,
          type: validated.type,
          status: 'draft',
          channels: validated.channels,
          start_date: this.parseScheduleDate(validated.schedule.launch),
          target_audience: {
            segments: validated.segments,
            estimated_size: audienceSize,
            filters: []
          },
          content: validated.content || {},
          rules: validated.rules || {},
          budget: costEstimate.total,
          ab_test_config: validated.ab_test?.enabled ? validated.ab_test : null,
          created_by: userId,
          created_at: new Date(),
          updated_at: new Date()
        }).returning('*');
        
        // Schedule campaign phases
        const phases = this.buildCampaignPhases(campaign[0], validated.schedule);
        
        for (const phase of phases) {
          await this.campaignQueue.add(
            `campaign:${phase.type}`,
            {
              campaignId: campaign[0].id,
              phase: phase.type,
              scheduledFor: phase.date
            },
            {
              delay: phase.date.getTime() - Date.now(),
              removeOnComplete: {
                age: 24 * 3600,
                count: 100
              },
              removeOnFail: {
                age: 7 * 24 * 3600,
                count: 1000
              }
            }
          );
        }
        
        // Set up real-time monitoring
        await this.setupCampaignMonitoring(campaign[0].id);
        
        // Track campaign creation
        await segmentService.track({
          userId,
          event: 'Campaign Created',
          properties: {
            campaignId: campaign[0].id,
            campaignType: validated.type,
            channels: validated.channels,
            estimatedReach: audienceSize,
            estimatedCost: costEstimate.total
          }
        });
        
        // Commit transaction
        await trx.commit();
        
        // End performance tracking
        perfTracker.end({ 
          campaignId: campaign[0].id,
          audienceSize 
        });
        
        logger.info('Campaign created successfully', {
          campaignId: campaign[0].id,
          type: validated.type,
          channels: validated.channels,
          audienceSize,
          phases: phases.length
        });
        
        return campaign[0];
        
      } catch (error) {
        await trx.rollback();
        throw error;
      }
      
    } catch (error) {
      logger.error('Failed to create campaign', { error, data });
      throw error;
    }
  }

  async executeCampaignPhase(campaignId: string, phase: string) {
    const perfTracker = performanceTracker.startOperation('campaign_execution');
    
    try {
      // Get campaign details
      const campaign = await database('campaigns')
        .where('id', campaignId)
        .first();
        
      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }
      
      // Update campaign status
      await database('campaigns')
        .where('id', campaignId)
        .update({
          status: 'active',
          updated_at: new Date()
        });
      
      // Get target customers
      const customers = await this.getTargetCustomers(campaign);
      
      logger.info(`Executing campaign phase: ${phase}`, {
        campaignId,
        customerCount: customers.length,
        channels: campaign.channels
      });
      
      // Execute by channel
      const executionPromises = [];
      
      for (const channel of campaign.channels) {
        executionPromises.push(
          this.executeChannelCampaign(campaign, channel, customers, phase)
        );
      }
      
      // Wait for all channels to complete
      const results = await Promise.allSettled(executionPromises);
      
      // Record execution results
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;
      
      // Update campaign metrics
      await this.updateCampaignMetrics(campaignId, {
        [`${phase}_executed_at`]: new Date(),
        [`${phase}_success_count`]: successCount,
        [`${phase}_failure_count`]: failureCount
      });
      
      perfTracker.end({
        campaignId,
        phase,
        customersReached: customers.length,
        channelsExecuted: successCount
      });
      
      return {
        success: successCount,
        failed: failureCount,
        total: campaign.channels.length
      };
      
    } catch (error) {
      perfTracker.error(error);
      logger.error('Campaign execution failed', { campaignId, phase, error });
      throw error;
    }
  }

  private async executeChannelCampaign(
    campaign: Campaign,
    channel: string,
    customers: Customer[],
    phase: string
  ) {
    const batchSize = this.getChannelBatchSize(channel);
    const batches = this.chunkArray(customers, batchSize);
    
    logger.info(`Executing ${channel} campaign in ${batches.length} batches`, {
      campaignId: campaign.id,
      totalCustomers: customers.length,
      batchSize
    });
    
    for (const [index, batch] of batches.entries()) {
      await this.executionQueue.add(
        `execute:${channel}`,
        {
          campaignId: campaign.id,
          channel,
          customers: batch,
          phase,
          batchIndex: index,
          totalBatches: batches.length,
          content: campaign.content,
          abTestConfig: campaign.ab_test_config
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          },
          removeOnComplete: {
            age: 24 * 3600
          }
        }
      );
    }
  }

  private async getTargetCustomers(campaign: Campaign): Promise<Customer[]> {
    const query = database('customers')
      .select('*')
      .where('consent_email', true);
    
    // Apply segment filters
    for (const segment of campaign.target_audience.segments) {
      const segmentCustomers = await database('segment_members')
        .select('customer_id')
        .where('segment_id', segment)
        .whereNull('removed_at');
        
      query.whereIn('id', segmentCustomers.map(s => s.customer_id));
    }
    
    // Apply custom filters
    if (campaign.target_audience.filters?.min_lifetime_value) {
      query.where('lifetime_value', '>=', campaign.target_audience.filters.min_lifetime_value);
    }
    
    if (campaign.target_audience.filters?.last_purchase_days) {
      const date = new Date();
      date.setDate(date.getDate() - campaign.target_audience.filters.last_purchase_days);
      query.where('last_purchase_date', '>=', date);
    }
    
    // Apply ML predictions
    if (campaign.rules.use_churn_prediction) {
      const churnRisk = await mlService.getChurnRiskCustomers();
      query.whereIn('id', churnRisk);
    }
    
    return query;
  }

  private async calculateAudienceSize(segments: string[]): Promise<number> {
    const counts = await database('segment_members')
      .count('distinct customer_id as count')
      .whereIn('segment_id', segments)
      .whereNull('removed_at')
      .first();
      
    return parseInt(counts?.count || '0');
  }

  private async estimateCampaignCost(
    campaign: z.infer<typeof createCampaignSchema>,
    audienceSize: number
  ): Promise<{ total: number; byChannel: Record<string, number> }> {
    const costs: Record<string, number> = {};
    let total = 0;
    
    // Email cost: $0.001 per send
    if (campaign.channels.includes('email')) {
      costs.email = audienceSize * 0.001;
    }
    
    // SMS cost: $0.01 per send
    if (campaign.channels.includes('sms')) {
      costs.sms = audienceSize * 0.01;
    }
    
    // Facebook ads: Estimate based on CPM
    if (campaign.channels.includes('facebook')) {
      const estimatedImpressions = audienceSize * 10; // Assume 10x reach
      costs.facebook = (estimatedImpressions / 1000) * 15; // $15 CPM
    }
    
    // Google ads: Estimate based on CPC
    if (campaign.channels.includes('google')) {
      const estimatedClicks = audienceSize * 0.02; // 2% CTR
      costs.google = estimatedClicks * 2.5; // $2.50 CPC
    }
    
    // Apply budget constraints
    if (campaign.budget?.by_channel) {
      for (const [channel, budget] of Object.entries(campaign.budget.by_channel)) {
        if (costs[channel] && costs[channel] > budget) {
          costs[channel] = budget;
        }
      }
    }
    
    total = Object.values(costs).reduce((sum, cost) => sum + cost, 0);
    
    if (campaign.budget?.total && total > campaign.budget.total) {
      // Scale down proportionally
      const scale = campaign.budget.total / total;
      for (const channel in costs) {
        costs[channel] *= scale;
      }
      total = campaign.budget.total;
    }
    
    return { total, byChannel: costs };
  }

  private buildCampaignPhases(campaign: Campaign, schedule: any) {
    const phases = [];
    const launchDate = new Date(schedule.launch);
    
    if (schedule.announcement) {
      const announcementDate = this.calculatePhaseDate(launchDate, schedule.announcement);
      phases.push({
        type: 'announcement',
        date: announcementDate
      });
    }
    
    if (schedule.early_access) {
      const earlyAccessDate = this.calculatePhaseDate(launchDate, schedule.early_access);
      phases.push({
        type: 'early_access',
        date: earlyAccessDate
      });
    }
    
    phases.push({
      type: 'launch',
      date: launchDate
    });
    
    if (schedule.follow_up) {
      const followUpDate = this.calculatePhaseDate(launchDate, schedule.follow_up);
      phases.push({
        type: 'follow_up',
        date: followUpDate
      });
    }
    
    return phases;
  }

  private calculatePhaseDate(baseDate: Date, offset: string): Date {
    const regex = /^([+-])(\d+)([dhm])$/;
    const match = offset.match(regex);
    
    if (!match) {
      throw new Error(`Invalid date offset: ${offset}`);
    }
    
    const [, sign, value, unit] = match;
    const numValue = parseInt(value) * (sign === '-' ? -1 : 1);
    const date = new Date(baseDate);
    
    switch (unit) {
      case 'd':
        date.setDate(date.getDate() + numValue);
        break;
      case 'h':
        date.setHours(date.getHours() + numValue);
        break;
      case 'm':
        date.setMinutes(date.getMinutes() + numValue);
        break;
    }
    
    return date;
  }

  private parseScheduleDate(dateStr: string): Date {
    if (dateStr === '0') {
      return new Date();
    }
    return new Date(dateStr);
  }

  private getChannelBatchSize(channel: string): number {
    const sizes: Record<string, number> = {
      email: 1000,
      sms: 500,
      push: 5000,
      facebook: 2000,
      google: 1000,
      instagram: 2000,
      tiktok: 1000
    };
    return sizes[channel] || 1000;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async setupCampaignMonitoring(campaignId: string) {
    // Set up real-time metrics collection
    await redis.setex(
      `campaign:monitoring:${campaignId}`,
      7 * 24 * 3600, // 7 days
      JSON.stringify({
        startTime: Date.now(),
        channels: {},
        metrics: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          converted: 0,
          revenue: 0
        }
      })
    );
  }

  private async updateCampaignMetrics(campaignId: string, metrics: Record<string, any>) {
    const key = `campaign:monitoring:${campaignId}`;
    const data = await redis.get(key);
    
    if (data) {
      const current = JSON.parse(data);
      const updated = {
        ...current,
        metrics: {
          ...current.metrics,
          ...metrics
        },
        lastUpdated: Date.now()
      };
      
      await redis.setex(key, 7 * 24 * 3600, JSON.stringify(updated));
    }
    
    // Also update in database
    await database('campaigns')
      .where('id', campaignId)
      .update({
        performance_metrics: database.raw('performance_metrics || ?::jsonb', [JSON.stringify(metrics)]),
        updated_at: new Date()
      });
  }

  async getCampaignPerformance(campaignId: string) {
    // Get real-time metrics from Redis
    const realtimeData = await redis.get(`campaign:monitoring:${campaignId}`);
    const realtime = realtimeData ? JSON.parse(realtimeData) : null;
    
    // Get execution data from database
    const executions = await database('campaign_executions')
      .select(
        'channel',
        database.raw('COUNT(*) as total'),
        database.raw('COUNT(delivered_at) as delivered'),
        database.raw('COUNT(opened_at) as opened'),
        database.raw('COUNT(clicked_at) as clicked'),
        database.raw('COUNT(converted_at) as converted'),
        database.raw('SUM(revenue_generated) as revenue'),
        database.raw('SUM(cost) as cost')
      )
      .where('campaign_id', campaignId)
      .groupBy('channel');
    
    // Calculate attribution
    const attribution = await this.calculateAttribution(campaignId);
    
    return {
      realtime,
      byChannel: executions,
      attribution,
      roi: this.calculateROI(executions),
      recommendations: await this.getOptimizationRecommendations(campaignId)
    };
  }

  private async calculateAttribution(campaignId: string) {
    const touchpoints = await database('attribution_touchpoints')
      .select('*')
      .where('campaign_id', campaignId)
      .orderBy('timestamp', 'asc');
    
    // Implement multi-touch attribution
    const model = 'data_driven'; // Could be configurable
    
    switch (model) {
      case 'last_click':
        return this.lastClickAttribution(touchpoints);
      case 'first_click':
        return this.firstClickAttribution(touchpoints);
      case 'linear':
        return this.linearAttribution(touchpoints);
      case 'time_decay':
        return this.timeDecayAttribution(touchpoints);
      case 'data_driven':
        return this.dataDrivenAttribution(touchpoints);
      default:
        return this.linearAttribution(touchpoints);
    }
  }

  private calculateROI(executions: any[]) {
    const totalRevenue = executions.reduce((sum, e) => sum + parseFloat(e.revenue || 0), 0);
    const totalCost = executions.reduce((sum, e) => sum + parseFloat(e.cost || 0), 0);
    
    if (totalCost === 0) return 0;
    
    return ((totalRevenue - totalCost) / totalCost) * 100;
  }

  private async getOptimizationRecommendations(campaignId: string) {
    const recommendations = [];
    
    // Analyze performance metrics
    const metrics = await this.getCampaignMetrics(campaignId);
    
    // Low open rate
    if (metrics.openRate < 0.15) {
      recommendations.push({
        type: 'subject_line',
        priority: 'high',
        message: 'Consider A/B testing subject lines - current open rate is below 15%',
        action: 'Enable subject line testing'
      });
    }
    
    // High unsubscribe rate
    if (metrics.unsubscribeRate > 0.02) {
      recommendations.push({
        type: 'frequency',
        priority: 'high',
        message: 'High unsubscribe rate detected - consider reducing send frequency',
        action: 'Adjust campaign frequency'
      });
    }
    
    // Poor mobile performance
    if (metrics.mobileRate < 0.5 && metrics.mobileConversionRate < metrics.desktopConversionRate * 0.7) {
      recommendations.push({
        type: 'mobile_optimization',
        priority: 'medium',
        message: 'Mobile conversion rate is significantly lower than desktop',
        action: 'Optimize for mobile devices'
      });
    }
    
    return recommendations;
  }

  private async getCampaignMetrics(campaignId: string) {
    const stats = await database('campaign_executions')
      .select(
        database.raw('COUNT(*) as total'),
        database.raw('COUNT(opened_at) as opened'),
        database.raw('COUNT(clicked_at) as clicked'),
        database.raw('COUNT(converted_at) as converted'),
        database.raw('COUNT(unsubscribed_at) as unsubscribed')
      )
      .where('campaign_id', campaignId)
      .first();
    
    return {
      openRate: stats.total > 0 ? stats.opened / stats.total : 0,
      clickRate: stats.opened > 0 ? stats.clicked / stats.opened : 0,
      conversionRate: stats.clicked > 0 ? stats.converted / stats.clicked : 0,
      unsubscribeRate: stats.total > 0 ? stats.unsubscribed / stats.total : 0,
      mobileRate: 0.6, // Would need to track device type
      mobileConversionRate: 0.02,
      desktopConversionRate: 0.03
    };
  }

  // Attribution models
  private lastClickAttribution(touchpoints: any[]) {
    const attribution: Record<string, number> = {};
    
    for (const order of this.groupByOrder(touchpoints)) {
      const lastTouch = order[order.length - 1];
      attribution[lastTouch.channel] = (attribution[lastTouch.channel] || 0) + 1;
    }
    
    return attribution;
  }

  private firstClickAttribution(touchpoints: any[]) {
    const attribution: Record<string, number> = {};
    
    for (const order of this.groupByOrder(touchpoints)) {
      const firstTouch = order[0];
      attribution[firstTouch.channel] = (attribution[firstTouch.channel] || 0) + 1;
    }
    
    return attribution;
  }

  private linearAttribution(touchpoints: any[]) {
    const attribution: Record<string, number> = {};
    
    for (const order of this.groupByOrder(touchpoints)) {
      const credit = 1 / order.length;
      for (const touch of order) {
        attribution[touch.channel] = (attribution[touch.channel] || 0) + credit;
      }
    }
    
    return attribution;
  }

  private timeDecayAttribution(touchpoints: any[]) {
    const attribution: Record<string, number> = {};
    const halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    for (const order of this.groupByOrder(touchpoints)) {
      const conversionTime = new Date(order[order.length - 1].timestamp).getTime();
      let totalWeight = 0;
      const weights: number[] = [];
      
      // Calculate weights
      for (const touch of order) {
        const touchTime = new Date(touch.timestamp).getTime();
        const timeDiff = conversionTime - touchTime;
        const weight = Math.pow(2, -timeDiff / halfLife);
        weights.push(weight);
        totalWeight += weight;
      }
      
      // Distribute credit
      for (let i = 0; i < order.length; i++) {
        const credit = weights[i] / totalWeight;
        attribution[order[i].channel] = (attribution[order[i].channel] || 0) + credit;
      }
    }
    
    return attribution;
  }

  private dataDrivenAttribution(touchpoints: any[]) {
    // This would use ML models trained on historical data
    // For now, fall back to time decay
    return this.timeDecayAttribution(touchpoints);
  }

  private groupByOrder(touchpoints: any[]) {
    const groups: Record<string, any[]> = {};
    
    for (const touchpoint of touchpoints) {
      if (!groups[touchpoint.order_id]) {
        groups[touchpoint.order_id] = [];
      }
      groups[touchpoint.order_id].push(touchpoint);
    }
    
    return Object.values(groups);
  }
}

export const campaignAutomation = new CampaignAutomationService();