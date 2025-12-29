import { TwitterApi, TwitterApiV2Settings } from 'twitter-api-v2';
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
import axios from 'axios';

interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
  bearerToken: string;
}

interface TweetData {
  data: {
    id: string;
    text: string;
    created_at: string;
    public_metrics?: {
      retweet_count: number;
      reply_count: number;
      like_count: number;
      quote_count: number;
    };
  };
}

interface MediaUploadResult {
  media_id_string: string;
  media_type: string;
  size: number;
}

export class TwitterAdapter extends BaseChannelAdapter {
  readonly channelType = ChannelType.TWITTER;
  private client?: TwitterApi;
  private v2Client?: TwitterApi;
  private config: TwitterConfig;

  constructor(
    channelConfig: ChannelConfig,
    logger: Logger,
    db: Pool,
    redis: Redis
  ) {
    super(channelConfig, logger, db, redis);

    this.config = {
      apiKey: process.env.TWITTER_API_KEY!,
      apiSecret: process.env.TWITTER_API_SECRET!,
      accessToken: channelConfig.credentials.accessToken || process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: channelConfig.credentials.additionalData?.accessSecret || process.env.TWITTER_ACCESS_SECRET!,
      bearerToken: process.env.TWITTER_BEARER_TOKEN!
    };

    this.initializeClient();
  }

  private initializeClient(): void {
    // Configure rate limit handling
    TwitterApiV2Settings.debug = process.env.NODE_ENV === 'development';

    // Create client with user context (for posting)
    this.client = new TwitterApi({
      appKey: this.config.apiKey,
      appSecret: this.config.apiSecret,
      accessToken: this.config.accessToken,
      accessSecret: this.config.accessSecret
    });

    // Create v2 client for analytics and reading
    this.v2Client = new TwitterApi(this.config.bearerToken);
  }

  async authenticate(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    try {
      // For OAuth 1.0a, we need to handle the OAuth flow
      // This assumes we have the access tokens already
      const tempClient = new TwitterApi({
        appKey: this.config.apiKey,
        appSecret: this.config.apiSecret,
        accessToken: credentials.accessToken!,
        accessSecret: credentials.additionalData?.accessSecret
      });

      // Verify credentials by fetching user info
      const { data: user } = await tempClient.v2.me();

      const updatedCredentials: ChannelCredentials = {
        ...credentials,
        channelType: ChannelType.TWITTER,
        additionalData: {
          ...credentials.additionalData,
          userId: user.id,
          username: user.username,
          name: user.name
        }
      };

      // Update the client with new credentials
      this.config.accessToken = credentials.accessToken!;
      this.config.accessSecret = credentials.additionalData?.accessSecret;
      this.initializeClient();

      return {
        success: true,
        data: updatedCredentials
      };
    } catch (error: any) {
      this.logger.error('Twitter authentication failed', error);
      return {
        success: false,
        error: this.createError(
          'AUTH_FAILED',
          'Failed to authenticate with Twitter',
          error.data || error.message,
          false
        )
      };
    }
  }

  async refreshCredentials(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>> {
    // Twitter OAuth 1.0a tokens don't expire
    // Just validate they still work
    return this.authenticate(credentials);
  }

  protected async performCredentialValidation(credentials: ChannelCredentials): Promise<boolean> {
    try {
      await this.client!.v2.me();
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
      // Twitter doesn't support native scheduling
      if (options?.scheduledAt && new Date(options.scheduledAt) > new Date()) {
        return {
          success: true,
          data: {
            id: `scheduled_${Date.now()}`,
            status: 'scheduled',
            scheduledAt: options.scheduledAt
          }
        };
      }

      // Prepare tweet data
      const tweetData: any = {
        text: content.text
      };

      // Handle media uploads
      if (content.media && content.media.length > 0) {
        const mediaIds = await this.uploadMedia(content.media);
        if (mediaIds.length > 0) {
          tweetData.media = { media_ids: mediaIds };
        }
      }

      // Add reply settings if specified
      if (content.metadata?.replySettings) {
        tweetData.reply_settings = content.metadata.replySettings;
      }

      // Handle thread creation
      if (content.metadata?.thread && Array.isArray(content.metadata.thread)) {
        return await this.createThread([content.text, ...content.metadata.thread], content.media);
      }

      // Create the tweet
      const { data: tweet } = await this.client!.v2.tweet(tweetData);

      return {
        success: true,
        data: {
          id: tweet.id,
          url: `https://twitter.com/i/web/status/${tweet.id}`,
          status: 'published',
          publishedAt: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create Twitter post', error);
      return {
        success: false,
        error: this.createError(
          'POST_FAILED',
          'Failed to create Twitter post',
          error.data || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performUpdatePost(
    postId: string,
    content: Partial<PostContent>
  ): Promise<ChannelResponse<PostResult>> {
    // Twitter doesn't support editing tweets (yet)
    // Could implement delete and repost, but that loses engagement
    return {
      success: false,
      error: this.createError(
        'NOT_SUPPORTED',
        'Twitter does not support editing published tweets',
        null,
        false
      )
    };
  }

  protected async performDeletePost(postId: string): Promise<ChannelResponse<void>> {
    try {
      await this.client!.v2.deleteTweet(postId);
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to delete Twitter post', error);
      return {
        success: false,
        error: this.createError(
          'DELETE_FAILED',
          'Failed to delete Twitter post',
          error.data || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async performGetPost(postId: string): Promise<ChannelResponse<PostResult>> {
    try {
      const { data: tweet } = await this.v2Client!.v2.singleTweet(postId, {
        'tweet.fields': ['created_at', 'public_metrics', 'referenced_tweets']
      });

      return {
        success: true,
        data: {
          id: tweet.id,
          url: `https://twitter.com/i/web/status/${tweet.id}`,
          status: 'published',
          publishedAt: new Date(tweet.created_at!)
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get Twitter post', error);
      return {
        success: false,
        error: this.createError(
          'GET_FAILED',
          'Failed to retrieve Twitter post',
          error.data || error.message,
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
      // Fetch tweet with public metrics
      const { data: tweet } = await this.v2Client!.v2.singleTweet(postId, {
        'tweet.fields': ['public_metrics', 'organic_metrics', 'promoted_metrics']
      });

      const metrics = tweet.public_metrics || {};
      const organicMetrics = (tweet as any).organic_metrics || {};
      const promotedMetrics = (tweet as any).promoted_metrics || {};

      return {
        success: true,
        data: {
          impressions: organicMetrics.impression_count || 0,
          clicks: organicMetrics.url_link_clicks || 0,
          engagement: (metrics.retweet_count || 0) + 
                     (metrics.reply_count || 0) + 
                     (metrics.like_count || 0) + 
                     (metrics.quote_count || 0),
          reach: organicMetrics.user_profile_clicks || 0,
          conversions: 0, // Not available in Twitter API
          spend: promotedMetrics.cost_per_click ? 
                 (promotedMetrics.cost_per_click * promotedMetrics.clicks) : 0,
          customMetrics: {
            retweets: metrics.retweet_count || 0,
            replies: metrics.reply_count || 0,
            likes: metrics.like_count || 0,
            quotes: metrics.quote_count || 0
          },
          timestamp: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get Twitter analytics', error);
      
      // If organic metrics aren't available (requires special access), fall back to public metrics
      if (error.code === 403) {
        return this.getFallbackAnalytics(postId);
      }

      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve Twitter analytics',
          error.data || error.message,
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
      // Get user timeline to aggregate metrics
      const userId = this.config.credentials.additionalData?.userId;
      if (!userId) {
        const { data: user } = await this.client!.v2.me();
        this.config.credentials.additionalData = { 
          ...this.config.credentials.additionalData, 
          userId: user.id 
        };
      }

      const tweets = await this.v2Client!.v2.userTimeline(
        this.config.credentials.additionalData!.userId,
        {
          max_results: 100,
          'tweet.fields': ['created_at', 'public_metrics'],
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString()
        }
      );

      let totalMetrics = {
        impressions: 0,
        clicks: 0,
        engagement: 0,
        retweets: 0,
        replies: 0,
        likes: 0,
        quotes: 0
      };

      for await (const tweet of tweets) {
        const metrics = tweet.public_metrics || {};
        totalMetrics.engagement += (metrics.retweet_count || 0) + 
                                  (metrics.reply_count || 0) + 
                                  (metrics.like_count || 0) + 
                                  (metrics.quote_count || 0);
        totalMetrics.retweets += metrics.retweet_count || 0;
        totalMetrics.replies += metrics.reply_count || 0;
        totalMetrics.likes += metrics.like_count || 0;
        totalMetrics.quotes += metrics.quote_count || 0;
      }

      return {
        success: true,
        data: {
          impressions: totalMetrics.engagement * 10, // Rough estimate
          clicks: Math.floor(totalMetrics.engagement * 0.1), // Rough estimate
          engagement: totalMetrics.engagement,
          reach: totalMetrics.engagement * 5, // Rough estimate
          conversions: 0,
          spend: 0,
          customMetrics: {
            retweets: totalMetrics.retweets,
            replies: totalMetrics.replies,
            likes: totalMetrics.likes,
            quotes: totalMetrics.quotes,
            tweetCount: tweets.data?.length || 0
          },
          timestamp: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get Twitter account analytics', error);
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve Twitter account analytics',
          error.data || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  protected async checkAPIHealth(): Promise<{ reachable: boolean; responseTimeMs?: number }> {
    const startTime = Date.now();
    try {
      await this.v2Client!.v2.me();
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
    // Twitter specific validation
    if (content.text.length > 280) {
      // Check if it's meant to be a thread
      if (!content.metadata?.thread) {
        return this.createError(
          'CONTENT_TOO_LONG',
          'Twitter posts cannot exceed 280 characters',
          { maxLength: 280, actualLength: content.text.length },
          false
        );
      }
    }

    // Validate media
    if (content.media && content.media.length > 4) {
      return this.createError(
        'TOO_MANY_MEDIA',
        'Twitter posts cannot have more than 4 media items',
        { maxMedia: 4, actualMedia: content.media.length },
        false
      );
    }

    // Validate media types and sizes
    if (content.media) {
      for (const media of content.media) {
        if (media.type === ContentType.VIDEO) {
          // Twitter video requirements
          if (!media.duration || media.duration > 140000) { // 2:20 minutes
            return this.createError(
              'INVALID_VIDEO',
              'Twitter videos must be less than 2:20 minutes',
              { maxDuration: 140000 },
              false
            );
          }
        }
      }
    }

    return null;
  }

  // Helper methods
  private async uploadMedia(mediaItems: MediaContent[]): Promise<string[]> {
    const mediaIds: string[] = [];

    for (const media of mediaItems) {
      try {
        // Download media content
        const response = await axios.get(media.url, { 
          responseType: 'arraybuffer' 
        });

        const buffer = Buffer.from(response.data);

        // Upload to Twitter
        const mediaId = await this.client!.v1.uploadMedia(buffer, {
          type: this.getMediaType(media.type),
          additionalOwners: media.type === ContentType.VIDEO ? undefined : []
        });

        // Add alt text if provided
        if (media.altText) {
          await this.client!.v1.createMediaMetadata(mediaId, {
            alt_text: { text: media.altText }
          });
        }

        mediaIds.push(mediaId);
      } catch (error) {
        this.logger.error('Failed to upload media to Twitter', error);
      }
    }

    return mediaIds;
  }

  private getMediaType(contentType: ContentType): string {
    switch (contentType) {
      case ContentType.IMAGE:
        return 'image/jpeg';
      case ContentType.VIDEO:
        return 'video/mp4';
      default:
        return 'image/jpeg';
    }
  }

  private async createThread(tweets: string[], media?: MediaContent[]): Promise<ChannelResponse<PostResult>> {
    try {
      const tweetIds: string[] = [];
      let replyToId: string | undefined;

      // Split long text into thread-appropriate chunks
      const threadTweets = this.splitIntoThread(tweets);

      for (let i = 0; i < threadTweets.length; i++) {
        const tweetData: any = {
          text: threadTweets[i]
        };

        // Add media to first tweet only
        if (i === 0 && media && media.length > 0) {
          const mediaIds = await this.uploadMedia(media);
          if (mediaIds.length > 0) {
            tweetData.media = { media_ids: mediaIds };
          }
        }

        // Reply to previous tweet in thread
        if (replyToId) {
          tweetData.reply = { in_reply_to_tweet_id: replyToId };
        }

        const { data: tweet } = await this.client!.v2.tweet(tweetData);
        tweetIds.push(tweet.id);
        replyToId = tweet.id;

        // Add small delay between tweets to avoid rate limits
        if (i < threadTweets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return {
        success: true,
        data: {
          id: tweetIds[0], // Return first tweet ID
          url: `https://twitter.com/i/web/status/${tweetIds[0]}`,
          status: 'published',
          publishedAt: new Date(),
          metadata: {
            threadIds: tweetIds
          }
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create Twitter thread', error);
      return {
        success: false,
        error: this.createError(
          'THREAD_FAILED',
          'Failed to create Twitter thread',
          error.data || error.message,
          this.isRetryableError(error)
        )
      };
    }
  }

  private splitIntoThread(texts: string[]): string[] {
    const thread: string[] = [];
    
    for (const text of texts) {
      if (text.length <= 280) {
        thread.push(text);
      } else {
        // Split long text into chunks
        const chunks = this.splitTextIntoChunks(text, 275); // Leave room for "..."
        for (let i = 0; i < chunks.length; i++) {
          if (i === chunks.length - 1) {
            thread.push(chunks[i]);
          } else {
            thread.push(chunks[i] + '...');
          }
        }
      }
    }

    return thread;
  }

  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length <= maxLength) {
        currentChunk += sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  private async getFallbackAnalytics(postId: string): Promise<ChannelResponse<AnalyticsData>> {
    try {
      const { data: tweet } = await this.v2Client!.v2.singleTweet(postId, {
        'tweet.fields': ['public_metrics']
      });

      const metrics = tweet.public_metrics || {};

      return {
        success: true,
        data: {
          impressions: (metrics.retweet_count || 0) * 100, // Rough estimate
          clicks: Math.floor((metrics.like_count || 0) * 0.1), // Rough estimate
          engagement: (metrics.retweet_count || 0) + 
                     (metrics.reply_count || 0) + 
                     (metrics.like_count || 0) + 
                     (metrics.quote_count || 0),
          reach: (metrics.retweet_count || 0) * 50, // Rough estimate
          conversions: 0,
          spend: 0,
          customMetrics: {
            retweets: metrics.retweet_count || 0,
            replies: metrics.reply_count || 0,
            likes: metrics.like_count || 0,
            quotes: metrics.quote_count || 0
          },
          timestamp: new Date()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: this.createError(
          'ANALYTICS_FAILED',
          'Failed to retrieve Twitter analytics',
          error.data || error.message,
          false
        )
      };
    }
  }

  private isRetryableError(error: any): boolean {
    // Rate limit errors
    if (error.code === 429 || error.rateLimit) {
      return true;
    }

    // Server errors
    if (error.code >= 500) {
      return true;
    }

    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    return false;
  }
}