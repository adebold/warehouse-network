import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CustomerAccountStatus, CustomerPaymentStatus } from '@prisma/client';

interface PaymentStatusBadgeProps {
  accountStatus: CustomerAccountStatus;
  paymentStatus: CustomerPaymentStatus;
}

export function PaymentStatusBadge({ accountStatus, paymentStatus }: PaymentStatusBadgeProps) {
  // Account status takes precedence
  if (accountStatus === 'LOCKED') {
    return <Badge variant="destructive">Account Locked</Badge>;
  }

  if (accountStatus === 'SUSPENDED') {
    return <Badge variant="warning">Account Suspended</Badge>;
  }

  // Show payment status
  switch (paymentStatus) {
    case 'CURRENT':
      return <Badge variant="success">Current</Badge>;
    case 'OVERDUE':
      return <Badge variant="warning">Overdue</Badge>;
    case 'DELINQUENT':
      return <Badge variant="destructive">Delinquent</Badge>;
    default:
      return <Badge variant="secondary">Unknown</Badge>;
  }
}

export function AccountStatusIndicator({
  accountStatus,
  paymentStatus,
  overdueAmount,
  lockReason,
}: {
  accountStatus: CustomerAccountStatus;
  paymentStatus: CustomerPaymentStatus;
  overdueAmount?: number;
  lockReason?: string | null;
}) {
  if (accountStatus === 'LOCKED') {
    return (
      <div className="border-destructive bg-destructive/10 rounded-lg border p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="text-destructive h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-destructive text-sm font-medium">Account Locked</h3>
            <div className="text-destructive/90 mt-2 text-sm">
              {lockReason || 'This account has been locked due to payment issues.'}
            </div>
            {overdueAmount && overdueAmount > 0 && (
              <div className="text-destructive mt-2 text-sm font-medium">
                Overdue Amount: ${overdueAmount.toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (accountStatus === 'SUSPENDED') {
    return (
      <div className="border-warning bg-warning/10 rounded-lg border p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="text-warning h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-warning text-sm font-medium">Account Suspended</h3>
            <div className="text-warning/90 mt-2 text-sm">
              This account has limited functionality. Please contact support.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (paymentStatus === 'OVERDUE' || paymentStatus === 'DELINQUENT') {
    return (
      <div className="border-warning bg-warning/10 rounded-lg border p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="text-warning h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-warning text-sm font-medium">
              Payment {paymentStatus === 'OVERDUE' ? 'Overdue' : 'Delinquent'}
            </h3>
            <div className="text-warning/90 mt-2 text-sm">
              Please update your payment to avoid service interruption.
            </div>
            {overdueAmount && overdueAmount > 0 && (
              <div className="text-warning mt-2 text-sm font-medium">
                Amount Due: ${overdueAmount.toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
