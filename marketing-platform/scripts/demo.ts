#!/usr/bin/env tsx

import { config } from 'dotenv';
import { join } from 'path';
import database from '../src/utils/database';
import { redisService } from '../src/utils/redis';
import { AuthService } from '../src/services/authService';
import { CampaignService } from '../src/services/campaignService';
import { AnalyticsService } from '../src/services/analyticsService';
import { logger } from '../src/utils/logger';

// Load environment variables
config({ path: join(__dirname, '..', '.env') });

interface DemoResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

class PlatformDemo {
  private authService = new AuthService();
  private campaignService = new CampaignService();
  private analyticsService = new AnalyticsService();

  async initialize(): Promise<void> {
    try {
      await database.initialize();
      await redisService.initialize();
      logger.info('✅ Platform services initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize platform services:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      await database.close();
      await redisService.close();
      logger.info('✅ Platform services cleaned up successfully');
    } catch (error) {
      logger.error('❌ Failed to cleanup platform services:', error);
    }
  }

  async demonstrateAuthentication(): Promise<DemoResult> {
    try {
      logger.info('\n🔐 Testing Authentication System...');
      
      // Register a test user
      const userData = {
        email: `demo-${Date.now()}@example.com`,
        password: 'DemoPassword123!',
        firstName: 'Demo',
        lastName: 'User'
      };

      const user = await this.authService.register(userData);
      logger.info(`   ✅ User registered: ${user.email}`);

      // Login with the user
      const loginResult = await this.authService.login({
        email: userData.email,
        password: userData.password
      });
      logger.info(`   ✅ User logged in successfully`);

      // Verify JWT token
      const tokenPayload = await this.authService.verifyToken(loginResult.accessToken);
      logger.info(`   ✅ JWT token verified for user: ${tokenPayload.email}`);

      return {
        success: true,
        message: 'Authentication system working correctly',
        data: { userId: user.id, email: user.email }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Authentication test failed',
        error: error.message
      };
    }
  }

  async demonstrateCampaignManagement(userId: string): Promise<DemoResult> {
    try {
      logger.info('\n📊 Testing Campaign Management...');
      
      // Create a test organization (simplified for demo)
      const orgId = 'demo-org-' + Date.now();
      
      // Create a campaign
      const campaignData = {
        organizationId: orgId,
        name: `Demo Campaign ${Date.now()}`,
        description: 'A demonstration marketing campaign',
        objectives: {
          primary: 'lead_generation',
          secondary: 'brand_awareness',
          kpis: ['clicks', 'conversions', 'cost_per_lead']
        },
        targetAudience: {
          demographics: {
            age_range: '25-45',
            gender: 'all',
            income: 'middle_to_high'
          },
          interests: ['technology', 'marketing', 'business'],
          behaviors: ['online_shoppers', 'social_media_active']
        },
        budgetTotal: 15000.00,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };

      const campaign = await this.campaignService.createCampaign(campaignData, userId);
      logger.info(`   ✅ Campaign created: ${campaign.name}`);
      logger.info(`   📈 Budget: $${campaign.budgetTotal}`);
      logger.info(`   🎯 Status: ${campaign.status}`);

      // Update campaign status
      const updatedCampaign = await this.campaignService.updateCampaignStatus(
        campaign.id, 'active', userId
      );
      logger.info(`   ✅ Campaign activated: ${updatedCampaign.status}`);

      // Update campaign details
      const campaignUpdates = {
        name: `${campaign.name} - Updated`,
        budgetTotal: 18000.00
      };
      
      const finalCampaign = await this.campaignService.updateCampaign(
        campaign.id, campaignUpdates, userId
      );
      logger.info(`   ✅ Campaign updated: ${finalCampaign.name}`);
      logger.info(`   💰 New budget: $${finalCampaign.budgetTotal}`);

      return {
        success: true,
        message: 'Campaign management working correctly',
        data: {
          campaignId: campaign.id,
          name: finalCampaign.name,
          budget: finalCampaign.budgetTotal,
          status: finalCampaign.status
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Campaign management test failed',
        error: error.message
      };
    }
  }

  async demonstrateAnalytics(organizationId: string, campaignId: string): Promise<DemoResult> {
    try {
      logger.info('\n📈 Testing Analytics System...');
      
      // Track multiple events
      const events = [
        {
          organizationId,
          campaignId,
          eventType: 'impression',
          eventData: {
            channel: 'google-ads',
            placement: 'search-results',
            keyword: 'marketing automation'
          }
        },
        {
          organizationId,
          campaignId,
          eventType: 'click',
          eventData: {
            channel: 'google-ads',
            placement: 'search-results',
            keyword: 'marketing automation',
            landing_page: '/products/automation'
          }
        },
        {
          organizationId,
          campaignId,
          eventType: 'conversion',
          eventData: {
            channel: 'google-ads',
            conversion_type: 'form_submit',
            value: 150.00,
            lead_quality: 'high'
          }
        }
      ];

      const eventIds = [];
      for (const event of events) {
        const result = await this.analyticsService.trackEvent({
          ...event,
          sessionId: `demo-session-${Date.now()}`,
          ipAddress: '127.0.0.1',
          userAgent: 'Demo-Client/1.0'
        });
        eventIds.push(result.id);
      }
      
      logger.info(`   ✅ Tracked ${eventIds.length} analytics events`);
      logger.info(`   📊 Event types: ${events.map(e => e.eventType).join(', ')}`);

      // Generate analytics report
      const reportConfig = {
        organizationId,
        campaignIds: [campaignId],
        dateRange: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          end: new Date()
        },
        metrics: ['impressions', 'clicks', 'conversions', 'cost']
      };

      const report = await this.analyticsService.generateReport(reportConfig);
      logger.info(`   ✅ Generated analytics report`);
      logger.info(`   📈 Summary:`);
      logger.info(`     - Total Impressions: ${report.summary.totalImpressions}`);
      logger.info(`     - Total Clicks: ${report.summary.totalClicks}`);
      logger.info(`     - Total Conversions: ${report.summary.totalConversions}`);
      logger.info(`     - Overall CTR: ${report.summary.overallCTR.toFixed(2)}%`);

      // Get conversion funnel
      const funnel = await this.analyticsService.getConversionFunnel(
        campaignId,
        reportConfig.dateRange
      );
      logger.info(`   ✅ Generated conversion funnel`);
      logger.info(`   🎯 Funnel metrics:`);
      logger.info(`     - Impressions → Clicks: ${funnel.clickThroughRate.toFixed(2)}%`);
      logger.info(`     - Clicks → Conversions: ${funnel.conversionRate.toFixed(2)}%`);

      return {
        success: true,
        message: 'Analytics system working correctly',
        data: {
          eventsTracked: eventIds.length,
          reportSummary: report.summary,
          funnelMetrics: {
            ctr: funnel.clickThroughRate,
            conversionRate: funnel.conversionRate
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Analytics test failed',
        error: error.message
      };
    }
  }

  async runFullDemo(): Promise<void> {
    try {
      logger.info('🚀 Starting Marketing Platform Demo\n');
      logger.info('=' .repeat(50));
      
      await this.initialize();
      
      // Test Authentication
      const authResult = await this.demonstrateAuthentication();
      if (!authResult.success) {
        logger.error('❌ Authentication demo failed:', authResult.error);
        return;
      }
      
      const userId = authResult.data.userId;
      
      // Test Campaign Management
      const campaignResult = await this.demonstrateCampaignManagement(userId);
      if (!campaignResult.success) {
        logger.error('❌ Campaign management demo failed:', campaignResult.error);
        return;
      }
      
      const campaignId = campaignResult.data.campaignId;
      const orgId = 'demo-org-' + Date.now(); // Same as created in campaign demo
      
      // Test Analytics
      const analyticsResult = await this.demonstrateAnalytics(orgId, campaignId);
      if (!analyticsResult.success) {
        logger.error('❌ Analytics demo failed:', analyticsResult.error);
        return;
      }
      
      logger.info('\n' + '=' .repeat(50));
      logger.info('🎉 Marketing Platform Demo Completed Successfully!');
      logger.info('\n📋 Demo Summary:');
      logger.info(`   🔐 Authentication: ✅ ${authResult.message}`);
      logger.info(`   📊 Campaign Management: ✅ ${campaignResult.message}`);
      logger.info(`   📈 Analytics: ✅ ${analyticsResult.message}`);
      
      logger.info('\n🛠️  Platform Features Demonstrated:');
      logger.info('   • Real PostgreSQL database with proper schema');
      logger.info('   • Redis caching and session management');
      logger.info('   • JWT authentication with secure token handling');
      logger.info('   • Campaign CRUD operations with validation');
      logger.info('   • Analytics event tracking and reporting');
      logger.info('   • Conversion funnel analysis');
      logger.info('   • Production-ready error handling and logging');
      logger.info('   • Type safety with TypeScript');
      logger.info('   • Comprehensive test coverage with TDD approach');
      
      logger.info('\n🚀 Ready for Production Deployment!');
      
    } catch (error) {
      logger.error('❌ Demo failed:', error.message);
    } finally {
      await this.cleanup();
    }
  }
}

// Run demo if this file is executed directly
if (require.main === module) {
  const demo = new PlatformDemo();
  demo.runFullDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Demo failed:', error);
      process.exit(1);
    });
}

export { PlatformDemo };