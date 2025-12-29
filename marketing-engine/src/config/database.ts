import { Pool, PoolConfig } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('Database');

export interface DatabaseConfig extends PoolConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export class Database {
  private pool: Pool;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = {
      host: config.host || process.env.DB_HOST || 'localhost',
      port: config.port || parseInt(process.env.DB_PORT || '5432'),
      user: config.user || process.env.DB_USER || 'marketing_user',
      password: config.password || process.env.DB_PASSWORD!,
      database: config.database || process.env.DB_NAME || 'marketing_engine',
      max: config.max || parseInt(process.env.DB_POOL_SIZE || '20'),
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
      ssl: config.ssl !== undefined ? config.ssl : process.env.DB_SSL === 'true'
    };

    this.pool = new Pool(this.config);

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error', err);
    });

    // Log when clients are connected/released
    this.pool.on('connect', () => {
      logger.debug('New client connected to database pool');
    });

    this.pool.on('acquire', () => {
      logger.debug('Client acquired from pool');
    });

    this.pool.on('remove', () => {
      logger.debug('Client removed from pool');
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug('Query executed', {
        text: text.substring(0, 100),
        duration,
        rows: result.rowCount
      });
      return result;
    } catch (error) {
      logger.error('Query execution failed', { text, params, error });
      throw error;
    }
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
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
      const result = await this.query('SELECT 1 as health');
      return result.rows[0]?.health === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }

  getPool(): Pool {
    return this.pool;
  }

  getMetrics() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }
}

// Singleton instance
let dbInstance: Database | null = null;

export function getDatabase(config?: DatabaseConfig): Database {
  if (!dbInstance) {
    if (!config) {
      throw new Error('Database config required for initialization');
    }
    dbInstance = new Database(config);
  }
  return dbInstance;
}