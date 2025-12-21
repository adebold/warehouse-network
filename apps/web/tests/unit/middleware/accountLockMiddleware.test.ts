import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { accountLockMiddleware } from '../../../lib/middleware/accountLockMiddleware';
import { prisma } from '../../../lib/prisma';

// Mock dependencies
jest.mock('next-auth/next');
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

describe('accountLockMiddleware', () => {
  let req: Partial<NextApiRequest>;
  let res: Partial<NextApiResponse>;
  let json: jest.Mock;
  let status: jest.Mock;
  let next: jest.Mock;

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    req = {
      headers: {},
      method: 'GET',
    };
    res = {
      status,
      json,
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('Authentication checks', () => {
    it('should return 401 if no session exists', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      await accountLockMiddleware(req as NextApiRequest, res as NextApiResponse, next);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if session has no user', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({});

      await accountLockMiddleware(req as NextApiRequest, res as NextApiResponse, next);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Admin access', () => {
    it('should allow admin users to proceed', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'admin123', role: 'ADMIN' },
      });

      await accountLockMiddleware(req as NextApiRequest, res as NextApiResponse, next);

      expect(next).toHaveBeenCalled();
      expect(status).not.toHaveBeenCalled();
    });
  });

  describe('Customer account lock checks', () => {
    it('should allow unlocked customer to proceed', async () => {
      const mockUser = {
        id: 'customer123',
        role: 'CUSTOMER',
        isLocked: false,
      };

      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: mockUser.id, role: mockUser.role },
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await accountLockMiddleware(req as NextApiRequest, res as NextApiResponse, next);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: {
          isLocked: true,
          lockReason: true,
          lockedAt: true,
        },
      });
      expect(next).toHaveBeenCalled();
      expect(status).not.toHaveBeenCalled();
    });

    it('should block locked customer with proper error', async () => {
      const lockDate = new Date();
      const mockUser = {
        id: 'customer123',
        role: 'CUSTOMER',
        isLocked: true,
        lockReason: 'Overdue payments',
        lockedAt: lockDate,
      };

      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: mockUser.id, role: mockUser.role },
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await accountLockMiddleware(req as NextApiRequest, res as NextApiResponse, next);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        error: 'Account locked',
        reason: mockUser.lockReason,
        lockedAt: lockDate.toISOString(),
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle user not found gracefully', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'nonexistent', role: 'CUSTOMER' },
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await accountLockMiddleware(req as NextApiRequest, res as NextApiResponse, next);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'User not found' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'customer123', role: 'CUSTOMER' },
      });

      (prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection error')
      );

      await accountLockMiddleware(req as NextApiRequest, res as NextApiResponse, next);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
