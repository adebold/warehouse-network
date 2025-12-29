/**
 * Data retention policy implementation
 */

import { Pool } from 'pg';
import { Logger } from '../core/logger';
import { DataRetentionPolicy } from '../core/types';
import * as cron from 'node-cron';

export interface RetentionManagerOptions {
  pool: Pool;
  logger: Logger;
  policy: DataRetentionPolicy;
}

export interface RetentionResult {
  anonymized: number;
  deleted: number;
  compressed: number;
  executedAt: Date;
  duration: number;
}

export class RetentionManager {
  private readonly pool: Pool;
  private readonly logger: Logger;
  private readonly policy: DataRetentionPolicy;
  private retentionJob?: cron.ScheduledTask;

  constructor(options: RetentionManagerOptions) {
    this.pool = options.pool;
    this.logger = options.logger.child({ component: 'RetentionManager' });
    this.policy = options.policy;
  }

  /**
   * Start scheduled retention tasks
   */
  startScheduledRetention(): void {
    // Run daily at 2 AM
    this.retentionJob = cron.schedule('0 2 * * *', async () => {
      try {
        await this.executeRetentionPolicy();
      } catch (error) {
        this.logger.error('Scheduled retention failed', error);
      }
    });

    this.logger.info('Retention scheduling started');
  }

  /**
   * Stop scheduled retention tasks
   */
  stopScheduledRetention(): void {
    if (this.retentionJob) {
      this.retentionJob.stop();
      this.retentionJob = undefined;
    }

    this.logger.info('Retention scheduling stopped');
  }

  /**
   * Execute retention policy
   */
  async executeRetentionPolicy(): Promise<RetentionResult> {
    const startTime = Date.now();
    const client = await this.pool.connect();
    
    this.logger.info('Executing retention policy', this.policy);

    try {
      await client.query('BEGIN');

      // 1. Anonymize data based on policy
      const anonymized = await this.anonymizeOldData(
        client,
        this.policy.anonymizeAfterDays
      );

      // 2. Delete very old data
      const deleted = await this.deleteOldData(
        client,
        this.policy.deleteAfterDays
      );

      // 3. Compress old partitions
      const compressed = await this.compressOldPartitions(
        client,
        this.policy.retentionDays
      );

      // 4. Log retention execution
      await this.logRetentionExecution(client, {
        anonymized,
        deleted,
        compressed
      });

      await client.query('COMMIT');

      const result: RetentionResult = {
        anonymized,
        deleted,
        compressed,
        executedAt: new Date(),
        duration: Date.now() - startTime
      };

      this.logger.info('Retention policy executed', result);
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Retention policy execution failed', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Anonymize old data
   */
  private async anonymizeOldData(
    client: any,
    daysOld: number
  ): Promise<number> {
    let totalAnonymized = 0;

    // Anonymize events
    const eventQuery = `
      UPDATE analytics.events
      SET 
        user_id = CASE 
          WHEN user_id IS NOT NULL THEN 'anon_' || encode(digest(user_id, 'sha256'), 'hex')
          ELSE NULL
        END,
        properties = jsonb_strip_nulls(
          properties 
          ${this.buildExcludeFieldsClause('properties')}
        ),
        context = jsonb_set(
          jsonb_set(
            context ${this.buildExcludeFieldsClause('context')},
            '{ip}',
            '"0.0.0.0"'
          ),
          '{userAgent}',
          '"Anonymized"'
        )
      WHERE 
        timestamp < NOW() - INTERVAL '${daysOld} days'
        AND user_id IS NOT NULL
        AND user_id NOT LIKE 'anon_%'
    `;

    const eventResult = await client.query(eventQuery);
    totalAnonymized += eventResult.rowCount;

    // Anonymize user profiles
    const profileQuery = `
      UPDATE analytics.user_profiles
      SET 
        user_id = 'anon_' || encode(digest(user_id, 'sha256'), 'hex'),
        traits = jsonb_strip_nulls(
          jsonb_build_object(
            'anonymized', true,
            'anonymized_at', NOW(),
            'total_events', traits->'total_events',
            'total_revenue', traits->'total_revenue',
            'first_seen', traits->'first_seen',
            'last_seen', traits->'last_seen'
          )
        )
      WHERE 
        created_at < NOW() - INTERVAL '${daysOld} days'
        AND user_id NOT LIKE 'anon_%'
    `;

    const profileResult = await client.query(profileQuery);
    totalAnonymized += profileResult.rowCount;

    return totalAnonymized;
  }

  /**
   * Delete old data
   */
  private async deleteOldData(
    client: any,
    daysOld: number
  ): Promise<number> {
    let totalDeleted = 0;

    // Delete old events
    const eventQuery = `
      DELETE FROM analytics.events
      WHERE timestamp < NOW() - INTERVAL '${daysOld} days'
    `;

    const eventResult = await client.query(eventQuery);
    totalDeleted += eventResult.rowCount;

    // Delete orphaned records
    const orphanQueries = [
      `DELETE FROM analytics.conversions 
       WHERE conversion_id NOT IN (SELECT event_id FROM analytics.events)`,
      `DELETE FROM analytics.attribution_touchpoints 
       WHERE timestamp < NOW() - INTERVAL '${daysOld} days'`,
      `DELETE FROM analytics.sessions 
       WHERE started_at < NOW() - INTERVAL '${daysOld} days'`,
      `DELETE FROM analytics.gdpr_requests 
       WHERE completed_at < NOW() - INTERVAL '90 days'`
    ];

    for (const query of orphanQueries) {
      const result = await client.query(query);
      totalDeleted += result.rowCount;
    }

    return totalDeleted;
  }

  /**
   * Compress old partitions
   */
  private async compressOldPartitions(
    client: any,
    daysOld: number
  ): Promise<number> {
    // Get old partitions
    const partitionQuery = `
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
      FROM pg_tables
      WHERE schemaname = 'analytics'
        AND tablename LIKE '%_20%'
        AND tablename < 'events_' || TO_CHAR(NOW() - INTERVAL '${daysOld} days', 'YYYY_MM')
      ORDER BY tablename
    `;

    const partitions = await client.query(partitionQuery);
    let compressed = 0;

    for (const partition of partitions.rows) {
      try {
        // Create compressed table
        const compressedTable = `${partition.tablename}_compressed`;
        
        await client.query(`
          CREATE TABLE IF NOT EXISTS analytics.${compressedTable} AS
          SELECT * FROM analytics.${partition.tablename}
          WITH NO DATA
        `);

        // Copy and compress data
        await client.query(`
          INSERT INTO analytics.${compressedTable}
          SELECT * FROM analytics.${partition.tablename}
        `);

        // Add compression
        await client.query(`
          ALTER TABLE analytics.${compressedTable} SET (fillfactor = 100);
          CLUSTER analytics.${compressedTable} USING ${partition.tablename}_pkey;
        `);

        compressed++;
        
        this.logger.debug('Partition compressed', {
          partition: partition.tablename,
          originalSize: partition.size
        });
      } catch (error) {
        this.logger.error('Failed to compress partition', error, {
          partition: partition.tablename
        });
      }
    }

    return compressed;
  }

  /**
   * Build exclude fields clause for JSONB
   */
  private buildExcludeFieldsClause(column: string): string {
    if (!this.policy.excludeFields || this.policy.excludeFields.length === 0) {
      return '';
    }

    return this.policy.excludeFields
      .map(field => ` - '${field}'`)
      .join('');
  }

  /**
   * Log retention execution
   */
  private async logRetentionExecution(
    client: any,
    results: {
      anonymized: number;
      deleted: number;
      compressed: number;
    }
  ): Promise<void> {
    const query = `
      INSERT INTO analytics.data_retention_log (
        action,
        affected_table,
        records_affected,
        criteria,
        executed_at
      ) VALUES 
        ('anonymize', 'multiple', $1, $2, NOW()),
        ('delete', 'multiple', $3, $4, NOW()),
        ('compress', 'partitions', $5, $6, NOW())
    `;

    await client.query(query, [
      results.anonymized,
      JSON.stringify(this.policy),
      results.deleted,
      JSON.stringify({ deleteAfterDays: this.policy.deleteAfterDays }),
      results.compressed,
      JSON.stringify({ retentionDays: this.policy.retentionDays })
    ]);
  }

  /**
   * Get retention statistics
   */
  async getRetentionStats(): Promise<any> {
    const query = `
      WITH data_age AS (
        SELECT 
          'events' as table_name,
          COUNT(*) as total_records,
          MIN(timestamp) as oldest_record,
          MAX(timestamp) as newest_record,
          COUNT(CASE WHEN user_id LIKE 'anon_%' THEN 1 END) as anonymized_records
        FROM analytics.events
        UNION ALL
        SELECT 
          'user_profiles' as table_name,
          COUNT(*) as total_records,
          MIN(created_at) as oldest_record,
          MAX(created_at) as newest_record,
          COUNT(CASE WHEN user_id LIKE 'anon_%' THEN 1 END) as anonymized_records
        FROM analytics.user_profiles
      ),
      retention_log AS (
        SELECT 
          action,
          SUM(records_affected) as total_affected,
          MAX(executed_at) as last_executed
        FROM analytics.data_retention_log
        WHERE executed_at > NOW() - INTERVAL '30 days'
        GROUP BY action
      )
      SELECT 
        json_build_object(
          'tables', json_agg(DISTINCT data_age),
          'retention_actions', json_agg(DISTINCT retention_log),
          'policy', $1::json
        ) as stats
      FROM data_age, retention_log
    `;

    const result = await this.pool.query(query, [JSON.stringify(this.policy)]);
    return result.rows[0].stats;
  }

  /**
   * Validate retention policy
   */
  validatePolicy(): string[] {
    const errors: string[] = [];

    if (this.policy.retentionDays <= 0) {
      errors.push('Retention days must be positive');
    }

    if (this.policy.anonymizeAfterDays <= 0) {
      errors.push('Anonymize after days must be positive');
    }

    if (this.policy.deleteAfterDays <= 0) {
      errors.push('Delete after days must be positive');
    }

    if (this.policy.anonymizeAfterDays >= this.policy.deleteAfterDays) {
      errors.push('Anonymize after days must be less than delete after days');
    }

    if (this.policy.retentionDays >= this.policy.anonymizeAfterDays) {
      errors.push('Retention days must be less than anonymize after days');
    }

    return errors;
  }

  /**
   * Update retention policy
   */
  updatePolicy(newPolicy: Partial<DataRetentionPolicy>): void {
    Object.assign(this.policy, newPolicy);
    
    const errors = this.validatePolicy();
    if (errors.length > 0) {
      throw new Error(`Invalid retention policy: ${errors.join(', ')}`);
    }

    this.logger.info('Retention policy updated', this.policy);
  }
}