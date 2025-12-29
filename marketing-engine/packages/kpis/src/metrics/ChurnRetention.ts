import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { 
  ChurnMetrics, 
  KPIFilters,
  ChannelType,
  Customer,
  Revenue 
} from '../types/kpi.types';

export class ChurnRetentionCalculator {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:churn:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(filters: KPIFilters): Promise<ChurnMetrics> {
    const cacheKey = this.getCacheKey(filters);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('Churn metrics retrieved from cache', { filters });
        return this.deserializeMetrics(JSON.parse(cached));
      }

      // Calculate metrics
      const metrics = await this.calculateMetrics(filters);

      // Cache the results
      await this.redis.set(
        cacheKey, 
        JSON.stringify(this.serializeMetrics(metrics)), 
        this.cacheTTL
      );

      // Store in database for historical tracking
      await this.storeCalculation(metrics, filters);

      return metrics;
    } catch (error) {
      logger.error('Error calculating churn metrics', { error, filters });
      throw error;
    }
  }

  private async calculateMetrics(filters: KPIFilters): Promise<ChurnMetrics> {
    const { customers, revenues } = await this.fetchData(filters);
    
    // Calculate churn rates
    const churnRates = this.calculateChurnRates(customers, revenues, filters);
    
    // Calculate average customer lifetime
    const averageLifetime = this.calculateAverageLifetime(customers);
    
    // Calculate churn by channel
    const churnByChannel = this.calculateChurnByChannel(customers);
    
    // Generate cohort retention analysis
    const cohortRetention = await this.generateCohortRetention(customers);

    return {
      customerChurnRate: churnRates.customerChurnRate,
      revenueChurnRate: churnRates.revenueChurnRate,
      totalChurned: churnRates.totalChurned,
      totalActive: churnRates.totalActive,
      averageLifetime,
      churnByChannel,
      cohortRetention
    };
  }

  private async fetchData(filters: KPIFilters): Promise<{
    customers: Customer[];
    revenues: Revenue[];
  }> {
    // Determine analysis period
    const endDate = filters.dateRange?.endDate || new Date();
    const startDate = filters.dateRange?.startDate || new Date(
      endDate.getFullYear(),
      endDate.getMonth() - 1,
      endDate.getDate()
    );

    // Fetch all customers (both active and churned)
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
      WHERE c.acquisition_date <= $1
      ${filters.channels?.length ? 'AND c.acquisition_channel = ANY($2)' : ''}
    `;
    
    const customerParams = filters.channels?.length 
      ? [endDate, filters.channels]
      : [endDate];
    
    const customersResult = await this.db.query<Customer>(customersQuery, customerParams);
    const customers = customersResult.rows;

    // Fetch revenues for churn rate calculation
    const customerIds = customers.map(c => c.id);
    
    if (customerIds.length === 0) {
      return { customers: [], revenues: [] };
    }

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
      WHERE customer_id = ANY($1)
        AND revenue_date >= $2
        AND revenue_date <= $3
      ORDER BY revenue_date
    `;
    
    const revenuesResult = await this.db.query<Revenue>(
      revenuesQuery,
      [customerIds, startDate, endDate]
    );
    const revenues = revenuesResult.rows;

    return { customers, revenues };
  }

  private calculateChurnRates(
    customers: Customer[],
    revenues: Revenue[],
    filters: KPIFilters
  ): {
    customerChurnRate: Decimal;
    revenueChurnRate: Decimal;
    totalChurned: number;
    totalActive: number;
  } {
    const endDate = filters.dateRange?.endDate || new Date();
    const startDate = filters.dateRange?.startDate || new Date(
      endDate.getFullYear(),
      endDate.getMonth() - 1,
      endDate.getDate()
    );

    // Customers at start of period
    const customersAtStart = customers.filter(c =>
      c.acquisitionDate <= startDate &&
      (!c.churnDate || c.churnDate > startDate)
    );

    // Customers churned during period
    const churnedCustomers = customers.filter(c =>
      c.churnDate &&
      c.churnDate >= startDate &&
      c.churnDate <= endDate
    );

    // Active customers at end of period
    const activeCustomers = customers.filter(c =>
      c.acquisitionDate <= endDate &&
      (!c.churnDate || c.churnDate > endDate)
    );

    // Calculate customer churn rate
    const customerChurnRate = customersAtStart.length > 0
      ? new Decimal(churnedCustomers.length).dividedBy(customersAtStart.length)
      : new Decimal(0);

    // Calculate revenue churn rate
    const revenueChurnRate = this.calculateRevenueChurnRate(
      customersAtStart,
      churnedCustomers,
      revenues,
      startDate,
      endDate
    );

    return {
      customerChurnRate,
      revenueChurnRate,
      totalChurned: churnedCustomers.length,
      totalActive: activeCustomers.length
    };
  }

  private calculateRevenueChurnRate(
    customersAtStart: Customer[],
    churnedCustomers: Customer[],
    revenues: Revenue[],
    startDate: Date,
    endDate: Date
  ): Decimal {
    // Group revenues by customer
    const revenueByCustomer = revenues.reduce((acc, rev) => {
      if (!acc[rev.customerId]) {
        acc[rev.customerId] = [];
      }
      acc[rev.customerId].push(rev);
      return acc;
    }, {} as Record<string, Revenue[]>);

    // Calculate MRR at start of period
    const startMRR = this.calculateMRRForCustomers(
      customersAtStart,
      revenueByCustomer,
      startDate
    );

    // Calculate churned MRR
    const churnedMRR = this.calculateMRRForCustomers(
      churnedCustomers,
      revenueByCustomer,
      startDate
    );

    // Revenue churn rate = churned MRR / start MRR
    return startMRR.greaterThan(0)
      ? churnedMRR.dividedBy(startMRR)
      : new Decimal(0);
  }

  private calculateMRRForCustomers(
    customers: Customer[],
    revenueByCustomer: Record<string, Revenue[]>,
    date: Date
  ): Decimal {
    let totalMRR = new Decimal(0);

    customers.forEach(customer => {
      const customerRevenues = revenueByCustomer[customer.id] || [];
      
      // Find the most recent recurring revenue before or on the date
      const recurringRevenues = customerRevenues
        .filter(r => r.recurring && r.revenueDate <= date)
        .sort((a, b) => b.revenueDate.getTime() - a.revenueDate.getTime());

      if (recurringRevenues.length > 0) {
        totalMRR = totalMRR.plus(recurringRevenues[0].amount);
      }
    });

    return totalMRR;
  }

  private calculateAverageLifetime(customers: Customer[]): number {
    const churnedCustomers = customers.filter(c => c.churnDate);
    
    if (churnedCustomers.length === 0) {
      // If no churned customers, use active customers with estimated lifetime
      const activeCustomers = customers.filter(c => !c.churnDate);
      if (activeCustomers.length === 0) return 0;
      
      const now = new Date();
      const totalMonths = activeCustomers.reduce((sum, customer) => {
        const months = this.monthsBetween(customer.acquisitionDate, now);
        return sum + months;
      }, 0);
      
      return Math.round(totalMonths / activeCustomers.length);
    }

    const totalLifetimeMonths = churnedCustomers.reduce((sum, customer) => {
      const lifetimeMonths = this.monthsBetween(
        customer.acquisitionDate,
        customer.churnDate!
      );
      return sum + lifetimeMonths;
    }, 0);

    return Math.round(totalLifetimeMonths / churnedCustomers.length);
  }

  private calculateChurnByChannel(
    customers: Customer[]
  ): Record<ChannelType, { count: number; rate: Decimal }> {
    const churnByChannel: Record<string, { 
      total: number; 
      churned: number 
    }> = {};

    customers.forEach(customer => {
      if (!churnByChannel[customer.acquisitionChannel]) {
        churnByChannel[customer.acquisitionChannel] = { total: 0, churned: 0 };
      }
      
      churnByChannel[customer.acquisitionChannel].total++;
      
      if (customer.churnDate) {
        churnByChannel[customer.acquisitionChannel].churned++;
      }
    });

    const result: Record<ChannelType, { count: number; rate: Decimal }> = {};
    
    Object.entries(churnByChannel).forEach(([channel, data]) => {
      const rate = data.total > 0
        ? new Decimal(data.churned).dividedBy(data.total)
        : new Decimal(0);
      
      result[channel as ChannelType] = {
        count: data.churned,
        rate
      };
    });

    return result;
  }

  private async generateCohortRetention(
    customers: Customer[]
  ): Promise<{
    cohort: string;
    month: number;
    retained: number;
    retentionRate: Decimal;
  }[]> {
    const cohortRetention: {
      cohort: string;
      month: number;
      retained: number;
      retentionRate: Decimal;
    }[] = [];

    // Group customers by acquisition cohort (month)
    const cohorts = new Map<string, Customer[]>();
    
    customers.forEach(customer => {
      const cohortKey = this.getCohortKey(customer.acquisitionDate);
      if (!cohorts.has(cohortKey)) {
        cohorts.set(cohortKey, []);
      }
      cohorts.get(cohortKey)!.push(customer);
    });

    // Analyze retention for each cohort
    const now = new Date();
    const sortedCohorts = Array.from(cohorts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12); // Last 12 cohorts

    for (const [cohortKey, cohortCustomers] of sortedCohorts) {
      const cohortDate = new Date(cohortKey);
      const cohortSize = cohortCustomers.length;
      
      if (cohortSize === 0) continue;
      
      // Calculate retention for each subsequent month
      const maxMonths = Math.min(
        12,
        this.monthsBetween(cohortDate, now)
      );
      
      for (let month = 0; month <= maxMonths; month++) {
        const analysisDate = new Date(
          cohortDate.getFullYear(),
          cohortDate.getMonth() + month,
          cohortDate.getDate()
        );
        
        const retained = cohortCustomers.filter(c =>
          !c.churnDate || c.churnDate > analysisDate
        ).length;
        
        const retentionRate = new Decimal(retained).dividedBy(cohortSize);
        
        cohortRetention.push({
          cohort: cohortKey,
          month,
          retained,
          retentionRate
        });
      }
    }

    return cohortRetention;
  }

  private monthsBetween(date1: Date, date2: Date): number {
    const months = (date2.getFullYear() - date1.getFullYear()) * 12;
    return months + date2.getMonth() - date1.getMonth();
  }

  private getCohortKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  public async predictChurn(
    customerId: string,
    features?: Record<string, any>
  ): Promise<{
    probability: Decimal;
    riskLevel: 'low' | 'medium' | 'high';
    factors: {
      factor: string;
      impact: Decimal;
      direction: 'positive' | 'negative';
    }[];
  }> {
    // Simplified churn prediction
    // In production, this would use ML models
    
    const customerQuery = `
      SELECT 
        c.*,
        COUNT(DISTINCT r.id) as revenue_count,
        MAX(r.revenue_date) as last_revenue_date,
        SUM(r.amount) as total_revenue,
        AVG(r.amount) as avg_revenue
      FROM customers c
      LEFT JOIN revenue r ON r.customer_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `;
    
    const result = await this.db.query(customerQuery, [customerId]);
    const customerData = result.rows[0];
    
    if (!customerData) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    const factors: {
      factor: string;
      impact: Decimal;
      direction: 'positive' | 'negative';
    }[] = [];

    let riskScore = new Decimal(0);

    // Factor 1: Days since last revenue
    const daysSinceLastRevenue = customerData.last_revenue_date
      ? Math.floor((new Date().getTime() - new Date(customerData.last_revenue_date).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceLastRevenue > 60) {
      const impact = new Decimal(0.3);
      riskScore = riskScore.plus(impact);
      factors.push({
        factor: 'No recent revenue',
        impact,
        direction: 'negative'
      });
    }

    // Factor 2: Revenue trend
    const recentRevenueQuery = `
      SELECT 
        DATE_TRUNC('month', revenue_date) as month,
        SUM(amount) as monthly_revenue
      FROM revenue
      WHERE customer_id = $1
        AND revenue_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY month
      ORDER BY month
    `;
    
    const revenueResult = await this.db.query(recentRevenueQuery, [customerId]);
    const monthlyRevenues = revenueResult.rows;
    
    if (monthlyRevenues.length >= 3) {
      const trend = this.calculateTrend(
        monthlyRevenues.map(r => parseFloat(r.monthly_revenue))
      );
      
      if (trend < -0.2) {
        const impact = new Decimal(0.25);
        riskScore = riskScore.plus(impact);
        factors.push({
          factor: 'Declining revenue trend',
          impact,
          direction: 'negative'
        });
      }
    }

    // Factor 3: Customer lifetime
    const lifetimeMonths = this.monthsBetween(
      new Date(customerData.acquisition_date),
      new Date()
    );
    
    if (lifetimeMonths < 3) {
      const impact = new Decimal(0.2);
      riskScore = riskScore.plus(impact);
      factors.push({
        factor: 'New customer (< 3 months)',
        impact,
        direction: 'negative'
      });
    } else if (lifetimeMonths > 12) {
      const impact = new Decimal(0.1);
      riskScore = riskScore.minus(impact);
      factors.push({
        factor: 'Long-term customer (> 12 months)',
        impact,
        direction: 'positive'
      });
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high';
    if (riskScore.lessThan(0.3)) {
      riskLevel = 'low';
    } else if (riskScore.lessThan(0.6)) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'high';
    }

    return {
      probability: riskScore.greaterThan(1) ? new Decimal(1) : riskScore,
      riskLevel,
      factors
    };
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    // Simple linear regression slope
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, y) => sum + y, 0);
    const sumXY = values.reduce((sum, y, i) => sum + i * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;
    
    return avgY > 0 ? slope / avgY : 0;
  }

  private async storeCalculation(
    metrics: ChurnMetrics, 
    filters: KPIFilters
  ): Promise<void> {
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
      customerChurnRate: metrics.customerChurnRate.toString(),
      revenueChurnRate: metrics.revenueChurnRate.toString(),
      totalChurned: metrics.totalChurned,
      totalActive: metrics.totalActive,
      averageLifetime: metrics.averageLifetime,
      churnByChannel: Object.entries(metrics.churnByChannel).map(
        ([channel, data]) => ({
          channel,
          count: data.count,
          rate: data.rate.toString()
        })
      ),
      cohortRetention: metrics.cohortRetention.slice(0, 50).map(cohort => ({
        ...cohort,
        retentionRate: cohort.retentionRate.toString()
      }))
    };

    await this.db.query(query, [
      'churn_retention',
      new Date(),
      filters.groupBy || 'custom',
      null,
      metrics.customerChurnRate.toNumber(),
      details
    ]);
  }

  private getCacheKey(filters: KPIFilters): string {
    const parts = [this.cachePrefix];
    
    if (filters.dateRange) {
      parts.push(
        `${filters.dateRange.startDate.toISOString()}-${filters.dateRange.endDate.toISOString()}`
      );
    }
    
    if (filters.channels?.length) {
      parts.push(filters.channels.sort().join(','));
    }
    
    if (filters.groupBy) {
      parts.push(filters.groupBy);
    }

    return parts.join(':');
  }

  private serializeMetrics(metrics: ChurnMetrics): any {
    return {
      ...metrics,
      customerChurnRate: metrics.customerChurnRate.toString(),
      revenueChurnRate: metrics.revenueChurnRate.toString(),
      churnByChannel: Object.entries(metrics.churnByChannel).reduce(
        (acc, [channel, data]) => ({
          ...acc,
          [channel]: {
            count: data.count,
            rate: data.rate.toString()
          }
        }),
        {}
      ),
      cohortRetention: metrics.cohortRetention.map(cohort => ({
        ...cohort,
        retentionRate: cohort.retentionRate.toString()
      }))
    };
  }

  private deserializeMetrics(data: any): ChurnMetrics {
    return {
      ...data,
      customerChurnRate: new Decimal(data.customerChurnRate),
      revenueChurnRate: new Decimal(data.revenueChurnRate),
      churnByChannel: Object.entries(data.churnByChannel).reduce(
        (acc, [channel, info]: [string, any]) => ({
          ...acc,
          [channel]: {
            count: info.count,
            rate: new Decimal(info.rate)
          }
        }),
        {} as Record<ChannelType, { count: number; rate: Decimal }>
      ),
      cohortRetention: data.cohortRetention.map((cohort: any) => ({
        ...cohort,
        retentionRate: new Decimal(cohort.retentionRate)
      }))
    };
  }
}