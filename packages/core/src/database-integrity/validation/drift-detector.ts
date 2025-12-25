/**
 * Drift Detector
 * Detects schema drifts between expected and actual database state
 */

import {
  DatabaseSchema,
  DriftReport,
  Drift,
  DriftType,
  DriftSeverity,
  DriftConfig,
  IntegrityResult,
  IntegrityError,
  Table,
  Column,
  PrismaModel
} from '../types';
import { DatabaseConnection } from '../core/database-connection';
import { SchemaAnalyzer } from '../schema/schema-analyzer';
import winston from 'winston';
import crypto from 'crypto';
import { memoryBank } from '../memory-bank/memory-bank';
import { IntegrityLogCategory, IntegrityLogLevel, IntegrityAlertType, IntegrityAlertSeverity, IntegrityMetricType, SnapshotType } from '@warehouse-network/db';

export class DriftDetector {
  private connection: DatabaseConnection;
  private config: DriftConfig;
  private schemaAnalyzer: SchemaAnalyzer;
  private logger: winston.Logger;

  constructor(
    connection: DatabaseConnection,
    config: DriftConfig,
    schemaAnalyzer: SchemaAnalyzer
  ) {
    this.connection = connection;
    this.config = config;
    this.schemaAnalyzer = schemaAnalyzer;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async detectDrifts(): Promise<IntegrityResult<DriftReport>> {
    const correlationId = memoryBank.setCorrelationId();
    const startTime = Date.now();
    
    try {
      this.logger.info('Detecting schema drifts');
      
      // Log operation start
      await memoryBank.log({
        category: IntegrityLogCategory.DRIFT_DETECTION,
        level: IntegrityLogLevel.INFO,
        operation: 'detectDrifts',
        component: 'DriftDetector',
        message: 'Starting drift detection',
        success: true,
        correlationId
      });

      // Get current database schema
      const currentSchemaResult = await this.schemaAnalyzer.analyze();
      if (!currentSchemaResult.success || !currentSchemaResult.data) {
        throw new Error('Failed to analyze current schema');
      }

      const currentSchema = currentSchemaResult.data;
      const drifts: Drift[] = [];

      // Detect manual changes
      const manualChanges = await this.detectManualChanges(currentSchema);
      drifts.push(...manualChanges);

      // Detect missing migrations
      const missingMigrations = await this.detectMissingMigrations();
      drifts.push(...missingMigrations);

      // Apply ignore patterns
      const filteredDrifts = this.applyIgnorePatterns(drifts);

      // Generate drift report
      const report: DriftReport = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        drifts: filteredDrifts,
        summary: this.generateSummary(filteredDrifts),
        recommendations: this.generateRecommendations(filteredDrifts)
      };

      this.logger.info(`Detected ${report.drifts.length} drifts`);
      
      // Log results
      await memoryBank.log({
        category: IntegrityLogCategory.DRIFT_DETECTION,
        level: report.drifts.length > 0 ? IntegrityLogLevel.WARNING : IntegrityLogLevel.INFO,
        operation: 'detectDrifts',
        component: 'DriftDetector',
        message: `Detected ${report.drifts.length} drifts`,
        details: report.summary,
        duration: Date.now() - startTime,
        success: true,
        correlationId
      });
      
      // Record metrics
      await memoryBank.recordMetric({
        metricType: IntegrityMetricType.DRIFT_CHECK_TIME,
        component: 'DriftDetector',
        name: 'drift_detection_duration',
        value: Date.now() - startTime,
        unit: 'ms'
      });
      
      // Create alerts for critical drifts
      const criticalDrifts = report.drifts.filter(d => d.severity === DriftSeverity.CRITICAL);
      if (criticalDrifts.length > 0) {
        await memoryBank.createAlert({
          alertType: IntegrityAlertType.DRIFT_DETECTED,
          severity: IntegrityAlertSeverity.CRITICAL,
          title: `${criticalDrifts.length} critical schema drifts detected`,
          description: `Critical schema mismatches found that require immediate attention`,
          affectedModels: [...new Set(criticalDrifts.map(d => d.object.split('.')[0]))],
          details: { drifts: criticalDrifts, correlationId }
        });
      }
      
      // Create snapshot if drifts detected
      if (report.drifts.length > 0) {
        const schemaResult = await this.schemaAnalyzer.analyze();
        if (schemaResult.success && schemaResult.data) {
          await memoryBank.createSnapshot(SnapshotType.ON_DEMAND, {
            schemaHash: crypto.createHash('sha256').update(JSON.stringify(schemaResult.data)).digest('hex'),
            modelCount: schemaResult.data.tables.length,
            fieldCount: schemaResult.data.tables.reduce((sum, t) => sum + t.columns.length, 0),
            relationCount: schemaResult.data.relations?.length || 0,
            indexCount: schemaResult.data.indexes?.length || 0,
            enumCount: schemaResult.data.enums?.length || 0,
            validationsPassed: 0,
            validationsFailed: report.drifts.length,
            driftDetected: true,
            driftDetails: report
          });
        }
      }
      
      if (report.drifts.length > 0 && this.config.autoFix) {
        this.logger.warn('Auto-fix is enabled, drifts will be fixed automatically');
      }

      return { success: true, data: report };
    } catch (error) {
      this.logger.error('Failed to detect drifts', error);
      
      // Log error
      await memoryBank.log({
        category: IntegrityLogCategory.DRIFT_DETECTION,
        level: IntegrityLogLevel.ERROR,
        operation: 'detectDrifts',
        component: 'DriftDetector',
        message: 'Failed to detect schema drifts',
        duration: Date.now() - startTime,
        success: false,
        error: error as Error,
        correlationId
      });
      
      return {
        success: false,
        error: {
          code: 'DRIFT_DETECTION_FAILED',
          message: 'Failed to detect schema drifts',
          details: error
        }
      };
    }
  }

  async detectPrismaDrifts(
    prismaSchema: DatabaseSchema,
    dbSchema: DatabaseSchema
  ): Promise<IntegrityResult<DriftReport>> {
    const correlationId = memoryBank.setCorrelationId();
    const startTime = Date.now();
    
    try {
      await memoryBank.log({
        category: IntegrityLogCategory.DRIFT_DETECTION,
        level: IntegrityLogLevel.INFO,
        operation: 'detectPrismaDrifts',
        component: 'DriftDetector',
        message: 'Comparing Prisma schema with database',
        success: true,
        correlationId
      });
      const drifts: Drift[] = [];

      if (!prismaSchema.prismaModels) {
        return {
          success: true,
          data: {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            drifts: [],
            summary: this.generateSummary([]),
            recommendations: []
          }
        };
      }

      // Compare Prisma models with database tables
      for (const model of prismaSchema.prismaModels) {
        const tableName = model.dbName || model.name.toLowerCase();
        const dbTable = dbSchema.tables.find(t => t.name === tableName);

        if (!dbTable) {
          drifts.push({
            id: crypto.randomUUID(),
            type: DriftType.MISSING_TABLE,
            severity: DriftSeverity.CRITICAL,
            object: tableName,
            expected: model,
            actual: null,
            description: `Table '${tableName}' defined in Prisma model '${model.name}' does not exist in database`,
            impact: 'Application will fail when trying to access this table',
            fixable: true,
            fixSql: this.generateCreateTableSQL(model, tableName),
            prismaFix: undefined
          });
          continue;
        }

        // Check fields
        for (const field of model.fields) {
          if (field.relationName) continue; // Skip relation fields

          const column = dbTable.columns.find(c => c.name === field.name);
          
          if (!column) {
            drifts.push({
              id: crypto.randomUUID(),
              type: DriftType.MISSING_COLUMN,
              severity: DriftSeverity.HIGH,
              object: `${tableName}.${field.name}`,
              expected: field,
              actual: null,
              description: `Column '${field.name}' in model '${model.name}' does not exist in table '${tableName}'`,
              impact: 'Queries referencing this field will fail',
              fixable: true,
              fixSql: this.generateAddColumnSQL(tableName, field)
            });
          } else {
            // Check type mismatch
            const expectedType = this.mapPrismaTypeToSQL(field.type);
            const actualType = column.type.toLowerCase();
            
            if (!this.typesMatch(expectedType, actualType)) {
              drifts.push({
                id: crypto.randomUUID(),
                type: DriftType.TYPE_MISMATCH,
                severity: DriftSeverity.HIGH,
                object: `${tableName}.${field.name}`,
                expected: expectedType,
                actual: actualType,
                description: `Type mismatch for column '${field.name}' in table '${tableName}'`,
                impact: 'Data type conversions may fail or cause unexpected behavior',
                fixable: true,
                fixSql: this.generateAlterColumnSQL(tableName, field.name, expectedType)
              });
            }

            // Check nullable mismatch
            if (field.isRequired !== !column.nullable) {
              drifts.push({
                id: crypto.randomUUID(),
                type: DriftType.CONSTRAINT_MISMATCH,
                severity: DriftSeverity.MEDIUM,
                object: `${tableName}.${field.name}`,
                expected: field.isRequired ? 'NOT NULL' : 'NULL',
                actual: column.nullable ? 'NULL' : 'NOT NULL',
                description: `Nullable constraint mismatch for column '${field.name}' in table '${tableName}'`,
                impact: 'May cause constraint violations',
                fixable: true,
                fixSql: this.generateAlterNullableSQL(tableName, field.name, field.isRequired)
              });
            }
          }
        }

        // Check for extra columns in database
        for (const column of dbTable.columns) {
          const field = model.fields.find(f => f.name === column.name);
          
          if (!field) {
            drifts.push({
              id: crypto.randomUUID(),
              type: DriftType.SCHEMA_MISMATCH,
              severity: DriftSeverity.LOW,
              object: `${tableName}.${column.name}`,
              expected: null,
              actual: column,
              description: `Column '${column.name}' exists in database but not in Prisma model '${model.name}'`,
              impact: 'Column is not accessible through Prisma client',
              fixable: false,
              prismaFix: `Add field '${column.name}' to model '${model.name}'`
            });
          }
        }
      }

      // Check enums
      if (prismaSchema.enums && dbSchema.enums) {
        for (const prismaEnum of prismaSchema.enums) {
          const dbEnum = dbSchema.enums.find(e => e.name === prismaEnum.name);
          
          if (!dbEnum) {
            drifts.push({
              id: crypto.randomUUID(),
              type: DriftType.ENUM_MISMATCH,
              severity: DriftSeverity.MEDIUM,
              object: prismaEnum.name,
              expected: prismaEnum,
              actual: null,
              description: `Enum '${prismaEnum.name}' defined in Prisma schema does not exist in database`,
              impact: 'Enum values cannot be used',
              fixable: true,
              fixSql: this.generateCreateEnumSQL(prismaEnum)
            });
          } else {
            // Check enum values
            const missingValues = prismaEnum.values.filter(v => !dbEnum.values.includes(v));
            const extraValues = dbEnum.values.filter(v => !prismaEnum.values.includes(v));
            
            if (missingValues.length > 0 || extraValues.length > 0) {
              drifts.push({
                id: crypto.randomUUID(),
                type: DriftType.ENUM_MISMATCH,
                severity: DriftSeverity.MEDIUM,
                object: prismaEnum.name,
                expected: prismaEnum.values,
                actual: dbEnum.values,
                description: `Enum '${prismaEnum.name}' values mismatch`,
                impact: 'Some enum values may not be available',
                fixable: missingValues.length > 0,
                fixSql: missingValues.length > 0 
                  ? this.generateAlterEnumSQL(prismaEnum.name, missingValues)
                  : undefined,
                prismaFix: extraValues.length > 0
                  ? `Remove values [${extraValues.join(', ')}] from database or add to Prisma schema`
                  : undefined
              });
            }
          }
        }
      }

      const report: DriftReport = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        drifts,
        summary: this.generateSummary(drifts),
        recommendations: this.generateRecommendations(drifts)
      };

      // Log results
      await memoryBank.log({
        category: IntegrityLogCategory.DRIFT_DETECTION,
        level: report.drifts.length > 0 ? IntegrityLogLevel.WARNING : IntegrityLogLevel.INFO,
        operation: 'detectPrismaDrifts',
        component: 'DriftDetector',
        message: `Detected ${report.drifts.length} Prisma schema drifts`,
        details: report.summary,
        metadata: { prismaModels: prismaSchema.prismaModels?.length, dbTables: dbSchema.tables.length },
        duration: Date.now() - startTime,
        success: true,
        correlationId
      });
      
      return { success: true, data: report };
    } catch (error) {
      await memoryBank.log({
        category: IntegrityLogCategory.DRIFT_DETECTION,
        level: IntegrityLogLevel.ERROR,
        operation: 'detectPrismaDrifts',
        component: 'DriftDetector',
        message: 'Failed to detect Prisma schema drifts',
        duration: Date.now() - startTime,
        success: false,
        error: error as Error,
        correlationId
      });
      
      return {
        success: false,
        error: {
          code: 'PRISMA_DRIFT_DETECTION_FAILED',
          message: 'Failed to detect Prisma schema drifts',
          details: error
        }
      };
    }
  }

  private async detectManualChanges(schema: DatabaseSchema): Promise<Drift[]> {
    const drifts: Drift[] = [];
    
    // Check for tables created outside migrations
    const sql = `
      SELECT 
        schemaname,
        tablename,
        tableowner
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        AND tablename NOT IN (
          SELECT DISTINCT table_name 
          FROM _migration_history 
          WHERE metadata->>'created_tables' IS NOT NULL
        )
      ORDER BY schemaname, tablename
    `;

    try {
      const unmanagedTables = await this.connection.queryMany<any>(sql);
      
      for (const table of unmanagedTables) {
        drifts.push({
          id: crypto.randomUUID(),
          type: DriftType.MANUAL_CHANGE,
          severity: DriftSeverity.HIGH,
          object: `${table.schemaname}.${table.tablename}`,
          expected: null,
          actual: table,
          description: `Table '${table.tablename}' was created outside of migration system`,
          impact: 'Table changes are not tracked and may be lost',
          fixable: true,
          fixSql: `-- Add migration to track table ${table.tablename}`
        });
      }
    } catch (error) {
      this.logger.warn('Failed to detect manual table changes', error);
    }

    return drifts;
  }

  private async detectMissingMigrations(): Promise<Drift[]> {
    const drifts: Drift[] = [];
    
    // This would check for migrations that should have been run but weren't
    // Implementation depends on your specific migration tracking
    
    return drifts;
  }

  private applyIgnorePatterns(drifts: Drift[]): Drift[] {
    if (!this.config.ignorePatterns || this.config.ignorePatterns.length === 0) {
      return drifts;
    }

    return drifts.filter(drift => {
      return !this.config.ignorePatterns!.some(pattern => {
        const regex = new RegExp(pattern);
        return regex.test(drift.object);
      });
    });
  }

  private generateSummary(drifts: Drift[]): any {
    const summary = {
      totalDrifts: drifts.length,
      bySeverity: {
        [DriftSeverity.LOW]: 0,
        [DriftSeverity.MEDIUM]: 0,
        [DriftSeverity.HIGH]: 0,
        [DriftSeverity.CRITICAL]: 0
      },
      byType: {} as Record<DriftType, number>,
      fixable: 0,
      requiresManualIntervention: 0
    };

    for (const drift of drifts) {
      summary.bySeverity[drift.severity]++;
      summary.byType[drift.type] = (summary.byType[drift.type] || 0) + 1;
      if (drift.fixable) {
        summary.fixable++;
      } else {
        summary.requiresManualIntervention++;
      }
    }

    return summary;
  }

  private generateRecommendations(drifts: Drift[]): any[] {
    const recommendations: any[] = [];

    // Critical drifts
    const criticalDrifts = drifts.filter(d => d.severity === DriftSeverity.CRITICAL);
    if (criticalDrifts.length > 0) {
      recommendations.push({
        priority: 1,
        action: 'Fix critical schema mismatches immediately',
        reason: 'Critical drifts can cause application failures',
        commands: ['npm run db:drift -- --fix']
      });
    }

    // High severity drifts
    const highDrifts = drifts.filter(d => d.severity === DriftSeverity.HIGH);
    if (highDrifts.length > 0) {
      recommendations.push({
        priority: 2,
        action: 'Review and fix high severity drifts',
        reason: 'These drifts may cause query failures or data inconsistencies',
        commands: ['npm run db:migrate']
      });
    }

    // Manual changes
    const manualChanges = drifts.filter(d => d.type === DriftType.MANUAL_CHANGE);
    if (manualChanges.length > 0) {
      recommendations.push({
        priority: 3,
        action: 'Create migrations for manual database changes',
        reason: 'Manual changes should be tracked in version control',
        commands: ['npx prisma migrate dev --create-only']
      });
    }

    return recommendations;
  }

  private mapPrismaTypeToSQL(prismaType: string): string {
    const typeMap: Record<string, string> = {
      'String': 'text',
      'Int': 'integer',
      'BigInt': 'bigint',
      'Float': 'double precision',
      'Decimal': 'decimal',
      'Boolean': 'boolean',
      'DateTime': 'timestamp(3)',
      'Json': 'jsonb',
      'Bytes': 'bytea'
    };
    
    return typeMap[prismaType] || prismaType.toLowerCase();
  }

  private typesMatch(expected: string, actual: string): boolean {
    // Normalize types
    expected = expected.toLowerCase();
    actual = actual.toLowerCase();
    
    // Direct match
    if (expected === actual) return true;
    
    // Common equivalences
    const equivalences: Record<string, string[]> = {
      'text': ['text', 'varchar', 'character varying'],
      'integer': ['integer', 'int', 'int4'],
      'bigint': ['bigint', 'int8'],
      'double precision': ['double precision', 'float8', 'real'],
      'boolean': ['boolean', 'bool'],
      'timestamp': ['timestamp', 'timestamp without time zone', 'timestamp(3)'],
      'jsonb': ['jsonb', 'json']
    };
    
    for (const [key, values] of Object.entries(equivalences)) {
      if (values.includes(expected) && values.includes(actual)) {
        return true;
      }
    }
    
    return false;
  }

  private generateCreateTableSQL(model: PrismaModel, tableName: string): string {
    const columns = model.fields
      .filter(f => !f.relationName)
      .map(f => {
        const type = this.mapPrismaTypeToSQL(f.type);
        const nullable = f.isRequired ? 'NOT NULL' : '';
        const primaryKey = f.isId ? 'PRIMARY KEY' : '';
        const unique = f.isUnique && !f.isId ? 'UNIQUE' : '';
        const defaultValue = f.hasDefaultValue && f.default 
          ? `DEFAULT ${this.formatDefaultValue(f.default)}` 
          : '';
        
        return `  ${f.name} ${type} ${nullable} ${primaryKey} ${unique} ${defaultValue}`.trim();
      });
    
    return `CREATE TABLE ${tableName} (\n${columns.join(',\n')}\n);`;
  }

  private generateAddColumnSQL(tableName: string, field: any): string {
    const type = this.mapPrismaTypeToSQL(field.type);
    const nullable = field.isRequired ? 'NOT NULL' : '';
    const defaultValue = field.hasDefaultValue && field.default 
      ? `DEFAULT ${this.formatDefaultValue(field.default)}` 
      : '';
    
    return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${type} ${nullable} ${defaultValue};`;
  }

  private generateAlterColumnSQL(tableName: string, columnName: string, newType: string): string {
    return `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${newType};`;
  }

  private generateAlterNullableSQL(tableName: string, columnName: string, required: boolean): string {
    if (required) {
      return `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`;
    } else {
      return `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} DROP NOT NULL;`;
    }
  }

  private generateCreateEnumSQL(enumDef: any): string {
    const values = enumDef.values.map((v: string) => `'${v}'`).join(', ');
    return `CREATE TYPE ${enumDef.name} AS ENUM (${values});`;
  }

  private generateAlterEnumSQL(enumName: string, newValues: string[]): string {
    const statements = newValues.map(value => 
      `ALTER TYPE ${enumName} ADD VALUE '${value}';`
    );
    return statements.join('\n');
  }

  private formatDefaultValue(value: any): string {
    if (value === 'CURRENT_TIMESTAMP' || value === 'now()') {
      return 'CURRENT_TIMESTAMP';
    }
    if (value === 'cuid' || value === 'uuid') {
      return `gen_random_uuid()`;
    }
    if (value === 'autoincrement') {
      return ''; // Handled by SERIAL type
    }
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    return String(value);
  }
}