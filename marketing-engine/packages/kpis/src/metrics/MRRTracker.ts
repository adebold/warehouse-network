import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { 
  MRRMetrics, 
  KPIFilters,
  Customer,
  Revenue 
} from '../types/kpi.types';

export class MRRTracker {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:mrr:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(date?: Date): Promise<MRRMetrics> {
    const targetDate = date || new Date();
    const cacheKey = this.getCacheKey(targetDate);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('MRR metrics retrieved from cache', { date: targetDate });
        return this.deserializeMetrics(JSON.parse(cached));
      }

      // Calculate metrics
      const metrics = await this.calculateMetrics(targetDate);

      // Cache the results
      await this.redis.set(
        cacheKey, 
        JSON.stringify(this.serializeMetrics(metrics)), 
        this.cacheTTL
      );

      // Store in database for historical tracking
      await this.storeCalculation(metrics, targetDate);

      return metrics;
    } catch (error) {
      logger.error('Error calculating MRR metrics', { error, date: targetDate });
      throw error;
    }
  }

  private async calculateMetrics(targetDate: Date): Promise<MRRMetrics> {
    const previousMonth = new Date(targetDate);
    previousMonth.setMonth(previousMonth.getMonth() - 1);

    // Get current month data
    const currentData = await this.fetchMonthData(targetDate);
    const previousData = await this.fetchMonthData(previousMonth);

    // Calculate current MRR
    const currentMRR = this.calculateTotalMRR(currentData.activeRevenues);
    const previousMRR = this.calculateTotalMRR(previousData.activeRevenues);

    // Calculate new MRR (from new customers)
    const newMRR = await this.calculateNewMRR(
      currentData.newCustomers,
      currentData.revenues,
      targetDate
    );

    // Calculate expansion MRR (upgrades, upsells)
    const expansionMRR = await this.calculateExpansionMRR(
      currentData.existingCustomers,
      currentData.revenues,
      previousData.revenues,
      targetDate
    );

    // Calculate churned MRR
    const churnedMRR = await this.calculateChurnedMRR(
      currentData.churnedCustomers,
      previousData.revenues
    );

    // Calculate net new MRR
    const netNewMRR = newMRR.plus(expansionMRR).minus(churnedMRR);

    // Calculate growth rate
    const growthRate = previousMRR.greaterThan(0)
      ? netNewMRR.dividedBy(previousMRR).times(100)
      : new Decimal(0);

    // Calculate ARPU
    const customerCount = currentData.activeCustomers.length;
    const arpu = customerCount > 0
      ? currentMRR.dividedBy(customerCount)
      : new Decimal(0);

    return {
      currentMRR,
      newMRR,
      expansionMRR,
      churnedMRR,
      netNewMRR,
      growthRate,
      customerCount,
      arpu,
      trend: {
        previous: previousMRR,
        changePercent: previousMRR.greaterThan(0)
          ? currentMRR.minus(previousMRR).dividedBy(previousMRR).times(100)
          : new Decimal(0)
      }
    };
  }

  private async fetchMonthData(date: Date): Promise<{
    activeCustomers: Customer[];
    newCustomers: Customer[];
    existingCustomers: Customer[];
    churnedCustomers: Customer[];
    activeRevenues: Revenue[];
    revenues: Revenue[];
  }> {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfPreviousMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);

    // Fetch all customers
    const customersQuery = `
      SELECT 
        c.id,
        c.lead_id as "leadId",
        c.external_id as "externalId",
        c.email,
        c.acquisition_date as "acquisitionDate",
        c.acquisition_channel as "acquisitionChannel",
        c.acquisition_cost as "acquisitionCost",
        c.lifetime_value as "lifetimeValue",
        c.churn_date as "churnDate",
        c.created_at as "createdAt",
        c.updated_at as "updatedAt",
        c.metadata
      FROM customers c
    `;
    
    const customersResult = await this.db.query<Customer>(customersQuery);
    const allCustomers = customersResult.rows;

    // Categorize customers
    const activeCustomers = allCustomers.filter(c => 
      (!c.churnDate || c.churnDate > endOfMonth) &&
      c.acquisitionDate <= endOfMonth
    );

    const newCustomers = allCustomers.filter(c =>
      c.acquisitionDate >= startOfMonth &&
      c.acquisitionDate <= endOfMonth
    );

    const existingCustomers = activeCustomers.filter(c =>
      c.acquisitionDate < startOfMonth
    );

    const churnedCustomers = allCustomers.filter(c =>
      c.churnDate &&
      c.churnDate >= startOfMonth &&
      c.churnDate <= endOfMonth
    );

    // Fetch recurring revenues for the month
    const revenuesQuery = `
      SELECT 
        id,
        customer_id as "customerId",
        amount,
        revenue_date as "revenueDate",
        type,
        recurring,
        created_at as "createdAt",
        metadata
      FROM revenue
      WHERE recurring = true
        AND revenue_date >= $1
        AND revenue_date <= $2
      ORDER BY revenue_date
    `;
    
    const revenuesResult = await this.db.query<Revenue>(
      revenuesQuery,
      [startOfMonth, endOfMonth]
    );
    const revenues = revenuesResult.rows;

    // Get active recurring revenues (most recent per customer)
    const activeRevenues = this.getActiveRecurringRevenues(revenues, activeCustomers);

    return {
      activeCustomers,
      newCustomers,
      existingCustomers,
      churnedCustomers,
      activeRevenues,
      revenues
    };
  }

  private getActiveRecurringRevenues(
    revenues: Revenue[], 
    activeCustomers: Customer[]
  ): Revenue[] {
    const activeCustomerIds = new Set(activeCustomers.map(c => c.id));
    const latestRevenueByCustomer = new Map<string, Revenue>();

    revenues.forEach(revenue => {
      if (activeCustomerIds.has(revenue.customerId)) {
        const existing = latestRevenueByCustomer.get(revenue.customerId);
        if (!existing || revenue.revenueDate > existing.revenueDate) {
          latestRevenueByCustomer.set(revenue.customerId, revenue);
        }
      }
    });

    return Array.from(latestRevenueByCustomer.values());
  }

  private calculateTotalMRR(revenues: Revenue[]): Decimal {
    return revenues.reduce(
      (sum, rev) => sum.plus(rev.amount),
      new Decimal(0)
    );
  }

  private async calculateNewMRR(
    newCustomers: Customer[],
    revenues: Revenue[],
    targetDate: Date
  ): Promise<Decimal> {
    const newCustomerIds = new Set(newCustomers.map(c => c.id));
    
    const newCustomerRevenues = revenues.filter(r => 
      newCustomerIds.has(r.customerId) && r.recurring
    );

    // Get latest revenue per new customer
    const latestRevenueByCustomer = new Map<string, Revenue>();
    
    newCustomerRevenues.forEach(revenue => {
      const existing = latestRevenueByCustomer.get(revenue.customerId);
      if (!existing || revenue.revenueDate > existing.revenueDate) {
        latestRevenueByCustomer.set(revenue.customerId, revenue);
      }
    });

    return Array.from(latestRevenueByCustomer.values()).reduce(
      (sum, rev) => sum.plus(rev.amount),
      new Decimal(0)
    );
  }

  private async calculateExpansionMRR(
    existingCustomers: Customer[],
    currentRevenues: Revenue[],
    previousRevenues: Revenue[],
    targetDate: Date
  ): Promise<Decimal> {
    const existingCustomerIds = new Set(existingCustomers.map(c => c.id));
    let expansionMRR = new Decimal(0);

    // Get current and previous revenue per customer
    const currentRevenueByCustomer = new Map<string, Decimal>();
    const previousRevenueByCustomer = new Map<string, Decimal>();

    currentRevenues.forEach(rev => {
      if (existingCustomerIds.has(rev.customerId) && rev.recurring) {
        const existing = currentRevenueByCustomer.get(rev.customerId) || new Decimal(0);
        currentRevenueByCustomer.set(rev.customerId, existing.plus(rev.amount));
      }
    });

    previousRevenues.forEach(rev => {
      if (existingCustomerIds.has(rev.customerId) && rev.recurring) {
        const existing = previousRevenueByCustomer.get(rev.customerId) || new Decimal(0);
        previousRevenueByCustomer.set(rev.customerId, existing.plus(rev.amount));
      }
    });

    // Calculate expansion
    currentRevenueByCustomer.forEach((currentAmount, customerId) => {
      const previousAmount = previousRevenueByCustomer.get(customerId) || new Decimal(0);
      if (currentAmount.greaterThan(previousAmount)) {
        const expansion = currentAmount.minus(previousAmount);
        expansionMRR = expansionMRR.plus(expansion);
      }
    });

    return expansionMRR;
  }

  private async calculateChurnedMRR(
    churnedCustomers: Customer[],
    previousRevenues: Revenue[]
  ): Promise<Decimal> {
    const churnedCustomerIds = new Set(churnedCustomers.map(c => c.id));
    
    const churnedRevenues = previousRevenues.filter(r => 
      churnedCustomerIds.has(r.customerId) && r.recurring
    );

    // Get latest revenue per churned customer
    const latestRevenueByCustomer = new Map<string, Revenue>();
    
    churnedRevenues.forEach(revenue => {
      const existing = latestRevenueByCustomer.get(revenue.customerId);
      if (!existing || revenue.revenueDate > existing.revenueDate) {
        latestRevenueByCustomer.set(revenue.customerId, revenue);
      }
    });

    return Array.from(latestRevenueByCustomer.values()).reduce(
      (sum, rev) => sum.plus(rev.amount),
      new Decimal(0)
    );
  }

  public async calculateMRRGrowth(months: number = 12): Promise<{
    month: string;
    mrr: Decimal;
    growth: Decimal;
    newMRR: Decimal;
    expansionMRR: Decimal;
    churnedMRR: Decimal;
  }[]> {
    const results: {
      month: string;
      mrr: Decimal;
      growth: Decimal;
      newMRR: Decimal;
      expansionMRR: Decimal;
      churnedMRR: Decimal;
    }[] = [];

    const currentDate = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i,
        1
      );
      
      const metrics = await this.calculate(date);
      
      results.push({
        month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        mrr: metrics.currentMRR,
        growth: metrics.growthRate,
        newMRR: metrics.newMRR,
        expansionMRR: metrics.expansionMRR,
        churnedMRR: metrics.churnedMRR
      });
    }

    return results;
  }

  public async calculateCohortMRR(cohortSize: number = 6): Promise<Map<string, {
    cohort: string;
    months: {
      month: number;
      mrr: Decimal;
      retention: Decimal;
    }[];
  }>> {
    const cohortData = new Map<string, {
      cohort: string;
      months: {
        month: number;
        mrr: Decimal;
        retention: Decimal;
      }[];
    }>();

    // Get cohorts for the last N months
    const currentDate = new Date();
    
    for (let i = cohortSize - 1; i >= 0; i--) {
      const cohortDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i,
        1
      );
      
      const cohortKey = cohortDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short' 
      });
      
      // Track this cohort's MRR over time
      const cohortMonths: {
        month: number;
        mrr: Decimal;
        retention: Decimal;
      }[] = [];
      
      // Get customers from this cohort
      const cohortQuery = `
        SELECT id 
        FROM customers 
        WHERE DATE_TRUNC('month', acquisition_date) = DATE_TRUNC('month', $1::date)
      `;
      
      const cohortResult = await this.db.query<{ id: string }>(
        cohortQuery,
        [cohortDate]
      );
      
      const cohortCustomerIds = cohortResult.rows.map(r => r.id);
      const originalCount = cohortCustomerIds.length;
      
      if (originalCount === 0) continue;
      
      // Track MRR for each subsequent month
      for (let monthOffset = 0; monthOffset <= i; monthOffset++) {
        const analysisDate = new Date(
          cohortDate.getFullYear(),
          cohortDate.getMonth() + monthOffset,
          1
        );
        
        const mrrData = await this.calculateCohortMRRForMonth(
          cohortCustomerIds,
          analysisDate
        );
        
        cohortMonths.push({
          month: monthOffset,
          mrr: mrrData.mrr,
          retention: mrrData.activeCount.dividedBy(originalCount)
        });
      }
      
      cohortData.set(cohortKey, {
        cohort: cohortKey,
        months: cohortMonths
      });
    }

    return cohortData;
  }

  private async calculateCohortMRRForMonth(
    customerIds: string[],
    date: Date
  ): Promise<{ mrr: Decimal; activeCount: Decimal }> {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

    const query = `
      SELECT 
        COUNT(DISTINCT r.customer_id) as active_count,
        SUM(r.amount) as total_mrr
      FROM revenue r
      JOIN customers c ON c.id = r.customer_id
      WHERE r.customer_id = ANY($1)
        AND r.recurring = true
        AND r.revenue_date >= $2
        AND r.revenue_date <= $3
        AND (c.churn_date IS NULL OR c.churn_date > $3)
    `;

    const result = await this.db.query<{
      active_count: string;
      total_mrr: string;
    }>(query, [customerIds, startOfMonth, endOfMonth]);

    const row = result.rows[0];
    
    return {
      mrr: new Decimal(row?.total_mrr || 0),
      activeCount: new Decimal(row?.active_count || 0)
    };
  }

  private async storeCalculation(metrics: MRRMetrics, date: Date): Promise<void> {
    const query = `
      INSERT INTO kpi_calculations (
        kpi_type,
        calculation_date,
        time_period,
        channel,
        value,
        details
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const details = {
      currentMRR: metrics.currentMRR.toString(),
      newMRR: metrics.newMRR.toString(),
      expansionMRR: metrics.expansionMRR.toString(),
      churnedMRR: metrics.churnedMRR.toString(),
      netNewMRR: metrics.netNewMRR.toString(),
      growthRate: metrics.growthRate.toString(),
      customerCount: metrics.customerCount,
      arpu: metrics.arpu.toString(),
      trend: {
        previous: metrics.trend.previous.toString(),
        changePercent: metrics.trend.changePercent.toString()
      }
    };

    await this.db.query(query, [
      'mrr',
      date,
      'month',
      null,
      metrics.currentMRR.toNumber(),
      details
    ]);
  }

  private getCacheKey(date: Date): string {
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return `${this.cachePrefix}${monthKey}`;
  }

  private serializeMetrics(metrics: MRRMetrics): any {
    return {
      ...metrics,
      currentMRR: metrics.currentMRR.toString(),
      newMRR: metrics.newMRR.toString(),
      expansionMRR: metrics.expansionMRR.toString(),
      churnedMRR: metrics.churnedMRR.toString(),
      netNewMRR: metrics.netNewMRR.toString(),
      growthRate: metrics.growthRate.toString(),
      arpu: metrics.arpu.toString(),
      trend: {
        previous: metrics.trend.previous.toString(),
        changePercent: metrics.trend.changePercent.toString()
      }
    };
  }

  private deserializeMetrics(data: any): MRRMetrics {
    return {
      ...data,
      currentMRR: new Decimal(data.currentMRR),
      newMRR: new Decimal(data.newMRR),
      expansionMRR: new Decimal(data.expansionMRR),
      churnedMRR: new Decimal(data.churnedMRR),
      netNewMRR: new Decimal(data.netNewMRR),
      growthRate: new Decimal(data.growthRate),
      arpu: new Decimal(data.arpu),
      trend: {
        previous: new Decimal(data.trend.previous),
        changePercent: new Decimal(data.trend.changePercent)
      }
    };
  }
}