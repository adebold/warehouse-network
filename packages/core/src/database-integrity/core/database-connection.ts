/**
 * Database Connection Manager
 * Handles PostgreSQL connections with retry logic and connection pooling
 */

import { DatabaseConfig, IntegrityResult, IntegrityError } from '../types';
import { Pool, PoolClient, QueryResult } from 'pg';
import winston from 'winston';

export interface DatabaseConnection {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  queryMany<T = any>(sql: string, params?: any[]): Promise<T[]>;
  transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
  getMetrics(): ConnectionMetrics;
  isConnected(): boolean;
}

export interface ConnectionMetrics {
  totalConnections: number;
  idleConnections: number;
  waitingConnections: number;
  totalQueries: number;
  failedQueries: number;
  averageQueryTime: number;
}

export class DatabaseConnectionManager {
  private config: DatabaseConfig;
  private pool?: Pool;
  private logger: winston.Logger;
  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    idleConnections: 0,
    waitingConnections: 0,
    totalQueries: 0,
    failedQueries: 0,
    averageQueryTime: 0
  };
  private queryTimes: number[] = [];

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.logger = winston.createLogger({
      level: config.logLevel || 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }

  async connect(): Promise<IntegrityResult<DatabaseConnection>> {
    try {
      this.logger.info('Connecting to database');

      // Parse connection string to extract components if needed
      const connectionConfig = this.parseConnectionString(this.config.connectionString);

      this.pool = new Pool({
        connectionString: this.config.connectionString,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: this.config.poolSize || 10,
        connectionTimeoutMillis: this.config.timeout || 30000,
        idleTimeoutMillis: 30000,
        ...connectionConfig
      });

      // Test connection
      await this.testConnection();

      // Setup pool event listeners
      this.setupPoolEventListeners();

      const connection: DatabaseConnection = {
        query: this.query.bind(this),
        queryOne: this.queryOne.bind(this),
        queryMany: this.queryMany.bind(this),
        transaction: this.transaction.bind(this),
        getMetrics: () => this.metrics,
        isConnected: () => this.pool !== undefined
      };

      this.logger.info('Database connection established');
      return { success: true, data: connection };
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      const integrityError: IntegrityError = {
        code: 'CONNECTION_FAILED',
        message: 'Failed to connect to database',
        details: error
      };
      return { success: false, error: integrityError };
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
      this.logger.info('Database connection closed');
    }
  }

  private parseConnectionString(connectionString: string): any {
    // Handle different connection string formats
    try {
      const url = new URL(connectionString);
      return {
        host: url.hostname,
        port: parseInt(url.port || '5432'),
        database: url.pathname.slice(1),
        user: url.username,
        password: decodeURIComponent(url.password || ''),
        ssl: url.searchParams.get('sslmode') === 'require'
      };
    } catch {
      // If URL parsing fails, assume it's already in the right format
      return {};
    }
  }

  private async testConnection(): Promise<void> {
    const retryAttempts = this.config.retryAttempts || 3;
    const retryDelay = this.config.retryDelay || 1000;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const client = await this.pool!.connect();
        await client.query('SELECT 1');
        client.release();
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Connection attempt ${attempt} failed`, error);
        
        if (attempt < retryAttempts) {
          await this.delay(retryDelay * attempt);
        }
      }
    }

    throw lastError || new Error('Failed to connect after retries');
  }

  private setupPoolEventListeners(): void {
    this.pool!.on('connect', () => {
      this.metrics.totalConnections++;
    });

    this.pool!.on('acquire', () => {
      this.metrics.idleConnections = this.pool!.idleCount;
      this.metrics.waitingConnections = this.pool!.waitingCount;
    });

    this.pool!.on('error', (err) => {
      this.logger.error('Unexpected pool error', err);
    });
  }

  private async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const startTime = Date.now();
    
    try {
      this.logger.debug('Executing query', { sql, params });
      const result = await this.pool.query<T>(sql, params);
      
      const queryTime = Date.now() - startTime;
      this.recordQueryMetrics(queryTime, true);
      
      return result;
    } catch (error) {
      const queryTime = Date.now() - startTime;
      this.recordQueryMetrics(queryTime, false);
      
      this.logger.error('Query failed', { sql, params, error });
      throw error;
    }
  }

  private async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const result = await this.query<T>(sql, params);
    return result.rows[0] || null;
  }

  private async queryMany<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.query<T>(sql, params);
    return result.rows;
  }

  private async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

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

  private recordQueryMetrics(queryTime: number, success: boolean): void {
    this.metrics.totalQueries++;
    
    if (!success) {
      this.metrics.failedQueries++;
    }
    
    this.queryTimes.push(queryTime);
    
    // Keep only last 1000 query times
    if (this.queryTimes.length > 1000) {
      this.queryTimes.shift();
    }
    
    // Calculate average query time
    this.metrics.averageQueryTime = 
      this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}