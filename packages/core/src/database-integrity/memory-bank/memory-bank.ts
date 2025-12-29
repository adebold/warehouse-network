import { prisma ,
  IntegrityLog,
  IntegritySnapshot,
  IntegrityAlert,
  IntegrityMetric,
  IntegrityLogCategory,
  IntegrityLogLevel,
  IntegrityAlertType,
  IntegrityAlertSeverity,
  IntegrityMetricType,
  SnapshotType
} from '@warehouse-network/db'
import { v4 as uuidv4 } from 'uuid'

import { MemoryBankAnalytics } from './analytics'
import { shouldPersistLog, shouldCreateAlert } from './log-categories'
import { RetentionPolicyManager } from './retention-policy'


export interface LogEntry {
  category: IntegrityLogCategory
  level: IntegrityLogLevel
  operation: string
  component: string
  message: string
  details?: any
  metadata?: any
  duration?: number
  success: boolean
  error?: Error
  userId?: string
  correlationId?: string
}

export interface SnapshotData {
  schemaHash: string
  modelCount: number
  fieldCount: number
  relationCount: number
  indexCount: number
  enumCount: number
  validationsPassed: number
  validationsFailed: number
  driftDetected?: boolean
  driftDetails?: any
  performanceMetrics?: any
}

export interface AlertData {
  alertType: IntegrityAlertType
  severity: IntegrityAlertSeverity
  title: string
  description: string
  affectedModels?: string[]
  affectedFields?: string[]
  details?: any
}

export interface MetricData {
  metricType: IntegrityMetricType
  component: string
  name: string
  value: number
  unit?: string
  tags?: any
}

export class MemoryBank {
  private _retentionManager: RetentionPolicyManager
  private _analytics: MemoryBankAnalytics
  public correlationId?: string

  constructor() {
    this._retentionManager = new RetentionPolicyManager()
    this._analytics = new MemoryBankAnalytics()
  }

  get retentionManager(): RetentionPolicyManager {
    return this._retentionManager
  }

  get analytics(): MemoryBankAnalytics {
    return this._analytics
  }

  /**
   * Set correlation ID for tracking related operations
   */
  setCorrelationId(id?: string) {
    this.correlationId = id || uuidv4()
    return this.correlationId
  }

  /**
   * Log an integrity operation
   */
  async log(entry: LogEntry): Promise<IntegrityLog> {
    // Check if we should persist this log
    if (!shouldPersistLog(entry.category, entry.level)) {
      // Still return a mock object for consistency
      return {
        id: uuidv4(),
        ...entry,
        errorCode: entry.error?.name,
        stackTrace: entry.error?.stack,
        correlationId: entry.correlationId || this.correlationId,
        timestamp: new Date()
      } as IntegrityLog
    }

    // Create log entry
    const log = await prisma.integrityLog.create({
      data: {
        category: entry.category,
        level: entry.level,
        operation: entry.operation,
        component: entry.component,
        message: entry.message,
        details: entry.details,
        metadata: entry.metadata,
        duration: entry.duration,
        success: entry.success,
        errorCode: entry.error?.name,
        stackTrace: entry.error?.stack,
        userId: entry.userId,
        correlationId: entry.correlationId || this.correlationId
      }
    })

    // Create alert if needed
    if (shouldCreateAlert(entry.level) && !entry.success) {
      await this.createAlertFromLog(log)
    }

    return log
  }

  /**
   * Create a snapshot of the current integrity state
   */
  async createSnapshot(
    type: SnapshotType,
    data: SnapshotData
  ): Promise<IntegritySnapshot> {
    return prisma.integritySnapshot.create({
      data: {
        snapshotType: type,
        ...data
      }
    })
  }

  /**
   * Create an integrity alert
   */
  async createAlert(data: AlertData): Promise<IntegrityAlert> {
    return prisma.integrityAlert.create({
      data: {
        ...data,
        affectedModels: data.affectedModels || [],
        affectedFields: data.affectedFields || []
      }
    })
  }

  /**
   * Record a metric
   */
  async recordMetric(data: MetricData): Promise<IntegrityMetric> {
    return prisma.integrityMetric.create({
      data
    })
  }

  /**
   * Batch log multiple entries
   */
  async logBatch(entries: LogEntry[]): Promise<IntegrityLog[]> {
    const validEntries = entries.filter(entry => 
      shouldPersistLog(entry.category, entry.level)
    )

    if (validEntries.length === 0) {
      return []
    }

    const logs = await prisma.integrityLog.createMany({
      data: validEntries.map(entry => ({
        category: entry.category,
        level: entry.level,
        operation: entry.operation,
        component: entry.component,
        message: entry.message,
        details: entry.details,
        metadata: entry.metadata,
        duration: entry.duration,
        success: entry.success,
        errorCode: entry.error?.name,
        stackTrace: entry.error?.stack,
        userId: entry.userId,
        correlationId: entry.correlationId || this.correlationId
      }))
    })

    // Check for alerts
    const alertEntries = validEntries.filter(entry => 
      shouldCreateAlert(entry.level) && !entry.success
    )

    if (alertEntries.length > 0) {
      await this.createAlertsFromEntries(alertEntries)
    }

    return []
  }

  /**
   * Batch record multiple metrics
   */
  async recordMetricsBatch(metrics: MetricData[]): Promise<void> {
    await prisma.integrityMetric.createMany({
      data: metrics
    })
  }

  /**
   * Search logs
   */
  async searchLogs(params: {
    category?: IntegrityLogCategory
    level?: IntegrityLogLevel
    component?: string
    success?: boolean
    startDate?: Date
    endDate?: Date
    searchText?: string
    limit?: number
    offset?: number
  }) {
    const where: any = {}

    if (params.category) {where.category = params.category}
    if (params.level) {where.level = params.level}
    if (params.component) {where.component = params.component}
    if (params.success !== undefined) {where.success = params.success}

    if (params.startDate || params.endDate) {
      where.timestamp = {}
      if (params.startDate) {where.timestamp.gte = params.startDate}
      if (params.endDate) {where.timestamp.lte = params.endDate}
    }

    if (params.searchText) {
      where.OR = [
        { message: { contains: params.searchText, mode: 'insensitive' } },
        { operation: { contains: params.searchText, mode: 'insensitive' } }
      ]
    }

    const [logs, total] = await Promise.all([
      prisma.integrityLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: params.limit || 100,
        skip: params.offset || 0
      }),
      prisma.integrityLog.count({ where })
    ])

    return {
      logs,
      total,
      hasMore: (params.offset || 0) + logs.length < total
    }
  }

  /**
   * Get recent alerts
   */
  async getAlerts(params: {
    status?: 'active' | 'acknowledged' | 'resolved'
    severity?: IntegrityAlertSeverity
    type?: IntegrityAlertType
    limit?: number
  }) {
    const where: any = {}

    if (params.status) {
      if (params.status === 'active') {
        where.status = { in: ['ACTIVE', 'IN_PROGRESS'] }
      } else if (params.status === 'acknowledged') {
        where.acknowledged = true
        where.status = { not: 'RESOLVED' }
      } else if (params.status === 'resolved') {
        where.status = 'RESOLVED'
      }
    }

    if (params.severity) {where.severity = params.severity}
    if (params.type) {where.alertType = params.type}

    return prisma.integrityAlert.findMany({
      where,
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' }
      ],
      take: params.limit || 50
    })
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string) {
    return prisma.integrityAlert.update({
      where: { id: alertId },
      data: {
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
        status: 'ACKNOWLEDGED'
      }
    })
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string, notes?: string) {
    return prisma.integrityAlert.update({
      where: { id: alertId },
      data: {
        status: 'RESOLVED',
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNotes: notes
      }
    })
  }

  /**
   * Get latest snapshot
   */
  async getLatestSnapshot(type?: SnapshotType): Promise<IntegritySnapshot | null> {
    return prisma.integritySnapshot.findFirst({
      where: type ? { snapshotType: type } : undefined,
      orderBy: { timestamp: 'desc' }
    })
  }

  /**
   * Compare snapshots
   */
  async compareSnapshots(snapshotId1: string, snapshotId2: string) {
    const [snapshot1, snapshot2] = await Promise.all([
      prisma.integritySnapshot.findUnique({ where: { id: snapshotId1 } }),
      prisma.integritySnapshot.findUnique({ where: { id: snapshotId2 } })
    ])

    if (!snapshot1 || !snapshot2) {
      throw new Error('Snapshot not found')
    }

    return {
      snapshot1,
      snapshot2,
      changes: {
        modelCount: snapshot2.modelCount - snapshot1.modelCount,
        fieldCount: snapshot2.fieldCount - snapshot1.fieldCount,
        relationCount: snapshot2.relationCount - snapshot1.relationCount,
        indexCount: snapshot2.indexCount - snapshot1.indexCount,
        enumCount: snapshot2.enumCount - snapshot1.enumCount,
        schemaChanged: snapshot1.schemaHash !== snapshot2.schemaHash
      }
    }
  }

  /**
   * Run retention cleanup
   */
  async runRetentionCleanup() {
    const startTime = Date.now()
    
    try {
      const results = await this._retentionManager.executeCleanup()
      
      await this.log({
        category: IntegrityLogCategory.MAINTENANCE,
        level: IntegrityLogLevel.INFO,
        operation: 'retention_cleanup',
        component: 'MemoryBank',
        message: 'Retention cleanup completed',
        details: results,
        duration: Date.now() - startTime,
        success: true
      })

      return results
    } catch (error) {
      await this.log({
        category: IntegrityLogCategory.MAINTENANCE,
        level: IntegrityLogLevel.ERROR,
        operation: 'retention_cleanup',
        component: 'MemoryBank',
        message: 'Retention cleanup failed',
        duration: Date.now() - startTime,
        success: false,
        error: error as Error
      })

      throw error
    }
  }

  /**
   * Get analytics
   */
  async getAnalytics(days: number = 7) {
    return this._analytics.generateAnalytics(days)
  }

  /**
   * Export logs
   */
  async exportLogs(params: {
    format: 'json' | 'csv'
    startDate?: Date
    endDate?: Date
    category?: IntegrityLogCategory
  }): Promise<string> {
    const logs = await this.searchLogs({
      ...params,
      limit: 10000
    })

    if (params.format === 'json') {
      return JSON.stringify(logs.logs, null, 2)
    }

    // CSV format
    const csv: string[] = []
    csv.push('Timestamp,Category,Level,Component,Operation,Message,Success,Duration,ErrorCode')
    
    logs.logs.forEach(log => {
      csv.push([
        log.timestamp.toISOString(),
        log.category,
        log.level,
        log.component,
        log.operation,
        `"${log.message.replace(/"/g, '""')}"`,
        log.success.toString(),
        log.duration?.toString() || '',
        log.errorCode || ''
      ].join(','))
    })

    return csv.join('\n')
  }

  /**
   * Private helper to create alert from log
   */
  private async createAlertFromLog(log: IntegrityLog) {
    const alertType = this.mapLogToAlertType(log)
    const severity = this.mapLogToAlertSeverity(log)

    await this.createAlert({
      alertType,
      severity,
      title: `${log.component}: ${log.operation} failed`,
      description: log.message,
      details: {
        logId: log.id,
        errorCode: log.errorCode,
        ...log.details
      }
    })
  }

  /**
   * Private helper to create alerts from entries
   */
  private async createAlertsFromEntries(entries: LogEntry[]) {
    const alerts = entries.map(entry => ({
      alertType: this.mapEntryToAlertType(entry),
      severity: this.mapEntryToAlertSeverity(entry),
      title: `${entry.component}: ${entry.operation} failed`,
      description: entry.message,
      affectedModels: [],
      affectedFields: [],
      details: {
        errorCode: entry.error?.name,
        ...entry.details
      }
    }))

    await prisma.integrityAlert.createMany({
      data: alerts
    })
  }

  /**
   * Map log to alert type
   */
  private mapLogToAlertType(log: IntegrityLog): IntegrityAlertType {
    if (log.category === IntegrityLogCategory.MIGRATION) {
      return IntegrityAlertType.MIGRATION_ERROR
    }
    if (log.category === IntegrityLogCategory.DRIFT_DETECTION) {
      return IntegrityAlertType.DRIFT_DETECTED
    }
    if (log.category === IntegrityLogCategory.VALIDATION) {
      return IntegrityAlertType.VALIDATION_FAILURE
    }
    return IntegrityAlertType.MAINTENANCE_REQUIRED
  }

  /**
   * Map entry to alert type
   */
  private mapEntryToAlertType(entry: LogEntry): IntegrityAlertType {
    if (entry.category === IntegrityLogCategory.MIGRATION) {
      return IntegrityAlertType.MIGRATION_ERROR
    }
    if (entry.category === IntegrityLogCategory.DRIFT_DETECTION) {
      return IntegrityAlertType.DRIFT_DETECTED
    }
    if (entry.category === IntegrityLogCategory.VALIDATION) {
      return IntegrityAlertType.VALIDATION_FAILURE
    }
    return IntegrityAlertType.MAINTENANCE_REQUIRED
  }

  /**
   * Map log to alert severity
   */
  private mapLogToAlertSeverity(log: IntegrityLog): IntegrityAlertSeverity {
    if (log.level === IntegrityLogLevel.CRITICAL) {
      return IntegrityAlertSeverity.CRITICAL
    }
    if (log.level === IntegrityLogLevel.ERROR) {
      return IntegrityAlertSeverity.HIGH
    }
    return IntegrityAlertSeverity.MEDIUM
  }

  /**
   * Map entry to alert severity
   */
  private mapEntryToAlertSeverity(entry: LogEntry): IntegrityAlertSeverity {
    if (entry.level === IntegrityLogLevel.CRITICAL) {
      return IntegrityAlertSeverity.CRITICAL
    }
    if (entry.level === IntegrityLogLevel.ERROR) {
      return IntegrityAlertSeverity.HIGH
    }
    return IntegrityAlertSeverity.MEDIUM
  }
}

// Export singleton instance
export const memoryBank = new MemoryBank()