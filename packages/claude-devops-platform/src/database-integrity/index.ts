/**
 * Database Integrity System
 * Main entry point for database migration and integrity management
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
  ApiRoute
} from './types';
import { DatabaseConnectionManager, DatabaseConnection } from './core/database-connection';
import { MigrationEngine } from './migration/migration-engine';
import { SchemaAnalyzer } from './schema/schema-analyzer';
import { RouteValidator } from './validation/route-validator';
import { FormScanner } from './validation/form-scanner';
import { DriftDetector } from './validation/drift-detector';
import { MigrationGenerator, MigrationGeneratorOptions } from './generator/migration-generator';
import { EventEmitter } from 'events';
import { CronJob } from 'cron';
import winston from 'winston';

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
  private driftCheckJob?: CronJob;
  private logger: winston.Logger;
  private isInitialized = false;

  constructor(config: DatabaseIntegrityConfig) {
    super();
    this.config = config;
    this.connectionManager = new DatabaseConnectionManager(config.database);

    // Setup logger
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        }),
        new winston.transports.File({
          filename: 'database-integrity.log'
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
      this.logger.info('Initializing Database Integrity System');

      // Connect to database
      const connectionResult = await this.connectionManager.connect();
      if (!connectionResult.success || !connectionResult.data) {
        throw new Error('Failed to connect to database');
      }
      this.connection = connectionResult.data;

      // Initialize components
      this.migrationEngine = new MigrationEngine(this.connection, this.config.migration);
      this.schemaAnalyzer = new SchemaAnalyzer(this.connection, this.config.schema);
      this.driftDetector = new DriftDetector(this.connection, this.config.drift, this.schemaAnalyzer);
      this.migrationGenerator = new MigrationGenerator(this.migrationEngine);

      // Initialize migration engine
      const migrationInitResult = await this.migrationEngine.initialize();
      if (!migrationInitResult.success) {
        throw new Error('Failed to initialize migration engine');
      }

      // Run auto migrations if enabled
      if (this.config.migration.autoRun) {
        await this.runPendingMigrations();
      }

      // Analyze current schema
      const schemaResult = await this.schemaAnalyzer.analyze();
      if (schemaResult.success && schemaResult.data) {
        this.routeValidator = new RouteValidator(schemaResult.data, this.config.validation.routes);
        this.formScanner = new FormScanner(schemaResult.data, this.config.validation.forms);
      }

      // Setup drift detection schedule
      if (this.config.drift.enabled && this.config.drift.schedule) {
        this.setupDriftDetection();
      }

      this.isInitialized = true;
      this.logger.info('Database Integrity System initialized successfully');

      this.emit('initialized');
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to initialize Database Integrity System', error);
      const integrityError: IntegrityError = {
        code: 'INIT_FAILED',
        message: 'Failed to initialize Database Integrity System',
        details: error
      };
      return { success: false, error: integrityError };
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
    } else {
      this.logger.error('Failed to run migrations', result.error);
    }

    return result;
  }

  /**
   * Generate migration from schema changes
   */
  async generateMigration(
    name: string,
    options?: Partial<MigrationGeneratorOptions>
  ): Promise<IntegrityResult<Migration>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Get current schema
    const currentSchemaResult = await this.schemaAnalyzer!.analyze();
    if (!currentSchemaResult.success || !currentSchemaResult.data) {
      return {
        success: false,
        error: {
          code: 'SCHEMA_ANALYSIS_FAILED',
          message: 'Failed to analyze current schema'
        }
      };
    }

    // Load previous schema
    const previousSchema = await this.loadPreviousSchema();
    if (!previousSchema) {
      return {
        success: false,
        error: {
          code: 'NO_PREVIOUS_SCHEMA',
          message: 'No previous schema found for comparison'
        }
      };
    }

    // Generate migration
    const generatorOptions: MigrationGeneratorOptions = {
      name,
      dryRun: options?.dryRun ?? false,
      format: options?.format ?? 'sql',
      includeRollback: options?.includeRollback ?? true,
      atomic: options?.atomic ?? true
    };

    return await this.migrationGenerator!.generateFromSchemaChange(
      previousSchema,
      currentSchemaResult.data,
      generatorOptions
    );
  }

  /**
   * Analyze database schema
   */
  async analyzeSchema(): Promise<IntegrityResult<DatabaseSchema>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Analyzing database schema');
    return await this.schemaAnalyzer!.analyze();
  }

  /**
   * Validate API routes
   */
  async validateRoutes(): Promise<IntegrityResult<ApiRoute[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.routeValidator) {
      // Get current schema and create validator
      const schemaResult = await this.schemaAnalyzer!.analyze();
      if (!schemaResult.success || !schemaResult.data) {
        return {
          success: false,
          error: {
            code: 'SCHEMA_REQUIRED',
            message: 'Schema analysis required before route validation'
          }
        };
      }
      this.routeValidator = new RouteValidator(schemaResult.data, this.config.validation.routes);
    }

    this.logger.info('Validating API routes');
    return await this.routeValidator.validate();
  }

  /**
   * Scan forms
   */
  async scanForms(): Promise<IntegrityResult<FormValidationResult[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.formScanner) {
      // Get current schema and create scanner
      const schemaResult = await this.schemaAnalyzer!.analyze();
      if (!schemaResult.success || !schemaResult.data) {
        return {
          success: false,
          error: {
            code: 'SCHEMA_REQUIRED',
            message: 'Schema analysis required before form scanning'
          }
        };
      }
      this.formScanner = new FormScanner(schemaResult.data, this.config.validation.forms);
    }

    this.logger.info('Scanning forms');
    return await this.formScanner.scan();
  }

  /**
   * Detect drifts
   */
  async detectDrifts(): Promise<IntegrityResult<DriftReport>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info('Detecting drifts');
    return await this.driftDetector!.detectDrifts();
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

  /**
   * Generate migration from form validation
   */
  async generateFormMigration(
    validationResults: FormValidationResult[],
    options?: Partial<MigrationGeneratorOptions>
  ): Promise<IntegrityResult<Migration>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const generatorOptions: MigrationGeneratorOptions = {
      name: `form_updates_${Date.now()}`,
      dryRun: options?.dryRun ?? false,
      format: options?.format ?? 'sql',
      includeRollback: options?.includeRollback ?? true,
      atomic: options?.atomic ?? true
    };

    return await this.migrationGenerator!.generateFromFormValidation(
      validationResults,
      generatorOptions
    );
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<IntegrityResult<Migration[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.migrationEngine!.getMigrationStatus();
  }

  /**
   * Rollback migrations
   */
  async rollbackMigrations(
    target?: string,
    options?: MigrationOptions
  ): Promise<IntegrityResult<Migration[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.info(`Rolling back migrations to ${target || 'previous'}`);
    return await this.migrationEngine!.rollbackMigrations(target, options);
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
   * Get database metrics
   */
  getMetrics(): DatabaseMetrics {
    return {
      connectionMetrics: this.connectionManager.getConnection 
        ? this.connection?.getMetrics() 
        : undefined,
      migrationCount: 0, // TODO: Get from migration engine
      schemaVersion: '', // TODO: Get from schema analyzer
      lastDriftCheck: undefined, // TODO: Track last drift check
      uptime: process.uptime()
    };
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

    // Disconnect from database
    await this.connectionManager.disconnect();

    this.isInitialized = false;
    this.emit('shutdown');
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen to migration events
    this.on('migration_complete', (migration) => {
      this.logger.info(`Migration ${migration.id} completed`);
    });

    this.on('drift_detected', (drift) => {
      this.logger.warn('Drift detected', drift);
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
          await this.detectDrifts();
        } catch (error) {
          this.logger.error('Scheduled drift detection failed', error);
        }
      },
      null,
      true
    );
  }

  /**
   * Load previous schema
   */
  private async loadPreviousSchema(): Promise<DatabaseSchema | undefined> {
    // TODO: Implement loading from version control or backup
    return undefined;
  }

  /**
   * Generate integrity check summary
   */
  private generateIntegrityCheckSummary(results: IntegrityCheckResult): Record<string, any> {
    const summary: Record<string, any> = {
      overallSuccess: results.schema.success && results.routes.success && 
                      results.forms.success && results.drifts.success,
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

    return summary;
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