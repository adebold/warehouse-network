import { IntegrityLogCategory, IntegrityLogLevel } from '@warehouse-network/db'

// Log category configurations
export const LOG_CATEGORIES = {
  [IntegrityLogCategory.VALIDATION]: {
    name: 'Validation',
    description: 'Schema and data validation operations',
    retention: 30, // days
    levels: [IntegrityLogLevel.DEBUG, IntegrityLogLevel.INFO, IntegrityLogLevel.WARNING, IntegrityLogLevel.ERROR]
  },
  [IntegrityLogCategory.MIGRATION]: {
    name: 'Migration',
    description: 'Database migration operations',
    retention: 90, // days - keep migration logs longer
    levels: [IntegrityLogLevel.INFO, IntegrityLogLevel.WARNING, IntegrityLogLevel.ERROR, IntegrityLogLevel.CRITICAL]
  },
  [IntegrityLogCategory.DRIFT_DETECTION]: {
    name: 'Drift Detection',
    description: 'Schema drift detection and analysis',
    retention: 60, // days
    levels: [IntegrityLogLevel.INFO, IntegrityLogLevel.WARNING, IntegrityLogLevel.ERROR]
  },
  [IntegrityLogCategory.SCHEMA_ANALYSIS]: {
    name: 'Schema Analysis',
    description: 'Schema structure and complexity analysis',
    retention: 30, // days
    levels: [IntegrityLogLevel.DEBUG, IntegrityLogLevel.INFO]
  },
  [IntegrityLogCategory.FORM_VALIDATION]: {
    name: 'Form Validation',
    description: 'Form field validation tracking',
    retention: 14, // days
    levels: [IntegrityLogLevel.DEBUG, IntegrityLogLevel.INFO, IntegrityLogLevel.WARNING]
  },
  [IntegrityLogCategory.ROUTE_VALIDATION]: {
    name: 'Route Validation',
    description: 'Route handler validation tracking',
    retention: 14, // days
    levels: [IntegrityLogLevel.DEBUG, IntegrityLogLevel.INFO, IntegrityLogLevel.WARNING]
  },
  [IntegrityLogCategory.PERFORMANCE]: {
    name: 'Performance',
    description: 'Performance metrics and monitoring',
    retention: 7, // days
    levels: [IntegrityLogLevel.INFO, IntegrityLogLevel.WARNING]
  },
  [IntegrityLogCategory.ERROR]: {
    name: 'Error',
    description: 'Error tracking and diagnostics',
    retention: 90, // days - keep errors longer
    levels: [IntegrityLogLevel.ERROR, IntegrityLogLevel.CRITICAL]
  },
  [IntegrityLogCategory.AUDIT]: {
    name: 'Audit',
    description: 'Audit trail for compliance',
    retention: 365, // days - keep audit logs for a year
    levels: [IntegrityLogLevel.INFO]
  },
  [IntegrityLogCategory.MAINTENANCE]: {
    name: 'Maintenance',
    description: 'Maintenance operations and cleanup',
    retention: 30, // days
    levels: [IntegrityLogLevel.INFO, IntegrityLogLevel.WARNING]
  }
} as const

// Log level configurations
export const LOG_LEVELS = {
  [IntegrityLogLevel.DEBUG]: {
    name: 'Debug',
    priority: 0,
    color: '#6B7280', // gray
    shouldAlert: false
  },
  [IntegrityLogLevel.INFO]: {
    name: 'Information',
    priority: 1,
    color: '#3B82F6', // blue
    shouldAlert: false
  },
  [IntegrityLogLevel.WARNING]: {
    name: 'Warning',
    priority: 2,
    color: '#F59E0B', // amber
    shouldAlert: false
  },
  [IntegrityLogLevel.ERROR]: {
    name: 'Error',
    priority: 3,
    color: '#EF4444', // red
    shouldAlert: true
  },
  [IntegrityLogLevel.CRITICAL]: {
    name: 'Critical',
    priority: 4,
    color: '#7C3AED', // purple
    shouldAlert: true
  }
} as const

// Helper to determine if a log should be persisted based on level
export function shouldPersistLog(category: IntegrityLogCategory, level: IntegrityLogLevel): boolean {
  const categoryConfig = LOG_CATEGORIES[category]
  return categoryConfig.levels.includes(level)
}

// Helper to get retention days for a category
export function getRetentionDays(category: IntegrityLogCategory): number {
  return LOG_CATEGORIES[category]?.retention || 30
}

// Helper to determine if an alert should be created
export function shouldCreateAlert(level: IntegrityLogLevel): boolean {
  return LOG_LEVELS[level]?.shouldAlert || false
}