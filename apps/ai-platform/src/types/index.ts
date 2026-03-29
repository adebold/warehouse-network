/**
 * Core Type Definitions for AI/ML Platform
 */

// Base Model Types
export interface BaseModel {
  id: string;
  name: string;
  version: string;
  type: ModelType;
  status: ModelStatus;
  metadata: ModelMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export enum ModelType {
  WAREHOUSE_MATCHING = 'warehouse-matching',
  PRICING_OPTIMIZATION = 'pricing-optimization',
  PREDICTIVE_MAINTENANCE = 'predictive-maintenance',
  INVENTORY_OPTIMIZATION = 'inventory-optimization',
  FRAUD_DETECTION = 'fraud-detection',
  BEHAVIOR_ANALYSIS = 'behavior-analysis',
  DEMAND_FORECASTING = 'demand-forecasting',
  CHATBOT_NLP = 'chatbot-nlp'
}

export enum ModelStatus {
  TRAINING = 'training',
  TRAINED = 'trained',
  DEPLOYED = 'deployed',
  ARCHIVED = 'archived',
  FAILED = 'failed'
}

export interface ModelMetadata {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  trainingTime?: number;
  trainingDataSize?: number;
  hyperparameters?: Record<string, any>;
  features?: string[];
  target?: string;
  algorithmType?: string;
  framework?: string;
}

// Warehouse Matching Types
export interface WarehouseMatchingInput {
  customerId: string;
  requirements: {
    location: {
      latitude: number;
      longitude: number;
      radius?: number; // km
    };
    spaceNeeded: number; // sqft
    duration: {
      startDate: Date;
      endDate: Date;
    };
    amenities?: string[];
    maxPrice?: number;
    warehouseType?: string[];
  };
  preferences?: {
    proximity: number; // 0-1 weight
    price: number; // 0-1 weight
    amenities: number; // 0-1 weight
    rating: number; // 0-1 weight
  };
}

export interface WarehouseMatchingOutput {
  matches: WarehouseMatch[];
  totalMatches: number;
  searchMetadata: {
    searchRadius: number;
    filtersApplied: string[];
    scoringWeights: Record<string, number>;
  };
}

export interface WarehouseMatch {
  warehouseId: string;
  score: number;
  confidence: number;
  reasons: string[];
  priceEstimate: number;
  distanceKm: number;
  amenityMatch: number;
  availabilityScore: number;
}

// Pricing Optimization Types
export interface PricingOptimizationInput {
  warehouseId: string;
  timeRange: {
    startDate: Date;
    endDate: Date;
  };
  marketConditions: {
    demand: number;
    supply: number;
    seasonality: number;
    competitorPrices: number[];
  };
  warehouseFeatures: {
    location: { latitude: number; longitude: number };
    size: number;
    amenities: string[];
    rating: number;
  };
  historicalData?: {
    occupancyRates: number[];
    revenues: number[];
    customerSatisfaction: number[];
  };
}

export interface PricingOptimizationOutput {
  recommendedPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  confidence: number;
  factors: {
    demandMultiplier: number;
    competitorImpact: number;
    seasonalAdjustment: number;
    locationPremium: number;
  };
  revenueProjection: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

// Predictive Maintenance Types
export interface PredictiveMaintenanceInput {
  equipmentId: string;
  equipmentType: string;
  sensorData: {
    temperature: number;
    vibration: number;
    pressure: number;
    humidity: number;
    operatingHours: number;
    lastMaintenance: Date;
  };
  historicalData?: {
    failureHistory: MaintenanceEvent[];
    usagePatterns: UsagePattern[];
  };
}

export interface MaintenanceEvent {
  date: Date;
  type: 'repair' | 'replacement' | 'inspection';
  cost: number;
  downtime: number; // hours
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface UsagePattern {
  date: Date;
  operatingHours: number;
  loadFactor: number;
  environmentalConditions: Record<string, number>;
}

export interface PredictiveMaintenanceOutput {
  riskScore: number; // 0-1
  timeToFailure: number; // days
  recommendedAction: 'monitor' | 'schedule' | 'immediate';
  maintenanceType: string;
  costEstimate: number;
  confidenceLevel: number;
  anomalies: string[];
}

// Inventory Optimization Types
export interface InventoryOptimizationInput {
  warehouseId: string;
  currentInventory: InventoryItem[];
  historicalDemand: DemandHistory[];
  supplierData: SupplierInfo[];
  constraints: {
    maxStorageCapacity: number;
    budgetLimit: number;
    leadTimes: Record<string, number>;
  };
}

export interface InventoryItem {
  productId: string;
  currentStock: number;
  unitCost: number;
  storageRequirement: number; // sqft
  category: string;
}

export interface DemandHistory {
  productId: string;
  date: Date;
  quantity: number;
  seasonality: number;
  promotions: boolean;
}

export interface SupplierInfo {
  supplierId: string;
  products: string[];
  leadTime: number; // days
  reliability: number; // 0-1
  costMultiplier: number;
}

export interface InventoryOptimizationOutput {
  recommendations: InventoryRecommendation[];
  totalCostSavings: number;
  spaceUtilization: number;
  riskMetrics: {
    stockoutRisk: number;
    overstockRisk: number;
    obsolescenceRisk: number;
  };
}

export interface InventoryRecommendation {
  productId: string;
  action: 'increase' | 'decrease' | 'maintain' | 'discontinue';
  recommendedStock: number;
  currentStock: number;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
}

// Fraud Detection Types
export interface FraudDetectionInput {
  transaction?: {
    id: string;
    userId: string;
    amount: number;
    timestamp: Date;
    paymentMethod: string;
    location: { latitude: number; longitude: number };
    merchantId?: string;
  };
  account?: {
    userId: string;
    accountAge: number; // days
    previousTransactions: number;
    deviceFingerprint: string;
    ipAddress: string;
    behaviorPattern: Record<string, any>;
  };
  context: {
    timeOfDay: number;
    dayOfWeek: number;
    isHoliday: boolean;
    unusualActivity: boolean;
  };
}

export interface FraudDetectionOutput {
  riskScore: number; // 0-1
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  decision: 'approve' | 'review' | 'decline';
  confidence: number;
  riskFactors: string[];
  explanations: string[];
}

// Behavior Analysis Types
export interface BehaviorAnalysisInput {
  userId: string;
  sessionData: {
    timestamp: Date;
    actions: UserAction[];
    duration: number;
    deviceInfo: Record<string, any>;
  };
  historicalData?: {
    pastSessions: SessionSummary[];
    preferences: UserPreference[];
    purchases: PurchaseHistory[];
  };
}

export interface UserAction {
  timestamp: Date;
  type: 'click' | 'view' | 'search' | 'filter' | 'book' | 'cancel';
  target: string;
  metadata?: Record<string, any>;
}

export interface SessionSummary {
  date: Date;
  duration: number;
  actionCount: number;
  conversionType?: string;
  satisfaction?: number;
}

export interface UserPreference {
  category: string;
  value: any;
  confidence: number;
  lastUpdated: Date;
}

export interface PurchaseHistory {
  date: Date;
  warehouseId: string;
  amount: number;
  duration: number; // days
  satisfaction: number;
}

export interface BehaviorAnalysisOutput {
  userSegment: string;
  personalityProfile: PersonalityProfile;
  churnRisk: number;
  lifetimeValue: number;
  recommendations: PersonalizationRecommendation[];
  nextBestAction: string;
}

export interface PersonalityProfile {
  pricesensitivity: number; // 0-1
  locationImportance: number; // 0-1
  amenityPreference: number; // 0-1
  loyaltyScore: number; // 0-1
  riskTolerance: number; // 0-1
}

export interface PersonalizationRecommendation {
  type: 'product' | 'pricing' | 'communication' | 'feature';
  content: string;
  priority: number;
  expectedImpact: number;
}

// Demand Forecasting Types
export interface DemandForecastingInput {
  timeHorizon: number; // days
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly';
  location?: {
    latitude: number;
    longitude: number;
    radius: number;
  };
  category?: string;
  historicalData: DemandDataPoint[];
  externalFactors?: {
    seasonality: boolean;
    holidays: Date[];
    events: ExternalEvent[];
    economicIndicators: Record<string, number>;
  };
}

export interface DemandDataPoint {
  timestamp: Date;
  demand: number;
  price: number;
  supply: number;
  externalFactors?: Record<string, number>;
}

export interface ExternalEvent {
  date: Date;
  type: string;
  impact: number; // -1 to 1
  description: string;
}

export interface DemandForecastingOutput {
  forecast: ForecastPoint[];
  confidence: number;
  seasonalComponents: Record<string, number>;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  accuracy: {
    mae: number; // Mean Absolute Error
    mape: number; // Mean Absolute Percentage Error
    rmse: number; // Root Mean Square Error
  };
}

export interface ForecastPoint {
  timestamp: Date;
  predictedDemand: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  factors: Record<string, number>;
}

// Chatbot NLP Types
export interface ChatbotInput {
  message: string;
  userId?: string;
  sessionId: string;
  context: {
    previousMessages: ChatMessage[];
    userProfile?: UserProfile;
    currentPage?: string;
    timestamp: Date;
  };
}

export interface ChatMessage {
  timestamp: Date;
  sender: 'user' | 'bot';
  message: string;
  intent?: string;
  entities?: Record<string, any>;
}

export interface UserProfile {
  id: string;
  preferences: Record<string, any>;
  history: string[];
  segment: string;
}

export interface ChatbotOutput {
  response: string;
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  actions: BotAction[];
  followUp?: string[];
  escalate?: boolean;
}

export interface BotAction {
  type: 'search' | 'book' | 'redirect' | 'call_api' | 'escalate';
  parameters: Record<string, any>;
  priority: number;
}

// Pipeline and Processing Types
export interface PipelineJob {
  id: string;
  type: string;
  input: any;
  output?: any;
  status: JobStatus;
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// API Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    processingTime: number;
    modelVersion: string;
    confidence?: number;
  };
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Configuration Types
export interface AIConfig {
  models: Record<string, ModelConfig>;
  database: DatabaseConfig;
  redis: RedisConfig;
  api: APIConfig;
  monitoring: MonitoringConfig;
}

export interface ModelConfig {
  enabled: boolean;
  version: string;
  endpoint?: string;
  parameters: Record<string, any>;
  thresholds: Record<string, number>;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  pool?: {
    min: number;
    max: number;
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database: number;
  ttl: number;
}

export interface APIConfig {
  port: number;
  cors: boolean;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  authentication: {
    enabled: boolean;
    secret: string;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsInterval: number;
  alertThresholds: Record<string, number>;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}