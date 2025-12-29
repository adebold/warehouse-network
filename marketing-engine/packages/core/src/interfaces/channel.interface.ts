import { Logger } from 'winston';

export enum ChannelType {
  LINKEDIN = 'linkedin',
  GOOGLE_ADS = 'google-ads',
  TWITTER = 'twitter',
  BLOG = 'blog',
  EMAIL = 'email'
}

export enum ContentType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  CAROUSEL = 'carousel',
  DOCUMENT = 'document'
}

export interface ChannelCredentials {
  channelType: ChannelType;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  additionalData?: Record<string, any>;
}

export interface PostContent {
  id?: string;
  text: string;
  media?: MediaContent[];
  hashtags?: string[];
  mentions?: string[];
  link?: string;
  metadata?: Record<string, any>;
}

export interface MediaContent {
  type: ContentType;
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  duration?: number; // for video
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface ScheduleOptions {
  scheduledAt: Date;
  timezone?: string;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    endDate?: Date;
  };
}

export interface AnalyticsData {
  impressions: number;
  clicks: number;
  engagement: number;
  reach: number;
  conversions?: number;
  spend?: number;
  customMetrics?: Record<string, number>;
  timestamp: Date;
}

export interface ChannelResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ChannelError;
  metadata?: Record<string, any>;
}

export interface ChannelError {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
  retryAfter?: number; // seconds
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  maxConcurrent?: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface ChannelConfig {
  channelType: ChannelType;
  credentials: ChannelCredentials;
  rateLimits: RateLimitConfig;
  retry: RetryConfig;
  webhookUrl?: string;
  customHeaders?: Record<string, string>;
}

export interface IChannelAdapter {
  readonly channelType: ChannelType;
  readonly logger: Logger;
  
  // Authentication
  authenticate(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>>;
  refreshCredentials(credentials: ChannelCredentials): Promise<ChannelResponse<ChannelCredentials>>;
  validateCredentials(credentials: ChannelCredentials): Promise<boolean>;
  
  // Content Management
  createPost(content: PostContent, options?: ScheduleOptions): Promise<ChannelResponse<PostResult>>;
  updatePost(postId: string, content: Partial<PostContent>): Promise<ChannelResponse<PostResult>>;
  deletePost(postId: string): Promise<ChannelResponse<void>>;
  getPost(postId: string): Promise<ChannelResponse<PostResult>>;
  
  // Analytics
  getAnalytics(postId: string, startDate: Date, endDate: Date): Promise<ChannelResponse<AnalyticsData>>;
  getAccountAnalytics(startDate: Date, endDate: Date): Promise<ChannelResponse<AnalyticsData>>;
  
  // Health & Status
  healthCheck(): Promise<ChannelResponse<HealthStatus>>;
  getRateLimitStatus(): Promise<RateLimitStatus>;
}

export interface PostResult {
  id: string;
  url?: string;
  status: 'published' | 'scheduled' | 'draft' | 'failed';
  publishedAt?: Date;
  scheduledAt?: Date;
  metrics?: Partial<AnalyticsData>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastChecked: Date;
  apiStatus?: {
    reachable: boolean;
    responseTimeMs: number;
  };
}

export interface RateLimitStatus {
  remaining: number;
  total: number;
  resetsAt: Date;
  isLimited: boolean;
}