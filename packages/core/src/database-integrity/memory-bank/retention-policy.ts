import { prisma } from '@warehouse-network/db'
import { 
  IntegrityLogCategory, 
  IntegrityLogLevel,
  SnapshotType,
  IntegrityAlertStatus
} from '@warehouse-network/db'
import { getRetentionDays } from './log-categories'
import { subDays } from 'date-fns'

export interface RetentionPolicyConfig {
  logs: {
    defaultRetentionDays: number
    categoryOverrides: Partial<Record<IntegrityLogCategory, number>>
  }
  snapshots: {
    hourly: number  // keep last N hourly snapshots
    daily: number   // keep last N daily snapshots
    weekly: number  // keep last N weekly snapshots
    monthly: number // keep last N monthly snapshots
    onDemand: number // keep last N on-demand snapshots
  }
  alerts: {
    resolvedRetentionDays: number
    activeRetentionDays: number
  }
  metrics: {
    defaultRetentionDays: number
  }
}

const DEFAULT_RETENTION_POLICY: RetentionPolicyConfig = {
  logs: {
    defaultRetentionDays: 30,
    categoryOverrides: {
      [IntegrityLogCategory.MIGRATION]: 90,
      [IntegrityLogCategory.ERROR]: 90,
      [IntegrityLogCategory.AUDIT]: 365,
      [IntegrityLogCategory.PERFORMANCE]: 7,
      [IntegrityLogCategory.FORM_VALIDATION]: 14,
      [IntegrityLogCategory.ROUTE_VALIDATION]: 14
    }
  },
  snapshots: {
    hourly: 24,    // Keep last 24 hours
    daily: 7,      // Keep last 7 days
    weekly: 4,     // Keep last 4 weeks
    monthly: 12,   // Keep last 12 months
    onDemand: 10   // Keep last 10 on-demand snapshots
  },
  alerts: {
    resolvedRetentionDays: 90,
    activeRetentionDays: 365
  },
  metrics: {
    defaultRetentionDays: 30
  }
}

export class RetentionPolicyManager {
  private config: RetentionPolicyConfig

  constructor(config?: Partial<RetentionPolicyConfig>) {
    this.config = {
      ...DEFAULT_RETENTION_POLICY,
      ...config
    }
  }

  /**
   * Execute retention policy cleanup
   */
  async executeCleanup(): Promise<{
    logsDeleted: number
    snapshotsDeleted: number
    alertsDeleted: number
    metricsDeleted: number
  }> {
    const results = await Promise.all([
      this.cleanupLogs(),
      this.cleanupSnapshots(),
      this.cleanupAlerts(),
      this.cleanupMetrics()
    ])

    return {
      logsDeleted: results[0],
      snapshotsDeleted: results[1],
      alertsDeleted: results[2],
      metricsDeleted: results[3]
    }
  }

  /**
   * Clean up old logs based on retention policy
   */
  private async cleanupLogs(): Promise<number> {
    const deletions: Promise<{ count: number }>[] = []

    // Clean up logs by category
    for (const category of Object.values(IntegrityLogCategory)) {
      const retentionDays = this.config.logs.categoryOverrides[category] || this.config.logs.defaultRetentionDays
      const cutoffDate = subDays(new Date(), retentionDays)

      deletions.push(
        prisma.integrityLog.deleteMany({
          where: {
            category,
            timestamp: {
              lt: cutoffDate
            }
          }
        })
      )
    }

    const results = await Promise.all(deletions)
    return results.reduce((sum, result) => sum + result.count, 0)
  }

  /**
   * Clean up old snapshots based on retention policy
   */
  private async cleanupSnapshots(): Promise<number> {
    let totalDeleted = 0

    // Clean up each snapshot type
    for (const [type, limit] of Object.entries(this.config.snapshots)) {
      const snapshotType = type.toUpperCase().replace('_', '') as SnapshotType
      
      // Get snapshots to keep
      const snapshotsToKeep = await prisma.integritySnapshot.findMany({
        where: { snapshotType },
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: { id: true }
      })

      const idsToKeep = snapshotsToKeep.map(s => s.id)

      // Delete older snapshots
      const result = await prisma.integritySnapshot.deleteMany({
        where: {
          snapshotType,
          id: {
            notIn: idsToKeep
          }
        }
      })

      totalDeleted += result.count
    }

    return totalDeleted
  }

  /**
   * Clean up old alerts based on retention policy
   */
  private async cleanupAlerts(): Promise<number> {
    const resolvedCutoff = subDays(new Date(), this.config.alerts.resolvedRetentionDays)
    const activeCutoff = subDays(new Date(), this.config.alerts.activeRetentionDays)

    const results = await Promise.all([
      // Delete old resolved alerts
      prisma.integrityAlert.deleteMany({
        where: {
          status: IntegrityAlertStatus.RESOLVED,
          resolvedAt: {
            lt: resolvedCutoff
          }
        }
      }),
      // Delete very old active alerts
      prisma.integrityAlert.deleteMany({
        where: {
          status: {
            not: IntegrityAlertStatus.RESOLVED
          },
          createdAt: {
            lt: activeCutoff
          }
        }
      })
    ])

    return results.reduce((sum, result) => sum + result.count, 0)
  }

  /**
   * Clean up old metrics based on retention policy
   */
  private async cleanupMetrics(): Promise<number> {
    const cutoffDate = subDays(new Date(), this.config.metrics.defaultRetentionDays)

    const result = await prisma.integrityMetric.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate
        }
      }
    })

    return result.count
  }

  /**
   * Get retention statistics
   */
  async getRetentionStats() {
    const [logs, snapshots, alerts, metrics] = await Promise.all([
      this.getLogStats(),
      this.getSnapshotStats(),
      this.getAlertStats(),
      this.getMetricStats()
    ])

    return {
      logs,
      snapshots,
      alerts,
      metrics
    }
  }

  private async getLogStats() {
    const stats = await prisma.integrityLog.groupBy({
      by: ['category'],
      _count: true,
      _min: {
        timestamp: true
      },
      _max: {
        timestamp: true
      }
    })

    return stats.map(stat => ({
      category: stat.category,
      count: stat._count,
      oldest: stat._min.timestamp,
      newest: stat._max.timestamp,
      retentionDays: this.config.logs.categoryOverrides[stat.category] || this.config.logs.defaultRetentionDays
    }))
  }

  private async getSnapshotStats() {
    const stats = await prisma.integritySnapshot.groupBy({
      by: ['snapshotType'],
      _count: true,
      _min: {
        timestamp: true
      },
      _max: {
        timestamp: true
      }
    })

    return stats.map(stat => ({
      type: stat.snapshotType,
      count: stat._count,
      oldest: stat._min.timestamp,
      newest: stat._max.timestamp
    }))
  }

  private async getAlertStats() {
    const stats = await prisma.integrityAlert.groupBy({
      by: ['status'],
      _count: true
    })

    return stats.map(stat => ({
      status: stat.status,
      count: stat._count
    }))
  }

  private async getMetricStats() {
    const count = await prisma.integrityMetric.count()
    const oldestNewest = await prisma.integrityMetric.aggregate({
      _min: {
        timestamp: true
      },
      _max: {
        timestamp: true
      }
    })

    return {
      count,
      oldest: oldestNewest._min.timestamp,
      newest: oldestNewest._max.timestamp,
      retentionDays: this.config.metrics.defaultRetentionDays
    }
  }
}