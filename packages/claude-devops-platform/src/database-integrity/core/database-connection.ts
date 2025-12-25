/**
 * Database Connection Manager
 * Production-ready database connection handling with pooling and monitoring
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { createConnection, Connection, ConnectionOptions } from 'mysql2/promise';
import { Database } from 'sqlite3';
import { ConnectionPool, config as mssqlConfig } from 'mssql';
import { DatabaseConfig, IntegrityResult, IntegrityError } from '../types';
import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface DatabaseConnection {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  transaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isHealthy(): Promise<boolean>;
  getMetrics(): ConnectionMetrics;
}

export interface ConnectionMetrics {
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalConnections: number;
  avgQueryTime: number;
  errorRate: number;
}

export class DatabaseConnectionManager extends EventEmitter {
  private config: DatabaseConfig;
  private connection?: DatabaseConnection;
  private metrics: ConnectionMetrics = {
    activeConnections: 0,
    idleConnections: 0,
    waitingRequests: 0,
    totalConnections: 0,
    avgQueryTime: 0,
    errorRate: 0
  };
  private queryTimes: number[] = [];
  private errorCount = 0;
  private queryCount = 0;

  constructor(config: DatabaseConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<IntegrityResult<DatabaseConnection>> {
    try {
      switch (this.config.type) {
        case 'postgres':
          this.connection = await this.createPostgresConnection();
          break;
        case 'mysql':
          this.connection = await this.createMysqlConnection();
          break;
        case 'sqlite':
          this.connection = await this.createSqliteConnection();
          break;
        case 'sqlserver':
          this.connection = await this.createSqlServerConnection();
          break;
        default:
          throw new Error(`Unsupported database type: ${this.config.type}`);
      }

      this.emit('connected', { type: this.config.type });
      return { success: true, data: this.connection };
    } catch (error) {
      const integrityError: IntegrityError = {
        code: 'CONNECTION_FAILED',
        message: `Failed to connect to ${this.config.type} database`,
        details: error
      };
      this.emit('connection_error', integrityError);
      return { success: false, error: integrityError };
    }
  }

  private async createPostgresConnection(): Promise<DatabaseConnection> {
    const poolConfig = {
      connectionString: this.config.connectionString,
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl,
      min: this.config.pool?.min || 2,
      max: this.config.pool?.max || 10,
      idleTimeoutMillis: this.config.pool?.idleTimeout || 30000,
      connectionTimeoutMillis: 5000
    };

    const pool = new Pool(poolConfig);

    // Monitor pool events
    pool.on('connect', () => {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
    });

    pool.on('acquire', () => {
      this.metrics.activeConnections++;
      this.metrics.idleConnections--;
    });

    pool.on('release', () => {
      this.metrics.activeConnections--;
      this.metrics.idleConnections++;
    });

    pool.on('error', (err) => {
      this.errorCount++;
      this.emit('pool_error', err);
    });

    return {
      query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
        const start = Date.now();
        try {
          const result = await pool.query<T>(sql, params);
          this.recordQueryTime(Date.now() - start);
          return result;
        } catch (error) {
          this.errorCount++;
          throw error;
        } finally {
          this.queryCount++;
        }
      },

      transaction: async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
        const client = await pool.connect();
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
      },

      close: async () => {
        await pool.end();
        this.emit('disconnected');
      },

      isHealthy: async () => {
        try {
          await pool.query('SELECT 1');
          return true;
        } catch {
          return false;
        }
      },

      getMetrics: () => this.metrics
    };
  }

  private async createMysqlConnection(): Promise<DatabaseConnection> {
    const connectionOptions: ConnectionOptions = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: this.config.pool?.max || 10,
      waitForConnections: true,
      queueLimit: 0
    };

    const pool = await createConnection(connectionOptions);

    return {
      query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
        const start = Date.now();
        try {
          const [rows] = await pool.execute(sql, params);
          this.recordQueryTime(Date.now() - start);
          return { rows: rows as T[], rowCount: Array.isArray(rows) ? rows.length : 0 } as QueryResult<T>;
        } catch (error) {
          this.errorCount++;
          throw error;
        } finally {
          this.queryCount++;
        }
      },

      transaction: async <T>(callback: (client: Connection) => Promise<T>): Promise<T> => {
        await pool.beginTransaction();
        try {
          const result = await callback(pool);
          await pool.commit();
          return result;
        } catch (error) {
          await pool.rollback();
          throw error;
        }
      },

      close: async () => {
        await pool.end();
        this.emit('disconnected');
      },

      isHealthy: async () => {
        try {
          await pool.ping();
          return true;
        } catch {
          return false;
        }
      },

      getMetrics: () => this.metrics
    };
  }

  private async createSqliteConnection(): Promise<DatabaseConnection> {
    return new Promise((resolve, reject) => {
      const db = new Database(this.config.connectionString || ':memory:', (err) => {
        if (err) {
          reject(err);
          return;
        }

        const connection: DatabaseConnection = {
          query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
            const start = Date.now();
            return new Promise((resolve, reject) => {
              db.all(sql, params || [], (err, rows) => {
                this.recordQueryTime(Date.now() - start);
                this.queryCount++;
                if (err) {
                  this.errorCount++;
                  reject(err);
                } else {
                  resolve({ rows: rows as T[], rowCount: rows.length } as QueryResult<T>);
                }
              });
            });
          },

          transaction: async <T>(callback: (client: any) => Promise<T>): Promise<T> => {
            await new Promise((resolve, reject) => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve(undefined);
              });
            });

            try {
              const result = await callback(db);
              await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                  if (err) reject(err);
                  else resolve(undefined);
                });
              });
              return result;
            } catch (error) {
              await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve(undefined));
              });
              throw error;
            }
          },

          close: async () => {
            return new Promise((resolve, reject) => {
              db.close((err) => {
                if (err) reject(err);
                else {
                  this.emit('disconnected');
                  resolve();
                }
              });
            });
          },

          isHealthy: async () => {
            try {
              await connection.query('SELECT 1');
              return true;
            } catch {
              return false;
            }
          },

          getMetrics: () => this.metrics
        };

        resolve(connection);
      });
    });
  }

  private async createSqlServerConnection(): Promise<DatabaseConnection> {
    const config: mssqlConfig = {
      server: this.config.host!,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      options: {
        encrypt: this.config.ssl || false,
        trustServerCertificate: true
      },
      pool: {
        min: this.config.pool?.min || 2,
        max: this.config.pool?.max || 10,
        idleTimeoutMillis: this.config.pool?.idleTimeout || 30000
      }
    };

    const pool = new ConnectionPool(config);
    await pool.connect();

    pool.on('error', (err) => {
      this.errorCount++;
      this.emit('pool_error', err);
    });

    return {
      query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
        const start = Date.now();
        try {
          const request = pool.request();
          if (params) {
            params.forEach((param, index) => {
              request.input(`param${index}`, param);
            });
          }
          const result = await request.query(sql);
          this.recordQueryTime(Date.now() - start);
          return { rows: result.recordset as T[], rowCount: result.rowsAffected[0] } as QueryResult<T>;
        } catch (error) {
          this.errorCount++;
          throw error;
        } finally {
          this.queryCount++;
        }
      },

      transaction: async <T>(callback: (client: any) => Promise<T>): Promise<T> => {
        const transaction = pool.transaction();
        await transaction.begin();
        try {
          const result = await callback(transaction);
          await transaction.commit();
          return result;
        } catch (error) {
          await transaction.rollback();
          throw error;
        }
      },

      close: async () => {
        await pool.close();
        this.emit('disconnected');
      },

      isHealthy: async () => {
        try {
          await pool.query('SELECT 1');
          return true;
        } catch {
          return false;
        }
      },

      getMetrics: () => this.metrics
    };
  }

  private recordQueryTime(time: number) {
    this.queryTimes.push(time);
    if (this.queryTimes.length > 1000) {
      this.queryTimes.shift();
    }
    this.metrics.avgQueryTime = this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
    this.metrics.errorRate = this.errorCount / Math.max(this.queryCount, 1);
  }

  async getConnection(): Promise<DatabaseConnection> {
    if (!this.connection) {
      const result = await this.connect();
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to connect to database');
      }
    }
    return this.connection!;
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = undefined;
    }
  }

  generateConnectionHash(): string {
    const connectionString = this.config.connectionString || 
      `${this.config.type}://${this.config.username}@${this.config.host}:${this.config.port}/${this.config.database}`;
    return crypto.createHash('sha256').update(connectionString).digest('hex');
  }
}