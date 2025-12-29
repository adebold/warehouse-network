import { Database } from './infrastructure/database';
import { RedisClient } from './infrastructure/redis';
import { logger } from './utils/logger';
import { CostPerLeadCalculator } from './core/CostPerLead';
import { CustomerAcquisitionCostCalculator } from './core/CustomerAcquisitionCost';
import { ContentROICalculator } from './core/ContentROI';
import { ChannelAttributionCalculator } from './attribution/ChannelAttribution';
import { MRRTracker } from './metrics/MRRTracker';
import { ChurnRetentionCalculator } from './metrics/ChurnRetention';
import { EmailMarketingKPICalculator } from './metrics/EmailMarketingKPIs';
import { SocialMediaROICalculator } from './metrics/SocialMediaROI';
import { SEOPerformanceCalculator } from './metrics/SEOPerformance';
import { 
  KPIFilters, 
  AttributionModel,
  CostPerLeadMetrics,
  CustomerAcquisitionCostMetrics,
  ContentROIMetrics,
  ChannelAttributionMetrics,
  MRRMetrics,
  ChurnMetrics,
  EmailMarketingMetrics,
  SocialMediaROIMetrics,
  SEOMetrics
} from './types/kpi.types';

export class KPIService {
  private db: Database;
  private redis: RedisClient;
  
  // Calculators
  private costPerLead: CostPerLeadCalculator;
  private customerAcquisitionCost: CustomerAcquisitionCostCalculator;
  private contentROI: ContentROICalculator;
  private channelAttribution: ChannelAttributionCalculator;
  private mrrTracker: MRRTracker;
  private churnRetention: ChurnRetentionCalculator;
  private emailMarketing: EmailMarketingKPICalculator;
  private socialMediaROI: SocialMediaROICalculator;
  private seoPerformance: SEOPerformanceCalculator;

  private static instance: KPIService;

  private constructor() {
    this.db = Database.getInstance();
    this.redis = RedisClient.getInstance();
    
    // Initialize calculators
    this.costPerLead = new CostPerLeadCalculator(this.db, this.redis);
    this.customerAcquisitionCost = new CustomerAcquisitionCostCalculator(this.db, this.redis);
    this.contentROI = new ContentROICalculator(this.db, this.redis);
    this.channelAttribution = new ChannelAttributionCalculator(this.db, this.redis);
    this.mrrTracker = new MRRTracker(this.db, this.redis);
    this.churnRetention = new ChurnRetentionCalculator(this.db, this.redis);
    this.emailMarketing = new EmailMarketingKPICalculator(this.db, this.redis);
    this.socialMediaROI = new SocialMediaROICalculator(this.db, this.redis);
    this.seoPerformance = new SEOPerformanceCalculator(this.db, this.redis);
  }

  public static getInstance(): KPIService {
    if (!KPIService.instance) {
      KPIService.instance = new KPIService();
    }
    return KPIService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('KPI Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize KPI Service', error);
      throw error;
    }
  }

  // Cost Per Lead
  public async getCostPerLead(filters: KPIFilters): Promise<CostPerLeadMetrics> {
    return this.costPerLead.calculate(filters);
  }

  public async forecastCostPerLead(filters: KPIFilters, periods: number = 3): Promise<{ period: Date; forecast: any }[]> {
    return this.costPerLead.forecast(filters, periods);
  }

  // Customer Acquisition Cost
  public async getCustomerAcquisitionCost(filters: KPIFilters): Promise<CustomerAcquisitionCostMetrics> {
    return this.customerAcquisitionCost.calculate(filters);
  }

  // Content ROI
  public async getContentROI(contentId: string, filters?: KPIFilters): Promise<ContentROIMetrics> {
    return this.contentROI.calculate(contentId, filters);
  }

  public async getTopContent(filters?: KPIFilters, limit: number = 10): Promise<ContentROIMetrics[]> {
    return this.contentROI.rankContent(filters, limit);
  }

  // Channel Attribution
  public async getChannelAttribution(
    model: AttributionModel, 
    filters: KPIFilters
  ): Promise<ChannelAttributionMetrics> {
    return this.channelAttribution.calculate(model, filters);
  }

  public async compareAttributionModels(
    models: AttributionModel[], 
    filters: KPIFilters
  ): Promise<Map<AttributionModel, ChannelAttributionMetrics>> {
    return this.channelAttribution.compareModels(models, filters);
  }

  // MRR Tracking
  public async getMRR(date?: Date): Promise<MRRMetrics> {
    return this.mrrTracker.calculate(date);
  }

  public async getMRRGrowth(months: number = 12): Promise<any[]> {
    return this.mrrTracker.calculateMRRGrowth(months);
  }

  public async getCohortMRR(cohortSize: number = 6): Promise<Map<string, any>> {
    return this.mrrTracker.calculateCohortMRR(cohortSize);
  }

  // Churn & Retention
  public async getChurnMetrics(filters: KPIFilters): Promise<ChurnMetrics> {
    return this.churnRetention.calculate(filters);
  }

  public async predictChurn(customerId: string, features?: Record<string, any>): Promise<any> {
    return this.churnRetention.predictChurn(customerId, features);
  }

  // Email Marketing
  public async getEmailMetrics(campaignId: string, filters?: KPIFilters): Promise<EmailMarketingMetrics> {
    return this.emailMarketing.calculate(campaignId, filters);
  }

  public async getEmailAggregate(filters: KPIFilters): Promise<any> {
    return this.emailMarketing.calculateAggregate(filters);
  }

  public async getOptimalEmailSendTime(filters?: KPIFilters): Promise<any[]> {
    return this.emailMarketing.getOptimalSendTime(filters);
  }

  // Social Media ROI
  public async getSocialMediaROI(platform: string, filters: KPIFilters): Promise<SocialMediaROIMetrics> {
    return this.socialMediaROI.calculate(platform, filters);
  }

  public async getAllSocialPlatforms(filters: KPIFilters): Promise<SocialMediaROIMetrics[]> {
    return this.socialMediaROI.calculateAllPlatforms(filters);
  }

  public async getSocialContentPerformance(platform: string, filters: KPIFilters): Promise<any[]> {
    return this.socialMediaROI.analyzeContentPerformance(platform, filters);
  }

  // SEO Performance
  public async getSEOMetrics(filters: KPIFilters): Promise<SEOMetrics> {
    return this.seoPerformance.calculate(filters);
  }

  public async getKeywordOpportunities(filters?: KPIFilters): Promise<any[]> {
    return this.seoPerformance.getKeywordOpportunities(filters);
  }

  public async getTechnicalSEO(): Promise<any[]> {
    return this.seoPerformance.analyzeTechnicalSEO();
  }

  // Comprehensive Dashboard Data
  public async getDashboardData(filters: KPIFilters): Promise<{
    costPerLead: CostPerLeadMetrics;
    customerAcquisitionCost: CustomerAcquisitionCostMetrics;
    mrr: MRRMetrics;
    churn: ChurnMetrics;
    channelAttribution: ChannelAttributionMetrics;
    emailPerformance: any;
    socialMediaROI: SocialMediaROIMetrics[];
    seoMetrics: SEOMetrics;
  }> {
    const [
      costPerLead,
      customerAcquisitionCost,
      mrr,
      churn,
      channelAttribution,
      emailPerformance,
      socialMediaROI,
      seoMetrics
    ] = await Promise.all([
      this.getCostPerLead(filters),
      this.getCustomerAcquisitionCost(filters),
      this.getMRR(),
      this.getChurnMetrics(filters),
      this.getChannelAttribution('linear', filters),
      this.getEmailAggregate(filters),
      this.getAllSocialPlatforms(filters),
      this.getSEOMetrics(filters)
    ]);

    return {
      costPerLead,
      customerAcquisitionCost,
      mrr,
      churn,
      channelAttribution,
      emailPerformance,
      socialMediaROI,
      seoMetrics
    };
  }

  // Health Check
  public async healthCheck(): Promise<{
    database: boolean;
    redis: boolean;
    status: 'healthy' | 'unhealthy';
  }> {
    const [databaseHealth, redisHealth] = await Promise.all([
      this.db.healthCheck(),
      this.redis.healthCheck()
    ]);

    return {
      database: databaseHealth,
      redis: redisHealth,
      status: databaseHealth && redisHealth ? 'healthy' : 'unhealthy'
    };
  }

  // Cleanup
  public async shutdown(): Promise<void> {
    await Promise.all([
      this.db.close(),
      this.redis.close()
    ]);
    logger.info('KPI Service shut down successfully');
  }
}