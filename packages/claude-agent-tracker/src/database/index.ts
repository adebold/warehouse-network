/**
 * PostgreSQL database connection and management
 */

import pg from 'pg';

import config from '../config/index.js';
import { logger } from '../monitoring/logger.js';

const { Pool } = pg;

export class Database {
  private pool: pg.Pool;
  private connected = false;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: config.database.poolSize,
      connectionTimeoutMillis: config.database.connectionTimeout,
      idleTimeoutMillis: 30000,
      statement_timeout: 30000,
      query_timeout: 30000
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('PostgreSQL pool error:', err);
    });

    this.pool.on('connect', () => {
      logger.debug('New PostgreSQL client connected');
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      this.connected = true;
      logger.info('Successfully connected to PostgreSQL');
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }
    
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Query executed', {
        query: text.substring(0, 100),
        duration,
        rows: result.rowCount
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Query failed', {
        query: text.substring(0, 100),
        duration,
        error
      });
      throw error;
    }
  }

  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 AS health');
      return result.rows[0].health === 1;
    } catch (error) {
      logger.error('Health check failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.connected = false;
    logger.info('PostgreSQL connection closed');
  }

  getPool(): pg.Pool {
    return this.pool;
  }
}

// Singleton instance
export const db = new Database();

// Database initialization with migrations
export async function initializeDatabase(): Promise<void> {
  try {
    await db.connect();
    await runMigrations();
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

// Run database migrations
async function runMigrations(): Promise<void> {
  // Create migrations table if it doesn't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create core tables
  await createCoreTables();
}

async function createCoreTables(): Promise<void> {
  // Agents table
  await db.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL,
      pid INTEGER,
      capabilities TEXT[],
      start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_activity TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index on status for quick queries
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)
  `);

  // Tasks table
  await db.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      type VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(50) NOT NULL,
      priority VARCHAR(20) NOT NULL,
      start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      end_time TIMESTAMP,
      duration INTEGER,
      result JSONB,
      error TEXT,
      dependencies UUID[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create composite index for agent tasks
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_agent_status ON tasks(agent_id, status)
  `);

  // Agent metrics table (time-series data)
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_metrics (
      id BIGSERIAL PRIMARY KEY,
      agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      tasks_completed INTEGER DEFAULT 0,
      tasks_failed INTEGER DEFAULT 0,
      cpu_usage DECIMAL(5,2),
      memory_usage DECIMAL(5,2),
      network_in BIGINT DEFAULT 0,
      network_out BIGINT DEFAULT 0,
      custom_metrics JSONB DEFAULT '{}'
    )
  `);

  // Create hypertable for time-series data if TimescaleDB is available
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_metrics_agent_time ON agent_metrics(agent_id, timestamp DESC)
  `).catch(() => {
    logger.warn('Could not create TimescaleDB hypertable, using regular table');
  });

  // Change events table
  await db.query(`
    CREATE TABLE IF NOT EXISTS change_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      type VARCHAR(50) NOT NULL,
      path TEXT NOT NULL,
      diff TEXT,
      author VARCHAR(255),
      message TEXT,
      metadata JSONB DEFAULT '{}'
    )
  `);

  // Create index for change tracking
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_changes_agent_time ON change_events(agent_id, timestamp DESC)
  `);

  // Agent errors table
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_errors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      type VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      context JSONB DEFAULT '{}'
    )
  `);

  // Task artifacts table
  await db.query(`
    CREATE TABLE IF NOT EXISTS task_artifacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
      type VARCHAR(100) NOT NULL,
      path TEXT NOT NULL,
      size BIGINT NOT NULL,
      hash VARCHAR(64) NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users table for authentication
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      roles TEXT[] DEFAULT '{}',
      permissions TEXT[] DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP
    )
  `);

  // Session tokens table
  await db.query(`
    CREATE TABLE IF NOT EXISTS session_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(500) UNIQUE NOT NULL,
      type VARCHAR(50) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      scopes TEXT[] DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create updated_at trigger function
  await db.query(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Apply updated_at triggers
  const tablesWithUpdatedAt = ['agents', 'tasks'];
  for (const table of tablesWithUpdatedAt) {
    await db.query(`
      DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
      CREATE TRIGGER update_${table}_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at();
    `);
  }
}