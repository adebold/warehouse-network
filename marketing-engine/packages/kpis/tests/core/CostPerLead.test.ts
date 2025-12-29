import { CostPerLeadCalculator } from '../../src/core/CostPerLead';
import { Database } from '../../src/infrastructure/database';
import { RedisClient } from '../../src/infrastructure/redis';
import { KPIFilters, ChannelType } from '../../src/types/kpi.types';
import { Decimal } from 'decimal.js';

describe('CostPerLeadCalculator', () => {
  let calculator: CostPerLeadCalculator;
  let mockDb: jest.Mocked<Database>;
  let mockRedis: jest.Mocked<RedisClient>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
      transaction: jest.fn(),
      healthCheck: jest.fn(),
      close: jest.fn(),
      getPool: jest.fn()
    } as any;

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      connect: jest.fn(),
      healthCheck: jest.fn(),
      close: jest.fn()
    } as any;

    calculator = new CostPerLeadCalculator(mockDb, mockRedis);
  });

  describe('calculate', () => {
    const filters: KPIFilters = {
      dateRange: {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      },
      channels: ['paid_search' as ChannelType]
    };

    it('should return cached metrics if available', async () => {
      const cachedMetrics = {
        totalCost: '1000',
        totalLeads: 50,
        costPerLead: '20',
        channelBreakdown: {},
        qualityAdjustedCPL: '25',
        trend: {
          previousPeriod: '18',
          changePercent: '11.11'
        }
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedMetrics));

      const result = await calculator.calculate(filters);

      expect(result.totalCost).toBeInstanceOf(Decimal);
      expect(result.totalCost.toString()).toBe('1000');
      expect(result.totalLeads).toBe(50);
      expect(result.costPerLead.toString()).toBe('20');
    });

    it('should calculate metrics when cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      // Mock lead data
      mockDb.query.mockImplementation((query: string) => {
        if (query.includes('FROM leads')) {
          return {
            rows: [
              {
                id: '1',
                email: 'test1@example.com',
                sourceChannel: 'paid_search',
                qualityScore: 0.8,
                createdAt: new Date('2024-01-15'),
                metadata: {}
              },
              {
                id: '2',
                email: 'test2@example.com',
                sourceChannel: 'paid_search',
                qualityScore: 0.6,
                createdAt: new Date('2024-01-20'),
                metadata: {}
              }
            ]
          };
        } else if (query.includes('FROM marketing_costs')) {
          return {
            rows: [
              {
                id: '1',
                channel: 'paid_search',
                amount: 500,
                costDate: new Date('2024-01-15')
              }
            ]
          };
        }
        return { rows: [] };
      });

      const result = await calculator.calculate(filters);

      expect(result.totalLeads).toBe(2);
      expect(result.totalCost.toString()).toBe('500');
      expect(result.costPerLead.toString()).toBe('250');
      expect(result.qualityAdjustedCPL.toString()).toBe('500'); // Only 1 lead with quality >= 0.7
    });

    it('should handle zero leads gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await calculator.calculate(filters);

      expect(result.totalLeads).toBe(0);
      expect(result.costPerLead.toString()).toBe('0');
    });
  });

  describe('forecast', () => {
    it('should generate forecast based on historical data', async () => {
      const filters: KPIFilters = {
        channels: ['paid_search' as ChannelType]
      };

      mockDb.query.mockResolvedValue({
        rows: [
          { calculation_date: new Date('2024-01-01'), value: 20 },
          { calculation_date: new Date('2023-12-01'), value: 18 },
          { calculation_date: new Date('2023-11-01'), value: 16 },
          { calculation_date: new Date('2023-10-01'), value: 15 },
          { calculation_date: new Date('2023-09-01'), value: 14 }
        ]
      });

      const forecasts = await calculator.forecast(filters, 3);

      expect(forecasts).toHaveLength(3);
      expect(forecasts[0].forecast).toBeInstanceOf(Decimal);
      expect(forecasts[0].period).toBeInstanceOf(Date);
    });

    it('should return empty array with insufficient data', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const forecasts = await calculator.forecast({}, 3);

      expect(forecasts).toHaveLength(0);
    });
  });
});