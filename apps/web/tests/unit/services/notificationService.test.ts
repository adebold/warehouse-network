import { notificationService } from '../../../lib/services/notificationService';
import { prisma } from '../../../lib/prisma';
import sgMail from '@sendgrid/mail';

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SENDGRID_API_KEY = 'test-api-key';
    process.env.SENDGRID_FROM_EMAIL = 'test@example.com';
  });

  describe('sendAccountLockNotification', () => {
    const mockUser = {
      id: 'user123',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should send email notification for account lock', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'notif123',
      });
      (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);

      await notificationService.sendAccountLockNotification(mockUser.id, 'Overdue payment');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      expect(sgMail.send).toHaveBeenCalledWith({
        to: mockUser.email,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: 'Account Access Restricted',
        html: expect.stringContaining('John'),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          type: 'ACCOUNT_LOCKED',
          title: 'Account Access Restricted',
          message: expect.any(String),
          metadata: {
            reason: 'Overdue payment',
          },
        },
      });
    });

    it('should handle email sending failure gracefully', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (sgMail.send as jest.Mock).mockRejectedValue(new Error('Email service unavailable'));

      await notificationService.sendAccountLockNotification(mockUser.id, 'Overdue payment');

      // Should still create notification record
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should handle user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        notificationService.sendAccountLockNotification('nonexistent', 'Overdue payment')
      ).rejects.toThrow('User not found');
    });
  });

  describe('sendAccountUnlockNotification', () => {
    const mockUser = {
      id: 'user123',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should send email notification for account unlock', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'notif123',
      });
      (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);

      await notificationService.sendAccountUnlockNotification(mockUser.id);

      expect(sgMail.send).toHaveBeenCalledWith({
        to: mockUser.email,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: 'Account Access Restored',
        html: expect.stringContaining('restored'),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          type: 'ACCOUNT_UNLOCKED',
          title: 'Account Access Restored',
          message: expect.any(String),
        },
      });
    });
  });

  describe('sendPaymentReminderNotification', () => {
    const mockUser = {
      id: 'user123',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should send payment reminder with correct urgency', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'notif123',
      });
      (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);

      await notificationService.sendPaymentReminderNotification(mockUser.id, 5, 250.5);

      expect(sgMail.send).toHaveBeenCalledWith({
        to: mockUser.email,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: 'Payment Reminder: 5 days overdue',
        html: expect.stringContaining('$250.50'),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          type: 'PAYMENT_REMINDER',
          title: 'Payment Reminder',
          message: expect.stringContaining('5 days'),
          metadata: {
            daysOverdue: 5,
            amount: 250.5,
          },
        },
      });
    });

    it('should handle different overdue periods correctly', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);

      // Test 30+ days (urgent)
      await notificationService.sendPaymentReminderNotification(mockUser.id, 35, 1000);

      expect(sgMail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('URGENT'),
        })
      );
    });
  });

  describe('sendBulkNotifications', () => {
    it('should send notifications to multiple users', async () => {
      const userIds = ['user1', 'user2', 'user3'];
      const notification = {
        type: 'ANNOUNCEMENT' as const,
        title: 'System Maintenance',
        message: 'Scheduled maintenance on Sunday',
      };

      (prisma.notification.createMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const result = await notificationService.sendBulkNotifications(userIds, notification);

      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: userIds.map(userId => ({
          userId,
          ...notification,
        })),
      });

      expect(result).toEqual({ count: 3 });
    });

    it('should handle empty user list', async () => {
      const result = await notificationService.sendBulkNotifications([], {
        type: 'ANNOUNCEMENT',
        title: 'Test',
        message: 'Test message',
      });

      expect(prisma.notification.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 0 });
    });
  });

  describe('getUserNotifications', () => {
    it('should retrieve user notifications with pagination', async () => {
      const mockNotifications = [
        {
          id: 'notif1',
          title: 'Notification 1',
          createdAt: new Date(),
        },
        {
          id: 'notif2',
          title: 'Notification 2',
          createdAt: new Date(),
        },
      ];

      (prisma.notification.findMany as jest.Mock).mockResolvedValue(mockNotifications);
      (prisma.notification.count as jest.Mock).mockResolvedValue(5);

      const result = await notificationService.getUserNotifications('user123', {
        page: 1,
        limit: 2,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user123' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 2,
      });

      expect(result).toEqual({
        notifications: mockNotifications,
        total: 5,
        page: 1,
        totalPages: 3,
      });
    });

    it('should filter by read status', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(0);

      await notificationService.getUserNotifications('user123', {
        page: 1,
        limit: 10,
        unreadOnly: true,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user123',
          read: false,
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read', async () => {
      const mockNotification = {
        id: 'notif123',
        read: true,
        readAt: new Date(),
      };

      (prisma.notification.update as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notificationService.markNotificationAsRead('notif123');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif123' },
        data: {
          read: true,
          readAt: expect.any(Date),
        },
      });

      expect(result).toEqual(mockNotification);
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      (prisma.notification.count as jest.Mock).mockResolvedValue(7);

      const result = await notificationService.getUnreadCount('user123');

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user123',
          read: false,
        },
      });

      expect(result).toBe(7);
    });
  });
});
