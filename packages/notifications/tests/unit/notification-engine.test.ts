/**
 * Unit tests for NotificationEngine
 */

import Redis from 'ioredis';
import { NotificationEngine, NotificationEngineConfig } from '../../src/core/notification-engine';
import { EmailProvider } from '../../src/providers/email-provider';
import { SMSProvider } from '../../src/providers/sms-provider';
import {
  NotificationChannel,
  NotificationCategory,
  NotificationPriority,
  NotificationRequest,
  NotificationRecipient
} from '../../src/types/notification.types';

describe('NotificationEngine', () => {
  let notificationEngine: NotificationEngine;
  let mockRedis: jest.Mocked<Redis>;
  let mockEmailProvider: jest.Mocked<EmailProvider>;
  let mockSMSProvider: jest.Mocked<SMSProvider>;

  const defaultConfig: NotificationEngineConfig = {
    redis: {
      host: 'localhost',
      port: 6379
    },
    providers: {},
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
  };

  beforeEach(() => {
    mockRedis = new Redis() as jest.Mocked<Redis>;

    mockEmailProvider = {
      id: 'email',
      name: 'Email Provider',
      channels: [NotificationChannel.EMAIL],
      send: jest.fn(),
      getStatus: jest.fn(),
      validateConfiguration: jest.fn().mockResolvedValue(true)
    } as any;

    mockSMSProvider = {
      id: 'sms',
      name: 'SMS Provider',
      channels: [NotificationChannel.SMS],
      send: jest.fn(),
      getStatus: jest.fn(),
      validateConfiguration: jest.fn().mockResolvedValue(true)
    } as any;

    const config = {
      ...defaultConfig,
      providers: {
        email: mockEmailProvider,
        sms: mockSMSProvider
      }
    };

    notificationEngine = new NotificationEngine(config);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(notificationEngine.initialize()).resolves.not.toThrow();
      expect(mockRedis.ping).toHaveBeenCalled();
      expect(mockEmailProvider.validateConfiguration).toHaveBeenCalled();
      expect(mockSMSProvider.validateConfiguration).toHaveBeenCalled();
    });

    it('should handle Redis connection failure', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));
      await expect(notificationEngine.initialize()).rejects.toThrow();
    });

    it('should warn about invalid provider configuration', async () => {
      mockEmailProvider.validateConfiguration.mockResolvedValue(false);
      await expect(notificationEngine.initialize()).resolves.not.toThrow();
    });
  });

  describe('send notification', () => {
    const validRequest: NotificationRequest = {
      id: 'test-notification',
      recipients: [{
        id: 'user-1',
        type: 'user',
        userId: 'user-1',
        email: 'test@example.com'
      }],
      content: 'Test notification content',
      subject: 'Test Subject',
      channels: [NotificationChannel.EMAIL],
      priority: NotificationPriority.NORMAL,
      category: NotificationCategory.SYSTEM
    };

    beforeEach(async () => {
      await notificationEngine.initialize();
    });

    it('should send notification successfully', async () => {
      const resultIds = await notificationEngine.send(validRequest);
      expect(resultIds).toHaveLength(1);
      expect(resultIds[0]).toContain('test-notification_user-1_email');
    });

    it('should validate request before sending', async () => {
      const invalidRequest = { ...validRequest, recipients: [] };
      await expect(notificationEngine.send(invalidRequest)).rejects.toThrow('Invalid notification request');
    });

    it('should generate request ID if not provided', async () => {
      const requestWithoutId = { ...validRequest };
      delete requestWithoutId.id;

      const resultIds = await notificationEngine.send(requestWithoutId);
      expect(resultIds).toHaveLength(1);
      expect(resultIds[0]).toMatch(/^notif_\d+_\w+_user-1_email$/);
    });

    it('should handle multiple recipients', async () => {
      const multiRecipientRequest: NotificationRequest = {
        ...validRequest,
        recipients: [
          {
            id: 'user-1',
            type: 'user',
            userId: 'user-1',
            email: 'test1@example.com'
          },
          {
            id: 'user-2',
            type: 'user',
            userId: 'user-2',
            email: 'test2@example.com'
          }
        ]
      };

      const resultIds = await notificationEngine.send(multiRecipientRequest);
      expect(resultIds).toHaveLength(2);
    });

    it('should handle multiple channels', async () => {
      const multiChannelRequest: NotificationRequest = {
        ...validRequest,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        recipients: [{
          id: 'user-1',
          type: 'user',
          userId: 'user-1',
          email: 'test@example.com',
          phone: '+1234567890'
        }]
      };

      const resultIds = await notificationEngine.send(multiChannelRequest);
      expect(resultIds).toHaveLength(2);
    });
  });

  describe('bulk send', () => {
    const requests: NotificationRequest[] = [
      {
        id: 'bulk-1',
        recipients: [{
          id: 'user-1',
          type: 'user',
          userId: 'user-1',
          email: 'test1@example.com'
        }],
        content: 'Bulk notification 1',
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      },
      {
        id: 'bulk-2',
        recipients: [{
          id: 'user-2',
          type: 'user',
          userId: 'user-2',
          email: 'test2@example.com'
        }],
        content: 'Bulk notification 2',
        channels: [NotificationChannel.EMAIL],
        priority: NotificationPriority.NORMAL,
        category: NotificationCategory.SYSTEM
      }
    ];

    beforeEach(async () => {
      await notificationEngine.initialize();
    });

    it('should send bulk notifications', async () => {
      const results = await notificationEngine.sendBulk(requests);
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(1);
      expect(results[1]).toHaveLength(1);
    });

    it('should handle partial failures in bulk send', async () => {
      // Make the second request invalid
      const invalidRequests = [...requests];
      invalidRequests[1] = { ...requests[1], recipients: [] };

      const results = await notificationEngine.sendBulk(invalidRequests);
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(1); // First request successful
      expect(results[1]).toHaveLength(0); // Second request failed
    });
  });

  describe('status retrieval', () => {
    beforeEach(async () => {
      await notificationEngine.initialize();
    });

    it('should get notification status', async () => {
      const notificationId = 'test-notification-id';
      const mockStatus = {
        id: notificationId,
        status: 'sent',
        sentAt: new Date()
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockStatus));

      const status = await notificationEngine.getStatus(notificationId);
      expect(status).toEqual(mockStatus);
      expect(mockRedis.get).toHaveBeenCalledWith(`notification:status:${notificationId}`);
    });

    it('should return null for non-existent notification', async () => {
      mockRedis.get.mockResolvedValue(null);

      const status = await notificationEngine.getStatus('non-existent');
      expect(status).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const status = await notificationEngine.getStatus('test-id');
      expect(status).toBeNull();
    });
  });

  describe('metrics', () => {
    beforeEach(async () => {
      await notificationEngine.initialize();
    });

    it('should get metrics for date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const metrics = await notificationEngine.getMetrics(startDate, endDate);

      expect(metrics).toHaveProperty('totalSent');
      expect(metrics).toHaveProperty('totalDelivered');
      expect(metrics).toHaveProperty('totalFailed');
      expect(metrics).toHaveProperty('deliveryRate');
      expect(metrics.startDate).toEqual(startDate);
      expect(metrics.endDate).toEqual(endDate);
    });

    it('should get metrics for specific organization', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const organizationId = 'org-123';

      const metrics = await notificationEngine.getMetrics(startDate, endDate, organizationId);

      expect(metrics).toHaveProperty('totalSent');
      expect(metrics).toHaveProperty('byChannel');
      expect(metrics).toHaveProperty('byCategory');
    });
  });

  describe('provider registration', () => {
    it('should register new provider', () => {
      const mockProvider = {
        id: 'webhook',
        name: 'Webhook Provider',
        channels: [NotificationChannel.WEBHOOK],
        send: jest.fn(),
        getStatus: jest.fn(),
        validateConfiguration: jest.fn()
      } as any;

      notificationEngine.registerProvider('webhook', mockProvider);
      // Test would verify provider is registered by checking internal state
    });
  });

  describe('template registration', () => {
    beforeEach(async () => {
      await notificationEngine.initialize();
    });

    it('should register template', async () => {
      const template = {
        id: 'test-template',
        name: 'Test Template',
        category: NotificationCategory.SYSTEM,
        channels: [NotificationChannel.EMAIL],
        content: {
          email: {
            subject: 'Test Subject',
            body: 'Test Body'
          }
        },
        variables: [],
        priority: NotificationPriority.NORMAL,
        version: '1.0.0',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await expect(notificationEngine.registerTemplate(template)).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await notificationEngine.initialize();
      await expect(notificationEngine.shutdown()).resolves.not.toThrow();
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should handle shutdown when already shutting down', async () => {
      await notificationEngine.initialize();

      // Start shutdown
      const shutdownPromise1 = notificationEngine.shutdown();
      const shutdownPromise2 = notificationEngine.shutdown();

      await expect(Promise.all([shutdownPromise1, shutdownPromise2])).resolves.not.toThrow();
    });
  });
});