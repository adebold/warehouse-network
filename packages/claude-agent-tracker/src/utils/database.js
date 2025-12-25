// Database utility for SQLite operations
import sqlite3 from 'sqlite3';
import { logger } from './logger.js';
import path from 'path';
import fs from 'fs-extra';

export class Database {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(process.cwd(), '.claude-agent-tracker', 'tracker.db');
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      await fs.ensureDir(dbDir);

      // Open database connection
      this.db = await this.openDatabase();
      
      // Enable foreign keys
      await this.query('PRAGMA foreign_keys = ON');
      
      // Set performance optimizations
      await this.query('PRAGMA journal_mode = WAL');
      await this.query('PRAGMA synchronous = NORMAL');
      await this.query('PRAGMA cache_size = -64000'); // 64MB cache
      await this.query('PRAGMA temp_store = MEMORY');

      this.isInitialized = true;
      logger.info(`Database initialized: ${this.dbPath}`);
      
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Open database connection
   */
  openDatabase() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(db);
        }
      });
    });
  }

  /**
   * Execute SQL query
   */
  async query(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        this.db.all(sql, params, (err, rows) => {
          if (err) {
            logger.error('Query error:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      } else {
        this.db.run(sql, params, function(err) {
          if (err) {
            logger.error('Query error:', err);
            reject(err);
          } else {
            resolve({
              lastID: this.lastID,
              changes: this.changes
            });
          }
        });
      }
    });
  }

  /**
   * Begin transaction
   */
  async beginTransaction() {
    await this.query('BEGIN TRANSACTION');
  }

  /**
   * Commit transaction
   */
  async commitTransaction() {
    await this.query('COMMIT');
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction() {
    await this.query('ROLLBACK');
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries) {
    try {
      await this.beginTransaction();
      
      const results = [];
      for (const { sql, params } of queries) {
        const result = await this.query(sql, params);
        results.push(result);
      }
      
      await this.commitTransaction();
      return results;
      
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Insert or update (upsert) operation
   */
  async upsert(table, data, conflictColumn) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    // Build update clause for conflict resolution
    const updateClause = columns
      .filter(col => col !== conflictColumn)
      .map(col => `${col} = excluded.${col}`)
      .join(', ');

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(${conflictColumn}) DO UPDATE SET ${updateClause}
    `;

    return await this.query(sql, values);
  }

  /**
   * Bulk insert operation
   */
  async bulkInsert(table, records) {
    if (records.length === 0) {
      return { changes: 0 };
    }

    const columns = Object.keys(records[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

    try {
      await this.beginTransaction();
      
      let totalChanges = 0;
      for (const record of records) {
        const values = columns.map(col => record[col]);
        const result = await this.query(sql, values);
        totalChanges += result.changes;
      }
      
      await this.commitTransaction();
      return { changes: totalChanges };
      
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Get table information
   */
  async getTableInfo(tableName) {
    return await this.query(`PRAGMA table_info(${tableName})`);
  }

  /**
   * Get all table names
   */
  async getTables() {
    const result = await this.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    return result.map(row => row.name);
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName) {
    const result = await this.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name=?
    `, [tableName]);
    return result.length > 0;
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const tables = await this.getTables();
    const stats = {
      tables: [],
      totalSize: 0,
      pageSize: 0,
      pageCount: 0
    };

    // Get database size info
    const [dbInfo] = await this.query('PRAGMA page_count');
    const [pageInfo] = await this.query('PRAGMA page_size');
    
    stats.pageCount = dbInfo.page_count;
    stats.pageSize = pageInfo.page_size;
    stats.totalSize = stats.pageCount * stats.pageSize;

    // Get table statistics
    for (const table of tables) {
      const [countResult] = await this.query(`SELECT COUNT(*) as count FROM ${table}`);
      stats.tables.push({
        name: table,
        rowCount: countResult.count
      });
    }

    return stats;
  }

  /**
   * Optimize database
   */
  async optimize() {
    logger.info('Starting database optimization...');
    
    try {
      // Analyze tables for query optimization
      await this.query('ANALYZE');
      
      // Vacuum to reclaim space
      await this.query('VACUUM');
      
      // Reindex for performance
      await this.query('REINDEX');
      
      logger.info('Database optimization completed');
      
    } catch (error) {
      logger.error('Database optimization failed:', error);
      throw error;
    }
  }

  /**
   * Backup database
   */
  async backup(backupPath = null) {
    if (!backupPath) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = this.dbPath.replace('.db', `_backup_${timestamp}.db`);
    }

    try {
      // Ensure backup directory exists
      const backupDir = path.dirname(backupPath);
      await fs.ensureDir(backupDir);

      // Copy database file
      await fs.copyFile(this.dbPath, backupPath);
      
      logger.info(`Database backed up to: ${backupPath}`);
      return backupPath;
      
    } catch (error) {
      logger.error('Database backup failed:', error);
      throw error;
    }
  }

  /**
   * Restore database from backup
   */
  async restore(backupPath) {
    try {
      // Verify backup file exists
      if (!await fs.pathExists(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Close current connection
      await this.close();

      // Replace database file
      await fs.copyFile(backupPath, this.dbPath);
      
      // Reinitialize
      this.isInitialized = false;
      await this.initialize();
      
      logger.info(`Database restored from: ${backupPath}`);
      
    } catch (error) {
      logger.error('Database restore failed:', error);
      throw error;
    }
  }

  /**
   * Execute raw SQL with error handling
   */
  async executeRaw(sql, params = []) {
    try {
      return await this.query(sql, params);
    } catch (error) {
      logger.error(`SQL execution failed: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Get query execution plan
   */
  async explainQuery(sql, params = []) {
    const explainSql = `EXPLAIN QUERY PLAN ${sql}`;
    return await this.query(explainSql, params);
  }

  /**
   * Create index
   */
  async createIndex(indexName, tableName, columns, unique = false) {
    const uniqueKeyword = unique ? 'UNIQUE' : '';
    const sql = `CREATE ${uniqueKeyword} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns.join(', ')})`;
    return await this.query(sql);
  }

  /**
   * Drop index
   */
  async dropIndex(indexName) {
    const sql = `DROP INDEX IF EXISTS ${indexName}`;
    return await this.query(sql);
  }

  /**
   * Get indexes for a table
   */
  async getIndexes(tableName) {
    return await this.query(`PRAGMA index_list(${tableName})`);
  }

  /**
   * Clean up old records
   */
  async cleanup(options = {}) {
    const {
      daysToKeep = 30,
      tables = ['agent_activities', 'sent_notifications', 'code_changes']
    } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateStr = cutoffDate.toISOString();

    let totalDeleted = 0;

    try {
      await this.beginTransaction();

      for (const table of tables) {
        if (await this.tableExists(table)) {
          const result = await this.query(`
            DELETE FROM ${table} 
            WHERE timestamp < ? OR created_at < ?
          `, [cutoffDateStr, cutoffDateStr]);
          
          totalDeleted += result.changes;
          logger.info(`Cleaned ${result.changes} records from ${table}`);
        }
      }

      await this.commitTransaction();
      
      // Optimize after cleanup
      await this.optimize();
      
      logger.info(`Total cleanup: ${totalDeleted} records deleted`);
      return { deleted: totalDeleted };
      
    } catch (error) {
      await this.rollbackTransaction();
      logger.error('Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Check database health
   */
  async healthCheck() {
    try {
      const health = {
        connected: false,
        writable: false,
        stats: null,
        errors: []
      };

      // Test connection
      await this.query('SELECT 1');
      health.connected = true;

      // Test write capability
      await this.query(`
        CREATE TABLE IF NOT EXISTS health_check_temp (
          id INTEGER PRIMARY KEY,
          test_value TEXT
        )
      `);
      await this.query('INSERT INTO health_check_temp (test_value) VALUES (?)', ['test']);
      await this.query('DELETE FROM health_check_temp WHERE test_value = ?', ['test']);
      await this.query('DROP TABLE health_check_temp');
      health.writable = true;

      // Get stats
      health.stats = await this.getStats();

      // Check for corruption
      const [integrityCheck] = await this.query('PRAGMA integrity_check');
      if (integrityCheck && integrityCheck.integrity_check !== 'ok') {
        health.errors.push(`Integrity check failed: ${integrityCheck.integrity_check}`);
      }

      return health;
      
    } catch (error) {
      return {
        connected: false,
        writable: false,
        stats: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database:', err);
            reject(err);
          } else {
            this.db = null;
            this.isInitialized = false;
            logger.info('Database connection closed');
            resolve();
          }
        });
      });
    }
  }

  /**
   * Destructor - ensure connection is closed
   */
  async destroy() {
    await this.close();
  }
}