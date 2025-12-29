/**
 * Main repository for analytics data operations
 */

import { Pool, PoolClient } from 'pg';
import { Logger } from '../core/logger';
import { 
  AnalyticsEvent, 
  ConversionEvent, 
  UserProfile,
  GDPRRequest 
} from '../core/types';
import { DatabasePool } from './pool';

export interface AnalyticsRepositoryOptions {
  pool: DatabasePool;
  logger: Logger;
}

export class AnalyticsRepository {
  private readonly pool: DatabasePool;
  private readonly logger: Logger;

  constructor(options: AnalyticsRepositoryOptions) {
    this.pool = options.pool;
    this.logger = options.logger.child({ component: 'AnalyticsRepository' });
  }

  /**
   * Save analytics event
   */
  async saveEvent(event: AnalyticsEvent): Promise<void> {
    const query = `
      INSERT INTO analytics.events (
        event_id,
        event_type,
        event_name,
        user_id,
        anonymous_id,
        timestamp,
        properties,
        context,
        integrations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    try {
      await this.pool.query(query, [
        event.eventId,
        'track', // Default event type
        event.eventName,
        event.userId,
        event.anonymousId,
        event.timestamp,
        JSON.stringify(event.properties),
        JSON.stringify(event.context),
        JSON.stringify(event.integrations || {})
      ]);

      this.logger.debug('Event saved', { eventId: event.eventId });
    } catch (error) {
      this.logger.error('Failed to save event', error, {
        eventId: event.eventId
      });
      throw error;
    }
  }

  /**
   * Save conversion event
   */
  async saveConversion(event: ConversionEvent): Promise<void> {
    const client = await this.pool.getClient();
    
    try {
      await client.query('BEGIN');

      // Save base event
      const eventQuery = `
        INSERT INTO analytics.events (
          event_id,
          event_type,
          event_name,
          user_id,
          anonymous_id,
          timestamp,
          properties,
          context,
          integrations
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      await client.query(eventQuery, [
        event.eventId,
        'conversion',
        event.eventName,
        event.userId,
        event.anonymousId,
        event.timestamp,
        JSON.stringify(event.properties),
        JSON.stringify(event.context),
        JSON.stringify(event.integrations || {})
      ]);

      // Save conversion details
      const conversionQuery = `
        INSERT INTO analytics.conversions (
          conversion_id,
          user_id,
          conversion_value,
          currency,
          transaction_id,
          items
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await client.query(conversionQuery, [
        event.eventId,
        event.userId,
        event.conversionValue,
        event.currency,
        event.transactionId,
        JSON.stringify(event.items || [])
      ]);

      await client.query('COMMIT');
      
      this.logger.info('Conversion saved', {
        eventId: event.eventId,
        value: event.conversionValue,
        currency: event.currency
      });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to save conversion', error, {
        eventId: event.eventId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save or update user profile
   */
  async saveUserProfile(profile: UserProfile): Promise<void> {
    const query = `
      INSERT INTO analytics.user_profiles (
        user_id,
        traits,
        integrations
      ) VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET
        traits = $2,
        integrations = $3,
        updated_at = NOW()
    `;

    try {
      await this.pool.query(query, [
        profile.userId,
        JSON.stringify(profile.traits),
        JSON.stringify(profile.integrations)
      ]);

      this.logger.debug('User profile saved', { userId: profile.userId });
    } catch (error) {
      this.logger.error('Failed to save user profile', error, {
        userId: profile.userId
      });
      throw error;
    }
  }

  /**
   * Get events by user
   */
  async getEventsByUser(
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AnalyticsEvent[]> {
    const query = `
      SELECT 
        event_id,
        event_name,
        user_id,
        anonymous_id,
        timestamp,
        properties,
        context,
        integrations
      FROM analytics.events
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await this.pool.query<any>(query, [userId, limit, offset]);
      
      return result.rows.map(row => ({
        eventId: row.event_id,
        eventName: row.event_name,
        userId: row.user_id,
        anonymousId: row.anonymous_id,
        timestamp: row.timestamp,
        properties: row.properties,
        context: row.context,
        integrations: row.integrations
      }));
    } catch (error) {
      this.logger.error('Failed to get events by user', error, { userId });
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const query = `
      SELECT 
        user_id,
        traits,
        integrations,
        created_at,
        updated_at
      FROM analytics.user_profiles
      WHERE user_id = $1
    `;

    try {
      const result = await this.pool.query<any>(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        userId: row.user_id,
        traits: row.traits,
        integrations: row.integrations,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      this.logger.error('Failed to get user profile', error, { userId });
      throw error;
    }
  }

  /**
   * Create GDPR request
   */
  async createGDPRRequest(request: Omit<GDPRRequest, 'requestId' | 'requestedAt'>): Promise<string> {
    const query = `
      INSERT INTO analytics.gdpr_requests (
        user_id,
        request_type,
        status
      ) VALUES ($1, $2, $3)
      RETURNING request_id
    `;

    try {
      const result = await this.pool.query<{ request_id: string }>(query, [
        request.userId,
        request.type,
        request.status
      ]);

      const requestId = result.rows[0].request_id;
      
      this.logger.info('GDPR request created', {
        requestId,
        userId: request.userId,
        type: request.type
      });

      return requestId;
    } catch (error) {
      this.logger.error('Failed to create GDPR request', error);
      throw error;
    }
  }

  /**
   * Execute data retention policy
   */
  async executeDataRetention(
    retentionDays: number,
    anonymizeAfterDays: number
  ): Promise<{ anonymized: number; deleted: number }> {
    const client = await this.pool.getClient();
    
    try {
      await client.query('BEGIN');

      // Anonymize old data
      const anonymizeQuery = `
        UPDATE analytics.events
        SET 
          user_id = NULL,
          properties = properties - 'email' - 'name' - 'phone',
          context = jsonb_set(context, '{ip}', '"0.0.0.0"')
        WHERE 
          timestamp < NOW() - INTERVAL '${anonymizeAfterDays} days'
          AND user_id IS NOT NULL
      `;

      const anonymizeResult = await client.query(anonymizeQuery);
      const anonymized = anonymizeResult.rowCount;

      // Delete very old data
      const deleteQuery = `
        DELETE FROM analytics.events
        WHERE timestamp < NOW() - INTERVAL '${retentionDays * 2} days'
      `;

      const deleteResult = await client.query(deleteQuery);
      const deleted = deleteResult.rowCount;

      // Log retention action
      const logQuery = `
        INSERT INTO analytics.data_retention_log (
          action,
          affected_table,
          records_affected,
          criteria
        ) VALUES 
          ('anonymize', 'events', $1, $2),
          ('delete', 'events', $3, $4)
      `;

      await client.query(logQuery, [
        anonymized,
        JSON.stringify({ days: anonymizeAfterDays }),
        deleted,
        JSON.stringify({ days: retentionDays * 2 })
      ]);

      await client.query('COMMIT');
      
      this.logger.info('Data retention executed', {
        anonymized,
        deleted
      });

      return { anonymized, deleted };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to execute data retention', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get analytics metrics for a time period
   */
  async getMetrics(
    startDate: Date,
    endDate: Date,
    groupBy: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<any[]> {
    const query = `
      SELECT 
        DATE_TRUNC($3, timestamp) as period,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT anonymous_id) as unique_visitors,
        COUNT(*) as total_events,
        COUNT(DISTINCT CASE WHEN event_type = 'conversion' THEN event_id END) as conversions,
        SUM(CASE WHEN event_type = 'conversion' THEN c.conversion_value ELSE 0 END) as revenue
      FROM analytics.events e
      LEFT JOIN analytics.conversions c ON e.event_id = c.conversion_id
      WHERE timestamp BETWEEN $1 AND $2
      GROUP BY period
      ORDER BY period ASC
    `;

    try {
      const result = await this.pool.query(query, [startDate, endDate, groupBy]);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get metrics', error);
      throw error;
    }
  }
}