import { Decimal } from 'decimal.js';

export type ChannelType = 
  | 'organic_search'
  | 'paid_search'
  | 'social_media'
  | 'email'
  | 'direct'
  | 'referral'
  | 'display'
  | 'affiliate'
  | 'content'
  | 'other';

export type LeadStatus = 
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'converted'
  | 'lost';

export type AttributionModel =
  | 'first_touch'
  | 'last_touch'
  | 'linear'
  | 'time_decay'
  | 'u_shaped'
  | 'w_shaped'
  | 'data_driven';

export interface Lead {
  id: string;
  externalId?: string;
  email: string;
  sourceChannel: ChannelType;
  campaignId?: string;
  status: LeadStatus;
  qualityScore?: number;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface Customer {
  id: string;
  leadId?: string;
  externalId?: string;
  email: string;
  acquisitionDate: Date;
  acquisitionChannel: ChannelType;
  acquisitionCost?: number;
  lifetimeValue?: number;
  churnDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface MarketingCost {
  id: string;
  channel: ChannelType;
  campaignId?: string;
  costDate: Date;
  amount: number;
  currency: string;
  impressions?: number;
  clicks?: number;
  createdAt: Date;
  metadata: Record<string, any>;
}

export interface ContentItem {
  id: string;
  externalId?: string;
  title: string;
  type: string;
  channel: ChannelType;
  productionCost?: number;
  distributionCost?: number;
  publishedDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface ContentMetrics {
  id: string;
  contentId: string;
  metricDate: Date;
  views: number;
  uniqueViews: number;
  shares: number;
  comments: number;
  likes: number;
  conversions: number;
  revenueAttributed: number;
  createdAt: Date;
}

export interface ChannelTouchpoint {
  id: string;
  leadId?: string;
  customerId?: string;
  channel: ChannelType;
  touchpointDate: Date;
  positionInJourney: number;
  interactionType?: string;
  attributionWeight: number;
  createdAt: Date;
  metadata: Record<string, any>;
}

export interface Revenue {
  id: string;
  customerId: string;
  amount: number;
  revenueDate: Date;
  type: string;
  recurring: boolean;
  createdAt: Date;
  metadata: Record<string, any>;
}

export interface KPICalculation {
  id: string;
  kpiType: string;
  calculationDate: Date;
  timePeriod: string;
  channel?: ChannelType;
  value: number;
  details: Record<string, any>;
  createdAt: Date;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface KPIFilters {
  channels?: ChannelType[];
  campaigns?: string[];
  dateRange?: DateRange;
  groupBy?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

export interface CostPerLeadMetrics {
  totalCost: Decimal;
  totalLeads: number;
  costPerLead: Decimal;
  channelBreakdown: Record<ChannelType, {
    cost: Decimal;
    leads: number;
    cpl: Decimal;
  }>;
  qualityAdjustedCPL: Decimal;
  trend: {
    previousPeriod: Decimal;
    changePercent: Decimal;
  };
}

export interface CustomerAcquisitionCostMetrics {
  totalCost: Decimal;
  totalCustomers: number;
  cac: Decimal;
  channelCAC: Record<ChannelType, {
    cost: Decimal;
    customers: number;
    cac: Decimal;
  }>;
  paybackPeriod: number; // in months
  ltvToCacRatio: Decimal;
  cohortAnalysis: {
    cohort: string;
    cac: Decimal;
    ltv: Decimal;
    paybackMonths: number;
  }[];
}

export interface ContentROIMetrics {
  contentId: string;
  totalCost: Decimal;
  totalRevenue: Decimal;
  roi: Decimal;
  roiPercent: Decimal;
  engagementValue: Decimal;
  performanceMetrics: {
    views: number;
    engagements: number;
    conversions: number;
    engagementRate: Decimal;
    conversionRate: Decimal;
  };
  distributionBreakdown: {
    channel: ChannelType;
    cost: Decimal;
    revenue: Decimal;
    roi: Decimal;
  }[];
}

export interface ChannelAttributionMetrics {
  model: AttributionModel;
  totalRevenue: Decimal;
  channelContributions: Record<ChannelType, {
    revenue: Decimal;
    percentage: Decimal;
    touchpoints: number;
    averagePosition: number;
  }>;
  pathAnalysis: {
    path: ChannelType[];
    frequency: number;
    revenue: Decimal;
    conversionRate: Decimal;
  }[];
  recommendations: {
    channel: ChannelType;
    currentBudget: Decimal;
    recommendedBudget: Decimal;
    expectedImpact: Decimal;
  }[];
}

export interface MRRMetrics {
  currentMRR: Decimal;
  newMRR: Decimal;
  expansionMRR: Decimal;
  churnedMRR: Decimal;
  netNewMRR: Decimal;
  growthRate: Decimal;
  customerCount: number;
  arpu: Decimal; // Average Revenue Per User
  trend: {
    previous: Decimal;
    changePercent: Decimal;
  };
}

export interface ChurnMetrics {
  customerChurnRate: Decimal;
  revenueChurnRate: Decimal;
  totalChurned: number;
  totalActive: number;
  averageLifetime: number; // in months
  churnByChannel: Record<ChannelType, {
    count: number;
    rate: Decimal;
  }>;
  cohortRetention: {
    cohort: string;
    month: number;
    retained: number;
    retentionRate: Decimal;
  }[];
}

export interface EmailMarketingMetrics {
  campaignId: string;
  sent: number;
  delivered: number;
  deliveryRate: Decimal;
  opened: number;
  openRate: Decimal;
  clicked: number;
  clickRate: Decimal;
  ctr: Decimal; // Click-through rate
  conversions: number;
  conversionRate: Decimal;
  revenue: Decimal;
  roi: Decimal;
  unsubscribed: number;
  unsubscribeRate: Decimal;
  bounced: number;
  bounceRate: Decimal;
}

export interface SocialMediaROIMetrics {
  platform: string;
  spend: Decimal;
  revenue: Decimal;
  roi: Decimal;
  followers: number;
  impressions: number;
  engagements: number;
  engagementRate: Decimal;
  clicks: number;
  ctr: Decimal;
  conversions: number;
  conversionRate: Decimal;
  costPerEngagement: Decimal;
  costPerConversion: Decimal;
}

export interface SEOMetrics {
  organicTraffic: number;
  trafficGrowth: Decimal;
  keywordRankings: {
    keyword: string;
    position: number;
    previousPosition: number;
    searchVolume: number;
    difficulty: number;
  }[];
  backlinks: number;
  domainAuthority: number;
  pageAuthority: number;
  bounceRate: Decimal;
  avgSessionDuration: number;
  pagesPerSession: Decimal;
  conversions: number;
  conversionRate: Decimal;
  estimatedValue: Decimal;
}