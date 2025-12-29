import { GoogleAdsApi, Customer, Campaign, AdGroup, Ad, Keyword, enums } from 'google-ads-api';
import { Decimal } from 'decimal.js';
import { Logger } from 'winston';
import { Pool } from 'pg';
import Redis from 'ioredis';
import {
  ChannelType,
  ChannelConfig,
  ChannelCredentials,
  ChannelResponse,
  PostContent,
  PostResult,
  ScheduleOptions,
  AnalyticsData,
  ChannelError
} from '@marketing-engine/core/interfaces/channel.interface';
import { BaseChannelAdapter } from '@marketing-engine/shared/adapters/base-channel.adapter';

interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
}

interface CampaignData {
  name: string;
  budget: number;
  biddingStrategy: string;
  targetLocations?: string[];
  targetLanguages?: string[];
  startDate?: Date;
  endDate?: Date;
}

interface AdData {
  headlines: string[];
  descriptions: string[];
  finalUrls: string[];
  path1?: string;
  path2?: string;
}

export class GoogleAdsAdapter extends BaseChannelAdapter {
  readonly channelType = ChannelType.GOOGLE_ADS;
  private client?: GoogleAdsApi;
  private customer?: Customer;
  private config: GoogleAdsConfig;

  constructor(
    channelConfig: ChannelConfig,
    logger: Logger,
    db: Pool,
    redis: Redis
  ) {
    super(channelConfig, logger, db, redis);

    this.config = {
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refreshToken: channelConfig.credentials.refreshToken || process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      customerId: channelConfig.credentials.additionalData?.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID!
    };

    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    try {
      this.client = new GoogleAdsApi({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        developer_token: this.config.developerToken
      });

      this.customer = this.client.Customer({
        customer_id: this.config.customerId,
        refresh_token: this.config.refreshToken
      });
    } catch (error) {
      this.logger.error('Failed to initialize Google Ads client', error);
      throw error;
    }
  }

  async authenticate(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    try {
      // Verify the credentials work by making a simple API call
      const customerResource = await this.customer!.query(`
        SELECT customer.id, customer.descriptive_name
        FROM customer
        LIMIT 1
      `);

      if (!customerResource || customerResource.length === 0) {
        throw new Error('Unable to access customer account');
      }

      const updatedCredentials: ChannelCredentials = {
        ...credentials,
        channelType: ChannelType.GOOGLE_ADS,
        refreshToken: this.config.refreshToken,
        additionalData: {
          ...credentials.additionalData,
          customerId: this.config.customerId,
          accountName: customerResource[0].customer?.descriptive_name
        }
      };

      return {
        success: true,
        data: updatedCredentials
      };
    } catch (error: any) {
      this.logger.error('Google Ads authentication failed', error);
      return {
        success: false,
        error: this.createError(
          'AUTH_FAILED',
          'Failed to authenticate with Google Ads',
          error.message,
          false
        )
      };
    }
  }

  async refreshCredentials(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Google Ads uses refresh tokens that don't expire
    // Just validate that the current refresh token still works
    return this.authenticate(credentials);
  }

  protected async performCredentialValidation(credentials: ChannelCredentials): Promise<boolean> {
    try {
      const result = await this.customer!.query(`
        SELECT customer.id
        FROM customer
        LIMIT 1
      `);
      return result.length > 0;
    } catch (error) {
      return false;
    }
  }

  protected async performCreatePost(
    content: PostContent,
    options?: ScheduleOptions
  ): Promise<ChannelResponse<PostResult>> {
    try {
      // In Google Ads context, a "post" is an ad
      // Extract campaign and ad group info from metadata
      const campaignId = content.metadata?.campaignId;
      const adGroupId = content.metadata?.adGroupId;

      if (!campaignId || !adGroupId) {
        // Create a new campaign and ad group if not provided
        const campaignResult = await this.createCampaign(content.metadata?.campaign || {
          name: `Campaign_${Date.now()}`,
          budget: 100, // Default $100 daily budget
          biddingStrategy: 'MAXIMIZE_CLICKS'
        });

        if (!campaignResult.success) {
          return campaignResult as ChannelResponse<PostResult>;
        }

        const adGroupResult = await this.createAdGroup(
          campaignResult.data!.id,
          content.metadata?.adGroup || { name: `AdGroup_${Date.now()}` }
        );

        if (!adGroupResult.success) {
          return adGroupResult as ChannelResponse<PostResult>;
        }

        content.metadata = {
          ...content.metadata,
          campaignId: campaignResult.data!.id,
          adGroupId: adGroupResult.data!.id
        };
      }

      // Create the actual ad
      const adData = this.extractAdData(content);
      const ad = await this.createResponsiveSearchAd(
        content.metadata!.adGroupId,
        adData
      );

      return {
        success: true,
        data: {
          id: ad.resource_name!,
          status: options?.scheduledAt ? 'scheduled' : 'published',
          publishedAt: options?.scheduledAt ? undefined : new Date(),
          scheduledAt: options?.scheduledAt
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create Google Ads ad', error);
      return {
        success: false,
        error: this.createError(
          'AD_CREATION_FAILED',
          'Failed to create Google Ads ad',
          error.errors || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performUpdatePost(
    postId: string,
    content: Partial<PostContent>
  ): Promise<ChannelResponse<PostResult>> {
    try {
      // Update ad text, headlines, or descriptions
      const updates: any = {};
      
      if (content.text) {
        const adData = this.extractAdData({ ...content, text: content.text } as PostContent);
        updates.responsive_search_ad = {
          headlines: adData.headlines.map(h => ({ text: h })),
          descriptions: adData.descriptions.map(d => ({ text: d }))
        };
      }

      await this.customer!.ads.update([{
        resource_name: postId,
        ...updates
      }]);

      return {
        success: true,
        data: {
          id: postId,
          status: 'published',
          publishedAt: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to update Google Ads ad', error);
      return {
        success: false,
        error: this.createError(
          'AD_UPDATE_FAILED',
          'Failed to update Google Ads ad',
          error.errors || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performDeletePost(postId: string): Promise<ChannelResponse<void>> {
    try {
      // In Google Ads, we don't delete ads, we remove them (soft delete)
      await this.customer!.ads.update([{
        resource_name: postId,
        status: enums.AdGroupAdStatus.REMOVED
      }]);

      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to remove Google Ads ad', error);
      return {
        success: false,
        error: this.createError(
          'AD_REMOVAL_FAILED',
          'Failed to remove Google Ads ad',
          error.errors || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performGetPost(postId: string): Promise<ChannelResponse<PostResult>> {
    try {
      const result = await this.customer!.query(`
        SELECT 
          ad_group_ad.ad.id,
          ad_group_ad.ad.name,
          ad_group_ad.status,
          ad_group_ad.ad.responsive_search_ad.headlines,
          ad_group_ad.ad.responsive_search_ad.descriptions
        FROM ad_group_ad
        WHERE ad_group_ad.resource_name = '${postId}'
      `);

      if (result.length === 0) {
        return {
          success: false,
          error: this.createError('NOT_FOUND', 'Ad not found', null, false)
        };
      }

      const ad = result[0];

      return {
        success: true,
        data: {
          id: postId,
          status: this.mapAdStatus(ad.ad_group_ad?.status),
          publishedAt: new Date() // Google Ads doesn't provide creation date in this query
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get Google Ads ad', error);
      return {
        success: false,
        error: this.createError(
          'AD_FETCH_FAILED',
          'Failed to retrieve Google Ads ad',
          error.errors || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performGetAnalytics(
    postId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    try {
      const result = await this.customer!.query(`
        SELECT
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.ctr,
          metrics.average_cpc,
          segments.date
        FROM ad_group_ad
        WHERE ad_group_ad.resource_name = '${postId}'
          AND segments.date >= '${this.formatDate(startDate)}'
          AND segments.date <= '${this.formatDate(endDate)}'
      `);

      const aggregated = this.aggregateMetrics(result);

      return {
        success: true,
        data: {
          impressions: aggregated.impressions,
          clicks: aggregated.clicks,
          engagement: aggregated.clicks, // Google Ads doesn't have separate engagement
          reach: aggregated.impressions, // Approximate reach with impressions
          conversions: aggregated.conversions,
          spend: aggregated.cost,
          customMetrics: {
            ctr: aggregated.ctr,
            averageCpc: aggregated.averageCpc
          },
          timestamp: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get Google Ads analytics', error);
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve Google Ads analytics',
          error.errors || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performGetAccountAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    try {
      const result = await this.customer!.query(`
        SELECT
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.ctr,
          metrics.average_cpc
        FROM customer
        WHERE segments.date >= '${this.formatDate(startDate)}'
          AND segments.date <= '${this.formatDate(endDate)}'
      `);

      const aggregated = this.aggregateMetrics(result);

      return {
        success: true,
        data: {
          impressions: aggregated.impressions,
          clicks: aggregated.clicks,
          engagement: aggregated.clicks,
          reach: aggregated.impressions,
          conversions: aggregated.conversions,
          spend: aggregated.cost,
          customMetrics: {
            ctr: aggregated.ctr,
            averageCpc: aggregated.averageCpc,
            campaignCount: await this.getActiveCampaignCount()
          },
          timestamp: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get Google Ads account analytics', error);
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve Google Ads account analytics',
          error.errors || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async checkAPIHealth(): Promise<{ reachable: boolean; responseTimeMs?: number }> {
    const startTime = Date.now();
    try {
      await this.customer!.query(`
        SELECT customer.id
        FROM customer
        LIMIT 1
      `);
      return {
        reachable: true,
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        reachable: false,
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  protected async validateContent(content: PostContent): Promise<ChannelError | null> {
    // Google Ads specific validation
    const adData = this.extractAdData(content);

    // Validate headlines
    if (adData.headlines.length < 3) {
      return this.createError(
        'INSUFFICIENT_HEADLINES',
        'Google Ads requires at least 3 headlines',
        { minHeadlines: 3, actualHeadlines: adData.headlines.length },
        false
      );
    }

    if (adData.headlines.length > 15) {
      return this.createError(
        'TOO_MANY_HEADLINES',
        'Google Ads allows maximum 15 headlines',
        { maxHeadlines: 15, actualHeadlines: adData.headlines.length },
        false
      );
    }

    // Validate headline length
    for (const headline of adData.headlines) {
      if (headline.length > 30) {
        return this.createError(
          'HEADLINE_TOO_LONG',
          'Headlines cannot exceed 30 characters',
          { maxLength: 30, headline },
          false
        );
      }
    }

    // Validate descriptions
    if (adData.descriptions.length < 2) {
      return this.createError(
        'INSUFFICIENT_DESCRIPTIONS',
        'Google Ads requires at least 2 descriptions',
        { minDescriptions: 2, actualDescriptions: adData.descriptions.length },
        false
      );
    }

    if (adData.descriptions.length > 4) {
      return this.createError(
        'TOO_MANY_DESCRIPTIONS',
        'Google Ads allows maximum 4 descriptions',
        { maxDescriptions: 4, actualDescriptions: adData.descriptions.length },
        false
      );
    }

    // Validate description length
    for (const description of adData.descriptions) {
      if (description.length > 90) {
        return this.createError(
          'DESCRIPTION_TOO_LONG',
          'Descriptions cannot exceed 90 characters',
          { maxLength: 90, description },
          false
        );
      }
    }

    // Validate URLs
    if (!adData.finalUrls || adData.finalUrls.length === 0) {
      return this.createError(
        'MISSING_URL',
        'Google Ads requires at least one final URL',
        null,
        false
      );
    }

    return null;
  }

  // Helper methods
  private async createCampaign(campaignData: CampaignData): Promise<ChannelResponse<{ id: string }>> {
    try {
      const campaign = {
        name: campaignData.name,
        status: enums.CampaignStatus.ENABLED,
        advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
        campaign_budget: await this.createBudget(campaignData.budget),
        bidding_strategy_type: this.mapBiddingStrategy(campaignData.biddingStrategy),
        network_settings: {
          target_google_search: true,
          target_search_network: true,
          target_partner_search_network: false,
          target_content_network: false
        }
      };

      const result = await this.customer!.campaigns.create([campaign]);
      
      return {
        success: true,
        data: { id: result.results[0].resource_name! }
      };
    } catch (error: any) {
      return {
        success: false,
        error: this.createError(
          'CAMPAIGN_CREATION_FAILED',
          'Failed to create campaign',
          error.errors || error.message,
          false
        )
      };
    }
  }

  private async createBudget(dailyBudgetDollars: number): Promise<string> {
    const budget = {
      name: `Budget_${Date.now()}`,
      amount_micros: Math.round(dailyBudgetDollars * 1_000_000),
      delivery_method: enums.BudgetDeliveryMethod.STANDARD
    };

    const result = await this.customer!.campaignBudgets.create([budget]);
    return result.results[0].resource_name!;
  }

  private async createAdGroup(
    campaignId: string,
    adGroupData: { name: string; cpcBidMicros?: number }
  ): Promise<ChannelResponse<{ id: string }>> {
    try {
      const adGroup = {
        campaign: campaignId,
        name: adGroupData.name,
        status: enums.AdGroupStatus.ENABLED,
        cpc_bid_micros: adGroupData.cpcBidMicros || 1_000_000 // Default $1 CPC
      };

      const result = await this.customer!.adGroups.create([adGroup]);
      
      return {
        success: true,
        data: { id: result.results[0].resource_name! }
      };
    } catch (error: any) {
      return {
        success: false,
        error: this.createError(
          'AD_GROUP_CREATION_FAILED',
          'Failed to create ad group',
          error.errors || error.message,
          false
        )
      };
    }
  }

  private async createResponsiveSearchAd(adGroupId: string, adData: AdData): Promise<any> {
    const ad = {
      ad_group: adGroupId,
      ad: {
        responsive_search_ad: {
          headlines: adData.headlines.map(h => ({ text: h })),
          descriptions: adData.descriptions.map(d => ({ text: d })),
          path1: adData.path1,
          path2: adData.path2
        },
        final_urls: adData.finalUrls
      },
      status: enums.AdGroupAdStatus.ENABLED
    };

    const result = await this.customer!.adGroupAds.create([ad]);
    return result.results[0];
  }

  private extractAdData(content: PostContent): AdData {
    // Parse headlines and descriptions from content
    // This is a simplified version - in production, you'd have more sophisticated parsing
    const lines = content.text.split('\n').filter(l => l.trim());
    
    const headlines: string[] = [];
    const descriptions: string[] = [];
    
    // Extract headlines (first 3-15 short lines)
    for (const line of lines) {
      if (line.length <= 30 && headlines.length < 15) {
        headlines.push(line);
      } else if (line.length <= 90 && descriptions.length < 4) {
        descriptions.push(line);
      }
    }

    // Ensure minimum requirements
    while (headlines.length < 3) {
      headlines.push(`${content.metadata?.productName || 'Product'} - Option ${headlines.length + 1}`);
    }

    while (descriptions.length < 2) {
      descriptions.push(`Learn more about ${content.metadata?.productName || 'our offerings'}. ${descriptions.length === 0 ? 'Best prices guaranteed.' : 'Contact us today!'}`);
    }

    return {
      headlines,
      descriptions,
      finalUrls: content.link ? [content.link] : [`https://example.com/${Date.now()}`],
      path1: content.metadata?.path1,
      path2: content.metadata?.path2
    };
  }

  private mapBiddingStrategy(strategy: string): number {
    const strategyMap: Record<string, number> = {
      'MAXIMIZE_CLICKS': enums.BiddingStrategyType.MAXIMIZE_CLICKS,
      'TARGET_CPA': enums.BiddingStrategyType.TARGET_CPA,
      'TARGET_ROAS': enums.BiddingStrategyType.TARGET_ROAS,
      'MAXIMIZE_CONVERSIONS': enums.BiddingStrategyType.MAXIMIZE_CONVERSIONS,
      'MANUAL_CPC': enums.BiddingStrategyType.MANUAL_CPC
    };

    return strategyMap[strategy] || enums.BiddingStrategyType.MAXIMIZE_CLICKS;
  }

  private mapAdStatus(status?: number): 'published' | 'scheduled' | 'draft' | 'failed' {
    switch (status) {
      case enums.AdGroupAdStatus.ENABLED:
        return 'published';
      case enums.AdGroupAdStatus.PAUSED:
        return 'draft';
      case enums.AdGroupAdStatus.REMOVED:
        return 'failed';
      default:
        return 'draft';
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private aggregateMetrics(results: any[]): any {
    return results.reduce((acc, row) => {
      const metrics = row.metrics || {};
      return {
        impressions: acc.impressions + (metrics.impressions || 0),
        clicks: acc.clicks + (metrics.clicks || 0),
        conversions: acc.conversions + (metrics.conversions || 0),
        cost: acc.cost + ((metrics.cost_micros || 0) / 1_000_000),
        ctr: metrics.ctr || 0,
        averageCpc: metrics.average_cpc || 0
      };
    }, {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      cost: 0,
      ctr: 0,
      averageCpc: 0
    });
  }

  private async getActiveCampaignCount(): Promise<number> {
    const result = await this.customer!.query(`
      SELECT COUNT(*) as count
      FROM campaign
      WHERE campaign.status = 'ENABLED'
    `);

    return parseInt(result[0]?.count || '0');
  }

  private isRetryableError(error: any): boolean {
    // Check for specific Google Ads error codes that are retryable
    const retryableErrors = [
      'INTERNAL_ERROR',
      'TRANSIENT_ERROR',
      'RATE_EXCEEDED'
    ];

    if (error.errors) {
      return error.errors.some((e: any) => 
        retryableErrors.includes(e.error_code?.request_error)
      );
    }

    return false;
  }
}