import { MetricsCollector } from './metrics';
import { logger } from './logger';

export interface QualityMetric {
  projectId: string;
  checkId: string;
  timestamp: Date;
  score: number;
  passed: boolean;
  blockers: number;
  duration: number;
  type: 'pre-deployment' | 'post-deployment' | 'scheduled';
}

export interface QualityTrendData {
  projectId: string;
  period: string;
  averageScore: number;
  passRate: number;
  totalChecks: number;
  commonIssues: { [key: string]: number };
}

export class QualityMetricsCollector {
  private static instance: QualityMetricsCollector;
  private metrics: QualityMetric[] = [];
  private readonly maxMetrics = 10000;

  private constructor() {
    // Initialize periodic cleanup
    setInterval(() => this.cleanupOldMetrics(), 3600000); // 1 hour
  }

  public static getInstance(): QualityMetricsCollector {
    if (!QualityMetricsCollector.instance) {
      QualityMetricsCollector.instance = new QualityMetricsCollector();
    }
    return QualityMetricsCollector.instance;
  }

  /**
   * Record a quality check metric
   */
  public recordQualityCheck(metric: QualityMetric): void {
    this.metrics.push(metric);
    
    // Send to main metrics collector
    MetricsCollector.recordQualityCheck({
      projectId: metric.projectId,
      score: metric.score,
      passed: metric.passed,
      duration: metric.duration,
      blockersCount: metric.blockers
    });
    
    // Trim if necessary
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    
    logger.debug('Recorded quality metric', {
      projectId: metric.projectId,
      checkId: metric.checkId,
      score: metric.score
    });
  }

  /**
   * Get quality trends for a project
   */
  public getProjectTrends(
    projectId: string,
    hours: number = 24
  ): QualityTrendData {
    const cutoffTime = new Date(Date.now() - hours * 3600000);
    const projectMetrics = this.metrics.filter(m => 
      m.projectId === projectId && m.timestamp > cutoffTime
    );
    
    if (projectMetrics.length === 0) {
      return {
        projectId,
        period: `${hours}h`,
        averageScore: 0,
        passRate: 0,
        totalChecks: 0,
        commonIssues: {}
      };
    }
    
    const totalScore = projectMetrics.reduce((sum, m) => sum + m.score, 0);
    const passedCount = projectMetrics.filter(m => m.passed).length;
    
    // Count issue types (simplified - in real implementation would parse blockers)
    const issueTypes: { [key: string]: number } = {};
    projectMetrics.forEach(m => {
      if (m.blockers > 0) {
        const category = this.categorizeBlockerCount(m.blockers);
        issueTypes[category] = (issueTypes[category] || 0) + 1;
      }
    });
    
    return {
      projectId,
      period: `${hours}h`,
      averageScore: totalScore / projectMetrics.length,
      passRate: (passedCount / projectMetrics.length) * 100,
      totalChecks: projectMetrics.length,
      commonIssues: issueTypes
    };
  }

  /**
   * Get aggregated metrics across all projects
   */
  public getAggregatedMetrics(hours: number = 24): {
    totalChecks: number;
    averageScore: number;
    passRate: number;
    averageDuration: number;
    projectCount: number;
    scoreDistribution: { [key: string]: number };
  } {
    const cutoffTime = new Date(Date.now() - hours * 3600000);
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoffTime);
    
    if (recentMetrics.length === 0) {
      return {
        totalChecks: 0,
        averageScore: 0,
        passRate: 0,
        averageDuration: 0,
        projectCount: 0,
        scoreDistribution: {}
      };
    }
    
    const totalScore = recentMetrics.reduce((sum, m) => sum + m.score, 0);
    const totalDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0);
    const passedCount = recentMetrics.filter(m => m.passed).length;
    const uniqueProjects = new Set(recentMetrics.map(m => m.projectId));
    
    // Calculate score distribution
    const scoreDistribution = {
      excellent: 0,  // 9-10
      good: 0,       // 7-9
      fair: 0,       // 5-7
      poor: 0        // <5
    };
    
    recentMetrics.forEach(m => {
      if (m.score >= 9) scoreDistribution.excellent++;
      else if (m.score >= 7) scoreDistribution.good++;
      else if (m.score >= 5) scoreDistribution.fair++;
      else scoreDistribution.poor++;
    });
    
    return {
      totalChecks: recentMetrics.length,
      averageScore: totalScore / recentMetrics.length,
      passRate: (passedCount / recentMetrics.length) * 100,
      averageDuration: totalDuration / recentMetrics.length,
      projectCount: uniqueProjects.size,
      scoreDistribution
    };
  }

  /**
   * Get quality degradation alerts
   */
  public getQualityAlerts(thresholdDrop: number = 2.0): Array<{
    projectId: string;
    currentScore: number;
    previousScore: number;
    drop: number;
    timestamp: Date;
  }> {
    const alerts: Array<{
      projectId: string;
      currentScore: number;
      previousScore: number;
      drop: number;
      timestamp: Date;
    }> = [];
    
    // Group metrics by project
    const projectGroups = new Map<string, QualityMetric[]>();
    this.metrics.forEach(m => {
      if (!projectGroups.has(m.projectId)) {
        projectGroups.set(m.projectId, []);
      }
      projectGroups.get(m.projectId)!.push(m);
    });
    
    // Check each project for quality drops
    projectGroups.forEach((metrics, projectId) => {
      // Sort by timestamp
      const sorted = metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      if (sorted.length >= 2) {
        const latest = sorted[sorted.length - 1];
        const previous = sorted[sorted.length - 2];
        const drop = previous.score - latest.score;
        
        if (drop >= thresholdDrop) {
          alerts.push({
            projectId,
            currentScore: latest.score,
            previousScore: previous.score,
            drop,
            timestamp: latest.timestamp
          });
        }
      }
    });
    
    return alerts;
  }

  /**
   * Get performance insights
   */
  public getPerformanceInsights(): {
    slowestProjects: Array<{ projectId: string; avgDuration: number }>;
    mostFailures: Array<{ projectId: string; failureRate: number }>;
    lowestScores: Array<{ projectId: string; avgScore: number }>;
  } {
    const projectStats = new Map<string, {
      totalDuration: number;
      totalScore: number;
      totalChecks: number;
      failedChecks: number;
    }>();
    
    // Aggregate stats by project
    this.metrics.forEach(m => {
      if (!projectStats.has(m.projectId)) {
        projectStats.set(m.projectId, {
          totalDuration: 0,
          totalScore: 0,
          totalChecks: 0,
          failedChecks: 0
        });
      }
      
      const stats = projectStats.get(m.projectId)!;
      stats.totalDuration += m.duration;
      stats.totalScore += m.score;
      stats.totalChecks++;
      if (!m.passed) stats.failedChecks++;
    });
    
    // Convert to arrays for sorting
    const projectArray = Array.from(projectStats.entries()).map(([projectId, stats]) => ({
      projectId,
      avgDuration: stats.totalDuration / stats.totalChecks,
      avgScore: stats.totalScore / stats.totalChecks,
      failureRate: (stats.failedChecks / stats.totalChecks) * 100
    }));
    
    return {
      slowestProjects: projectArray
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, 5)
        .map(p => ({ projectId: p.projectId, avgDuration: p.avgDuration })),
      
      mostFailures: projectArray
        .sort((a, b) => b.failureRate - a.failureRate)
        .slice(0, 5)
        .map(p => ({ projectId: p.projectId, failureRate: p.failureRate })),
      
      lowestScores: projectArray
        .sort((a, b) => a.avgScore - b.avgScore)
        .slice(0, 5)
        .map(p => ({ projectId: p.projectId, avgScore: p.avgScore }))
    };
  }

  /**
   * Export metrics for reporting
   */
  public exportMetrics(
    startDate?: Date,
    endDate?: Date
  ): QualityMetric[] {
    let filtered = this.metrics;
    
    if (startDate) {
      filtered = filtered.filter(m => m.timestamp >= startDate);
    }
    
    if (endDate) {
      filtered = filtered.filter(m => m.timestamp <= endDate);
    }
    
    return filtered;
  }

  /**
   * Clean up old metrics
   */
  private cleanupOldMetrics(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600000);
    const beforeCount = this.metrics.length;
    
    this.metrics = this.metrics.filter(m => m.timestamp > oneWeekAgo);
    
    const removed = beforeCount - this.metrics.length;
    if (removed > 0) {
      logger.info(`Cleaned up ${removed} old quality metrics`);
    }
  }

  /**
   * Helper to categorize blocker counts
   */
  private categorizeBlockerCount(blockers: number): string {
    if (blockers === 0) return 'none';
    if (blockers <= 2) return 'low';
    if (blockers <= 5) return 'medium';
    if (blockers <= 10) return 'high';
    return 'critical';
  }
}