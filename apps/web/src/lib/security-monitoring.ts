import { NextRequest } from 'next/server'
import { prisma } from './prisma'

export interface SecurityEvent {
  type: SecurityEventType
  severity: 'low' | 'medium' | 'high' | 'critical'
  userId?: string
  organizationId?: string
  ipAddress: string
  userAgent: string
  endpoint: string
  details: any
  timestamp: Date
}

export type SecurityEventType =
  | 'authentication_failure'
  | 'authentication_success'
  | 'rate_limit_exceeded'
  | 'suspicious_activity'
  | 'brute_force_detected'
  | 'csrf_violation'
  | 'csp_violation'
  | 'privilege_escalation_attempt'
  | 'data_access_anomaly'
  | 'session_hijacking_attempt'
  | 'sql_injection_attempt'
  | 'xss_attempt'
  | 'file_upload_abuse'
  | 'api_abuse'
  | 'account_takeover_attempt'

export interface ThreatPattern {
  name: string
  indicators: string[]
  threshold: number
  windowMinutes: number
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface SecurityAlert {
  id: string
  type: SecurityEventType
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  indicators: string[]
  affectedUsers: string[]
  ipAddresses: string[]
  timestamp: Date
  resolved: boolean
  actionsTaken: string[]
}

/**
 * Main security monitoring class
 */
export class SecurityMonitor {
  private threatPatterns: ThreatPattern[] = [
    {
      name: 'Brute Force Login',
      indicators: ['authentication_failure'],
      threshold: 5,
      windowMinutes: 15,
      severity: 'high'
    },
    {
      name: 'Rapid API Abuse',
      indicators: ['rate_limit_exceeded'],
      threshold: 3,
      windowMinutes: 5,
      severity: 'medium'
    },
    {
      name: 'Session Anomaly',
      indicators: ['session_hijacking_attempt', 'privilege_escalation_attempt'],
      threshold: 1,
      windowMinutes: 60,
      severity: 'critical'
    },
    {
      name: 'Injection Attack',
      indicators: ['sql_injection_attempt', 'xss_attempt'],
      threshold: 1,
      windowMinutes: 60,
      severity: 'critical'
    }
  ]

  /**
   * Record a security event
   */
  async recordEvent(event: Omit<SecurityEvent, 'timestamp'>): Promise<void> {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    }

    try {
      // Store in database
      await prisma.securityEvent.create({
        data: {
          type: fullEvent.type,
          severity: fullEvent.severity,
          userId: fullEvent.userId,
          organizationId: fullEvent.organizationId,
          ipAddress: fullEvent.ipAddress,
          userAgent: fullEvent.userAgent,
          endpoint: fullEvent.endpoint,
          details: JSON.stringify(fullEvent.details),
          timestamp: fullEvent.timestamp,
        },
      })

      // Check for patterns that might indicate an attack
      await this.analyzeForThreats(fullEvent)

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('Security Event:', fullEvent)
      }
    } catch (error) {
      console.error('Failed to record security event:', error)
    }
  }

  /**
   * Analyze recent events for threat patterns
   */
  private async analyzeForThreats(currentEvent: SecurityEvent): Promise<void> {
    for (const pattern of this.threatPatterns) {
      if (pattern.indicators.includes(currentEvent.type)) {
        const windowStart = new Date(
          currentEvent.timestamp.getTime() - pattern.windowMinutes * 60 * 1000
        )

        // Count matching events in the time window
        const eventCount = await prisma.securityEvent.count({
          where: {
            type: { in: pattern.indicators },
            ipAddress: currentEvent.ipAddress,
            timestamp: { gte: windowStart },
          },
        })

        if (eventCount >= pattern.threshold) {
          await this.triggerAlert(pattern, currentEvent, eventCount)
        }
      }
    }
  }

  /**
   * Trigger security alert
   */
  private async triggerAlert(
    pattern: ThreatPattern,
    event: SecurityEvent,
    eventCount: number
  ): Promise<void> {
    const alert: SecurityAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: event.type,
      severity: pattern.severity,
      title: `${pattern.name} Detected`,
      description: `Detected ${eventCount} ${pattern.name.toLowerCase()} events from IP ${event.ipAddress} in the last ${pattern.windowMinutes} minutes.`,
      indicators: pattern.indicators,
      affectedUsers: event.userId ? [event.userId] : [],
      ipAddresses: [event.ipAddress],
      timestamp: new Date(),
      resolved: false,
      actionsTaken: [],
    }

    try {
      // Store alert in database
      await prisma.securityAlert.create({
        data: {
          alertId: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          indicators: JSON.stringify(alert.indicators),
          affectedUsers: JSON.stringify(alert.affectedUsers),
          ipAddresses: JSON.stringify(alert.ipAddresses),
          timestamp: alert.timestamp,
          resolved: alert.resolved,
          actionsTaken: JSON.stringify(alert.actionsTaken),
        },
      })

      // Take automated actions based on severity
      await this.takeAutomatedActions(alert, event)

      // Send notifications
      await this.sendAlertNotifications(alert)
    } catch (error) {
      console.error('Failed to create security alert:', error)
    }
  }

  /**
   * Take automated security actions
   */
  private async takeAutomatedActions(
    alert: SecurityAlert,
    event: SecurityEvent
  ): Promise<void> {
    const actions: string[] = []

    switch (alert.severity) {
      case 'critical':
        // Block IP immediately
        await this.blockIP(event.ipAddress, 'Automated block due to critical threat')
        actions.push('IP blocked')

        // Disable user session if applicable
        if (event.userId) {
          await this.invalidateUserSessions(event.userId)
          actions.push('User sessions invalidated')
        }
        break

      case 'high':
        // Temporary IP block
        await this.temporaryBlockIP(event.ipAddress, 60) // 1 hour
        actions.push('IP temporarily blocked for 1 hour')

        // Require 2FA for affected users
        if (event.userId) {
          await this.flagFor2FARequirement(event.userId)
          actions.push('2FA requirement flagged')
        }
        break

      case 'medium':
        // Increase rate limiting
        await this.enhanceRateLimiting(event.ipAddress, 2) // 2x more restrictive
        actions.push('Enhanced rate limiting applied')
        break

      case 'low':
        // Just log and monitor
        actions.push('Event logged for monitoring')
        break
    }

    // Update alert with actions taken
    if (actions.length > 0) {
      await prisma.securityAlert.update({
        where: { alertId: alert.id },
        data: { actionsTaken: JSON.stringify(actions) },
      })
    }
  }

  /**
   * Send alert notifications
   */
  private async sendAlertNotifications(alert: SecurityAlert): Promise<void> {
    // In production, integrate with notification services
    console.error('SECURITY ALERT:', {
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      timestamp: alert.timestamp,
    })

    // TODO: Integrate with:
    // - Email notifications
    // - Slack webhooks
    // - PagerDuty
    // - SMS alerts for critical threats
  }

  /**
   * Automated response actions
   */
  private async blockIP(ipAddress: string, reason: string): Promise<void> {
    await prisma.blockedIP.create({
      data: {
        ipAddress,
        reason,
        blockedAt: new Date(),
        permanent: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    })
  }

  private async temporaryBlockIP(ipAddress: string, minutes: number): Promise<void> {
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000)
    await prisma.blockedIP.create({
      data: {
        ipAddress,
        reason: 'Temporary block due to suspicious activity',
        blockedAt: new Date(),
        permanent: false,
        expiresAt,
      },
    })
  }

  private async invalidateUserSessions(userId: string): Promise<void> {
    // In a JWT-based system, you might maintain a blacklist
    await prisma.userSession.updateMany({
      where: { userId },
      data: { invalidated: true },
    })
  }

  private async flagFor2FARequirement(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { requires2FA: true },
    })
  }

  private async enhanceRateLimiting(ipAddress: string, multiplier: number): Promise<void> {
    // This would integrate with your rate limiting system
    console.log(`Enhanced rate limiting for ${ipAddress} by ${multiplier}x`)
  }
}

/**
 * Anomaly detection for user behavior
 */
export class AnomalyDetector {
  /**
   * Detect unusual access patterns
   */
  async detectAccessAnomalies(userId: string): Promise<string[]> {
    const anomalies: string[] = []
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Get recent activity
    const recentEvents = await prisma.securityEvent.findMany({
      where: {
        userId,
        timestamp: { gte: dayAgo },
      },
      orderBy: { timestamp: 'desc' },
    })

    // Detect unusual IP addresses
    const ipAddresses = recentEvents.map(e => e.ipAddress)
    const uniqueIPs = [...new Set(ipAddresses)]

    if (uniqueIPs.length > 3) {
      anomalies.push(`Multiple IP addresses used: ${uniqueIPs.length}`)
    }

    // Detect unusual timing patterns
    const hours = recentEvents.map(e => e.timestamp.getHours())
    const unusualHours = hours.filter(h => h < 6 || h > 22)

    if (unusualHours.length > 3) {
      anomalies.push('Unusual access times detected')
    }

    // Detect rapid location changes (if geolocation data available)
    // This would require IP geolocation service integration

    return anomalies
  }

  /**
   * Detect privilege escalation attempts
   */
  async detectPrivilegeEscalation(
    userId: string,
    attemptedAction: string
  ): Promise<boolean> {
    // Check if user is attempting to access resources above their permission level
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    })

    if (!user) return true // Suspicious if user doesn't exist

    const userRoles = user.userRoles.map(ur => ur.role.slug)

    // Define high-privilege actions
    const highPrivilegeActions = [
      'admin.users.delete',
      'admin.system.config',
      'admin.super.access',
    ]

    const isSuperAdmin = userRoles.includes('super-admin')
    const isAttemptingHighPrivilege = highPrivilegeActions.includes(attemptedAction)

    return isAttemptingHighPrivilege && !isSuperAdmin
  }
}

/**
 * Request analysis for threats
 */
export function analyzeRequest(request: NextRequest): {
  threatScore: number
  indicators: string[]
} {
  const indicators: string[] = []
  let threatScore = 0

  const userAgent = request.headers.get('user-agent') || ''
  const url = request.url
  const method = request.method

  // Check for suspicious user agents
  const suspiciousAgents = [
    /sqlmap/i,
    /nikto/i,
    /nessus/i,
    /burp/i,
    /dirb/i,
    /gobuster/i,
    /wget/i,
    /curl/i,
  ]

  for (const pattern of suspiciousAgents) {
    if (pattern.test(userAgent)) {
      indicators.push(`Suspicious user agent: ${userAgent}`)
      threatScore += 0.3
    }
  }

  // Check for suspicious URL patterns
  const suspiciousPatterns = [
    /\.\./,
    /<script/i,
    /union.*select/i,
    /drop.*table/i,
    /exec\s*\(/i,
    /eval\s*\(/i,
    /javascript:/i,
    /vbscript:/i,
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url)) {
      indicators.push(`Suspicious URL pattern detected`)
      threatScore += 0.4
    }
  }

  // Check for unusual request methods
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method)) {
    indicators.push(`Unusual HTTP method: ${method}`)
    threatScore += 0.2
  }

  // Check for missing standard headers
  if (!request.headers.get('accept')) {
    indicators.push('Missing Accept header')
    threatScore += 0.1
  }

  return { threatScore, indicators }
}

/**
 * Global security monitor instance
 */
export const securityMonitor = new SecurityMonitor()
export const anomalyDetector = new AnomalyDetector()

/**
 * Helper function to record security events from anywhere in the app
 */
export async function logSecurityEvent(
  type: SecurityEventType,
  severity: 'low' | 'medium' | 'high' | 'critical',
  request: NextRequest,
  details: any = {},
  userId?: string,
  organizationId?: string
): Promise<void> {
  await securityMonitor.recordEvent({
    type,
    severity,
    userId,
    organizationId,
    ipAddress: request.headers.get('x-forwarded-for') || request.ip || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    endpoint: request.nextUrl.pathname,
    details,
  })
}