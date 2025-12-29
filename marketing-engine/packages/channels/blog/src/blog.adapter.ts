import { Logger } from 'winston';
import { Pool } from 'pg';
import Redis from 'ioredis';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import slugify from 'slugify';
import RSS from 'rss';
import {
  ChannelType,
  ChannelConfig,
  ChannelCredentials,
  ChannelResponse,
  PostContent,
  PostResult,
  ScheduleOptions,
  AnalyticsData,
  ChannelError,
  MediaContent
} from '@marketing-engine/core/interfaces/channel.interface';
import { BaseChannelAdapter } from '@marketing-engine/shared/adapters/base-channel.adapter';

// Platform-specific imports
import GhostAdminAPI from '@tryghost/admin-api';
import WPAPI from 'wpapi';

export enum BlogPlatform {
  WORDPRESS = 'wordpress',
  GHOST = 'ghost',
  MEDIUM = 'medium'
}

interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  slug: string;
  tags?: string[];
  categories?: string[];
  featuredImage?: string;
  status: 'draft' | 'published' | 'scheduled';
  publishedAt?: Date;
  scheduledAt?: Date;
  url?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
}

interface BlogConfig extends ChannelConfig {
  platform: BlogPlatform;
  siteUrl: string;
  apiUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export class BlogAdapter extends BaseChannelAdapter {
  readonly channelType = ChannelType.BLOG;
  private platform: BlogPlatform;
  private siteUrl: string;
  private wpClient?: WPAPI;
  private ghostClient?: any;
  private mediumClient?: any;

  constructor(
    config: BlogConfig,
    logger: Logger,
    db: Pool,
    redis: Redis
  ) {
    super(config, logger, db, redis);
    
    this.platform = config.platform;
    this.siteUrl = config.siteUrl;
    
    this.initializePlatformClient(config);
  }

  private initializePlatformClient(config: BlogConfig): void {
    switch (this.platform) {
      case BlogPlatform.WORDPRESS:
        this.initializeWordPress(config);
        break;
      case BlogPlatform.GHOST:
        this.initializeGhost(config);
        break;
      case BlogPlatform.MEDIUM:
        this.initializeMedium(config);
        break;
    }
  }

  private initializeWordPress(config: BlogConfig): void {
    const wpConfig: any = {
      endpoint: config.apiUrl || `${config.siteUrl}/wp-json`
    };

    if (config.username && config.password) {
      wpConfig.username = config.username;
      wpConfig.password = config.password;
    } else if (config.apiKey) {
      // Using Application Passwords
      wpConfig.auth = {
        username: config.username!,
        password: config.apiKey
      };
    }

    this.wpClient = new WPAPI(wpConfig);
  }

  private initializeGhost(config: BlogConfig): void {
    if (!config.apiUrl || !config.apiKey) {
      throw new Error('Ghost requires apiUrl and apiKey');
    }

    this.ghostClient = new GhostAdminAPI({
      url: config.apiUrl,
      key: config.apiKey,
      version: 'v5.0'
    });
  }

  private initializeMedium(config: BlogConfig): void {
    // Medium SDK is deprecated, we'll use their API directly
    this.mediumClient = {
      accessToken: config.credentials.accessToken || config.apiKey,
      userId: config.credentials.additionalData?.userId
    };
  }

  async authenticate(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    try {
      switch (this.platform) {
        case BlogPlatform.WORDPRESS:
          return await this.authenticateWordPress(credentials);
        case BlogPlatform.GHOST:
          return await this.authenticateGhost(credentials);
        case BlogPlatform.MEDIUM:
          return await this.authenticateMedium(credentials);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error: any) {
      this.logger.error(`${this.platform} authentication failed`, error);
      return {
        success: false,
        error: this.createError(
          'AUTH_FAILED',
          `Failed to authenticate with ${this.platform}`,
          error.message,
          false
        )
      };
    }
  }

  private async authenticateWordPress(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Test authentication by fetching user info
    const user = await this.wpClient!.users().me();
    
    return {
      success: true,
      data: {
        ...credentials,
        additionalData: {
          userId: user.id,
          username: user.slug,
          name: user.name
        }
      }
    };
  }

  private async authenticateGhost(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Test authentication by fetching site info
    const site = await this.ghostClient.site.read();
    
    return {
      success: true,
      data: {
        ...credentials,
        additionalData: {
          siteTitle: site.title,
          siteDescription: site.description
        }
      }
    };
  }

  private async authenticateMedium(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Get user info from Medium
    const response = await axios.get('https://api.medium.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${this.mediumClient.accessToken}`
      }
    });

    const user = response.data.data;
    this.mediumClient.userId = user.id;

    return {
      success: true,
      data: {
        ...credentials,
        additionalData: {
          userId: user.id,
          username: user.username,
          name: user.name
        }
      }
    };
  }

  async refreshCredentials(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Most blog platforms use API keys that don't expire
    return this.authenticate(credentials);
  }

  protected async performCredentialValidation(credentials: ChannelCredentials): Promise<boolean> {
    try {
      switch (this.platform) {
        case BlogPlatform.WORDPRESS:
          await this.wpClient!.users().me();
          return true;
        case BlogPlatform.GHOST:
          await this.ghostClient.site.read();
          return true;
        case BlogPlatform.MEDIUM:
          await axios.get('https://api.medium.com/v1/me', {
            headers: { 'Authorization': `Bearer ${this.mediumClient.accessToken}` }
          });
          return true;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  protected async performCreatePost(
    content: PostContent,
    options?: ScheduleOptions
  ): Promise<ChannelResponse<PostResult>> {
    try {
      const blogPost = this.convertToBlogPost(content, options);
      
      switch (this.platform) {
        case BlogPlatform.WORDPRESS:
          return await this.createWordPressPost(blogPost);
        case BlogPlatform.GHOST:
          return await this.createGhostPost(blogPost);
        case BlogPlatform.MEDIUM:
          return await this.createMediumPost(blogPost);
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to create ${this.platform} post`, error);
      return {
        success: false,
        error: this.createError(
          'POST_FAILED',
          `Failed to create ${this.platform} post`,
          error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  private async createWordPressPost(post: BlogPost): Promise<ChannelResponse<PostResult>> {
    const wpPost: any = {
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      slug: post.slug,
      status: this.mapWordPressStatus(post.status),
      categories: post.categories ? await this.getWordPressCategoryIds(post.categories) : [],
      tags: post.tags ? await this.getWordPressTagIds(post.tags) : []
    };

    if (post.featuredImage) {
      wpPost.featured_media = await this.uploadWordPressMedia(post.featuredImage);
    }

    if (post.scheduledAt) {
      wpPost.date = post.scheduledAt.toISOString();
    }

    // SEO fields (requires Yoast or similar plugin)
    if (post.seoTitle || post.seoDescription) {
      wpPost.meta = {
        _yoast_wpseo_title: post.seoTitle,
        _yoast_wpseo_metadesc: post.seoDescription
      };
    }

    const createdPost = await this.wpClient!.posts().create(wpPost);

    return {
      success: true,
      data: {
        id: createdPost.id.toString(),
        url: createdPost.link,
        status: post.status,
        publishedAt: post.status === 'published' ? new Date() : undefined,
        scheduledAt: post.scheduledAt
      }
    };
  }

  private async createGhostPost(post: BlogPost): Promise<ChannelResponse<PostResult>> {
    const ghostPost: any = {
      title: post.title,
      html: post.content,
      custom_excerpt: post.excerpt,
      slug: post.slug,
      status: post.status,
      tags: post.tags,
      feature_image: post.featuredImage,
      meta_title: post.seoTitle,
      meta_description: post.seoDescription
    };

    if (post.scheduledAt) {
      ghostPost.published_at = post.scheduledAt.toISOString();
    }

    const createdPost = await this.ghostClient.posts.add(ghostPost);

    return {
      success: true,
      data: {
        id: createdPost.id,
        url: createdPost.url,
        status: post.status,
        publishedAt: post.status === 'published' ? new Date() : undefined,
        scheduledAt: post.scheduledAt
      }
    };
  }

  private async createMediumPost(post: BlogPost): Promise<ChannelResponse<PostResult>> {
    const mediumPost = {
      title: post.title,
      contentFormat: 'html',
      content: post.content,
      tags: post.tags || [],
      publishStatus: post.status === 'published' ? 'public' : 'draft'
    };

    const response = await axios.post(
      `https://api.medium.com/v1/users/${this.mediumClient.userId}/posts`,
      mediumPost,
      {
        headers: {
          'Authorization': `Bearer ${this.mediumClient.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const createdPost = response.data.data;

    return {
      success: true,
      data: {
        id: createdPost.id,
        url: createdPost.url,
        status: post.status,
        publishedAt: post.status === 'published' ? new Date() : undefined
      }
    };
  }

  protected async performUpdatePost(
    postId: string,
    content: Partial<PostContent>
  ): Promise<ChannelResponse<PostResult>> {
    try {
      const updates = this.convertToBlogPost(content as PostContent);
      
      switch (this.platform) {
        case BlogPlatform.WORDPRESS:
          return await this.updateWordPressPost(postId, updates);
        case BlogPlatform.GHOST:
          return await this.updateGhostPost(postId, updates);
        case BlogPlatform.MEDIUM:
          // Medium doesn't support updating posts
          return {
            success: false,
            error: this.createError(
              'NOT_SUPPORTED',
              'Medium does not support updating published posts',
              null,
              false
            )
          };
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to update ${this.platform} post`, error);
      return {
        success: false,
        error: this.createError(
          'UPDATE_FAILED',
          `Failed to update ${this.platform} post`,
          error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  private async updateWordPressPost(postId: string, updates: Partial<BlogPost>): Promise<ChannelResponse<PostResult>> {
    const wpUpdates: any = {};
    
    if (updates.title) wpUpdates.title = updates.title;
    if (updates.content) wpUpdates.content = updates.content;
    if (updates.excerpt) wpUpdates.excerpt = updates.excerpt;
    if (updates.status) wpUpdates.status = this.mapWordPressStatus(updates.status);
    
    const updatedPost = await this.wpClient!.posts().id(parseInt(postId)).update(wpUpdates);

    return {
      success: true,
      data: {
        id: updatedPost.id.toString(),
        url: updatedPost.link,
        status: updates.status || 'published',
        publishedAt: new Date()
      }
    };
  }

  private async updateGhostPost(postId: string, updates: Partial<BlogPost>): Promise<ChannelResponse<PostResult>> {
    // Ghost requires the updated_at timestamp for conflict resolution
    const existingPost = await this.ghostClient.posts.read({ id: postId });
    
    const ghostUpdates: any = {
      updated_at: existingPost.updated_at
    };
    
    if (updates.title) ghostUpdates.title = updates.title;
    if (updates.content) ghostUpdates.html = updates.content;
    if (updates.excerpt) ghostUpdates.custom_excerpt = updates.excerpt;
    if (updates.status) ghostUpdates.status = updates.status;
    
    const updatedPost = await this.ghostClient.posts.edit({ id: postId }, ghostUpdates);

    return {
      success: true,
      data: {
        id: updatedPost.id,
        url: updatedPost.url,
        status: updates.status || 'published',
        publishedAt: new Date()
      }
    };
  }

  protected async performDeletePost(postId: string): Promise<ChannelResponse<void>> {
    try {
      switch (this.platform) {
        case BlogPlatform.WORDPRESS:
          await this.wpClient!.posts().id(parseInt(postId)).delete();
          break;
        case BlogPlatform.GHOST:
          await this.ghostClient.posts.delete({ id: postId });
          break;
        case BlogPlatform.MEDIUM:
          // Medium doesn't support deleting posts via API
          return {
            success: false,
            error: this.createError(
              'NOT_SUPPORTED',
              'Medium does not support deleting posts via API',
              null,
              false
            )
          };
      }

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to delete ${this.platform} post`, error);
      return {
        success: false,
        error: this.createError(
          'DELETE_FAILED',
          `Failed to delete ${this.platform} post`,
          error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performGetPost(postId: string): Promise<ChannelResponse<PostResult>> {
    try {
      switch (this.platform) {
        case BlogPlatform.WORDPRESS:
          const wpPost = await this.wpClient!.posts().id(parseInt(postId));
          return {
            success: true,
            data: {
              id: wpPost.id.toString(),
              url: wpPost.link,
              status: this.mapFromWordPressStatus(wpPost.status),
              publishedAt: wpPost.date ? new Date(wpPost.date) : undefined
            }
          };
          
        case BlogPlatform.GHOST:
          const ghostPost = await this.ghostClient.posts.read({ id: postId });
          return {
            success: true,
            data: {
              id: ghostPost.id,
              url: ghostPost.url,
              status: ghostPost.status as any,
              publishedAt: ghostPost.published_at ? new Date(ghostPost.published_at) : undefined
            }
          };
          
        case BlogPlatform.MEDIUM:
          // Medium doesn't provide a way to fetch individual posts
          return {
            success: false,
            error: this.createError(
              'NOT_SUPPORTED',
              'Medium does not support fetching individual posts via API',
              null,
              false
            )
          };
          
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to get ${this.platform} post`, error);
      return {
        success: false,
        error: this.createError(
          'GET_FAILED',
          `Failed to retrieve ${this.platform} post`,
          error.message,
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
    // Most blog platforms don't provide detailed analytics via API
    // This would typically integrate with Google Analytics or similar
    try {
      // Fetch basic stats if available
      const pageViews = await this.fetchPageViews(postId, startDate, endDate);
      
      return {
        success: true,
        data: {
          impressions: pageViews,
          clicks: Math.floor(pageViews * 0.1), // Rough estimate
          engagement: Math.floor(pageViews * 0.05), // Rough estimate
          reach: pageViews,
          conversions: 0,
          spend: 0,
          customMetrics: {
            pageViews,
            timeOnPage: 120, // Default 2 minutes
            bounceRate: 0.5
          },
          timestamp: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error(`Failed to get ${this.platform} analytics`, error);
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Blog analytics require Google Analytics integration',
          error.message,
          false
        )
      };
    }
  }

  protected async performGetAccountAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelResponse<AnalyticsData>> {
    // Aggregate analytics across all posts
    try {
      const totalPageViews = await this.fetchTotalPageViews(startDate, endDate);
      
      return {
        success: true,
        data: {
          impressions: totalPageViews,
          clicks: Math.floor(totalPageViews * 0.1),
          engagement: Math.floor(totalPageViews * 0.05),
          reach: Math.floor(totalPageViews * 0.8),
          conversions: 0,
          spend: 0,
          customMetrics: {
            totalPageViews,
            uniqueVisitors: Math.floor(totalPageViews * 0.6),
            averageTimeOnSite: 180,
            postsPublished: await this.getPublishedPostCount(startDate, endDate)
          },
          timestamp: new Date()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve account analytics',
          error.message,
          false
        )
      };
    }
  }

  protected async checkAPIHealth(): Promise<{ reachable: boolean; responseTimeMs?: number }> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case BlogPlatform.WORDPRESS:
          await this.wpClient!.posts().perPage(1);
          break;
        case BlogPlatform.GHOST:
          await this.ghostClient.posts.browse({ limit: 1 });
          break;
        case BlogPlatform.MEDIUM:
          await axios.get('https://api.medium.com/v1/me', {
            headers: { 'Authorization': `Bearer ${this.mediumClient.accessToken}` }
          });
          break;
      }
      
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
    // Extract title from content if not in metadata
    const title = content.metadata?.title || this.extractTitle(content.text);
    
    if (!title) {
      return this.createError(
        'MISSING_TITLE',
        'Blog posts require a title',
        null,
        false
      );
    }

    // Platform-specific validation
    switch (this.platform) {
      case BlogPlatform.MEDIUM:
        if (content.text.length < 400) {
          return this.createError(
            'CONTENT_TOO_SHORT',
            'Medium posts should be at least 400 characters',
            { minLength: 400, actualLength: content.text.length },
            false
          );
        }
        break;
    }

    return null;
  }

  // Helper methods
  private convertToBlogPost(content: PostContent, options?: ScheduleOptions): BlogPost {
    const title = content.metadata?.title || this.extractTitle(content.text);
    const htmlContent = this.convertToHtml(content);
    
    return {
      id: '',
      title: title || 'Untitled Post',
      content: htmlContent,
      excerpt: content.metadata?.excerpt || this.generateExcerpt(content.text),
      slug: content.metadata?.slug || slugify(title || 'post', { lower: true, strict: true }),
      tags: content.hashtags,
      categories: content.metadata?.categories,
      featuredImage: content.media?.[0]?.url,
      status: options?.scheduledAt ? 'scheduled' : 'published',
      scheduledAt: options?.scheduledAt,
      seoTitle: content.metadata?.seoTitle || title,
      seoDescription: content.metadata?.seoDescription || this.generateExcerpt(content.text),
      seoKeywords: content.metadata?.seoKeywords || content.hashtags
    };
  }

  private extractTitle(text: string): string {
    // Try to extract title from first line or heading
    const lines = text.split('\n');
    const firstLine = lines[0]?.trim();
    
    // Check if first line is a markdown heading
    if (firstLine?.startsWith('#')) {
      return firstLine.replace(/^#+\s*/, '');
    }
    
    // Otherwise use first line up to 60 characters
    return firstLine?.substring(0, 60) || '';
  }

  private convertToHtml(content: PostContent): string {
    let html = marked(content.text);
    
    // Add media if present
    if (content.media && content.media.length > 0) {
      for (const media of content.media) {
        if (media.type === 'image') {
          html += `<figure><img src="${media.url}" alt="${media.altText || ''}" />`
          if (media.altText) {
            html += `<figcaption>${media.altText}</figcaption>`;
          }
          html += '</figure>';
        }
      }
    }
    
    // Add SEO optimizations
    html = this.optimizeHtmlForSEO(html, content);
    
    return html;
  }

  private optimizeHtmlForSEO(html: string, content: PostContent): string {
    const $ = cheerio.load(html);
    
    // Add alt text to images without it
    $('img:not([alt])').each((i, elem) => {
      $(elem).attr('alt', content.metadata?.title || 'Blog post image');
    });
    
    // Add rel="nofollow" to external links
    $('a[href^="http"]:not([href*="' + this.siteUrl + '"])').attr('rel', 'nofollow noopener');
    
    // Ensure headings have proper hierarchy
    let h1Count = 0;
    $('h1').each((i, elem) => {
      if (h1Count > 0) {
        $(elem).replaceWith(`<h2>${$(elem).html()}</h2>`);
      }
      h1Count++;
    });
    
    return $.html();
  }

  private generateExcerpt(text: string, length: number = 160): string {
    // Remove markdown formatting
    const plainText = text
      .replace(/[#*`\[\]()]/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    
    if (plainText.length <= length) {
      return plainText;
    }
    
    // Cut at last complete word
    const excerpt = plainText.substring(0, length);
    const lastSpace = excerpt.lastIndexOf(' ');
    
    return excerpt.substring(0, lastSpace) + '...';
  }

  private mapWordPressStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'published': 'publish',
      'draft': 'draft',
      'scheduled': 'future'
    };
    return statusMap[status] || 'draft';
  }

  private mapFromWordPressStatus(status: string): 'published' | 'scheduled' | 'draft' | 'failed' {
    const statusMap: Record<string, 'published' | 'scheduled' | 'draft' | 'failed'> = {
      'publish': 'published',
      'draft': 'draft',
      'future': 'scheduled',
      'trash': 'failed'
    };
    return statusMap[status] || 'draft';
  }

  private async getWordPressCategoryIds(categories: string[]): Promise<number[]> {
    const ids: number[] = [];
    
    for (const categoryName of categories) {
      try {
        // Try to find existing category
        const existing = await this.wpClient!.categories().slug(slugify(categoryName, { lower: true }));
        if (existing.length > 0) {
          ids.push(existing[0].id);
        } else {
          // Create new category
          const created = await this.wpClient!.categories().create({
            name: categoryName,
            slug: slugify(categoryName, { lower: true })
          });
          ids.push(created.id);
        }
      } catch (error) {
        this.logger.warn(`Failed to process category: ${categoryName}`, error);
      }
    }
    
    return ids;
  }

  private async getWordPressTagIds(tags: string[]): Promise<number[]> {
    const ids: number[] = [];
    
    for (const tagName of tags) {
      try {
        // Try to find existing tag
        const existing = await this.wpClient!.tags().slug(slugify(tagName, { lower: true }));
        if (existing.length > 0) {
          ids.push(existing[0].id);
        } else {
          // Create new tag
          const created = await this.wpClient!.tags().create({
            name: tagName,
            slug: slugify(tagName, { lower: true })
          });
          ids.push(created.id);
        }
      } catch (error) {
        this.logger.warn(`Failed to process tag: ${tagName}`, error);
      }
    }
    
    return ids;
  }

  private async uploadWordPressMedia(imageUrl: string): Promise<number> {
    try {
      // Download image
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      // Upload to WordPress
      const media = await this.wpClient!.media().create({
        title: 'Featured Image',
        media_attachment: buffer
      });
      
      return media.id;
    } catch (error) {
      this.logger.error('Failed to upload media to WordPress', error);
      return 0;
    }
  }

  private async fetchPageViews(postId: string, startDate: Date, endDate: Date): Promise<number> {
    // This would typically integrate with Google Analytics or platform analytics
    // For now, return mock data
    return Math.floor(Math.random() * 10000) + 1000;
  }

  private async fetchTotalPageViews(startDate: Date, endDate: Date): Promise<number> {
    // This would typically integrate with Google Analytics or platform analytics
    // For now, return mock data
    return Math.floor(Math.random() * 100000) + 10000;
  }

  private async getPublishedPostCount(startDate: Date, endDate: Date): Promise<number> {
    try {
      switch (this.platform) {
        case BlogPlatform.WORDPRESS:
          const wpPosts = await this.wpClient!.posts()
            .param('after', startDate.toISOString())
            .param('before', endDate.toISOString())
            .param('status', 'publish');
          return wpPosts.length;
          
        case BlogPlatform.GHOST:
          const ghostPosts = await this.ghostClient.posts.browse({
            filter: `published_at:>='${startDate.toISOString()}'`
          });
          return ghostPosts.length;
          
        default:
          return 0;
      }
    } catch (error) {
      return 0;
    }
  }

  private isRetryableError(error: any): boolean {
    const status = error.response?.status || error.statusCode;
    return status === 429 || status >= 500;
  }

  // RSS Feed Generation
  async generateRSSFeed(): Promise<string> {
    const feed = new RSS({
      title: `${this.siteUrl} RSS Feed`,
      description: 'Latest posts from our blog',
      feed_url: `${this.siteUrl}/rss`,
      site_url: this.siteUrl,
      language: 'en',
      pubDate: new Date()
    });

    // Fetch recent posts
    let posts: any[] = [];
    
    switch (this.platform) {
      case BlogPlatform.WORDPRESS:
        posts = await this.wpClient!.posts().perPage(20);
        posts.forEach(post => {
          feed.item({
            title: post.title.rendered,
            description: post.excerpt.rendered,
            url: post.link,
            date: post.date
          });
        });
        break;
        
      case BlogPlatform.GHOST:
        const ghostPosts = await this.ghostClient.posts.browse({ limit: 20 });
        ghostPosts.forEach((post: any) => {
          feed.item({
            title: post.title,
            description: post.custom_excerpt || post.excerpt,
            url: post.url,
            date: post.published_at
          });
        });
        break;
    }

    return feed.xml();
  }
}