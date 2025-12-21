// packages/types/src/index.ts
// Central type definitions to prevent "Cannot find type" errors

/* ============================================
   ENVIRONMENT VARIABLES
   ============================================ */
export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'staging' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_PUBLIC_KEY: string;
  JWT_PRIVATE_KEY: string;
  ENCRYPTION_MASTER_KEY: string;
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
  passwordHash: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret?: string;
  role: UserRole;
  tenantId: string;
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

export type UserRole = 'user' | 'admin' | 'support' | 'superadmin';

export interface JWTPayload {
  sub: string; // userId
  role: UserRole;
  tenantId: string;
  type: 'access' | 'refresh';
  jti: string; // JWT ID for revocation
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface RefreshToken {
  id: string;
  userId: string;
  jti: string;
  token: string;
  expiresAt: Date;
  revoked: boolean;
  revokedReason?: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  lastActivityAt: Date;
}

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
  | 'MFA_VERIFY'
  | 'PASSWORD_RESET'
  | 'TOKEN_REFRESH'
  | 'ACCESS_GRANTED'
  | 'ACCESS_DENIED';

export interface SecurityIncident {
  id: string;
  severity: IncidentSeverity;
  type: IncidentType;
  description: string;
  userId?: string;
  ipAddress?: string;
  affectedResources?: string[];
  detectedAt: Date;
  resolvedAt?: Date;
  status: IncidentStatus;
}

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentType =
  | 'BRUTE_FORCE_ATTACK'
  | 'CREDENTIAL_STUFFING'
  | 'IMPOSSIBLE_TRAVEL'
  | 'DATA_EXFILTRATION'
  | 'UNAUTHORIZED_ACCESS'
  | 'ACCOUNT_TAKEOVER'
  | 'IP_BLOCKED'
  | 'SESSION_REVOCATION'
  | 'ACCOUNT_LOCKED'
  | 'DATA_QUARANTINE'
  | 'CIRCUIT_BREAKER_ACTIVATED'
  | 'FORENSIC_SNAPSHOT';

export type IncidentStatus = 'DETECTED' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';

/* ============================================
   DATABASE
   ============================================ */
export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  idleTimeout: number;
  connectionTimeout: number;
  ssl: boolean;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  fields: string[];
}

/* ============================================
   ENCRYPTION
   ============================================ */
export interface EncryptedData {
  ciphertext: string;
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  version: number;
}

export interface KeyRotationRecord {
  id: string;
  keyId: string;
  algorithm: string;
  rotatedAt: Date;
  rotatedBy: string;
  previousKeyId?: string;
  status: 'active' | 'retired' | 'compromised';
}

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
   RATE LIMITING
   ============================================ */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export interface RateLimitExceeded {
  message: string;
  retryAfter: number;
  limit: number;
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
        tenantId: string;
      };
      requestId?: string;
      db?: any; // Will be typed with Prisma client
      rateLimit?: RateLimitInfo;
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

export type Awaited<T> = T extends Promise<infer U> ? U : T;

export type NonEmptyArray<T> = [T, ...T[]];

/* ============================================
   BRANDED TYPES (for type safety)
   ============================================ */
export type Brand<K, T> = K & { __brand: T };

export type UserId = Brand<string, 'UserId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type Email = Brand<string, 'Email'>;
export type JWT = Brand<string, 'JWT'>;
export type EncryptedString = Brand<string, 'Encrypted'>;
export type HashedPassword = Brand<string, 'HashedPassword'>;

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
   EXPORTS
   ============================================ */
export * from './http';
export * from './events';

// Ensure this file is treated as a module
export {};
