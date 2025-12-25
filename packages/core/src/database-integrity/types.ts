/**
 * Database Integrity System Types
 * Type definitions for database migration and integrity management
 * Adapted for Prisma-based warehouse-network architecture
 */

import { Prisma } from '@prisma/client';

// Core configuration types
export interface DatabaseIntegrityConfig {
  database: DatabaseConfig;
  migration: MigrationConfig;
  schema: SchemaConfig;
  validation: ValidationConfig;
  drift: DriftConfig;
  prisma: PrismaConfig;
}

export interface DatabaseConfig {
  connectionString: string;
  ssl?: boolean;
  poolSize?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface PrismaConfig {
  schemaPath: string;
  migrationsDir: string;
  clientPath?: string;
  datasourceProvider: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver';
}

export interface MigrationConfig {
  migrationsDir: string;
  tableName: string;
  autoRun: boolean;
  validateChecksums: boolean;
  transactional: boolean;
  lockTimeout?: number;
  executionTimeout?: number;
}

export interface SchemaConfig {
  includeTables?: string[];
  excludeTables?: string[];
  includeViews?: boolean;
  includeIndexes?: boolean;
  includeTriggers?: boolean;
  includeFunctions?: boolean;
  includeConstraints?: boolean;
  schemaFiles?: string[];
}

export interface ValidationConfig {
  enabled: boolean;
  routes: RouteValidationConfig;
  forms: FormValidationConfig;
  prismaModels: PrismaModelValidationConfig;
}

export interface RouteValidationConfig {
  apiDir: string;
  patterns: string[];
  validatePagination?: boolean;
  validateFilters?: boolean;
  validateSorting?: boolean;
  customRules?: ValidationRule[];
}

export interface FormValidationConfig {
  scanDirs: string[];
  filePatterns: string[];
  frameworks: ('react' | 'vue' | 'angular' | 'nextjs')[];
  validateRequired?: boolean;
  validateTypes?: boolean;
  validateConstraints?: boolean;
  customValidators?: FormValidator[];
}

export interface PrismaModelValidationConfig {
  validateRelations?: boolean;
  validateEnums?: boolean;
  validateDefaults?: boolean;
  validateUnique?: boolean;
  customValidators?: ModelValidator[];
}

export interface DriftConfig {
  enabled: boolean;
  schedule?: string; // cron expression
  autoFix?: boolean;
  ignorePatterns?: string[];
  notificationChannels?: NotificationChannel[];
  severity?: DriftSeverity;
}

// Migration types
export interface Migration {
  id: string;
  version: string;
  name: string;
  description?: string;
  type: MigrationType;
  sql?: string;
  operations?: MigrationOperation[];
  checksum: string;
  createdAt: Date;
  executedAt?: Date;
  executionTime?: number;
  status: MigrationStatus;
  error?: string;
  rollbackSql?: string;
  metadata?: Record<string, any>;
}

export enum MigrationType {
  SCHEMA = 'schema',
  DATA = 'data',
  PROCEDURE = 'procedure',
  INDEX = 'index',
  CONSTRAINT = 'constraint',
  TRIGGER = 'trigger',
  PRISMA = 'prisma',
  CUSTOM = 'custom'
}

export enum MigrationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
  SKIPPED = 'skipped'
}

export interface MigrationOperation {
  type: OperationType;
  target: string;
  details: Record<string, any>;
  sql?: string;
  prismaCommand?: string;
}

export enum OperationType {
  CREATE_TABLE = 'create_table',
  ALTER_TABLE = 'alter_table',
  DROP_TABLE = 'drop_table',
  CREATE_COLUMN = 'create_column',
  ALTER_COLUMN = 'alter_column',
  DROP_COLUMN = 'drop_column',
  CREATE_INDEX = 'create_index',
  DROP_INDEX = 'drop_index',
  CREATE_CONSTRAINT = 'create_constraint',
  DROP_CONSTRAINT = 'drop_constraint',
  CREATE_ENUM = 'create_enum',
  ALTER_ENUM = 'alter_enum',
  DROP_ENUM = 'drop_enum',
  PRISMA_MIGRATE = 'prisma_migrate'
}

export interface MigrationOptions {
  dryRun?: boolean;
  target?: string;
  force?: boolean;
  skipValidation?: boolean;
  timeout?: number;
  batchSize?: number;
}

// Schema types
export interface DatabaseSchema {
  version: string;
  timestamp: Date;
  tables: Table[];
  views?: View[];
  indexes?: Index[];
  constraints?: Constraint[];
  enums?: Enum[];
  functions?: Function[];
  triggers?: Trigger[];
  prismaModels?: PrismaModel[];
}

export interface Table {
  name: string;
  schema: string;
  columns: Column[];
  primaryKey?: PrimaryKey;
  foreignKeys?: ForeignKey[];
  indexes?: Index[];
  constraints?: Constraint[];
  comment?: string;
  metadata?: Record<string, any>;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default?: any;
  autoIncrement?: boolean;
  unique?: boolean;
  comment?: string;
  metadata?: Record<string, any>;
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
  onUpdate?: 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
  onDelete?: 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
}

export interface Index {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  type?: 'btree' | 'hash' | 'gin' | 'gist' | 'spgist' | 'brin';
  where?: string;
  metadata?: Record<string, any>;
}

export interface Constraint {
  name: string;
  table: string;
  type: 'check' | 'unique' | 'exclude' | 'foreign_key' | 'primary_key';
  definition: string;
  columns?: string[];
}

export interface Enum {
  name: string;
  values: string[];
  schema?: string;
}

export interface View {
  name: string;
  schema: string;
  definition: string;
  columns: Column[];
  materialized?: boolean;
}

export interface Function {
  name: string;
  schema: string;
  definition: string;
  parameters: Parameter[];
  returnType: string;
  language: string;
}

export interface Parameter {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT';
  default?: any;
}

export interface Trigger {
  name: string;
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  timing: 'BEFORE' | 'AFTER';
  forEach: 'ROW' | 'STATEMENT';
  definition: string;
  enabled: boolean;
}

// Prisma-specific types
export interface PrismaModel {
  name: string;
  dbName?: string;
  fields: PrismaField[];
  primaryKey?: PrismaIndex;
  uniqueIndexes: PrismaIndex[];
  indexes: PrismaIndex[];
  documentation?: string;
}

export interface PrismaField {
  name: string;
  type: string;
  isList: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isId: boolean;
  isReadOnly: boolean;
  hasDefaultValue: boolean;
  default?: any;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  documentation?: string;
}

export interface PrismaIndex {
  name?: string;
  fields: string[];
  type?: 'id' | 'unique' | 'normal';
}

// Validation types
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
}

export interface ValidationError {
  type: string;
  field?: string;
  table?: string;
  message: string;
  severity: 'error' | 'critical';
  code?: string;
  suggestion?: string;
}

export interface ValidationWarning {
  type: string;
  field?: string;
  table?: string;
  message: string;
  code?: string;
  suggestion?: string;
}

export interface ValidationSuggestion {
  type: string;
  target: string;
  message: string;
  improvement: string;
  impact?: 'performance' | 'security' | 'maintainability' | 'compatibility';
}

export interface ApiRoute {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  handler: string;
  middleware?: string[];
  validators?: RouteValidator[];
  parameters?: RouteParameter[];
  body?: RouteBody;
  response?: RouteResponse;
  table?: string;
  operations?: DatabaseOperation[];
  validation?: ValidationResult;
}

export interface RouteParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  type: string;
  required: boolean;
  description?: string;
  validation?: any;
}

export interface RouteBody {
  type: string;
  schema?: any;
  required?: string[];
  validation?: any;
}

export interface RouteResponse {
  status: number;
  type: string;
  schema?: any;
}

export interface DatabaseOperation {
  type: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  table: string;
  columns?: string[];
  joins?: string[];
  conditions?: string[];
}

export interface FormValidationResult {
  formPath: string;
  formName: string;
  framework: string;
  fields: FormField[];
  validation: ValidationResult;
  suggestions: FormSuggestion[];
}

export interface FormField {
  name: string;
  type: string;
  required: boolean;
  validation?: any;
  defaultValue?: any;
  placeholder?: string;
  label?: string;
  helpText?: string;
  options?: any[];
  metadata?: Record<string, any>;
}

export interface FormSuggestion {
  field: string;
  type: 'missing' | 'mismatch' | 'constraint' | 'enhancement';
  message: string;
  recommendation: string;
  code?: string;
}

// Drift detection types
export interface DriftReport {
  id: string;
  timestamp: Date;
  drifts: Drift[];
  summary: DriftSummary;
  recommendations: DriftRecommendation[];
}

export interface Drift {
  id: string;
  type: DriftType;
  severity: DriftSeverity;
  object: string;
  expected: any;
  actual: any;
  description: string;
  impact?: string;
  fixable: boolean;
  fixSql?: string;
  prismaFix?: string;
}

export enum DriftType {
  SCHEMA_MISMATCH = 'schema_mismatch',
  MISSING_TABLE = 'missing_table',
  MISSING_COLUMN = 'missing_column',
  TYPE_MISMATCH = 'type_mismatch',
  CONSTRAINT_MISMATCH = 'constraint_mismatch',
  INDEX_MISMATCH = 'index_mismatch',
  ENUM_MISMATCH = 'enum_mismatch',
  PRISMA_MODEL_MISMATCH = 'prisma_model_mismatch',
  MANUAL_CHANGE = 'manual_change'
}

export enum DriftSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface DriftSummary {
  totalDrifts: number;
  bySeverity: Record<DriftSeverity, number>;
  byType: Record<DriftType, number>;
  fixable: number;
  requiresManualIntervention: number;
}

export interface DriftRecommendation {
  priority: number;
  action: string;
  reason: string;
  commands?: string[];
  risks?: string[];
}

// Warehouse-specific validation types
export interface WarehouseValidation {
  paymentForms: PaymentFormValidation[];
  operationForms: OperationFormValidation[];
  apiRoutes: ApiRouteValidation[];
}

export interface PaymentFormValidation {
  formName: string;
  model: 'Customer' | 'Deposit' | 'Quote';
  missingFields: string[];
  extraFields: string[];
  typeMismatches: FieldMismatch[];
  valid: boolean;
}

export interface OperationFormValidation {
  formName: string;
  model: 'Skid' | 'ReceivingOrder' | 'ReleaseRequest' | 'Warehouse';
  missingFields: string[];
  extraFields: string[];
  typeMismatches: FieldMismatch[];
  valid: boolean;
}

export interface ApiRouteValidation {
  route: string;
  method: string;
  model: string;
  queryParams: ParamValidation[];
  bodyParams: ParamValidation[];
  valid: boolean;
}

export interface FieldMismatch {
  field: string;
  expectedType: string;
  actualType: string;
  severity: 'error' | 'warning';
}

export interface ParamValidation {
  param: string;
  type: string;
  required: boolean;
  validInModel: boolean;
  suggestion?: string;
}

// Utility types
export interface IntegrityResult<T> {
  success: boolean;
  data?: T;
  error?: IntegrityError;
  warnings?: string[];
  metadata?: Record<string, any>;
}

export interface IntegrityError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

export type IntegrityEventType = 
  | 'initialized'
  | 'migration_started'
  | 'migration_complete'
  | 'migration_failed'
  | 'rollback_started'
  | 'rollback_complete'
  | 'rollback_failed'
  | 'drift_detected'
  | 'validation_complete'
  | 'error'
  | 'warning'
  | 'shutdown';

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'console';
  config: Record<string, any>;
  events?: IntegrityEventType[];
}

export interface ValidationRule {
  name: string;
  description?: string;
  apply: (route: ApiRoute, schema: DatabaseSchema) => ValidationResult;
}

export interface FormValidator {
  name: string;
  framework: string;
  validate: (field: FormField, schema: DatabaseSchema) => ValidationResult;
}

export interface ModelValidator {
  name: string;
  validate: (model: PrismaModel, schema: DatabaseSchema) => ValidationResult;
}

export interface RouteValidator {
  name: string;
  validate: (route: ApiRoute) => ValidationResult;
}