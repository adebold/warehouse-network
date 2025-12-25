/**
 * Schema Analyzer
 * Analyzes PostgreSQL database schema and extracts detailed information
 */

import {
  DatabaseSchema,
  Table,
  Column,
  Index,
  Constraint,
  Enum,
  SchemaConfig,
  IntegrityResult,
  IntegrityError,
  View,
  Function,
  Trigger
} from '../types';
import { DatabaseConnection } from '../core/database-connection';
import winston from 'winston';

export class SchemaAnalyzer {
  private connection: DatabaseConnection;
  private config: SchemaConfig;
  private logger: winston.Logger;

  constructor(connection: DatabaseConnection, config: SchemaConfig) {
    this.connection = connection;
    this.config = config;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async analyze(): Promise<IntegrityResult<DatabaseSchema>> {
    try {
      this.logger.info('Analyzing database schema');

      const schema: DatabaseSchema = {
        version: await this.getSchemaVersion(),
        timestamp: new Date(),
        tables: await this.analyzeTables(),
        views: this.config.includeViews ? await this.analyzeViews() : undefined,
        indexes: this.config.includeIndexes ? await this.analyzeIndexes() : undefined,
        constraints: this.config.includeConstraints ? await this.analyzeConstraints() : undefined,
        enums: await this.analyzeEnums(),
        functions: this.config.includeFunctions ? await this.analyzeFunctions() : undefined,
        triggers: this.config.includeTriggers ? await this.analyzeTriggers() : undefined
      };

      this.logger.info(`Analyzed ${schema.tables.length} tables`);
      return { success: true, data: schema };
    } catch (error) {
      this.logger.error('Failed to analyze schema', error);
      const integrityError: IntegrityError = {
        code: 'SCHEMA_ANALYSIS_FAILED',
        message: 'Failed to analyze database schema',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  private async getSchemaVersion(): Promise<string> {
    try {
      // Try to get version from migrations or settings table
      const sql = `
        SELECT version FROM schema_version 
        ORDER BY applied_at DESC 
        LIMIT 1
      `;
      const result = await this.connection.queryOne<{ version: string }>(sql);
      return result?.version || 'unknown';
    } catch {
      return new Date().toISOString();
    }
  }

  private async analyzeTables(): Promise<Table[]> {
    const tables: Table[] = [];
    
    // Get all tables
    const tableSql = `
      SELECT 
        t.table_schema,
        t.table_name,
        obj_description(c.oid) as comment
      FROM information_schema.tables t
      JOIN pg_catalog.pg_class c ON c.relname = t.table_name
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
        ${this.getTableFilter()}
      ORDER BY t.table_schema, t.table_name
    `;

    const tableRows = await this.connection.queryMany<any>(tableSql);

    for (const row of tableRows) {
      const table: Table = {
        name: row.table_name,
        schema: row.table_schema,
        columns: await this.analyzeColumns(row.table_schema, row.table_name),
        primaryKey: await this.getPrimaryKey(row.table_schema, row.table_name),
        foreignKeys: await this.getForeignKeys(row.table_schema, row.table_name),
        indexes: await this.getTableIndexes(row.table_schema, row.table_name),
        constraints: await this.getTableConstraints(row.table_schema, row.table_name),
        comment: row.comment
      };

      tables.push(table);
    }

    return tables;
  }

  private async analyzeColumns(schema: string, tableName: string): Promise<Column[]> {
    const sql = `
      SELECT 
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.datetime_precision,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        c.identity_generation,
        col_description(pgc.oid, c.ordinal_position) as comment
      FROM information_schema.columns c
      JOIN pg_catalog.pg_class pgc ON pgc.relname = c.table_name
      JOIN pg_catalog.pg_namespace n ON n.oid = pgc.relnamespace AND n.nspname = c.table_schema
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `;

    const rows = await this.connection.queryMany<any>(sql, [schema, tableName]);

    return rows.map(row => ({
      name: row.column_name,
      type: this.formatDataType(row),
      nullable: row.is_nullable === 'YES',
      default: this.parseDefault(row.column_default),
      autoIncrement: row.is_identity === 'YES' || row.identity_generation !== null,
      comment: row.comment
    }));
  }

  private formatDataType(row: any): string {
    let type = row.data_type;
    
    if (row.character_maximum_length) {
      type += `(${row.character_maximum_length})`;
    } else if (row.numeric_precision) {
      type += `(${row.numeric_precision}`;
      if (row.numeric_scale) {
        type += `,${row.numeric_scale}`;
      }
      type += ')';
    } else if (row.datetime_precision !== null) {
      type += `(${row.datetime_precision})`;
    }
    
    return type;
  }

  private parseDefault(defaultValue: string | null): any {
    if (!defaultValue) return undefined;
    
    // Remove type casts
    defaultValue = defaultValue.replace(/::[\w\s]+$/, '');
    
    // Parse common defaults
    if (defaultValue === 'true' || defaultValue === "'true'") return true;
    if (defaultValue === 'false' || defaultValue === "'false'") return false;
    if (defaultValue === 'NULL') return null;
    if (/^'.*'$/.test(defaultValue)) return defaultValue.slice(1, -1);
    if (/^\d+$/.test(defaultValue)) return parseInt(defaultValue);
    if (/^\d+\.\d+$/.test(defaultValue)) return parseFloat(defaultValue);
    
    return defaultValue;
  }

  private async getPrimaryKey(schema: string, tableName: string): Promise<any> {
    const sql = `
      SELECT
        c.constraint_name as name,
        array_agg(cu.column_name ORDER BY cu.ordinal_position) as columns
      FROM information_schema.table_constraints c
      JOIN information_schema.key_column_usage cu 
        ON c.constraint_name = cu.constraint_name
        AND c.table_schema = cu.table_schema
      WHERE c.table_schema = $1 
        AND c.table_name = $2
        AND c.constraint_type = 'PRIMARY KEY'
      GROUP BY c.constraint_name
    `;

    const result = await this.connection.queryOne<any>(sql, [schema, tableName]);
    
    return result ? {
      name: result.name,
      columns: result.columns
    } : undefined;
  }

  private async getForeignKeys(schema: string, tableName: string): Promise<any[]> {
    const sql = `
      SELECT
        c.constraint_name as name,
        array_agg(DISTINCT kcu.column_name) as columns,
        ccu.table_name as referenced_table,
        array_agg(DISTINCT ccu.column_name) as referenced_columns,
        rc.update_rule as on_update,
        rc.delete_rule as on_delete
      FROM information_schema.table_constraints c
      JOIN information_schema.key_column_usage kcu
        ON c.constraint_name = kcu.constraint_name
        AND c.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON c.constraint_name = ccu.constraint_name
        AND c.table_schema = ccu.table_schema
      JOIN information_schema.referential_constraints rc
        ON c.constraint_name = rc.constraint_name
        AND c.table_schema = rc.constraint_schema
      WHERE c.table_schema = $1 
        AND c.table_name = $2
        AND c.constraint_type = 'FOREIGN KEY'
      GROUP BY c.constraint_name, ccu.table_name, rc.update_rule, rc.delete_rule
    `;

    const rows = await this.connection.queryMany<any>(sql, [schema, tableName]);

    return rows.map(row => ({
      name: row.name,
      columns: row.columns,
      referencedTable: row.referenced_table,
      referencedColumns: row.referenced_columns,
      onUpdate: row.on_update.replace('_', ' '),
      onDelete: row.on_delete.replace('_', ' ')
    }));
  }

  private async getTableIndexes(schema: string, tableName: string): Promise<Index[]> {
    const sql = `
      SELECT
        i.relname as name,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        array_agg(a.attname ORDER BY a.attnum) as columns,
        am.amname as index_type,
        pg_get_expr(ix.indpred, ix.indrelid) as where_clause
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = $1 AND t.relname = $2
        AND NOT ix.indisprimary
      GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname, ix.indpred, ix.indrelid
    `;

    const rows = await this.connection.queryMany<any>(sql, [schema, tableName]);

    return rows.map(row => ({
      name: row.name,
      table: tableName,
      columns: row.columns,
      unique: row.is_unique,
      type: row.index_type,
      where: row.where_clause
    }));
  }

  private async getTableConstraints(schema: string, tableName: string): Promise<Constraint[]> {
    const sql = `
      SELECT
        con.conname as name,
        con.contype as type,
        pg_get_constraintdef(con.oid) as definition,
        array_agg(a.attname) as columns
      FROM pg_constraint con
      JOIN pg_namespace n ON n.oid = con.connamespace
      JOIN pg_class c ON c.oid = con.conrelid
      LEFT JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      WHERE n.nspname = $1 AND c.relname = $2
        AND con.contype IN ('c', 'u', 'x')
      GROUP BY con.conname, con.contype, con.oid
    `;

    const rows = await this.connection.queryMany<any>(sql, [schema, tableName]);

    return rows.map(row => ({
      name: row.name,
      table: tableName,
      type: this.mapConstraintType(row.type),
      definition: row.definition,
      columns: row.columns
    }));
  }

  private mapConstraintType(pgType: string): 'check' | 'unique' | 'exclude' | 'foreign_key' | 'primary_key' {
    const typeMap: Record<string, any> = {
      'c': 'check',
      'u': 'unique',
      'x': 'exclude',
      'f': 'foreign_key',
      'p': 'primary_key'
    };
    return typeMap[pgType] || 'check';
  }

  private async analyzeViews(): Promise<View[]> {
    const sql = `
      SELECT
        schemaname,
        viewname,
        definition,
        matviewname IS NOT NULL as is_materialized
      FROM pg_views
      LEFT JOIN pg_matviews ON pg_views.viewname = pg_matviews.matviewname
        AND pg_views.schemaname = pg_matviews.schemaname
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, viewname
    `;

    const rows = await this.connection.queryMany<any>(sql);

    const views: View[] = [];
    for (const row of rows) {
      const columns = await this.analyzeViewColumns(row.schemaname, row.viewname);
      views.push({
        name: row.viewname,
        schema: row.schemaname,
        definition: row.definition,
        columns,
        materialized: row.is_materialized
      });
    }

    return views;
  }

  private async analyzeViewColumns(schema: string, viewName: string): Promise<Column[]> {
    const sql = `
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;

    const rows = await this.connection.queryMany<any>(sql, [schema, viewName]);

    return rows.map(row => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES'
    }));
  }

  private async analyzeIndexes(): Promise<Index[]> {
    const sql = `
      SELECT
        n.nspname as schema_name,
        t.relname as table_name,
        i.relname as index_name,
        ix.indisunique as is_unique,
        array_agg(a.attname ORDER BY a.attnum) as columns,
        am.amname as index_type,
        pg_get_expr(ix.indpred, ix.indrelid) as where_clause
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND NOT ix.indisprimary
      GROUP BY n.nspname, t.relname, i.relname, ix.indisunique, am.amname, ix.indpred, ix.indrelid
      ORDER BY n.nspname, t.relname, i.relname
    `;

    const rows = await this.connection.queryMany<any>(sql);

    return rows.map(row => ({
      name: row.index_name,
      table: row.table_name,
      columns: row.columns,
      unique: row.is_unique,
      type: row.index_type,
      where: row.where_clause
    }));
  }

  private async analyzeConstraints(): Promise<Constraint[]> {
    const sql = `
      SELECT
        n.nspname as schema_name,
        c.relname as table_name,
        con.conname as constraint_name,
        con.contype as constraint_type,
        pg_get_constraintdef(con.oid) as definition,
        array_agg(a.attname) as columns
      FROM pg_constraint con
      JOIN pg_namespace n ON n.oid = con.connamespace
      JOIN pg_class c ON c.oid = con.conrelid
      LEFT JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      GROUP BY n.nspname, c.relname, con.conname, con.contype, con.oid
      ORDER BY n.nspname, c.relname, con.conname
    `;

    const rows = await this.connection.queryMany<any>(sql);

    return rows.map(row => ({
      name: row.constraint_name,
      table: row.table_name,
      type: this.mapConstraintType(row.constraint_type),
      definition: row.definition,
      columns: row.columns
    }));
  }

  private async analyzeEnums(): Promise<Enum[]> {
    const sql = `
      SELECT
        n.nspname as schema_name,
        t.typname as enum_name,
        array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      GROUP BY n.nspname, t.typname
      ORDER BY n.nspname, t.typname
    `;

    const rows = await this.connection.queryMany<any>(sql);

    return rows.map(row => ({
      name: row.enum_name,
      schema: row.schema_name,
      values: row.values
    }));
  }

  private async analyzeFunctions(): Promise<Function[]> {
    const sql = `
      SELECT
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_functiondef(p.oid) as definition,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as return_type,
        l.lanname as language
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND NOT p.proisagg
        AND NOT p.proiswindow
      ORDER BY n.nspname, p.proname
    `;

    const rows = await this.connection.queryMany<any>(sql);

    return rows.map(row => ({
      name: row.function_name,
      schema: row.schema_name,
      definition: row.definition,
      parameters: this.parseFunctionArguments(row.arguments),
      returnType: row.return_type,
      language: row.language
    }));
  }

  private parseFunctionArguments(args: string): any[] {
    // Simple parser for function arguments
    // Format: "param1 type1, param2 type2"
    if (!args) return [];
    
    return args.split(',').map(arg => {
      const parts = arg.trim().split(' ');
      return {
        name: parts[0],
        type: parts.slice(1).join(' '),
        mode: 'IN' // Default, would need more parsing for OUT/INOUT
      };
    });
  }

  private async analyzeTriggers(): Promise<Trigger[]> {
    const sql = `
      SELECT
        n.nspname as schema_name,
        c.relname as table_name,
        t.tgname as trigger_name,
        CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END as timing,
        CASE 
          WHEN t.tgtype & 4 = 4 THEN 'INSERT'
          WHEN t.tgtype & 8 = 8 THEN 'DELETE'
          WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
        END as event,
        CASE t.tgtype & 1 WHEN 1 THEN 'ROW' ELSE 'STATEMENT' END as for_each,
        pg_get_triggerdef(t.oid) as definition,
        t.tgenabled != 'D' as enabled
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND NOT t.tgisinternal
      ORDER BY n.nspname, c.relname, t.tgname
    `;

    const rows = await this.connection.queryMany<any>(sql);

    return rows.map(row => ({
      name: row.trigger_name,
      table: row.table_name,
      event: row.event,
      timing: row.timing,
      forEach: row.for_each,
      definition: row.definition,
      enabled: row.enabled
    }));
  }

  private getTableFilter(): string {
    if (this.config.includeTables && this.config.includeTables.length > 0) {
      const tables = this.config.includeTables.map(t => `'${t}'`).join(',');
      return ` AND t.table_name IN (${tables})`;
    }
    
    if (this.config.excludeTables && this.config.excludeTables.length > 0) {
      const tables = this.config.excludeTables.map(t => `'${t}'`).join(',');
      return ` AND t.table_name NOT IN (${tables})`;
    }
    
    return '';
  }
}