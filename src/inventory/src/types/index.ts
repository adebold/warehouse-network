// Core type definitions for inventory management system

export interface StockLevel {
  sku: string;
  warehouse: string;
  location?: string;
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
  lastUpdated: Date;
}

export interface StockMovement {
  id: string;
  type: MovementType;
  sku: string;
  warehouse: string;
  location?: string;
  quantity: number;
  unitCost?: number;
  reason?: string;
  userId: string;
  timestamp: Date;
  batchNumber?: string;
  serialNumber?: string;
}

export enum MovementType {
  RECEIPT = 'RECEIPT',
  SHIPMENT = 'SHIPMENT',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  CYCLE_COUNT = 'CYCLE_COUNT',
  RETURN = 'RETURN',
  DAMAGE = 'DAMAGE',
  EXPIRED = 'EXPIRED',
  FOUND = 'FOUND',
  LOST = 'LOST'
}

export interface SKUDefinition {
  skuCode: string;
  name: string;
  description?: string;
  categoryId?: string;
  dimensions?: PhysicalDimensions;
  cost?: number;
  price?: number;
  attributes?: Record<string, any>;
  tags?: string[];
}

export interface PhysicalDimensions {
  length: number;
  width: number;
  height: number;
  weight: number;
  unit: 'cm' | 'in';
  weightUnit: 'kg' | 'lb';
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: Address;
  timezone: string;
  settings?: WarehouseSettings;
  active: boolean;
}

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface WarehouseSettings {
  defaultLocation?: string;
  autoReorderEnabled: boolean;
  cycleCounting: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    highValueItems: boolean;
  };
  barcodeSettings: {
    autoGenerate: boolean;
    format: BarcodeFormat;
    prefix?: string;
  };
}

export enum BarcodeFormat {
  CODE128 = 'CODE128',
  CODE39 = 'CODE39',
  EAN13 = 'EAN13',
  UPC_A = 'UPC_A',
  QR_CODE = 'QR_CODE'
}

export interface Barcode {
  id: string;
  skuId: string;
  code: string;
  format: BarcodeFormat;
  primary: boolean;
  active: boolean;
  createdAt: Date;
}

export interface ReorderRule {
  id: string;
  skuId: string;
  warehouseId: string;
  reorderLevel: number;
  reorderQuantity: number;
  leadTimeDays: number;
  safetyStock: number;
  supplierId?: string;
  active: boolean;
}

export interface ReorderAlert {
  id: string;
  reorderRuleId: string;
  skuId: string;
  warehouseId: string;
  currentLevel: number;
  reorderLevel: number;
  suggestedQuantity: number;
  status: AlertStatus;
  acknowledged: boolean;
  createdAt: Date;
}

export enum AlertStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  ORDERED = 'ORDERED',
  DISMISSED = 'DISMISSED'
}

export interface Transfer {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: TransferStatus;
  items: TransferItem[];
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  shippedAt?: Date;
  receivedAt?: Date;
  notes?: string;
  trackingNumber?: string;
}

export enum TransferStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export interface TransferItem {
  id: string;
  transferId: string;
  skuId: string;
  requestedQuantity: number;
  shippedQuantity?: number;
  receivedQuantity?: number;
  fromLocationId?: string;
  toLocationId?: string;
}

export interface DemandForecast {
  sku: string;
  warehouse?: string;
  forecasts: ForecastPoint[];
  accuracy: number;
  model: string;
  generatedAt: Date;
}

export interface ForecastPoint {
  date: Date;
  predictedDemand: number;
  confidence: number;
  seasonalFactor: number;
  trendFactor: number;
}

export interface BikeModel {
  id: string;
  modelCode: string;
  name: string;
  manufacturer: string;
  modelYear: number;
  category: string;
  specifications?: Record<string, any>;
  compatibleParts?: PartCompatibility[];
}

export interface PartCompatibility {
  id: string;
  bikeModelId: string;
  partSkuId: string;
  compatibilityType: CompatibilityType;
  notes?: string;
}

export enum CompatibilityType {
  COMPATIBLE = 'COMPATIBLE',
  RECOMMENDED = 'RECOMMENDED',
  OPTIONAL = 'OPTIONAL',
  NOT_COMPATIBLE = 'NOT_COMPATIBLE'
}

export interface ScanEvent {
  id: string;
  barcodeId: string;
  userId: string;
  warehouseId?: string;
  locationId?: string;
  scanType: ScanType;
  quantity?: number;
  metadata?: Record<string, any>;
  processed: boolean;
  createdAt: Date;
}

export enum ScanType {
  RECEIVE = 'RECEIVE',
  PICK = 'PICK',
  COUNT = 'COUNT',
  LOOKUP = 'LOOKUP',
  MOVE = 'MOVE'
}

export interface BatchTracking {
  id: string;
  skuId: string;
  batchNumber: string;
  quantity: number;
  expirationDate?: Date;
  manufacturedDate?: Date;
  supplier?: string;
  notes?: string;
}

export interface SerialNumber {
  id: string;
  skuId: string;
  serialNumber: string;
  status: SerialStatus;
  warehouseId?: string;
  locationId?: string;
  notes?: string;
}

export enum SerialStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  DAMAGED = 'DAMAGED',
  RETURNED = 'RETURNED'
}

// API Request/Response types
export interface CreateMovementRequest {
  type: MovementType;
  sku: string;
  warehouse: string;
  location?: string;
  quantity: number;
  unitCost?: number;
  reason?: string;
  batchNumber?: string;
  serialNumbers?: string[];
}

export interface UpdateStockRequest {
  sku: string;
  warehouse: string;
  location?: string;
  movements: CreateMovementRequest[];
}

export interface InventoryQuery {
  sku?: string;
  warehouse?: string;
  location?: string;
  category?: string;
  lowStock?: boolean;
  includeReserved?: boolean;
  page?: number;
  limit?: number;
}

export interface MovementQuery {
  sku?: string;
  warehouse?: string;
  type?: MovementType;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface ReorderCalculation {
  sku: string;
  warehouse: string;
  currentLevel: number;
  reorderLevel: number;
  reorderQuantity: number;
  leadTime: number;
  safetyStock: number;
  averageDemand: number;
  calculation: {
    method: 'statistical' | 'fixed' | 'demand-based';
    factors: Record<string, number>;
  };
}

export interface ForecastRequest {
  sku: string;
  warehouse?: string;
  startDate: Date;
  endDate: Date;
  includeSeasonality: boolean;
  includeExternalFactors: boolean;
}

export interface InventoryReport {
  reportType: ReportType;
  parameters: Record<string, any>;
  data: any[];
  generatedAt: Date;
  generatedBy: string;
}

export enum ReportType {
  STOCK_LEVELS = 'STOCK_LEVELS',
  MOVEMENT_HISTORY = 'MOVEMENT_HISTORY',
  REORDER_ANALYSIS = 'REORDER_ANALYSIS',
  FORECAST_ACCURACY = 'FORECAST_ACCURACY',
  INVENTORY_VALUATION = 'INVENTORY_VALUATION',
  TURNOVER_ANALYSIS = 'TURNOVER_ANALYSIS',
  DEAD_STOCK = 'DEAD_STOCK',
  ABC_ANALYSIS = 'ABC_ANALYSIS'
}

// Event types for real-time updates
export interface InventoryEvent {
  eventType: EventType;
  timestamp: Date;
  data: any;
  userId?: string;
  metadata?: Record<string, any>;
}

export enum EventType {
  STOCK_UPDATED = 'STOCK_UPDATED',
  MOVEMENT_RECORDED = 'MOVEMENT_RECORDED',
  REORDER_ALERT = 'REORDER_ALERT',
  TRANSFER_UPDATED = 'TRANSFER_UPDATED',
  SCAN_EVENT = 'SCAN_EVENT',
  FORECAST_UPDATED = 'FORECAST_UPDATED'
}

// User and authentication types
export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  permissions: Permission[];
  active: boolean;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER'
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: User;
}

// Configuration and settings
export interface SystemConfig {
  database: {
    url: string;
    maxConnections: number;
    timeout: number;
  };
  redis: {
    url: string;
    keyPrefix: string;
    ttl: number;
  };
  kafka: {
    brokers: string[];
    topics: Record<string, KafkaTopic>;
  };
  features: {
    realTimeTracking: boolean;
    demandForecasting: boolean;
    barcodeScanning: boolean;
    multiWarehouse: boolean;
    serialTracking: boolean;
    batchTracking: boolean;
  };
}

export interface KafkaTopic {
  name: string;
  partitions: number;
  replicationFactor: number;
}

// Error types
export class InventoryError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'InventoryError';
  }
}

export class ValidationError extends InventoryError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends InventoryError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class InsufficientStockError extends InventoryError {
  constructor(sku: string, requested: number, available: number) {
    super(
      `Insufficient stock for ${sku}. Requested: ${requested}, Available: ${available}`,
      'INSUFFICIENT_STOCK',
      409,
      { sku, requested, available }
    );
    this.name = 'InsufficientStockError';
  }
}

export class DuplicateError extends InventoryError {
  constructor(resource: string, field: string, value: string) {
    super(`${resource} with ${field} '${value}' already exists`, 'DUPLICATE', 409);
    this.name = 'DuplicateError';
  }
}