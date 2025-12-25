/**
 * Schema Analyzer
 * Analyzes database schema and generates TypeScript types
 */

import {
  DatabaseSchema,
  Table,
  Column,
  View,
  DatabaseFunction,
  Index,
  Constraint,
  IntegrityResult,
  IntegrityError,
  IntegrityEventType,
  SchemaConfig
} from '../types';
import { DatabaseConnection } from '../core/database-connection';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { format } from 'prettier';

export class SchemaAnalyzer extends EventEmitter {
  private connection: DatabaseConnection;
  private config: SchemaConfig;

  constructor(connection: DatabaseConnection, config: SchemaConfig) {
    super();
    this.connection = connection;
    this.config = config;
  }

  /**
   * Analyze database schema
   */
  async analyze(): Promise<IntegrityResult<DatabaseSchema>> {
    try {
      const tables = await this.getTables();
      const views = this.config.includeViews ? await this.getViews() : [];
      const functions = this.config.includeFunctions ? await this.getDatabaseFunctions() : [];
      const indexes = this.config.includeIndexes ? await this.getIndexes() : [];
      const constraints = await this.getConstraints();

      const schema: DatabaseSchema = {
        tables,
        views,
        functions,
        indexes,
        constraints,
        version: new Date().toISOString(),
        timestamp: new Date()
      };

      // Save schema to file
      await this.saveSchema(schema);

      // Generate TypeScript types if enabled
      if (this.config.generateTypes) {
        await this.generateTypes(schema);
      }

      this.emit('event', {
        type: IntegrityEventType.SCHEMA_ANALYZED,
        timestamp: new Date(),
        source: 'SchemaAnalyzer',
        data: schema
      });

      return { success: true, data: schema };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'SCHEMA_ANALYSIS_FAILED',
        message: 'Failed to analyze database schema',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Get all tables from database
   */
  private async getTables(): Promise<Table[]> {
    const query = `
      SELECT 
        t.table_schema,
        t.table_name,
        obj_description(c.oid) as table_comment
      FROM information_schema.tables t
      JOIN pg_class c ON c.relname = t.table_name
      WHERE t.table_type = 'BASE TABLE'
        AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY t.table_schema, t.table_name
    `;

    const result = await this.connection.query<{
      table_schema: string;
      table_name: string;
      table_comment: string;
    }>(query);

    const tables: Table[] = [];

    for (const row of result.rows) {
      const columns = await this.getColumns(row.table_schema, row.table_name);
      const primaryKey = await this.getPrimaryKey(row.table_schema, row.table_name);
      const foreignKeys = await this.getForeignKeys(row.table_schema, row.table_name);
      const indexes = await this.getTableIndexes(row.table_schema, row.table_name);
      const constraints = await this.getTableConstraints(row.table_schema, row.table_name);

      tables.push({
        name: row.table_name,
        schema: row.table_schema,
        columns,
        primaryKey,
        foreignKeys,
        indexes,
        constraints,
        comment: row.table_comment
      });
    }

    return tables;
  }

  /**
   * Get columns for a table
   */
  private async getColumns(schema: string, tableName: string): Promise<Column[]> {
    const query = `
      SELECT
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        col_description(pgc.oid, c.ordinal_position) as column_comment,
        CASE 
          WHEN pk.column_name IS NOT NULL THEN true 
          ELSE false 
        END as is_primary_key,
        CASE 
          WHEN uc.column_name IS NOT NULL THEN true 
          ELSE false 
        END as is_unique,
        CASE 
          WHEN c.column_default LIKE 'nextval%' THEN true 
          ELSE false 
        END as is_auto_increment
      FROM information_schema.columns c
      LEFT JOIN pg_class pgc ON pgc.relname = c.table_name
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
          AND tc.table_schema = ku.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      ) pk ON pk.column_name = c.column_name
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
          AND tc.table_schema = ku.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      ) uc ON uc.column_name = c.column_name
      WHERE c.table_schema = $1
        AND c.table_name = $2
      ORDER BY c.ordinal_position
    `;

    const result = await this.connection.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
      column_comment: string | null;
      is_primary_key: boolean;
      is_unique: boolean;
      is_auto_increment: boolean;
    }>(query, [schema, tableName]);

    const columns: Column[] = result.rows.map(row => ({
      name: row.column_name,
      type: this.normalizeDataType(row.data_type, row.character_maximum_length, row.numeric_precision, row.numeric_scale),
      nullable: row.is_nullable === 'YES',
      defaultValue: this.parseDefaultValue(row.column_default),
      primaryKey: row.is_primary_key,
      unique: row.is_unique,
      autoIncrement: row.is_auto_increment,
      comment: row.column_comment || undefined
    }));

    // Add foreign key references
    const foreignKeyRefs = await this.getColumnReferences(schema, tableName);
    for (const column of columns) {
      const ref = foreignKeyRefs.find(r => r.column_name === column.name);
      if (ref) {
        column.references = {
          table: ref.foreign_table_name,
          column: ref.foreign_column_name,
          onDelete: ref.delete_rule,
          onUpdate: ref.update_rule
        };
      }
    }

    return columns;
  }

  /**
   * Get primary key for a table
   */
  private async getPrimaryKey(schema: string, tableName: string): Promise<{ name: string; columns: string[] } | undefined> {
    const query = `
      SELECT
        tc.constraint_name,
        array_agg(ku.column_name ORDER BY ku.ordinal_position) as columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
        AND tc.table_schema = ku.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      GROUP BY tc.constraint_name
    `;

    const result = await this.connection.query<{
      constraint_name: string;
      columns: string[];
    }>(query, [schema, tableName]);

    if (result.rows.length > 0) {
      return {
        name: result.rows[0].constraint_name,
        columns: result.rows[0].columns
      };
    }

    return undefined;
  }

  /**
   * Get foreign keys for a table
   */
  private async getForeignKeys(schema: string, tableName: string): Promise<any[]> {
    const query = `
      SELECT
        tc.constraint_name,
        array_agg(DISTINCT kcu.column_name) as columns,
        ccu.table_name as foreign_table_name,
        array_agg(DISTINCT ccu.column_name) as foreign_column_names,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      GROUP BY tc.constraint_name, ccu.table_name, rc.delete_rule, rc.update_rule
    `;

    const result = await this.connection.query<{
      constraint_name: string;
      columns: string[];
      foreign_table_name: string;
      foreign_column_names: string[];
      delete_rule: string;
      update_rule: string;
    }>(query, [schema, tableName]);

    return result.rows.map(row => ({
      name: row.constraint_name,
      columns: row.columns,
      referencedTable: row.foreign_table_name,
      referencedColumns: row.foreign_column_names,
      onDelete: row.delete_rule,
      onUpdate: row.update_rule
    }));
  }

  /**
   * Get views from database
   */
  private async getViews(): Promise<View[]> {
    const query = `
      SELECT 
        table_schema,
        table_name as view_name,
        view_definition
      FROM information_schema.views
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `;

    const result = await this.connection.query<{
      table_schema: string;
      view_name: string;
      view_definition: string;
    }>(query);

    const views: View[] = [];

    for (const row of result.rows) {
      const columns = await this.getViewColumns(row.table_schema, row.view_name);
      
      views.push({
        name: row.view_name,
        schema: row.table_schema,
        definition: row.view_definition,
        columns
      });
    }

    return views;
  }

  /**
   * Get columns for a view
   */
  private async getViewColumns(schema: string, viewName: string): Promise<{ name: string; type: string }[]> {
    const query = `
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `;

    const result = await this.connection.query<{
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
    }>(query, [schema, viewName]);

    return result.rows.map(row => ({
      name: row.column_name,
      type: this.normalizeDataType(row.data_type, row.character_maximum_length, row.numeric_precision, row.numeric_scale)
    }));
  }

  /**
   * Get database functions
   */
  private async getDatabaseFunctions(): Promise<DatabaseFunction[]> {
    const query = `
      SELECT
        n.nspname as schema_name,
        p.proname as function_name,
        l.lanname as language,
        p.prosrc as definition,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as return_type
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND p.prokind = 'f'
      ORDER BY n.nspname, p.proname
    `;

    const result = await this.connection.query<{
      schema_name: string;
      function_name: string;
      language: string;
      definition: string;
      arguments: string;
      return_type: string;
    }>(query);

    return result.rows.map(row => ({
      name: row.function_name,
      schema: row.schema_name,
      language: row.language,
      definition: row.definition,
      parameters: this.parseFunctionParameters(row.arguments),
      returnType: row.return_type
    }));
  }

  /**
   * Get all indexes
   */
  private async getIndexes(): Promise<Index[]> {
    const query = `
      SELECT
        n.nspname as schema_name,
        t.relname as table_name,
        i.relname as index_name,
        a.attname as column_name,
        ix.indisunique as is_unique,
        am.amname as index_type,
        pg_get_expr(ix.indpred, ix.indrelid) as where_clause
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_am am ON am.oid = i.relam
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY n.nspname, t.relname, i.relname
    `;

    const result = await this.connection.query<{
      schema_name: string;
      table_name: string;
      index_name: string;
      column_name: string;
      is_unique: boolean;
      index_type: string;
      where_clause: string | null;
    }>(query);

    const indexMap = new Map<string, Index>();

    for (const row of result.rows) {
      const key = `${row.table_name}.${row.index_name}`;
      
      if (!indexMap.has(key)) {
        indexMap.set(key, {
          name: row.index_name,
          table: row.table_name,
          columns: [],
          unique: row.is_unique,
          type: row.index_type as any,
          where: row.where_clause || undefined
        });
      }

      const index = indexMap.get(key)!;
      index.columns.push(row.column_name);
    }

    return Array.from(indexMap.values());
  }

  /**
   * Get table indexes
   */
  private async getTableIndexes(schema: string, tableName: string): Promise<Index[]> {
    const indexes = await this.getIndexes();
    return indexes.filter(idx => idx.table === tableName);
  }

  /**
   * Get all constraints
   */
  private async getConstraints(): Promise<Constraint[]> {
    const query = `
      SELECT
        n.nspname as schema_name,
        t.relname as table_name,
        c.conname as constraint_name,
        CASE c.contype
          WHEN 'c' THEN 'check'
          WHEN 'f' THEN 'foreign_key'
          WHEN 'p' THEN 'primary_key'
          WHEN 'u' THEN 'unique'
          WHEN 'x' THEN 'exclude'
        END as constraint_type,
        pg_get_constraintdef(c.oid) as definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY n.nspname, t.relname, c.conname
    `;

    const result = await this.connection.query<{
      schema_name: string;
      table_name: string;
      constraint_name: string;
      constraint_type: string;
      definition: string;
    }>(query);

    return result.rows.map(row => ({
      name: row.constraint_name,
      table: row.table_name,
      type: row.constraint_type as any,
      definition: row.definition
    }));
  }

  /**
   * Get table constraints
   */
  private async getTableConstraints(schema: string, tableName: string): Promise<Constraint[]> {
    const constraints = await this.getConstraints();
    return constraints.filter(c => c.table === tableName);
  }

  /**
   * Get column references (for foreign keys)
   */
  private async getColumnReferences(schema: string, tableName: string): Promise<any[]> {
    const query = `
      SELECT
        kcu.column_name,
        ccu.table_name as foreign_table_name,
        ccu.column_name as foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = kcu.constraint_name
        AND ccu.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = kcu.constraint_name
        AND rc.constraint_schema = kcu.table_schema
      JOIN information_schema.table_constraints tc
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE kcu.table_schema = $1
        AND kcu.table_name = $2
        AND tc.constraint_type = 'FOREIGN KEY'
    `;

    const result = await this.connection.query(query, [schema, tableName]);
    return result.rows;
  }

  /**
   * Normalize database data type to TypeScript type
   */
  private normalizeDataType(
    dataType: string, 
    maxLength?: number | null, 
    precision?: number | null, 
    scale?: number | null
  ): string {
    let normalized = dataType.toLowerCase();

    if (normalized.includes('character varying') || normalized.includes('varchar')) {
      normalized = maxLength ? `varchar(${maxLength})` : 'varchar';
    } else if (normalized.includes('character') || normalized === 'char') {
      normalized = maxLength ? `char(${maxLength})` : 'char';
    } else if (normalized === 'numeric' || normalized === 'decimal') {
      if (precision && scale) {
        normalized = `numeric(${precision},${scale})`;
      } else if (precision) {
        normalized = `numeric(${precision})`;
      }
    }

    return normalized;
  }

  /**
   * Parse default value
   */
  private parseDefaultValue(defaultValue: string | null): unknown {
    if (!defaultValue) return undefined;

    // Remove type casting
    let value = defaultValue.replace(/::[\w\s]+$/, '');

    // Handle nextval (sequences)
    if (value.includes('nextval')) {
      return 'auto_increment';
    }

    // Handle string literals
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1);
    }

    // Handle boolean
    if (value === 'true' || value === 'false') {
      return value === 'true';
    }

    // Handle numbers
    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }

    // Handle functions
    if (value.includes('()')) {
      return value;
    }

    return value;
  }

  /**
   * Parse function parameters
   */
  private parseFunctionParameters(args: string): any[] {
    if (!args) return [];

    // Simple parsing - this would need to be more sophisticated for complex types
    const params = args.split(',').map(param => {
      const parts = param.trim().split(' ');
      const mode = parts[0].toUpperCase();
      const isMode = ['IN', 'OUT', 'INOUT'].includes(mode);
      
      return {
        name: isMode ? parts[1] : parts[0],
        type: isMode ? parts.slice(2).join(' ') : parts.slice(1).join(' '),
        mode: isMode ? mode : 'IN'
      };
    });

    return params;
  }

  /**
   * Save schema to file
   */
  private async saveSchema(schema: DatabaseSchema): Promise<void> {
    await fs.ensureDir(this.config.directory);

    if (this.config.format === 'prisma' || this.config.format === 'both') {
      const prismaSchema = this.generatePrismaSchema(schema);
      const prismaPath = path.join(this.config.directory, 'schema.prisma');
      await fs.writeFile(prismaPath, prismaSchema);
    }

    if (this.config.format === 'sql' || this.config.format === 'both') {
      const sqlSchema = this.generateSqlSchema(schema);
      const sqlPath = path.join(this.config.directory, 'schema.sql');
      await fs.writeFile(sqlPath, sqlSchema);
    }

    // Always save JSON representation
    const jsonPath = path.join(this.config.directory, 'schema.json');
    await fs.writeJson(jsonPath, schema, { spaces: 2 });
  }

  /**
   * Generate Prisma schema
   */
  private generatePrismaSchema(schema: DatabaseSchema): string {
    let prismaSchema = `// Generated by Claude DevOps Platform
// ${new Date().toISOString()}

generator client {
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
        if (!column.nullable) modifiers.push('');

        const nullable = column.nullable ? '?' : '';
        const modifier = modifiers.filter(m => m.startsWith('@')).join(' ');

        prismaSchema += `  ${fieldName} ${fieldType}${nullable} ${modifier}\n`;
      }

      // Add relations
      for (const fk of table.foreignKeys) {
        const relatedTable = schema.tables.find(t => t.name === fk.referencedTable);
        if (relatedTable) {
          const relationName = this.toPascalCase(fk.referencedTable);
          const fieldName = fk.columns[0].replace('_id', '');
          
          prismaSchema += `  ${fieldName} ${relationName}? @relation(fields: [${fk.columns.join(', ')}], references: [${fk.referencedColumns.join(', ')}])\n`;
        }
      }

      if (table.comment) {
        prismaSchema += `\n  @@documentation("${table.comment}")\n`;
      }

      prismaSchema += `  @@map("${table.name}")\n`;
      prismaSchema += '}\n\n';
    }

    return prismaSchema;
  }

  /**
   * Generate SQL schema
   */
  private generateSqlSchema(schema: DatabaseSchema): string {
    let sql = `-- Generated by Claude DevOps Platform
-- ${new Date().toISOString()}

`;

    for (const table of schema.tables) {
      sql += `CREATE TABLE "${table.schema}"."${table.name}" (\n`;

      const columnDefs = table.columns.map(column => {
        let def = `  "${column.name}" ${column.type}`;
        
        if (!column.nullable) def += ' NOT NULL';
        if (column.defaultValue !== undefined) {
          def += ` DEFAULT ${this.formatSqlDefault(column.defaultValue)}`;
        }
        if (column.unique && !column.primaryKey) def += ' UNIQUE';

        return def;
      });

      sql += columnDefs.join(',\n');

      // Add primary key
      if (table.primaryKey) {
        sql += `,\n  CONSTRAINT "${table.primaryKey.name}" PRIMARY KEY (${table.primaryKey.columns.map(c => `"${c}"`).join(', ')})`;
      }

      // Add foreign keys
      for (const fk of table.foreignKeys) {
        sql += `,\n  CONSTRAINT "${fk.name}" FOREIGN KEY (${fk.columns.map(c => `"${c}"`).join(', ')})`;
        sql += `\n    REFERENCES "${fk.referencedTable}" (${fk.referencedColumns.map(c => `"${c}"`).join(', ')})`;
        sql += `\n    ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`;
      }

      sql += '\n);\n\n';

      // Add indexes
      for (const index of table.indexes) {
        sql += `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX "${index.name}"`;
        sql += ` ON "${table.schema}"."${table.name}" (${index.columns.map(c => `"${c}"`).join(', ')})`;
        if (index.where) {
          sql += ` WHERE ${index.where}`;
        }
        sql += ';\n';
      }

      if (table.comment) {
        sql += `COMMENT ON TABLE "${table.schema}"."${table.name}" IS '${table.comment}';\n`;
      }

      sql += '\n';
    }

    return sql;
  }

  /**
   * Generate TypeScript types
   */
  async generateTypes(schema: DatabaseSchema): Promise<void> {
    await fs.ensureDir(this.config.typeOutputDirectory);

    let types = `// Generated by Claude DevOps Platform
// ${new Date().toISOString()}

`;

    // Generate interfaces for each table
    for (const table of schema.tables) {
      const interfaceName = this.toPascalCase(table.name);
      types += `export interface ${interfaceName} {\n`;

      for (const column of table.columns) {
        const fieldName = column.name;
        const fieldType = this.mapToTypeScriptType(column.type);
        const nullable = column.nullable ? ' | null' : '';
        const optional = column.nullable || column.defaultValue !== undefined ? '?' : '';

        types += `  ${fieldName}${optional}: ${fieldType}${nullable};\n`;
      }

      types += '}\n\n';

      // Generate input types for create/update
      types += `export interface Create${interfaceName}Input {\n`;
      for (const column of table.columns) {
        if (!column.autoIncrement && !column.defaultValue) {
          const fieldName = column.name;
          const fieldType = this.mapToTypeScriptType(column.type);
          const optional = column.nullable ? '?' : '';
          types += `  ${fieldName}${optional}: ${fieldType};\n`;
        }
      }
      types += '}\n\n';

      types += `export interface Update${interfaceName}Input {\n`;
      for (const column of table.columns) {
        if (!column.autoIncrement) {
          const fieldName = column.name;
          const fieldType = this.mapToTypeScriptType(column.type);
          types += `  ${fieldName}?: ${fieldType};\n`;
        }
      }
      types += '}\n\n';
    }

    // Generate view types
    for (const view of schema.views) {
      const interfaceName = this.toPascalCase(view.name) + 'View';
      types += `export interface ${interfaceName} {\n`;

      for (const column of view.columns) {
        const fieldName = column.name;
        const fieldType = this.mapToTypeScriptType(column.type);
        types += `  ${fieldName}: ${fieldType};\n`;
      }

      types += '}\n\n';
    }

    // Generate enum types for common patterns
    const enumTypes = this.extractEnumTypes(schema);
    for (const [enumName, values] of enumTypes) {
      types += `export enum ${enumName} {\n`;
      for (const value of values) {
        types += `  ${value.toUpperCase()} = '${value}',\n`;
      }
      types += '}\n\n';
    }

    // Format with prettier
    const formatted = await format(types, {
      parser: 'typescript',
      singleQuote: true,
      semi: true,
      trailingComma: 'es5',
      printWidth: 100
    });

    const typesPath = path.join(this.config.typeOutputDirectory, 'database.ts');
    await fs.writeFile(typesPath, formatted);

    this.emit('event', {
      type: IntegrityEventType.TYPE_GENERATED,
      timestamp: new Date(),
      source: 'SchemaAnalyzer',
      data: { path: typesPath }
    });
  }

  /**
   * Map database type to TypeScript type
   */
  private mapToTypeScriptType(dbType: string): string {
    const type = dbType.toLowerCase();

    if (type.includes('int') || type.includes('serial')) return 'number';
    if (type.includes('numeric') || type.includes('decimal') || type.includes('float') || type.includes('double')) return 'number';
    if (type.includes('bool')) return 'boolean';
    if (type.includes('json')) return 'Record<string, unknown>';
    if (type.includes('date') || type.includes('time')) return 'Date';
    if (type.includes('uuid')) return 'string';
    if (type.includes('text') || type.includes('char') || type.includes('varchar')) return 'string';
    if (type.includes('bytea')) return 'Buffer';
    if (type.includes('array')) {
      const elementType = type.replace(/\[\]/, '').replace('array', '').trim();
      return `${this.mapToTypeScriptType(elementType)}[]`;
    }

    return 'unknown';
  }

  /**
   * Map database type to Prisma type
   */
  private mapToPrismaType(dbType: string): string {
    const type = dbType.toLowerCase();

    if (type.includes('serial')) return 'Int';
    if (type.includes('bigserial')) return 'BigInt';
    if (type.includes('int')) return 'Int';
    if (type.includes('bigint')) return 'BigInt';
    if (type.includes('numeric') || type.includes('decimal')) return 'Decimal';
    if (type.includes('float') || type.includes('double')) return 'Float';
    if (type.includes('bool')) return 'Boolean';
    if (type.includes('json')) return 'Json';
    if (type.includes('timestamp')) return 'DateTime';
    if (type.includes('date')) return 'DateTime';
    if (type.includes('time')) return 'DateTime';
    if (type.includes('uuid')) return 'String';
    if (type.includes('text') || type.includes('char') || type.includes('varchar')) return 'String';
    if (type.includes('bytea')) return 'Bytes';

    return 'String';
  }

  /**
   * Format default value for Prisma
   */
  private formatPrismaDefault(value: unknown): string {
    if (value === 'auto_increment') return 'autoincrement()';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (value instanceof Date) return `now()`;
    return String(value);
  }

  /**
   * Format default value for SQL
   */
  private formatSqlDefault(value: unknown): string {
    if (value === 'auto_increment') return 'DEFAULT';
    if (typeof value === 'string') return `'${value}'`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    return String(value);
  }

  /**
   * Convert string to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Extract enum types from schema
   */
  private extractEnumTypes(schema: DatabaseSchema): Map<string, string[]> {
    const enums = new Map<string, Set<string>>();

    // Look for check constraints that might be enums
    for (const constraint of schema.constraints) {
      if (constraint.type === 'check' && constraint.definition.includes('IN')) {
        const match = constraint.definition.match(/(\w+)\s+IN\s+\(([^)]+)\)/);
        if (match) {
          const columnName = match[1];
          const values = match[2].split(',').map(v => v.trim().replace(/'/g, ''));
          
          const enumName = this.toPascalCase(columnName) + 'Enum';
          enums.set(enumName, new Set(values));
        }
      }
    }

    // Look for common enum patterns in column names
    for (const table of schema.tables) {
      for (const column of table.columns) {
        if (column.name.includes('status') || column.name.includes('type') || column.name.includes('state')) {
          // Try to extract values from check constraints
          const constraint = table.constraints.find(c => 
            c.type === 'check' && c.definition.includes(column.name)
          );
          
          if (constraint) {
            const match = constraint.definition.match(/IN\s+\(([^)]+)\)/);
            if (match) {
              const values = match[1].split(',').map(v => v.trim().replace(/'/g, ''));
              const enumName = this.toPascalCase(table.name) + this.toPascalCase(column.name);
              enums.set(enumName, new Set(values));
            }
          }
        }
      }
    }

    // Convert Set to Array
    const result = new Map<string, string[]>();
    for (const [name, values] of enums) {
      result.set(name, Array.from(values));
    }

    return result;
  }
}