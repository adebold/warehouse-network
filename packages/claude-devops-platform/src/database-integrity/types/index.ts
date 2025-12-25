/**
 * Database Migration and Integrity System - Type Definitions
 */

import { z } from 'zod';

// Migration Types
export interface Migration {
  id: string;
  version: string;
  name: string;
  timestamp: Date;
  checksum: string;
  status: MigrationStatus;
  executedAt?: Date;
  executionTime?: number;
  error?: string;
  sql?: string;
  prismaSchema?: string;
  rollbackSql?: string;
  metadata?: Record<string, unknown>;
}

export enum MigrationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

export interface MigrationOptions {
  dryRun?: boolean;
  force?: boolean;
  target?: string;
  skipValidation?: boolean;
  transaction?: boolean;
}

// Schema Types
export interface DatabaseSchema {
  tables: Table[];
  views: View[];
  functions: DatabaseFunction[];
  indexes: Index[];
  constraints: Constraint[];
  version: string;
  timestamp: Date;
}

export interface Table {
  name: string;
  schema: string;
  columns: Column[];
  primaryKey?: PrimaryKey;
  foreignKeys: ForeignKey[];
  indexes: Index[];
  constraints: Constraint[];
  comment?: string;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: unknown;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  comment?: string;
  references?: ColumnReference;
}

export interface ColumnReference {
  table: string;
  column: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
}

export enum ReferentialAction {
  CASCADE = 'CASCADE',
  RESTRICT = 'RESTRICT',
  SET_NULL = 'SET NULL',
  SET_DEFAULT = 'SET DEFAULT',
  NO_ACTION = 'NO ACTION'
}

export interface View {
  name: string;
  schema: string;
  definition: string;
  columns: ViewColumn[];
}

export interface ViewColumn {
  name: string;
  type: string;
}

export interface DatabaseFunction {
  name: string;
  schema: string;
  language: string;
  definition: string;
  parameters: FunctionParameter[];
  returnType: string;
}

export interface FunctionParameter {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT';
  defaultValue?: unknown;
}

export interface Index {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  type: IndexType;
  where?: string;
}

export enum IndexType {
  BTREE = 'btree',
  HASH = 'hash',
  GIN = 'gin',
  GIST = 'gist',
  SPGIST = 'spgist',
  BRIN = 'brin'
}

export interface Constraint {
  name: string;
  table: string;
  type: ConstraintType;
  definition: string;
}

export enum ConstraintType {
  CHECK = 'check',
  UNIQUE = 'unique',
  PRIMARY_KEY = 'primary_key',
  FOREIGN_KEY = 'foreign_key',
  EXCLUDE = 'exclude'
}

export interface PrimaryKey {
  name: string;
  columns: string[];
}

export interface ForeignKey {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

// Route Validation Types
export interface ApiRoute {
  path: string;
  method: HttpMethod;
  handler: string;
  parameters: RouteParameter[];
  requestBody?: RequestBody;
  responses: RouteResponse[];
  authentication?: AuthenticationRequirement;
  authorization?: string[];
  database?: DatabaseOperation[];
}

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS'
}

export interface RouteParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  type: string;
  required: boolean;
  description?: string;
  schema?: z.ZodSchema;
}

export interface RequestBody {
  contentType: string;
  schema: z.ZodSchema;
  required: boolean;
  description?: string;
}

export interface RouteResponse {
  status: number;
  contentType: string;
  schema?: z.ZodSchema;
  description?: string;
}

export interface AuthenticationRequirement {
  type: 'bearer' | 'basic' | 'apiKey' | 'oauth2';
  scheme?: string;
  bearerFormat?: string;
}

export interface DatabaseOperation {
  type: 'select' | 'insert' | 'update' | 'delete' | 'call';
  table?: string;
  procedure?: string;
  columns?: string[];
  conditions?: Record<string, unknown>;
}

// Form Validation Types
export interface FormSchema {
  name: string;
  path: string;
  fields: FormField[];
  submitAction: string;
  validation?: z.ZodSchema;
}

export interface FormField {
  name: string;
  type: FormFieldType;
  required: boolean;
  defaultValue?: unknown;
  validation?: FieldValidation;
  label?: string;
  placeholder?: string;
  options?: FieldOption[];
}

export enum FormFieldType {
  TEXT = 'text',
  EMAIL = 'email',
  PASSWORD = 'password',
  NUMBER = 'number',
  DATE = 'date',
  DATETIME = 'datetime',
  TIME = 'time',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  CHECKBOX = 'checkbox',
  RADIO = 'radio',
  TEXTAREA = 'textarea',
  FILE = 'file',
  HIDDEN = 'hidden'
}

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  email?: boolean;
  url?: boolean;
  custom?: (value: unknown) => boolean | string;
}

export interface FieldOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

// Drift Detection Types
export interface DriftReport {
  timestamp: Date;
  schemaVersion: string;
  databaseVersion: string;
  drifts: Drift[];
  suggestions: DriftSuggestion[];
}

export interface Drift {
  type: DriftType;
  severity: DriftSeverity;
  object: string;
  expected: unknown;
  actual: unknown;
  message: string;
}

export enum DriftType {
  MISSING_TABLE = 'missing_table',
  EXTRA_TABLE = 'extra_table',
  MISSING_COLUMN = 'missing_column',
  EXTRA_COLUMN = 'extra_column',
  COLUMN_TYPE_MISMATCH = 'column_type_mismatch',
  CONSTRAINT_MISMATCH = 'constraint_mismatch',
  INDEX_MISMATCH = 'index_mismatch',
  ROUTE_MISMATCH = 'route_mismatch',
  FORM_FIELD_MISMATCH = 'form_field_mismatch'
}

export enum DriftSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface DriftSuggestion {
  type: 'migration' | 'code_change' | 'schema_update';
  description: string;
  sql?: string;
  code?: string;
  impact: string[];
}

// Configuration Types
export interface DatabaseIntegrityConfig {
  database: DatabaseConfig;
  migration: MigrationConfig;
  schema: SchemaConfig;
  validation: ValidationConfig;
  drift: DriftConfig;
}

export interface DatabaseConfig {
  type: 'postgres' | 'mysql' | 'sqlite' | 'sqlserver';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  pool?: {
    min: number;
    max: number;
    idleTimeout: number;
  };
}

export interface MigrationConfig {
  directory: string;
  tableName: string;
  schemaName?: string;
  autoRun: boolean;
  validateChecksums: boolean;
  transactional: boolean;
  lockTimeout: number;
  gitIntegration: boolean;
}

export interface SchemaConfig {
  directory: string;
  format: 'prisma' | 'sql' | 'both';
  generateTypes: boolean;
  typeOutputDirectory: string;
  includeViews: boolean;
  includeFunctions: boolean;
  includeIndexes: boolean;
}

export interface ValidationConfig {
  routes: {
    enabled: boolean;
    directories: string[];
    patterns: string[];
    strict: boolean;
  };
  forms: {
    enabled: boolean;
    directories: string[];
    patterns: string[];
    validateAgainstSchema: boolean;
  };
}

export interface DriftConfig {
  enabled: boolean;
  schedule?: string;
  allowedDrifts: DriftType[];
  notificationWebhook?: string;
  autoFix: boolean;
  reportDirectory: string;
}

// Event Types
export interface IntegrityEvent {
  id: string;
  type: IntegrityEventType;
  timestamp: Date;
  source: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export enum IntegrityEventType {
  MIGRATION_STARTED = 'migration_started',
  MIGRATION_COMPLETED = 'migration_completed',
  MIGRATION_FAILED = 'migration_failed',
  SCHEMA_ANALYZED = 'schema_analyzed',
  DRIFT_DETECTED = 'drift_detected',
  VALIDATION_FAILED = 'validation_failed',
  TYPE_GENERATED = 'type_generated',
  ROUTE_SYNCED = 'route_synced'
}

// Result Types
export interface IntegrityResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: IntegrityError;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

export interface IntegrityError {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
}

// Export validation schemas
export const MigrationSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  timestamp: z.date(),
  checksum: z.string(),
  status: z.nativeEnum(MigrationStatus),
  executedAt: z.date().optional(),
  executionTime: z.number().optional(),
  error: z.string().optional(),
  sql: z.string().optional(),
  prismaSchema: z.string().optional(),
  rollbackSql: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const DatabaseConfigSchema = z.object({
  type: z.enum(['postgres', 'mysql', 'sqlite', 'sqlserver']),
  connectionString: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  pool: z.object({
    min: z.number(),
    max: z.number(),
    idleTimeout: z.number()
  }).optional()
});

export const MigrationConfigSchema = z.object({
  directory: z.string(),
  tableName: z.string(),
  schemaName: z.string().optional(),
  autoRun: z.boolean(),
  validateChecksums: z.boolean(),
  transactional: z.boolean(),
  lockTimeout: z.number(),
  gitIntegration: z.boolean()
});