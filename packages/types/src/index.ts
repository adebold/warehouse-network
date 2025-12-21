// packages/types/src/index.ts
// Central type definitions for Warehouse Network Platform

/* ============================================
   ENVIRONMENT VARIABLES
   ============================================ */
export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'staging' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  NEXTAUTH_URL: string;
  NEXTAUTH_SECRET: string;
  JWT_PUBLIC_KEY?: string;
  JWT_PRIVATE_KEY?: string;
  ENCRYPTION_MASTER_KEY?: string;
  GCP_PROJECT_ID?: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  CORS_ORIGIN: string;
}

/* ============================================
   USER & AUTHENTICATION
   ============================================ */
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret?: string;
  role: UserRole;
  tenantId?: string;
  locked: boolean;
  lockedUntil?: Date;
  lockedReason?: string;
  failedLoginAttempts: number;
  lastLoginAt?: Date;
  lastFailedLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export type UserRole = 'user' | 'admin' | 'manager' | 'warehouse_worker' | 'support';

export interface JWTPayload {
  sub: string; // userId
  role: UserRole;
  tenantId?: string;
  type: 'access' | 'refresh';
  jti: string; // JWT ID for revocation
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface Session {
  id: string;
  userId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  lastActivityAt: Date;
}

/* ============================================
   WAREHOUSE DOMAIN MODELS
   ============================================ */
export interface Warehouse {
  id: string;
  name: string;
  location: WarehouseLocation;
  capacity: number;
  currentUtilization: number;
  status: WarehouseStatus;
  managerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarehouseLocation {
  address: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export type WarehouseStatus = 'active' | 'inactive' | 'maintenance' | 'full';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  brand?: string;
  dimensions?: ProductDimensions;
  weight?: number; // in kg
  price?: number;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductDimensions {
  length: number; // in cm
  width: number;
  height: number;
}

export type ProductStatus = 'active' | 'discontinued' | 'seasonal' | 'back_order';

export interface Inventory {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  reservedQuantity: number;
  minimumStock: number;
  maximumStock: number;
  location?: string; // shelf/rack location
  lastCountDate?: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  warehouseId: string;
  status: OrderStatus;
  type: OrderType;
  items: OrderItem[];
  totalValue: number;
  priority: OrderPriority;
  expectedDeliveryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: OrderItemStatus;
  allocatedQuantity: number;
  pickedQuantity: number;
}

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'allocated'
  | 'picking'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export type OrderType = 'inbound' | 'outbound' | 'transfer' | 'adjustment';

export type OrderPriority = 'low' | 'normal' | 'high' | 'urgent';

export type OrderItemStatus = 'pending' | 'allocated' | 'picked' | 'packed' | 'cancelled';

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: CustomerAddress;
  type: CustomerType;
  creditLimit?: number;
  paymentTerms?: string;
  status: CustomerStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
}

export type CustomerType = 'individual' | 'business' | 'wholesale';
export type CustomerStatus = 'active' | 'inactive' | 'suspended';

/* ============================================
   API REQUEST/RESPONSE
   ============================================ */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    [key: string]: unknown;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface SearchFilters {
  query?: string;
  category?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  warehouseId?: string;
  [key: string]: unknown;
}

/* ============================================
   LOGGING & MONITORING
   ============================================ */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  version?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface SecurityLogEntry extends LogEntry {
  securityEvent: 'auth' | 'access' | 'incident' | 'audit';
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  action?: string;
  resource?: string;
  granted?: boolean;
  reason?: string;
}

/* ============================================
   SECURITY & AUDIT
   ============================================ */
export interface AuditLog {
  id: string;
  timestamp: Date;
  userId?: string;
  tenantId?: string;
  action: AuditAction;
  tableName?: string;
  recordId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export type AuditAction =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_RESET'
  | 'ACCESS_GRANTED'
  | 'ACCESS_DENIED'
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'INVENTORY_UPDATED';

/* ============================================
   VALIDATION
   ============================================ */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/* ============================================
   EXPRESS REQUEST EXTENSIONS
   ============================================ */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        tenantId?: string;
      };
      requestId?: string;
      db?: any; // Will be typed with Prisma client
    }
  }
}

/* ============================================
   UTILITY TYPES
   ============================================ */
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type NonEmptyArray<T> = [T, ...T[]];

/* ============================================
   BRANDED TYPES (for type safety)
   ============================================ */
export type Brand<K, T> = K & { __brand: T };

export type UserId = Brand<string, 'UserId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type Email = Brand<string, 'Email'>;
export type ProductSKU = Brand<string, 'ProductSKU'>;
export type OrderNumber = Brand<string, 'OrderNumber'>;
export type WarehouseId = Brand<string, 'WarehouseId'>;

/* ============================================
   RESULT TYPE (for error handling)
   ============================================ */
export type Result<T, E = Error> = { success: true; value: T } | { success: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({
  success: true,
  value,
});

export const Err = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
});

/* ============================================
   ASYNC RESULT TYPE
   ============================================ */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/* ============================================
   DASHBOARD & ANALYTICS
   ============================================ */
export interface DashboardMetrics {
  totalOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  inventoryTurnover: number;
  warehouseUtilization: number;
  topProducts: ProductMetric[];
  recentActivity: ActivityItem[];
}

export interface ProductMetric {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
}

export interface ActivityItem {
  id: string;
  type: 'order' | 'inventory' | 'user' | 'system';
  description: string;
  timestamp: Date;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/* ============================================
   NOTIFICATIONS
   ============================================ */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  read: boolean;
  actionUrl?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export type NotificationType =
  | 'order_status'
  | 'inventory_low'
  | 'system_alert'
  | 'user_action'
  | 'security';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

// Ensure this file is treated as a module
export {};
