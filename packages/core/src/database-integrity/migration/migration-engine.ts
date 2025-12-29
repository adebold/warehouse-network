/**
 * Migration Engine
 * Handles database migrations with Prisma integration
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { IntegrityLogCategory, IntegrityLogLevel, IntegrityMetricType, IntegrityAlertType, IntegrityAlertSeverity } from '@warehouse-network/db';
import winston from 'winston';

import { DatabaseConnection } from '../core/database-connection';
import { memoryBank } from '../memory-bank/memory-bank';
import {
  Migration,
  MigrationConfig,
  MigrationStatus,
  MigrationOptions,
  IntegrityResult,
  MigrationType
} from '../types';

export class MigrationEngine {
  private connection: DatabaseConnection;
  private config: MigrationConfig;
  private logger: winston.Logger;
  private isInitialized = false;

  constructor(connection: DatabaseConnection, config: MigrationConfig) {
    this.connection = connection;
    this.config = config;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async initialize(): Promise<IntegrityResult<void>> {
    try {
      // Create migration tracking table if it doesn't exist
      await this.createMigrationTable();
      this.isInitialized = true;
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to initialize migration engine', error);
      return {
        success: false,
        error: {
          code: 'MIGRATION_INIT_FAILED',
          message: 'Failed to initialize migration engine',
          details: error
        }
      };
    }
  }

  private async createMigrationTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
        id VARCHAR(255) PRIMARY KEY,
        version VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        execution_time INTEGER,
        status VARCHAR(50) NOT NULL,
        error TEXT,
        metadata JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_version 
        ON ${this.config.tableName}(version);
      
      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_status 
        ON ${this.config.tableName}(status);
    `;

    await this.connection.query(sql);
  }

  async getMigrationStatus(): Promise<IntegrityResult<Migration[]>> {
    try {
      const sql = `
        SELECT * FROM ${this.config.tableName}
        ORDER BY version, executed_at
      `;
      
      const rows = await this.connection.queryMany<any>(sql);
      
      const migrations: Migration[] = rows.map(row => ({
        id: row.id,
        version: row.version,
        name: row.name,
        description: row.description,
        type: row.type as MigrationType,
        checksum: row.checksum,
        createdAt: row.executed_at,
        executedAt: row.executed_at,
        executionTime: row.execution_time,
        status: row.status as MigrationStatus,
        error: row.error,
        metadata: row.metadata
      }));

      return { success: true, data: migrations };
    } catch (error) {
      this.logger.error('Failed to get migration status', error);
      return {
        success: false,
        error: {
          code: 'MIGRATION_STATUS_FAILED',
          message: 'Failed to get migration status',
          details: error
        }
      };
    }
  }

  async runMigrations(options?: MigrationOptions): Promise<IntegrityResult<Migration[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const correlationId = memoryBank.setCorrelationId();
    const startTime = Date.now();

    try {
      await memoryBank.log({
        category: IntegrityLogCategory.MIGRATION,
        level: IntegrityLogLevel.INFO,
        operation: 'runMigrations',
        component: 'MigrationEngine',
        message: 'Starting migration run',
        metadata: { dryRun: options?.dryRun, batchSize: options?.batchSize },
        success: true,
        correlationId
      });
      // Get pending migrations
      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        this.logger.info('No pending migrations');
        return { success: true, data: [] };
      }

      if (options?.dryRun) {
        this.logger.info(`Would run ${pendingMigrations.length} migrations (dry run)`);
        return { success: true, data: pendingMigrations };
      }

      const executedMigrations: Migration[] = [];
      const batchSize = options?.batchSize || pendingMigrations.length;

      for (let i = 0; i < pendingMigrations.length && i < batchSize; i++) {
        const migration = pendingMigrations[i];
        
        try {
          const result = await this.executeMigration(migration, options);
          if (result.success && result.data) {
            executedMigrations.push(result.data);
          } else {
            // Stop on first failure
            break;
          }
        } catch (error) {
          this.logger.error(`Migration ${migration.id} failed`, error);
          
          if (!options?.force) {
            break;
          }
        }
      }

      await memoryBank.log({
        category: IntegrityLogCategory.MIGRATION,
        level: executedMigrations.length > 0 ? IntegrityLogLevel.INFO : IntegrityLogLevel.DEBUG,
        operation: 'runMigrations',
        component: 'MigrationEngine',
        message: `Completed ${executedMigrations.length} migrations`,
        details: {
          totalExecuted: executedMigrations.length,
          migrations: executedMigrations.map(m => ({ id: m.id, version: m.version, status: m.status }))
        },
        duration: Date.now() - startTime,
        success: true,
        correlationId
      });
      
      return { success: true, data: executedMigrations };
    } catch (error) {
      this.logger.error('Failed to run migrations', error);
      
      await memoryBank.log({
        category: IntegrityLogCategory.MIGRATION,
        level: IntegrityLogLevel.ERROR,
        operation: 'runMigrations',
        component: 'MigrationEngine',
        message: 'Failed to run migrations',
        duration: Date.now() - startTime,
        success: false,
        error: error as Error,
        correlationId
      });
      
      return {
        success: false,
        error: {
          code: 'MIGRATIONS_FAILED',
          message: 'Failed to run migrations',
          details: error
        }
      };
    }
  }

  async rollbackMigrations(
    target?: string,
    options?: MigrationOptions
  ): Promise<IntegrityResult<Migration[]>> {
    try {
      // Get migrations to rollback
      const migrationsToRollback = await this.getMigrationsToRollback(target);
      
      if (migrationsToRollback.length === 0) {
        this.logger.info('No migrations to rollback');
        return { success: true, data: [] };
      }

      if (options?.dryRun) {
        this.logger.info(`Would rollback ${migrationsToRollback.length} migrations (dry run)`);
        return { success: true, data: migrationsToRollback };
      }

      const rolledBackMigrations: Migration[] = [];

      for (const migration of migrationsToRollback) {
        try {
          const result = await this.rollbackMigration(migration, options);
          if (result.success && result.data) {
            rolledBackMigrations.push(result.data);
          } else {
            // Stop on first failure
            break;
          }
        } catch (error) {
          this.logger.error(`Rollback of ${migration.id} failed`, error);
          
          if (!options?.force) {
            break;
          }
        }
      }

      return { success: true, data: rolledBackMigrations };
    } catch (error) {
      this.logger.error('Failed to rollback migrations', error);
      return {
        success: false,
        error: {
          code: 'ROLLBACK_FAILED',
          message: 'Failed to rollback migrations',
          details: error
        }
      };
    }
  }

  private async getPendingMigrations(): Promise<Migration[]> {
    // Load migrations from directory
    const allMigrations = await this.loadMigrationsFromDirectory();
    
    // Get executed migrations
    const executedResult = await this.getMigrationStatus();
    const executedMigrations = executedResult.success ? executedResult.data! : [];
    const executedIds = new Set(executedMigrations.map(m => m.id));
    
    // Filter pending migrations
    return allMigrations.filter(m => !executedIds.has(m.id));
  }

  private async loadMigrationsFromDirectory(): Promise<Migration[]> {
    try {
      const migrations: Migration[] = [];
      const files = await fs.readdir(this.config.migrationsDir);
      
      for (const file of files) {
        if (!file.endsWith('.sql') && !file.endsWith('.js') && !file.endsWith('.ts')) {
          continue;
        }
        
        const filePath = path.join(this.config.migrationsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const metadata = this.extractMigrationMetadata(content);
        
        const migration: Migration = {
          id: metadata.id || path.basename(file, path.extname(file)),
          version: metadata.version || this.extractVersionFromFilename(file),
          name: metadata.name || file,
          description: metadata.description,
          type: metadata.type || MigrationType.SCHEMA,
          sql: content,
          checksum: this.calculateChecksum(content),
          createdAt: new Date(),
          status: MigrationStatus.PENDING,
          metadata: metadata
        };
        
        migrations.push(migration);
      }
      
      // Sort by version
      migrations.sort((a, b) => a.version.localeCompare(b.version));
      
      return migrations;
    } catch (error) {
      this.logger.error('Failed to load migrations from directory', error);
      return [];
    }
  }

  private extractMigrationMetadata(content: string): any {
    const metadata: any = {};
    
    // Extract metadata from SQL comments
    const metadataRegex = /--\s*@(\w+):\s*(.+)$/gm;
    let match;
    
    while ((match = metadataRegex.exec(content)) !== null) {
      metadata[match[1]] = match[2].trim();
    }
    
    return metadata;
  }

  private extractVersionFromFilename(filename: string): string {
    // Extract version from filename patterns like:
    // 001_initial.sql, V1__initial.sql, 20231225120000_initial.sql
    const versionMatch = filename.match(/^(\d+|V\d+|[\d_]+)_/);
    return versionMatch ? versionMatch[1] : filename;
  }

  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async executeMigration(
    migration: Migration,
    options?: MigrationOptions
  ): Promise<IntegrityResult<Migration>> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Executing migration: ${migration.name}`);
      
      await memoryBank.log({
        category: IntegrityLogCategory.MIGRATION,
        level: IntegrityLogLevel.INFO,
        operation: 'executeMigration',
        component: 'MigrationEngine',
        message: `Executing migration: ${migration.name}`,
        metadata: { migrationId: migration.id, version: migration.version, type: migration.type },
        success: true,
        correlationId: memoryBank.correlationId
      });
      
      // Validate checksum
      if (this.config.validateChecksums) {
        const isValid = await this.validateMigrationChecksum(migration);
        if (!isValid) {
          throw new Error('Migration checksum validation failed');
        }
      }
      
      // Execute migration
      if (this.config.transactional) {
        await this.connection.transaction(async (client) => {
          if (migration.sql) {
            await client.query(migration.sql);
          }
          
          // Record migration
          await this.recordMigration(migration, MigrationStatus.COMPLETED, Date.now() - startTime);
        });
      } else {
        if (migration.sql) {
          await this.connection.query(migration.sql);
        }
        
        await this.recordMigration(migration, MigrationStatus.COMPLETED, Date.now() - startTime);
      }
      
      migration.status = MigrationStatus.COMPLETED;
      migration.executedAt = new Date();
      migration.executionTime = Date.now() - startTime;
      
      this.logger.info(`Migration ${migration.name} completed in ${migration.executionTime}ms`);
      
      await memoryBank.log({
        category: IntegrityLogCategory.MIGRATION,
        level: IntegrityLogLevel.INFO,
        operation: 'executeMigration',
        component: 'MigrationEngine',
        message: `Migration ${migration.name} completed successfully`,
        details: { migrationId: migration.id, version: migration.version },
        duration: migration.executionTime,
        success: true,
        correlationId: memoryBank.correlationId
      });
      
      await memoryBank.recordMetric({
        metricType: IntegrityMetricType.MIGRATION_TIME,
        component: 'MigrationEngine',
        name: 'migration_execution_time',
        value: migration.executionTime || 0,
        unit: 'ms',
        tags: { migrationId: migration.id, version: migration.version }
      });
      
      return { success: true, data: migration };
    } catch (error) {
      this.logger.error(`Migration ${migration.name} failed`, error);
      
      // Record failure
      await this.recordMigration(
        migration, 
        MigrationStatus.FAILED, 
        Date.now() - startTime,
        error instanceof Error ? error.message : String(error)
      );
      
      await memoryBank.log({
        category: IntegrityLogCategory.MIGRATION,
        level: IntegrityLogLevel.ERROR,
        operation: 'executeMigration',
        component: 'MigrationEngine',
        message: `Migration ${migration.name} failed`,
        details: { migrationId: migration.id, version: migration.version },
        duration: Date.now() - startTime,
        success: false,
        error: error as Error,
        correlationId: memoryBank.correlationId
      });
      
      await memoryBank.createAlert({
        alertType: IntegrityAlertType.MIGRATION_ERROR,
        severity: IntegrityAlertSeverity.HIGH,
        title: `Migration failed: ${migration.name}`,
        description: `Migration ${migration.id} (${migration.version}) failed during execution`,
        details: {
          migrationId: migration.id,
          error: error instanceof Error ? error.message : String(error),
          correlationId: memoryBank.correlationId
        }
      });
      
      return {
        success: false,
        error: {
          code: 'MIGRATION_EXECUTION_FAILED',
          message: `Migration ${migration.name} failed`,
          details: error
        }
      };
    }
  }

  private async rollbackMigration(
    migration: Migration,
    options?: MigrationOptions
  ): Promise<IntegrityResult<Migration>> {
    try {
      this.logger.info(`Rolling back migration: ${migration.name}`);
      
      if (!migration.rollbackSql) {
        throw new Error('No rollback SQL available for migration');
      }
      
      // Execute rollback
      if (this.config.transactional) {
        await this.connection.transaction(async (client) => {
          await client.query(migration.rollbackSql!);
          
          // Update migration status
          await this.updateMigrationStatus(migration.id, MigrationStatus.ROLLED_BACK);
        });
      } else {
        await this.connection.query(migration.rollbackSql);
        await this.updateMigrationStatus(migration.id, MigrationStatus.ROLLED_BACK);
      }
      
      migration.status = MigrationStatus.ROLLED_BACK;
      
      this.logger.info(`Migration ${migration.name} rolled back successfully`);
      
      return { success: true, data: migration };
    } catch (error) {
      this.logger.error(`Rollback of ${migration.name} failed`, error);
      
      return {
        success: false,
        error: {
          code: 'ROLLBACK_EXECUTION_FAILED',
          message: `Rollback of ${migration.name} failed`,
          details: error
        }
      };
    }
  }

  private async validateMigrationChecksum(migration: Migration): Promise<boolean> {
    const sql = `
      SELECT checksum FROM ${this.config.tableName}
      WHERE id = $1
    `;
    
    const result = await this.connection.queryOne<{ checksum: string }>(sql, [migration.id]);
    
    if (!result) {
      // Migration not yet recorded, checksum is valid
      return true;
    }
    
    return result.checksum === migration.checksum;
  }

  private async recordMigration(
    migration: Migration,
    status: MigrationStatus,
    executionTime: number,
    error?: string
  ): Promise<void> {
    const sql = `
      INSERT INTO ${this.config.tableName} (
        id, version, name, description, type, checksum, 
        execution_time, status, error, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        status = $8,
        execution_time = $7,
        error = $9,
        executed_at = CURRENT_TIMESTAMP
    `;
    
    const params = [
      migration.id,
      migration.version,
      migration.name,
      migration.description,
      migration.type,
      migration.checksum,
      executionTime,
      status,
      error,
      JSON.stringify(migration.metadata || {})
    ];
    
    await this.connection.query(sql, params);
  }

  private async updateMigrationStatus(id: string, status: MigrationStatus): Promise<void> {
    const sql = `
      UPDATE ${this.config.tableName}
      SET status = $2, executed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    
    await this.connection.query(sql, [id, status]);
  }

  private async getMigrationsToRollback(target?: string): Promise<Migration[]> {
    let sql = `
      SELECT * FROM ${this.config.tableName}
      WHERE status = $1
    `;
    const params: any[] = [MigrationStatus.COMPLETED];
    
    if (target) {
      sql += ' AND version > $2';
      params.push(target);
    }
    
    sql += ' ORDER BY version DESC';
    
    const rows = await this.connection.queryMany<any>(sql, params);
    
    return rows.map(row => ({
      id: row.id,
      version: row.version,
      name: row.name,
      description: row.description,
      type: row.type as MigrationType,
      checksum: row.checksum,
      createdAt: row.executed_at,
      executedAt: row.executed_at,
      executionTime: row.execution_time,
      status: row.status as MigrationStatus,
      error: row.error,
      metadata: row.metadata
    }));
  }
}