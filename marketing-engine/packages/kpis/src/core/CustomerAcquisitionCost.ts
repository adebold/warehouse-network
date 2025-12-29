import { Decimal } from 'decimal.js';
import { Database } from '../infrastructure/database';
import { RedisClient } from '../infrastructure/redis';
import { logger } from '../utils/logger';
import { 
  CustomerAcquisitionCostMetrics, 
  KPIFilters, 
  ChannelType,
  Customer,
  MarketingCost,
  Revenue 
} from '../types/kpi.types';

export class CustomerAcquisitionCostCalculator {
  private db: Database;
  private redis: RedisClient;
  private cachePrefix = 'kpi:cac:';
  private cacheTTL = 300; // 5 minutes

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
  }

  public async calculate(filters: KPIFilters): Promise<CustomerAcquisitionCostMetrics> {
    const cacheKey = this.getCacheKey(filters);
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('CAC metrics retrieved from cache', { filters });
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
      logger.error('Error calculating CAC metrics', { error, filters });
      throw error;
    }
  }

  private async calculateMetrics(filters: KPIFilters): Promise<CustomerAcquisitionCostMetrics> {
    const { customers, costs, revenues } = await this.fetchData(filters);
    
    const totalCost = costs.reduce(
      (sum, cost) => sum.plus(cost.amount), 
      new Decimal(0)
    );
    
    const totalCustomers = customers.length;
    const cac = totalCustomers > 0 
      ? totalCost.dividedBy(totalCustomers) 
      : new Decimal(0);

    // Calculate channel-specific CAC
    const channelCAC = this.calculateChannelCAC(customers, costs);

    // Calculate payback period and LTV/CAC ratio
    const { paybackPeriod, ltvToCacRatio } = await this.calculatePaybackMetrics(
      customers, 
      revenues, 
      cac
    );

    // Generate cohort analysis
    const cohortAnalysis = await this.generateCohortAnalysis(customers, costs, revenues);

    return {
      totalCost,
      totalCustomers,
      cac,
      channelCAC,
      paybackPeriod,
      ltvToCacRatio,
      cohortAnalysis
    };
  }

  private async fetchData(filters: KPIFilters): Promise<{
    customers: Customer[];
    costs: MarketingCost[];
    revenues: Revenue[];
  }> {
    const dateFilter = filters.dateRange 
      ? `AND acquisition_date BETWEEN $1 AND $2`
      : '';
    
    const channelFilter = filters.channels?.length 
      ? `AND acquisition_channel = ANY($${filters.dateRange ? 3 : 1})`
      : '';

    let params: any[] = [];
    
    if (filters.dateRange) {
      params.push(filters.dateRange.startDate, filters.dateRange.endDate);
    }
    
    if (filters.channels?.length) {
      params.push(filters.channels);
    }

    // Fetch customers
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
      WHERE 1=1 ${dateFilter} ${channelFilter}
    `;
    
    const customersResult = await this.db.query<Customer>(customersQuery, params);
    const customers = customersResult.rows;

    // Fetch marketing costs for the same period
    const costsDateFilter = filters.dateRange 
      ? `AND cost_date BETWEEN $1::date AND $2::date`
      : '';
    
    const costsQuery = `
      SELECT 
        id,
        channel,
        campaign_id as "campaignId",
        cost_date as "costDate",
        amount,
        currency,
        impressions,
        clicks,
        created_at as "createdAt",
        metadata
      FROM marketing_costs
      WHERE 1=1 ${costsDateFilter} ${channelFilter.replace('acquisition_channel', 'channel')}
    `;
    
    const costsResult = await this.db.query<MarketingCost>(costsQuery, params);
    const costs = costsResult.rows;

    // Fetch revenues for LTV calculations
    const customerIds = customers.map(c => c.id);
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
      ORDER BY revenue_date
    `;
    
    const revenuesResult = await this.db.query<Revenue>(revenuesQuery, [customerIds]);
    const revenues = revenuesResult.rows;

    return { customers, costs, revenues };
  }

  private calculateChannelCAC(
    customers: Customer[], 
    costs: MarketingCost[]
  ): Record<ChannelType, { cost: Decimal; customers: number; cac: Decimal }> {
    const channelData: Record<string, { 
      cost: Decimal; 
      customers: number; 
      cac: Decimal 
    }> = {};

    // Group costs by channel
    const costsByChannel = costs.reduce((acc, cost) => {
      if (!acc[cost.channel]) {
        acc[cost.channel] = new Decimal(0);
      }
      acc[cost.channel] = acc[cost.channel].plus(cost.amount);
      return acc;
    }, {} as Record<string, Decimal>);

    // Group customers by channel
    const customersByChannel = customers.reduce((acc, customer) => {
      if (!acc[customer.acquisitionChannel]) {
        acc[customer.acquisitionChannel] = 0;
      }
      acc[customer.acquisitionChannel]++;
      return acc;
    }, {} as Record<string, number>);

    // Calculate CAC per channel
    const allChannels = new Set([
      ...Object.keys(costsByChannel),
      ...Object.keys(customersByChannel)
    ]);

    allChannels.forEach(channel => {
      const cost = costsByChannel[channel] || new Decimal(0);
      const customerCount = customersByChannel[channel] || 0;
      const cac = customerCount > 0 
        ? cost.dividedBy(customerCount) 
        : new Decimal(0);

      channelData[channel] = { cost, customers: customerCount, cac };
    });

    return channelData as Record<ChannelType, { 
      cost: Decimal; 
      customers: number; 
      cac: Decimal 
    }>;
  }

  private async calculatePaybackMetrics(
    customers: Customer[],
    revenues: Revenue[],
    cac: Decimal
  ): Promise<{ paybackPeriod: number; ltvToCacRatio: Decimal }> {
    if (customers.length === 0 || cac.equals(0)) {
      return { paybackPeriod: 0, ltvToCacRatio: new Decimal(0) };
    }

    // Group revenues by customer
    const revenueByCustomer = revenues.reduce((acc, rev) => {
      if (!acc[rev.customerId]) {
        acc[rev.customerId] = [];
      }
      acc[rev.customerId].push(rev);
      return acc;
    }, {} as Record<string, Revenue[]>);

    // Calculate average monthly revenue and payback period
    let totalPaybackMonths = 0;
    let customersWithRevenue = 0;
    let totalLTV = new Decimal(0);

    for (const customer of customers) {
      const customerRevenues = revenueByCustomer[customer.id] || [];
      
      if (customerRevenues.length > 0) {
        // Sort revenues by date
        customerRevenues.sort((a, b) => 
          a.revenueDate.getTime() - b.revenueDate.getTime()
        );

        // Calculate cumulative revenue to find payback period
        let cumulativeRevenue = new Decimal(0);
        let paybackMonth = 0;
        
        for (const rev of customerRevenues) {
          cumulativeRevenue = cumulativeRevenue.plus(rev.amount);
          const monthsSinceAcquisition = this.monthsBetween(
            customer.acquisitionDate, 
            rev.revenueDate
          );
          
          if (cumulativeRevenue.greaterThanOrEqualTo(cac) && paybackMonth === 0) {
            paybackMonth = monthsSinceAcquisition;
          }
        }

        if (paybackMonth > 0) {
          totalPaybackMonths += paybackMonth;
          customersWithRevenue++;
        }

        // Calculate LTV (simplified - total revenue to date)
        const customerLTV = customerRevenues.reduce(
          (sum, rev) => sum.plus(rev.amount), 
          new Decimal(0)
        );
        totalLTV = totalLTV.plus(customerLTV);
      }
    }

    const avgPaybackPeriod = customersWithRevenue > 0
      ? Math.round(totalPaybackMonths / customersWithRevenue)
      : 0;

    const avgLTV = customers.length > 0
      ? totalLTV.dividedBy(customers.length)
      : new Decimal(0);

    const ltvToCacRatio = cac.greaterThan(0)
      ? avgLTV.dividedBy(cac)
      : new Decimal(0);

    return { 
      paybackPeriod: avgPaybackPeriod, 
      ltvToCacRatio 
    };
  }

  private async generateCohortAnalysis(
    customers: Customer[],
    costs: MarketingCost[],
    revenues: Revenue[]
  ): Promise<{ cohort: string; cac: Decimal; ltv: Decimal; paybackMonths: number }[]> {
    // Group customers by acquisition month
    const cohorts = new Map<string, Customer[]>();
    
    customers.forEach(customer => {
      const cohortKey = this.getCohortKey(customer.acquisitionDate);
      if (!cohorts.has(cohortKey)) {
        cohorts.set(cohortKey, []);
      }
      cohorts.get(cohortKey)!.push(customer);
    });

    const cohortAnalysis: { 
      cohort: string; 
      cac: Decimal; 
      ltv: Decimal; 
      paybackMonths: number 
    }[] = [];

    for (const [cohortKey, cohortCustomers] of cohorts) {
      // Calculate CAC for this cohort
      const cohortMonth = new Date(cohortKey);
      const cohortCosts = costs.filter(cost => {
        const costMonth = this.getCohortKey(cost.costDate);
        return costMonth === cohortKey;
      });

      const cohortTotalCost = cohortCosts.reduce(
        (sum, cost) => sum.plus(cost.amount), 
        new Decimal(0)
      );
      
      const cohortCAC = cohortCustomers.length > 0
        ? cohortTotalCost.dividedBy(cohortCustomers.length)
        : new Decimal(0);

      // Calculate LTV for this cohort
      const cohortCustomerIds = cohortCustomers.map(c => c.id);
      const cohortRevenues = revenues.filter(r => 
        cohortCustomerIds.includes(r.customerId)
      );

      const cohortTotalRevenue = cohortRevenues.reduce(
        (sum, rev) => sum.plus(rev.amount), 
        new Decimal(0)
      );
      
      const cohortLTV = cohortCustomers.length > 0
        ? cohortTotalRevenue.dividedBy(cohortCustomers.length)
        : new Decimal(0);

      // Calculate average payback period
      const paybackData = await this.calculatePaybackMetrics(
        cohortCustomers, 
        cohortRevenues, 
        cohortCAC
      );

      cohortAnalysis.push({
        cohort: cohortKey,
        cac: cohortCAC,
        ltv: cohortLTV,
        paybackMonths: paybackData.paybackPeriod
      });
    }

    // Sort by cohort date descending
    cohortAnalysis.sort((a, b) => b.cohort.localeCompare(a.cohort));
    
    return cohortAnalysis.slice(0, 12); // Return last 12 cohorts
  }

  private monthsBetween(date1: Date, date2: Date): number {
    const months = (date2.getFullYear() - date1.getFullYear()) * 12;
    return months + date2.getMonth() - date1.getMonth();
  }

  private getCohortKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private async storeCalculation(
    metrics: CustomerAcquisitionCostMetrics, 
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
      totalCost: metrics.totalCost.toString(),
      totalCustomers: metrics.totalCustomers,
      paybackPeriod: metrics.paybackPeriod,
      ltvToCacRatio: metrics.ltvToCacRatio.toString(),
      channelCAC: Object.entries(metrics.channelCAC).map(
        ([channel, data]) => ({
          channel,
          cost: data.cost.toString(),
          customers: data.customers,
          cac: data.cac.toString()
        })
      ),
      cohortAnalysis: metrics.cohortAnalysis.map(cohort => ({
        ...cohort,
        cac: cohort.cac.toString(),
        ltv: cohort.ltv.toString()
      }))
    };

    await this.db.query(query, [
      'customer_acquisition_cost',
      new Date(),
      filters.groupBy || 'custom',
      null,
      metrics.cac.toNumber(),
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
    
    if (filters.campaigns?.length) {
      parts.push(filters.campaigns.sort().join(','));
    }
    
    if (filters.groupBy) {
      parts.push(filters.groupBy);
    }

    return parts.join(':');
  }

  private serializeMetrics(metrics: CustomerAcquisitionCostMetrics): any {
    return {
      ...metrics,
      totalCost: metrics.totalCost.toString(),
      cac: metrics.cac.toString(),
      ltvToCacRatio: metrics.ltvToCacRatio.toString(),
      channelCAC: Object.entries(metrics.channelCAC).reduce(
        (acc, [channel, data]) => ({
          ...acc,
          [channel]: {
            cost: data.cost.toString(),
            customers: data.customers,
            cac: data.cac.toString()
          }
        }),
        {}
      ),
      cohortAnalysis: metrics.cohortAnalysis.map(cohort => ({
        ...cohort,
        cac: cohort.cac.toString(),
        ltv: cohort.ltv.toString()
      }))
    };
  }

  private deserializeMetrics(data: any): CustomerAcquisitionCostMetrics {
    return {
      ...data,
      totalCost: new Decimal(data.totalCost),
      cac: new Decimal(data.cac),
      ltvToCacRatio: new Decimal(data.ltvToCacRatio),
      channelCAC: Object.entries(data.channelCAC).reduce(
        (acc, [channel, info]: [string, any]) => ({
          ...acc,
          [channel]: {
            cost: new Decimal(info.cost),
            customers: info.customers,
            cac: new Decimal(info.cac)
          }
        }),
        {} as Record<ChannelType, { cost: Decimal; customers: number; cac: Decimal }>
      ),
      cohortAnalysis: data.cohortAnalysis.map((cohort: any) => ({
        ...cohort,
        cac: new Decimal(cohort.cac),
        ltv: new Decimal(cohort.ltv)
      }))
    };
  }
}