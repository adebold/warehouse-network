export interface IntegrityConfig {
  database: DatabaseConfig;
  validation: ValidationConfig;
  memory: MemoryConfig;
  monitoring: MonitoringConfig;
  templates: TemplateConfig;
}

export interface DatabaseConfig {
  provider: 'prisma' | 'typeorm' | 'generic';
  url: string;
  schema?: string;
  migrations?: {
    directory: string;
    tableName: string;
  };
  backup?: {
    enabled: boolean;
    schedule: string;
    retention: number;
  };
}

export interface ValidationConfig {
  forms: {
    enabled: boolean;
    directory: string;
    patterns: string[];
  };
  routes: {
    enabled: boolean;
    directory: string;
    patterns: string[];
  };
  schemas: {
    strict: boolean;
    allowExtraFields: boolean;
  };
}

export interface MemoryConfig {
  claude: {
    enabled: boolean;
    namespace: string;
    ttl: number;
    syncInterval: number;
  };
  cache: {
    provider: 'memory' | 'redis' | 'file';
    options: Record<string, any>;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  interval: number;
  alerts: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    file: string;
    maxSize: string;
    maxFiles: number;
  };
}

export interface TemplateConfig {
  framework: 'nextjs' | 'express' | 'nestjs' | 'generic';
  features: string[];
  customizations: Record<string, any>;
}

export interface IntegrityCheck {
  id: string;
  name: string;
  description: string;
  type: 'schema' | 'data' | 'constraint' | 'foreign_key' | 'index';
  severity: 'error' | 'warning' | 'info';
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
  details?: any;
  timestamp: Date;
  duration: number;
}

export interface IntegrityReport {
  id: string;
  timestamp: Date;
  checks: IntegrityCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  metadata: {
    version: string;
    database: string;
    schema: string;
  };
}

export interface SchemaDrift {
  hasDrift: boolean;
  changes: SchemaChange[];
  baseline: SchemaSnapshot;
  current: SchemaSnapshot;
  timestamp: Date;
}

export interface SchemaChange {
  type: 'table_added' | 'table_removed' | 'column_added' | 'column_removed' | 'column_modified' | 'index_added' | 'index_removed';
  table: string;
  column?: string;
  index?: string;
  oldValue?: any;
  newValue?: any;
  impact: 'breaking' | 'non-breaking' | 'minor';
}

export interface SchemaSnapshot {
  version: string;
  timestamp: Date;
  tables: TableSchema[];
  indexes: IndexSchema[];
  constraints: ConstraintSchema[];
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  primaryKey?: string[];
  foreignKeys: ForeignKeySchema[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: any;
  autoIncrement?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
}

export interface IndexSchema {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  type?: string;
}

export interface ForeignKeySchema {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onUpdate?: string;
  onDelete?: string;
}

export interface ConstraintSchema {
  name: string;
  table: string;
  type: 'check' | 'unique' | 'foreign_key' | 'primary_key';
  definition: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  file: string;
  type: 'form' | 'route' | 'schema';
}

export interface ValidationError {
  code: string;
  message: string;
  path: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  code: string;
  message: string;
  path: string;
  suggestion?: string;
}

export interface ClaudeMemoryEntry {
  key: string;
  value: any;
  namespace: string;
  ttl?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
}

export interface MemoryStats {
  totalEntries: number;
  memoryUsage: number;
  hitRate: number;
  lastSync: Date;
  syncErrors: number;
  namespaces: string[];
}

export interface MigrationResult {
  applied: number;
  failed: number;
  skipped: number;
  migrations: MigrationInfo[];
  duration: number;
}

export interface MigrationInfo {
  id: string;
  name: string;
  status: 'applied' | 'failed' | 'skipped';
  timestamp: Date;
  duration: number;
  error?: string;
}

export interface MonitoringEvent {
  id: string;
  type: 'check' | 'drift' | 'validation' | 'error';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details: any;
  timestamp: Date;
  source: string;
}

export interface CLIOptions {
  template?: string;
  force?: boolean;
  verbose?: boolean;
  skipInstall?: boolean;
  dryRun?: boolean;
  fix?: boolean;
  format?: string;
  interval?: string;
  silent?: boolean;
  output?: string;
  since?: string;
  baseline?: string;
}

export interface TemplateFiles {
  [key: string]: string | TemplateFiles;
}

export interface TemplateMetadata {
  name: string;
  description: string;
  framework: string;
  features: string[];
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
  files: TemplateFiles;
}