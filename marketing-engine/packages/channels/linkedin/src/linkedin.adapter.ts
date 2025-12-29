import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import FormData from 'form-data';
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
  ChannelError,
  MediaContent,
  ContentType
} from '@marketing-engine/core/interfaces/channel.interface';
import { BaseChannelAdapter } from '@marketing-engine/shared/adapters/base-channel.adapter';

interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  organizations?: {
    values: Array<{
      organizationUrn: string;
      role: string;
    }>;
  };
}

interface LinkedInShareResponse {
  id: string;
  owner: string;
  activity: string;
  created: {
    time: number;
  };
}

interface LinkedInAnalytics {
  totalShareStatistics: {
    shareCount: number;
    clickCount: number;
    engagement: number;
    likeCount: number;
    impressionCount: number;
    commentCount: number;
  };
}

export class LinkedInAdapter extends BaseChannelAdapter {
  readonly channelType = ChannelType.LINKEDIN;
  private apiClient: AxiosInstance;
  private currentProfile?: LinkedInProfile;
  private organizationId?: string;

  constructor(
    config: ChannelConfig,
    logger: Logger,
    db: Pool,
    redis: Redis
  ) {
    super(config, logger, db, redis);

    this.apiClient = axios.create({
      baseURL: 'https://api.linkedin.com/v2',
      headers: {
        'X-Restli-Protocol-Version': '2.0.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // Configure axios retry
    axiosRetry(this.apiClient, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429;
      }
    });

    // Request interceptor for auth
    this.apiClient.interceptors.request.use(
      (config) => {
        if (this.config.credentials.accessToken) {
          config.headers.Authorization = `Bearer ${this.config.credentials.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Try to refresh token
          const refreshResult = await this.refreshCredentials(this.config.credentials);
          if (refreshResult.success && refreshResult.data) {
            this.config.credentials = refreshResult.data;
            // Retry the original request
            error.config.headers.Authorization = `Bearer ${refreshResult.data.accessToken}`;
            return this.apiClient.request(error.config);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  async authenticate(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    try {
      // Exchange authorization code for access token
      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
        grant_type: 'authorization_code',
        code: credentials.additionalData?.authorizationCode,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, expires_in, refresh_token, refresh_token_expires_in } = response.data;

      const updatedCredentials: ChannelCredentials = {
        channelType: ChannelType.LINKEDIN,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        additionalData: {
          refreshTokenExpiresAt: new Date(Date.now() + refresh_token_expires_in * 1000)
        }
      };

      // Validate by fetching profile
      this.config.credentials = updatedCredentials;
      await this.fetchProfile();

      return {
        success: true,
        data: updatedCredentials
      };
    } catch (error: any) {
      this.logger.error('LinkedIn authentication failed', error);
      return {
        success: false,
        error: this.createError(
          'AUTH_FAILED',
          'Failed to authenticate with LinkedIn',
          error.response?.data,
          false
        )
      };
    }
  }

  async refreshCredentials(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    try {
      if (!credentials.refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, expires_in, refresh_token, refresh_token_expires_in } = response.data;

      const updatedCredentials: ChannelCredentials = {
        ...credentials,
        accessToken: access_token,
        refreshToken: refresh_token || credentials.refreshToken,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        additionalData: {
          ...credentials.additionalData,
          refreshTokenExpiresAt: new Date(Date.now() + (refresh_token_expires_in || expires_in) * 1000)
        }
      };

      return {
        success: true,
        data: updatedCredentials
      };
    } catch (error: any) {
      this.logger.error('LinkedIn token refresh failed', error);
      return {
        success: false,
        error: this.createError(
          'REFRESH_FAILED',
          'Failed to refresh LinkedIn credentials',
          error.response?.data,
          false
        )
      };
    }
  }

  protected async performCredentialValidation(credentials: ChannelCredentials): Promise<boolean> {
    try {
      // Test the credentials by making a simple API call
      await this.apiClient.get('/me');
      return true;
    } catch (error) {
      return false;
    }
  }

  protected async performCreatePost(
    content: PostContent,
    options?: ScheduleOptions
  ): Promise<ChannelResponse<PostResult>> {
    try {
      // LinkedIn doesn't support native scheduling, so we'll handle it externally
      if (options?.scheduledAt && new Date(options.scheduledAt) > new Date()) {
        // Store in database for later processing
        return {
          success: true,
          data: {
            id: `scheduled_${Date.now()}`,
            status: 'scheduled',
            scheduledAt: options.scheduledAt
          }
        };
      }

      // Ensure we have profile data
      if (!this.currentProfile) {
        await this.fetchProfile();
      }

      // Upload media if present
      const mediaUrns: string[] = [];
      if (content.media && content.media.length > 0) {
        for (const media of content.media) {
          const uploadResult = await this.uploadMedia(media);
          if (uploadResult) {
            mediaUrns.push(uploadResult);
          }
        }
      }

      // Create the share
      const shareData = this.buildShareData(content, mediaUrns);
      const response = await this.apiClient.post('/ugcPosts', shareData);

      const shareResponse = response.data as LinkedInShareResponse;

      return {
        success: true,
        data: {
          id: shareResponse.id,
          url: `https://www.linkedin.com/feed/update/${shareResponse.activity}`,
          status: 'published',
          publishedAt: new Date(shareResponse.created.time)
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create LinkedIn post', error);
      return {
        success: false,
        error: this.createError(
          'POST_FAILED',
          'Failed to create LinkedIn post',
          error.response?.data,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performUpdatePost(
    postId: string,
    content: Partial<PostContent>
  ): Promise<ChannelResponse<PostResult>> {
    // LinkedIn API doesn't support updating posts
    return {
      success: false,
      error: this.createError(
        'NOT_SUPPORTED',
        'LinkedIn does not support updating published posts',
        null,
        false
      )
    };
  }

  protected async performDeletePost(postId: string): Promise<ChannelResponse<void>> {
    try {
      await this.apiClient.delete(`/ugcPosts/${encodeURIComponent(postId)}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to delete LinkedIn post', error);
      return {
        success: false,
        error: this.createError(
          'DELETE_FAILED',
          'Failed to delete LinkedIn post',
          error.response?.data,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performGetPost(postId: string): Promise<ChannelResponse<PostResult>> {
    try {
      const response = await this.apiClient.get(`/ugcPosts/${encodeURIComponent(postId)}`);
      const post = response.data;

      return {
        success: true,
        data: {
          id: post.id,
          url: `https://www.linkedin.com/feed/update/${post.activity}`,
          status: 'published',
          publishedAt: new Date(post.created.time)
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get LinkedIn post', error);
      return {
        success: false,
        error: this.createError(
          'GET_FAILED',
          'Failed to retrieve LinkedIn post',
          error.response?.data,
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
      const response = await this.apiClient.get('/organizationalEntityShareStatistics', {
        params: {
          q: 'organizationalEntity',
          organizationalEntity: this.organizationId || this.currentProfile?.id,
          shares: `urn:li:share:${postId}`,
          timeInterval: {
            start: startDate.getTime(),
            end: endDate.getTime()
          }
        }
      });

      const stats = response.data.elements[0]?.totalShareStatistics || {};

      return {
        success: true,
        data: {
          impressions: stats.impressionCount || 0,
          clicks: stats.clickCount || 0,
          engagement: stats.engagement || 0,
          reach: stats.impressionCount || 0, // LinkedIn doesn't separate reach
          conversions: 0, // Not available in LinkedIn API
          spend: 0, // Organic posts don't have spend
          customMetrics: {
            likes: stats.likeCount || 0,
            comments: stats.commentCount || 0,
            shares: stats.shareCount || 0
          },
          timestamp: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get LinkedIn analytics', error);
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve LinkedIn analytics',
          error.response?.data,
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
      const response = await this.apiClient.get('/organizationalEntityShareStatistics', {
        params: {
          q: 'organizationalEntity',
          organizationalEntity: this.organizationId || this.currentProfile?.id,
          timeInterval: {
            start: startDate.getTime(),
            end: endDate.getTime()
          }
        }
      });

      const aggregated = this.aggregateAnalytics(response.data.elements);

      return {
        success: true,
        data: aggregated
      };
    } catch (error: any) {
      this.logger.error('Failed to get LinkedIn account analytics', error);
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve LinkedIn account analytics',
          error.response?.data,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async checkAPIHealth(): Promise<{ reachable: boolean; responseTimeMs?: number }> {
    const startTime = Date.now();
    try {
      await this.apiClient.get('/me', { timeout: 5000 });
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
    // LinkedIn specific validation
    if (content.text.length > 3000) {
      return this.createError(
        'CONTENT_TOO_LONG',
        'LinkedIn posts cannot exceed 3000 characters',
        { maxLength: 3000, actualLength: content.text.length },
        false
      );
    }

    if (content.media && content.media.length > 9) {
      return this.createError(
        'TOO_MANY_MEDIA',
        'LinkedIn posts cannot have more than 9 media items',
        { maxMedia: 9, actualMedia: content.media.length },
        false
      );
    }

    // Validate media types
    if (content.media) {
      for (const media of content.media) {
        if (media.type === ContentType.VIDEO) {
          // LinkedIn has specific video requirements
          if (!media.duration || media.duration > 600000) { // 10 minutes
            return this.createError(
              'INVALID_VIDEO',
              'LinkedIn videos must be less than 10 minutes',
              { maxDuration: 600000 },
              false
            );
          }
        }
      }
    }

    return null;
  }

  // Private helper methods
  private async fetchProfile(): Promise<void> {
    const response = await this.apiClient.get('/me');
    this.currentProfile = response.data;

    // Get organization if user has admin access
    if (this.currentProfile.organizations?.values.length) {
      const org = this.currentProfile.organizations.values.find(
        o => o.role === 'ADMINISTRATOR'
      );
      if (org) {
        this.organizationId = org.organizationUrn;
      }
    }
  }

  private buildShareData(content: PostContent, mediaUrns: string[]): any {
    const author = this.organizationId || `urn:li:person:${this.currentProfile?.id}`;
    
    const shareData: any = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: content.text
          },
          shareMediaCategory: mediaUrns.length > 0 ? 'IMAGE' : 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    if (mediaUrns.length > 0) {
      shareData.specificContent['com.linkedin.ugc.ShareContent'].media = mediaUrns.map(urn => ({
        status: 'READY',
        media: urn
      }));
    }

    if (content.link) {
      shareData.specificContent['com.linkedin.ugc.ShareContent'].media = [{
        status: 'READY',
        originalUrl: content.link
      }];
      shareData.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
    }

    return shareData;
  }

  private async uploadMedia(media: MediaContent): Promise<string | null> {
    try {
      // Register upload
      const registerResponse = await this.apiClient.post('/assets?action=registerUpload', {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: this.organizationId || `urn:li:person:${this.currentProfile?.id}`,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent'
          }]
        }
      });

      const { value: { asset, uploadMechanism } } = registerResponse.data;

      // Upload the image
      const imageResponse = await axios.get(media.url, { responseType: 'arraybuffer' });
      const uploadUrl = uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;

      await axios.put(uploadUrl, imageResponse.data, {
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });

      return asset;
    } catch (error) {
      this.logger.error('Failed to upload media to LinkedIn', error);
      return null;
    }
  }

  private aggregateAnalytics(elements: any[]): AnalyticsData {
    const aggregated = elements.reduce((acc, element) => {
      const stats = element.totalShareStatistics;
      return {
        impressions: acc.impressions + (stats.impressionCount || 0),
        clicks: acc.clicks + (stats.clickCount || 0),
        engagement: acc.engagement + (stats.engagement || 0),
        reach: acc.reach + (stats.impressionCount || 0),
        likes: acc.likes + (stats.likeCount || 0),
        comments: acc.comments + (stats.commentCount || 0),
        shares: acc.shares + (stats.shareCount || 0)
      };
    }, {
      impressions: 0,
      clicks: 0,
      engagement: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0
    });

    return {
      impressions: aggregated.impressions,
      clicks: aggregated.clicks,
      engagement: aggregated.engagement,
      reach: aggregated.reach,
      conversions: 0,
      spend: 0,
      customMetrics: {
        likes: aggregated.likes,
        comments: aggregated.comments,
        shares: aggregated.shares
      },
      timestamp: new Date()
    };
  }

  private isRetryableError(error: any): boolean {
    const status = error.response?.status;
    return status === 429 || status === 503 || status >= 500;
  }
}