import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import OverdueReport from '../../../pages/admin/payments/overdue';

// Mock dependencies
jest.mock('next-auth/react');
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('Overdue Report Page', () => {
  const mockPush = jest.fn();
  const adminSession = {
    user: {
      id: 'admin123',
      email: 'admin@example.com',
      role: 'ADMIN',
    },
  };

  const mockOverdueData = {
    summary: {
      totalOverdueCustomers: 35,
      totalOverdueAmount: 75000,
      averageDaysOverdue: 22,
      oldestOverdueDate: '2023-12-01T00:00:00Z',
      overdueByRange: {
        '1-7': { count: 15, amount: 10000 },
        '8-14': { count: 10, amount: 20000 },
        '15-30': { count: 7, amount: 25000 },
        '30+': { count: 3, amount: 20000 },
      },
    },
    customers: [
      {
        id: 'cust1',
        email: 'customer1@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'ACME Corp',
        overdueAmount: 5000,
        daysOverdue: 45,
        oldestInvoiceDate: '2023-12-01T00:00:00Z',
        totalInvoices: 3,
        isLocked: true,
        lockReason: 'Overdue payment',
        lastContactDate: '2024-01-10T00:00:00Z',
        paymentHistory: {
          lastPaymentDate: '2023-11-15T00:00:00Z',
          lastPaymentAmount: 2000,
          totalPaidLast6Months: 15000,
        },
      },
      {
        id: 'cust2',
        email: 'customer2@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        company: 'Tech Inc',
        overdueAmount: 3500,
        daysOverdue: 30,
        oldestInvoiceDate: '2023-12-20T00:00:00Z',
        totalInvoices: 2,
        isLocked: false,
        lastContactDate: '2024-01-15T00:00:00Z',
        paymentHistory: {
          lastPaymentDate: '2023-12-10T00:00:00Z',
          lastPaymentAmount: 1500,
          totalPaidLast6Months: 8000,
        },
      },
      {
        id: 'cust3',
        email: 'customer3@example.com',
        firstName: 'Bob',
        lastName: 'Johnson',
        company: 'Startup LLC',
        overdueAmount: 1200,
        daysOverdue: 7,
        oldestInvoiceDate: '2024-01-13T00:00:00Z',
        totalInvoices: 1,
        isLocked: false,
        lastContactDate: null,
        paymentHistory: {
          lastPaymentDate: '2024-01-05T00:00:00Z',
          lastPaymentAmount: 800,
          totalPaidLast6Months: 5000,
        },
      },
    ],
    pagination: {
      page: 1,
      totalPages: 2,
      total: 35,
      limit: 20,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      pathname: '/admin/payments/overdue',
      query: {},
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
    it('should load and display overdue summary', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverdueData,
      });

      render(<OverdueReport />);

      await waitFor(() => {
        // Summary cards
        expect(screen.getByText('35')).toBeInTheDocument(); // Total customers
        expect(screen.getByText('$75,000')).toBeInTheDocument(); // Total amount
        expect(screen.getByText('22 days')).toBeInTheDocument(); // Average days
        expect(screen.getByText('Dec 1, 2023')).toBeInTheDocument(); // Oldest date
      });

      // Range breakdown
      expect(screen.getByText('1-7 days: 15 customers ($10,000)')).toBeInTheDocument();
      expect(screen.getByText('30+ days: 3 customers ($20,000)')).toBeInTheDocument();
    });

    it('should display customer table', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverdueData,
      });

      render(<OverdueReport />);

      await waitFor(() => {
        // Table headers
        expect(screen.getByText('Customer')).toBeInTheDocument();
        expect(screen.getByText('Overdue Amount')).toBeInTheDocument();
        expect(screen.getByText('Days Overdue')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();

        // Customer data
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('$5,000.00')).toBeInTheDocument();
        expect(screen.getByText('45 days')).toBeInTheDocument();
      });
    });

    it('should show loading state', () => {
      (fetch as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<OverdueReport />);

      expect(screen.getByText('Loading report...')).toBeInTheDocument();
    });

    it('should handle error state', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load overdue report/i)).toBeInTheDocument();
      });
    });
  });

  describe('Filters and Sorting', () => {
    beforeEach(async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockOverdueData,
      });
    });

    it('should filter by overdue range', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const rangeFilter = screen.getByLabelText('Days Overdue');
      await user.selectOptions(rangeFilter, '30+');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('daysOverdue=30'),
          expect.any(Object)
        );
      });
    });

    it('should filter by lock status', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const statusFilter = screen.getByLabelText('Account Status');
      await user.selectOptions(statusFilter, 'locked');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('isLocked=true'),
          expect.any(Object)
        );
      });
    });

    it('should filter by minimum amount', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const amountFilter = screen.getByLabelText('Minimum Amount');
      await user.clear(amountFilter);
      await user.type(amountFilter, '1000');

      // Debounced, so wait a bit
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('minAmount=1000'),
          expect.any(Object)
        );
      }, { timeout: 1000 });
    });

    it('should sort by different columns', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click amount header to sort
      const amountHeader = screen.getByText('Overdue Amount');
      await user.click(amountHeader);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('sortBy=overdueAmount&sortOrder=desc'),
          expect.any(Object)
        );
      });

      // Click again for ascending
      await user.click(amountHeader);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('sortBy=overdueAmount&sortOrder=asc'),
          expect.any(Object)
        );
      });
    });
  });

  describe('Customer Actions', () => {
    beforeEach(async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverdueData,
      });
    });

    it('should show customer details on row expansion', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click expand button
      const johnRow = screen.getByText('John Doe').closest('tr');
      const expandButton = within(johnRow!).getByRole('button', { name: /expand/i });
      await user.click(expandButton);

      // Should show additional details
      expect(screen.getByText('Payment History')).toBeInTheDocument();
      expect(screen.getByText('Last Payment: Nov 15, 2023')).toBeInTheDocument();
      expect(screen.getByText('Amount: $2,000')).toBeInTheDocument();
      expect(screen.getByText('Total Paid (6 months): $15,000')).toBeInTheDocument();
      expect(screen.getByText('Last Contact: Jan 10, 2024')).toBeInTheDocument();
    });

    it('should send payment reminder', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const janeRow = screen.getByText('Jane Smith').closest('tr');
      const reminderButton = within(janeRow!).getByTitle('Send reminder');

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await user.click(reminderButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/cust2/remind',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      expect(screen.getByText(/Reminder sent successfully/i)).toBeInTheDocument();
    });

    it('should lock account', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const janeRow = screen.getByText('Jane Smith').closest('tr');
      const lockButton = within(janeRow!).getByTitle('Lock account');

      await user.click(lockButton);

      // Confirmation dialog
      expect(screen.getByText(/Lock Customer Account/i)).toBeInTheDocument();
      expect(screen.getByText(/Jane Smith.*\$3,500.*30 days/s)).toBeInTheDocument();

      const reasonInput = screen.getByLabelText('Lock Reason');
      await user.type(reasonInput, 'Overdue 30+ days');

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const confirmButton = screen.getByText('Confirm Lock');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/cust2/lock',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ reason: 'Overdue 30+ days' }),
          })
        );
      });
    });

    it('should view customer details', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const johnRow = screen.getByText('John Doe').closest('tr');
      const viewButton = within(johnRow!).getByTitle('View details');

      await user.click(viewButton);

      expect(mockPush).toHaveBeenCalledWith('/admin/customers/cust1');
    });
  });

  describe('Bulk Actions', () => {
    beforeEach(async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOverdueData,
      });
    });

    it('should select all visible customers', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const selectAllCheckbox = screen.getByRole('checkbox', { name: /Select all/i });
      await user.click(selectAllCheckbox);

      // All customer checkboxes should be selected
      const customerCheckboxes = screen.getAllByRole('checkbox').filter(
        (cb) => cb !== selectAllCheckbox
      );
      customerCheckboxes.forEach((checkbox) => {
        expect(checkbox).toBeChecked();
      });

      expect(screen.getByText('3 customers selected')).toBeInTheDocument();
    });

    it('should send bulk reminders', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select specific customers
      const janeRow = screen.getByText('Jane Smith').closest('tr');
      const janeCheckbox = within(janeRow!).getByRole('checkbox');
      await user.click(janeCheckbox);

      const bobRow = screen.getByText('Bob Johnson').closest('tr');
      const bobCheckbox = within(bobRow!).getByRole('checkbox');
      await user.click(bobCheckbox);

      const bulkRemindButton = screen.getByText('Send Reminders (2)');
      await user.click(bulkRemindButton);

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, count: 2 }),
      });

      const confirmButton = screen.getByText('Send to 2 Customers');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/bulk',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              action: 'remind',
              userIds: ['cust2', 'cust3'],
            }),
          })
        );
      });
    });

    it('should bulk lock accounts', async () => {
      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      // Select unlocked customers
      const janeRow = screen.getByText('Jane Smith').closest('tr');
      const janeCheckbox = within(janeRow!).getByRole('checkbox');
      await user.click(janeCheckbox);

      const bulkLockButton = screen.getByText('Lock Accounts (1)');
      await user.click(bulkLockButton);

      const reasonInput = screen.getByLabelText('Lock Reason');
      await user.type(reasonInput, 'Bulk lock - overdue');

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, count: 1 }),
      });

      const confirmButton = screen.getByText('Lock 1 Account');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/bulk',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              action: 'lock',
              userIds: ['cust2'],
              reason: 'Bulk lock - overdue',
            }),
          })
        );
      });
    });
  });

  describe('Export Functionality', () => {
    it('should export report data', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOverdueData,
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: async () => new Blob(['csv data'], { type: 'text/csv' }),
        });

      global.URL.createObjectURL = jest.fn(() => 'blob:url');
      
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export Report');
      await user.click(exportButton);

      // Select format
      const csvOption = screen.getByText('Export as CSV');
      await user.click(csvOption);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/payments/overdue/export?format=csv',
          expect.any(Object)
        );
      });
    });

    it('should export filtered results', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockOverdueData,
      });

      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Apply filter first
      const rangeFilter = screen.getByLabelText('Days Overdue');
      await user.selectOptions(rangeFilter, '30+');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('daysOverdue=30'),
          expect.any(Object)
        );
      });

      // Now export
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['csv data'], { type: 'text/csv' }),
      });

      const exportButton = screen.getByText('Export Report');
      await user.click(exportButton);

      const csvOption = screen.getByText('Export as CSV');
      await user.click(csvOption);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('daysOverdue=30'),
          expect.any(Object)
        );
      });
    });
  });

  describe('Pagination', () => {
    it('should handle pagination', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOverdueData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockOverdueData,
            customers: [
              {
                id: 'cust4',
                email: 'customer4@example.com',
                firstName: 'Alice',
                lastName: 'Brown',
                company: 'Another Corp',
                overdueAmount: 2000,
                daysOverdue: 15,
              },
            ],
            pagination: {
              page: 2,
              totalPages: 2,
              total: 35,
              limit: 20,
            },
          }),
        });

      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Page info
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('Showing 1-3 of 35')).toBeInTheDocument();

      const nextButton = screen.getByText('Next');
      await user.click(nextButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('page=2'),
          expect.any(Object)
        );
        expect(screen.getByText('Alice Brown')).toBeInTheDocument();
      });
    });
  });

  describe('Summary Statistics', () => {
    it('should update summary when filters change', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOverdueData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockOverdueData,
            summary: {
              ...mockOverdueData.summary,
              totalOverdueCustomers: 3,
              totalOverdueAmount: 20000,
            },
          }),
        });

      const user = userEvent.setup();
      render(<OverdueReport />);

      await waitFor(() => {
        expect(screen.getByText('35')).toBeInTheDocument(); // Initial count
      });

      const rangeFilter = screen.getByLabelText('Days Overdue');
      await user.selectOptions(rangeFilter, '30+');

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument(); // Updated count
        expect(screen.getByText('$20,000')).toBeInTheDocument(); // Updated amount
      });
    });
  });
});