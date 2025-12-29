/**
 * Repository for attribution data persistence
 */

import { Pool } from 'pg';
import { Logger } from '../core/logger';
import {
  AttributionTouchpoint,
  AttributionResult,
  ConversionEvent
} from '../core/types';

export interface TouchpointRepositoryOptions {
  pool: Pool;
  logger: Logger;
}

export class TouchpointRepository {
  private readonly pool: Pool;
  private readonly logger: Logger;

  constructor(options: TouchpointRepositoryOptions) {
    this.pool = options.pool;
    this.logger = options.logger.child({ component: 'TouchpointRepository' });
  }

  /**
   * Save a touchpoint
   */
  async saveTouchpoint(touchpoint: AttributionTouchpoint): Promise<void> {
    const query = `
      INSERT INTO attribution_touchpoints (
        touchpoint_id,
        user_id,
        timestamp,
        channel,
        campaign,
        source,
        medium,
        event_data,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (touchpoint_id) DO UPDATE SET
        updated_at = NOW()
    `;

    try {
      await this.pool.query(query, [
        touchpoint.touchpointId,
        touchpoint.userId,
        touchpoint.timestamp,
        touchpoint.channel,
        touchpoint.campaign,
        touchpoint.source,
        touchpoint.medium,
        JSON.stringify(touchpoint.event)
      ]);
    } catch (error) {
      this.logger.error('Failed to save touchpoint', error);
      throw error;
    }
  }

  /**
   * Get touchpoints for a user within lookback window
   */
  async getTouchpointsByUser(
    userId: string,
    lookbackDays: number
  ): Promise<AttributionTouchpoint[]> {
    const query = `
      SELECT 
        touchpoint_id,
        user_id,
        timestamp,
        channel,
        campaign,
        source,
        medium,
        event_data,
        credit
      FROM attribution_touchpoints
      WHERE user_id = $1
        AND timestamp >= NOW() - INTERVAL '${lookbackDays} days'
      ORDER BY timestamp ASC
    `;

    try {
      const result = await this.pool.query(query, [userId]);
      
      return result.rows.map(row => ({
        touchpointId: row.touchpoint_id,
        userId: row.user_id,
        timestamp: row.timestamp,
        channel: row.channel,
        campaign: row.campaign,
        source: row.source,
        medium: row.medium,
        event: row.event_data,
        credit: row.credit
      }));
    } catch (error) {
      this.logger.error('Failed to get touchpoints', error);
      throw error;
    }
  }

  /**
   * Save attribution result
   */
  async saveAttributionResult(result: AttributionResult): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Save attribution result
      const resultQuery = `
        INSERT INTO attribution_results (
          conversion_id,
          conversion_value,
          model_id,
          model_type,
          calculated_at,
          touchpoint_count
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await client.query(resultQuery, [
        result.conversionId,
        result.conversionValue,
        result.model.modelId,
        result.model.type,
        result.calculatedAt,
        result.touchpoints.length
      ]);

      // Update touchpoint credits
      for (const touchpoint of result.touchpoints) {
        const creditQuery = `
          INSERT INTO attribution_credits (
            conversion_id,
            touchpoint_id,
            model_id,
            credit,
            value_attributed
          ) VALUES ($1, $2, $3, $4, $5)
        `;

        await client.query(creditQuery, [
          result.conversionId,
          touchpoint.touchpointId,
          result.model.modelId,
          touchpoint.credit,
          result.conversionValue * (touchpoint.credit || 0)
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to save attribution result', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get conversions for a user
   */
  async getConversionsByUser(userId: string): Promise<ConversionEvent[]> {
    const query = `
      SELECT 
        event_id,
        event_name,
        user_id,
        anonymous_id,
        timestamp,
        properties,
        context,
        conversion_value,
        currency,
        transaction_id,
        items
      FROM analytics_events
      WHERE user_id = $1
        AND event_type = 'conversion'
      ORDER BY timestamp DESC
    `;

    try {
      const result = await this.pool.query(query, [userId]);
      
      return result.rows.map(row => ({
        eventId: row.event_id,
        eventName: row.event_name,
        userId: row.user_id,
        anonymousId: row.anonymous_id,
        timestamp: row.timestamp,
        properties: row.properties,
        context: row.context,
        conversionValue: row.conversion_value,
        currency: row.currency,
        transactionId: row.transaction_id,
        items: row.items
      }));
    } catch (error) {
      this.logger.error('Failed to get conversions', error);
      throw error;
    }
  }

  /**
   * Get conversion by ID
   */
  async getConversion(conversionId: string): Promise<ConversionEvent | null> {
    const query = `
      SELECT 
        event_id,
        event_name,
        user_id,
        anonymous_id,
        timestamp,
        properties,
        context,
        conversion_value,
        currency,
        transaction_id,
        items
      FROM analytics_events
      WHERE event_id = $1
        AND event_type = 'conversion'
    `;

    try {
      const result = await this.pool.query(query, [conversionId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        eventId: row.event_id,
        eventName: row.event_name,
        userId: row.user_id,
        anonymousId: row.anonymous_id,
        timestamp: row.timestamp,
        properties: row.properties,
        context: row.context,
        conversionValue: row.conversion_value,
        currency: row.currency,
        transactionId: row.transaction_id,
        items: row.items
      };
    } catch (error) {
      this.logger.error('Failed to get conversion', error);
      throw error;
    }
  }

  /**
   * Get training data for ML model
   */
  async getTrainingData(
    fromDate: Date,
    toDate: Date
  ): Promise<Array<{ touchpoints: AttributionTouchpoint[]; conversionOccurred: boolean }>> {
    const query = `
      WITH user_journeys AS (
        SELECT 
          t.user_id,
          ARRAY_AGG(
            ROW(
              t.touchpoint_id,
              t.user_id,
              t.timestamp,
              t.channel,
              t.campaign,
              t.source,
              t.medium,
              t.event_data
            ) ORDER BY t.timestamp
          ) as touchpoints,
          BOOL_OR(c.event_id IS NOT NULL) as converted
        FROM attribution_touchpoints t
        LEFT JOIN analytics_events c ON 
          c.user_id = t.user_id 
          AND c.event_type = 'conversion'
          AND c.timestamp > t.timestamp
          AND c.timestamp <= t.timestamp + INTERVAL '30 days'
        WHERE t.timestamp BETWEEN $1 AND $2
        GROUP BY t.user_id
      )
      SELECT * FROM user_journeys
    `;

    try {
      const result = await this.pool.query(query, [fromDate, toDate]);
      
      return result.rows.map(row => ({
        touchpoints: row.touchpoints.map((tp: any) => ({
          touchpointId: tp.f1,
          userId: tp.f2,
          timestamp: tp.f3,
          channel: tp.f4,
          campaign: tp.f5,
          source: tp.f6,
          medium: tp.f7,
          event: tp.f8
        })),
        conversionOccurred: row.converted
      }));
    } catch (error) {
      this.logger.error('Failed to get training data', error);
      throw error;
    }
  }

  /**
   * Get channel performance metrics
   */
  async getChannelPerformance(
    fromDate: Date,
    toDate: Date
  ): Promise<Record<string, any>> {
    const query = `
      SELECT 
        t.channel,
        COUNT(DISTINCT t.user_id) as unique_users,
        COUNT(DISTINCT t.touchpoint_id) as touchpoints,
        COUNT(DISTINCT c.conversion_id) as conversions,
        SUM(c.value_attributed) as total_value,
        AVG(c.credit) as avg_credit
      FROM attribution_touchpoints t
      LEFT JOIN attribution_credits c ON t.touchpoint_id = c.touchpoint_id
      WHERE t.timestamp BETWEEN $1 AND $2
      GROUP BY t.channel
    `;

    try {
      const result = await this.pool.query(query, [fromDate, toDate]);
      
      const performance: Record<string, any> = {};
      result.rows.forEach(row => {
        performance[row.channel] = {
          uniqueUsers: parseInt(row.unique_users),
          touchpoints: parseInt(row.touchpoints),
          conversions: parseInt(row.conversions),
          totalValue: parseFloat(row.total_value || '0'),
          avgCredit: parseFloat(row.avg_credit || '0'),
          roi: row.total_value && row.touchpoints ? 
            parseFloat(row.total_value) / parseInt(row.touchpoints) : 0
        };
      });
      
      return performance;
    } catch (error) {
      this.logger.error('Failed to get channel performance', error);
      throw error;
    }
  }

  /**
   * Get common conversion paths
   */
  async getCommonPaths(
    fromDate: Date,
    toDate: Date,
    limit: number = 10
  ): Promise<any[]> {
    const query = `
      WITH conversion_paths AS (
        SELECT 
          STRING_AGG(t.channel, ' -> ' ORDER BY t.timestamp) as path,
          COUNT(DISTINCT ar.conversion_id) as conversions,
          AVG(ar.conversion_value) as avg_value
        FROM attribution_results ar
        JOIN attribution_credits ac ON ar.conversion_id = ac.conversion_id
        JOIN attribution_touchpoints t ON ac.touchpoint_id = t.touchpoint_id
        WHERE ar.calculated_at BETWEEN $1 AND $2
        GROUP BY ar.conversion_id
      )
      SELECT 
        path,
        COUNT(*) as occurrences,
        SUM(conversions) as total_conversions,
        AVG(avg_value) as avg_conversion_value
      FROM conversion_paths
      GROUP BY path
      ORDER BY occurrences DESC
      LIMIT $3
    `;

    try {
      const result = await this.pool.query(query, [fromDate, toDate, limit]);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get common paths', error);
      throw error;
    }
  }

  /**
   * Get model performance comparison
   */
  async getModelPerformance(
    fromDate: Date,
    toDate: Date
  ): Promise<any[]> {
    const query = `
      SELECT 
        model_type,
        COUNT(*) as calculations,
        AVG(touchpoint_count) as avg_touchpoints,
        SUM(conversion_value) as total_value,
        AVG(conversion_value) as avg_conversion_value
      FROM attribution_results
      WHERE calculated_at BETWEEN $1 AND $2
      GROUP BY model_type
      ORDER BY total_value DESC
    `;

    try {
      const result = await this.pool.query(query, [fromDate, toDate]);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get model performance', error);
      throw error;
    }
  }
}