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
  persona?: string;
  journey?: string;
  epic?: string;
  environment?: 'development' | 'staging' | 'production';
  // Additional properties for various commands
  forms?: boolean;
  routes?: boolean;
  clear?: boolean;
  export?: boolean;
  stats?: boolean;
  show?: boolean;
  reset?: boolean;
  list?: boolean;
  create?: string;
  delete?: string;
  generate?: string;
  form?: string;
  data?: string;
  headless?: boolean;
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

// Persona-based testing types
export interface Persona {
  id: string;
  name: string;
  role: string;
  department: string;
  permissions: string[];
  characteristics: {
    experienceLevel: 'beginner' | 'intermediate' | 'expert';
    techSavvy: boolean;
    primaryGoals: string[];
    painPoints: string[];
  };
  credentials?: {
    email?: string;
    username?: string;
    password: string;
    userId?: string;
  };
  deviceProfile?: {
    screenWidth: number;
    screenHeight: number;
    mobile: boolean;
    userAgent?: string;
  };
  accessibility?: {
    screenReader?: boolean;
    keyboardOnly?: boolean;
    highContrast?: boolean;
    reducedMotion?: boolean;
    darkMode?: boolean;
    fontSize?: number;
  };
  networkProfile?: {
    downloadSpeed: number; // bytes per second
    uploadSpeed: number;
    latency: number; // milliseconds
  };
  locale?: string;
  sessionData?: Record<string, any>;
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
  tags?: string[];
}

export interface UserJourney {
  id: string;
  name: string;
  description: string;
  personaId: string;
  epic?: string;
  scenarios: TestScenario[];
  tags?: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  updatedAt: Date;
}

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  steps: TestStep[];
  assertions?: TestAssertion[];
  timeout?: number;
  continueOnFailure?: boolean;
  screenshot?: boolean;
  tags?: string[];
}

export interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'fill' | 'select' | 'wait' | 'submit' | 
          'authenticate' | 'scroll' | 'hover' | 'drag_and_drop' | 'upload_file' |
          'switch_tab' | 'handle_alert' | 'wait_for_element' | 'wait_for_text' |
          'take_screenshot' | 'fill_form';
  target?: string;
  data?: any;
  value?: string;
  expected?: string;
  timeout?: number;
  screenshot?: boolean;
  credentials?: {
    email?: string;
    username?: string;
    password: string;
  };
  direction?: 'up' | 'down' | 'top' | 'bottom';
  source?: string; // for drag_and_drop
  filePath?: string; // for upload_file
  tabIndex?: number; // for switch_tab
  text?: string; // for wait_for_text
  name?: string; // for screenshot naming
}

export interface TestAssertion {
  type: 'element_exists' | 'element_visible' | 'text_contains' | 'url_matches' | 
        'attribute_equals' | 'database_integrity' | 'performance' | 'accessibility';
  selector?: string;
  expected?: any;
  message?: string;
  pattern?: string; // for url_matches
  attribute?: string; // for attribute_equals
  query?: string; // for database_integrity
  params?: any[]; // for database_integrity
  threshold?: number; // for performance assertions
}

export interface PersonaTestSuite {
  id: string;
  personaId: string;
  name: string;
  scenarios: TestScenario[];
  epic?: string;
  tags?: string[];
}

export interface PersonaValidationResult {
  id: string;
  personaId: string;
  journeyId: string;
  epic: string;
  environment: string;
  status: 'passed' | 'failed' | 'skipped';
  startTime: Date;
  endTime: Date;
  duration: number;
  scenarios?: any[];
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    coverage: number;
  };
  violations?: PersonaViolation[];
  performance?: {
    avgResponseTime: number;
    slowestScenario: any;
    fastestScenario: any;
  };
  error?: string;
}

export interface PersonaViolation {
  type: 'assertion_failed' | 'execution_error' | 'accessibility' | 'performance' | 'security';
  severity: 'error' | 'warning' | 'info';
  message: string;
  scenario?: string;
  step?: string;
  details?: any;
}

export interface PersonaConfig {
  enabled: boolean;
  defaultPersonas: string[];
  browserConfig: BrowserConfig;
  screenshotsEnabled: boolean;
  accessibilityChecking: boolean;
  performanceThresholds: {
    pageLoadTime: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    cumulativeLayoutShift: number;
  };
}

export interface BrowserConfig {
  headless?: boolean;
  timeout?: number;
  slowMo?: number;
  viewport?: {
    width: number;
    height: number;
  };
  launchOptions?: any;
}

export interface AutomationResult {
  id: string;
  scenarioId: string;
  personaId: string;
  status: 'passed' | 'failed' | 'skipped';
  startTime: Date;
  endTime: Date;
  duration: number;
  steps: any[];
  assertions: any[];
  screenshots: string[];
  performance: {
    pageLoadTime?: number;
    domContentLoaded?: number;
    firstContentfulPaint?: number;
    largestContentfulPaint?: number;
    cumulativeLayoutShift?: number;
  };
  accessibility: any;
  console: any[];
  network: any[];
  error?: string;
}

export interface ScreenshotOptions {
  prefix?: string;
  scenario?: string;
  step?: string;
  name?: string;
  fullPage?: boolean;
}