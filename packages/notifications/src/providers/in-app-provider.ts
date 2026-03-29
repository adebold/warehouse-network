/**
 * In-App Notification Provider - Handles in-app notifications with real-time updates
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { Logger } from 'winston';
import {
  NotificationProvider,
  NotificationRequest,
  NotificationRecipient,
  NotificationResult,
  NotificationChannel,
  NotificationStatus,
  InAppNotification,
  NotificationCategory,
  NotificationPriority
} from '../types/notification.types';
import { createLogger } from '../utils/logger';

export interface InAppProviderConfig {
  redis: Redis;
  maxNotificationsPerUser: number;
  retentionDays: number;
  enableRealTimeUpdates: boolean;
}

export class InAppProvider extends EventEmitter implements NotificationProvider {
  readonly id = 'in_app';
  readonly name = 'In-App Notification Provider';
  readonly channels = [NotificationChannel.IN_APP];

  private logger: Logger;

  constructor(private config: InAppProviderConfig) {
    super();
    this.logger = createLogger('InAppProvider');
  }

  /**
   * Send in-app notification
   */
  async send(request: NotificationRequest, recipient: NotificationRecipient): Promise<NotificationResult> {
    const startTime = Date.now();
    const notificationId = `${request.id}_${recipient.id}_in_app`;

    try {
      if (!recipient.userId) {
        throw new Error('Recipient user ID is required for in-app notifications');
      }

      this.logger.info(`Creating in-app notification: ${notificationId} for user ${recipient.userId}`);

      // Create in-app notification
      const inAppNotification = this.createInAppNotification(request, recipient, notificationId);

      // Store notification
      await this.storeNotification(inAppNotification);

      // Update user notification counter
      await this.updateUnreadCount(recipient.userId, 1);

      // Emit real-time event if enabled
      if (this.config.enableRealTimeUpdates) {
        this.emitRealTimeNotification(inAppNotification);
      }

      const notificationResult: NotificationResult = {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.DELIVERED,
        providerId: this.id,
        providerResponse: {
          stored: true,
          userId: recipient.userId,
          notificationId: inAppNotification.id
        },
        sentAt: new Date(),
        deliveredAt: new Date(),
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.logger.info(
        `In-app notification created successfully: ${notificationId} (${Date.now() - startTime}ms)`
      );

      return notificationResult;
    } catch (error) {
      this.logger.error(`Failed to send in-app notification ${notificationId}:`, error);

      return {
        id: notificationId,
        requestId: request.id!,
        recipientId: recipient.id,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.FAILED,
        providerId: this.id,
        error: {
          code: error.code || 'IN_APP_SEND_FAILED',
          message: error.message,
          details: error
        },
        attemptCount: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  }

  /**
   * Get notification status (in-app notifications are immediately delivered)
   */
  async getStatus(messageId: string): Promise<NotificationStatus> {
    try {
      const notification = await this.getNotification(messageId);
      return notification ? NotificationStatus.DELIVERED : NotificationStatus.FAILED;
    } catch (error) {
      this.logger.error('Failed to get in-app notification status:', error);
      return NotificationStatus.FAILED;
    }
  }

  /**
   * Validate provider configuration
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Test Redis connection
      await this.config.redis.ping();

      if (this.config.maxNotificationsPerUser <= 0) {
        this.logger.error('Invalid max notifications per user configuration');
        return false;
      }

      if (this.config.retentionDays <= 0) {
        this.logger.error('Invalid retention days configuration');
        return false;
      }

      this.logger.info('In-app notification provider configuration is valid');
      return true;
    } catch (error) {
      this.logger.error('In-app notification provider configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includeRead?: boolean;
      category?: NotificationCategory;
      priority?: NotificationPriority;
    } = {}
  ): Promise<{ notifications: InAppNotification[]; total: number; unreadCount: number }> {
    try {
      const {
        limit = 20,
        offset = 0,
        includeRead = true,
        category,
        priority
      } = options;

      // Get all notification IDs for user
      const notificationIds = await this.config.redis.zrevrange(
        `in_app:user:${userId}`,
        offset,
        offset + limit - 1
      );

      // Get notification details
      const pipeline = this.config.redis.pipeline();
      for (const notifId of notificationIds) {
        pipeline.hgetall(`in_app:notification:${notifId}`);
      }

      const results = await pipeline.exec();
      const notifications: InAppNotification[] = [];

      if (results) {
        for (const result of results) {
          if (result && result[1] && typeof result[1] === 'object') {
            const notifData = result[1] as Record<string, string>;
            const notification = this.deserializeNotification(notifData);

            // Apply filters
            if (!includeRead && notification.isRead) continue;
            if (category && notification.category !== category) continue;
            if (priority && notification.priority !== priority) continue;

            notifications.push(notification);
          }
        }
      }

      // Get total count and unread count
      const total = await this.config.redis.zcard(`in_app:user:${userId}`);
      const unreadCount = await this.getUnreadCount(userId);

      return { notifications, total, unreadCount };
    } catch (error) {
      this.logger.error(`Failed to get notifications for user ${userId}:`, error);
      return { notifications: [], total: 0, unreadCount: 0 };
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const notificationKey = `in_app:notification:${notificationId}`;
      const notification = await this.config.redis.hgetall(notificationKey);

      if (!notification.id || notification.userId !== userId) {
        return false;
      }

      if (notification.isRead === 'true') {
        return true; // Already read
      }

      // Update notification
      await this.config.redis.hmset(notificationKey, {
        isRead: 'true',
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update unread count
      await this.updateUnreadCount(userId, -1);

      // Emit real-time event
      if (this.config.enableRealTimeUpdates) {
        this.emit('notification:read', { notificationId, userId });
      }

      this.logger.debug(`Notification marked as read: ${notificationId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to mark notification as read: ${notificationId}`, error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const notificationIds = await this.config.redis.zrange(`in_app:user:${userId}`, 0, -1);
      let markedCount = 0;

      const pipeline = this.config.redis.pipeline();

      for (const notifId of notificationIds) {
        const notificationKey = `in_app:notification:${notifId}`;

        // Check if it's unread first
        const isRead = await this.config.redis.hget(notificationKey, 'isRead');
        if (isRead !== 'true') {
          pipeline.hmset(notificationKey, {
            isRead: 'true',
            readAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          markedCount++;
        }
      }

      await pipeline.exec();

      // Reset unread count
      await this.config.redis.set(`in_app:unread:${userId}`, '0');

      // Emit real-time event
      if (this.config.enableRealTimeUpdates) {
        this.emit('notifications:mark_all_read', { userId, count: markedCount });
      }

      this.logger.info(`Marked ${markedCount} notifications as read for user ${userId}`);
      return markedCount;
    } catch (error) {
      this.logger.error(`Failed to mark all notifications as read for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Archive notification
   */
  async archiveNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const notificationKey = `in_app:notification:${notificationId}`;
      const notification = await this.config.redis.hgetall(notificationKey);

      if (!notification.id || notification.userId !== userId) {
        return false;
      }

      // Update notification
      await this.config.redis.hmset(notificationKey, {
        isArchived: 'true',
        updatedAt: new Date().toISOString()
      });

      // Remove from user's active list and add to archived list
      await this.config.redis.zrem(`in_app:user:${userId}`, notificationId);
      await this.config.redis.zadd(
        `in_app:archived:${userId}`,
        Date.now(),
        notificationId
      );

      // Update unread count if notification was unread
      if (notification.isRead !== 'true') {
        await this.updateUnreadCount(userId, -1);
      }

      this.logger.debug(`Notification archived: ${notificationId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to archive notification: ${notificationId}`, error);
      return false;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const notificationKey = `in_app:notification:${notificationId}`;
      const notification = await this.config.redis.hgetall(notificationKey);

      if (!notification.id || notification.userId !== userId) {
        return false;
      }

      // Remove from Redis
      await this.config.redis.del(notificationKey);
      await this.config.redis.zrem(`in_app:user:${userId}`, notificationId);
      await this.config.redis.zrem(`in_app:archived:${userId}`, notificationId);

      // Update unread count if notification was unread
      if (notification.isRead !== 'true') {
        await this.updateUnreadCount(userId, -1);
      }

      this.logger.debug(`Notification deleted: ${notificationId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete notification: ${notificationId}`, error);
      return false;
    }
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const count = await this.config.redis.get(`in_app:unread:${userId}`);
      return parseInt(count || '0', 10);
    } catch (error) {
      this.logger.error(`Failed to get unread count for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Clean up old notifications
   */
  async cleanup(): Promise<void> {
    try {
      const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);

      // Get all user notification keys
      const userKeys = await this.config.redis.keys('in_app:user:*');

      for (const userKey of userKeys) {
        // Get old notifications
        const oldNotificationIds = await this.config.redis.zrangebyscore(
          userKey,
          '-inf',
          cutoffTime
        );

        if (oldNotificationIds.length > 0) {
          // Remove old notifications
          const pipeline = this.config.redis.pipeline();

          for (const notifId of oldNotificationIds) {
            pipeline.del(`in_app:notification:${notifId}`);
            pipeline.zrem(userKey, notifId);
          }

          await pipeline.exec();

          this.logger.info(`Cleaned up ${oldNotificationIds.length} old notifications from ${userKey}`);
        }
      }

      // Clean up archived notifications too
      const archivedKeys = await this.config.redis.keys('in_app:archived:*');

      for (const archivedKey of archivedKeys) {
        const oldArchivedIds = await this.config.redis.zrangebyscore(
          archivedKey,
          '-inf',
          cutoffTime
        );

        if (oldArchivedIds.length > 0) {
          const pipeline = this.config.redis.pipeline();

          for (const notifId of oldArchivedIds) {
            pipeline.del(`in_app:notification:${notifId}`);
            pipeline.zrem(archivedKey, notifId);
          }

          await pipeline.exec();
        }
      }

      this.logger.info('In-app notification cleanup completed');
    } catch (error) {
      this.logger.error('Failed to cleanup old notifications:', error);
    }
  }

  /**
   * Create in-app notification object
   */
  private createInAppNotification(
    request: NotificationRequest,
    recipient: NotificationRecipient,
    notificationId: string
  ): InAppNotification {
    return {
      id: notificationId,
      userId: recipient.userId!,
      organizationId: recipient.organizationId,
      title: request.subject || this.generateTitleFromContent(request.content),
      content: request.content,
      icon: this.getIconForCategory(request.category),
      category: request.category,
      priority: request.priority,
      actions: this.generateActions(request),
      isRead: false,
      isArchived: false,
      metadata: request.metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Store notification in Redis
   */
  private async storeNotification(notification: InAppNotification): Promise<void> {
    const notificationKey = `in_app:notification:${notification.id}`;
    const userKey = `in_app:user:${notification.userId}`;

    // Serialize notification
    const serialized = this.serializeNotification(notification);

    // Store notification data
    await this.config.redis.hmset(notificationKey, serialized);

    // Add to user's notification list with timestamp for ordering
    const timestamp = notification.createdAt.getTime();
    await this.config.redis.zadd(userKey, timestamp, notification.id);

    // Enforce max notifications per user
    const notificationCount = await this.config.redis.zcard(userKey);
    if (notificationCount > this.config.maxNotificationsPerUser) {
      const excess = notificationCount - this.config.maxNotificationsPerUser;
      const oldestIds = await this.config.redis.zrange(userKey, 0, excess - 1);

      // Remove oldest notifications
      const pipeline = this.config.redis.pipeline();
      for (const oldId of oldestIds) {
        pipeline.del(`in_app:notification:${oldId}`);
        pipeline.zrem(userKey, oldId);
      }
      await pipeline.exec();
    }

    // Set expiration for the notification
    const expirationSeconds = this.config.retentionDays * 24 * 60 * 60;
    await this.config.redis.expire(notificationKey, expirationSeconds);
  }

  /**
   * Get single notification
   */
  private async getNotification(notificationId: string): Promise<InAppNotification | null> {
    try {
      const notificationKey = `in_app:notification:${notificationId}`;
      const data = await this.config.redis.hgetall(notificationKey);

      if (!data.id) {
        return null;
      }

      return this.deserializeNotification(data);
    } catch (error) {
      this.logger.error(`Failed to get notification ${notificationId}:`, error);
      return null;
    }
  }

  /**
   * Update unread count for user
   */
  private async updateUnreadCount(userId: string, delta: number): Promise<void> {
    const countKey = `in_app:unread:${userId}`;

    if (delta === 0) return;

    if (delta > 0) {
      await this.config.redis.incrby(countKey, delta);
    } else {
      const currentCount = parseInt(await this.config.redis.get(countKey) || '0', 10);
      const newCount = Math.max(0, currentCount + delta);
      await this.config.redis.set(countKey, newCount);
    }
  }

  /**
   * Emit real-time notification event
   */
  private emitRealTimeNotification(notification: InAppNotification): void {
    this.emit('notification:new', notification);
  }

  /**
   * Serialize notification for Redis storage
   */
  private serializeNotification(notification: InAppNotification): Record<string, string> {
    return {
      id: notification.id,
      userId: notification.userId,
      organizationId: notification.organizationId || '',
      title: notification.title,
      content: notification.content,
      icon: notification.icon || '',
      category: notification.category,
      priority: notification.priority,
      actions: JSON.stringify(notification.actions || []),
      isRead: notification.isRead.toString(),
      isArchived: notification.isArchived.toString(),
      readAt: notification.readAt?.toISOString() || '',
      metadata: JSON.stringify(notification.metadata || {}),
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString()
    };
  }

  /**
   * Deserialize notification from Redis data
   */
  private deserializeNotification(data: Record<string, string>): InAppNotification {
    return {
      id: data.id,
      userId: data.userId,
      organizationId: data.organizationId || undefined,
      title: data.title,
      content: data.content,
      icon: data.icon || undefined,
      category: data.category as NotificationCategory,
      priority: data.priority as NotificationPriority,
      actions: data.actions ? JSON.parse(data.actions) : undefined,
      isRead: data.isRead === 'true',
      isArchived: data.isArchived === 'true',
      readAt: data.readAt ? new Date(data.readAt) : undefined,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt)
    };
  }

  /**
   * Generate title from content if no subject provided
   */
  private generateTitleFromContent(content: string): string {
    const maxLength = 50;
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get icon for notification category
   */
  private getIconForCategory(category: NotificationCategory): string {
    const iconMap: Record<NotificationCategory, string> = {
      [NotificationCategory.SYSTEM]: 'settings',
      [NotificationCategory.SECURITY]: 'shield-alert',
      [NotificationCategory.BILLING]: 'credit-card',
      [NotificationCategory.INVENTORY]: 'package',
      [NotificationCategory.USER_ACTION]: 'user',
      [NotificationCategory.MARKETING]: 'megaphone',
      [NotificationCategory.OPERATIONAL]: 'activity'
    };

    return iconMap[category] || 'bell';
  }

  /**
   * Generate action buttons for notification
   */
  private generateActions(request: NotificationRequest): InAppNotification['actions'] {
    const actions: InAppNotification['actions'] = [];

    // Add category-specific actions
    switch (request.category) {
      case NotificationCategory.SECURITY:
        actions.push({
          id: 'review',
          label: 'Review',
          style: 'primary'
        });
        break;
      case NotificationCategory.BILLING:
        actions.push({
          id: 'view_billing',
          label: 'View Billing',
          url: '/billing',
          style: 'primary'
        });
        break;
      // Add more category-specific actions as needed
    }

    return actions.length > 0 ? actions : undefined;
  }
}