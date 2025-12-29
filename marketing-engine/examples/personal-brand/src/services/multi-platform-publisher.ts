import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { google } from 'googleapis';
import { database } from '../database';
import { redis } from './redis';
import { logger } from './logger';
import { youtubeService } from './platforms/youtube';
import { instagramService } from './platforms/instagram';
import { tiktokService } from './platforms/tiktok';
import { twitterService } from './platforms/twitter';
import { linkedinService } from './platforms/linkedin';
import { aiOptimizer } from './ai-optimizer';
import { analyticsCollector } from './analytics-collector';
import { Content, PlatformAccount, ContentPublication } from '../types';

// Publishing schema
const publishContentSchema = z.object({
  content_id: z.string().uuid(),
  platforms: z.array(z.enum(['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'facebook', 'pinterest', 'twitch', 'threads'])),
  schedule: z.object({
    publish_at: z.string().datetime().optional(),
    timezone: z.string().default('UTC'),
    stagger_minutes: z.number().optional()
  }).optional(),
  optimization: z.object({
    auto_hashtags: z.boolean().default(true),
    auto_captions: z.boolean().default(true),
    platform_specific: z.boolean().default(true),
    ab_testing: z.boolean().default(false)
  }).optional(),
  cross_promotion: z.object({
    enabled: z.boolean().default(true),
    style: z.enum(['native', 'link', 'story']).default('native'),
    delay_minutes: z.number().default(60)
  }).optional()
});

export class MultiPlatformPublisher {
  private publishQueue: Queue;
  private optimizationQueue: Queue;
  private analyticsQueue: Queue;
  private platformServices: Map<string, any>;

  constructor() {
    this.publishQueue = new Queue('content-publishing', { connection: redis.duplicate() });
    this.optimizationQueue = new Queue('content-optimization', { connection: redis.duplicate() });
    this.analyticsQueue = new Queue('analytics-collection', { connection: redis.duplicate() });
    
    // Initialize platform services
    this.platformServices = new Map([
      ['youtube', youtubeService],
      ['instagram', instagramService],
      ['tiktok', tiktokService],
      ['twitter', twitterService],
      ['linkedin', linkedinService]
    ]);
  }

  async publishContent(input: z.infer<typeof publishContentSchema>) {
    try {
      const validated = publishContentSchema.parse(input);
      
      logger.info('Starting multi-platform publish', {
        contentId: validated.content_id,
        platforms: validated.platforms
      });

      // Get content details
      const content = await database('content')
        .where('id', validated.content_id)
        .first();
        
      if (!content) {
        throw new Error(`Content ${validated.content_id} not found`);
      }

      // Get platform accounts
      const accounts = await this.getPlatformAccounts(content.creator_id, validated.platforms);
      
      // Optimize content for each platform
      const optimizedVersions = await this.optimizeForPlatforms(content, validated.platforms, validated.optimization);
      
      // Schedule or publish immediately
      const publications = [];
      
      for (const [index, platform] of validated.platforms.entries()) {
        const account = accounts.find(a => a.platform === platform);
        if (!account) {
          logger.warn(`No account found for platform ${platform}`);
          continue;
        }

        const publishTime = this.calculatePublishTime(
          validated.schedule?.publish_at,
          index,
          validated.schedule?.stagger_minutes
        );

        const publication = await this.schedulePublication({
          content,
          account,
          optimizedContent: optimizedVersions[platform],
          publishTime,
          options: {
            crossPromotion: validated.cross_promotion,
            abTesting: validated.optimization?.ab_testing
          }
        });

        publications.push(publication);
      }

      // Set up cross-promotion if enabled
      if (validated.cross_promotion?.enabled) {
        await this.setupCrossPromotion(content, publications, validated.cross_promotion);
      }

      // Update content status
      await database('content')
        .where('id', content.id)
        .update({
          status: validated.schedule?.publish_at ? 'scheduled' : 'published',
          scheduled_for: validated.schedule?.publish_at,
          updated_at: new Date()
        });

      // Track publishing event
      await this.trackPublishingEvent(content, publications);

      logger.info('Multi-platform publish scheduled', {
        contentId: content.id,
        publicationCount: publications.length
      });

      return {
        content_id: content.id,
        publications: publications.map(p => ({
          platform: p.platform,
          status: p.status,
          scheduled_for: p.scheduled_for,
          url: p.url
        })),
        optimization_report: optimizedVersions.report
      };

    } catch (error) {
      logger.error('Failed to publish content', { error, input });
      throw error;
    }
  }

  private async getPlatformAccounts(creatorId: string, platforms: string[]): Promise<PlatformAccount[]> {
    return database('platform_accounts')
      .where('creator_id', creatorId)
      .whereIn('platform', platforms)
      .where('is_active', true);
  }

  private async optimizeForPlatforms(
    content: Content, 
    platforms: string[], 
    options?: any
  ): Promise<Record<string, any>> {
    const optimized: Record<string, any> = {};
    
    for (const platform of platforms) {
      const optimizer = this.getPlatformOptimizer(platform);
      
      optimized[platform] = await optimizer.optimize({
        content,
        platform,
        options: {
          autoHashtags: options?.auto_hashtags,
          autoCaptions: options?.auto_captions,
          platformSpecific: options?.platform_specific
        }
      });
    }

    // Generate optimization report
    optimized.report = await this.generateOptimizationReport(content, optimized);
    
    return optimized;
  }

  private getPlatformOptimizer(platform: string) {
    // Platform-specific optimization logic
    switch (platform) {
      case 'youtube':
        return {
          optimize: async ({ content, options }) => {
            const optimized = await aiOptimizer.optimizeForYouTube(content);
            
            return {
              title: optimized.title,
              description: optimized.description,
              tags: optimized.tags,
              thumbnail: await this.selectBestThumbnail(content, 'youtube'),
              category: optimized.category,
              metadata: {
                end_screen: true,
                cards: optimized.cards,
                chapters: optimized.chapters
              }
            };
          }
        };
        
      case 'instagram':
        return {
          optimize: async ({ content, options }) => {
            const optimized = await aiOptimizer.optimizeForInstagram(content);
            
            // Handle different Instagram content types
            if (content.content_type === 'video' && content.duration_seconds <= 60) {
              // Reel
              return {
                caption: optimized.caption,
                hashtags: optimized.hashtags.slice(0, 30), // Max 30 hashtags
                cover_frame: optimized.cover_frame,
                music: optimized.trending_audio,
                effects: optimized.effects,
                type: 'reel'
              };
            } else if (content.content_type === 'carousel') {
              return {
                caption: optimized.caption,
                hashtags: optimized.hashtags.slice(0, 30),
                images: content.media_urls,
                type: 'carousel'
              };
            } else {
              // Regular post
              return {
                caption: optimized.caption,
                hashtags: optimized.hashtags.slice(0, 30),
                type: 'post'
              };
            }
          }
        };
        
      case 'tiktok':
        return {
          optimize: async ({ content, options }) => {
            const optimized = await aiOptimizer.optimizeForTikTok(content);
            
            return {
              description: optimized.description,
              hashtags: optimized.trending_hashtags,
              music_id: optimized.trending_sound,
              effects: optimized.effects,
              duet_enabled: true,
              stitch_enabled: true,
              comment_enabled: true
            };
          }
        };
        
      case 'twitter':
        return {
          optimize: async ({ content, options }) => {
            const optimized = await aiOptimizer.optimizeForTwitter(content);
            
            // Handle thread creation for long content
            if (optimized.is_thread) {
              return {
                tweets: optimized.thread_tweets,
                media_attachments: optimized.media_map,
                reply_settings: 'following'
              };
            } else {
              return {
                text: optimized.text,
                media: content.media_urls.slice(0, 4), // Max 4 images
                poll: optimized.poll_options
              };
            }
          }
        };
        
      case 'linkedin':
        return {
          optimize: async ({ content, options }) => {
            const optimized = await aiOptimizer.optimizeForLinkedIn(content);
            
            return {
              text: optimized.professional_copy,
              hashtags: optimized.industry_hashtags,
              visibility: optimized.visibility || 'public',
              article: optimized.article_format,
              document: optimized.document_upload
            };
          }
        };
        
      default:
        return {
          optimize: async ({ content }) => ({
            title: content.title,
            description: content.description,
            hashtags: content.hashtags
          })
        };
    }
  }

  private async selectBestThumbnail(content: Content, platform: string): Promise<string> {
    // AI-powered thumbnail selection
    if (!content.thumbnail_url) {
      return await aiOptimizer.generateThumbnail(content, platform);
    }
    
    // A/B test different thumbnails if multiple available
    const thumbnailOptions = content.media_urls.filter(url => url.includes('thumb'));
    if (thumbnailOptions.length > 1) {
      return await aiOptimizer.selectBestThumbnail(thumbnailOptions, platform);
    }
    
    return content.thumbnail_url;
  }

  private calculatePublishTime(
    baseTime?: string,
    index?: number,
    staggerMinutes?: number
  ): Date {
    if (!baseTime) {
      return new Date(); // Publish immediately
    }
    
    const base = new Date(baseTime);
    
    if (staggerMinutes && index) {
      base.setMinutes(base.getMinutes() + (index * staggerMinutes));
    }
    
    return base;
  }

  private async schedulePublication(params: {
    content: Content,
    account: PlatformAccount,
    optimizedContent: any,
    publishTime: Date,
    options: any
  }): Promise<any> {
    const { content, account, optimizedContent, publishTime, options } = params;
    
    // Create publication record
    const [publication] = await database('content_publications').insert({
      id: uuidv4(),
      content_id: content.id,
      platform_account_id: account.id,
      status: 'scheduled',
      platform_fields: optimizedContent,
      published_at: publishTime
    }).returning('*');
    
    // Queue the publishing job
    const delay = publishTime.getTime() - Date.now();
    
    await this.publishQueue.add(
      `publish:${account.platform}`,
      {
        publicationId: publication.id,
        contentId: content.id,
        accountId: account.id,
        platform: account.platform,
        optimizedContent,
        options
      },
      {
        delay: delay > 0 ? delay : 0,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    );
    
    return {
      ...publication,
      platform: account.platform,
      scheduled_for: publishTime
    };
  }

  async executePublication(jobData: any) {
    const { publicationId, contentId, accountId, platform, optimizedContent } = jobData;
    
    try {
      // Get full data
      const content = await database('content').where('id', contentId).first();
      const account = await database('platform_accounts').where('id', accountId).first();
      
      // Get platform service
      const platformService = this.platformServices.get(platform);
      if (!platformService) {
        throw new Error(`Platform service not found for ${platform}`);
      }
      
      // Refresh token if needed
      if (await this.needsTokenRefresh(account)) {
        await this.refreshPlatformToken(account);
      }
      
      // Publish to platform
      const result = await platformService.publish({
        account,
        content: {
          ...content,
          ...optimizedContent
        }
      });
      
      // Update publication record
      await database('content_publications')
        .where('id', publicationId)
        .update({
          platform_content_id: result.id,
          platform_url: result.url,
          status: 'published',
          published_at: new Date()
        });
      
      // Start analytics collection
      await this.analyticsQueue.add(
        'collect-initial',
        { 
          publicationId,
          platform,
          platformContentId: result.id
        },
        { delay: 5 * 60 * 1000 } // 5 minutes
      );
      
      // Log success
      logger.info('Content published successfully', {
        publicationId,
        platform,
        url: result.url
      });
      
      return result;
      
    } catch (error) {
      logger.error('Failed to publish content', { 
        error, 
        publicationId,
        platform 
      });
      
      // Update publication status
      await database('content_publications')
        .where('id', publicationId)
        .update({
          status: 'failed',
          platform_fields: {
            ...optimizedContent,
            error: error.message
          }
        });
      
      throw error;
    }
  }

  private async needsTokenRefresh(account: PlatformAccount): Promise<boolean> {
    if (!account.token_expires_at) return false;
    
    const expiryTime = new Date(account.token_expires_at);
    const now = new Date();
    const bufferMinutes = 10;
    
    return expiryTime.getTime() - now.getTime() < bufferMinutes * 60 * 1000;
  }

  private async refreshPlatformToken(account: PlatformAccount) {
    const platformService = this.platformServices.get(account.platform);
    if (!platformService || !platformService.refreshToken) {
      return;
    }
    
    try {
      const newTokens = await platformService.refreshToken(account.refresh_token);
      
      await database('platform_accounts')
        .where('id', account.id)
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || account.refresh_token,
          token_expires_at: new Date(Date.now() + (newTokens.expires_in * 1000)),
          updated_at: new Date()
        });
      
      logger.info('Platform token refreshed', {
        accountId: account.id,
        platform: account.platform
      });
      
    } catch (error) {
      logger.error('Failed to refresh platform token', {
        error,
        accountId: account.id,
        platform: account.platform
      });
      throw error;
    }
  }

  private async setupCrossPromotion(
    content: Content,
    publications: any[],
    options: any
  ) {
    // Schedule cross-promotion posts
    for (const publication of publications) {
      const otherPlatforms = publications
        .filter(p => p.platform !== publication.platform)
        .map(p => ({ platform: p.platform, url: p.url }));
      
      if (otherPlatforms.length === 0) continue;
      
      await this.publishQueue.add(
        'cross-promote',
        {
          originalPublicationId: publication.id,
          contentId: content.id,
          fromPlatform: publication.platform,
          toPlatforms: otherPlatforms,
          style: options.style
        },
        {
          delay: options.delay_minutes * 60 * 1000
        }
      );
    }
  }

  private async generateOptimizationReport(content: Content, optimized: Record<string, any>) {
    const report = {
      seo_improvements: {},
      engagement_predictions: {},
      recommendations: []
    };
    
    for (const [platform, data] of Object.entries(optimized)) {
      if (platform === 'report') continue;
      
      // SEO analysis
      report.seo_improvements[platform] = await aiOptimizer.analyzeSEO(data, platform);
      
      // Engagement prediction
      report.engagement_predictions[platform] = await aiOptimizer.predictEngagement(content, data, platform);
    }
    
    // Generate recommendations
    report.recommendations = await aiOptimizer.generateRecommendations(content, optimized);
    
    return report;
  }

  private async trackPublishingEvent(content: Content, publications: any[]) {
    await database('analytics_events').insert({
      id: uuidv4(),
      creator_id: content.creator_id,
      event_type: 'content_published',
      event_properties: {
        content_id: content.id,
        content_type: content.content_type,
        platforms: publications.map(p => p.platform),
        publication_count: publications.length,
        optimization_enabled: true
      },
      occurred_at: new Date()
    });
  }

  // Bulk publishing
  async publishBulkContent(creatorId: string, contentIds: string[], options: any) {
    const results = [];
    
    for (const contentId of contentIds) {
      try {
        const result = await this.publishContent({
          content_id: contentId,
          platforms: options.platforms,
          schedule: options.schedule,
          optimization: options.optimization,
          cross_promotion: options.cross_promotion
        });
        
        results.push({ contentId, success: true, result });
      } catch (error) {
        results.push({ contentId, success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Content repurposing
  async repurposeContent(contentId: string, targetPlatforms: string[]) {
    const content = await database('content')
      .where('id', contentId)
      .first();
      
    if (!content) {
      throw new Error(`Content ${contentId} not found`);
    }
    
    const repurposed = [];
    
    for (const platform of targetPlatforms) {
      const transformer = this.getContentTransformer(content.content_type, platform);
      
      if (transformer) {
        const newContent = await transformer.transform(content);
        
        // Save new content
        const [created] = await database('content').insert({
          ...newContent,
          id: uuidv4(),
          creator_id: content.creator_id,
          status: 'draft',
          created_at: new Date()
        }).returning('*');
        
        repurposed.push({
          platform,
          contentId: created.id,
          type: created.content_type
        });
      }
    }
    
    return repurposed;
  }

  private getContentTransformer(sourceType: string, targetPlatform: string) {
    // Define transformation logic
    const transformers = {
      'video': {
        'tiktok': {
          transform: async (content) => ({
            title: content.title,
            description: await aiOptimizer.summarizeForTikTok(content.description),
            content_type: 'short',
            media_urls: await this.extractVideoHighlights(content, 60), // 60 second clips
            hashtags: await aiOptimizer.generateTrendingHashtags(content, 'tiktok')
          })
        },
        'instagram': {
          transform: async (content) => ({
            title: content.title,
            description: await aiOptimizer.summarizeForInstagram(content.description),
            content_type: 'reel',
            media_urls: await this.extractVideoHighlights(content, 90), // 90 second clips
            hashtags: content.hashtags.slice(0, 30)
          })
        },
        'blog': {
          transform: async (content) => ({
            title: content.title,
            description: await aiOptimizer.transcribeAndFormat(content),
            content_type: 'article',
            media_urls: await this.extractKeyframes(content),
            hashtags: []
          })
        }
      },
      'article': {
        'youtube': {
          transform: async (content) => ({
            title: content.title,
            description: content.description,
            content_type: 'video',
            media_urls: await this.createVideoFromArticle(content),
            hashtags: content.hashtags
          })
        },
        'podcast': {
          transform: async (content) => ({
            title: content.title,
            description: content.description,
            content_type: 'podcast_episode',
            media_urls: await this.createAudioFromArticle(content),
            hashtags: []
          })
        }
      }
    };
    
    return transformers[sourceType]?.[targetPlatform];
  }

  private async extractVideoHighlights(content: any, maxDuration: number): Promise<string[]> {
    // Use AI to identify best moments
    const highlights = await aiOptimizer.identifyVideoHighlights(content.media_urls[0], {
      maxDuration,
      optimizeFor: 'engagement'
    });
    
    return highlights;
  }

  private async extractKeyframes(content: any): Promise<string[]> {
    // Extract representative frames from video
    return aiOptimizer.extractKeyframes(content.media_urls[0]);
  }

  private async createVideoFromArticle(content: any): Promise<string[]> {
    // Generate video from article using AI
    return aiOptimizer.articleToVideo(content);
  }

  private async createAudioFromArticle(content: any): Promise<string[]> {
    // Generate audio narration from article
    return aiOptimizer.articleToAudio(content);
  }
}

export const multiPlatformPublisher = new MultiPlatformPublisher();