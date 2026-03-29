/**
 * Metrics Calculator Service
 * Handles calculation and aggregation of all business and operational metrics
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'winston';
import { startOfDay, endOfDay, subDays, format, eachDayOfInterval } from 'date-fns';
import { groupBy, sum, mean, maxBy, minBy } from 'lodash';

import {
  KPIMetrics,
  MetricFilter,
  MetricTrend,
  MetricComparison
} from '../types';

export class MetricsCalculator {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {}

  /**
   * Calculate comprehensive KPI metrics for dashboard
   */
  async calculateKPIMetrics(filter: MetricFilter): Promise<KPIMetrics> {
    const cacheKey = `kpi:metrics:${JSON.stringify(filter)}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { startDate, endDate, tenantId } = filter;

    try {
      // Run all metric calculations in parallel
      const [
        userMetrics,
        bookingMetrics,
        revenueMetrics,
        warehouseMetrics,
        platformMetrics
      ] = await Promise.all([
        this.calculateUserMetrics(startDate, endDate, tenantId),
        this.calculateBookingMetrics(startDate, endDate, tenantId),
        this.calculateRevenueMetrics(startDate, endDate, tenantId),
        this.calculateWarehouseMetrics(startDate, endDate, tenantId),
        this.calculatePlatformMetrics(startDate, endDate, tenantId)
      ]);

      const kpiMetrics: KPIMetrics = {
        // User metrics
        activeUsers: userMetrics.activeUsers,
        newUsers: userMetrics.newUsers,
        returningUsers: userMetrics.returningUsers,
        totalSessions: userMetrics.totalSessions,
        avgSessionDuration: userMetrics.avgSessionDuration,
        bounceRate: userMetrics.bounceRate,

        // Business metrics
        totalBookings: bookingMetrics.totalBookings,
        successfulBookings: bookingMetrics.successfulBookings,
        cancelledBookings: bookingMetrics.cancelledBookings,
        conversionRate: bookingMetrics.conversionRate,
        avgBookingValue: revenueMetrics.avgBookingValue,

        // Revenue metrics
        totalRevenue: revenueMetrics.totalRevenue,

        // Warehouse metrics
        totalWarehouseViews: warehouseMetrics.totalViews,
        warehouseConversionRate: warehouseMetrics.conversionRate,
        occupancyRate: warehouseMetrics.occupancyRate,

        // Platform metrics
        platformFeeCollected: platformMetrics.platformFeeCollected,
        paymentProcessingFees: platformMetrics.paymentProcessingFees,
        netRevenue: platformMetrics.netRevenue
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(kpiMetrics));

      return kpiMetrics;
    } catch (error) {
      this.logger.error('Failed to calculate KPI metrics', { error: error.message, filter });
      throw error;
    }
  }

  /**
   * Calculate metric trends over time
   */
  async calculateMetricTrends(
    metricName: string,
    filter: MetricFilter
  ): Promise<MetricTrend[]> {
    const { startDate, endDate, tenantId, segmentBy = 'day' } = filter;

    try {
      let intervals: Date[];
      let format_string: string;

      // Generate date intervals based on segmentation
      switch (segmentBy) {
        case 'day':
          intervals = eachDayOfInterval({ start: startDate, end: endDate });
          format_string = 'yyyy-MM-dd';
          break;
        case 'week':
          intervals = this.generateWeeklyIntervals(startDate, endDate);
          format_string = 'yyyy-\\'W\\'II';
          break;
        case 'month':
          intervals = this.generateMonthlyIntervals(startDate, endDate);
          format_string = 'yyyy-MM';
          break;
        case 'quarter':
          intervals = this.generateQuarterlyIntervals(startDate, endDate);
          format_string = 'yyyy-\\'Q\\'Q';
          break;
        default:
          intervals = eachDayOfInterval({ start: startDate, end: endDate });
          format_string = 'yyyy-MM-dd';
      }

      const trends: MetricTrend[] = [];

      for (let i = 0; i < intervals.length; i++) {
        const intervalStart = intervals[i];
        const intervalEnd = this.getIntervalEnd(intervalStart, segmentBy);

        const value = await this.calculateMetricForInterval(
          metricName,
          intervalStart,
          intervalEnd,
          tenantId
        );

        let change: number | undefined;
        let changeDirection: 'up' | 'down' | 'stable' | undefined;

        if (i > 0) {
          const previousValue = trends[i - 1].value;
          change = previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;
          changeDirection = change > 1 ? 'up' : change < -1 ? 'down' : 'stable';
        }

        trends.push({
          period: format(intervalStart, format_string),
          value,
          change,
          changeDirection
        });
      }

      return trends;
    } catch (error) {
      this.logger.error('Failed to calculate metric trends', { error: error.message, metricName, filter });
      throw error;
    }
  }

  /**
   * Calculate warehouse performance metrics
   */
  async calculateWarehousePerformance(
    warehouseId: string,
    filter: MetricFilter
  ): Promise<any> {
    const { startDate, endDate } = filter;

    try {
      // Get warehouse performance data
      const performanceData = await this.prisma.warehousePerformance.findMany({
        where: {
          warehouseId,
          metricDate: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          metricDate: 'asc'
        }
      });

      if (performanceData.length === 0) {
        // Calculate real-time if no aggregated data exists
        return await this.calculateRealtimeWarehousePerformance(warehouseId, startDate, endDate);
      }

      // Aggregate performance data
      const aggregated = {
        totalViews: sum(performanceData.map(d => d.totalViews)),
        totalInquiries: sum(performanceData.map(d => d.totalInquiries)),
        totalBookings: sum(performanceData.map(d => d.totalBookings)),
        totalRevenue: sum(performanceData.map(d => Number(d.totalRevenue))),
        avgOccupancyRate: mean(performanceData.map(d => Number(d.occupancyRate))),
        avgSpaceUtilization: mean(performanceData.map(d => Number(d.spaceUtilization))),
        avgBookingDuration: mean(performanceData.map(d => Number(d.avgBookingDuration))),
        avgBookingConversionRate: mean(performanceData.map(d => Number(d.bookingConversionRate))),
        avgRating: mean(performanceData.filter(d => d.avgRating).map(d => Number(d.avgRating))),
        totalReviews: sum(performanceData.map(d => d.totalReviews)),
        trends: performanceData.map(d => ({
          date: d.metricDate,
          views: d.totalViews,
          bookings: d.totalBookings,
          revenue: Number(d.totalRevenue),
          occupancyRate: Number(d.occupancyRate)
        }))
      };

      return aggregated;
    } catch (error) {
      this.logger.error('Failed to calculate warehouse performance', {
        error: error.message,
        warehouseId,
        filter
      });
      throw error;
    }
  }

  /**
   * Aggregate daily metrics for a specific date
   */
  async aggregateDailyMetrics(date: Date): Promise<void> {
    const startOfDayDate = startOfDay(date);
    const endOfDayDate = endOfDay(date);

    try {
      // Get all active tenants
      const tenants = await this.prisma.organization.findMany({
        where: { status: 'active' },
        select: { id: true, name: true }
      });

      for (const tenant of tenants) {
        await this.aggregateDailyMetricsForTenant(tenant.id, startOfDayDate, endOfDayDate);
      }

      this.logger.info('Daily metrics aggregation completed', {
        date: format(date, 'yyyy-MM-dd'),
        tenantCount: tenants.length
      });
    } catch (error) {
      this.logger.error('Failed to aggregate daily metrics', { error: error.message, date });
      throw error;
    }
  }

  /**
   * Compare metrics between two periods
   */
  async compareMetrics(
    metricName: string,
    currentPeriod: { start: Date; end: Date },
    previousPeriod: { start: Date; end: Date },
    tenantId?: string
  ): Promise<MetricComparison> {
    try {
      const [currentValue, previousValue] = await Promise.all([
        this.calculateMetricForInterval(
          metricName,
          currentPeriod.start,
          currentPeriod.end,
          tenantId
        ),
        this.calculateMetricForInterval(
          metricName,
          previousPeriod.start,
          previousPeriod.end,
          tenantId
        )
      ]);

      const change = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;
      const changeDirection: 'up' | 'down' | 'stable' =
        change > 1 ? 'up' : change < -1 ? 'down' : 'stable';

      return {
        current: {
          value: currentValue,
          period: `${format(currentPeriod.start, 'yyyy-MM-dd')} to ${format(currentPeriod.end, 'yyyy-MM-dd')}`
        },
        previous: {
          value: previousValue,
          period: `${format(previousPeriod.start, 'yyyy-MM-dd')} to ${format(previousPeriod.end, 'yyyy-MM-dd')}`
        },
        change,
        changeDirection
      };
    } catch (error) {
      this.logger.error('Failed to compare metrics', {
        error: error.message,
        metricName,
        currentPeriod,
        previousPeriod
      });
      throw error;
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Calculate user metrics for a period
   */
  private async calculateUserMetrics(
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<any> {
    const whereCondition = {
      createdAt: { gte: startDate, lte: endDate },
      ...(tenantId && { tenantId })
    };

    const [sessions, users, events] = await Promise.all([
      this.prisma.userSession.findMany({
        where: {
          startedAt: { gte: startDate, lte: endDate },
          ...(tenantId && { tenantId })
        },
        select: {
          userId: true,
          sessionDuration: true,
          isBounce: true,
          startedAt: true
        }
      }),
      this.prisma.user.findMany({
        where: whereCondition,
        select: {
          id: true,
          createdAt: true,
          lastLogin: true
        }
      }),
      this.prisma.analyticsEvent.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          eventCategory: 'user_action',
          ...(tenantId && { tenantId })
        },
        select: {
          userId: true,
          sessionId: true
        }
      })
    ]);

    const uniqueUsers = new Set(sessions.map(s => s.userId).filter(Boolean));
    const newUsersInPeriod = users.filter(u =>
      u.createdAt >= startDate && u.createdAt <= endDate
    );
    const returningUsers = sessions.filter(s =>
      s.userId && !newUsersInPeriod.find(u => u.id === s.userId)
    );

    return {
      activeUsers: uniqueUsers.size,
      newUsers: newUsersInPeriod.length,
      returningUsers: new Set(returningUsers.map(s => s.userId)).size,
      totalSessions: sessions.length,
      avgSessionDuration: sessions.length > 0
        ? mean(sessions.filter(s => s.sessionDuration).map(s => s.sessionDuration!))
        : 0,
      bounceRate: sessions.length > 0
        ? (sessions.filter(s => s.isBounce).length / sessions.length) * 100
        : 0
    };
  }

  /**
   * Calculate booking metrics for a period
   */
  private async calculateBookingMetrics(
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<any> {
    const whereCondition = {
      createdAt: { gte: startDate, lte: endDate },
      ...(tenantId && { tenantId })
    };

    const bookings = await this.prisma.booking.findMany({
      where: whereCondition,
      select: {
        status: true,
        totalAmount: true
      }
    });

    const totalBookings = bookings.length;
    const successfulBookings = bookings.filter(b => b.status === 'confirmed').length;
    const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;

    // Calculate conversion rate (need to get total warehouse views)
    const warehouseViews = await this.prisma.analyticsEvent.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        eventName: 'warehouse_view',
        ...(tenantId && { tenantId })
      }
    });

    const conversionRate = warehouseViews > 0 ? (successfulBookings / warehouseViews) * 100 : 0;

    return {
      totalBookings,
      successfulBookings,
      cancelledBookings,
      conversionRate
    };
  }

  /**
   * Calculate revenue metrics for a period
   */
  private async calculateRevenueMetrics(
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<any> {
    const whereCondition = {
      createdAt: { gte: startDate, lte: endDate },
      ...(tenantId && { tenantId })
    };

    const transactions = await this.prisma.transaction.findMany({
      where: {
        ...whereCondition,
        status: 'completed'
      },
      select: {
        amount: true,
        transactionType: true,
        processorFee: true,
        platformFee: true
      }
    });

    const bookingTransactions = transactions.filter(t => t.transactionType === 'booking');
    const totalRevenue = sum(bookingTransactions.map(t => Number(t.amount)));
    const avgBookingValue = bookingTransactions.length > 0
      ? totalRevenue / bookingTransactions.length
      : 0;

    return {
      totalRevenue,
      avgBookingValue
    };
  }

  /**
   * Calculate warehouse metrics for a period
   */
  private async calculateWarehouseMetrics(
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<any> {
    const eventWhereCondition = {
      createdAt: { gte: startDate, lte: endDate },
      ...(tenantId && { tenantId })
    };

    const [warehouseViews, bookings, warehouses] = await Promise.all([
      this.prisma.analyticsEvent.count({
        where: {
          ...eventWhereCondition,
          eventName: 'warehouse_view'
        }
      }),
      this.prisma.booking.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'confirmed',
          ...(tenantId && { tenantId })
        },
        include: {
          space: {
            include: {
              warehouse: {
                select: {
                  totalCapacity: true,
                  availableCapacity: true
                }
              }
            }
          }
        }
      }),
      this.prisma.warehouse.findMany({
        where: tenantId ? { organizationId: tenantId } : {},
        select: {
          totalCapacity: true,
          availableCapacity: true
        }
      })
    ]);

    const conversionRate = warehouseViews > 0
      ? (bookings.length / warehouseViews) * 100
      : 0;

    const totalCapacity = sum(warehouses.map(w => Number(w.totalCapacity)));
    const totalAvailable = sum(warehouses.map(w => Number(w.availableCapacity)));
    const occupancyRate = totalCapacity > 0
      ? ((totalCapacity - totalAvailable) / totalCapacity) * 100
      : 0;

    return {
      totalViews: warehouseViews,
      conversionRate,
      occupancyRate
    };
  }

  /**
   * Calculate platform metrics for a period
   */
  private async calculatePlatformMetrics(
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<any> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'completed',
        ...(tenantId && { tenantId })
      },
      select: {
        amount: true,
        processorFee: true,
        platformFee: true
      }
    });

    const platformFeeCollected = sum(transactions.map(t => Number(t.platformFee || 0)));
    const paymentProcessingFees = sum(transactions.map(t => Number(t.processorFee || 0)));
    const grossRevenue = sum(transactions.map(t => Number(t.amount)));
    const netRevenue = grossRevenue - paymentProcessingFees;

    return {
      platformFeeCollected,
      paymentProcessingFees,
      netRevenue
    };
  }

  /**
   * Aggregate daily metrics for a specific tenant
   */
  private async aggregateDailyMetricsForTenant(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    try {
      const metrics = await this.calculateKPIMetrics({
        startDate,
        endDate,
        tenantId
      });

      // Upsert daily metrics
      await this.prisma.dailyMetrics.upsert({
        where: {
          tenantId_metricDate: {
            tenantId,
            metricDate: startDate
          }
        },
        update: {
          ...metrics,
          updatedAt: new Date()
        },
        create: {
          tenantId,
          metricDate: startDate,
          ...metrics
        }
      });
    } catch (error) {
      this.logger.error('Failed to aggregate daily metrics for tenant', {
        error: error.message,
        tenantId,
        date: format(startDate, 'yyyy-MM-dd')
      });
    }
  }

  /**
   * Calculate a specific metric for an interval
   */
  private async calculateMetricForInterval(
    metricName: string,
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<number> {
    // This would contain the logic to calculate specific metrics
    // For brevity, I'm showing a simplified version
    switch (metricName) {
      case 'total_bookings':
        return await this.prisma.booking.count({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            ...(tenantId && { tenantId })
          }
        });

      case 'total_revenue':
        const transactions = await this.prisma.transaction.findMany({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            status: 'completed',
            transactionType: 'booking',
            ...(tenantId && { tenantId })
          },
          select: { amount: true }
        });
        return sum(transactions.map(t => Number(t.amount)));

      case 'active_users':
        const sessions = await this.prisma.userSession.findMany({
          where: {
            startedAt: { gte: startDate, lte: endDate },
            ...(tenantId && { tenantId })
          },
          select: { userId: true }
        });
        return new Set(sessions.map(s => s.userId).filter(Boolean)).size;

      default:
        return 0;
    }
  }

  /**
   * Calculate real-time warehouse performance when no aggregated data exists
   */
  private async calculateRealtimeWarehousePerformance(
    warehouseId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const [views, bookings, warehouse] = await Promise.all([
      this.prisma.analyticsEvent.count({
        where: {
          warehouseId,
          eventName: 'warehouse_view',
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      this.prisma.booking.findMany({
        where: {
          warehouseId,
          createdAt: { gte: startDate, lte: endDate }
        },
        select: {
          status: true,
          totalAmount: true,
          durationDays: true
        }
      }),
      this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: {
          totalCapacity: true,
          availableCapacity: true
        }
      })
    ]);

    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
    const totalRevenue = sum(confirmedBookings.map(b => Number(b.totalAmount)));
    const avgBookingDuration = confirmedBookings.length > 0
      ? mean(confirmedBookings.filter(b => b.durationDays).map(b => b.durationDays!))
      : 0;

    const occupancyRate = warehouse
      ? ((Number(warehouse.totalCapacity) - Number(warehouse.availableCapacity)) / Number(warehouse.totalCapacity)) * 100
      : 0;

    return {
      totalViews: views,
      totalInquiries: 0, // Would need to track inquiry events
      totalBookings: bookings.length,
      totalRevenue,
      avgOccupancyRate: occupancyRate,
      avgBookingDuration,
      avgBookingConversionRate: views > 0 ? (confirmedBookings.length / views) * 100 : 0,
      trends: [] // Would generate from daily data
    };
  }

  /**
   * Generate weekly intervals
   */
  private generateWeeklyIntervals(startDate: Date, endDate: Date): Date[] {
    const intervals: Date[] = [];
    let current = new Date(startDate);
    current.setDate(current.getDate() - current.getDay()); // Start of week (Sunday)

    while (current <= endDate) {
      intervals.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    return intervals;
  }

  /**
   * Generate monthly intervals
   */
  private generateMonthlyIntervals(startDate: Date, endDate: Date): Date[] {
    const intervals: Date[] = [];
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (current <= endDate) {
      intervals.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }

    return intervals;
  }

  /**
   * Generate quarterly intervals
   */
  private generateQuarterlyIntervals(startDate: Date, endDate: Date): Date[] {
    const intervals: Date[] = [];
    const startQuarter = Math.floor(startDate.getMonth() / 3) * 3;
    let current = new Date(startDate.getFullYear(), startQuarter, 1);

    while (current <= endDate) {
      intervals.push(new Date(current));
      current.setMonth(current.getMonth() + 3);
    }

    return intervals;
  }

  /**
   * Get the end date for an interval based on segment type
   */
  private getIntervalEnd(intervalStart: Date, segmentBy: string): Date {
    const end = new Date(intervalStart);

    switch (segmentBy) {
      case 'day':
        return endOfDay(end);
      case 'week':
        end.setDate(end.getDate() + 6);
        return endOfDay(end);
      case 'month':
        end.setMonth(end.getMonth() + 1);
        end.setDate(0); // Last day of month
        return endOfDay(end);
      case 'quarter':
        end.setMonth(end.getMonth() + 3);
        end.setDate(0);
        return endOfDay(end);
      default:
        return endOfDay(end);
    }
  }
}