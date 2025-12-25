/**
 * Migration Generator
 * Generates database migrations based on schema changes and drift detection
 */

import {
  DatabaseSchema,
  Table,
  Column,
  Migration,
  DriftReport,
  Drift,
  DriftType,
  FormValidationResult,
  IntegrityResult,
  IntegrityError,
  Index,
  Constraint,
  ForeignKey
} from '../types';
import { MigrationEngine } from '../migration/migration-engine';
import { EventEmitter } from 'events';
import { format } from 'prettier';
import fs from 'fs-extra';
import path from 'path';
import { diff } from 'deep-object-diff';

export interface MigrationGeneratorOptions {
  name: string;
  dryRun?: boolean;
  format?: 'sql' | 'prisma' | 'both';
  includeRollback?: boolean;
  atomic?: boolean;
}

export class MigrationGenerator extends EventEmitter {
  private migrationEngine: MigrationEngine;

  constructor(migrationEngine: MigrationEngine) {
    super();
    this.migrationEngine = migrationEngine;
  }

  /**
   * Generate migration from schema changes
   */
  async generateFromSchemaChange(
    oldSchema: DatabaseSchema,
    newSchema: DatabaseSchema,
    options: MigrationGeneratorOptions
  ): Promise<IntegrityResult<Migration>> {
    try {
      const changes = this.detectSchemaChanges(oldSchema, newSchema);
      
      if (changes.length === 0) {
        return {
          success: true,
          metadata: { message: 'No schema changes detected' }
        };
      }

      // Generate SQL statements
      const upStatements = this.generateUpStatements(changes);
      const downStatements = options.includeRollback 
        ? this.generateDownStatements(changes) 
        : [];

      // Generate Prisma schema if needed
      const prismaSchema = options.format === 'prisma' || options.format === 'both'
        ? this.generatePrismaSchema(newSchema)
        : undefined;

      // Combine SQL statements
      const upSql = options.atomic 
        ? this.wrapInTransaction(upStatements)
        : upStatements.join('\n\n');

      const downSql = downStatements.length > 0
        ? options.atomic 
          ? this.wrapInTransaction(downStatements)
          : downStatements.join('\n\n')
        : undefined;

      // Generate migration through engine
      const result = await this.migrationEngine.generateMigration(
        options.name,
        upSql,
        prismaSchema
      );

      if (result.success && result.data) {
        result.data.rollbackSql = downSql;
      }

      return result;
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'MIGRATION_GENERATION_FAILED',
        message: 'Failed to generate migration from schema change',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Generate migration from drift report
   */
  async generateFromDriftReport(
    driftReport: DriftReport,
    options: MigrationGeneratorOptions
  ): Promise<IntegrityResult<Migration[]>> {
    try {
      const migrations: Migration[] = [];
      const groupedDrifts = this.groupDriftsByType(driftReport.drifts);

      for (const [type, drifts] of groupedDrifts) {
        const statements = this.generateStatementsForDrifts(type, drifts);
        
        if (statements.length > 0) {
          const sql = options.atomic
            ? this.wrapInTransaction(statements)
            : statements.join('\n\n');

          const migrationName = `${options.name}_fix_${type.toLowerCase()}`;
          const result = await this.migrationEngine.generateMigration(
            migrationName,
            sql
          );

          if (result.success && result.data) {
            migrations.push(result.data);
          }
        }
      }

      return { success: true, data: migrations };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'DRIFT_MIGRATION_GENERATION_FAILED',
        message: 'Failed to generate migration from drift report',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Generate migration from form validation
   */
  async generateFromFormValidation(
    validationResults: FormValidationResult[],
    options: MigrationGeneratorOptions
  ): Promise<IntegrityResult<Migration>> {
    try {
      const statements: string[] = [];

      for (const result of validationResults) {
        if (!result.table) continue;

        // Add missing columns for extra fields
        for (const fieldName of result.extraFields) {
          const field = result.form.fields.find(f => f.name === fieldName);
          if (field) {
            const columnDef = this.generateColumnFromFormField(field);
            statements.push(
              `ALTER TABLE "${result.table.name}" ADD COLUMN ${columnDef};`
            );
          }
        }

        // Modify columns for type mismatches
        for (const mismatch of result.typeMismatches) {
          const field = result.form.fields.find(f => f.name === mismatch.field);
          if (field) {
            const newType = this.mapFormFieldToColumnType(field);
            statements.push(
              `ALTER TABLE "${result.table.name}" ALTER COLUMN "${mismatch.field}" TYPE ${newType};`
            );
          }
        }
      }

      if (statements.length === 0) {
        return {
          success: true,
          metadata: { message: 'No form-related schema changes needed' }
        };
      }

      const sql = options.atomic
        ? this.wrapInTransaction(statements)
        : statements.join('\n\n');

      return await this.migrationEngine.generateMigration(options.name, sql);
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'FORM_MIGRATION_GENERATION_FAILED',
        message: 'Failed to generate migration from form validation',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Generate migration for new table
   */
  async generateCreateTable(
    table: Table,
    options: MigrationGeneratorOptions
  ): Promise<IntegrityResult<Migration>> {
    try {
      const statements: string[] = [];

      // Generate CREATE TABLE statement
      statements.push(this.generateCreateTableStatement(table));

      // Generate index statements
      for (const index of table.indexes) {
        statements.push(this.generateCreateIndexStatement(table.name, index));
      }

      // Generate constraint statements (if not included in CREATE TABLE)
      for (const constraint of table.constraints) {
        if (constraint.type === 'check' || constraint.type === 'exclude') {
          statements.push(
            `ALTER TABLE "${table.name}" ADD CONSTRAINT "${constraint.name}" ${constraint.definition};`
          );
        }
      }

      const sql = statements.join('\n\n');

      // Generate rollback
      const rollbackSql = options.includeRollback
        ? `DROP TABLE IF EXISTS "${table.name}" CASCADE;`
        : undefined;

      const result = await this.migrationEngine.generateMigration(
        options.name,
        sql
      );

      if (result.success && result.data && rollbackSql) {
        result.data.rollbackSql = rollbackSql;
      }

      return result;
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'CREATE_TABLE_MIGRATION_FAILED',
        message: 'Failed to generate create table migration',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Detect schema changes
   */
  private detectSchemaChanges(
    oldSchema: DatabaseSchema,
    newSchema: DatabaseSchema
  ): SchemaChange[] {
    const changes: SchemaChange[] = [];

    const oldTables = new Map(oldSchema.tables.map(t => [t.name, t]));
    const newTables = new Map(newSchema.tables.map(t => [t.name, t]));

    // Detect removed tables
    for (const [name, table] of oldTables) {
      if (!newTables.has(name)) {
        changes.push({ type: 'DROP_TABLE', table });
      }
    }

    // Detect new tables
    for (const [name, table] of newTables) {
      if (!oldTables.has(name)) {
        changes.push({ type: 'CREATE_TABLE', table });
      }
    }

    // Detect table modifications
    for (const [name, newTable] of newTables) {
      const oldTable = oldTables.get(name);
      if (oldTable) {
        const tableChanges = this.detectTableChanges(oldTable, newTable);
        changes.push(...tableChanges);
      }
    }

    return changes;
  }

  /**
   * Detect table changes
   */
  private detectTableChanges(oldTable: Table, newTable: Table): SchemaChange[] {
    const changes: SchemaChange[] = [];

    const oldColumns = new Map(oldTable.columns.map(c => [c.name, c]));
    const newColumns = new Map(newTable.columns.map(c => [c.name, c]));

    // Detect removed columns
    for (const [name, column] of oldColumns) {
      if (!newColumns.has(name)) {
        changes.push({
          type: 'DROP_COLUMN',
          table: oldTable,
          column
        });
      }
    }

    // Detect new columns
    for (const [name, column] of newColumns) {
      if (!oldColumns.has(name)) {
        changes.push({
          type: 'ADD_COLUMN',
          table: newTable,
          column
        });
      }
    }

    // Detect column modifications
    for (const [name, newColumn] of newColumns) {
      const oldColumn = oldColumns.get(name);
      if (oldColumn && !this.columnsEqual(oldColumn, newColumn)) {
        changes.push({
          type: 'ALTER_COLUMN',
          table: newTable,
          oldColumn,
          newColumn
        });
      }
    }

    // Detect index changes
    const indexChanges = this.detectIndexChanges(oldTable, newTable);
    changes.push(...indexChanges);

    // Detect constraint changes
    const constraintChanges = this.detectConstraintChanges(oldTable, newTable);
    changes.push(...constraintChanges);

    return changes;
  }

  /**
   * Check if columns are equal
   */
  private columnsEqual(col1: Column, col2: Column): boolean {
    return col1.type === col2.type &&
           col1.nullable === col2.nullable &&
           col1.defaultValue === col2.defaultValue &&
           col1.unique === col2.unique;
  }

  /**
   * Detect index changes
   */
  private detectIndexChanges(oldTable: Table, newTable: Table): SchemaChange[] {
    const changes: SchemaChange[] = [];

    const oldIndexes = new Map(oldTable.indexes.map(i => [i.name, i]));
    const newIndexes = new Map(newTable.indexes.map(i => [i.name, i]));

    for (const [name, index] of oldIndexes) {
      if (!newIndexes.has(name)) {
        changes.push({
          type: 'DROP_INDEX',
          table: oldTable,
          index
        });
      }
    }

    for (const [name, index] of newIndexes) {
      if (!oldIndexes.has(name)) {
        changes.push({
          type: 'CREATE_INDEX',
          table: newTable,
          index
        });
      }
    }

    return changes;
  }

  /**
   * Detect constraint changes
   */
  private detectConstraintChanges(oldTable: Table, newTable: Table): SchemaChange[] {
    const changes: SchemaChange[] = [];

    const oldConstraints = new Map(oldTable.constraints.map(c => [c.name, c]));
    const newConstraints = new Map(newTable.constraints.map(c => [c.name, c]));

    for (const [name, constraint] of oldConstraints) {
      if (!newConstraints.has(name)) {
        changes.push({
          type: 'DROP_CONSTRAINT',
          table: oldTable,
          constraint
        });
      }
    }

    for (const [name, constraint] of newConstraints) {
      if (!oldConstraints.has(name)) {
        changes.push({
          type: 'ADD_CONSTRAINT',
          table: newTable,
          constraint
        });
      }
    }

    return changes;
  }

  /**
   * Generate UP statements
   */
  private generateUpStatements(changes: SchemaChange[]): string[] {
    const statements: string[] = [];

    // Order changes to avoid dependency issues
    const orderedChanges = this.orderChanges(changes);

    for (const change of orderedChanges) {
      switch (change.type) {
        case 'CREATE_TABLE':
          statements.push(this.generateCreateTableStatement(change.table!));
          break;

        case 'DROP_TABLE':
          statements.push(`DROP TABLE IF EXISTS "${change.table!.name}" CASCADE;`);
          break;

        case 'ADD_COLUMN':
          statements.push(
            `ALTER TABLE "${change.table!.name}" ADD COLUMN ${this.generateColumnDefinition(change.column!)};`
          );
          break;

        case 'DROP_COLUMN':
          statements.push(
            `ALTER TABLE "${change.table!.name}" DROP COLUMN "${change.column!.name}";`
          );
          break;

        case 'ALTER_COLUMN':
          statements.push(...this.generateAlterColumnStatements(
            change.table!.name,
            change.oldColumn!,
            change.newColumn!
          ));
          break;

        case 'CREATE_INDEX':
          statements.push(this.generateCreateIndexStatement(
            change.table!.name,
            change.index!
          ));
          break;

        case 'DROP_INDEX':
          statements.push(`DROP INDEX IF EXISTS "${change.index!.name}";`);
          break;

        case 'ADD_CONSTRAINT':
          statements.push(
            `ALTER TABLE "${change.table!.name}" ADD CONSTRAINT "${change.constraint!.name}" ${change.constraint!.definition};`
          );
          break;

        case 'DROP_CONSTRAINT':
          statements.push(
            `ALTER TABLE "${change.table!.name}" DROP CONSTRAINT "${change.constraint!.name}";`
          );
          break;
      }
    }

    return statements;
  }

  /**
   * Generate DOWN statements (rollback)
   */
  private generateDownStatements(changes: SchemaChange[]): string[] {
    const statements: string[] = [];

    // Reverse order for rollback
    const reversedChanges = [...changes].reverse();

    for (const change of reversedChanges) {
      switch (change.type) {
        case 'CREATE_TABLE':
          statements.push(`DROP TABLE IF EXISTS "${change.table!.name}" CASCADE;`);
          break;

        case 'DROP_TABLE':
          statements.push(this.generateCreateTableStatement(change.table!));
          break;

        case 'ADD_COLUMN':
          statements.push(
            `ALTER TABLE "${change.table!.name}" DROP COLUMN "${change.column!.name}";`
          );
          break;

        case 'DROP_COLUMN':
          statements.push(
            `ALTER TABLE "${change.table!.name}" ADD COLUMN ${this.generateColumnDefinition(change.column!)};`
          );
          break;

        case 'ALTER_COLUMN':
          // Reverse the alteration
          statements.push(...this.generateAlterColumnStatements(
            change.table!.name,
            change.newColumn!,
            change.oldColumn!
          ));
          break;

        case 'CREATE_INDEX':
          statements.push(`DROP INDEX IF EXISTS "${change.index!.name}";`);
          break;

        case 'DROP_INDEX':
          statements.push(this.generateCreateIndexStatement(
            change.table!.name,
            change.index!
          ));
          break;

        case 'ADD_CONSTRAINT':
          statements.push(
            `ALTER TABLE "${change.table!.name}" DROP CONSTRAINT "${change.constraint!.name}";`
          );
          break;

        case 'DROP_CONSTRAINT':
          statements.push(
            `ALTER TABLE "${change.table!.name}" ADD CONSTRAINT "${change.constraint!.name}" ${change.constraint!.definition};`
          );
          break;
      }
    }

    return statements;
  }

  /**
   * Generate CREATE TABLE statement
   */
  private generateCreateTableStatement(table: Table): string {
    let sql = `CREATE TABLE "${table.name}" (\n`;

    // Add columns
    const columnDefs = table.columns.map(col => 
      `  ${this.generateColumnDefinition(col)}`
    );

    sql += columnDefs.join(',\n');

    // Add primary key
    if (table.primaryKey) {
      sql += `,\n  CONSTRAINT "${table.primaryKey.name}" PRIMARY KEY (${
        table.primaryKey.columns.map(c => `"${c}"`).join(', ')
      })`;
    }

    // Add foreign keys
    for (const fk of table.foreignKeys) {
      sql += `,\n  CONSTRAINT "${fk.name}" FOREIGN KEY (${
        fk.columns.map(c => `"${c}"`).join(', ')
      }) REFERENCES "${fk.referencedTable}" (${
        fk.referencedColumns.map(c => `"${c}"`).join(', ')
      })`;
      
      if (fk.onDelete) sql += ` ON DELETE ${fk.onDelete}`;
      if (fk.onUpdate) sql += ` ON UPDATE ${fk.onUpdate}`;
    }

    sql += '\n);';

    // Add comment if exists
    if (table.comment) {
      sql += `\n\nCOMMENT ON TABLE "${table.name}" IS '${table.comment}';`;
    }

    return sql;
  }

  /**
   * Generate column definition
   */
  private generateColumnDefinition(column: Column): string {
    let def = `"${column.name}" ${column.type}`;

    if (!column.nullable) def += ' NOT NULL';
    if (column.defaultValue !== undefined) {
      def += ` DEFAULT ${this.formatDefaultValue(column.defaultValue)}`;
    }
    if (column.unique && !column.primaryKey) def += ' UNIQUE';
    if (column.primaryKey) def += ' PRIMARY KEY';
    if (column.autoIncrement) def += ' GENERATED BY DEFAULT AS IDENTITY';

    return def;
  }

  /**
   * Generate ALTER COLUMN statements
   */
  private generateAlterColumnStatements(
    tableName: string,
    oldColumn: Column,
    newColumn: Column
  ): string[] {
    const statements: string[] = [];

    // Type change
    if (oldColumn.type !== newColumn.type) {
      statements.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" TYPE ${newColumn.type} USING "${newColumn.name}"::${newColumn.type};`
      );
    }

    // Nullability change
    if (oldColumn.nullable !== newColumn.nullable) {
      if (newColumn.nullable) {
        statements.push(
          `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" DROP NOT NULL;`
        );
      } else {
        statements.push(
          `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" SET NOT NULL;`
        );
      }
    }

    // Default value change
    if (oldColumn.defaultValue !== newColumn.defaultValue) {
      if (newColumn.defaultValue === undefined) {
        statements.push(
          `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" DROP DEFAULT;`
        );
      } else {
        statements.push(
          `ALTER TABLE "${tableName}" ALTER COLUMN "${newColumn.name}" SET DEFAULT ${this.formatDefaultValue(newColumn.defaultValue)};`
        );
      }
    }

    return statements;
  }

  /**
   * Generate CREATE INDEX statement
   */
  private generateCreateIndexStatement(tableName: string, index: Index): string {
    let sql = `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX "${index.name}" ON "${tableName}" (${
      index.columns.map(c => `"${c}"`).join(', ')
    })`;

    if (index.type && index.type !== 'btree') {
      sql += ` USING ${index.type}`;
    }

    if (index.where) {
      sql += ` WHERE ${index.where}`;
    }

    sql += ';';

    return sql;
  }

  /**
   * Generate statements for drift fixes
   */
  private generateStatementsForDrifts(type: DriftType, drifts: Drift[]): string[] {
    const statements: string[] = [];

    for (const drift of drifts) {
      switch (type) {
        case DriftType.MISSING_TABLE:
          if (drift.expected) {
            statements.push(this.generateCreateTableStatement(drift.expected as Table));
          }
          break;

        case DriftType.EXTRA_TABLE:
          // Don't auto-drop tables
          statements.push(`-- Manual review needed: Extra table '${drift.object}' found`);
          break;

        case DriftType.MISSING_COLUMN:
          if (drift.expected) {
            const [table, column] = drift.object.split('.');
            statements.push(
              `ALTER TABLE "${table}" ADD COLUMN ${this.generateColumnDefinition(drift.expected as Column)};`
            );
          }
          break;

        case DriftType.COLUMN_TYPE_MISMATCH:
          const [tableName, columnName] = drift.object.split('.');
          statements.push(
            `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE ${drift.expected};`
          );
          break;

        case DriftType.INDEX_MISMATCH:
          if (drift.expected && drift.actual === null) {
            // Missing index
            const idx = drift.expected as Index;
            statements.push(this.generateCreateIndexStatement(idx.table, idx));
          }
          break;
      }
    }

    return statements;
  }

  /**
   * Generate column from form field
   */
  private generateColumnFromFormField(field: any): string {
    const columnType = this.mapFormFieldToColumnType(field);
    const nullable = !field.required;
    
    let def = `"${field.name}" ${columnType}`;
    
    if (!nullable) def += ' NOT NULL';
    if (field.defaultValue !== undefined) {
      def += ` DEFAULT ${this.formatDefaultValue(field.defaultValue)}`;
    }

    return def;
  }

  /**
   * Map form field to column type
   */
  private mapFormFieldToColumnType(field: any): string {
    switch (field.type) {
      case 'text':
        return field.validation?.maxLength 
          ? `VARCHAR(${field.validation.maxLength})`
          : 'TEXT';
      case 'email':
        return 'VARCHAR(255)';
      case 'password':
        return 'VARCHAR(255)';
      case 'number':
        return field.validation?.max && field.validation.max < 32767
          ? 'SMALLINT'
          : 'INTEGER';
      case 'date':
        return 'DATE';
      case 'datetime':
        return 'TIMESTAMP';
      case 'checkbox':
        return 'BOOLEAN';
      case 'textarea':
        return 'TEXT';
      default:
        return 'VARCHAR(255)';
    }
  }

  /**
   * Generate Prisma schema
   */
  private generatePrismaSchema(schema: DatabaseSchema): string {
    let prismaSchema = `// Generated by Migration Generator\n\n`;
    
    prismaSchema += `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

`;

    for (const table of schema.tables) {
      prismaSchema += `model ${this.toPascalCase(table.name)} {\n`;

      for (const column of table.columns) {
        const fieldName = column.name;
        const fieldType = this.mapToPrismaType(column.type);
        const modifiers: string[] = [];

        if (column.primaryKey) modifiers.push('@id');
        if (column.unique && !column.primaryKey) modifiers.push('@unique');
        if (column.autoIncrement) modifiers.push('@default(autoincrement())');
        if (column.defaultValue !== undefined && !column.autoIncrement) {
          modifiers.push(`@default(${this.formatPrismaDefault(column.defaultValue)})`);
        }

        const nullable = column.nullable ? '?' : '';
        const modifier = modifiers.join(' ');

        prismaSchema += `  ${fieldName} ${fieldType}${nullable} ${modifier}\n`;
      }

      prismaSchema += `\n  @@map("${table.name}")\n`;
      prismaSchema += '}\n\n';
    }

    return prismaSchema;
  }

  /**
   * Map to Prisma type
   */
  private mapToPrismaType(dbType: string): string {
    const type = dbType.toLowerCase();

    if (type.includes('int')) return 'Int';
    if (type.includes('bigint')) return 'BigInt';
    if (type.includes('numeric') || type.includes('decimal')) return 'Decimal';
    if (type.includes('float') || type.includes('double')) return 'Float';
    if (type.includes('bool')) return 'Boolean';
    if (type.includes('json')) return 'Json';
    if (type.includes('timestamp') || type.includes('datetime')) return 'DateTime';
    if (type.includes('date')) return 'DateTime';
    if (type.includes('uuid')) return 'String';
    if (type.includes('text') || type.includes('varchar')) return 'String';

    return 'String';
  }

  /**
   * Format Prisma default value
   */
  private formatPrismaDefault(value: unknown): string {
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (value === 'CURRENT_TIMESTAMP') return 'now()';
    return String(value);
  }

  /**
   * Format default value for SQL
   */
  private formatDefaultValue(value: unknown): string {
    if (typeof value === 'string') {
      if (value === 'auto_increment') return 'DEFAULT';
      if (value.toUpperCase() === 'CURRENT_TIMESTAMP') return 'CURRENT_TIMESTAMP';
      return `'${value}'`;
    }
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (value === null) return 'NULL';
    return String(value);
  }

  /**
   * Wrap statements in transaction
   */
  private wrapInTransaction(statements: string[]): string {
    return `BEGIN;\n\n${statements.join('\n\n')}\n\nCOMMIT;`;
  }

  /**
   * Order changes to handle dependencies
   */
  private orderChanges(changes: SchemaChange[]): SchemaChange[] {
    // Simple ordering: drops before creates, constraints last
    const ordered: SchemaChange[] = [];

    // First: drop constraints
    ordered.push(...changes.filter(c => c.type === 'DROP_CONSTRAINT'));
    
    // Second: drop indexes
    ordered.push(...changes.filter(c => c.type === 'DROP_INDEX'));
    
    // Third: drop columns
    ordered.push(...changes.filter(c => c.type === 'DROP_COLUMN'));
    
    // Fourth: drop tables
    ordered.push(...changes.filter(c => c.type === 'DROP_TABLE'));
    
    // Fifth: create tables
    ordered.push(...changes.filter(c => c.type === 'CREATE_TABLE'));
    
    // Sixth: add/alter columns
    ordered.push(...changes.filter(c => 
      c.type === 'ADD_COLUMN' || c.type === 'ALTER_COLUMN'
    ));
    
    // Seventh: create indexes
    ordered.push(...changes.filter(c => c.type === 'CREATE_INDEX'));
    
    // Eighth: add constraints
    ordered.push(...changes.filter(c => c.type === 'ADD_CONSTRAINT'));

    return ordered;
  }

  /**
   * Group drifts by type
   */
  private groupDriftsByType(drifts: Drift[]): Map<DriftType, Drift[]> {
    const grouped = new Map<DriftType, Drift[]>();

    for (const drift of drifts) {
      const group = grouped.get(drift.type) || [];
      group.push(drift);
      grouped.set(drift.type, group);
    }

    return grouped;
  }

  /**
   * Convert to Pascal case
   */
  private toPascalCase(str: string): string {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
}

// Type definitions for schema changes
interface SchemaChange {
  type: 
    | 'CREATE_TABLE' 
    | 'DROP_TABLE' 
    | 'ADD_COLUMN' 
    | 'DROP_COLUMN' 
    | 'ALTER_COLUMN'
    | 'CREATE_INDEX'
    | 'DROP_INDEX'
    | 'ADD_CONSTRAINT'
    | 'DROP_CONSTRAINT';
  table?: Table;
  column?: Column;
  oldColumn?: Column;
  newColumn?: Column;
  index?: Index;
  constraint?: Constraint;
}