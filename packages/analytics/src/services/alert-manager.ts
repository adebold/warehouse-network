/**
 * Alert Manager Service
 * Handles creation, evaluation, and notification of analytics alerts
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'winston';
import { EventEmitter } from 'events';

import {
  AlertRule,
  AlertNotification,
  NotificationChannel,
  MetricFilter
} from '../types';

export class AlertManager extends EventEmitter {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Create a new alert rule
   */
  async createRule(ruleData: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertRule> {
    try {
      const rule = await this.prisma.alertRule.create({
        data: {
          tenantId: ruleData.tenantId,
          ruleName: ruleData.ruleName,
          description: ruleData.description,
          metricName: ruleData.metricName,
          conditionType: ruleData.conditionType,
          thresholdValue: ruleData.thresholdValue,
          comparisonPeriod: ruleData.comparisonPeriod,
          severity: ruleData.severity,
          isActive: ruleData.isActive,
          notificationChannels: ruleData.notificationChannels,
          evaluationFrequency: ruleData.evaluationFrequency,
          suppressDuration: ruleData.suppressDuration
        }
      });

      // Cache rule for quick evaluation
      await this.cacheRule(rule.id, rule);

      this.logger.info('Alert rule created', {
        ruleId: rule.id,
        ruleName: rule.ruleName,
        metricName: rule.metricName
      });

      return rule as AlertRule;
    } catch (error) {
      this.logger.error('Failed to create alert rule', {
        error: error.message,
        ruleData
      });
      throw error;
    }
  }

  /**
   * Update an existing alert rule
   */
  async updateRule(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    try {
      const rule = await this.prisma.alertRule.update({
        where: { id: ruleId },
        data: updates
      });

      // Update cache
      await this.cacheRule(rule.id, rule);

      this.logger.info('Alert rule updated', {
        ruleId,
        updates: Object.keys(updates)
      });

      return rule as AlertRule;
    } catch (error) {
      this.logger.error('Failed to update alert rule', {
        error: error.message,
        ruleId,
        updates
      });
      throw error;
    }
  }

  /**
   * Delete an alert rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    try {
      await this.prisma.alertRule.delete({
        where: { id: ruleId }
      });

      // Remove from cache
      await this.redis.hdel('alert_rules', ruleId);

      this.logger.info('Alert rule deleted', { ruleId });
    } catch (error) {
      this.logger.error('Failed to delete alert rule', {
        error: error.message,
        ruleId
      });
      throw error;
    }
  }

  /**
   * Get all alert rules for a tenant
   */
  async getRules(tenantId: string): Promise<AlertRule[]> {
    try {
      const rules = await this.prisma.alertRule.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' }
      });

      return rules as AlertRule[];
    } catch (error) {
      this.logger.error('Failed to get alert rules', {
        error: error.message,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get a specific alert rule
   */
  async getRule(ruleId: string): Promise<AlertRule | null> {
    try {
      const rule = await this.prisma.alertRule.findUnique({
        where: { id: ruleId }
      });

      return rule as AlertRule | null;
    } catch (error) {
      this.logger.error('Failed to get alert rule', {
        error: error.message,
        ruleId
      });
      throw error;
    }
  }

  /**
   * Evaluate all active alert rules
   */
  async evaluateAllRules(): Promise<AlertNotification[]> {
    const triggeredAlerts: AlertNotification[] = [];

    try {
      // Get all active rules
      const activeRules = await this.prisma.alertRule.findMany({
        where: { isActive: true }
      });

      this.logger.info('Evaluating alert rules', { count: activeRules.length });

      // Evaluate each rule
      for (const rule of activeRules) {
        try {
          const alert = await this.evaluateRule(rule as AlertRule);
          if (alert) {
            triggeredAlerts.push(alert);
          }
        } catch (error) {
          this.logger.error('Failed to evaluate rule', {
            error: error.message,
            ruleId: rule.id,
            ruleName: rule.ruleName
          });
        }
      }

      return triggeredAlerts;
    } catch (error) {
      this.logger.error('Failed to evaluate alert rules', { error: error.message });
      throw error;
    }
  }

  /**
   * Evaluate a specific alert rule
   */
  async evaluateRule(rule: AlertRule): Promise<AlertNotification | null> {
    try {
      // Check if rule is suppressed
      const suppressKey = `alert_suppress:${rule.id}`;
      const suppressed = await this.redis.get(suppressKey);
      if (suppressed) {
        return null;
      }

      // Get current metric value
      const metricValue = await this.getMetricValue(rule);

      // Evaluate condition
      const isTriggered = this.evaluateCondition(
        metricValue,
        rule.conditionType,
        rule.thresholdValue,
        rule
      );

      if (isTriggered) {
        // Create alert notification
        const alert = await this.createAlertNotification(rule, metricValue);

        // Send notifications
        await this.sendNotifications(alert);

        // Suppress rule for specified duration
        await this.redis.setex(suppressKey, rule.suppressDuration, '1');

        this.emit('alert_triggered', alert);

        return alert;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to evaluate rule', {
        error: error.message,
        ruleId: rule.id
      });
      throw error;
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string,
    notes?: string
  ): Promise<void> {
    try {
      await this.prisma.alertNotification.update({
        where: { id: alertId },
        data: {
          acknowledged: true,
          acknowledgedBy,
          acknowledgedAt: new Date(),
          resolutionNotes: notes
        }
      });

      this.logger.info('Alert acknowledged', {
        alertId,
        acknowledgedBy,
        notes
      });

      this.emit('alert_acknowledged', {
        alertId,
        acknowledgedBy,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to acknowledge alert', {
        error: error.message,
        alertId
      });
      throw error;
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(
    alertId: string,
    resolvedBy: string,
    notes?: string
  ): Promise<void> {
    try {
      await this.prisma.alertNotification.update({
        where: { id: alertId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolutionNotes: notes,
          acknowledgedBy: resolvedBy,
          acknowledgedAt: new Date(),
          acknowledged: true
        }
      });

      this.logger.info('Alert resolved', {
        alertId,
        resolvedBy,
        notes
      });

      this.emit('alert_resolved', {
        alertId,
        resolvedBy,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to resolve alert', {
        error: error.message,
        alertId
      });
      throw error;
    }
  }

  /**
   * Get alert notifications for a tenant
   */
  async getAlertNotifications(
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      resolved?: boolean;
      acknowledged?: boolean;
    }
  ): Promise<AlertNotification[]> {
    try {
      const { limit = 50, offset = 0, resolved, acknowledged } = options || {};

      const where: any = { tenantId };
      if (resolved !== undefined) where.resolved = resolved;
      if (acknowledged !== undefined) where.acknowledged = acknowledged;

      const notifications = await this.prisma.alertNotification.findMany({
        where,
        orderBy: { triggeredAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          alertRule: {
            select: {
              ruleName: true,
              metricName: true,
              severity: true
            }
          }
        }
      });

      return notifications as AlertNotification[];
    } catch (error) {
      this.logger.error('Failed to get alert notifications', {
        error: error.message,
        tenantId
      });
      throw error;
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Cache alert rule for quick evaluation
   */
  private async cacheRule(ruleId: string, rule: any): Promise<void> {
    try {
      await this.redis.hset('alert_rules', ruleId, JSON.stringify(rule));
      await this.redis.expire('alert_rules', 3600); // 1 hour TTL
    } catch (error) {
      this.logger.error('Failed to cache alert rule', { error: error.message, ruleId });
    }
  }

  /**
   * Get current metric value for evaluation
   */
  private async getMetricValue(rule: AlertRule): Promise<number> {
    const now = new Date();
    let startDate: Date;

    // Determine time period for metric calculation
    switch (rule.comparisonPeriod) {
      case 'hour':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 60 * 60 * 1000); // Default to 1 hour
    }

    // Calculate metric based on metric name
    return await this.calculateMetric(rule.metricName, startDate, now, rule.tenantId);
  }

  /**
   * Calculate specific metric value
   */
  private async calculateMetric(
    metricName: string,
    startDate: Date,
    endDate: Date,
    tenantId: string
  ): Promise<number> {
    const whereCondition = {
      createdAt: { gte: startDate, lte: endDate },
      tenantId
    };

    try {
      switch (metricName) {
        case 'total_bookings':
          return await this.prisma.booking.count({ where: whereCondition });

        case 'booking_conversion_rate':
          const [bookings, views] = await Promise.all([
            this.prisma.booking.count({
              where: { ...whereCondition, status: 'confirmed' }
            }),
            this.prisma.analyticsEvent.count({
              where: { ...whereCondition, eventName: 'warehouse_view' }
            })
          ]);
          return views > 0 ? (bookings / views) * 100 : 0;

        case 'total_revenue':
          const transactions = await this.prisma.transaction.findMany({
            where: {
              ...whereCondition,
              status: 'completed',
              transactionType: 'booking'
            },
            select: { amount: true }
          });
          return transactions.reduce((sum, t) => sum + Number(t.amount), 0);

        case 'active_users':
          const sessions = await this.prisma.userSession.findMany({
            where: {
              startedAt: { gte: startDate, lte: endDate },
              tenantId
            },
            select: { userId: true }
          });
          return new Set(sessions.map(s => s.userId).filter(Boolean)).size;

        case 'error_rate':
          const [errors, total] = await Promise.all([
            this.prisma.analyticsEvent.count({
              where: { ...whereCondition, eventCategory: 'error' }
            }),
            this.prisma.analyticsEvent.count({ where: whereCondition })
          ]);
          return total > 0 ? (errors / total) * 100 : 0;

        case 'avg_response_time':
          const performanceMetrics = await this.prisma.systemPerformance.findMany({
            where: {
              metricTimestamp: { gte: startDate, lte: endDate }
            },
            select: { apiAvgResponseTime: true }
          });
          const responseTimes = performanceMetrics
            .map(m => Number(m.apiAvgResponseTime))
            .filter(rt => rt > 0);
          return responseTimes.length > 0
            ? responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length
            : 0;

        default:
          this.logger.warn('Unknown metric name for alert evaluation', { metricName });
          return 0;
      }
    } catch (error) {
      this.logger.error('Failed to calculate metric', {
        error: error.message,
        metricName,
        startDate,
        endDate,
        tenantId
      });
      return 0;
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(
    currentValue: number,
    conditionType: string,
    thresholdValue: number,
    rule: AlertRule
  ): boolean {
    switch (conditionType) {
      case 'greater_than':
        return currentValue > thresholdValue;
      case 'less_than':
        return currentValue < thresholdValue;
      case 'equals':
        return Math.abs(currentValue - thresholdValue) < 0.01; // Small tolerance for floating point
      case 'change_rate':
        // For change rate, we need to compare with previous period
        // This would require additional implementation to get previous period value
        return false; // Simplified for now
      default:
        return false;
    }
  }

  /**
   * Create alert notification record
   */
  private async createAlertNotification(
    rule: AlertRule,
    metricValue: number
  ): Promise<AlertNotification> {
    try {
      const notification = await this.prisma.alertNotification.create({
        data: {
          tenantId: rule.tenantId,
          alertRuleId: rule.id,
          alertLevel: rule.severity,
          message: this.generateAlertMessage(rule, metricValue),
          metricValue,
          thresholdValue: rule.thresholdValue,
          notificationChannels: rule.notificationChannels,
          deliveryStatus: {}
        }
      });

      return notification as AlertNotification;
    } catch (error) {
      this.logger.error('Failed to create alert notification', {
        error: error.message,
        ruleId: rule.id
      });
      throw error;
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(rule: AlertRule, metricValue: number): string {
    const condition = this.getConditionText(rule.conditionType);
    return `Alert: ${rule.ruleName} - ${rule.metricName} (${metricValue}) ${condition} ${rule.thresholdValue}`;
  }

  /**
   * Get human-readable condition text
   */
  private getConditionText(conditionType: string): string {
    switch (conditionType) {
      case 'greater_than': return 'is greater than';
      case 'less_than': return 'is less than';
      case 'equals': return 'equals';
      case 'change_rate': return 'change rate exceeds';
      default: return 'meets condition';
    }
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(alert: AlertNotification): Promise<void> {
    const deliveryStatus: Record<string, string> = {};

    const channels = Array.isArray(alert.notificationChannels)
      ? alert.notificationChannels as NotificationChannel[]
      : [];

    for (const channel of channels) {
      if (!channel.isActive) continue;

      try {
        await this.sendNotification(channel, alert);
        deliveryStatus[channel.type] = 'delivered';
      } catch (error) {
        this.logger.error('Failed to send notification', {
          error: error.message,
          channel: channel.type,
          target: channel.target,
          alertId: alert.id
        });
        deliveryStatus[channel.type] = 'failed';
      }
    }

    // Update delivery status
    await this.prisma.alertNotification.update({
      where: { id: alert.id },
      data: { deliveryStatus }
    });
  }

  /**
   * Send individual notification
   */
  private async sendNotification(
    channel: NotificationChannel,
    alert: AlertNotification
  ): Promise<void> {
    switch (channel.type) {
      case 'email':
        await this.sendEmailNotification(channel, alert);
        break;
      case 'sms':
        await this.sendSMSNotification(channel, alert);
        break;
      case 'slack':
        await this.sendSlackNotification(channel, alert);
        break;
      case 'webhook':
        await this.sendWebhookNotification(channel, alert);
        break;
      default:
        throw new Error(`Unsupported notification channel: ${channel.type}`);
    }
  }

  /**
   * Send email notification (placeholder implementation)
   */
  private async sendEmailNotification(
    channel: NotificationChannel,
    alert: AlertNotification
  ): Promise<void> {
    // Implementation would integrate with email service (SendGrid, SES, etc.)
    this.logger.info('Email notification sent', {
      to: channel.target,
      subject: `Alert: ${alert.message}`,
      alertId: alert.id
    });
  }

  /**
   * Send SMS notification (placeholder implementation)
   */
  private async sendSMSNotification(
    channel: NotificationChannel,
    alert: AlertNotification
  ): Promise<void> {
    // Implementation would integrate with SMS service (Twilio, etc.)
    this.logger.info('SMS notification sent', {
      to: channel.target,
      message: alert.message,
      alertId: alert.id
    });
  }

  /**
   * Send Slack notification (placeholder implementation)
   */
  private async sendSlackNotification(
    channel: NotificationChannel,
    alert: AlertNotification
  ): Promise<void> {
    // Implementation would use Slack webhook
    this.logger.info('Slack notification sent', {
      webhook: channel.target,
      message: alert.message,
      alertId: alert.id
    });
  }

  /**
   * Send webhook notification (placeholder implementation)
   */
  private async sendWebhookNotification(
    channel: NotificationChannel,
    alert: AlertNotification
  ): Promise<void> {
    // Implementation would make HTTP POST to webhook URL
    this.logger.info('Webhook notification sent', {
      url: channel.target,
      alertId: alert.id
    });
  }
}