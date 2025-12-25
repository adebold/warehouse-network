/**
 * Database Integrity System for Warehouse Network
 * Main entry point for database migration and integrity management
 * Integrated with Prisma for seamless schema management
 */

import {
  DatabaseIntegrityConfig,
  DatabaseSchema,
  Migration,
  DriftReport,
  FormValidationResult,
  IntegrityResult,
  IntegrityError,
  IntegrityEventType,
  MigrationOptions,
  ApiRoute,
  WarehouseValidation
} from './types';
import { DatabaseConnectionManager, DatabaseConnection } from './core/database-connection';
import { MigrationEngine } from './migration/migration-engine';
import { SchemaAnalyzer } from './schema/schema-analyzer';
import { RouteValidator } from './validation/route-validator';
import { FormScanner } from './validation/form-scanner';
import { DriftDetector } from './validation/drift-detector';
import { MigrationGenerator, MigrationGeneratorOptions } from './generator/migration-generator';
import { PrismaSchemaAnalyzer } from './prisma-adapters/prisma-schema-analyzer';
import { PrismaMigrationTracker } from './prisma-adapters/prisma-migration-tracker';
import { WarehouseFormValidator } from './warehouse-validators/warehouse-form-validator';
import { WarehouseRouteValidator } from './warehouse-validators/warehouse-route-validator';
import { ClaudeFlowIntegration } from './claude-flow-integration';
import { MemoryHelpers } from './memory-helpers';
import { EventEmitter } from 'events';
import { CronJob } from 'cron';
import winston from 'winston';
import { execSync } from 'child_process';
import path from 'path';

export class DatabaseIntegritySystem extends EventEmitter {
  private config: DatabaseIntegrityConfig;
  private connectionManager: DatabaseConnectionManager;
  private connection?: DatabaseConnection;
  private migrationEngine?: MigrationEngine;
  private schemaAnalyzer?: SchemaAnalyzer;
  private routeValidator?: RouteValidator;
  private formScanner?: FormScanner;
  private driftDetector?: DriftDetector;
  private migrationGenerator?: MigrationGenerator;
  private prismaSchemaAnalyzer?: PrismaSchemaAnalyzer;
  private prismaMigrationTracker?: PrismaMigrationTracker;
  private warehouseFormValidator?: WarehouseFormValidator;
  private warehouseRouteValidator?: WarehouseRouteValidator;
  private driftCheckJob?: CronJob;
  private logger: winston.Logger;
  private claudeFlowIntegration: ClaudeFlowIntegration;
  private memoryHelpers: MemoryHelpers;
  private isInitialized = false;

  constructor(config: DatabaseIntegrityConfig) {
    super();
    this.config = config;
    this.connectionManager = new DatabaseConnectionManager(config.database);
    
    // Initialize Claude Flow integration
    this.claudeFlowIntegration = new ClaudeFlowIntegration({
      sessionId: `db-integrity-${Date.now()}`,
      enableHooks: true,
      enableMemory: true,
      logLevel: config.database.logLevel
    });
    
    this.memoryHelpers = new MemoryHelpers({
      sessionId: this.claudeFlowIntegration.config.sessionId,
      enableHooks: true,
      enableMemory: true
    });

    // Setup logger
    this.logger = winston.createLogger({
      level: config.database.logLevel || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'database-integrity.log'),
          maxsize: 10485760, // 10MB
          maxFiles: 5
        })
      ]
    });

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize the integrity system
   */
  async initialize(): Promise<IntegrityResult<void>> {
    try {
      this.logger.info('Initializing Database Integrity System for Warehouse Network');

      // Initialize Claude Flow integration
      await this.claudeFlowIntegration.initialize();
      await this.memoryHelpers.initialize();
      
      // Execute pre-task hook
      await this.claudeFlowIntegration.executeHook('pre-task', {
        description: 'Database Integrity System initialization'
      });

      // Connect to database
      const connectionResult = await this.connectionManager.connect();
      if (!connectionResult.success || !connectionResult.data) {
        throw new Error('Failed to connect to database');
      }
      this.connection = connectionResult.data;

      // Initialize core components
      this.migrationEngine = new MigrationEngine(this.connection, this.config.migration);
      this.schemaAnalyzer = new SchemaAnalyzer(this.connection, this.config.schema);
      this.driftDetector = new DriftDetector(this.connection, this.config.drift, this.schemaAnalyzer);
      this.migrationGenerator = new MigrationGenerator(this.migrationEngine);

      // Initialize Prisma-specific components
      this.prismaSchemaAnalyzer = new PrismaSchemaAnalyzer(this.config.prisma);
      this.prismaMigrationTracker = new PrismaMigrationTracker(
        this.connection,
        this.config.prisma,
        this.migrationEngine
      );

      // Initialize migration engine
      const migrationInitResult = await this.migrationEngine.initialize();
      if (!migrationInitResult.success) {
        throw new Error('Failed to initialize migration engine');
      }

      // Sync Prisma migrations with our tracking
      await this.prismaMigrationTracker.syncPrismaMigrations();

      // Run auto migrations if enabled
      if (this.config.migration.autoRun) {
        await this.runPendingMigrations();
      }

      // Analyze current schema
      const schemaResult = await this.schemaAnalyzer.analyze();
      if (schemaResult.success && schemaResult.data) {
        // Initialize validators with warehouse-specific implementations
        this.routeValidator = new RouteValidator(schemaResult.data, this.config.validation.routes);
        this.formScanner = new FormScanner(schemaResult.data, this.config.validation.forms);
        
        // Initialize warehouse-specific validators
        this.warehouseFormValidator = new WarehouseFormValidator(schemaResult.data);
        this.warehouseRouteValidator = new WarehouseRouteValidator(schemaResult.data);
      }

      // Setup drift detection schedule
      if (this.config.drift.enabled && this.config.drift.schedule) {
        this.setupDriftDetection();
      }

      this.isInitialized = true;
      this.logger.info('Database Integrity System initialized successfully');

      // Log initialization to Claude Flow memory
      await this.memoryHelpers.logOperation(
        'system_initialization',
        'DatabaseIntegritySystem',
        'System initialized successfully',
        { success: true }
      );
      
      // Execute post-task hook
      await this.claudeFlowIntegration.executeHook('post-task', {
        'task-id': 'initialization'
      });

      this.emit('initialized');
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to initialize Database Integrity System', error);
      
      // Log initialization failure to Claude Flow memory
      await this.memoryHelpers.logOperation(
        'system_initialization',
        'DatabaseIntegritySystem',
        'System initialization failed',
        { error: error as Error }
      );
      
      const integrityError: IntegrityError = {
        code: 'INIT_FAILED',
        message: 'Failed to initialize Database Integrity System',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Run Prisma migrations
   */
  async runPrismaMigrations(deploy: boolean = false): Promise<IntegrityResult<void>> {
    try {
      this.logger.info(`Running Prisma migrations (deploy: ${deploy})`);
      
      const startTime = Date.now();
      
      // Execute pre-task hook
      await this.claudeFlowIntegration.executeHook('pre-task', {
        description: `Running Prisma migrations (deploy: ${deploy})`
      });
      
      const command = deploy ? 'prisma migrate deploy' : 'prisma migrate dev';
      const result = execSync(`npx ${command}`, {
        cwd: process.cwd(),
        stdio: 'pipe'
      }).toString();
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Prisma migrations completed', { output: result });
      
      // Log migration execution to Claude Flow memory
      await this.memoryHelpers.storeMigrationExecution(
        { 
          id: `prisma-migration-${Date.now()}`,
          name: `prisma-${deploy ? 'deploy' : 'dev'}`,
          status: 'completed'
        },
        {
          executionTime: duration,
          status: 'completed',
          output: result
        }
      );
      
      // Sync with our tracking system
      await this.prismaMigrationTracker?.syncPrismaMigrations();
      
      // Execute post-task hook
      await this.claudeFlowIntegration.executeHook('post-task', {
        'task-id': `prisma-migration-${Date.now()}`
      });
      
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to run Prisma migrations', error);
      
      // Log migration failure to Claude Flow memory
      await this.memoryHelpers.logOperation(
        'prisma_migration',
        'PrismaMigrationEngine',
        'Prisma migration failed',
        { error: error as Error, deploy }
      );
      
      return {
        success: false,
        error: {
          code: 'PRISMA_MIGRATION_FAILED',
          message: 'Failed to run Prisma migrations',
          details: error
        }
      };
    }
  }

  /**
   * Generate Prisma migration from drift
   */
  async generatePrismaMigrationFromDrift(
    driftReport: DriftReport,
    name: string
  ): Promise<IntegrityResult<void>> {
    try {
      // Generate SQL from drift report
      const sqlMigration = await this.migrationGenerator!.generateFromDriftReport(
        driftReport,
        {
          name: `drift_${name}`,
          format: 'sql',
          includeRollback: true,
          atomic: true
        }
      );

      if (!sqlMigration.success || !sqlMigration.data) {
        throw new Error('Failed to generate SQL migration');
      }

      // Create Prisma migration with the SQL
      const migrationName = `${Date.now()}_${name}`;
      const migrationPath = path.join(
        this.config.prisma.migrationsDir,
        migrationName
      );

      // Create migration directory
      execSync(`mkdir -p ${migrationPath}`);

      // Write migration SQL
      const fs = require('fs');
      fs.writeFileSync(
        path.join(migrationPath, 'migration.sql'),
        sqlMigration.data[0].sql || ''
      );

      // Update Prisma schema if needed
      await this.updatePrismaSchemaFromDrift(driftReport);

      this.logger.info(`Created Prisma migration: ${migrationName}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to generate Prisma migration from drift', error);
      return {
        success: false,
        error: {
          code: 'PRISMA_DRIFT_MIGRATION_FAILED',
          message: 'Failed to generate Prisma migration from drift',
          details: error
        }
      };
    }
  }

  /**
   * Validate warehouse-specific forms and routes
   */
  async validateWarehouseIntegrity(): Promise<IntegrityResult<WarehouseValidation>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Validating warehouse-specific integrity');

    try {
      // Validate payment forms
      const paymentForms = await this.warehouseFormValidator!.validatePaymentForms();
      
      // Validate operation forms
      const operationForms = await this.warehouseFormValidator!.validateOperationForms();
      
      // Validate API routes
      const apiRoutes = await this.warehouseRouteValidator!.validateWarehouseRoutes();

      const validation: WarehouseValidation = {
        paymentForms: paymentForms.success ? paymentForms.data! : [],
        operationForms: operationForms.success ? operationForms.data! : [],
        apiRoutes: apiRoutes.success ? apiRoutes.data! : []
      };

      const hasErrors = [
        ...validation.paymentForms,
        ...validation.operationForms,
        ...validation.apiRoutes
      ].some(v => !v.valid);

      if (hasErrors) {
        this.logger.warn('Warehouse validation found issues', validation);
      } else {
        this.logger.info('Warehouse validation passed');
      }

      return {
        success: true,
        data: validation,
        warnings: hasErrors ? ['Validation issues found'] : undefined
      };
    } catch (error) {
      this.logger.error('Failed to validate warehouse integrity', error);
      return {
        success: false,
        error: {
          code: 'WAREHOUSE_VALIDATION_FAILED',
          message: 'Failed to validate warehouse integrity',
          details: error
        }
      };
    }
  }

  /**
   * Detect Prisma schema drift
   */
  async detectPrismaSchemaDrift(): Promise<IntegrityResult<DriftReport>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get current database schema
      const dbSchema = await this.schemaAnalyzer!.analyze();
      if (!dbSchema.success || !dbSchema.data) {
        throw new Error('Failed to analyze database schema');
      }

      // Get Prisma schema
      const prismaSchema = await this.prismaSchemaAnalyzer!.analyzePrismaSchema();
      if (!prismaSchema.success || !prismaSchema.data) {
        throw new Error('Failed to analyze Prisma schema');
      }

      // Compare schemas
      const driftReport = await this.driftDetector!.detectPrismaDrifts(
        prismaSchema.data,
        dbSchema.data
      );

      return driftReport;
    } catch (error) {
      this.logger.error('Failed to detect Prisma schema drift', error);
      return {
        success: false,
        error: {
          code: 'PRISMA_DRIFT_DETECTION_FAILED',
          message: 'Failed to detect Prisma schema drift',
          details: error
        }
      };
    }
  }

  /**
   * Update Prisma schema from drift report
   */
  private async updatePrismaSchemaFromDrift(driftReport: DriftReport): Promise<void> {
    // This would analyze the drift and suggest Prisma schema updates
    // For now, log the drifts that need manual schema updates
    const schemaDrifts = driftReport.drifts.filter(
      drift => drift.type === 'PRISMA_MODEL_MISMATCH'
    );

    if (schemaDrifts.length > 0) {
      this.logger.warn(
        'Prisma schema updates needed:',
        schemaDrifts.map(d => d.description)
      );
    }
  }

  /**
   * Run pending migrations
   */
  async runPendingMigrations(options?: MigrationOptions): Promise<IntegrityResult<Migration[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Running pending migrations');
    const result = await this.migrationEngine!.runMigrations(options);
    
    if (result.success) {
      this.logger.info(`Executed ${result.data?.length || 0} migrations`);
      
      // Re-analyze schema after migrations
      await this.schemaAnalyzer!.analyze();
      
      // Sync with Prisma
      await this.prismaMigrationTracker?.syncPrismaMigrations();
    } else {
      this.logger.error('Failed to run migrations', result.error);
    }

    return result;
  }

  /**
   * Analyze database schema
   */
  async analyzeSchema(): Promise<IntegrityResult<DatabaseSchema>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Analyzing database schema');
    const result = await this.schemaAnalyzer!.analyze();
    
    // Enhance with Prisma models
    if (result.success && result.data) {
      const prismaResult = await this.prismaSchemaAnalyzer!.analyzePrismaSchema();
      if (prismaResult.success && prismaResult.data) {
        result.data.prismaModels = prismaResult.data.prismaModels;
      }
    }
    
    return result;
  }

  /**
   * Validate API routes
   */
  async validateRoutes(): Promise<IntegrityResult<ApiRoute[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Validating API routes');
    
    const result = await this.routeValidator!.validate();
    
    // Store validation results in Claude Flow memory
    if (result.success && result.data) {
      await this.memoryHelpers.storeValidationResults('routes', result.data);
    }
    
    return result;
  }

  /**
   * Scan forms
   */
  async scanForms(): Promise<IntegrityResult<FormValidationResult[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Scanning forms');
    
    const result = await this.formScanner!.scan();
    
    // Store validation results in Claude Flow memory
    if (result.success && result.data) {
      await this.memoryHelpers.storeValidationResults('forms', result.data);
    }
    
    return result;
  }

  /**
   * Detect drifts
   */
  async detectDrifts(): Promise<IntegrityResult<DriftReport>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Detecting drifts');
    
    // Execute pre-task hook
    await this.claudeFlowIntegration.executeHook('pre-task', {
      description: 'Detecting database schema drifts'
    });
    
    const driftReport = await this.driftDetector!.detectDrifts();
    
    // Also check Prisma-specific drifts
    const prismaDriftReport = await this.detectPrismaSchemaDrift();
    
    if (driftReport.success && prismaDriftReport.success && 
        driftReport.data && prismaDriftReport.data) {
      // Merge drift reports
      driftReport.data.drifts.push(...prismaDriftReport.data.drifts);
      driftReport.data.summary.totalDrifts += prismaDriftReport.data.summary.totalDrifts;
      
      // Store drift analysis in Claude Flow memory
      await this.memoryHelpers.storeDriftAnalysis(driftReport.data);
      
      // Execute post-task hook
      await this.claudeFlowIntegration.executeHook('post-task', {
        'task-id': 'drift-detection'
      });
    }
    
    return driftReport;
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<IntegrityResult<Migration[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const migrations = await this.migrationEngine!.getMigrationStatus();
    
    // Include Prisma migrations
    const prismaMigrations = await this.prismaMigrationTracker!.getPrismaMigrations();
    if (migrations.success && prismaMigrations.success && 
        migrations.data && prismaMigrations.data) {
      migrations.data.push(...prismaMigrations.data);
    }
    
    return migrations;
  }

  /**
   * Run full integrity check
   */
  async runFullIntegrityCheck(): Promise<IntegrityResult<IntegrityCheckResult>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Running full integrity check');

    const results: IntegrityCheckResult = {
      schema: { success: false },
      routes: { success: false },
      forms: { success: false },
      drifts: { success: false },
      warehouse: { success: false },
      timestamp: new Date()
    };

    // Analyze schema
    const schemaResult = await this.analyzeSchema();
    results.schema = {
      success: schemaResult.success,
      data: schemaResult.data,
      error: schemaResult.error
    };

    // Validate routes
    const routesResult = await this.validateRoutes();
    results.routes = {
      success: routesResult.success,
      data: routesResult.data,
      error: routesResult.error,
      warnings: routesResult.warnings
    };

    // Scan forms
    const formsResult = await this.scanForms();
    results.forms = {
      success: formsResult.success,
      data: formsResult.data,
      error: formsResult.error,
      warnings: formsResult.warnings
    };

    // Detect drifts
    const driftsResult = await this.detectDrifts();
    results.drifts = {
      success: driftsResult.success,
      data: driftsResult.data,
      error: driftsResult.error
    };

    // Validate warehouse-specific integrity
    const warehouseResult = await this.validateWarehouseIntegrity();
    results.warehouse = {
      success: warehouseResult.success,
      data: warehouseResult.data,
      error: warehouseResult.error,
      warnings: warehouseResult.warnings
    };

    // Generate summary
    const summary = this.generateIntegrityCheckSummary(results);
    
    this.logger.info('Integrity check completed', summary);
    this.emit('integrity_check_complete', results);

    return {
      success: true,
      data: results,
      metadata: summary
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.on('migration_complete', (migration) => {
      this.logger.info(`Migration ${migration.id} completed`);
    });

    this.on('drift_detected', (drift) => {
      this.logger.warn('Drift detected', drift);
      
      // Send notifications if configured
      if (this.config.drift.notificationChannels) {
        this.sendDriftNotifications(drift);
      }
    });

    this.on('error', (error) => {
      this.logger.error('Error in integrity system', error);
    });
  }

  /**
   * Setup drift detection schedule
   */
  private setupDriftDetection(): void {
    this.driftCheckJob = new CronJob(
      this.config.drift.schedule!,
      async () => {
        try {
          const result = await this.detectDrifts();
          if (result.success && result.data && result.data.drifts.length > 0) {
            this.emit('drift_detected', result.data);
            
            if (this.config.drift.autoFix) {
              await this.autoFixDrifts(result.data);
            }
          }
        } catch (error) {
          this.logger.error('Scheduled drift detection failed', error);
        }
      },
      null,
      true
    );
  }

  /**
   * Auto-fix drifts
   */
  private async autoFixDrifts(driftReport: DriftReport): Promise<void> {
    const fixableDrifts = driftReport.drifts.filter(d => d.fixable);
    
    if (fixableDrifts.length === 0) {
      return;
    }

    this.logger.info(`Auto-fixing ${fixableDrifts.length} drifts`);
    
    // Generate and run fix migrations
    const fixResult = await this.generateDriftMigration(driftReport, {
      dryRun: false,
      includeRollback: true
    });

    if (fixResult.success && fixResult.data) {
      await this.runPendingMigrations();
    }
  }

  /**
   * Send drift notifications
   */
  private async sendDriftNotifications(driftReport: DriftReport): Promise<void> {
    for (const channel of this.config.drift.notificationChannels || []) {
      try {
        switch (channel.type) {
          case 'console':
            console.warn('Drift detected:', driftReport.summary);
            break;
          case 'webhook':
            // Implement webhook notification
            break;
          // Add other notification types as needed
        }
      } catch (error) {
        this.logger.error(`Failed to send notification via ${channel.type}`, error);
      }
    }
  }

  /**
   * Generate integrity check summary
   */
  private generateIntegrityCheckSummary(results: IntegrityCheckResult): Record<string, any> {
    const summary: Record<string, any> = {
      overallSuccess: results.schema.success && results.routes.success && 
                      results.forms.success && results.drifts.success &&
                      results.warehouse.success,
      timestamp: results.timestamp,
      issues: []
    };

    if (!results.schema.success) {
      summary.issues.push('Schema analysis failed');
    }

    if (results.routes.warnings && results.routes.warnings.length > 0) {
      summary.issues.push(`${results.routes.warnings.length} route warnings`);
    }

    if (results.forms.warnings && results.forms.warnings.length > 0) {
      summary.issues.push(`${results.forms.warnings.length} form warnings`);
    }

    if (results.drifts.data && results.drifts.data.drifts.length > 0) {
      summary.issues.push(`${results.drifts.data.drifts.length} drifts detected`);
    }

    if (results.warehouse.warnings && results.warehouse.warnings.length > 0) {
      summary.issues.push(`${results.warehouse.warnings.length} warehouse validation warnings`);
    }

    return summary;
  }

  /**
   * Get database metrics
   */
  getMetrics(): DatabaseMetrics {
    return {
      connectionMetrics: this.connection?.getMetrics(),
      migrationCount: 0, // TODO: Get from migration engine
      schemaVersion: '', // TODO: Get from schema analyzer
      lastDriftCheck: undefined, // TODO: Track last drift check
      uptime: process.uptime()
    };
  }

  /**
   * Get recent logs from Claude Flow memory
   */
  async getRecentLogs(limit: number = 20, category?: string, level?: string): Promise<any[]> {
    return await this.claudeFlowIntegration.getRecentLogs(limit, category, level);
  }

  /**
   * Export logs from Claude Flow memory
   */
  async exportLogs(startDate?: Date, endDate?: Date, format: 'json' | 'csv' = 'json'): Promise<string> {
    return await this.claudeFlowIntegration.exportLogs({
      format,
      startDate,
      endDate
    });
  }

  /**
   * Get analytics from Claude Flow memory
   */
  async getAnalytics(days: number = 7): Promise<any> {
    return await this.memoryHelpers.getComprehensiveAnalytics(days);
  }

  /**
   * Shutdown the system
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Database Integrity System');

    // Stop drift detection job
    if (this.driftCheckJob) {
      this.driftCheckJob.stop();
    }

    // Cleanup Claude Flow memory and end session
    await this.claudeFlowIntegration.endSession();
    await this.memoryHelpers.cleanup();

    // Disconnect from database
    await this.connectionManager.disconnect();

    this.isInitialized = false;
    this.emit('shutdown');
  }

  /**
   * Generate migration from drift report
   */
  async generateDriftMigration(
    driftReport: DriftReport,
    options?: Partial<MigrationGeneratorOptions>
  ): Promise<IntegrityResult<Migration[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const generatorOptions: MigrationGeneratorOptions = {
      name: `fix_drifts_${Date.now()}`,
      dryRun: options?.dryRun ?? false,
      format: options?.format ?? 'sql',
      includeRollback: options?.includeRollback ?? true,
      atomic: options?.atomic ?? true
    };

    return await this.migrationGenerator!.generateFromDriftReport(
      driftReport,
      generatorOptions
    );
  }
}

// Additional type definitions
interface IntegrityCheckResult {
  schema: {
    success: boolean;
    data?: DatabaseSchema;
    error?: IntegrityError;
  };
  routes: {
    success: boolean;
    data?: ApiRoute[];
    error?: IntegrityError;
    warnings?: string[];
  };
  forms: {
    success: boolean;
    data?: FormValidationResult[];
    error?: IntegrityError;
    warnings?: string[];
  };
  drifts: {
    success: boolean;
    data?: DriftReport;
    error?: IntegrityError;
  };
  warehouse: {
    success: boolean;
    data?: WarehouseValidation;
    error?: IntegrityError;
    warnings?: string[];
  };
  timestamp: Date;
}

interface DatabaseMetrics {
  connectionMetrics?: any;
  migrationCount: number;
  schemaVersion: string;
  lastDriftCheck?: Date;
  uptime: number;
}

// Export all components
export * from './types';
export { DatabaseConnectionManager, DatabaseConnection } from './core/database-connection';
export { MigrationEngine } from './migration/migration-engine';
export { SchemaAnalyzer } from './schema/schema-analyzer';
export { RouteValidator } from './validation/route-validator';
export { FormScanner } from './validation/form-scanner';
export { DriftDetector } from './validation/drift-detector';
export { MigrationGenerator } from './generator/migration-generator';
export { PrismaSchemaAnalyzer } from './prisma-adapters/prisma-schema-analyzer';
export { PrismaMigrationTracker } from './prisma-adapters/prisma-migration-tracker';
export { WarehouseFormValidator } from './warehouse-validators/warehouse-form-validator';
export { WarehouseRouteValidator } from './warehouse-validators/warehouse-route-validator';

// Export Claude Flow memory components
export { ClaudeFlowIntegration } from './claude-flow-integration';
export { MemoryHelpers } from './memory-helpers';

// Export legacy memory bank components for backwards compatibility
export { memoryBank, MemoryBank } from './memory-bank/memory-bank';
export { MemoryBankAnalytics } from './memory-bank/analytics';
export { RetentionPolicyManager } from './memory-bank/retention-policy';
export * from './memory-bank/log-categories';