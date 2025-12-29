
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

import PaymentDashboard from '../../../pages/admin/payments/dashboard';

// Mock dependencies
jest.mock('next-auth/react');
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

// Mock chart components
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

// Mock fetch
global.fetch = jest.fn();

describe('Payment Dashboard Page', () => {
  const mockPush = jest.fn();
  const adminSession = {
    user: {
      id: 'admin123',
      email: 'admin@example.com',
      role: 'ADMIN',
    },
  };

  const mockDashboardData = {
    statistics: {
      totalCustomers: 150,
      lockedAccounts: 25,
      overdueAccounts: 35,
      totalOverdueAmount: 75000,
      averageDaysOverdue: 22,
      lockPercentage: 16.67,
      overduePercentage: 23.33,
    },
    recentPayments: [
      {
        id: 'payment1',
        userId: 'user1',
        amount: 1500,
        status: 'COMPLETED',
        createdAt: '2024-01-20T10:00:00Z',
        user: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
      },
      {
        id: 'payment2',
        userId: 'user2',
        amount: 2500,
        status: 'PENDING',
        createdAt: '2024-01-20T09:00:00Z',
        user: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
      },
    ],
    overdueBreakdown: [
      { range: '1-7 days', count: 15, totalAmount: 10000, percentage: 42.86 },
      { range: '8-14 days', count: 10, totalAmount: 20000, percentage: 28.57 },
      { range: '15-30 days', count: 7, totalAmount: 25000, percentage: 20 },
      { range: '30+ days', count: 3, totalAmount: 20000, percentage: 8.57 },
    ],
    lockStatistics: {
      lockedToday: 5,
      unlockedToday: 2,
      averageLockDuration: 8.5,
      lockTrend: [
        { date: '2024-01-14', locked: 20, unlocked: 3 },
        { date: '2024-01-15', locked: 22, unlocked: 2 },
        { date: '2024-01-16', locked: 21, unlocked: 4 },
        { date: '2024-01-17', locked: 23, unlocked: 1 },
        { date: '2024-01-18', locked: 24, unlocked: 2 },
        { date: '2024-01-19', locked: 23, unlocked: 3 },
        { date: '2024-01-20', locked: 25, unlocked: 2 },
      ],
    },
    paymentTrends: [
      { date: '2024-01-14', amount: 45000, count: 12 },
      { date: '2024-01-15', amount: 52000, count: 15 },
      { date: '2024-01-16', amount: 48000, count: 13 },
      { date: '2024-01-17', amount: 55000, count: 16 },
      { date: '2024-01-18', amount: 61000, count: 18 },
      { date: '2024-01-19', amount: 58000, count: 17 },
      { date: '2024-01-20', amount: 42000, count: 10 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      pathname: '/admin/payments/dashboard',
    });
    (useSession as jest.Mock).mockReturnValue({
      data: adminSession,
      status: 'authenticated',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial Load', () => {
    it('should load and display dashboard statistics', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        // Check statistics cards
        expect(screen.getByText('150')).toBeInTheDocument(); // Total customers
        expect(screen.getByText('25')).toBeInTheDocument(); // Locked accounts
        expect(screen.getByText('35')).toBeInTheDocument(); // Overdue accounts
        expect(screen.getByText('$75,000')).toBeInTheDocument(); // Total overdue
        expect(screen.getByText('22 days')).toBeInTheDocument(); // Average days overdue
      });

      // Check percentages
      expect(screen.getByText('16.67%')).toBeInTheDocument(); // Lock percentage
      expect(screen.getByText('23.33%')).toBeInTheDocument(); // Overdue percentage
    });

    it('should display charts', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('line-chart')).toBeInTheDocument(); // Payment trends
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument(); // Overdue breakdown
        expect(screen.getByTestId('pie-chart')).toBeInTheDocument(); // Lock statistics
      });
    });

    it('should show loading state', () => {
      (fetch as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<PaymentDashboard />);

      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
      expect(screen.getAllByTestId('skeleton')).toHaveLength(7); // 7 stat cards
    });

    it('should handle error state', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard data/i)).toBeInTheDocument();
        expect(screen.getByText(/Retry/i)).toBeInTheDocument();
      });
    });
  });

  describe('Date Range Filter', () => {
    it('should filter data by date range', async () => {
      const user = userEvent.setup();

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDashboardData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockDashboardData,
            statistics: {
              ...mockDashboardData.statistics,
              totalOverdueAmount: 50000, // Different amount for filtered range
            },
          }),
        });

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText('$75,000')).toBeInTheDocument();
      });

      // Change date range
      const startDateInput = screen.getByLabelText('Start Date');
      const endDateInput = screen.getByLabelText('End Date');

      await user.clear(startDateInput);
      await user.type(startDateInput, '2024-01-01');

      await user.clear(endDateInput);
      await user.type(endDateInput, '2024-01-15');

      const applyButton = screen.getByText('Apply');
      await user.click(applyButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('startDate=2024-01-01&endDate=2024-01-15'),
          expect.any(Object)
        );
        expect(screen.getByText('$50,000')).toBeInTheDocument(); // Updated amount
      });
    });

    it('should show preset date ranges', async () => {
      const user = userEvent.setup();

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText('$75,000')).toBeInTheDocument();
      });

      // Click preset buttons
      const last7DaysButton = screen.getByText('Last 7 Days');
      await user.click(last7DaysButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('startDate='),
          expect.any(Object)
        );
      });

      const last30DaysButton = screen.getByText('Last 30 Days');
      await user.click(last30DaysButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenLastCalledWith(
          expect.stringContaining('startDate='),
          expect.any(Object)
        );
      });
    });
  });

  describe('Recent Payments', () => {
    it('should display recent payments table', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        // Check table headers
        expect(screen.getByText('Customer')).toBeInTheDocument();
        expect(screen.getByText('Amount')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Date')).toBeInTheDocument();

        // Check payment data
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('$1,500.00')).toBeInTheDocument();
        expect(screen.getByText('COMPLETED')).toBeInTheDocument();

        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('$2,500.00')).toBeInTheDocument();
        expect(screen.getByText('PENDING')).toBeInTheDocument();
      });
    });

    it('should navigate to payment details on row click', async () => {
      const user = userEvent.setup();

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const paymentRow = screen.getByText('John Doe').closest('tr');
      await user.click(paymentRow!);

      expect(mockPush).toHaveBeenCalledWith('/admin/payments/payment1');
    });
  });

  describe('Overdue Breakdown', () => {
    it('should display overdue breakdown statistics', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        const overdueSection = screen.getByText('Overdue Breakdown').closest('section');

        within(overdueSection!).getByText('1-7 days');
        within(overdueSection!).getByText('15 accounts');
        within(overdueSection!).getByText('$10,000');
        within(overdueSection!).getByText('42.86%');

        within(overdueSection!).getByText('30+ days');
        within(overdueSection!).getByText('3 accounts');
        within(overdueSection!).getByText('$20,000');
        within(overdueSection!).getByText('8.57%');
      });
    });

    it('should highlight critical overdue accounts', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        const criticalRow = screen.getByText('30+ days').closest('.overdue-row');
        expect(criticalRow).toHaveClass('critical');
      });
    });
  });

  describe('Lock Statistics', () => {
    it('should display lock statistics', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Locked Today: 5')).toBeInTheDocument();
        expect(screen.getByText('Unlocked Today: 2')).toBeInTheDocument();
        expect(screen.getByText('Avg Lock Duration: 8.5 days')).toBeInTheDocument();
      });
    });
  });

  describe('Export and Actions', () => {
    it('should export dashboard data', async () => {
      const user = userEvent.setup();

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDashboardData,
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: async () => new Blob(['csv data'], { type: 'text/csv' }),
        });

      global.URL.createObjectURL = jest.fn(() => 'blob:url');

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText('$75,000')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export Report');
      await user.click(exportButton);

      // Select export format
      const csvOption = screen.getByText('Export as CSV');
      await user.click(csvOption);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/payments/export?format=csv',
          expect.any(Object)
        );
      });
    });

    it('should navigate to customer management', async () => {
      const user = userEvent.setup();

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText('$75,000')).toBeInTheDocument();
      });

      const manageButton = screen.getByText('Manage Customers');
      await user.click(manageButton);

      expect(mockPush).toHaveBeenCalledWith('/admin/customers');
    });

    it('should navigate to overdue report', async () => {
      const user = userEvent.setup();

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText('$75,000')).toBeInTheDocument();
      });

      const overdueButton = screen.getByText('View Overdue Report');
      await user.click(overdueButton);

      expect(mockPush).toHaveBeenCalledWith('/admin/payments/overdue');
    });
  });

  describe('Auto-refresh', () => {
    jest.useFakeTimers();

    it('should auto-refresh data every 5 minutes', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDashboardData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockDashboardData,
            statistics: {
              ...mockDashboardData.statistics,
              lockedAccounts: 26, // Updated value
            },
          }),
        });

      render(<PaymentDashboard />);

      await waitFor(() => {
        expect(screen.getByText('25')).toBeInTheDocument(); // Initial locked accounts
      });

      // Fast-forward 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      await waitFor(() => {
        expect(screen.getByText('26')).toBeInTheDocument(); // Updated locked accounts
      });
    });

    jest.useRealTimers();
  });

  describe('Responsive Design', () => {
    it('should adapt layout for mobile', async () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardData,
      });

      render(<PaymentDashboard />);

      await waitFor(() => {
        // Check if mobile-specific classes are applied
        const statsGrid = screen.getByTestId('stats-grid');
        expect(statsGrid).toHaveClass('mobile-layout');
      });
    });
  });
});
