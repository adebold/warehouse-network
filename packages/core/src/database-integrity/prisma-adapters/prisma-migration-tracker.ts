/**
 * Prisma Migration Tracker
 * Tracks Prisma migrations and syncs with our migration system
 */

import crypto from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

import winston from 'winston';

import { DatabaseConnection } from '../core/database-connection';
import { MigrationEngine } from '../migration/migration-engine';
import {
  PrismaConfig,
  Migration,
  MigrationType,
  MigrationStatus,
  IntegrityResult
} from '../types';




interface PrismaMigration {
  id: string;
  checksum: string;
  finished_at?: Date;
  migration_name: string;
  logs?: string;
  rolled_back_at?: Date;
  started_at: Date;
  applied_steps_count: number;
}

export class PrismaMigrationTracker {
  private connection: DatabaseConnection;
  private config: PrismaConfig;
  private migrationEngine: MigrationEngine;
  private logger: winston.Logger;

  constructor(
    connection: DatabaseConnection,
    config: PrismaConfig,
    migrationEngine: MigrationEngine
  ) {
    this.connection = connection;
    this.config = config;
    this.migrationEngine = migrationEngine;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  /**
   * Sync Prisma migrations with our tracking system
   */
  async syncPrismaMigrations(): Promise<IntegrityResult<void>> {
    try {
      this.logger.info('Syncing Prisma migrations');

      // Check if Prisma migrations table exists
      const hasPrismaTable = await this.checkPrismaMigrationsTable();
      if (!hasPrismaTable) {
        this.logger.info('No Prisma migrations table found');
        return { success: true };
      }

      // Get Prisma migrations from database
      const prismaMigrations = await this.getPrismaMigrationsFromDB();
      
      // Get Prisma migrations from filesystem
      const fsMigrations = await this.getPrismaMigrationsFromFS();
      
      // Sync migrations
      await this.syncMigrations(prismaMigrations, fsMigrations);

      this.logger.info('Prisma migrations synced successfully');
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to sync Prisma migrations', error);
      return {
        success: false,
        error: {
          code: 'PRISMA_SYNC_FAILED',
          message: 'Failed to sync Prisma migrations',
          details: error
        }
      };
    }
  }

  /**
   * Get Prisma migrations
   */
  async getPrismaMigrations(): Promise<IntegrityResult<Migration[]>> {
    try {
      const migrations: Migration[] = [];

      // Get from database
      const dbMigrations = await this.getPrismaMigrationsFromDB();
      
      // Get from filesystem
      const fsMigrations = await this.getPrismaMigrationsFromFS();
      
      // Merge and convert to our format
      const migrationMap = new Map<string, Migration>();

      // Add database migrations
      for (const dbMig of dbMigrations) {
        const migration = this.convertPrismaMigration(dbMig);
        migrationMap.set(migration.id, migration);
      }

      // Merge with filesystem migrations
      for (const fsMig of fsMigrations) {
        if (migrationMap.has(fsMig.id)) {
          // Update with filesystem data
          const existing = migrationMap.get(fsMig.id)!;
          existing.sql = fsMig.sql;
          existing.rollbackSql = fsMig.rollbackSql;
        } else {
          migrationMap.set(fsMig.id, fsMig);
        }
      }

      migrations.push(...Array.from(migrationMap.values()));
      migrations.sort((a, b) => a.version.localeCompare(b.version));

      return { success: true, data: migrations };
    } catch (error) {
      this.logger.error('Failed to get Prisma migrations', error);
      return {
        success: false,
        error: {
          code: 'PRISMA_MIGRATIONS_FAILED',
          message: 'Failed to get Prisma migrations',
          details: error
        }
      };
    }
  }

  /**
   * Check if Prisma migrations table exists
   */
  private async checkPrismaMigrationsTable(): Promise<boolean> {
    const sql = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '_prisma_migrations'
      )
    `;
    
    const result = await this.connection.queryOne<{ exists: boolean }>(sql);
    return result?.exists || false;
  }

  /**
   * Get Prisma migrations from database
   */
  private async getPrismaMigrationsFromDB(): Promise<PrismaMigration[]> {
    const sql = `
      SELECT 
        id,
        checksum,
        finished_at,
        migration_name,
        logs,
        rolled_back_at,
        started_at,
        applied_steps_count
      FROM _prisma_migrations
      ORDER BY id
    `;

    try {
      const rows = await this.connection.queryMany<PrismaMigration>(sql);
      return rows;
    } catch (error) {
      this.logger.warn('Failed to query Prisma migrations table', error);
      return [];
    }
  }

  /**
   * Get Prisma migrations from filesystem
   */
  private async getPrismaMigrationsFromFS(): Promise<Migration[]> {
    const migrations: Migration[] = [];

    if (!existsSync(this.config.migrationsDir)) {
      this.logger.warn(`Migrations directory not found: ${this.config.migrationsDir}`);
      return migrations;
    }

    const migrationDirs = readdirSync(this.config.migrationsDir)
      .filter(dir => /^\d{14}_/.test(dir))
      .sort();

    for (const dir of migrationDirs) {
      const migrationPath = path.join(this.config.migrationsDir, dir);
      const migrationSqlPath = path.join(migrationPath, 'migration.sql');

      if (!existsSync(migrationSqlPath)) {
        continue;
      }

      const sql = readFileSync(migrationSqlPath, 'utf8');
      const id = dir;
      const version = dir.split('_')[0];
      const name = dir.split('_').slice(1).join('_');

      const migration: Migration = {
        id,
        version,
        name,
        type: MigrationType.PRISMA,
        sql,
        checksum: this.calculateChecksum(sql),
        createdAt: new Date(),
        status: MigrationStatus.PENDING,
        metadata: {
          source: 'prisma',
          directory: dir
        }
      };

      // Check for down migration
      const downMigrationPath = path.join(migrationPath, 'down.sql');
      if (existsSync(downMigrationPath)) {
        migration.rollbackSql = readFileSync(downMigrationPath, 'utf8');
      }

      migrations.push(migration);
    }

    return migrations;
  }

  /**
   * Convert Prisma migration to our format
   */
  private convertPrismaMigration(prismaMig: PrismaMigration): Migration {
    return {
      id: prismaMig.id,
      version: prismaMig.id.split('_')[0],
      name: prismaMig.migration_name,
      type: MigrationType.PRISMA,
      checksum: prismaMig.checksum,
      createdAt: prismaMig.started_at,
      executedAt: prismaMig.finished_at,
      executionTime: prismaMig.finished_at && prismaMig.started_at
        ? new Date(prismaMig.finished_at).getTime() - new Date(prismaMig.started_at).getTime()
        : undefined,
      status: prismaMig.rolled_back_at
        ? MigrationStatus.ROLLED_BACK
        : prismaMig.finished_at
        ? MigrationStatus.COMPLETED
        : MigrationStatus.FAILED,
      error: prismaMig.logs,
      metadata: {
        source: 'prisma',
        appliedStepsCount: prismaMig.applied_steps_count
      }
    };
  }

  /**
   * Sync migrations between Prisma and our system
   */
  private async syncMigrations(
    prismaMigrations: PrismaMigration[],
    fsMigrations: Migration[]
  ): Promise<void> {
    // Get our tracked migrations
    const trackedResult = await this.migrationEngine.getMigrationStatus();
    const trackedMigrations = trackedResult.success ? trackedResult.data! : [];
    const trackedIds = new Set(trackedMigrations.map(m => m.id));

    // Sync Prisma database migrations to our tracking
    for (const prismaMig of prismaMigrations) {
      if (!trackedIds.has(prismaMig.id)) {
        const migration = this.convertPrismaMigration(prismaMig);
        
        // Find corresponding filesystem migration for SQL content
        const fsMig = fsMigrations.find(m => m.id === prismaMig.id);
        if (fsMig) {
          migration.sql = fsMig.sql;
          migration.rollbackSql = fsMig.rollbackSql;
        }

        // Record in our tracking system
        await this.recordPrismaMigration(migration);
      }
    }

    // Check for filesystem migrations not in Prisma database
    const prismaIds = new Set(prismaMigrations.map(m => m.id));
    for (const fsMig of fsMigrations) {
      if (!prismaIds.has(fsMig.id) && !trackedIds.has(fsMig.id)) {
        // This is a pending migration
        await this.recordPrismaMigration(fsMig);
      }
    }
  }

  /**
   * Record Prisma migration in our tracking system
   */
  private async recordPrismaMigration(migration: Migration): Promise<void> {
    const sql = `
      INSERT INTO ${this.migrationEngine['config'].tableName} (
        id, version, name, description, type, checksum, 
        executed_at, execution_time, status, error, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        status = $9,
        execution_time = $8,
        error = $10,
        metadata = $11
    `;

    const params = [
      migration.id,
      migration.version,
      migration.name,
      migration.description || `Prisma migration: ${migration.name}`,
      migration.type,
      migration.checksum,
      migration.executedAt || migration.createdAt,
      migration.executionTime || 0,
      migration.status,
      migration.error,
      JSON.stringify(migration.metadata || {})
    ];

    await this.connection.query(sql, params);
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get Prisma migration history
   */
  async getMigrationHistory(): Promise<IntegrityResult<any[]>> {
    try {
      const sql = `
        SELECT 
          m.id,
          m.migration_name,
          m.started_at,
          m.finished_at,
          m.applied_steps_count,
          CASE 
            WHEN m.rolled_back_at IS NOT NULL THEN 'rolled_back'
            WHEN m.finished_at IS NOT NULL THEN 'applied'
            ELSE 'failed'
          END as status,
          t.status as tracked_status
        FROM _prisma_migrations m
        LEFT JOIN ${this.migrationEngine['config'].tableName} t ON t.id = m.id
        ORDER BY m.id DESC
      `;

      const history = await this.connection.queryMany(sql);
      return { success: true, data: history };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HISTORY_FAILED',
          message: 'Failed to get migration history',
          details: error
        }
      };
    }
  }

  /**
   * Validate Prisma migrations
   */
  async validatePrismaMigrations(): Promise<IntegrityResult<any>> {
    try {
      const issues: any[] = [];

      // Check for migrations in DB but not in filesystem
      const dbMigrations = await this.getPrismaMigrationsFromDB();
      const fsMigrations = await this.getPrismaMigrationsFromFS();
      
      const fsIds = new Set(fsMigrations.map(m => m.id));
      const dbIds = new Set(dbMigrations.map(m => m.id));

      for (const dbMig of dbMigrations) {
        if (!fsIds.has(dbMig.id)) {
          issues.push({
            type: 'missing_files',
            migration: dbMig.id,
            message: `Migration ${dbMig.id} exists in database but not in filesystem`
          });
        }
      }

      // Check for migrations in filesystem but not applied
      for (const fsMig of fsMigrations) {
        if (!dbIds.has(fsMig.id)) {
          issues.push({
            type: 'unapplied',
            migration: fsMig.id,
            message: `Migration ${fsMig.id} exists in filesystem but not applied`
          });
        }
      }

      // Check checksums
      for (const dbMig of dbMigrations) {
        const fsMig = fsMigrations.find(m => m.id === dbMig.id);
        if (fsMig && fsMig.checksum !== dbMig.checksum) {
          issues.push({
            type: 'checksum_mismatch',
            migration: dbMig.id,
            message: `Checksum mismatch for migration ${dbMig.id}`,
            expected: dbMig.checksum,
            actual: fsMig.checksum
          });
        }
      }

      return {
        success: true,
        data: {
          valid: issues.length === 0,
          issues
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Failed to validate Prisma migrations',
          details: error
        }
      };
    }
  }
}