import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';
import { ClaudeMemoryManager } from '../memory/ClaudeMemoryManager';
import { ValidationManager } from '../validators/ValidationManager';
import { SchemaManager } from '../core/SchemaManager';
import type {
  IntegrityConfig,
  IntegrityCheck,
  IntegrityReport,
  SchemaDrift,
  ValidationResult,
  MonitoringEvent
} from '../types';

export class IntegrityEngine extends EventEmitter {
  private config: IntegrityConfig;
  private configManager: ConfigManager;
  private memoryManager: ClaudeMemoryManager;
  private validationManager: ValidationManager;
  private schemaManager: SchemaManager;
  private monitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(configPath?: string) {
    super();
    this.configManager = new ConfigManager(configPath);
    this.config = this.configManager.getConfig();
    
    this.memoryManager = new ClaudeMemoryManager(this.config.memory);
    this.validationManager = new ValidationManager(this.config.validation);
    this.schemaManager = new SchemaManager(this.config.database);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.on('check:start', this.handleCheckStart.bind(this));
    this.on('check:complete', this.handleCheckComplete.bind(this));
    this.on('error', this.handleError.bind(this));
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Claude DB Integrity Engine');
    
    try {
      await this.memoryManager.initialize();
      await this.schemaManager.initialize();
      
      // Store initialization in Claude memory
      await this.memoryManager.store('system/last_init', {
        timestamp: new Date(),
        version: '1.0.0',
        config: this.config
      });

      logger.info('Integrity engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize integrity engine:', error);
      throw error;
    }
  }

  async runIntegrityChecks(options: { fix?: boolean; verbose?: boolean } = {}): Promise<IntegrityReport> {
    const reportId = `check_${Date.now()}`;
    const startTime = Date.now();
    
    this.emit('check:start', { reportId, options });
    
    try {
      logger.info(`Starting integrity checks (Report ID: ${reportId})`);
      
      const checks: IntegrityCheck[] = [];
      
      // Schema integrity checks
      const schemaChecks = await this.runSchemaChecks();
      checks.push(...schemaChecks);
      
      // Data integrity checks
      const dataChecks = await this.runDataChecks();
      checks.push(...dataChecks);
      
      // Constraint checks
      const constraintChecks = await this.runConstraintChecks();
      checks.push(...constraintChecks);
      
      // Foreign key checks
      const foreignKeyChecks = await this.runForeignKeyChecks();
      checks.push(...foreignKeyChecks);
      
      // Index optimization checks
      const indexChecks = await this.runIndexChecks();
      checks.push(...indexChecks);
      
      // Auto-fix issues if requested
      if (options.fix) {
        await this.autoFixIssues(checks);
      }
      
      const report: IntegrityReport = {
        id: reportId,
        timestamp: new Date(),
        checks,
        summary: this.generateSummary(checks),
        metadata: {
          version: '1.0.0',
          database: this.config.database.provider,
          schema: this.config.database.schema || 'default'
        }
      };
      
      // Store report in Claude memory
      await this.memoryManager.store(`reports/${reportId}`, report);
      
      this.emit('check:complete', { report, duration: Date.now() - startTime });
      
      logger.info(`Integrity checks completed (${report.summary.passed}/${report.summary.total} passed)`);
      
      return report;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async checkSchemaDrift(baseline?: string): Promise<SchemaDrift> {
    logger.info('Checking for schema drift');
    
    try {
      const currentSnapshot = await this.schemaManager.createSnapshot();
      
      let baselineSnapshot;
      if (baseline) {
        baselineSnapshot = await this.memoryManager.retrieve(`snapshots/${baseline}`);
      } else {
        baselineSnapshot = await this.memoryManager.retrieve('snapshots/baseline');
      }
      
      if (!baselineSnapshot) {
        logger.warn('No baseline snapshot found, creating one');
        await this.memoryManager.store('snapshots/baseline', currentSnapshot);
        return {
          hasDrift: false,
          changes: [],
          baseline: currentSnapshot,
          current: currentSnapshot,
          timestamp: new Date()
        };
      }
      
      const drift = await this.schemaManager.compareSchemata(baselineSnapshot, currentSnapshot);
      
      // Store drift analysis in memory
      await this.memoryManager.store(`drift/${Date.now()}`, drift);
      
      if (drift.hasDrift) {
        logger.warn(`Schema drift detected: ${drift.changes.length} changes`);
        this.emit('schema:drift', drift);
      }
      
      return drift;
    } catch (error) {
      logger.error('Schema drift check failed:', error);
      throw error;
    }
  }

  async validateFormsAndRoutes(options: { routes?: boolean; forms?: boolean; fix?: boolean } = {}): Promise<ValidationResult[]> {
    logger.info('Validating forms and routes');
    
    try {
      const results: ValidationResult[] = [];
      
      if (options.forms !== false) {
        const formResults = await this.validationManager.validateForms();
        results.push(...formResults);
      }
      
      if (options.routes !== false) {
        const routeResults = await this.validationManager.validateRoutes();
        results.push(...routeResults);
      }
      
      // Auto-fix validation issues if requested
      if (options.fix) {
        await this.validationManager.autoFixValidationIssues(results);
      }
      
      // Store validation results in memory
      await this.memoryManager.store(`validation/${Date.now()}`, results);
      
      const errors = results.filter(r => !r.valid).length;
      logger.info(`Validation completed: ${results.length - errors}/${results.length} files valid`);
      
      return results;
    } catch (error) {
      logger.error('Validation failed:', error);
      throw error;
    }
  }

  async startMonitoring(interval: number = 30): Promise<void> {
    if (this.monitoring) {
      logger.warn('Monitoring already active');
      return;
    }
    
    logger.info(`Starting continuous monitoring (interval: ${interval}s)`);
    
    this.monitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runMonitoringCycle();
      } catch (error) {
        logger.error('Monitoring cycle failed:', error);
        this.emit('monitoring:error', error);
      }
    }, interval * 1000);
    
    this.emit('monitoring:start', { interval });
  }

  async stopMonitoring(): Promise<void> {
    if (!this.monitoring) {
      return;
    }
    
    logger.info('Stopping continuous monitoring');
    
    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    this.emit('monitoring:stop');
  }

  private async runMonitoringCycle(): Promise<void> {
    const cycleStart = Date.now();
    
    try {
      // Quick integrity checks
      const quickChecks = await this.runQuickChecks();
      
      // Check for schema drift
      const drift = await this.checkSchemaDrift();
      
      // Validate critical routes/forms
      const validation = await this.validateCriticalComponents();
      
      const event: MonitoringEvent = {
        id: `cycle_${Date.now()}`,
        type: 'check',
        severity: this.determineEventSeverity(quickChecks, drift, validation),
        message: 'Monitoring cycle completed',
        details: {
          checks: quickChecks.summary,
          drift: drift.hasDrift,
          validation: validation.length
        },
        timestamp: new Date(),
        source: 'monitoring'
      };
      
      await this.memoryManager.store(`monitoring/events/${event.id}`, event);
      this.emit('monitoring:cycle', event);
      
    } catch (error) {
      logger.error('Monitoring cycle error:', error);
      
      const errorEvent: MonitoringEvent = {
        id: `error_${Date.now()}`,
        type: 'error',
        severity: 'error',
        message: 'Monitoring cycle failed',
        details: { error: error.message },
        timestamp: new Date(),
        source: 'monitoring'
      };
      
      await this.memoryManager.store(`monitoring/events/${errorEvent.id}`, errorEvent);
      this.emit('monitoring:error', errorEvent);
    }
  }

  private async runSchemaChecks(): Promise<IntegrityCheck[]> {
    // Implementation for schema integrity checks
    return [];
  }

  private async runDataChecks(): Promise<IntegrityCheck[]> {
    // Implementation for data integrity checks
    return [];
  }

  private async runConstraintChecks(): Promise<IntegrityCheck[]> {
    // Implementation for constraint checks
    return [];
  }

  private async runForeignKeyChecks(): Promise<IntegrityCheck[]> {
    // Implementation for foreign key checks
    return [];
  }

  private async runIndexChecks(): Promise<IntegrityCheck[]> {
    // Implementation for index optimization checks
    return [];
  }

  private async runQuickChecks(): Promise<IntegrityReport> {
    // Implementation for quick monitoring checks
    const checks: IntegrityCheck[] = [];
    
    return {
      id: `quick_${Date.now()}`,
      timestamp: new Date(),
      checks,
      summary: this.generateSummary(checks),
      metadata: {
        version: '1.0.0',
        database: this.config.database.provider,
        schema: this.config.database.schema || 'default'
      }
    };
  }

  private async validateCriticalComponents(): Promise<ValidationResult[]> {
    // Implementation for critical component validation
    return [];
  }

  private async autoFixIssues(checks: IntegrityCheck[]): Promise<void> {
    logger.info('Auto-fixing integrity issues');
    
    const fixableChecks = checks.filter(check => 
      check.status === 'failed' && 
      ['index', 'constraint'].includes(check.type)
    );
    
    for (const check of fixableChecks) {
      try {
        await this.applyFix(check);
        check.status = 'passed';
        check.message = `Auto-fixed: ${check.message}`;
      } catch (error) {
        logger.error(`Failed to fix ${check.id}:`, error);
      }
    }
  }

  private async applyFix(check: IntegrityCheck): Promise<void> {
    // Implementation for applying auto-fixes
    logger.info(`Applying fix for ${check.id}`);
  }

  private generateSummary(checks: IntegrityCheck[]) {
    return {
      total: checks.length,
      passed: checks.filter(c => c.status === 'passed').length,
      failed: checks.filter(c => c.status === 'failed').length,
      skipped: checks.filter(c => c.status === 'skipped').length
    };
  }

  private determineEventSeverity(checks: IntegrityReport, drift: SchemaDrift, validation: ValidationResult[]): 'info' | 'warning' | 'error' | 'critical' {
    if (checks.summary.failed > 0 || drift.hasDrift || validation.some(v => !v.valid)) {
      return 'warning';
    }
    return 'info';
  }

  private handleCheckStart(data: any): void {
    logger.debug('Integrity check started:', data);
  }

  private handleCheckComplete(data: any): void {
    logger.debug('Integrity check completed:', data);
  }

  private handleError(error: any): void {
    logger.error('Integrity engine error:', error);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down integrity engine');
    
    await this.stopMonitoring();
    await this.memoryManager.shutdown();
    
    this.removeAllListeners();
  }
}