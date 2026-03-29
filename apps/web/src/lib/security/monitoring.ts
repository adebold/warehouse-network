/**
 * Security Monitoring and Alerting System
 * Comprehensive security event tracking, anomaly detection, and alerting
 */

import { prisma } from '@/lib/prisma';
import { SecurityConfig } from './config';
import { rateLimiter } from './rate-limiter';

export interface SecurityEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  details?: Record<string, any>;
  timestamp?: Date;
}

export interface SecurityAlert {
  id: string;
  type: string;
  severity: 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  eventCount: number;
  firstSeen: Date;
  lastSeen: Date;
  status: 'open' | 'acknowledged' | 'resolved';
  assignedTo?: string;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsBySeverity: Record<string, number>;
  eventsByType: Record<string, number>;
  topSourceIPs: Array<{ ip: string; count: number }>;
  topUserAgents: Array<{ userAgent: string; count: number }>;
  authenticationsToday: number;
  failedLoginsToday: number;
  blockedRequests: number;
  suspiciousActivities: number;
}

export class SecurityMonitor {
  private alertWebhookUrl?: string;

  constructor() {
    this.alertWebhookUrl = SecurityConfig.monitoring.alertWebhookUrl;
  }

  /**
   * Log a security event
   */
  async logEvent(event: SecurityEvent): Promise<void> {
    try {
      // Store in audit log
      await prisma.auditLog.create({
        data: {
          userId: event.userId || null,
          organizationId: event.organizationId || null,
          action: `security.${event.type}`,
          resource: event.resource || 'system',
          details: {
            severity: event.severity,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            ...event.details,
          },
          status: 'failure',
          createdAt: event.timestamp || new Date(),
        },
      });

      // Check if this should trigger an alert
      await this.checkForAlert(event);

      // Update real-time metrics
      await this.updateMetrics(event);

      // Special handling for critical events
      if (event.severity === 'critical') {
        await this.handleCriticalEvent(event);
      }
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Check if event should trigger an alert
   */
  private async checkForAlert(event: SecurityEvent): Promise<void> {
    const alertRules = [
      // Multiple failed logins from same IP
      {
        type: 'multiple_failed_logins',
        condition: async () => {
          if (event.type !== 'login_failed' || !event.ipAddress) return false;

          const recentFailures = await prisma.auditLog.count({
            where: {
              action: 'security.login_failed',
              details: {
                path: ['ipAddress'],
                equals: event.ipAddress,
              },
              createdAt: {
                gte: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
              },
            },
          });

          return recentFailures >= 10;
        },
        severity: 'high' as const,
        title: 'Multiple Failed Login Attempts',
        description: `${event.ipAddress} has made multiple failed login attempts`,
      },

      // SQL injection attempts
      {
        type: 'sql_injection_attempts',
        condition: async () => event.type === 'sql_injection_attempt',
        severity: 'critical' as const,
        title: 'SQL Injection Attempt Detected',
        description: `SQL injection attempt from ${event.ipAddress}`,
      },

      // XSS attempts
      {
        type: 'xss_attempts',
        condition: async () => event.type === 'xss_attempt',
        severity: 'high' as const,
        title: 'Cross-Site Scripting Attempt',
        description: `XSS attempt detected from ${event.ipAddress}`,
      },

      // Unusual access patterns
      {
        type: 'unusual_access_pattern',
        condition: async () => {
          if (!event.userId) return false;

          const recentAccess = await prisma.auditLog.count({
            where: {
              userId: event.userId,
              action: {
                startsWith: 'auth.',
              },
              createdAt: {
                gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
              },
            },
          });

          return recentAccess > 50; // More than 50 auth events in an hour
        },
        severity: 'medium' as const,
        title: 'Unusual User Access Pattern',
        description: `User ${event.userId} showing unusual access patterns`,
      },

      // Admin access outside business hours
      {
        type: 'admin_access_outside_hours',
        condition: async () => {
          if (event.type !== 'super_admin_login') return false;

          const hour = new Date().getHours();
          return hour < 6 || hour > 22; // Outside 6 AM - 10 PM
        },
        severity: 'medium' as const,
        title: 'Admin Access Outside Business Hours',
        description: `Super admin login detected outside business hours`,
      },

      // Rate limiting triggered frequently
      {
        type: 'frequent_rate_limiting',
        condition: async () => {
          if (event.type !== 'rate_limit_exceeded' || !event.ipAddress) return false;

          const recentRateLimits = await prisma.auditLog.count({
            where: {
              action: 'security.rate_limit_exceeded',
              details: {
                path: ['ipAddress'],
                equals: event.ipAddress,
              },
              createdAt: {
                gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
              },
            },
          });

          return recentRateLimits >= 20;
        },
        severity: 'medium' as const,
        title: 'Frequent Rate Limiting',
        description: `IP ${event.ipAddress} frequently hitting rate limits`,
      },
    ];

    for (const rule of alertRules) {
      if (await rule.condition()) {
        await this.createAlert({
          type: rule.type,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          event,
        });
      }
    }
  }

  /**
   * Create a security alert
   */
  private async createAlert(params: {
    type: string;
    severity: 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    event: SecurityEvent;
  }): Promise<void> {
    try {
      // Check if similar alert already exists
      const existingAlert = await prisma.securityAlert.findFirst({
        where: {
          type: params.type,
          status: {
            in: ['open', 'acknowledged'],
          },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      if (existingAlert) {
        // Update existing alert
        await prisma.securityAlert.update({
          where: { id: existingAlert.id },
          data: {
            eventCount: { increment: 1 },
            lastSeen: new Date(),
            details: {
              ...existingAlert.details,
              lastEvent: params.event,
            },
          },
        });
      } else {
        // Create new alert
        const alert = await prisma.securityAlert.create({
          data: {
            type: params.type,
            severity: params.severity,
            title: params.title,
            description: params.description,
            eventCount: 1,
            firstSeen: new Date(),
            lastSeen: new Date(),
            status: 'open',
            details: {
              triggerEvent: params.event,
            },
          },
        });

        // Send webhook notification
        await this.sendAlertWebhook(alert);

        // Log alert creation
        console.warn(`Security Alert Created: ${params.title}`, {
          type: params.type,
          severity: params.severity,
          event: params.event,
        });
      }
    } catch (error) {
      console.error('Failed to create security alert:', error);
    }
  }

  /**
   * Handle critical security events
   */
  private async handleCriticalEvent(event: SecurityEvent): Promise<void> {
    try {
      // Auto-block IP for certain critical events
      const autoBlockEvents = ['sql_injection_attempt', 'multiple_injection_attempts'];

      if (autoBlockEvents.includes(event.type) && event.ipAddress) {
        await rateLimiter.flagSuspiciousActivity(
          event.ipAddress,
          'auto_block',
          { reason: event.type, severity: 'critical' }
        );

        console.error(`CRITICAL: Auto-blocked IP ${event.ipAddress} for ${event.type}`);
      }

      // Send immediate notification
      await this.sendCriticalNotification(event);

    } catch (error) {
      console.error('Failed to handle critical event:', error);
    }
  }

  /**
   * Send webhook alert notification
   */
  private async sendAlertWebhook(alert: any): Promise<void> {
    if (!this.alertWebhookUrl) return;

    try {
      const payload = {
        type: 'security_alert',
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          createdAt: alert.createdAt,
        },
        environment: process.env.NODE_ENV,
        application: 'warehouse-network',
      };

      await fetch(this.alertWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to send alert webhook:', error);
    }
  }

  /**
   * Send critical event notification
   */
  private async sendCriticalNotification(event: SecurityEvent): Promise<void> {
    console.error('🚨 CRITICAL SECURITY EVENT 🚨', {
      type: event.type,
      severity: event.severity,
      ipAddress: event.ipAddress,
      userId: event.userId,
      resource: event.resource,
      details: event.details,
      timestamp: event.timestamp || new Date(),
    });

    // Could integrate with PagerDuty, Slack, SMS, etc.
    if (this.alertWebhookUrl) {
      try {
        await fetch(this.alertWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'critical_security_event',
            event,
            environment: process.env.NODE_ENV,
            application: 'warehouse-network',
          }),
        });
      } catch (error) {
        console.error('Failed to send critical notification:', error);
      }
    }
  }

  /**
   * Update security metrics
   */
  private async updateMetrics(event: SecurityEvent): Promise<void> {
    // This would typically use Redis or a time-series database
    // For now, we'll use the database with date-based keys

    try {
      const today = new Date().toISOString().split('T')[0];
      const metricKey = `security_metrics:${today}`;

      // For simplicity, we'll store daily metrics in a JSON field
      const existingMetrics = await prisma.systemMetric.findUnique({
        where: { key: metricKey },
      });

      const metrics = existingMetrics?.value as any || {
        totalEvents: 0,
        eventsBySeverity: {},
        eventsByType: {},
        topSourceIPs: {},
        topUserAgents: {},
      };

      metrics.totalEvents++;
      metrics.eventsBySeverity[event.severity] = (metrics.eventsBySeverity[event.severity] || 0) + 1;
      metrics.eventsByType[event.type] = (metrics.eventsByType[event.type] || 0) + 1;

      if (event.ipAddress) {
        metrics.topSourceIPs[event.ipAddress] = (metrics.topSourceIPs[event.ipAddress] || 0) + 1;
      }

      if (event.userAgent) {
        metrics.topUserAgents[event.userAgent] = (metrics.topUserAgents[event.userAgent] || 0) + 1;
      }

      await prisma.systemMetric.upsert({
        where: { key: metricKey },
        update: { value: metrics },
        create: {
          key: metricKey,
          value: metrics,
          category: 'security',
        },
      });
    } catch (error) {
      console.error('Failed to update metrics:', error);
    }
  }

  /**
   * Get security metrics for dashboard
   */
  async getSecurityMetrics(days: number = 7): Promise<SecurityMetrics> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get event counts from audit log
      const events = await prisma.auditLog.findMany({
        where: {
          action: {
            startsWith: 'security.',
          },
          createdAt: {
            gte: startDate,
          },
        },
        select: {
          action: true,
          details: true,
          createdAt: true,
        },
      });

      const metrics: SecurityMetrics = {
        totalEvents: events.length,
        eventsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
        eventsByType: {},
        topSourceIPs: [],
        topUserAgents: [],
        authenticationsToday: 0,
        failedLoginsToday: 0,
        blockedRequests: 0,
        suspiciousActivities: 0,
      };

      const ipCounts: Record<string, number> = {};
      const userAgentCounts: Record<string, number> = {};

      for (const event of events) {
        const details = event.details as any;
        const severity = details?.severity || 'medium';
        const type = event.action.replace('security.', '');

        metrics.eventsBySeverity[severity as keyof typeof metrics.eventsBySeverity]++;
        metrics.eventsByType[type] = (metrics.eventsByType[type] || 0) + 1;

        if (details?.ipAddress) {
          ipCounts[details.ipAddress] = (ipCounts[details.ipAddress] || 0) + 1;
        }

        if (details?.userAgent) {
          userAgentCounts[details.userAgent] = (userAgentCounts[details.userAgent] || 0) + 1;
        }

        // Count specific metrics
        if (type.includes('login')) {
          if (type.includes('failed')) {
            metrics.failedLoginsToday++;
          } else {
            metrics.authenticationsToday++;
          }
        }

        if (type.includes('rate_limit') || type.includes('blocked')) {
          metrics.blockedRequests++;
        }

        if (['suspicious', 'injection', 'xss'].some(keyword => type.includes(keyword))) {
          metrics.suspiciousActivities++;
        }
      }

      // Sort and get top IPs and user agents
      metrics.topSourceIPs = Object.entries(ipCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }));

      metrics.topUserAgents = Object.entries(userAgentCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userAgent, count]) => ({ userAgent, count }));

      return metrics;
    } catch (error) {
      console.error('Failed to get security metrics:', error);
      throw new Error('Failed to retrieve security metrics');
    }
  }

  /**
   * Get active security alerts
   */
  async getActiveAlerts(): Promise<SecurityAlert[]> {
    try {
      const alerts = await prisma.securityAlert.findMany({
        where: {
          status: {
            in: ['open', 'acknowledged'],
          },
        },
        orderBy: [
          { severity: 'desc' },
          { lastSeen: 'desc' },
        ],
      });

      return alerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity as 'medium' | 'high' | 'critical',
        title: alert.title,
        description: alert.description,
        eventCount: alert.eventCount,
        firstSeen: alert.firstSeen,
        lastSeen: alert.lastSeen,
        status: alert.status as 'open' | 'acknowledged' | 'resolved',
        assignedTo: alert.assignedTo || undefined,
      }));
    } catch (error) {
      console.error('Failed to get active alerts:', error);
      throw new Error('Failed to retrieve active alerts');
    }
  }

  /**
   * Acknowledge a security alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    try {
      await prisma.securityAlert.update({
        where: { id: alertId },
        data: {
          status: 'acknowledged',
          assignedTo: userId,
        },
      });

      await this.logEvent({
        type: 'alert_acknowledged',
        severity: 'low',
        userId,
        details: { alertId },
      });
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
      throw new Error('Failed to acknowledge alert');
    }
  }

  /**
   * Resolve a security alert
   */
  async resolveAlert(alertId: string, userId: string, resolution?: string): Promise<void> {
    try {
      await prisma.securityAlert.update({
        where: { id: alertId },
        data: {
          status: 'resolved',
          assignedTo: userId,
          details: {
            resolution,
            resolvedAt: new Date(),
            resolvedBy: userId,
          },
        },
      });

      await this.logEvent({
        type: 'alert_resolved',
        severity: 'low',
        userId,
        details: { alertId, resolution },
      });
    } catch (error) {
      console.error('Failed to resolve alert:', error);
      throw new Error('Failed to resolve alert');
    }
  }
}

// Create singleton instance
export const securityMonitor = new SecurityMonitor();

/**
 * Helper function to log security events
 */
export async function logSecurityEvent(
  type: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Partial<SecurityEvent>
): Promise<void> {
  await securityMonitor.logEvent({
    type,
    severity,
    timestamp: new Date(),
    ...details,
  });
}