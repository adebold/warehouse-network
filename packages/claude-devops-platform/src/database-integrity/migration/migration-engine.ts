/**
 * Migration Engine
 * Core migration tracking and execution system with version control integration
 */

import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { simpleGit, SimpleGit } from 'simple-git';
import { 
  Migration, 
  MigrationStatus, 
  MigrationOptions,
  MigrationConfig,
  IntegrityResult,
  IntegrityError,
  IntegrityEventType
} from '../types';
import { DatabaseConnection } from '../core/database-connection';
import { EventEmitter } from 'events';
import { z } from 'zod';
import semver from 'semver';

export class MigrationEngine extends EventEmitter {
  private connection: DatabaseConnection;
  private config: MigrationConfig;
  private git: SimpleGit;
  private isInitialized = false;

  constructor(connection: DatabaseConnection, config: MigrationConfig) {
    super();
    this.connection = connection;
    this.config = config;
    this.git = simpleGit(process.cwd());
  }

  /**
   * Initialize migration tracking system
   */
  async initialize(): Promise<IntegrityResult<void>> {
    try {
      // Create migration directory if it doesn't exist
      await fs.ensureDir(this.config.directory);

      // Create migration tracking table
      await this.createMigrationTable();

      // Initialize git hooks if enabled
      if (this.config.gitIntegration) {
        await this.setupGitHooks();
      }

      this.isInitialized = true;
      this.emit('initialized');
      
      return { success: true };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'MIGRATION_INIT_FAILED',
        message: 'Failed to initialize migration engine',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Create migration tracking table
   */
  private async createMigrationTable(): Promise<void> {
    const schemaPrefix = this.config.schemaName ? `"${this.config.schemaName}".` : '';
    const tableName = `${schemaPrefix}"${this.config.tableName}"`;

    const createTableSql = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id VARCHAR(255) PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        status VARCHAR(50) NOT NULL,
        executed_at TIMESTAMP,
        execution_time INTEGER,
        error TEXT,
        sql TEXT,
        prisma_schema TEXT,
        rollback_sql TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_version 
        ON ${tableName}(version);
      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_status 
        ON ${tableName}(status);
      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_timestamp 
        ON ${tableName}(timestamp);
    `;

    await this.connection.query(createTableSql);
  }

  /**
   * Generate a new migration
   */
  async generateMigration(name: string, sql?: string, prismaSchema?: string): Promise<IntegrityResult<Migration>> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Generate version using semver
      const lastMigration = await this.getLastMigration();
      const version = lastMigration 
        ? semver.inc(lastMigration.version, 'patch')! 
        : '1.0.0';

      // Generate migration ID
      const timestamp = new Date();
      const id = `${timestamp.getTime()}_${name.toLowerCase().replace(/\s+/g, '_')}`;

      // Create migration object
      const migration: Migration = {
        id,
        version,
        name,
        timestamp,
        checksum: '',
        status: MigrationStatus.PENDING,
        sql,
        prismaSchema,
        metadata: {
          author: await this.getGitAuthor(),
          branch: await this.getGitBranch(),
          commit: await this.getGitCommit()
        }
      };

      // Generate checksum
      migration.checksum = this.generateChecksum(migration);

      // Save migration file
      await this.saveMigrationFile(migration);

      // Record in database
      await this.recordMigration(migration);

      this.emit('migration_generated', migration);

      return { success: true, data: migration };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'MIGRATION_GENERATION_FAILED',
        message: `Failed to generate migration: ${name}`,
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Run pending migrations
   */
  async runMigrations(options: MigrationOptions = {}): Promise<IntegrityResult<Migration[]>> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        return { 
          success: true, 
          data: [], 
          metadata: { message: 'No pending migrations' } 
        };
      }

      const executedMigrations: Migration[] = [];
      const errors: IntegrityError[] = [];

      for (const migration of pendingMigrations) {
        if (options.target && semver.gt(migration.version, options.target)) {
          break;
        }

        const result = await this.executeMigration(migration, options);
        
        if (result.success && result.data) {
          executedMigrations.push(result.data);
        } else if (result.error) {
          errors.push(result.error);
          
          if (!options.force) {
            break;
          }
        }
      }

      if (errors.length > 0 && executedMigrations.length === 0) {
        return { 
          success: false, 
          error: errors[0], 
          warnings: errors.slice(1).map(e => e.message) 
        };
      }

      return { 
        success: true, 
        data: executedMigrations,
        warnings: errors.map(e => e.message)
      };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'MIGRATION_RUN_FAILED',
        message: 'Failed to run migrations',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(
    migration: Migration, 
    options: MigrationOptions
  ): Promise<IntegrityResult<Migration>> {
    const startTime = Date.now();

    try {
      // Validate checksum
      if (this.config.validateChecksums && !options.skipValidation) {
        const isValid = await this.validateChecksum(migration);
        if (!isValid) {
          throw new Error('Migration checksum validation failed');
        }
      }

      // Update status to running
      await this.updateMigrationStatus(migration.id, MigrationStatus.RUNNING);

      this.emit('event', {
        type: IntegrityEventType.MIGRATION_STARTED,
        timestamp: new Date(),
        source: 'MigrationEngine',
        data: migration
      });

      // Execute migration
      if (options.dryRun) {
        // Dry run - only validate
        migration.status = MigrationStatus.COMPLETED;
        migration.executedAt = new Date();
        migration.executionTime = Date.now() - startTime;
      } else {
        // Load migration content
        const content = await this.loadMigrationContent(migration);

        if (this.config.transactional && options.transaction !== false) {
          // Execute in transaction
          await this.connection.transaction(async (client) => {
            if (this.config.lockTimeout) {
              await client.query(`SET lock_timeout = ${this.config.lockTimeout}`);
            }
            
            if (content.sql) {
              await client.query(content.sql);
            }
          });
        } else {
          // Execute without transaction
          if (content.sql) {
            await this.connection.query(content.sql);
          }
        }

        migration.status = MigrationStatus.COMPLETED;
        migration.executedAt = new Date();
        migration.executionTime = Date.now() - startTime;
      }

      // Update migration record
      await this.updateMigrationRecord(migration);

      this.emit('event', {
        type: IntegrityEventType.MIGRATION_COMPLETED,
        timestamp: new Date(),
        source: 'MigrationEngine',
        data: migration
      });

      return { success: true, data: migration };
    } catch (error) {
      migration.status = MigrationStatus.FAILED;
      migration.error = error instanceof Error ? error.message : String(error);
      migration.executionTime = Date.now() - startTime;

      await this.updateMigrationRecord(migration);

      this.emit('event', {
        type: IntegrityEventType.MIGRATION_FAILED,
        timestamp: new Date(),
        source: 'MigrationEngine',
        data: { migration, error }
      });

      const integrityError: IntegrityError = {
        code: 'MIGRATION_EXECUTION_FAILED',
        message: `Failed to execute migration ${migration.id}`,
        details: error
      };

      return { success: false, error: integrityError };
    }
  }

  /**
   * Rollback migrations
   */
  async rollbackMigrations(
    target?: string, 
    options: MigrationOptions = {}
  ): Promise<IntegrityResult<Migration[]>> {
    try {
      const executedMigrations = await this.getExecutedMigrations();
      const migrationsToRollback: Migration[] = [];

      for (const migration of executedMigrations.reverse()) {
        if (target && semver.lte(migration.version, target)) {
          break;
        }
        migrationsToRollback.push(migration);
      }

      if (migrationsToRollback.length === 0) {
        return { 
          success: true, 
          data: [], 
          metadata: { message: 'No migrations to rollback' } 
        };
      }

      const rolledBackMigrations: Migration[] = [];

      for (const migration of migrationsToRollback) {
        const result = await this.rollbackMigration(migration, options);
        
        if (result.success && result.data) {
          rolledBackMigrations.push(result.data);
        } else if (!options.force) {
          break;
        }
      }

      return { success: true, data: rolledBackMigrations };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'MIGRATION_ROLLBACK_FAILED',
        message: 'Failed to rollback migrations',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Rollback a single migration
   */
  private async rollbackMigration(
    migration: Migration,
    options: MigrationOptions
  ): Promise<IntegrityResult<Migration>> {
    try {
      if (!migration.rollbackSql) {
        throw new Error('No rollback SQL defined for migration');
      }

      if (options.dryRun) {
        migration.status = MigrationStatus.ROLLED_BACK;
      } else {
        if (this.config.transactional) {
          await this.connection.transaction(async (client) => {
            await client.query(migration.rollbackSql);
          });
        } else {
          await this.connection.query(migration.rollbackSql);
        }

        migration.status = MigrationStatus.ROLLED_BACK;
        await this.updateMigrationRecord(migration);
      }

      return { success: true, data: migration };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'MIGRATION_ROLLBACK_FAILED',
        message: `Failed to rollback migration ${migration.id}`,
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<IntegrityResult<MigrationStatus[]>> {
    try {
      const schemaPrefix = this.config.schemaName ? `"${this.config.schemaName}".` : '';
      const tableName = `${schemaPrefix}"${this.config.tableName}"`;

      const result = await this.connection.query<Migration>(`
        SELECT * FROM ${tableName}
        ORDER BY timestamp DESC
      `);

      const migrations = result.rows.map(row => ({
        ...row,
        timestamp: new Date(row.timestamp),
        executedAt: row.executedAt ? new Date(row.executedAt) : undefined
      }));

      return { success: true, data: migrations };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'MIGRATION_STATUS_FAILED',
        message: 'Failed to get migration status',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  /**
   * Save migration file
   */
  private async saveMigrationFile(migration: Migration): Promise<void> {
    const filename = `${migration.id}.json`;
    const filepath = path.join(this.config.directory, filename);

    const content = {
      ...migration,
      timestamp: migration.timestamp.toISOString(),
      executedAt: migration.executedAt?.toISOString()
    };

    await fs.writeJson(filepath, content, { spaces: 2 });

    // Save SQL file if present
    if (migration.sql) {
      const sqlFilepath = path.join(this.config.directory, `${migration.id}.sql`);
      await fs.writeFile(sqlFilepath, migration.sql);
    }

    // Save Prisma schema if present
    if (migration.prismaSchema) {
      const prismaFilepath = path.join(this.config.directory, `${migration.id}.prisma`);
      await fs.writeFile(prismaFilepath, migration.prismaSchema);
    }
  }

  /**
   * Load migration content
   */
  private async loadMigrationContent(migration: Migration): Promise<{
    sql?: string;
    prismaSchema?: string;
  }> {
    const sqlFilepath = path.join(this.config.directory, `${migration.id}.sql`);
    const prismaFilepath = path.join(this.config.directory, `${migration.id}.prisma`);

    const content: { sql?: string; prismaSchema?: string } = {};

    if (await fs.pathExists(sqlFilepath)) {
      content.sql = await fs.readFile(sqlFilepath, 'utf-8');
    }

    if (await fs.pathExists(prismaFilepath)) {
      content.prismaSchema = await fs.readFile(prismaFilepath, 'utf-8');
    }

    return content;
  }

  /**
   * Record migration in database
   */
  private async recordMigration(migration: Migration): Promise<void> {
    const schemaPrefix = this.config.schemaName ? `"${this.config.schemaName}".` : '';
    const tableName = `${schemaPrefix}"${this.config.tableName}"`;

    await this.connection.query(`
      INSERT INTO ${tableName} (
        id, version, name, timestamp, checksum, status, 
        sql, prisma_schema, rollback_sql, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      migration.id,
      migration.version,
      migration.name,
      migration.timestamp,
      migration.checksum,
      migration.status,
      migration.sql,
      migration.prismaSchema,
      migration.rollbackSql,
      JSON.stringify(migration.metadata)
    ]);
  }

  /**
   * Update migration record
   */
  private async updateMigrationRecord(migration: Migration): Promise<void> {
    const schemaPrefix = this.config.schemaName ? `"${this.config.schemaName}".` : '';
    const tableName = `${schemaPrefix}"${this.config.tableName}"`;

    await this.connection.query(`
      UPDATE ${tableName}
      SET status = $2, executed_at = $3, execution_time = $4, 
          error = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [
      migration.id,
      migration.status,
      migration.executedAt,
      migration.executionTime,
      migration.error
    ]);
  }

  /**
   * Update migration status
   */
  private async updateMigrationStatus(id: string, status: MigrationStatus): Promise<void> {
    const schemaPrefix = this.config.schemaName ? `"${this.config.schemaName}".` : '';
    const tableName = `${schemaPrefix}"${this.config.tableName}"`;

    await this.connection.query(`
      UPDATE ${tableName}
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id, status]);
  }

  /**
   * Get last migration
   */
  private async getLastMigration(): Promise<Migration | null> {
    const schemaPrefix = this.config.schemaName ? `"${this.config.schemaName}".` : '';
    const tableName = `${schemaPrefix}"${this.config.tableName}"`;

    const result = await this.connection.query<Migration>(`
      SELECT * FROM ${tableName}
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get pending migrations
   */
  private async getPendingMigrations(): Promise<Migration[]> {
    const schemaPrefix = this.config.schemaName ? `"${this.config.schemaName}".` : '';
    const tableName = `${schemaPrefix}"${this.config.tableName}"`;

    const result = await this.connection.query<Migration>(`
      SELECT * FROM ${tableName}
      WHERE status = $1
      ORDER BY timestamp ASC
    `, [MigrationStatus.PENDING]);

    return result.rows;
  }

  /**
   * Get executed migrations
   */
  private async getExecutedMigrations(): Promise<Migration[]> {
    const schemaPrefix = this.config.schemaName ? `"${this.config.schemaName}".` : '';
    const tableName = `${schemaPrefix}"${this.config.tableName}"`;

    const result = await this.connection.query<Migration>(`
      SELECT * FROM ${tableName}
      WHERE status = $1
      ORDER BY timestamp ASC
    `, [MigrationStatus.COMPLETED]);

    return result.rows;
  }

  /**
   * Generate checksum for migration
   */
  private generateChecksum(migration: Migration): string {
    const content = JSON.stringify({
      id: migration.id,
      version: migration.version,
      name: migration.name,
      sql: migration.sql,
      prismaSchema: migration.prismaSchema
    });

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate migration checksum
   */
  private async validateChecksum(migration: Migration): Promise<boolean> {
    const content = await this.loadMigrationContent(migration);
    const currentMigration = {
      ...migration,
      sql: content.sql,
      prismaSchema: content.prismaSchema
    };

    const expectedChecksum = this.generateChecksum(currentMigration);
    return expectedChecksum === migration.checksum;
  }

  /**
   * Setup git hooks for migration tracking
   */
  private async setupGitHooks(): Promise<void> {
    const hookPath = path.join('.git', 'hooks', 'pre-commit');
    const hookContent = `#!/bin/sh
# Auto-generated migration validation hook
npx claude-platform migrate:validate
`;

    await fs.ensureDir(path.dirname(hookPath));
    await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
  }

  /**
   * Get git author
   */
  private async getGitAuthor(): Promise<string> {
    try {
      const name = await this.git.raw(['config', 'user.name']);
      const email = await this.git.raw(['config', 'user.email']);
      return `${name.trim()} <${email.trim()}>`;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current git branch
   */
  private async getGitBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current git commit
   */
  private async getGitCommit(): Promise<string> {
    try {
      const commit = await this.git.revparse(['HEAD']);
      return commit.trim();
    } catch {
      return 'unknown';
    }
  }
}