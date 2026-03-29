/**
 * Database Manager for AI/ML platform
 */

import { Pool } from 'pg';
import { logger } from './logger';

export class DatabaseManager {
  private pool: Pool | null = null;
  private isConnected = false;

  /**
   * Connect to PostgreSQL database
   */
  async connect(): Promise<void> {
    try {
      const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'warehouse_ai',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: process.env.DB_SSL === 'true',
        max: 20, // Maximum number of clients
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };

      this.pool = new Pool(config);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      logger.info('✅ Connected to PostgreSQL database');
    } catch (error) {
      logger.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      logger.info('✅ Disconnected from database');
    }
  }

  /**
   * Execute a query
   */
  async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug(`Query executed in ${duration}ms: ${text}`);
      return result;
    } catch (error) {
      logger.error('❌ Database query failed:', error);
      throw error;
    }
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.isConnected && this.pool !== null;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      const result = await this.pool.query('SELECT 1');
      return result.rows.length === 1;
    } catch (error) {
      logger.error('❌ Database health check failed:', error);
      return false;
    }
  }
}