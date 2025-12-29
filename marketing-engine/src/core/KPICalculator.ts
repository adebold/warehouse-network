import { v4 as uuidv4 } from 'uuid';
import { Database } from '../config/database';
import { RedisClient } from '../config/redis';
import { Logger } from '../utils/logger';
import { evaluate } from 'mathjs';
import {
  KPI,
  KPIResult,
  KPIUnit,
  KPIFrequency
} from '../types';

export interface KPIDefinition {
  name: string;
  description: string;
  formula: string;
  unit: KPIUnit;
  target?: number;
  frequency: KPIFrequency;
  dimensions?: string[];
}

export interface CalculationContext {
  period: { start: Date; end: Date };
  dimensions?: Record<string, string>;
  variables?: Record<string, number>;
}

export interface KPIComparison {
  current: KPIResult;
  previous: KPIResult;
  change: number;
  changePercentage: number;
  trend: 'up' | 'down' | 'stable';
  targetAchievement?: number;
}

export class KPICalculator {
  private db: Database;
  private redis: RedisClient;
  private logger: Logger;
  private formulaCache: Map<string, any>;
  private calculationQueue: Map<string, Promise<KPIResult>>;

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
    this.logger = new Logger('KPICalculator');
    this.formulaCache = new Map();
    this.calculationQueue = new Map();
  }

  async defineKPI(definition: KPIDefinition): Promise<KPI> {
    this.logger.info('Defining new KPI', { name: definition.name });

    // Validate formula
    try {
      this.validateFormula(definition.formula);
    } catch (error) {
      throw new Error(`Invalid KPI formula: ${error}`);
    }

    const kpiId = uuidv4();
    const query = `
      INSERT INTO kpis (
        id, name, description, formula, unit, target, frequency, dimensions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      kpiId,
      definition.name,
      definition.description,
      definition.formula,
      definition.unit,
      definition.target,
      definition.frequency,
      definition.dimensions || []
    ];

    const result = await this.db.query(query, values);
    const kpi = this.mapToKPI(result.rows[0]);

    this.logger.info('KPI defined successfully', { kpiId, name: definition.name });
    return kpi;
  }

  async updateKPI(kpiId: string, updates: Partial<KPIDefinition>): Promise<KPI> {
    this.logger.info('Updating KPI', { kpiId });

    // Validate formula if provided
    if (updates.formula) {
      try {
        this.validateFormula(updates.formula);
      } catch (error) {
        throw new Error(`Invalid KPI formula: ${error}`);
      }
    }

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.formula !== undefined) {
      updateFields.push(`formula = $${paramIndex++}`);
      values.push(updates.formula);
      // Clear formula cache
      this.formulaCache.delete(kpiId);
    }
    if (updates.unit !== undefined) {
      updateFields.push(`unit = $${paramIndex++}`);
      values.push(updates.unit);
    }
    if (updates.target !== undefined) {
      updateFields.push(`target = $${paramIndex++}`);
      values.push(updates.target);
    }
    if (updates.frequency !== undefined) {
      updateFields.push(`frequency = $${paramIndex++}`);
      values.push(updates.frequency);
    }
    if (updates.dimensions !== undefined) {
      updateFields.push(`dimensions = $${paramIndex++}`);
      values.push(updates.dimensions);
    }

    values.push(kpiId);

    const query = `
      UPDATE kpis 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('KPI not found');
    }

    return this.mapToKPI(result.rows[0]);
  }

  async calculate(kpiId: string, context: CalculationContext): Promise<KPIResult> {
    this.logger.info('Calculating KPI', { kpiId, period: context.period });

    // Check if calculation is already in progress
    const cacheKey = this.getCacheKey(kpiId, context);
    const inProgress = this.calculationQueue.get(cacheKey);
    if (inProgress) {
      return inProgress;
    }

    // Check cache
    const cached = await this.redis.get<KPIResult>(`kpi:result:${cacheKey}`);
    if (cached) {
      this.logger.debug('KPI result retrieved from cache', { kpiId });
      return cached;
    }

    // Start calculation
    const calculationPromise = this.performCalculation(kpiId, context);
    this.calculationQueue.set(cacheKey, calculationPromise);

    try {
      const result = await calculationPromise;
      
      // Cache result based on frequency
      const ttl = this.getCacheTTL(result);
      if (ttl > 0) {
        await this.redis.set(`kpi:result:${cacheKey}`, result, ttl);
      }

      return result;
    } finally {
      this.calculationQueue.delete(cacheKey);
    }
  }

  async calculateBatch(
    kpiIds: string[], 
    context: CalculationContext
  ): Promise<Map<string, KPIResult>> {
    const results = new Map<string, KPIResult>();
    
    // Calculate all KPIs in parallel
    const calculations = kpiIds.map(async (kpiId) => {
      try {
        const result = await this.calculate(kpiId, context);
        results.set(kpiId, result);
      } catch (error) {
        this.logger.error(`Failed to calculate KPI ${kpiId}`, error);
      }
    });

    await Promise.all(calculations);
    return results;
  }

  async comparePerformance(
    kpiId: string,
    currentPeriod: { start: Date; end: Date },
    previousPeriod: { start: Date; end: Date },
    dimensions?: Record<string, string>
  ): Promise<KPIComparison> {
    this.logger.info('Comparing KPI performance', { kpiId });

    // Get KPI definition
    const kpi = await this.getKPI(kpiId);
    if (!kpi) {
      throw new Error('KPI not found');
    }

    // Calculate for both periods
    const [current, previous] = await Promise.all([
      this.calculate(kpiId, { period: currentPeriod, dimensions }),
      this.calculate(kpiId, { period: previousPeriod, dimensions })
    ]);

    // Calculate change
    const change = current.value - previous.value;
    const changePercentage = previous.value !== 0 
      ? (change / previous.value) * 100 
      : 0;

    // Determine trend
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(changePercentage) > 1) {
      trend = change > 0 ? 'up' : 'down';
    }

    // Calculate target achievement if target exists
    const targetAchievement = kpi.target 
      ? (current.value / kpi.target) * 100 
      : undefined;

    return {
      current,
      previous,
      change,
      changePercentage,
      trend,
      targetAchievement
    };
  }

  async getFinancialMetrics(period: { start: Date; end: Date }): Promise<any> {
    const metrics = await this.db.query(`
      SELECT 
        -- Revenue metrics
        COALESCE(SUM((ae.metadata->>'revenue')::numeric), 0) as total_revenue,
        COUNT(DISTINCT ae.content_id) as active_content,
        COUNT(DISTINCT ae.channel_id) as active_channels,
        COUNT(DISTINCT ae.user_id) as unique_users,
        
        -- Conversion metrics
        COUNT(*) FILTER (WHERE ae.event_type = 'converted') as conversions,
        COALESCE(AVG((ae.metadata->>'revenue')::numeric), 0) as avg_order_value,
        
        -- Engagement metrics
        COUNT(*) FILTER (WHERE ae.event_type = 'clicked') as total_clicks,
        COUNT(*) FILTER (WHERE ae.event_type = 'opened') as total_opens,
        
        -- Cost metrics (if available in metadata)
        COALESCE(SUM((ae.metadata->>'cost')::numeric), 0) as total_cost
        
      FROM analytics_events ae
      WHERE ae.timestamp BETWEEN $1 AND $2
    `, [period.start, period.end]);

    const data = metrics.rows[0];
    
    // Calculate derived metrics
    const roi = data.total_cost > 0 
      ? ((data.total_revenue - data.total_cost) / data.total_cost) * 100 
      : 0;
    
    const conversionRate = data.total_clicks > 0 
      ? (data.conversions / data.total_clicks) * 100 
      : 0;
    
    const revenuePerUser = data.unique_users > 0 
      ? data.total_revenue / data.unique_users 
      : 0;

    return {
      revenue: {
        total: parseFloat(data.total_revenue),
        perUser: revenuePerUser,
        perConversion: data.conversions > 0 ? parseFloat(data.total_revenue) / data.conversions : 0
      },
      conversions: {
        count: parseInt(data.conversions),
        rate: conversionRate,
        averageOrderValue: parseFloat(data.avg_order_value)
      },
      engagement: {
        clicks: parseInt(data.total_clicks),
        opens: parseInt(data.total_opens),
        uniqueUsers: parseInt(data.unique_users)
      },
      efficiency: {
        cost: parseFloat(data.total_cost),
        roi: roi,
        costPerConversion: data.conversions > 0 ? parseFloat(data.total_cost) / data.conversions : 0
      },
      activity: {
        activeContent: parseInt(data.active_content),
        activeChannels: parseInt(data.active_channels)
      }
    };
  }

  async calculateCustomerLifetimeValue(userId?: string): Promise<any> {
    const query = userId 
      ? `
        SELECT 
          user_id,
          COUNT(DISTINCT DATE(timestamp)) as active_days,
          MIN(timestamp) as first_interaction,
          MAX(timestamp) as last_interaction,
          COUNT(*) FILTER (WHERE event_type = 'converted') as total_conversions,
          COALESCE(SUM((metadata->>'revenue')::numeric), 0) as total_revenue,
          COUNT(DISTINCT content_id) as content_interactions,
          COUNT(DISTINCT channel_id) as channel_interactions
        FROM analytics_events
        WHERE user_id = $1
        GROUP BY user_id
      `
      : `
        SELECT 
          AVG(user_metrics.total_revenue) as avg_clv,
          AVG(user_metrics.active_days) as avg_active_days,
          AVG(user_metrics.total_conversions) as avg_conversions,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY user_metrics.total_revenue) as median_clv
        FROM (
          SELECT 
            user_id,
            COUNT(DISTINCT DATE(timestamp)) as active_days,
            COUNT(*) FILTER (WHERE event_type = 'converted') as total_conversions,
            COALESCE(SUM((metadata->>'revenue')::numeric), 0) as total_revenue
          FROM analytics_events
          WHERE user_id IS NOT NULL
          GROUP BY user_id
        ) user_metrics
      `;

    const values = userId ? [userId] : [];
    const result = await this.db.query(query, values);

    if (userId) {
      const user = result.rows[0];
      if (!user) {
        return null;
      }

      const daysSinceFirst = Math.floor(
        (new Date(user.last_interaction).getTime() - new Date(user.first_interaction).getTime()) 
        / (1000 * 60 * 60 * 24)
      );

      const avgRevenuePerDay = daysSinceFirst > 0 
        ? parseFloat(user.total_revenue) / daysSinceFirst 
        : 0;

      return {
        userId: user.user_id,
        lifetimeValue: parseFloat(user.total_revenue),
        activeDays: parseInt(user.active_days),
        daysSinceFirstInteraction: daysSinceFirst,
        averageRevenuePerDay: avgRevenuePerDay,
        totalConversions: parseInt(user.total_conversions),
        contentInteractions: parseInt(user.content_interactions),
        channelInteractions: parseInt(user.channel_interactions),
        firstInteraction: user.first_interaction,
        lastInteraction: user.last_interaction
      };
    } else {
      const aggregate = result.rows[0];
      return {
        averageLifetimeValue: parseFloat(aggregate.avg_clv || '0'),
        medianLifetimeValue: parseFloat(aggregate.median_clv || '0'),
        averageActiveDays: parseFloat(aggregate.avg_active_days || '0'),
        averageConversions: parseFloat(aggregate.avg_conversions || '0')
      };
    }
  }

  async scheduleCalculation(kpiId: string, context: CalculationContext): Promise<void> {
    // Store calculation request
    const jobId = uuidv4();
    await this.redis.lpush('kpi:calculation:queue', {
      id: jobId,
      kpiId,
      context,
      scheduledAt: new Date()
    });

    this.logger.info('KPI calculation scheduled', { jobId, kpiId });
  }

  private async performCalculation(
    kpiId: string, 
    context: CalculationContext
  ): Promise<KPIResult> {
    // Get KPI definition
    const kpi = await this.getKPI(kpiId);
    if (!kpi) {
      throw new Error('KPI not found');
    }

    // Get variables for formula
    const variables = await this.gatherVariables(kpi.formula, context);

    // Evaluate formula
    let value: number;
    try {
      value = evaluate(kpi.formula, { ...variables, ...context.variables });
    } catch (error) {
      this.logger.error('Failed to evaluate KPI formula', error, { 
        kpiId, 
        formula: kpi.formula,
        variables 
      });
      throw new Error(`Failed to calculate KPI: ${error}`);
    }

    // Store result
    const result: KPIResult = {
      kpiId,
      value,
      dimensions: context.dimensions || {},
      period: context.period,
      calculatedAt: new Date()
    };

    await this.storeResult(result);
    return result;
  }

  private async gatherVariables(
    formula: string, 
    context: CalculationContext
  ): Promise<Record<string, number>> {
    const variables: Record<string, number> = {};

    // Extract variable names from formula
    const variablePattern = /\b[a-zA-Z_]\w*\b/g;
    const matches = formula.match(variablePattern) || [];
    const uniqueVars = [...new Set(matches)];

    // Fetch data for each variable
    for (const varName of uniqueVars) {
      // Skip math constants and functions
      if (['e', 'pi', 'sqrt', 'log', 'sin', 'cos', 'tan'].includes(varName)) {
        continue;
      }

      const value = await this.fetchVariableValue(varName, context);
      variables[varName] = value;
    }

    return variables;
  }

  private async fetchVariableValue(
    variableName: string,
    context: CalculationContext
  ): Promise<number> {
    // Map common variable names to database queries
    const queryMap: Record<string, string> = {
      revenue: `
        SELECT COALESCE(SUM((metadata->>'revenue')::numeric), 0) as value
        FROM analytics_events
        WHERE timestamp BETWEEN $1 AND $2
      `,
      conversions: `
        SELECT COUNT(*) as value
        FROM analytics_events
        WHERE event_type = 'converted' AND timestamp BETWEEN $1 AND $2
      `,
      clicks: `
        SELECT COUNT(*) as value
        FROM analytics_events
        WHERE event_type = 'clicked' AND timestamp BETWEEN $1 AND $2
      `,
      opens: `
        SELECT COUNT(*) as value
        FROM analytics_events
        WHERE event_type = 'opened' AND timestamp BETWEEN $1 AND $2
      `,
      sent: `
        SELECT COUNT(*) as value
        FROM analytics_events
        WHERE event_type = 'sent' AND timestamp BETWEEN $1 AND $2
      `,
      uniqueUsers: `
        SELECT COUNT(DISTINCT user_id) as value
        FROM analytics_events
        WHERE timestamp BETWEEN $1 AND $2
      `,
      activeContent: `
        SELECT COUNT(DISTINCT content_id) as value
        FROM analytics_events
        WHERE timestamp BETWEEN $1 AND $2
      `,
      activeChannels: `
        SELECT COUNT(DISTINCT channel_id) as value
        FROM analytics_events
        WHERE timestamp BETWEEN $1 AND $2
      `
    };

    const query = queryMap[variableName];
    if (!query) {
      // Try to fetch from custom metrics
      const customValue = await this.fetchCustomMetric(variableName, context);
      if (customValue !== null) {
        return customValue;
      }
      
      throw new Error(`Unknown variable: ${variableName}`);
    }

    const values = [context.period.start, context.period.end];
    
    // Add dimension filters if present
    let finalQuery = query;
    if (context.dimensions && Object.keys(context.dimensions).length > 0) {
      const dimensionConditions = Object.entries(context.dimensions)
        .map(([key, value], index) => `metadata->>'${key}' = $${index + 3}`)
        .join(' AND ');
      
      finalQuery = query.replace('WHERE', `WHERE ${dimensionConditions} AND`);
      values.push(...Object.values(context.dimensions));
    }

    const result = await this.db.query(finalQuery, values);
    return parseFloat(result.rows[0]?.value || '0');
  }

  private async fetchCustomMetric(
    metricName: string,
    context: CalculationContext
  ): Promise<number | null> {
    // Check if it's a stored metric
    const query = `
      SELECT value FROM kpi_results
      WHERE kpi_id = (SELECT id FROM kpis WHERE name = $1)
        AND period_start = $2 AND period_end = $3
      ORDER BY calculated_at DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [
      metricName,
      context.period.start,
      context.period.end
    ]);

    return result.rows[0]?.value || null;
  }

  private async storeResult(result: KPIResult): Promise<void> {
    const query = `
      INSERT INTO kpi_results (
        kpi_id, value, dimensions, period_start, period_end
      ) VALUES ($1, $2, $3, $4, $5)
    `;

    await this.db.query(query, [
      result.kpiId,
      result.value,
      JSON.stringify(result.dimensions),
      result.period.start,
      result.period.end
    ]);
  }

  private async getKPI(kpiId: string): Promise<KPI | null> {
    const query = `SELECT * FROM kpis WHERE id = $1`;
    const result = await this.db.query(query, [kpiId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToKPI(result.rows[0]);
  }

  private validateFormula(formula: string): void {
    try {
      // Test with dummy variables
      const testVars: Record<string, number> = {
        revenue: 1000,
        conversions: 50,
        clicks: 100,
        opens: 200,
        sent: 500,
        uniqueUsers: 150,
        activeContent: 10,
        activeChannels: 5
      };

      const result = evaluate(formula, testVars);
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Formula must evaluate to a finite number');
      }
    } catch (error) {
      throw new Error(`Invalid formula: ${error}`);
    }
  }

  private getCacheKey(kpiId: string, context: CalculationContext): string {
    const periodKey = `${context.period.start.toISOString()}_${context.period.end.toISOString()}`;
    const dimensionKey = context.dimensions 
      ? Object.entries(context.dimensions).map(([k, v]) => `${k}:${v}`).join('_')
      : 'nodim';
    
    return `${kpiId}_${periodKey}_${dimensionKey}`;
  }

  private getCacheTTL(result: KPIResult): number {
    // Cache based on how recent the data is
    const age = Date.now() - result.calculatedAt.getTime();
    
    if (age < 60000) { // Less than 1 minute old
      return 60; // Cache for 1 minute
    } else if (age < 3600000) { // Less than 1 hour old
      return 300; // Cache for 5 minutes
    } else if (age < 86400000) { // Less than 1 day old
      return 3600; // Cache for 1 hour
    } else {
      return 86400; // Cache for 1 day
    }
  }

  private mapToKPI(row: any): KPI {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      formula: row.formula,
      unit: row.unit,
      target: row.target ? parseFloat(row.target) : undefined,
      frequency: row.frequency,
      dimensions: row.dimensions || []
    };
  }
}