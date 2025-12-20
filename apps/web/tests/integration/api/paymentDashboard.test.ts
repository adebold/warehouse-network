import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/admin/payments/dashboard';
import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';

// Mock dependencies
jest.mock('next-auth/next');
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    payment: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((queries) => Promise.all(queries)),
  },
}));

describe('/api/admin/payments/dashboard', () => {
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
        method: 'GET',
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
        method: 'GET',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Forbidden: Admin access required',
      });
    });
  });

  describe('GET - Dashboard data', () => {
    it('should return comprehensive dashboard statistics', async () => {
      // Mock data
      const mockStats = {
        totalCustomers: 100,
        lockedAccounts: 15,
        overdueAccounts: 25,
        totalOverdueAmount: 50000,
        averageDaysOverdue: 18.5,
      };

      const mockRecentPayments = [
        {
          id: 'payment1',
          userId: 'user1',
          amount: 1000,
          status: 'COMPLETED',
          createdAt: new Date(),
          user: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
        },
      ];

      const mockOverdueBreakdown = [
        { range: '1-7 days', count: 10, totalAmount: 5000 },
        { range: '8-14 days', count: 8, totalAmount: 10000 },
        { range: '15-30 days', count: 5, totalAmount: 15000 },
        { range: '30+ days', count: 2, totalAmount: 20000 },
      ];

      const mockLockStatistics = {
        lockedToday: 3,
        unlockedToday: 1,
        averageLockDuration: 7.5,
      };

      // Set up mocks
      (prisma.user.count as jest.Mock)
        .mockResolvedValueOnce(mockStats.totalCustomers)
        .mockResolvedValueOnce(mockStats.lockedAccounts)
        .mockResolvedValueOnce(mockStats.overdueAccounts);

      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: mockStats.totalOverdueAmount },
        _avg: { daysOverdue: mockStats.averageDaysOverdue },
      });

      (prisma.payment.findMany as jest.Mock).mockResolvedValue(
        mockRecentPayments
      );

      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user1', daysOverdue: 5, overdueAmount: 1000 },
        { id: 'user2', daysOverdue: 10, overdueAmount: 2000 },
        { id: 'user3', daysOverdue: 20, overdueAmount: 5000 },
        { id: 'user4', daysOverdue: 35, overdueAmount: 10000 },
        { id: 'user5', daysOverdue: 45, overdueAmount: 10000 },
      ]);

      (prisma.user.count as jest.Mock)
        .mockResolvedValueOnce(3) // locked today
        .mockResolvedValueOnce(1); // unlocked today

      const { req, res } = createMocks({
        method: 'GET',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      const responseData = JSON.parse(res._getData());
      
      expect(responseData).toMatchObject({
        statistics: {
          totalCustomers: mockStats.totalCustomers,
          lockedAccounts: mockStats.lockedAccounts,
          overdueAccounts: mockStats.overdueAccounts,
          totalOverdueAmount: mockStats.totalOverdueAmount,
          lockPercentage: 15,
          overduePercentage: 25,
        },
        recentPayments: expect.any(Array),
        overdueBreakdown: expect.any(Array),
        lockStatistics: expect.objectContaining({
          lockedToday: 3,
          unlockedToday: 1,
        }),
      });
    });

    it('should handle date range filters', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      // Set up minimal mocks
      (prisma.user.count as jest.Mock).mockResolvedValue(0);
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: 0 },
        _avg: { daysOverdue: 0 },
      });
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const { req, res } = createMocks({
        method: 'GET',
        query: {
          startDate,
          endDate,
        },
      });

      await handler(req, res);

      // Verify date filters were applied to queries
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        })
      );
    });

    it('should calculate overdue breakdown correctly', async () => {
      // Mock users with different overdue periods
      const mockUsers = [
        // 1-7 days: 3 users
        { id: 'user1', daysOverdue: 3, overdueAmount: 100 },
        { id: 'user2', daysOverdue: 5, overdueAmount: 200 },
        { id: 'user3', daysOverdue: 7, overdueAmount: 150 },
        // 8-14 days: 2 users
        { id: 'user4', daysOverdue: 10, overdueAmount: 300 },
        { id: 'user5', daysOverdue: 14, overdueAmount: 400 },
        // 15-30 days: 2 users
        { id: 'user6', daysOverdue: 20, overdueAmount: 500 },
        { id: 'user7', daysOverdue: 25, overdueAmount: 600 },
        // 30+ days: 1 user
        { id: 'user8', daysOverdue: 45, overdueAmount: 1000 },
      ];

      (prisma.user.count as jest.Mock).mockResolvedValue(50);
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: 3250 },
        _avg: { daysOverdue: 17 },
      });
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

      const { req, res } = createMocks({
        method: 'GET',
      });

      await handler(req, res);

      const responseData = JSON.parse(res._getData());
      
      expect(responseData.overdueBreakdown).toEqual([
        { range: '1-7 days', count: 3, totalAmount: 450, percentage: 37.5 },
        { range: '8-14 days', count: 2, totalAmount: 700, percentage: 25 },
        { range: '15-30 days', count: 2, totalAmount: 1100, percentage: 25 },
        { range: '30+ days', count: 1, totalAmount: 1000, percentage: 12.5 },
      ]);
    });

    it('should handle empty data gracefully', async () => {
      // Mock empty responses
      (prisma.user.count as jest.Mock).mockResolvedValue(0);
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: null },
        _avg: { daysOverdue: null },
      });
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const { req, res } = createMocks({
        method: 'GET',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      const responseData = JSON.parse(res._getData());
      
      expect(responseData).toMatchObject({
        statistics: {
          totalCustomers: 0,
          lockedAccounts: 0,
          overdueAccounts: 0,
          totalOverdueAmount: 0,
          lockPercentage: 0,
          overduePercentage: 0,
        },
        recentPayments: [],
        overdueBreakdown: [
          { range: '1-7 days', count: 0, totalAmount: 0, percentage: 0 },
          { range: '8-14 days', count: 0, totalAmount: 0, percentage: 0 },
          { range: '15-30 days', count: 0, totalAmount: 0, percentage: 0 },
          { range: '30+ days', count: 0, totalAmount: 0, percentage: 0 },
        ],
      });
    });

    it('should include payment trends', async () => {
      const mockPaymentTrends = [
        { date: '2024-01-01', amount: 10000, count: 5 },
        { date: '2024-01-02', amount: 15000, count: 8 },
        { date: '2024-01-03', amount: 12000, count: 6 },
      ];

      // Set up basic mocks
      (prisma.user.count as jest.Mock).mockResolvedValue(0);
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: 0 },
        _avg: { daysOverdue: 0 },
      });
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      (prisma.payment.groupBy as jest.Mock).mockResolvedValue(
        mockPaymentTrends.map((trend) => ({
          createdAt: new Date(trend.date),
          _sum: { amount: trend.amount },
          _count: { _all: trend.count },
        }))
      );

      const { req, res } = createMocks({
        method: 'GET',
        query: { includeTrends: 'true' },
      });

      await handler(req, res);

      const responseData = JSON.parse(res._getData());
      
      expect(responseData.paymentTrends).toBeDefined();
      expect(responseData.paymentTrends.length).toBe(3);
    });
  });

  describe('Method validation', () => {
    it('should only accept GET requests', async () => {
      const { req, res } = createMocks({
        method: 'POST',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Method not allowed',
      });
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const { req, res } = createMocks({
        method: 'GET',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Internal server error',
      });
    });

    it('should handle invalid date parameters', async () => {
      const { req, res } = createMocks({
        method: 'GET',
        query: {
          startDate: 'invalid-date',
          endDate: 'also-invalid',
        },
      });

      // Set up minimal mocks
      (prisma.user.count as jest.Mock).mockResolvedValue(0);
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: 0 },
        _avg: { daysOverdue: 0 },
      });
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      await handler(req, res);

      // Should still return 200 but ignore invalid dates
      expect(res._getStatusCode()).toBe(200);
    });
  });

  describe('Performance optimization', () => {
    it('should use transaction for multiple queries', async () => {
      // Set up minimal mocks
      (prisma.user.count as jest.Mock).mockResolvedValue(0);
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: 0 },
        _avg: { daysOverdue: 0 },
      });
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const { req, res } = createMocks({
        method: 'GET',
      });

      await handler(req, res);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should limit recent payments query', async () => {
      // Set up minimal mocks
      (prisma.user.count as jest.Mock).mockResolvedValue(0);
      (prisma.payment.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: 0 },
        _avg: { daysOverdue: 0 },
      });
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const { req, res } = createMocks({
        method: 'GET',
      });

      await handler(req, res);

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10, // Should limit to 10 recent payments
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });
});