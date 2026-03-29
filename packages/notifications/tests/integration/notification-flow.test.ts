/**
 * Integration tests for notification flow
 */

import Redis from 'ioredis';
import { NotificationEngine } from '../../src/core/notification-engine';
import { EmailProvider } from '../../src/providers/email-provider';
import { InAppProvider } from '../../src/providers/in-app-provider';
import { TemplateEngine } from '../../src/core/template-engine';
import { PreferenceManager } from '../../src/core/preference-manager';
import { AnalyticsCollector } from '../../src/analytics/analytics-collector';
import {
  NotificationChannel,
  NotificationCategory,
  NotificationPriority,
  NotificationRequest,
  NotificationTemplate
} from '../../src/types/notification.types';

describe('Notification Flow Integration', () => {
  let notificationEngine: NotificationEngine;
  let templateEngine: TemplateEngine;
  let preferenceManager: PreferenceManager;
  let analyticsCollector: AnalyticsCollector;
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis();

    // Create providers
    const emailProvider = new EmailProvider({
      provider: 'smtp',
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'test@example.com',
        pass: 'password'
      },
      fromAddress: 'noreply@example.com',
      fromName: 'Test System'
    });

    const inAppProvider = new InAppProvider({
      redis,
      maxNotificationsPerUser: 100,
      retentionDays: 30,
      enableRealTimeUpdates: true
    });

    // Create notification engine
    notificationEngine = new NotificationEngine({
      redis: {
        host: 'localhost',
        port: 6379
      },
      providers: {
        email: emailProvider,
        in_app: inAppProvider
      },
      defaultRetryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 30000
      },
      rateLimits: {
        email: {
          perSecond: 10,
          perMinute: 100,
          perHour: 1000
        }
      },
      analytics: {
        enabled: true,
        retentionDays: 90
      }
    });

    // Initialize components
    templateEngine = new TemplateEngine(redis);
    preferenceManager = new PreferenceManager(redis);
    analyticsCollector = new AnalyticsCollector(redis, {
      enabled: true,
      retentionDays: 90,
      aggregationIntervals: {
        hourly: true,
        daily: true,
        weekly: false,
        monthly: false
      },
      enableRealTimeMetrics: true
    });

    await notificationEngine.initialize();
    await analyticsCollector.initialize();
  });

  afterAll(async () => {
    await notificationEngine.shutdown();
    await redis.quit();
  });

  describe('template-based notifications', () => {
    it('should send notification using template', async () => {
      // Register template
      const welcomeTemplate: NotificationTemplate = {
        id: 'welcome-integration',
        name: 'Welcome Message',
        description: 'Welcome message for new users',
        category: NotificationCategory.USER_ACTION,
        channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        content: {
          email: {
            subject: 'Welcome to {{organizationName}}!',
            body: 'Hi {{userName}}, welcome to {{organizationName}}!',
            htmlBody: '<h1>Welcome {{userName}}!</h1><p>Welcome to {{organizationName}}!</p>'
          },
          in_app: {
            body: 'Welcome to {{organizationName}}, {{userName}}!'
          }
        },
        variables: [
          { name: 'userName', type: 'string', required: true, description: 'User name' },
          { name: 'organizationName', type: 'string', required: true, description: 'Organization name' }
        ],
        priority: NotificationPriority.NORMAL,
        version: '1.0.0',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await templateEngine.registerTemplate(welcomeTemplate);

      // Send notification using template
      const request: NotificationRequest = {
        templateId: 'welcome-integration',
        recipients: [{
          id: 'user-123',
          type: 'user',
          userId: 'user-123',
          email: 'user@example.com'
        }],
        content: '', // Will be replaced by template
        channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.USER_ACTION,
        variables: {
          userName: 'John Doe',
          organizationName: 'Test Organization'
        }
      };

      const resultIds = await notificationEngine.send(request);

      expect(resultIds).toHaveLength(2); // Email + In-app
      expect(resultIds).toContain(expect.stringContaining('email'));
      expect(resultIds).toContain(expect.stringContaining('in_app'));
    });

    it('should handle template compilation errors gracefully', async () => {
      const request: NotificationRequest = {
        templateId: 'non-existent-template',
        recipients: [{
          id: 'user-123',
          type: 'user',
          userId: 'user-123',
          email: 'user@example.com'
        }],
        content: 'Fallback content',
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      };

      await expect(notificationEngine.send(request)).rejects.toThrow();
    });
  });

  describe('preference filtering', () => {
    it('should respect user notification preferences', async () => {
      const userId = 'user-prefs-test';

      // Set user preferences to disable email
      await preferenceManager.updatePreferences(userId, {
        channels: {
          email: { enabled: false },
          in_app: { enabled: true }
        }
      });

      const request: NotificationRequest = {
        recipients: [{
          id: userId,
          type: 'user',
          userId: userId,
          email: 'user@example.com'
        }],
        content: 'Test notification with preferences',
        channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      };

      const resultIds = await notificationEngine.send(request);

      // Should only send in-app notification
      expect(resultIds).toHaveLength(1);
      expect(resultIds[0]).toContain('in_app');
    });

    it('should respect quiet hours preferences', async () => {
      const userId = 'user-quiet-hours';

      // Set quiet hours (assuming current time falls within)
      await preferenceManager.updateChannelPreference(
        userId,
        NotificationChannel.EMAIL,
        true,
        {
          quietHours: {
            enabled: true,
            start: '00:00',
            end: '23:59',
            timezone: 'UTC'
          }
        }
      );

      const request: NotificationRequest = {
        recipients: [{
          id: userId,
          type: 'user',
          userId: userId,
          email: 'user@example.com'
        }],
        content: 'Test notification during quiet hours',
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      };

      const resultIds = await notificationEngine.send(request);

      // Should not send during quiet hours for normal priority
      expect(resultIds).toHaveLength(0);
    });

    it('should allow critical notifications during quiet hours', async () => {
      const userId = 'user-critical-test';

      await preferenceManager.updateChannelPreference(
        userId,
        NotificationChannel.EMAIL,
        true,
        {
          quietHours: {
            enabled: true,
            start: '00:00',
            end: '23:59',
            timezone: 'UTC'
          }
        }
      );

      const request: NotificationRequest = {
        recipients: [{
          id: userId,
          type: 'user',
          userId: userId,
          email: 'user@example.com'
        }],
        content: 'Critical notification',
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.CRITICAL,
        category: NotificationCategory.SECURITY
      };

      const resultIds = await notificationEngine.send(request);

      // Should send critical notifications even during quiet hours
      expect(resultIds).toHaveLength(1);
    });
  });

  describe('in-app notifications', () => {
    it('should create and retrieve in-app notifications', async () => {
      const userId = 'user-inapp-test';

      const request: NotificationRequest = {
        recipients: [{
          id: userId,
          type: 'user',
          userId: userId
        }],
        content: 'Test in-app notification',
        subject: 'Test Subject',
        channels: [NotificationChannel.IN_APP],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      };

      const resultIds = await notificationEngine.send(request);
      expect(resultIds).toHaveLength(1);

      // Give some time for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Retrieve in-app notifications
      const inAppProvider = notificationEngine['providers'].get('in_app') as InAppProvider;
      const notifications = await inAppProvider.getUserNotifications(userId, {
        limit: 10,
        includeRead: true
      });

      expect(notifications.notifications).toHaveLength(1);
      expect(notifications.notifications[0].content).toBe('Test in-app notification');
      expect(notifications.notifications[0].isRead).toBe(false);
      expect(notifications.unreadCount).toBe(1);
    });

    it('should mark in-app notifications as read', async () => {
      const userId = 'user-read-test';

      const request: NotificationRequest = {
        recipients: [{
          id: userId,
          type: 'user',
          userId: userId
        }],
        content: 'Test notification to mark as read',
        channels: [NotificationChannel.IN_APP],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      };

      await notificationEngine.send(request);
      await new Promise(resolve => setTimeout(resolve, 100));

      const inAppProvider = notificationEngine['providers'].get('in_app') as InAppProvider;

      // Get notification
      const notifications = await inAppProvider.getUserNotifications(userId);
      expect(notifications.notifications).toHaveLength(1);

      const notificationId = notifications.notifications[0].id;

      // Mark as read
      const success = await inAppProvider.markAsRead(notificationId, userId);
      expect(success).toBe(true);

      // Verify it's marked as read
      const updatedNotifications = await inAppProvider.getUserNotifications(userId);
      expect(updatedNotifications.notifications[0].isRead).toBe(true);
      expect(updatedNotifications.unreadCount).toBe(0);
    });
  });

  describe('analytics collection', () => {
    it('should collect notification events', async () => {
      const request: NotificationRequest = {
        recipients: [{
          id: 'user-analytics',
          type: 'user',
          userId: 'user-analytics',
          email: 'analytics@example.com'
        }],
        content: 'Analytics test notification',
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM,
        metadata: {
          testMetric: 'analytics-test'
        }
      };

      const resultIds = await notificationEngine.send(request);
      expect(resultIds).toHaveLength(1);

      // Give time for analytics processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get real-time metrics
      const metrics = await analyticsCollector.getRealTimeMetrics();
      expect(metrics).toHaveProperty('sent');
      expect(metrics).toHaveProperty('delivered');
      expect(metrics).toHaveProperty('failed');
    });

    it('should generate metrics for date range', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const metrics = await analyticsCollector.getMetrics(startDate, endDate);

      expect(metrics).toHaveProperty('totalSent');
      expect(metrics).toHaveProperty('totalDelivered');
      expect(metrics).toHaveProperty('totalFailed');
      expect(metrics).toHaveProperty('deliveryRate');
      expect(metrics).toHaveProperty('byChannel');
      expect(metrics).toHaveProperty('byCategory');
      expect(metrics.startDate).toEqual(startDate);
      expect(metrics.endDate).toEqual(endDate);
    });
  });

  describe('error handling and resilience', () => {
    it('should handle partial provider failures', async () => {
      // Create request that would use multiple channels
      const request: NotificationRequest = {
        recipients: [{
          id: 'user-resilience',
          type: 'user',
          userId: 'user-resilience',
          email: 'test@example.com'
        }],
        content: 'Resilience test',
        channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      };

      // Even if one provider fails, the notification system should continue
      const resultIds = await notificationEngine.send(request);
      expect(resultIds.length).toBeGreaterThan(0);
    });

    it('should validate notification requests', async () => {
      const invalidRequest: NotificationRequest = {
        recipients: [], // Invalid: no recipients
        content: '',   // Invalid: no content
        channels: [],  // Invalid: no channels
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      };

      await expect(notificationEngine.send(invalidRequest)).rejects.toThrow('Invalid notification request');
    });

    it('should handle Redis connection issues gracefully', async () => {
      // This test would verify that the system handles Redis issues gracefully
      // In a real test, you might temporarily disconnect Redis and verify behavior
      const request: NotificationRequest = {
        recipients: [{
          id: 'user-redis-test',
          type: 'user',
          userId: 'user-redis-test',
          email: 'redis@example.com'
        }],
        content: 'Redis resilience test',
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      };

      // Should not throw even if Redis has issues
      const resultIds = await notificationEngine.send(request);
      expect(Array.isArray(resultIds)).toBe(true);
    });
  });

  describe('performance and scalability', () => {
    it('should handle bulk notifications efficiently', async () => {
      const bulkRequests: NotificationRequest[] = Array.from({ length: 50 }, (_, i) => ({
        id: `bulk-perf-${i}`,
        recipients: [{
          id: `user-bulk-${i}`,
          type: 'user',
          userId: `user-bulk-${i}`,
          email: `user${i}@example.com`
        }],
        content: `Bulk notification ${i}`,
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      }));

      const startTime = Date.now();
      const results = await notificationEngine.sendBulk(bulkRequests);
      const endTime = Date.now();

      expect(results).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify all were processed
      const successfulSends = results.filter(result => result.length > 0);
      expect(successfulSends.length).toBeGreaterThan(0);
    });

    it('should handle concurrent notification requests', async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => {
        const request: NotificationRequest = {
          id: `concurrent-${i}`,
          recipients: [{
            id: `user-concurrent-${i}`,
            type: 'user',
            userId: `user-concurrent-${i}`,
            email: `concurrent${i}@example.com`
          }],
          content: `Concurrent notification ${i}`,
          channels: [NotificationChannel.EMAIL],
          priority: NotificationPriority.NORMAL,
          category: NotificationCategory.SYSTEM
        };

        return notificationEngine.send(request);
      });

      const results = await Promise.allSettled(concurrentRequests);

      // All requests should be handled successfully
      const successful = results.filter(result => result.status === 'fulfilled');
      expect(successful.length).toBe(10);
    });
  });
});