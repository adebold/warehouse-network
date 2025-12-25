/**
 * Drift Detector
 * Detects drift between database state, schema files, and code
 */

import {
  DatabaseSchema,
  DriftReport,
  Drift,
  DriftType,
  DriftSeverity,
  DriftSuggestion,
  DriftConfig,
  IntegrityResult,
  IntegrityError,
  IntegrityEventType,
  Table,
  Column,
  ApiRoute,
  FormSchema
} from '../types';
import { DatabaseConnection } from '../core/database-connection';
import { SchemaAnalyzer } from '../schema/schema-analyzer';
import { RouteValidator } from './route-validator';
import { FormScanner } from './form-scanner';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { format } from 'date-fns';
import crypto from 'crypto';

export class DriftDetector extends EventEmitter {
  private connection: DatabaseConnection;
  private config: DriftConfig;
  private schemaAnalyzer: SchemaAnalyzer;
  private currentSchema?: DatabaseSchema;
  private savedSchema?: DatabaseSchema;

  constructor(
    connection: DatabaseConnection,
    config: DriftConfig,
    schemaAnalyzer: SchemaAnalyzer
  ) {
    super();
    this.connection = connection;
    this.config = config;
    this.schemaAnalyzer = schemaAnalyzer;
  }

  /**
   * Detect all drifts in the system
   */
  async detectDrifts(): Promise<IntegrityResult<DriftReport>> {
    try {
      if (!this.config.enabled) {
        return { 
          success: true, 
          data: {
            timestamp: new Date(),
            schemaVersion: 'N/A',
            databaseVersion: 'N/A',
            drifts: [],
            suggestions: []
          },
          metadata: { message: 'Drift detection disabled' } 
        };
      }

      // Analyze current database state
      const schemaResult = await this.schemaAnalyzer.analyze();
      if (!schemaResult.success || !schemaResult.data) {
        throw new Error('Failed to analyze database schema');
      }
      this.currentSchema = schemaResult.data;

      // Load saved schema
      this.savedSchema = await this.loadSavedSchema();

      // Detect drifts
      const drifts: Drift[] = [];
      const suggestions: DriftSuggestion[] = [];

      // Compare schemas
      if (this.savedSchema) {
        const schemaDrifts = await this.compareDatabaseSchemas(
          this.savedSchema,
          this.currentSchema
        );
        drifts.push(...schemaDrifts);
      }

      // Check for unauthorized changes
      const unauthorizedDrifts = await this.detectUnauthorizedChanges();
      drifts.push(...unauthorizedDrifts);

      // Validate routes against schema
      const routeDrifts = await this.validateRoutesAgainstSchema();
      drifts.push(...routeDrifts);

      // Validate forms against schema
      const formDrifts = await this.validateFormsAgainstSchema();
      drifts.push(...formDrifts);

      // Generate suggestions
      for (const drift of drifts) {
        const suggestion = this.generateSuggestion(drift);
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }

      // Create report
      const report: DriftReport = {
        timestamp: new Date(),
        schemaVersion: this.savedSchema?.version || 'unknown',
        databaseVersion: this.currentSchema.version,
        drifts,
        suggestions
      };

      // Save report
      await this.saveReport(report);

      // Auto-fix if enabled and safe
      if (this.config.autoFix) {
        await this.autoFixDrifts(report);
      }

      // Send notification if webhook configured
      if (this.config.notificationWebhook && drifts.length > 0) {
        await this.sendNotification(report);
      }

      this.emit('event', {
        type: IntegrityEventType.DRIFT_DETECTED,
        timestamp: new Date(),
        source: 'DriftDetector',
        data: {
          driftCount: drifts.length,
          critical: drifts.filter(d => d.severity === DriftSeverity.CRITICAL).length,
          high: drifts.filter(d => d.severity === DriftSeverity.HIGH).length
        }
      });

      return { success: true, data: report };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'DRIFT_DETECTION_FAILED',
        message: 'Failed to detect drifts',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Compare two database schemas
   */
  private async compareDatabaseSchemas(
    oldSchema: DatabaseSchema,
    newSchema: DatabaseSchema
  ): Promise<Drift[]> {
    const drifts: Drift[] = [];

    // Create maps for efficient comparison
    const oldTables = new Map(oldSchema.tables.map(t => [t.name, t]));
    const newTables = new Map(newSchema.tables.map(t => [t.name, t]));

    // Check for removed tables
    for (const [tableName, oldTable] of oldTables) {
      if (!newTables.has(tableName)) {
        drifts.push({
          type: DriftType.MISSING_TABLE,
          severity: DriftSeverity.HIGH,
          object: tableName,
          expected: oldTable,
          actual: null,
          message: `Table '${tableName}' exists in schema but not in database`
        });
      }
    }

    // Check for added tables
    for (const [tableName, newTable] of newTables) {
      if (!oldTables.has(tableName)) {
        drifts.push({
          type: DriftType.EXTRA_TABLE,
          severity: DriftSeverity.MEDIUM,
          object: tableName,
          expected: null,
          actual: newTable,
          message: `Table '${tableName}' exists in database but not in schema`
        });
      }
    }

    // Check existing tables for column changes
    for (const [tableName, newTable] of newTables) {
      const oldTable = oldTables.get(tableName);
      if (oldTable) {
        const tableDrifts = this.compareTableStructure(oldTable, newTable);
        drifts.push(...tableDrifts);
      }
    }

    // Check views if included
    if (oldSchema.views && newSchema.views) {
      const viewDrifts = this.compareViews(oldSchema.views, newSchema.views);
      drifts.push(...viewDrifts);
    }

    // Check indexes if included
    if (oldSchema.indexes && newSchema.indexes) {
      const indexDrifts = this.compareIndexes(oldSchema.indexes, newSchema.indexes);
      drifts.push(...indexDrifts);
    }

    return drifts;
  }

  /**
   * Compare table structures
   */
  private compareTableStructure(oldTable: Table, newTable: Table): Drift[] {
    const drifts: Drift[] = [];
    const oldColumns = new Map(oldTable.columns.map(c => [c.name, c]));
    const newColumns = new Map(newTable.columns.map(c => [c.name, c]));

    // Check for removed columns
    for (const [columnName, oldColumn] of oldColumns) {
      if (!newColumns.has(columnName)) {
        drifts.push({
          type: DriftType.MISSING_COLUMN,
          severity: DriftSeverity.HIGH,
          object: `${oldTable.name}.${columnName}`,
          expected: oldColumn,
          actual: null,
          message: `Column '${columnName}' missing from table '${oldTable.name}'`
        });
      }
    }

    // Check for added columns
    for (const [columnName, newColumn] of newColumns) {
      if (!oldColumns.has(columnName)) {
        drifts.push({
          type: DriftType.EXTRA_COLUMN,
          severity: DriftSeverity.MEDIUM,
          object: `${newTable.name}.${columnName}`,
          expected: null,
          actual: newColumn,
          message: `Column '${columnName}' added to table '${newTable.name}'`
        });
      }
    }

    // Check column changes
    for (const [columnName, newColumn] of newColumns) {
      const oldColumn = oldColumns.get(columnName);
      if (oldColumn) {
        const columnDrifts = this.compareColumns(
          oldTable.name,
          oldColumn,
          newColumn
        );
        drifts.push(...columnDrifts);
      }
    }

    // Check constraint changes
    const constraintDrifts = this.compareConstraints(
      oldTable.name,
      oldTable.constraints,
      newTable.constraints
    );
    drifts.push(...constraintDrifts);

    return drifts;
  }

  /**
   * Compare columns
   */
  private compareColumns(
    tableName: string,
    oldColumn: Column,
    newColumn: Column
  ): Drift[] {
    const drifts: Drift[] = [];

    // Check type changes
    if (oldColumn.type !== newColumn.type) {
      drifts.push({
        type: DriftType.COLUMN_TYPE_MISMATCH,
        severity: DriftSeverity.HIGH,
        object: `${tableName}.${oldColumn.name}`,
        expected: oldColumn.type,
        actual: newColumn.type,
        message: `Column type changed from '${oldColumn.type}' to '${newColumn.type}'`
      });
    }

    // Check nullability changes
    if (oldColumn.nullable !== newColumn.nullable) {
      const severity = newColumn.nullable 
        ? DriftSeverity.MEDIUM  // Made nullable (less severe)
        : DriftSeverity.HIGH;   // Made not nullable (more severe)
      
      drifts.push({
        type: DriftType.CONSTRAINT_MISMATCH,
        severity,
        object: `${tableName}.${oldColumn.name}`,
        expected: oldColumn.nullable,
        actual: newColumn.nullable,
        message: `Column nullability changed from ${oldColumn.nullable} to ${newColumn.nullable}`
      });
    }

    // Check default value changes
    if (oldColumn.defaultValue !== newColumn.defaultValue) {
      drifts.push({
        type: DriftType.CONSTRAINT_MISMATCH,
        severity: DriftSeverity.LOW,
        object: `${tableName}.${oldColumn.name}`,
        expected: oldColumn.defaultValue,
        actual: newColumn.defaultValue,
        message: `Default value changed`
      });
    }

    return drifts;
  }

  /**
   * Compare constraints
   */
  private compareConstraints(
    tableName: string,
    oldConstraints: any[],
    newConstraints: any[]
  ): Drift[] {
    const drifts: Drift[] = [];
    
    const oldConstraintMap = new Map(oldConstraints.map(c => [c.name, c]));
    const newConstraintMap = new Map(newConstraints.map(c => [c.name, c]));

    // Check for removed constraints
    for (const [name, oldConstraint] of oldConstraintMap) {
      if (!newConstraintMap.has(name)) {
        drifts.push({
          type: DriftType.CONSTRAINT_MISMATCH,
          severity: DriftSeverity.HIGH,
          object: `${tableName}.${name}`,
          expected: oldConstraint,
          actual: null,
          message: `Constraint '${name}' removed from table '${tableName}'`
        });
      }
    }

    // Check for added constraints
    for (const [name, newConstraint] of newConstraintMap) {
      if (!oldConstraintMap.has(name)) {
        drifts.push({
          type: DriftType.CONSTRAINT_MISMATCH,
          severity: DriftSeverity.MEDIUM,
          object: `${tableName}.${name}`,
          expected: null,
          actual: newConstraint,
          message: `Constraint '${name}' added to table '${tableName}'`
        });
      }
    }

    return drifts;
  }

  /**
   * Compare views
   */
  private compareViews(oldViews: any[], newViews: any[]): Drift[] {
    const drifts: Drift[] = [];
    
    const oldViewMap = new Map(oldViews.map(v => [v.name, v]));
    const newViewMap = new Map(newViews.map(v => [v.name, v]));

    for (const [name, oldView] of oldViewMap) {
      const newView = newViewMap.get(name);
      if (!newView) {
        drifts.push({
          type: DriftType.MISSING_TABLE,
          severity: DriftSeverity.MEDIUM,
          object: name,
          expected: oldView,
          actual: null,
          message: `View '${name}' missing from database`
        });
      } else if (oldView.definition !== newView.definition) {
        drifts.push({
          type: DriftType.CONSTRAINT_MISMATCH,
          severity: DriftSeverity.MEDIUM,
          object: name,
          expected: oldView.definition,
          actual: newView.definition,
          message: `View '${name}' definition has changed`
        });
      }
    }

    return drifts;
  }

  /**
   * Compare indexes
   */
  private compareIndexes(oldIndexes: any[], newIndexes: any[]): Drift[] {
    const drifts: Drift[] = [];
    
    const oldIndexMap = new Map(oldIndexes.map(i => [`${i.table}.${i.name}`, i]));
    const newIndexMap = new Map(newIndexes.map(i => [`${i.table}.${i.name}`, i]));

    for (const [key, oldIndex] of oldIndexMap) {
      const newIndex = newIndexMap.get(key);
      if (!newIndex) {
        drifts.push({
          type: DriftType.INDEX_MISMATCH,
          severity: DriftSeverity.MEDIUM,
          object: key,
          expected: oldIndex,
          actual: null,
          message: `Index '${oldIndex.name}' missing from table '${oldIndex.table}'`
        });
      } else {
        // Check if index columns or properties changed
        if (JSON.stringify(oldIndex.columns) !== JSON.stringify(newIndex.columns) ||
            oldIndex.unique !== newIndex.unique) {
          drifts.push({
            type: DriftType.INDEX_MISMATCH,
            severity: DriftSeverity.MEDIUM,
            object: key,
            expected: oldIndex,
            actual: newIndex,
            message: `Index '${oldIndex.name}' configuration has changed`
          });
        }
      }
    }

    return drifts;
  }

  /**
   * Detect unauthorized changes
   */
  private async detectUnauthorizedChanges(): Promise<Drift[]> {
    const drifts: Drift[] = [];

    if (!this.currentSchema || !this.savedSchema) {
      return drifts;
    }

    // Calculate schema hash
    const currentHash = this.calculateSchemaHash(this.currentSchema);
    const savedHash = this.calculateSchemaHash(this.savedSchema);

    if (currentHash !== savedHash) {
      // Check migration history
      const hasMigration = await this.checkMigrationHistory(
        this.savedSchema.version,
        this.currentSchema.version
      );

      if (!hasMigration) {
        drifts.push({
          type: DriftType.CONSTRAINT_MISMATCH,
          severity: DriftSeverity.CRITICAL,
          object: 'database_schema',
          expected: savedHash,
          actual: currentHash,
          message: 'Database schema changed without migration'
        });
      }
    }

    return drifts;
  }

  /**
   * Validate routes against schema
   */
  private async validateRoutesAgainstSchema(): Promise<Drift[]> {
    const drifts: Drift[] = [];

    if (!this.currentSchema) {
      return drifts;
    }

    const routeValidator = new RouteValidator(
      this.currentSchema,
      { enabled: true, directories: [], patterns: [], strict: false }
    );

    const result = await routeValidator.validate();
    
    if (result.success && result.metadata) {
      const metadata = result.metadata as any;
      
      // Check invalid routes
      for (const route of metadata.invalidRoutes || []) {
        drifts.push({
          type: DriftType.ROUTE_MISMATCH,
          severity: DriftSeverity.HIGH,
          object: `${route.method} ${route.path}`,
          expected: 'valid database operations',
          actual: route,
          message: `Route references invalid database objects`
        });
      }

      // Check missing routes
      for (const route of metadata.missingRoutes || []) {
        drifts.push({
          type: DriftType.ROUTE_MISMATCH,
          severity: DriftSeverity.MEDIUM,
          object: `${route.method} ${route.path}`,
          expected: route,
          actual: null,
          message: `Expected route not implemented`
        });
      }
    }

    return drifts;
  }

  /**
   * Validate forms against schema
   */
  private async validateFormsAgainstSchema(): Promise<Drift[]> {
    const drifts: Drift[] = [];

    if (!this.currentSchema) {
      return drifts;
    }

    const formScanner = new FormScanner(
      this.currentSchema,
      { enabled: true, directories: [], patterns: [], validateAgainstSchema: true }
    );

    const result = await formScanner.scan();
    
    if (result.success && result.data) {
      for (const validation of result.data) {
        // Check missing columns
        for (const column of validation.missingColumns) {
          drifts.push({
            type: DriftType.FORM_FIELD_MISMATCH,
            severity: DriftSeverity.HIGH,
            object: `${validation.form.name}.${column}`,
            expected: `required field '${column}'`,
            actual: null,
            message: `Form missing required database field '${column}'`
          });
        }

        // Check type mismatches
        for (const mismatch of validation.typeMismatches) {
          drifts.push({
            type: DriftType.FORM_FIELD_MISMATCH,
            severity: DriftSeverity.MEDIUM,
            object: `${validation.form.name}.${mismatch.field}`,
            expected: mismatch.columnType,
            actual: mismatch.formType,
            message: `Form field type doesn't match database column type`
          });
        }

        // Check extra fields
        for (const field of validation.extraFields) {
          if (!this.isAllowedExtraField(field)) {
            drifts.push({
              type: DriftType.FORM_FIELD_MISMATCH,
              severity: DriftSeverity.LOW,
              object: `${validation.form.name}.${field}`,
              expected: null,
              actual: field,
              message: `Form has field not in database`
            });
          }
        }
      }
    }

    return drifts;
  }

  /**
   * Generate suggestion for drift
   */
  private generateSuggestion(drift: Drift): DriftSuggestion | null {
    switch (drift.type) {
      case DriftType.MISSING_TABLE:
        return {
          type: 'migration',
          description: `Create migration to restore table '${drift.object}'`,
          sql: this.generateCreateTableSQL(drift.expected as Table),
          impact: ['Data recovery required', 'Update dependent code']
        };

      case DriftType.EXTRA_TABLE:
        return {
          type: 'schema_update',
          description: `Update schema to include table '${drift.object}'`,
          impact: ['Schema file update required']
        };

      case DriftType.MISSING_COLUMN:
        const [table, column] = drift.object.split('.');
        return {
          type: 'migration',
          description: `Create migration to restore column '${column}' in table '${table}'`,
          sql: `ALTER TABLE "${table}" ADD COLUMN ${this.generateColumnSQL(drift.expected as Column)};`,
          impact: ['Data recovery may be required']
        };

      case DriftType.COLUMN_TYPE_MISMATCH:
        const [tableName, columnName] = drift.object.split('.');
        return {
          type: 'migration',
          description: `Create migration to fix column type mismatch`,
          sql: `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE ${drift.expected};`,
          impact: ['Data conversion required', 'Possible data loss']
        };

      case DriftType.ROUTE_MISMATCH:
        return {
          type: 'code_change',
          description: `Update route ${drift.object} to match database schema`,
          code: '// Update route to use correct database operations',
          impact: ['API behavior change', 'Client updates may be required']
        };

      case DriftType.FORM_FIELD_MISMATCH:
        return {
          type: 'code_change',
          description: `Update form field ${drift.object}`,
          impact: ['UI update required', 'Validation rules may need adjustment']
        };

      default:
        return null;
    }
  }

  /**
   * Auto-fix safe drifts
   */
  private async autoFixDrifts(report: DriftReport): Promise<void> {
    for (const suggestion of report.suggestions) {
      // Only auto-fix low severity, non-destructive changes
      const drift = report.drifts.find(d => 
        this.generateSuggestion(d)?.description === suggestion.description
      );

      if (drift && drift.severity === DriftSeverity.LOW && 
          suggestion.type === 'schema_update') {
        try {
          // Apply schema update
          if (this.currentSchema) {
            await this.saveSchema(this.currentSchema);
          }
          
          this.emit('drift_fixed', {
            drift,
            suggestion,
            timestamp: new Date()
          });
        } catch (error) {
          this.emit('error', {
            message: 'Failed to auto-fix drift',
            drift,
            error
          });
        }
      }
    }
  }

  /**
   * Send notification webhook
   */
  private async sendNotification(report: DriftReport): Promise<void> {
    if (!this.config.notificationWebhook) return;

    try {
      const response = await fetch(this.config.notificationWebhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: 'drift_detected',
          timestamp: report.timestamp,
          summary: {
            total: report.drifts.length,
            critical: report.drifts.filter(d => d.severity === DriftSeverity.CRITICAL).length,
            high: report.drifts.filter(d => d.severity === DriftSeverity.HIGH).length,
            medium: report.drifts.filter(d => d.severity === DriftSeverity.MEDIUM).length,
            low: report.drifts.filter(d => d.severity === DriftSeverity.LOW).length
          },
          drifts: report.drifts,
          suggestions: report.suggestions
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }
    } catch (error) {
      this.emit('error', {
        message: 'Failed to send notification',
        error
      });
    }
  }

  /**
   * Load saved schema
   */
  private async loadSavedSchema(): Promise<DatabaseSchema | undefined> {
    const schemaPath = path.join(process.cwd(), 'schema', 'schema.json');
    
    if (await fs.pathExists(schemaPath)) {
      return await fs.readJson(schemaPath);
    }

    return undefined;
  }

  /**
   * Save schema
   */
  private async saveSchema(schema: DatabaseSchema): Promise<void> {
    const schemaDir = path.join(process.cwd(), 'schema');
    await fs.ensureDir(schemaDir);
    
    const schemaPath = path.join(schemaDir, 'schema.json');
    await fs.writeJson(schemaPath, schema, { spaces: 2 });
  }

  /**
   * Save drift report
   */
  private async saveReport(report: DriftReport): Promise<void> {
    await fs.ensureDir(this.config.reportDirectory);
    
    const filename = `drift-report-${format(report.timestamp, 'yyyy-MM-dd-HHmmss')}.json`;
    const filepath = path.join(this.config.reportDirectory, filename);
    
    await fs.writeJson(filepath, report, { spaces: 2 });
  }

  /**
   * Calculate schema hash
   */
  private calculateSchemaHash(schema: DatabaseSchema): string {
    // Normalize schema for consistent hashing
    const normalized = {
      tables: schema.tables.map(t => ({
        name: t.name,
        columns: t.columns.map(c => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable
        })).sort((a, b) => a.name.localeCompare(b.name))
      })).sort((a, b) => a.name.localeCompare(b.name))
    };

    const content = JSON.stringify(normalized);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check migration history
   */
  private async checkMigrationHistory(
    fromVersion: string,
    toVersion: string
  ): Promise<boolean> {
    // Query migration table
    const query = `
      SELECT COUNT(*) as count
      FROM database_migrations
      WHERE version > $1 AND version <= $2
        AND status = 'completed'
    `;

    try {
      const result = await this.connection.query(query, [fromVersion, toVersion]);
      return result.rows[0].count > 0;
    } catch {
      // Migration table might not exist
      return false;
    }
  }

  /**
   * Check if extra field is allowed
   */
  private isAllowedExtraField(fieldName: string): boolean {
    // Some fields are commonly added for UI purposes
    const allowedFields = [
      'confirmPassword',
      'rememberMe',
      'agreeToTerms',
      'captcha',
      'csrfToken'
    ];

    return allowedFields.includes(fieldName);
  }

  /**
   * Generate CREATE TABLE SQL
   */
  private generateCreateTableSQL(table: Table): string {
    let sql = `CREATE TABLE "${table.name}" (\n`;
    
    const columnDefs = table.columns.map(col => 
      `  ${this.generateColumnSQL(col)}`
    );
    
    sql += columnDefs.join(',\n');
    
    if (table.primaryKey) {
      sql += `,\n  PRIMARY KEY (${table.primaryKey.columns.join(', ')})`;
    }
    
    sql += '\n);';
    
    return sql;
  }

  /**
   * Generate column SQL
   */
  private generateColumnSQL(column: Column): string {
    let sql = `"${column.name}" ${column.type}`;
    
    if (!column.nullable) sql += ' NOT NULL';
    if (column.defaultValue !== undefined) {
      sql += ` DEFAULT ${this.formatDefaultValue(column.defaultValue)}`;
    }
    if (column.unique) sql += ' UNIQUE';
    
    return sql;
  }

  /**
   * Format default value for SQL
   */
  private formatDefaultValue(value: unknown): string {
    if (typeof value === 'string') return `'${value}'`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (value === null) return 'NULL';
    return String(value);
  }
}