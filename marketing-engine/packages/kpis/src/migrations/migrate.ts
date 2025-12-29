import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/config';
import { logger } from '../utils/logger';

interface Migration {
  id: number;
  name: string;
  filename: string;
  applied_at?: Date;
}

export class MigrationRunner {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false
    });
  }

  public async run(): Promise<void> {
    try {
      logger.info('Starting database migrations...');
      
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();
      
      // Get list of migrations
      const migrations = await this.getMigrations();
      
      // Run pending migrations
      for (const migration of migrations) {
        await this.runMigration(migration);
      }
      
      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed', error);
      throw error;
    } finally {
      await this.pool.end();
    }
  }

  private async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await this.pool.query(query);
    logger.info('Migrations table ready');
  }

  private async getMigrations(): Promise<Migration[]> {
    const migrationsDir = path.join(__dirname);
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const migrations: Migration[] = [];
    
    for (const filename of files) {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (match) {
        const [, id, name] = match;
        const applied = await this.isMigrationApplied(filename);
        
        if (!applied) {
          migrations.push({
            id: parseInt(id, 10),
            name,
            filename
          });
        }
      }
    }
    
    return migrations;
  }

  private async isMigrationApplied(filename: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM migrations WHERE filename = $1',
      [filename]
    );
    
    return result.rowCount > 0;
  }

  private async runMigration(migration: Migration): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      logger.info(`Running migration: ${migration.filename}`);
      
      // Read and execute migration file
      const filePath = path.join(__dirname, migration.filename);
      const sql = fs.readFileSync(filePath, 'utf-8');
      
      await client.query(sql);
      
      // Record migration
      await client.query(
        'INSERT INTO migrations (filename) VALUES ($1)',
        [migration.filename]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Migration completed: ${migration.filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Migration failed: ${migration.filename}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async rollback(steps: number = 1): Promise<void> {
    try {
      logger.info(`Rolling back ${steps} migration(s)...`);
      
      const query = `
        SELECT filename 
        FROM migrations 
        ORDER BY applied_at DESC 
        LIMIT $1
      `;
      
      const result = await this.pool.query(query, [steps]);
      
      for (const row of result.rows) {
        await this.rollbackMigration(row.filename);
      }
      
      logger.info('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed', error);
      throw error;
    }
  }

  private async rollbackMigration(filename: string): Promise<void> {
    // Note: This is a simplified rollback that just removes the migration record
    // In production, you'd want to have down migrations
    await this.pool.query(
      'DELETE FROM migrations WHERE filename = $1',
      [filename]
    );
    
    logger.info(`Rolled back migration: ${filename}`);
  }
}

// Run migrations if called directly
if (require.main === module) {
  const runner = new MigrationRunner();
  
  const command = process.argv[2];
  
  if (command === 'rollback') {
    const steps = parseInt(process.argv[3] || '1', 10);
    runner.rollback(steps)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    runner.run()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}