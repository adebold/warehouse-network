import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/admin/customers/bulk';
import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { notificationService } from '../../../lib/services/notificationService';

// Mock dependencies
jest.mock('next-auth/next');
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(cb => cb(prisma)),
  },
}));
jest.mock('../../../lib/services/notificationService');

describe('/api/admin/customers/bulk', () => {
  const adminSession = {
    user: { id: 'admin123', role: 'ADMIN' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(adminSession);
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks({
        method: 'POST',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should require admin role', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', role: 'CUSTOMER' },
      });

      const { req, res } = createMocks({
        method: 'POST',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Forbidden: Admin access required',
      });
    });
  });

  describe('POST - Bulk lock accounts', () => {
    it('should successfully lock multiple accounts', async () => {
      const userIds = ['user1', 'user2', 'user3'];
      const reason = 'Bulk lock - overdue payments';

      const mockUsers = userIds.map(id => ({
        id,
        email: `${id}@example.com`,
        isLocked: false,
      }));

      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      });
      (notificationService.sendBulkNotifications as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'lock',
          userIds,
          reason,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({
        success: true,
        count: 3,
        action: 'lock',
      });

      // Verify users were updated
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: userIds },
          isLocked: false,
        },
        data: {
          isLocked: true,
          lockReason: reason,
          lockedAt: expect.any(Date),
          lockedBy: adminSession.user.id,
        },
      });

      // Verify notifications were sent
      expect(notificationService.sendBulkNotifications).toHaveBeenCalled();

      // Verify audit log was created
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'BULK_CUSTOMER_LOCK',
          userId: adminSession.user.id,
          details: {
            userIds,
            reason,
            count: 3,
          },
        },
      });
    });

    it('should filter out already locked accounts', async () => {
      const userIds = ['user1', 'user2', 'user3'];
      const mockUsers = [
        { id: 'user1', isLocked: false },
        { id: 'user2', isLocked: true }, // Already locked
        { id: 'user3', isLocked: false },
      ];

      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'lock',
          userIds,
          reason: 'Test reason',
        },
      });

      await handler(req, res);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['user1', 'user3'] }, // Only unlocked users
          isLocked: false,
        },
        data: expect.any(Object),
      });
    });

    it('should require lock reason', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'lock',
          userIds: ['user1'],
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Lock reason is required',
      });
    });
  });

  describe('POST - Bulk unlock accounts', () => {
    it('should successfully unlock multiple accounts', async () => {
      const userIds = ['user1', 'user2', 'user3'];

      const mockUsers = userIds.map(id => ({
        id,
        email: `${id}@example.com`,
        isLocked: true,
        lockReason: 'Previous reason',
      }));

      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      });
      (notificationService.sendBulkNotifications as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'unlock',
          userIds,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({
        success: true,
        count: 3,
        action: 'unlock',
      });

      // Verify users were updated
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: userIds },
          isLocked: true,
        },
        data: {
          isLocked: false,
          lockReason: null,
          lockedAt: null,
          lockedBy: null,
          unlockedAt: expect.any(Date),
          unlockedBy: adminSession.user.id,
        },
      });

      // Verify audit log was created
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'BULK_CUSTOMER_UNLOCK',
          userId: adminSession.user.id,
          details: {
            userIds,
            count: 3,
          },
        },
      });
    });

    it('should filter out already unlocked accounts', async () => {
      const userIds = ['user1', 'user2', 'user3'];
      const mockUsers = [
        { id: 'user1', isLocked: true },
        { id: 'user2', isLocked: false }, // Already unlocked
        { id: 'user3', isLocked: true },
      ];

      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'unlock',
          userIds,
        },
      });

      await handler(req, res);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['user1', 'user3'] }, // Only locked users
          isLocked: true,
        },
        data: expect.any(Object),
      });
    });
  });

  describe('POST - Send bulk reminders', () => {
    it('should send payment reminders to overdue customers', async () => {
      const userIds = ['user1', 'user2'];
      const mockUsers = [
        {
          id: 'user1',
          email: 'user1@example.com',
          overdueAmount: 100,
          daysOverdue: 10,
        },
        {
          id: 'user2',
          email: 'user2@example.com',
          overdueAmount: 200,
          daysOverdue: 20,
        },
      ];

      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (notificationService.sendPaymentReminderNotification as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'remind',
          userIds,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({
        success: true,
        count: 2,
        action: 'remind',
      });

      // Verify individual reminders were sent
      expect(notificationService.sendPaymentReminderNotification).toHaveBeenCalledTimes(2);
      expect(notificationService.sendPaymentReminderNotification).toHaveBeenCalledWith(
        'user1',
        10,
        100
      );
      expect(notificationService.sendPaymentReminderNotification).toHaveBeenCalledWith(
        'user2',
        20,
        200
      );

      // Verify audit log
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'BULK_PAYMENT_REMINDER',
          userId: adminSession.user.id,
          details: {
            userIds,
            count: 2,
          },
        },
      });
    });

    it('should handle users without overdue amounts', async () => {
      const userIds = ['user1', 'user2'];
      const mockUsers = [
        {
          id: 'user1',
          overdueAmount: 100,
          daysOverdue: 10,
        },
        {
          id: 'user2',
          overdueAmount: 0, // No overdue amount
          daysOverdue: 0,
        },
      ];

      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (notificationService.sendPaymentReminderNotification as jest.Mock).mockResolvedValue(
        undefined
      );

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'remind',
          userIds,
        },
      });

      await handler(req, res);

      // Should only send reminder to user1
      expect(notificationService.sendPaymentReminderNotification).toHaveBeenCalledTimes(1);
      expect(notificationService.sendPaymentReminderNotification).toHaveBeenCalledWith(
        'user1',
        10,
        100
      );
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Action and userIds are required',
      });
    });

    it('should validate action type', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'invalid',
          userIds: ['user1'],
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Invalid action. Must be lock, unlock, or remind',
      });
    });

    it('should validate userIds array', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'lock',
          userIds: 'not-an-array',
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'userIds must be an array',
      });
    });

    it('should validate empty userIds', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'lock',
          userIds: [],
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'No users selected',
      });
    });
  });

  describe('Transaction handling', () => {
    it('should use transaction for bulk operations', async () => {
      const userIds = ['user1', 'user2'];

      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user1', isLocked: false },
        { id: 'user2', isLocked: false },
      ]);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'lock',
          userIds,
          reason: 'Test',
        },
      });

      await handler(req, res);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should rollback on transaction failure', async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('Transaction failed'));

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          action: 'lock',
          userIds: ['user1'],
          reason: 'Test',
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('Method validation', () => {
    it('should only accept POST requests', async () => {
      const { req, res } = createMocks({
        method: 'GET',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Method not allowed',
      });
    });
  });
});
