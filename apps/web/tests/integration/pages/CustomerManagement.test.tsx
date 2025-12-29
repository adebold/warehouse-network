
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

import CustomerManagement from '../../../pages/admin/customers';

// Mock dependencies
jest.mock('next-auth/react');
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('Customer Management Page', () => {
  const mockPush = jest.fn();
  const adminSession = {
    user: {
      id: 'admin123',
      email: 'admin@example.com',
      role: 'ADMIN',
    },
  };

  const mockCustomers = [
    {
      id: 'cust1',
      email: 'customer1@example.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'ACME Corp',
      isLocked: false,
      overdueAmount: 0,
      daysOverdue: 0,
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'cust2',
      email: 'customer2@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      company: 'Tech Inc',
      isLocked: true,
      lockReason: 'Overdue payment',
      lockedAt: '2024-01-15T00:00:00Z',
      overdueAmount: 500,
      daysOverdue: 30,
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'cust3',
      email: 'customer3@example.com',
      firstName: 'Bob',
      lastName: 'Johnson',
      company: 'Startup LLC',
      isLocked: false,
      overdueAmount: 100,
      daysOverdue: 7,
      createdAt: '2024-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      pathname: '/admin/customers',
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
    it('should load and display customers', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          customers: mockCustomers,
          total: 3,
          page: 1,
          totalPages: 1,
        }),
      });

      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      });

      // Check status badges
      expect(screen.getByText('Active').closest('.badge')).toHaveClass('badge-success');
      expect(screen.getByText('Locked').closest('.badge')).toHaveClass('badge-error');
    });

    it('should show loading state', () => {
      (fetch as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<CustomerManagement />);

      expect(screen.getByText('Loading customers...')).toBeInTheDocument();
    });

    it('should handle error state', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load customers/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filters', () => {
    beforeEach(async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          customers: mockCustomers,
          total: 3,
          page: 1,
          totalPages: 1,
        }),
      });
    });

    it('should filter customers by search term', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search by name, email, or company/i);
      await user.type(searchInput, 'Jane');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('search=Jane'),
          expect.any(Object)
        );
      });
    });

    it('should filter by account status', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const statusFilter = screen.getByLabelText(/Status/i);
      await user.selectOptions(statusFilter, 'locked');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('status=locked'),
          expect.any(Object)
        );
      });
    });

    it('should filter by overdue status', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const overdueFilter = screen.getByLabelText(/Overdue Status/i);
      await user.selectOptions(overdueFilter, 'overdue');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('overdue=true'),
          expect.any(Object)
        );
      });
    });

    it('should clear filters', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Apply some filters
      const searchInput = screen.getByPlaceholderText(/Search/i);
      await user.type(searchInput, 'test');

      const clearButton = screen.getByText(/Clear Filters/i);
      await user.click(clearButton);

      expect(searchInput).toHaveValue('');
    });
  });

  describe('Individual Customer Actions', () => {
    beforeEach(async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          customers: mockCustomers,
          total: 3,
          page: 1,
          totalPages: 1,
        }),
      });
    });

    it('should lock an unlocked account', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Find the lock button for John Doe (first customer)
      const johnRow = screen.getByText('John Doe').closest('tr');
      const lockButton = within(johnRow!).getByTitle('Lock account');

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await user.click(lockButton);

      // Should show confirmation dialog
      expect(screen.getByText(/Are you sure you want to lock this account/i)).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/Lock Reason/i);
      await user.type(reasonInput, 'Test lock reason');

      const confirmButton = screen.getByText(/Confirm Lock/i);
      await user.click(confirmButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/cust1/lock',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ reason: 'Test lock reason' }),
          })
        );
      });
    });

    it('should unlock a locked account', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      // Find the unlock button for Jane Smith (locked customer)
      const janeRow = screen.getByText('Jane Smith').closest('tr');
      const unlockButton = within(janeRow!).getByTitle('Unlock account');

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await user.click(unlockButton);

      // Should show confirmation dialog
      expect(screen.getByText(/Are you sure you want to unlock this account/i)).toBeInTheDocument();

      const confirmButton = screen.getByText(/Confirm Unlock/i);
      await user.click(confirmButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/cust2/lock',
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });

    it('should send payment reminder', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      });

      // Find the reminder button for Bob Johnson (has overdue amount)
      const bobRow = screen.getByText('Bob Johnson').closest('tr');
      const reminderButton = within(bobRow!).getByTitle('Send payment reminder');

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await user.click(reminderButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/cust3/remind',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      // Should show success message
      expect(screen.getByText(/Payment reminder sent successfully/i)).toBeInTheDocument();
    });

    it('should navigate to customer details', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

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
        json: async () => ({
          customers: mockCustomers,
          total: 3,
          page: 1,
          totalPages: 1,
        }),
      });
    });

    it('should select multiple customers', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select all checkbox
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /Select all/i });
      await user.click(selectAllCheckbox);

      // All customer checkboxes should be selected
      const customerCheckboxes = screen
        .getAllByRole('checkbox')
        .filter(cb => cb !== selectAllCheckbox);
      customerCheckboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });

      // Bulk actions should be enabled
      expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
    });

    it('should perform bulk lock', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select unlocked customers
      const johnRow = screen.getByText('John Doe').closest('tr');
      const johnCheckbox = within(johnRow!).getByRole('checkbox');
      await user.click(johnCheckbox);

      const bobRow = screen.getByText('Bob Johnson').closest('tr');
      const bobCheckbox = within(bobRow!).getByRole('checkbox');
      await user.click(bobCheckbox);

      // Click bulk lock
      const bulkLockButton = screen.getByText(/Lock Selected/i);
      await user.click(bulkLockButton);

      // Enter reason
      const reasonInput = screen.getByLabelText(/Lock Reason/i);
      await user.type(reasonInput, 'Bulk lock test');

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, count: 2 }),
      });

      const confirmButton = screen.getByText(/Confirm Bulk Lock/i);
      await user.click(confirmButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/bulk',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              action: 'lock',
              userIds: ['cust1', 'cust3'],
              reason: 'Bulk lock test',
            }),
          })
        );
      });
    });

    it('should perform bulk unlock', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      // Select locked customer
      const janeRow = screen.getByText('Jane Smith').closest('tr');
      const janeCheckbox = within(janeRow!).getByRole('checkbox');
      await user.click(janeCheckbox);

      // Click bulk unlock
      const bulkUnlockButton = screen.getByText(/Unlock Selected/i);
      await user.click(bulkUnlockButton);

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, count: 1 }),
      });

      const confirmButton = screen.getByText(/Confirm Bulk Unlock/i);
      await user.click(confirmButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/customers/bulk',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              action: 'unlock',
              userIds: ['cust2'],
            }),
          })
        );
      });
    });

    it('should send bulk reminders', async () => {
      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      });

      // Select customers with overdue amounts
      const janeRow = screen.getByText('Jane Smith').closest('tr');
      const janeCheckbox = within(janeRow!).getByRole('checkbox');
      await user.click(janeCheckbox);

      const bobRow = screen.getByText('Bob Johnson').closest('tr');
      const bobCheckbox = within(bobRow!).getByRole('checkbox');
      await user.click(bobCheckbox);

      // Click send reminders
      const bulkRemindButton = screen.getByText(/Send Reminders/i);
      await user.click(bulkRemindButton);

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, count: 2 }),
      });

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
  });

  describe('Sorting and Pagination', () => {
    it('should sort by different columns', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          customers: mockCustomers,
          total: 3,
          page: 1,
          totalPages: 1,
        }),
      });

      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click on Name header to sort
      const nameHeader = screen.getByText('Name').closest('th');
      await user.click(nameHeader!);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('sortBy=firstName&sortOrder=asc'),
          expect.any(Object)
        );
      });

      // Click again for descending
      await user.click(nameHeader!);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('sortBy=firstName&sortOrder=desc'),
          expect.any(Object)
        );
      });
    });

    it('should handle pagination', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          customers: mockCustomers,
          total: 30,
          page: 1,
          totalPages: 3,
        }),
      });

      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click next page
      const nextButton = screen.getByText(/Next/i);
      await user.click(nextButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
      });
    });
  });

  describe('Export functionality', () => {
    it('should export customer data', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          customers: mockCustomers,
          total: 3,
          page: 1,
          totalPages: 1,
        }),
      });

      // Mock blob response for export
      const mockBlob = new Blob(['csv data'], { type: 'text/csv' });
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob,
      });

      // Mock URL.createObjectURL
      global.URL.createObjectURL = jest.fn(() => 'blob:url');

      const user = userEvent.setup();
      render(<CustomerManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const exportButton = screen.getByText(/Export/i);
      await user.click(exportButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/admin/customers/export', expect.any(Object));
      });
    });
  });
});
