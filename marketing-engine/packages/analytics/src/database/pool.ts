/**
 * PostgreSQL connection pool management
 */

import { Pool, PoolConfig, PoolClient } from 'pg';
import { Logger } from '../core/logger';
import { AnalyticsConfig } from '../core/config';

export interface DatabasePoolOptions {
  config: AnalyticsConfig['database'];
  logger: Logger;
}

export class DatabasePool {
  private readonly pool: Pool;
  private readonly logger: Logger;
  private isShuttingDown: boolean = false;

  constructor(options: DatabasePoolOptions) {
    this.logger = options.logger.child({ component: 'DatabasePool' });

    const poolConfig: PoolConfig = {
      connectionString: options.config.url,
      min: options.config.poolMin,
      max: options.config.poolMax,
      idleTimeoutMillis: options.config.idleTimeoutMillis,
      connectionTimeoutMillis: options.config.connectionTimeoutMillis,
      ssl: options.config.ssl,
      application_name: 'marketing-analytics'
    };

    this.pool = new Pool(poolConfig);

    // Pool event handlers
    this.pool.on('connect', (client) => {
      this.logger.debug('Client connected to pool');
      // Set session parameters
      client.query('SET statement_timeout = 30000'); // 30 seconds
    });

    this.pool.on('acquire', (client) => {
      this.logger.debug('Client acquired from pool');
    });

    this.pool.on('error', (err, client) => {
      this.logger.error('Unexpected error on idle client', err);
    });

    this.pool.on('remove', (client) => {
      this.logger.debug('Client removed from pool');
    });
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<PoolClient> {
    if (this.isShuttingDown) {
      throw new Error('Database pool is shutting down');
    }

    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      this.logger.error('Failed to get client from pool', error);
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<{ rows: T[]; rowCount: number }> {
    const start = Date.now();
    
    try {
      const result = await this.pool.query<T>(text, params);
      
      const duration = Date.now() - start;
      this.logger.debug('Query executed', {
        query: text.substring(0, 100),
        duration,
        rows: result.rowCount
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      this.logger.error('Query failed', error, {
        query: text.substring(0, 100),
        duration
      });
      
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    
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

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows[0]?.health === 1;
    } catch (error) {
      this.logger.error('Health check failed', error);
      return false;
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount
    };
  }

  /**
   * Shutdown pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    try {
      await this.pool.end();
      this.logger.info('Database pool shut down');
    } catch (error) {
      this.logger.error('Error shutting down pool', error);
      throw error;
    }
  }

  /**
   * Get the underlying pool instance
   */
  getPool(): Pool {
    return this.pool;
  }
}