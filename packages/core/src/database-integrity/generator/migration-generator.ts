/**
 * Migration Generator
 * Generates database migrations from various sources
 */

import {
  Migration,
  MigrationType,
  MigrationStatus,
  DatabaseSchema,
  DriftReport,
  FormValidationResult,
  IntegrityResult,
  IntegrityError
} from '../types';
import { MigrationEngine } from '../migration/migration-engine';
import crypto from 'crypto';
import winston from 'winston';

export interface MigrationGeneratorOptions {
  name: string;
  dryRun: boolean;
  format: 'sql' | 'prisma' | 'typescript';
  includeRollback: boolean;
  atomic: boolean;
}

export class MigrationGenerator {
  private migrationEngine: MigrationEngine;
  private logger: winston.Logger;

  constructor(migrationEngine: MigrationEngine) {
    this.migrationEngine = migrationEngine;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async generateFromSchemaChange(
    oldSchema: DatabaseSchema,
    newSchema: DatabaseSchema,
    options: MigrationGeneratorOptions
  ): Promise<IntegrityResult<Migration>> {
    try {
      this.logger.info('Generating migration from schema change');

      const changes = this.compareSchemas(oldSchema, newSchema);
      if (changes.length === 0) {
        return {
          success: true,
          data: this.createEmptyMigration(options.name)
        };
      }

      const sql = this.generateSQL(changes, options);
      const rollbackSql = options.includeRollback 
        ? this.generateRollbackSQL(changes, options) 
        : undefined;

      const migration: Migration = {
        id: `${Date.now()}_${options.name.replace(/\s+/g, '_').toLowerCase()}`,
        version: Date.now().toString(),
        name: options.name,
        description: `Schema migration: ${changes.length} changes`,
        type: MigrationType.SCHEMA,
        sql,
        rollbackSql,
        checksum: this.calculateChecksum(sql),
        createdAt: new Date(),
        status: MigrationStatus.PENDING,
        metadata: {
          changes,
          generatedBy: 'schema_change'
        }
      };

      if (!options.dryRun) {
        // Save migration file
        await this.saveMigration(migration, options);
      }

      return { success: true, data: migration };
    } catch (error) {
      this.logger.error('Failed to generate migration from schema change', error);
      return {
        success: false,
        error: {
          code: 'SCHEMA_MIGRATION_GENERATION_FAILED',
          message: 'Failed to generate migration from schema change',
          details: error
        }
      };
    }
  }

  async generateFromDriftReport(
    driftReport: DriftReport,
    options: MigrationGeneratorOptions
  ): Promise<IntegrityResult<Migration[]>> {
    try {
      this.logger.info('Generating migrations from drift report');

      const migrations: Migration[] = [];
      const fixableDrifts = driftReport.drifts.filter(d => d.fixable);

      if (fixableDrifts.length === 0) {
        return { success: true, data: [] };
      }

      // Group drifts by type for better migration organization
      const driftGroups = this.groupDriftsByType(fixableDrifts);

      for (const [type, drifts] of Object.entries(driftGroups)) {
        const sql = this.generateDriftFixSQL(drifts, options);
        const rollbackSql = options.includeRollback 
          ? this.generateDriftRollbackSQL(drifts, options) 
          : undefined;

        const migration: Migration = {
          id: `${Date.now()}_fix_${type.toLowerCase()}_drifts`,
          version: Date.now().toString(),
          name: `Fix ${type} drifts`,
          description: `Fix ${drifts.length} ${type} drifts`,
          type: MigrationType.SCHEMA,
          sql,
          rollbackSql,
          checksum: this.calculateChecksum(sql),
          createdAt: new Date(),
          status: MigrationStatus.PENDING,
          metadata: {
            drifts: drifts.map(d => ({
              id: d.id,
              type: d.type,
              object: d.object,
              description: d.description
            })),
            generatedBy: 'drift_detection'
          }
        };

        migrations.push(migration);
      }

      if (!options.dryRun) {
        // Save migration files
        for (const migration of migrations) {
          await this.saveMigration(migration, options);
        }
      }

      return { success: true, data: migrations };
    } catch (error) {
      this.logger.error('Failed to generate migrations from drift report', error);
      return {
        success: false,
        error: {
          code: 'DRIFT_MIGRATION_GENERATION_FAILED',
          message: 'Failed to generate migrations from drift report',
          details: error
        }
      };
    }
  }

  async generateFromFormValidation(
    validationResults: FormValidationResult[],
    options: MigrationGeneratorOptions
  ): Promise<IntegrityResult<Migration>> {
    try {
      this.logger.info('Generating migration from form validation');

      const changes = this.extractSchemaChangesFromForms(validationResults);
      if (changes.length === 0) {
        return {
          success: true,
          data: this.createEmptyMigration(options.name)
        };
      }

      const sql = this.generateSQL(changes, options);
      const rollbackSql = options.includeRollback 
        ? this.generateRollbackSQL(changes, options) 
        : undefined;

      const migration: Migration = {
        id: `${Date.now()}_${options.name.replace(/\s+/g, '_').toLowerCase()}`,
        version: Date.now().toString(),
        name: options.name,
        description: `Form validation updates: ${changes.length} changes`,
        type: MigrationType.SCHEMA,
        sql,
        rollbackSql,
        checksum: this.calculateChecksum(sql),
        createdAt: new Date(),
        status: MigrationStatus.PENDING,
        metadata: {
          changes,
          forms: validationResults.map(r => r.formName),
          generatedBy: 'form_validation'
        }
      };

      if (!options.dryRun) {
        await this.saveMigration(migration, options);
      }

      return { success: true, data: migration };
    } catch (error) {
      this.logger.error('Failed to generate migration from form validation', error);
      return {
        success: false,
        error: {
          code: 'FORM_MIGRATION_GENERATION_FAILED',
          message: 'Failed to generate migration from form validation',
          details: error
        }
      };
    }
  }

  private compareSchemas(oldSchema: DatabaseSchema, newSchema: DatabaseSchema): any[] {
    const changes: any[] = [];

    // Compare tables
    for (const newTable of newSchema.tables) {
      const oldTable = oldSchema.tables.find(t => t.name === newTable.name);
      
      if (!oldTable) {
        changes.push({
          type: 'create_table',
          table: newTable
        });
      } else {
        // Compare columns
        for (const newColumn of newTable.columns) {
          const oldColumn = oldTable.columns.find(c => c.name === newColumn.name);
          
          if (!oldColumn) {
            changes.push({
              type: 'add_column',
              table: newTable.name,
              column: newColumn
            });
          } else if (this.columnsAreDifferent(oldColumn, newColumn)) {
            changes.push({
              type: 'alter_column',
              table: newTable.name,
              oldColumn,
              newColumn
            });
          }
        }

        // Check for removed columns
        for (const oldColumn of oldTable.columns) {
          if (!newTable.columns.find(c => c.name === oldColumn.name)) {
            changes.push({
              type: 'drop_column',
              table: oldTable.name,
              column: oldColumn
            });
          }
        }
      }
    }

    // Check for removed tables
    for (const oldTable of oldSchema.tables) {
      if (!newSchema.tables.find(t => t.name === oldTable.name)) {
        changes.push({
          type: 'drop_table',
          table: oldTable
        });
      }
    }

    return changes;
  }

  private columnsAreDifferent(oldColumn: any, newColumn: any): boolean {
    return oldColumn.type !== newColumn.type ||
           oldColumn.nullable !== newColumn.nullable ||
           JSON.stringify(oldColumn.default) !== JSON.stringify(newColumn.default);
  }

  private groupDriftsByType(drifts: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    for (const drift of drifts) {
      const type = drift.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(drift);
    }
    
    return groups;
  }

  private generateSQL(changes: any[], options: MigrationGeneratorOptions): string {
    const statements: string[] = [];
    
    if (options.atomic) {
      statements.push('BEGIN;');
    }

    for (const change of changes) {
      switch (change.type) {
        case 'create_table':
          statements.push(this.generateCreateTableSQL(change.table));
          break;
        case 'drop_table':
          statements.push(`DROP TABLE IF EXISTS ${change.table.name} CASCADE;`);
          break;
        case 'add_column':
          statements.push(this.generateAddColumnSQL(change.table, change.column));
          break;
        case 'drop_column':
          statements.push(`ALTER TABLE ${change.table} DROP COLUMN IF EXISTS ${change.column.name};`);
          break;
        case 'alter_column':
          statements.push(...this.generateAlterColumnSQL(change.table, change.oldColumn, change.newColumn));
          break;
      }
    }

    if (options.atomic) {
      statements.push('COMMIT;');
    }

    return statements.join('\n\n');
  }

  private generateRollbackSQL(changes: any[], options: MigrationGeneratorOptions): string {
    const statements: string[] = [];
    
    if (options.atomic) {
      statements.push('BEGIN;');
    }

    // Reverse the changes
    for (const change of changes.reverse()) {
      switch (change.type) {
        case 'create_table':
          statements.push(`DROP TABLE IF EXISTS ${change.table.name} CASCADE;`);
          break;
        case 'drop_table':
          statements.push(this.generateCreateTableSQL(change.table));
          break;
        case 'add_column':
          statements.push(`ALTER TABLE ${change.table} DROP COLUMN IF EXISTS ${change.column.name};`);
          break;
        case 'drop_column':
          statements.push(this.generateAddColumnSQL(change.table, change.column));
          break;
        case 'alter_column':
          statements.push(...this.generateAlterColumnSQL(change.table, change.newColumn, change.oldColumn));
          break;
      }
    }

    if (options.atomic) {
      statements.push('COMMIT;');
    }

    return statements.join('\n\n');
  }

  private generateDriftFixSQL(drifts: any[], options: MigrationGeneratorOptions): string {
    const statements: string[] = [];
    
    if (options.atomic) {
      statements.push('BEGIN;');
    }

    for (const drift of drifts) {
      if (drift.fixSql) {
        statements.push(`-- Fix: ${drift.description}`);
        statements.push(drift.fixSql);
      }
    }

    if (options.atomic) {
      statements.push('COMMIT;');
    }

    return statements.join('\n\n');
  }

  private generateDriftRollbackSQL(drifts: any[], options: MigrationGeneratorOptions): string {
    // For drifts, rollback might not always be possible
    return '-- Rollback not available for drift fixes';
  }

  private extractSchemaChangesFromForms(validationResults: FormValidationResult[]): any[] {
    const changes: any[] = [];
    
    // Extract suggested changes from form validation
    for (const result of validationResults) {
      for (const error of result.validation.errors) {
        if (error.type === 'missing_field' && error.table) {
          // Suggest adding the field to the table
          changes.push({
            type: 'add_column',
            table: error.table,
            column: {
              name: error.field,
              type: 'text',
              nullable: true
            }
          });
        }
      }
    }
    
    return changes;
  }

  private generateCreateTableSQL(table: any): string {
    const columns = table.columns.map((col: any) => {
      const parts = [col.name, col.type.toUpperCase()];
      
      if (!col.nullable) {
        parts.push('NOT NULL');
      }
      
      if (col.default !== undefined) {
        parts.push(`DEFAULT ${this.formatDefaultValue(col.default)}`);
      }
      
      if (col.unique) {
        parts.push('UNIQUE');
      }
      
      return `  ${parts.join(' ')}`;
    }).join(',\n');

    let sql = `CREATE TABLE IF NOT EXISTS ${table.name} (\n${columns}`;
    
    if (table.primaryKey) {
      sql += `,\n  PRIMARY KEY (${table.primaryKey.columns.join(', ')})`;
    }
    
    sql += '\n);';
    
    // Add indexes
    if (table.indexes) {
      for (const index of table.indexes) {
        sql += `\n\nCREATE INDEX IF NOT EXISTS ${index.name} ON ${table.name} (${index.columns.join(', ')});`;
      }
    }
    
    return sql;
  }

  private generateAddColumnSQL(tableName: string, column: any): string {
    const parts = ['ALTER TABLE', tableName, 'ADD COLUMN IF NOT EXISTS', column.name, column.type.toUpperCase()];
    
    if (!column.nullable) {
      parts.push('NOT NULL');
    }
    
    if (column.default !== undefined) {
      parts.push(`DEFAULT ${this.formatDefaultValue(column.default)}`);
    }
    
    return parts.join(' ') + ';';
  }

  private generateAlterColumnSQL(tableName: string, oldColumn: any, newColumn: any): string[] {
    const statements: string[] = [];
    
    // Type change
    if (oldColumn.type !== newColumn.type) {
      statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} TYPE ${newColumn.type.toUpperCase()};`);
    }
    
    // Nullable change
    if (oldColumn.nullable !== newColumn.nullable) {
      if (newColumn.nullable) {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} DROP NOT NULL;`);
      } else {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} SET NOT NULL;`);
      }
    }
    
    // Default change
    if (JSON.stringify(oldColumn.default) !== JSON.stringify(newColumn.default)) {
      if (newColumn.default === undefined) {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} DROP DEFAULT;`);
      } else {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} SET DEFAULT ${this.formatDefaultValue(newColumn.default)};`);
      }
    }
    
    return statements;
  }

  private formatDefaultValue(value: any): string {
    if (value === null) return 'NULL';
    if (typeof value === 'string') return `'${value}'`;
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }

  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private createEmptyMigration(name: string): Migration {
    return {
      id: `${Date.now()}_${name.replace(/\s+/g, '_').toLowerCase()}`,
      version: Date.now().toString(),
      name,
      description: 'No changes required',
      type: MigrationType.SCHEMA,
      sql: '-- No changes',
      checksum: this.calculateChecksum('-- No changes'),
      createdAt: new Date(),
      status: MigrationStatus.COMPLETED,
      metadata: {
        empty: true
      }
    };
  }

  private async saveMigration(migration: Migration, options: MigrationGeneratorOptions): Promise<void> {
    // Implementation would save to filesystem
    // For now, just log
    this.logger.info(`Migration generated: ${migration.id}`);
  }
}