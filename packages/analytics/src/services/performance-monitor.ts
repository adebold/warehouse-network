/**
 * Performance Monitor Service
 * Monitors system performance metrics and detects performance issues
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'winston';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs/promises';

import { SystemPerformanceMetrics, PerformanceAlert } from '../types';

export class PerformanceMonitor extends EventEmitter {
  private performanceThresholds = {
    cpuUsage: 80, // percentage
    memoryUsage: 85, // percentage
    diskUsage: 90, // percentage
    dbAvgResponseTime: 1000, // milliseconds
    apiAvgResponseTime: 2000, // milliseconds
    apiErrorRate: 5, // percentage
    dbConnections: 100 // max connections
  };

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Collect current system performance metrics
   */
  async collectMetrics(): Promise<SystemPerformanceMetrics> {
    try {
      const metrics: SystemPerformanceMetrics = {
        timestamp: new Date(),
        cpuUsage: await this.getCPUUsage(),
        memoryUsage: this.getMemoryUsage(),
        diskUsage: await this.getDiskUsage(),
        networkIo: await this.getNetworkIO(),
        dbConnections: await this.getDatabaseConnections(),
        dbSlowQueries: await this.getSlowQueriesCount(),
        dbAvgResponseTime: await this.getDatabaseResponseTime(),
        apiRequestsPerSecond: await this.getAPIRequestsPerSecond(),
        apiAvgResponseTime: await this.getAPIResponseTime(),
        apiErrorRate: await this.getAPIErrorRate(),
        activeSessions: await this.getActiveSessions(),
        concurrentBookings: await this.getConcurrentBookings(),
        searchQueriesPerSecond: await this.getSearchQueriesPerSecond(),
        paymentSuccessRate: await this.getPaymentSuccessRate()
      };

      // Check for performance alerts
      await this.checkPerformanceAlerts(metrics);

      return metrics;
    } catch (error) {
      this.logger.error('Failed to collect performance metrics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get performance trends over time
   */
  async getPerformanceTrends(
    metricName: keyof SystemPerformanceMetrics,
    hours: number = 24
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      const metrics = await this.prisma.systemPerformance.findMany({
        where: {
          metricTimestamp: { gte: startTime }
        },
        orderBy: { metricTimestamp: 'asc' },
        select: {
          metricTimestamp: true,
          [metricName]: true
        }
      });

      return metrics
        .filter(m => m[metricName] !== null)
        .map(m => ({
          timestamp: m.metricTimestamp,
          value: Number(m[metricName])
        }));
    } catch (error) {
      this.logger.error('Failed to get performance trends', {
        error: error.message,
        metricName,
        hours
      });
      throw error;
    }
  }

  /**
   * Get current system health status
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: PerformanceAlert[];
    lastCheck: Date;
  }> {
    try {
      const metrics = await this.collectMetrics();
      const issues = await this.identifyPerformanceIssues(metrics);

      let status: 'healthy' | 'warning' | 'critical' = 'healthy';

      if (issues.some(i => i.severity === 'critical')) {
        status = 'critical';
      } else if (issues.some(i => i.severity === 'error') || issues.length > 2) {
        status = 'warning';
      }

      return {
        status,
        issues,
        lastCheck: metrics.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to get system health', { error: error.message });
      return {
        status: 'critical',
        issues: [{
          metric: 'system',
          threshold: 0,
          currentValue: 0,
          severity: 'critical',
          timestamp: new Date(),
          resolved: false
        }],
        lastCheck: new Date()
      };
    }
  }

  // =============================================================================
  // PRIVATE METRIC COLLECTION METHODS
  // =============================================================================

  /**
   * Get CPU usage percentage
   */
  private async getCPUUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startMeasure = os.cpus();

      setTimeout(() => {
        const endMeasure = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        for (let i = 0; i < startMeasure.length; i++) {
          const startCpu = startMeasure[i];
          const endCpu = endMeasure[i];

          const idle = endCpu.times.idle - startCpu.times.idle;
          const total = Object.values(endCpu.times).reduce((acc, time, idx) =>
            acc + (time - Object.values(startCpu.times)[idx]), 0);

          totalIdle += idle;
          totalTick += total;
        }

        const cpuUsage = 100 - (totalIdle / totalTick * 100);
        resolve(Math.round(cpuUsage * 100) / 100);
      }, 100);
    });
  }

  /**
   * Get memory usage percentage
   */
  private getMemoryUsage(): number {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return Math.round((usedMem / totalMem) * 100 * 100) / 100;
  }

  /**
   * Get disk usage percentage
   */
  private async getDiskUsage(): Promise<number> {
    try {
      // Simplified disk usage check - would need platform-specific implementation
      const stats = await fs.stat(process.cwd());
      // This is a placeholder - actual implementation would use platform-specific tools
      return 0;
    } catch (error) {
      this.logger.warn('Could not determine disk usage', { error: error.message });
      return 0;
    }
  }

  /**
   * Get network I/O statistics
   */
  private async getNetworkIO(): Promise<any> {
    // Placeholder - would need platform-specific implementation
    return {
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0
    };
  }

  /**
   * Get database connection count
   */
  private async getDatabaseConnections(): Promise<number> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM pg_stat_activity
        WHERE state = 'active' AND pid <> pg_backend_pid();
      `;
      return Number(result[0]?.count || 0);
    } catch (error) {
      this.logger.warn('Could not get database connections', { error: error.message });
      return 0;
    }
  }

  /**
   * Get slow queries count in last hour
   */
  private async getSlowQueriesCount(): Promise<number> {
    try {
      // This would require pg_stat_statements extension or similar
      const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM pg_stat_statements
        WHERE mean_time > 1000 AND calls > 0;
      `;
      return Number(result[0]?.count || 0);
    } catch (error) {
      // Extension might not be available
      return 0;
    }
  }

  /**
   * Get database average response time
   */
  private async getDatabaseResponseTime(): Promise<number> {
    const startTime = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return Date.now() - startTime;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get API requests per second from Redis metrics
   */
  private async getAPIRequestsPerSecond(): Promise<number> {
    try {
      const now = new Date();
      const currentMinute = `api_requests:${now.getHours()}:${now.getMinutes()}`;
      const requests = await this.redis.get(currentMinute);
      return Number(requests || 0) / 60; // Convert per minute to per second
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get API average response time
   */
  private async getAPIResponseTime(): Promise<number> {
    try {
      const responseTimeSum = await this.redis.get('api_response_time_sum');
      const responseTimeCount = await this.redis.get('api_response_time_count');

      if (responseTimeCount && Number(responseTimeCount) > 0) {
        return Number(responseTimeSum || 0) / Number(responseTimeCount);
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get API error rate percentage
   */
  private async getAPIErrorRate(): Promise<number> {
    try {
      const errorCount = await this.redis.get('api_errors_count');
      const totalCount = await this.redis.get('api_requests_count');

      if (totalCount && Number(totalCount) > 0) {
        return (Number(errorCount || 0) / Number(totalCount)) * 100;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get active sessions count
   */
  private async getActiveSessions(): Promise<number> {
    try {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      const count = await this.prisma.userSession.count({
        where: {
          startedAt: { gte: thirtyMinutesAgo },
          endedAt: null
        }
      });

      return count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get concurrent bookings count
   */
  private async getConcurrentBookings(): Promise<number> {
    try {
      const now = new Date();
      const count = await this.prisma.booking.count({
        where: {
          status: 'confirmed',
          startDate: { lte: now },
          endDate: { gte: now }
        }
      });

      return count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get search queries per second
   */
  private async getSearchQueriesPerSecond(): Promise<number> {
    try {
      const searchCount = await this.redis.get('search_queries_count');
      const timestamp = await this.redis.get('search_queries_timestamp');

      if (timestamp) {
        const elapsed = (Date.now() - Number(timestamp)) / 1000;
        return elapsed > 0 ? Number(searchCount || 0) / elapsed : 0;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get payment success rate
   */
  private async getPaymentSuccessRate(): Promise<number> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const totalPayments = await this.prisma.transaction.count({
        where: {
          transactionType: 'booking',
          createdAt: { gte: oneHourAgo }
        }
      });

      const successfulPayments = await this.prisma.transaction.count({
        where: {
          transactionType: 'booking',
          status: 'completed',
          createdAt: { gte: oneHourAgo }
        }
      });

      return totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 100;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check for performance alerts
   */
  private async checkPerformanceAlerts(metrics: SystemPerformanceMetrics): Promise<void> {
    const alerts = await this.identifyPerformanceIssues(metrics);

    for (const alert of alerts) {
      if (!alert.resolved && alert.severity !== 'warning') {
        this.emit('performance_issue', alert);

        // Store alert in Redis for tracking
        const alertKey = `perf_alert:${alert.metric}`;
        await this.redis.setex(alertKey, 3600, JSON.stringify(alert)); // 1 hour
      }
    }
  }

  /**
   * Identify performance issues from metrics
   */
  private async identifyPerformanceIssues(metrics: SystemPerformanceMetrics): Promise<PerformanceAlert[]> {
    const issues: PerformanceAlert[] = [];

    // CPU usage check
    if (metrics.cpuUsage && metrics.cpuUsage > this.performanceThresholds.cpuUsage) {
      issues.push({
        metric: 'cpuUsage',
        threshold: this.performanceThresholds.cpuUsage,
        currentValue: metrics.cpuUsage,
        severity: metrics.cpuUsage > 95 ? 'critical' : 'error',
        timestamp: metrics.timestamp,
        resolved: false
      });
    }

    // Memory usage check
    if (metrics.memoryUsage && metrics.memoryUsage > this.performanceThresholds.memoryUsage) {
      issues.push({
        metric: 'memoryUsage',
        threshold: this.performanceThresholds.memoryUsage,
        currentValue: metrics.memoryUsage,
        severity: metrics.memoryUsage > 95 ? 'critical' : 'error',
        timestamp: metrics.timestamp,
        resolved: false
      });
    }

    // Database response time check
    if (metrics.dbAvgResponseTime && metrics.dbAvgResponseTime > this.performanceThresholds.dbAvgResponseTime) {
      issues.push({
        metric: 'dbAvgResponseTime',
        threshold: this.performanceThresholds.dbAvgResponseTime,
        currentValue: metrics.dbAvgResponseTime,
        severity: metrics.dbAvgResponseTime > 5000 ? 'critical' : 'error',
        timestamp: metrics.timestamp,
        resolved: false
      });
    }

    // API response time check
    if (metrics.apiAvgResponseTime && metrics.apiAvgResponseTime > this.performanceThresholds.apiAvgResponseTime) {
      issues.push({
        metric: 'apiAvgResponseTime',
        threshold: this.performanceThresholds.apiAvgResponseTime,
        currentValue: metrics.apiAvgResponseTime,
        severity: metrics.apiAvgResponseTime > 10000 ? 'critical' : 'error',
        timestamp: metrics.timestamp,
        resolved: false
      });
    }

    // API error rate check
    if (metrics.apiErrorRate && metrics.apiErrorRate > this.performanceThresholds.apiErrorRate) {
      issues.push({
        metric: 'apiErrorRate',
        threshold: this.performanceThresholds.apiErrorRate,
        currentValue: metrics.apiErrorRate,
        severity: metrics.apiErrorRate > 20 ? 'critical' : 'error',
        timestamp: metrics.timestamp,
        resolved: false
      });
    }

    // Database connections check
    if (metrics.dbConnections && metrics.dbConnections > this.performanceThresholds.dbConnections) {
      issues.push({
        metric: 'dbConnections',
        threshold: this.performanceThresholds.dbConnections,
        currentValue: metrics.dbConnections,
        severity: metrics.dbConnections > 150 ? 'critical' : 'warning',
        timestamp: metrics.timestamp,
        resolved: false
      });
    }

    return issues;
  }
}