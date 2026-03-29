/**
 * Core Analytics Types and Interfaces
 * Comprehensive type definitions for the Skidspace analytics system
 */

// =============================================================================
// EVENT TRACKING TYPES
// =============================================================================

export interface AnalyticsEventData {
  eventName: string;
  eventCategory: 'user_action' | 'system' | 'business' | 'error' | 'performance';
  eventType: string;
  userId?: string;
  sessionId?: string;
  tenantId?: string;

  // Context data
  pageUrl?: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  deviceType?: string;
  browser?: string;
  os?: string;

  // Custom properties
  eventProperties?: Record<string, any>;
  customProperties?: Record<string, any>;

  // Business context
  warehouseId?: string;
  bookingId?: string;

  timestamp?: Date;
}

export interface SessionData {
  sessionId: string;
  userId?: string;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  entryPage?: string;
  exitPage?: string;
  pageViews?: number;
  sessionDuration?: number; // seconds
  isBounce?: boolean;
  conversionEvents?: ConversionEvent[];
  country?: string;
  region?: string;
  city?: string;
  startedAt: Date;
  endedAt?: Date;
}

export interface ConversionEvent {
  eventName: string;
  timestamp: Date;
  value?: number;
  currency?: string;
  properties?: Record<string, any>;
}

// =============================================================================
// METRICS AND KPI TYPES
// =============================================================================

export interface KPIMetrics {
  // User metrics
  activeUsers: number;
  newUsers: number;
  returningUsers: number;
  totalSessions: number;
  avgSessionDuration: number;
  bounceRate: number;

  // Business metrics
  totalBookings: number;
  successfulBookings: number;
  cancelledBookings: number;
  conversionRate: number;
  totalRevenue: number;
  avgBookingValue: number;

  // Warehouse metrics
  totalWarehouseViews: number;
  warehouseConversionRate: number;
  occupancyRate: number;

  // Platform metrics
  platformFeeCollected: number;
  paymentProcessingFees: number;
  netRevenue: number;
}

export interface MetricFilter {
  startDate: Date;
  endDate: Date;
  tenantId?: string;
  warehouseId?: string;
  segmentBy?: 'day' | 'week' | 'month' | 'quarter';
  filters?: {
    userType?: 'new' | 'returning';
    deviceType?: string;
    region?: string;
    bookingType?: string;
    status?: string;
  };
}

export interface MetricTrend {
  period: string; // ISO date string
  value: number;
  change?: number; // percentage change from previous period
  changeDirection?: 'up' | 'down' | 'stable';
}

export interface MetricComparison {
  current: {
    value: number;
    period: string;
  };
  previous: {
    value: number;
    period: string;
  };
  change: number; // percentage
  changeDirection: 'up' | 'down' | 'stable';
}

// =============================================================================
// CUSTOMER BEHAVIOR TYPES
// =============================================================================

export interface CustomerJourneyData {
  userId?: string;
  sessionId?: string;
  tenantId?: string;
  touchpoints: Touchpoint[];
  conversionEvents: ConversionEvent[];
  journeyStage: 'awareness' | 'consideration' | 'intent' | 'purchase' | 'retention';
  totalTouchpoints: number;
  journeyDuration?: number; // seconds
  converted: boolean;
  conversionValue?: number;
  firstTouchChannel?: string;
  lastTouchChannel?: string;
  attributionModel: 'first_click' | 'last_click' | 'linear' | 'time_decay';
  startedAt: Date;
  completedAt?: Date;
}

export interface Touchpoint {
  timestamp: Date;
  channel: string;
  source?: string;
  medium?: string;
  campaign?: string;
  page?: string;
  action?: string;
  properties?: Record<string, any>;
}

export interface FunnelAnalysis {
  funnelName: string;
  tenantId: string;
  steps: FunnelStep[];
  dateRange: {
    start: Date;
    end: Date;
  };
  totalEntries: number;
  overallConversionRate: number;
  dropOffPoints: string[];
  insights: string[];
}

export interface FunnelStep {
  name: string;
  description?: string;
  position: number;
  completions: number;
  completionRate: number;
  dropOffRate: number;
  avgTimeToComplete?: number; // seconds
}

export interface CohortAnalysisData {
  cohortName: string;
  cohortType: 'user_acquisition' | 'first_purchase' | 'feature_adoption';
  cohortPeriod: 'daily' | 'weekly' | 'monthly';
  cohorts: CohortData[];
  averageRetention: number[];
  averageLifetimeValue: number;
  insights: string[];
}

export interface CohortData {
  cohortId: string;
  period: string; // ISO date string
  initialSize: number;
  retentionRates: number[]; // retention for each subsequent period
  revenueData: number[]; // revenue per cohort per period
}

// =============================================================================
// FORECASTING TYPES
// =============================================================================

export interface ForecastData {
  forecastName: string;
  forecastType: 'revenue' | 'bookings' | 'users' | 'custom';
  timePeriod: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  forecastHorizon: number; // number of periods to forecast
  modelType: 'linear_regression' | 'arima' | 'prophet' | 'exponential_smoothing';
  modelAccuracy: number; // 0-1 score
  historicalData: DataPoint[];
  forecastData: ForecastPoint[];
  generatedAt: Date;
  validUntil: Date;
}

export interface DataPoint {
  period: string;
  value: number;
  metadata?: Record<string, any>;
}

export interface ForecastPoint {
  period: string;
  predictedValue: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  probability?: number;
}

// =============================================================================
// ALERTING AND MONITORING TYPES
// =============================================================================

export interface AlertRule {
  id: string;
  tenantId: string;
  ruleName: string;
  description?: string;
  metricName: string;
  conditionType: 'greater_than' | 'less_than' | 'equals' | 'change_rate';
  thresholdValue: number;
  comparisonPeriod?: 'hour' | 'day' | 'week' | 'month';
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  notificationChannels: NotificationChannel[];
  evaluationFrequency: 'minutely' | 'hourly' | 'daily';
  suppressDuration: number; // seconds
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationChannel {
  type: 'email' | 'sms' | 'slack' | 'webhook' | 'push';
  target: string; // email address, phone number, webhook URL, etc.
  isActive: boolean;
  settings?: Record<string, any>;
}

export interface AlertNotification {
  id: string;
  alertRuleId: string;
  tenantId: string;
  alertLevel: string;
  message: string;
  metricValue?: number;
  thresholdValue?: number;
  notificationChannels: NotificationChannel[];
  deliveryStatus: Record<string, 'pending' | 'delivered' | 'failed'>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolutionNotes?: string;
  triggeredAt: Date;
}

// =============================================================================
// DASHBOARD AND VISUALIZATION TYPES
// =============================================================================

export interface DashboardConfig {
  id: string;
  name: string;
  description?: string;
  tenantId: string;
  userId?: string;
  isDefault: boolean;
  layout: DashboardLayout;
  widgets: WidgetConfig[];
  filters: DashboardFilter[];
  permissions: DashboardPermission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardLayout {
  type: 'grid' | 'flexbox' | 'custom';
  columns: number;
  rows: number;
  responsive: boolean;
  breakpoints?: Record<string, any>;
}

export interface WidgetConfig {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'map' | 'text' | 'custom';
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  dataSource: DataSourceConfig;
  visualization: VisualizationConfig;
  filters: WidgetFilter[];
  refreshInterval?: number; // seconds
  isVisible: boolean;
}

export interface DataSourceConfig {
  type: 'realtime' | 'batch' | 'api' | 'custom';
  query: string;
  parameters?: Record<string, any>;
  cacheEnabled: boolean;
  cacheDuration?: number; // seconds
}

export interface VisualizationConfig {
  chartType?: 'line' | 'bar' | 'pie' | 'scatter' | 'area' | 'gauge' | 'table';
  xAxis?: string;
  yAxis?: string[];
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  customOptions?: Record<string, any>;
}

export interface DashboardFilter {
  name: string;
  type: 'date' | 'select' | 'multiselect' | 'text' | 'number';
  defaultValue?: any;
  options?: any[];
  isRequired: boolean;
  appliesToWidgets: string[]; // widget IDs
}

export interface WidgetFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'between';
  value: any;
}

export interface DashboardPermission {
  userId?: string;
  roleId?: string;
  permission: 'view' | 'edit' | 'admin';
}

// =============================================================================
// PERFORMANCE MONITORING TYPES
// =============================================================================

export interface SystemPerformanceMetrics {
  timestamp: Date;
  cpuUsage?: number; // percentage
  memoryUsage?: number; // percentage
  diskUsage?: number; // percentage
  networkIo?: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  dbConnections?: number;
  dbSlowQueries?: number;
  dbAvgResponseTime?: number; // milliseconds
  apiRequestsPerSecond?: number;
  apiAvgResponseTime?: number; // milliseconds
  apiErrorRate?: number; // percentage
  activeSessions?: number;
  concurrentBookings?: number;
  searchQueriesPerSecond?: number;
  paymentSuccessRate?: number; // percentage
}

export interface PerformanceAlert {
  metric: keyof SystemPerformanceMetrics;
  threshold: number;
  currentValue: number;
  severity: 'warning' | 'error' | 'critical';
  timestamp: Date;
  resolved: boolean;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface AnalyticsResponse<T = any> {
  success: boolean;
  data: T;
  metadata?: {
    totalRecords?: number;
    pageSize?: number;
    currentPage?: number;
    hasNext?: boolean;
    executionTime?: number;
  };
  errors?: string[];
  warnings?: string[];
}

export interface RealtimeUpdate {
  type: 'metric_update' | 'alert' | 'system_status' | 'user_activity';
  tenantId?: string;
  data: any;
  timestamp: Date;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface AnalyticsConfig {
  // Data retention
  dataRetentionDays: number;
  aggregationIntervals: string[]; // ['1h', '1d', '1w', '1m']

  // Real-time processing
  realtimeEnabled: boolean;
  batchProcessingInterval: number; // minutes

  // Performance
  cacheEnabled: boolean;
  cacheTTL: number; // seconds
  maxConcurrentQueries: number;

  // Security
  dataSampling: number; // percentage (for large datasets)
  anonymizeUserData: boolean;
  encryptSensitiveData: boolean;

  // External integrations
  webhookEndpoints: string[];
  slackIntegration?: {
    webhookUrl: string;
    channel: string;
  };
  emailNotifications?: {
    fromAddress: string;
    smtpConfig: any;
  };
}

export interface ExportConfig {
  format: 'csv' | 'json' | 'xlsx' | 'pdf';
  includeHeaders: boolean;
  dateFormat?: string;
  timezone?: string;
  compression?: 'gzip' | 'zip' | 'none';
  maxRecords?: number;
  customFields?: string[];
}