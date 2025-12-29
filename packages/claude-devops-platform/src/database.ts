import { Pool, PoolConfig, QueryResult } from 'pg';
import { logger } from './utils/logger';
import { config } from './config';

export class Database {
  private static pool: Pool;
  private static isInitialized = false;

  public static async initialize(): Promise<void> {
    if (Database.isInitialized) {
      return;
    }

    try {
      const poolConfig: PoolConfig = {
        connectionString: config.database.url,
        max: config.database.poolSize,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
      };

      Database.pool = new Pool(poolConfig);

      // Test connection
      await Database.pool.query('SELECT NOW()');
      
      // Create tables if they don't exist
      await Database.createTables();
      
      // Run migrations
      await Database.runMigrations();
      
      Database.isInitialized = true;
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public static async query(text: string, params?: any[]): Promise<QueryResult> {
    if (!Database.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const start = Date.now();
    
    try {
      const result = await Database.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Query executed', {
        query: text.substring(0, 100),
        duration,
        rows: result.rowCount,
      });
      
      return result;
    } catch (error) {
      logger.error('Query failed', {
        query: text.substring(0, 100),
        error,
      });
      throw error;
    }
  }

  public static async transaction<T>(
    callback: (query: (text: string, params?: any[]) => Promise<QueryResult>) => Promise<T>
  ): Promise<T> {
    const client = await Database.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await callback((text, params) => client.query(text, params));
      
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public static async shutdown(): Promise<void> {
    if (Database.pool) {
      await Database.pool.end();
      Database.isInitialized = false;
      logger.info('Database connection closed');
    }
  }

  private static async createTables(): Promise<void> {
    const tables = [
      // Deployment configurations
      `CREATE TABLE IF NOT EXISTS deployment_configs (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        application VARCHAR(255) NOT NULL,
        config JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // Deployments
      `CREATE TABLE IF NOT EXISTS deployments (
        id UUID PRIMARY KEY,
        config_id UUID NOT NULL REFERENCES deployment_configs(id),
        status VARCHAR(50) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration INTEGER,
        previous_version VARCHAR(255),
        metrics JSONB,
        error TEXT,
        rollback_id UUID,
        data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // Pipelines
      `CREATE TABLE IF NOT EXISTS pipelines (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        config JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // Pipeline executions
      `CREATE TABLE IF NOT EXISTS pipeline_executions (
        id UUID PRIMARY KEY,
        pipeline_id UUID NOT NULL REFERENCES pipelines(id),
        status VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // Terraform workspaces
      `CREATE TABLE IF NOT EXISTS terraform_workspaces (
        name VARCHAR(255) PRIMARY KEY,
        config JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // Terraform plans
      `CREATE TABLE IF NOT EXISTS terraform_plans (
        id UUID PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // Terraform applies
      `CREATE TABLE IF NOT EXISTS terraform_applies (
        id SERIAL PRIMARY KEY,
        workspace VARCHAR(255) NOT NULL,
        plan_id UUID,
        config JSONB NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // Alert rules
      `CREATE TABLE IF NOT EXISTS alert_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        expression TEXT NOT NULL,
        duration VARCHAR(50) NOT NULL,
        labels JSONB,
        annotations JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // API keys
      `CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        key_hash VARCHAR(255) NOT NULL UNIQUE,
        permissions JSONB NOT NULL,
        last_used_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      
      // Audit log
      `CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        resource_type VARCHAR(255),
        resource_id VARCHAR(255),
        details JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
    ];
    
    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_deployments_config_id ON deployments(config_id)',
      'CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)',
      'CREATE INDEX IF NOT EXISTS idx_deployments_start_time ON deployments(start_time)',
      'CREATE INDEX IF NOT EXISTS idx_pipeline_executions_pipeline_id ON pipeline_executions(pipeline_id)',
      'CREATE INDEX IF NOT EXISTS idx_pipeline_executions_status ON pipeline_executions(status)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)',
    ];
    
    try {
      // Create tables
      for (const tableQuery of tables) {
        await Database.query(tableQuery);
      }
      
      // Create indexes
      for (const indexQuery of indexes) {
        await Database.query(indexQuery);
      }
      
      logger.info('Database tables created successfully');
    } catch (error) {
      logger.error('Failed to create database tables:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  private static async runMigrations(): Promise<void> {
    try {
      // Create migrations table if it doesn't exist
      await Database.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      
      // Check for quality tables migration
      const qualityMigration = await Database.query(
        `SELECT 1 FROM migrations WHERE filename = $1`,
        ['002_add_quality_tables.sql']
      );
      
      if (qualityMigration.rows.length === 0) {
        // Run quality tables migration
        const qualityTablesSQL = `
          -- Quality check records
          CREATE TABLE IF NOT EXISTS code_quality_checks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id VARCHAR(255) NOT NULL,
            commit_hash VARCHAR(40),
            branch VARCHAR(255),
            report JSONB NOT NULL,
            score JSONB NOT NULL,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            passed BOOLEAN NOT NULL,
            blockers JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          -- Index for project lookups
          CREATE INDEX IF NOT EXISTS idx_quality_checks_project_id ON code_quality_checks(project_id);
          CREATE INDEX IF NOT EXISTS idx_quality_checks_timestamp ON code_quality_checks(timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_quality_checks_passed ON code_quality_checks(passed);

          -- Quality rollback triggers
          CREATE TABLE IF NOT EXISTS quality_rollback_triggers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id VARCHAR(255) NOT NULL,
            deployment_id UUID NOT NULL,
            thresholds JSONB NOT NULL,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          -- Index for active triggers
          CREATE INDEX IF NOT EXISTS idx_rollback_triggers_active ON quality_rollback_triggers(project_id, deployment_id) WHERE active = true;
        `;
        
        await Database.query(qualityTablesSQL);
        
        // Update existing tables
        await Database.query(`
          ALTER TABLE deployments 
            ADD COLUMN IF NOT EXISTS quality_check_id UUID,
            ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,1),
            ADD COLUMN IF NOT EXISTS quality_passed BOOLEAN;
        `);
        
        await Database.query(`
          ALTER TABLE pipeline_executions
            ADD COLUMN IF NOT EXISTS quality_check_id UUID,
            ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,1),
            ADD COLUMN IF NOT EXISTS quality_passed BOOLEAN;
        `);
        
        // Record migration
        await Database.query(
          `INSERT INTO migrations (filename) VALUES ($1)`,
          ['002_add_quality_tables.sql']
        );
        
        logger.info('Quality tables migration completed');
      }
    } catch (error) {
      logger.error('Failed to run migrations:', error instanceof Error ? error : new Error(String(error)));
      // Don't throw - allow app to start even if migrations fail
    }
  }
  
  // Utility methods for common queries
  public static async exists(table: string, column: string, value: any): Promise<boolean> {
    const result = await Database.query(
      `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${column} = $1)`,
      [value]
    );
    return result.rows[0].exists;
  }
  
  public static async count(table: string, where?: string, params?: any[]): Promise<number> {
    let query = `SELECT COUNT(*) FROM ${table}`;
    if (where) {
      query += ` WHERE ${where}`;
    }
    
    const result = await Database.query(query, params);
    return parseInt(result.rows[0].count, 10);
  }
  
  // Audit logging
  public static async audit(
    userId: string | null,
    action: string,
    resourceType: string | null,
    resourceId: string | null,
    details: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await Database.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, resourceType, resourceId, JSON.stringify(details), ipAddress, userAgent]
    );
  }
}