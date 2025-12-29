import { prisma ,
  IntegrityAlertType,
  IntegrityAlertSeverity,
  IntegrityMetricType
} from '@warehouse-network/db'
import { subDays, format } from 'date-fns'

export interface LogAnalytics {
  totalLogs: number
  logsByCategory: Record<string, number>
  logsByLevel: Record<string, number>
  errorRate: number
  successRate: number
  avgDuration: number
  topErrors: Array<{
    errorCode: string
    message: string
    count: number
  }>
  componentActivity: Array<{
    component: string
    operations: number
    errors: number
    avgDuration: number
  }>
}

export interface AlertAnalytics {
  totalAlerts: number
  activeAlerts: number
  alertsBySeverity: Record<string, number>
  alertsByType: Record<string, number>
  avgResolutionTime: number
  unacknowledgedCritical: number
  topAffectedModels: Array<{
    model: string
    count: number
  }>
}

export interface PerformanceAnalytics {
  avgValidationTime: number
  avgMigrationTime: number
  avgDriftCheckTime: number
  throughputTrend: Array<{
    date: string
    operations: number
    avgDuration: number
  }>
  performanceByComponent: Array<{
    component: string
    avgDuration: number
    p95Duration: number
    p99Duration: number
  }>
}

export class MemoryBankAnalytics {
  /**
   * Generate comprehensive analytics for a time period
   */
  async generateAnalytics(days: number = 7): Promise<{
    logs: LogAnalytics
    alerts: AlertAnalytics
    performance: PerformanceAnalytics
    summary: {
      healthScore: number
      recommendations: string[]
    }
  }> {
    const startDate = subDays(new Date(), days)
    
    const [logs, alerts, performance] = await Promise.all([
      this.analyzeLog(startDate),
      this.analyzeAlerts(startDate),
      this.analyzePerformance(startDate)
    ])

    const summary = this.generateSummary(logs, alerts, performance)

    return {
      logs,
      alerts,
      performance,
      summary
    }
  }

  /**
   * Analyze logs
   */
  private async analyzeLog(startDate: Date): Promise<LogAnalytics> {
    const logs = await prisma.integrityLog.findMany({
      where: {
        timestamp: {
          gte: startDate
        }
      },
      select: {
        category: true,
        level: true,
        success: true,
        duration: true,
        errorCode: true,
        message: true,
        component: true
      }
    })

    const totalLogs = logs.length
    const successCount = logs.filter(l => l.success).length
    const errorCount = logs.filter(l => !l.success).length

    // Group by category
    const logsByCategory = logs.reduce((acc, log) => {
      acc[log.category] = (acc[log.category] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Group by level
    const logsByLevel = logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Calculate average duration
    const durations = logs.filter(l => l.duration).map(l => l.duration!)
    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0

    // Top errors
    const errorGroups = logs
      .filter(l => l.errorCode)
      .reduce((acc, log) => {
        const key = `${log.errorCode}:${log.message}`
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>)

    const topErrors = Object.entries(errorGroups)
      .map(([key, count]) => {
        const [errorCode, ...messageParts] = key.split(':')
        return {
          errorCode,
          message: messageParts.join(':'),
          count
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Component activity
    const componentGroups = logs.reduce((acc, log) => {
      if (!acc[log.component]) {
        acc[log.component] = {
          operations: 0,
          errors: 0,
          durations: []
        }
      }
      acc[log.component].operations++
      if (!log.success) {acc[log.component].errors++}
      if (log.duration) {acc[log.component].durations.push(log.duration)}
      return acc
    }, {} as Record<string, { operations: number, errors: number, durations: number[] }>)

    const componentActivity = Object.entries(componentGroups)
      .map(([component, data]) => ({
        component,
        operations: data.operations,
        errors: data.errors,
        avgDuration: data.durations.length > 0
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
          : 0
      }))
      .sort((a, b) => b.operations - a.operations)

    return {
      totalLogs,
      logsByCategory,
      logsByLevel,
      errorRate: totalLogs > 0 ? errorCount / totalLogs : 0,
      successRate: totalLogs > 0 ? successCount / totalLogs : 0,
      avgDuration,
      topErrors,
      componentActivity
    }
  }

  /**
   * Analyze alerts
   */
  private async analyzeAlerts(startDate: Date): Promise<AlertAnalytics> {
    const alerts = await prisma.integrityAlert.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      }
    })

    const totalAlerts = alerts.length
    const activeAlerts = alerts.filter(a => a.status !== 'RESOLVED').length

    // Group by severity
    const alertsBySeverity = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Group by type
    const alertsByType = alerts.reduce((acc, alert) => {
      acc[alert.alertType] = (acc[alert.alertType] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Calculate average resolution time
    const resolvedAlerts = alerts.filter(a => a.resolvedAt)
    const resolutionTimes = resolvedAlerts.map(a => 
      a.resolvedAt!.getTime() - a.createdAt.getTime()
    )
    const avgResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0

    // Unacknowledged critical
    const unacknowledgedCritical = alerts.filter(
      a => a.severity === IntegrityAlertSeverity.CRITICAL && !a.acknowledged
    ).length

    // Top affected models
    const modelCounts = alerts.reduce((acc, alert) => {
      alert.affectedModels.forEach(model => {
        acc[model] = (acc[model] || 0) + 1
      })
      return acc
    }, {} as Record<string, number>)

    const topAffectedModels = Object.entries(modelCounts)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalAlerts,
      activeAlerts,
      alertsBySeverity,
      alertsByType,
      avgResolutionTime,
      unacknowledgedCritical,
      topAffectedModels
    }
  }

  /**
   * Analyze performance
   */
  private async analyzePerformance(startDate: Date): Promise<PerformanceAnalytics> {
    const metrics = await prisma.integrityMetric.findMany({
      where: {
        timestamp: {
          gte: startDate
        },
        metricType: {
          in: [
            IntegrityMetricType.VALIDATION_TIME,
            IntegrityMetricType.MIGRATION_TIME,
            IntegrityMetricType.DRIFT_CHECK_TIME
          ]
        }
      }
    })

    // Calculate averages
    const validationMetrics = metrics.filter(m => m.metricType === IntegrityMetricType.VALIDATION_TIME)
    const migrationMetrics = metrics.filter(m => m.metricType === IntegrityMetricType.MIGRATION_TIME)
    const driftMetrics = metrics.filter(m => m.metricType === IntegrityMetricType.DRIFT_CHECK_TIME)

    const avgValidationTime = this.calculateAverage(validationMetrics.map(m => m.value))
    const avgMigrationTime = this.calculateAverage(migrationMetrics.map(m => m.value))
    const avgDriftCheckTime = this.calculateAverage(driftMetrics.map(m => m.value))

    // Get throughput trend
    const throughputTrend = await this.getThroughputTrend(startDate)

    // Get performance by component
    const performanceByComponent = await this.getComponentPerformance(startDate)

    return {
      avgValidationTime,
      avgMigrationTime,
      avgDriftCheckTime,
      throughputTrend,
      performanceByComponent
    }
  }

  /**
   * Get throughput trend by day
   */
  private async getThroughputTrend(startDate: Date): Promise<Array<{
    date: string
    operations: number
    avgDuration: number
  }>> {
    const logs = await prisma.integrityLog.findMany({
      where: {
        timestamp: {
          gte: startDate
        },
        duration: {
          not: null
        }
      },
      select: {
        timestamp: true,
        duration: true
      }
    })

    // Group by day
    const dayGroups = logs.reduce((acc, log) => {
      const day = format(log.timestamp, 'yyyy-MM-dd')
      if (!acc[day]) {
        acc[day] = {
          operations: 0,
          durations: []
        }
      }
      acc[day].operations++
      acc[day].durations.push(log.duration!)
      return acc
    }, {} as Record<string, { operations: number, durations: number[] }>)

    return Object.entries(dayGroups)
      .map(([date, data]) => ({
        date,
        operations: data.operations,
        avgDuration: this.calculateAverage(data.durations)
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /**
   * Get performance metrics by component
   */
  private async getComponentPerformance(startDate: Date): Promise<Array<{
    component: string
    avgDuration: number
    p95Duration: number
    p99Duration: number
  }>> {
    const logs = await prisma.integrityLog.findMany({
      where: {
        timestamp: {
          gte: startDate
        },
        duration: {
          not: null
        }
      },
      select: {
        component: true,
        duration: true
      }
    })

    // Group by component
    const componentGroups = logs.reduce((acc, log) => {
      if (!acc[log.component]) {
        acc[log.component] = []
      }
      acc[log.component].push(log.duration!)
      return acc
    }, {} as Record<string, number[]>)

    return Object.entries(componentGroups)
      .map(([component, durations]) => {
        const sorted = durations.sort((a, b) => a - b)
        return {
          component,
          avgDuration: this.calculateAverage(durations),
          p95Duration: this.calculatePercentile(sorted, 95),
          p99Duration: this.calculatePercentile(sorted, 99)
        }
      })
      .sort((a, b) => b.avgDuration - a.avgDuration)
  }

  /**
   * Generate summary and recommendations
   */
  private generateSummary(
    logs: LogAnalytics,
    alerts: AlertAnalytics,
    performance: PerformanceAnalytics
  ): {
    healthScore: number
    recommendations: string[]
  } {
    let healthScore = 100
    const recommendations: string[] = []

    // Deduct points for high error rate
    if (logs.errorRate > 0.1) {
      healthScore -= 20
      recommendations.push('High error rate detected. Review top errors and implement fixes.')
    }

    // Deduct points for unacknowledged critical alerts
    if (alerts.unacknowledgedCritical > 0) {
      healthScore -= 15
      recommendations.push(`${alerts.unacknowledgedCritical} critical alerts need immediate attention.`)
    }

    // Deduct points for slow performance
    if (performance.avgValidationTime > 1000) {
      healthScore -= 10
      recommendations.push('Validation performance is slow. Consider optimizing validation logic.')
    }

    // Add recommendations based on component activity
    const slowComponents = performance.performanceByComponent
      .filter(c => c.avgDuration > 2000)
      .map(c => c.component)
    
    if (slowComponents.length > 0) {
      recommendations.push(`Components with slow performance: ${slowComponents.join(', ')}`)
    }

    // Add recommendations based on alert patterns
    const driftAlerts = alerts.alertsByType[IntegrityAlertType.DRIFT_DETECTED] || 0
    if (driftAlerts > 5) {
      recommendations.push('Frequent drift detection. Review schema synchronization process.')
    }

    return {
      healthScore: Math.max(0, healthScore),
      recommendations
    }
  }

  /**
   * Helper functions
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) {return 0}
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) {return 0}
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1
    return sortedValues[index]
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(days: number = 30, format: 'json' | 'csv' = 'json'): Promise<string> {
    const analytics = await this.generateAnalytics(days)
    
    if (format === 'json') {
      return JSON.stringify(analytics, null, 2)
    }
    
    // CSV export - simplified view
    const csv: string[] = []
    csv.push('Metric,Value')
    csv.push(`Total Logs,${analytics.logs.totalLogs}`)
    csv.push(`Error Rate,${(analytics.logs.errorRate * 100).toFixed(2)}%`)
    csv.push(`Success Rate,${(analytics.logs.successRate * 100).toFixed(2)}%`)
    csv.push(`Active Alerts,${analytics.alerts.activeAlerts}`)
    csv.push(`Health Score,${analytics.summary.healthScore}`)
    
    return csv.join('\n')
  }
}