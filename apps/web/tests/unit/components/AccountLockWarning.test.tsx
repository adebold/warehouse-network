import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import AccountLockWarning from '../../../components/AccountLockWarning';

// Mock dependencies
jest.mock('next-auth/react');
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('AccountLockWarning', () => {
  const mockPush = jest.fn();
  const mockSession = {
    user: {
      id: 'user123',
      email: 'user@example.com',
      role: 'CUSTOMER',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      pathname: '/app/dashboard',
    });
    (useSession as jest.Mock).mockReturnValue({
      data: mockSession,
      status: 'authenticated',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Display conditions', () => {
    it('should not render if user is not authenticated', () => {
      (useSession as jest.Mock).mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });

      const { container } = render(<AccountLockWarning />);
      expect(container.firstChild).toBeNull();
    });

    it('should not render for admin users', () => {
      (useSession as jest.Mock).mockReturnValue({
        data: {
          user: { ...mockSession.user, role: 'ADMIN' },
        },
        status: 'authenticated',
      });

      const { container } = render(<AccountLockWarning />);
      expect(container.firstChild).toBeNull();
    });

    it('should render for locked customer accounts', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          isLocked: true,
          lockReason: 'Overdue payment',
          lockedAt: new Date().toISOString(),
          daysOverdue: 15,
          overdueAmount: 500.75,
        }),
      });

      render(<AccountLockWarning />);

      await waitFor(() => {
        expect(screen.getByText(/Account Access Restricted/i)).toBeInTheDocument();
        expect(screen.getByText(/Overdue payment/i)).toBeInTheDocument();
        expect(screen.getByText(/\$500.75/i)).toBeInTheDocument();
        expect(screen.getByText(/15 days overdue/i)).toBeInTheDocument();
      });
    });

    it('should not render for unlocked accounts', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          isLocked: false,
        }),
      });

      const { container } = render(<AccountLockWarning />);

      await waitFor(() => {
        expect(container.querySelector('.alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Payment modal', () => {
    beforeEach(async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          isLocked: true,
          lockReason: 'Overdue payment',
          overdueAmount: 250.5,
        }),
      });
    });

    it('should open payment modal when make payment is clicked', async () => {
      render(<AccountLockWarning />);

      await waitFor(() => {
        const payButton = screen.getByText(/Make Payment/i);
        fireEvent.click(payButton);
      });

      expect(screen.getByText(/Payment Required/i)).toBeInTheDocument();
      expect(screen.getByText(/Amount Due: \$250.50/i)).toBeInTheDocument();
    });

    it('should handle successful payment submission', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            isLocked: true,
            lockReason: 'Overdue payment',
            overdueAmount: 250.5,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            message: 'Payment processed successfully',
          }),
        });

      render(<AccountLockWarning />);

      await waitFor(() => {
        fireEvent.click(screen.getByText(/Make Payment/i));
      });

      const submitButton = screen.getByText(/Submit Payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Payment processed successfully/i)).toBeInTheDocument();
      });

      // Should refresh the page after successful payment
      expect(mockPush).toHaveBeenCalledWith('/app/dashboard');
    });

    it('should handle payment submission errors', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            isLocked: true,
            overdueAmount: 250.5,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: 'Payment processing failed',
          }),
        });

      render(<AccountLockWarning />);

      await waitFor(() => {
        fireEvent.click(screen.getByText(/Make Payment/i));
      });

      const submitButton = screen.getByText(/Submit Payment/i);
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Payment processing failed/i)).toBeInTheDocument();
      });
    });

    it('should close modal when cancel is clicked', async () => {
      render(<AccountLockWarning />);

      await waitFor(() => {
        fireEvent.click(screen.getByText(/Make Payment/i));
      });

      const cancelButton = screen.getByText(/Cancel/i);
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/Payment Required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Contact support', () => {
    it('should show contact information when clicked', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          isLocked: true,
          lockReason: 'Suspicious activity',
        }),
      });

      render(<AccountLockWarning />);

      await waitFor(() => {
        const contactButton = screen.getByText(/Contact Support/i);
        fireEvent.click(contactButton);
      });

      expect(screen.getByText(/support@warehouse-network.com/i)).toBeInTheDocument();
      expect(screen.getByText(/1-800-WAREHOUSE/i)).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('should handle API fetch errors gracefully', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { container } = render(<AccountLockWarning />);

      await waitFor(() => {
        expect(container.querySelector('.alert')).not.toBeInTheDocument();
      });
    });

    it('should handle non-OK API responses', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { container } = render(<AccountLockWarning />);

      await waitFor(() => {
        expect(container.querySelector('.alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Auto-refresh', () => {
    jest.useFakeTimers();

    it('should refresh lock status periodically', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            isLocked: true,
            lockReason: 'Overdue payment',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            isLocked: false,
          }),
        });

      render(<AccountLockWarning />);

      await waitFor(() => {
        expect(screen.getByText(/Account Access Restricted/i)).toBeInTheDocument();
      });

      // Fast-forward 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      await waitFor(() => {
        expect(screen.queryByText(/Account Access Restricted/i)).not.toBeInTheDocument();
      });
    });

    jest.useRealTimers();
  });
});
