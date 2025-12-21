import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/admin/customers/[id]/lock';
import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { notificationService } from '../../../lib/services/notificationService';

// Mock dependencies
jest.mock('next-auth/next');
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));
jest.mock('../../../lib/services/notificationService');

describe('/api/admin/customers/[id]/lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: 'user123' },
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
        query: { id: 'user123' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Forbidden: Admin access required',
      });
    });
  });

  describe('POST - Lock customer account', () => {
    const adminSession = {
      user: { id: 'admin123', role: 'ADMIN' },
    };

    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue(adminSession);
    });

    it('should successfully lock a customer account', async () => {
      const customerId = 'customer123';
      const lockData = {
        reason: 'Overdue payment - 30 days',
      };

      const mockUser = {
        id: customerId,
        email: 'customer@example.com',
        firstName: 'John',
        lastName: 'Doe',
        isLocked: false,
      };

      const mockUpdatedUser = {
        ...mockUser,
        isLocked: true,
        lockReason: lockData.reason,
        lockedAt: new Date(),
        lockedBy: adminSession.user.id,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUpdatedUser);
      (notificationService.sendAccountLockNotification as jest.Mock).mockResolvedValue(undefined);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: customerId },
        body: lockData,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({
        success: true,
        user: mockUpdatedUser,
      });

      // Verify user was updated
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: customerId },
        data: {
          isLocked: true,
          lockReason: lockData.reason,
          lockedAt: expect.any(Date),
          lockedBy: adminSession.user.id,
        },
      });

      // Verify notification was sent
      expect(notificationService.sendAccountLockNotification).toHaveBeenCalledWith(
        customerId,
        lockData.reason
      );

      // Verify audit log was created
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'CUSTOMER_ACCOUNT_LOCKED',
          userId: adminSession.user.id,
          targetUserId: customerId,
          details: {
            reason: lockData.reason,
          },
        },
      });
    });

    it('should prevent locking already locked account', async () => {
      const customerId = 'customer123';
      const mockUser = {
        id: customerId,
        isLocked: true,
        lockReason: 'Previous reason',
        lockedAt: new Date('2024-01-01'),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: customerId },
        body: { reason: 'New reason' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Account is already locked',
        lockedAt: mockUser.lockedAt.toISOString(),
        reason: mockUser.lockReason,
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should require lock reason', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        query: { id: 'customer123' },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Lock reason is required',
      });
    });

    it('should handle non-existent customer', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: 'nonexistent' },
        body: { reason: 'Test reason' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Customer not found',
      });
    });

    it('should handle notification errors gracefully', async () => {
      const customerId = 'customer123';
      const mockUser = {
        id: customerId,
        isLocked: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        isLocked: true,
      });
      (notificationService.sendAccountLockNotification as jest.Mock).mockRejectedValue(
        new Error('Email service down')
      );

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: customerId },
        body: { reason: 'Test reason' },
      });

      await handler(req, res);

      // Should still succeed even if notification fails
      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toHaveProperty('success', true);
    });
  });

  describe('DELETE - Unlock customer account', () => {
    const adminSession = {
      user: { id: 'admin123', role: 'ADMIN' },
    };

    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue(adminSession);
    });

    it('should successfully unlock a customer account', async () => {
      const customerId = 'customer123';
      const mockUser = {
        id: customerId,
        email: 'customer@example.com',
        isLocked: true,
        lockReason: 'Previous reason',
        lockedAt: new Date('2024-01-01'),
        lockedBy: 'admin456',
      };

      const mockUpdatedUser = {
        ...mockUser,
        isLocked: false,
        lockReason: null,
        lockedAt: null,
        lockedBy: null,
        unlockedAt: new Date(),
        unlockedBy: adminSession.user.id,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUpdatedUser);
      (notificationService.sendAccountUnlockNotification as jest.Mock).mockResolvedValue(undefined);

      const { req, res } = createMocks({
        method: 'DELETE',
        query: { id: customerId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({
        success: true,
        user: mockUpdatedUser,
      });

      // Verify user was updated
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: customerId },
        data: {
          isLocked: false,
          lockReason: null,
          lockedAt: null,
          lockedBy: null,
          unlockedAt: expect.any(Date),
          unlockedBy: adminSession.user.id,
        },
      });

      // Verify notification was sent
      expect(notificationService.sendAccountUnlockNotification).toHaveBeenCalledWith(customerId);

      // Verify audit log was created
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'CUSTOMER_ACCOUNT_UNLOCKED',
          userId: adminSession.user.id,
          targetUserId: customerId,
          details: {
            previousLockReason: mockUser.lockReason,
            lockedDuration: expect.any(Number),
          },
        },
      });
    });

    it('should handle unlocking already unlocked account', async () => {
      const customerId = 'customer123';
      const mockUser = {
        id: customerId,
        isLocked: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const { req, res } = createMocks({
        method: 'DELETE',
        query: { id: customerId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Account is not locked',
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('Invalid methods', () => {
    it('should reject GET requests', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'admin123', role: 'ADMIN' },
      });

      const { req, res } = createMocks({
        method: 'GET',
        query: { id: 'user123' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Method not allowed',
      });
    });
  });

  describe('Error handling', () => {
    it('should handle database errors', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'admin123', role: 'ADMIN' },
      });
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: 'user123' },
        body: { reason: 'Test' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Internal server error',
      });
    });
  });
});
