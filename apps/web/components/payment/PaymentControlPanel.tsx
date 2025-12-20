import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PaymentStatusBadge, AccountStatusIndicator } from './PaymentStatusBadge';
import { CustomerAccountStatus, CustomerPaymentStatus } from '@prisma/client';
import { useSession } from 'next-auth/react';

interface PaymentControlPanelProps {
  customer: {
    id: string;
    name: string;
    accountStatus: CustomerAccountStatus;
    paymentStatus: CustomerPaymentStatus;
    lockReason?: string | null;
    lockedAt?: string | null;
    overdueAmount: number;
    totalOutstanding: number;
    paymentDueDate?: string | null;
    lockHistory?: any[];
  };
  onUpdate: () => void;
}

export function PaymentControlPanel({ customer, onUpdate }: PaymentControlPanelProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogAction, setDialogAction] = useState<'lock' | 'unlock' | null>(null);
  const [reason, setReason] = useState('');
  const [paymentData, setPaymentData] = useState({
    paymentStatus: customer.paymentStatus,
    overdueAmount: customer.overdueAmount,
    totalOutstanding: customer.totalOutstanding,
    paymentDueDate: customer.paymentDueDate || '',
  });

  const canManagePayments = ['SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATOR_ADMIN', 'WAREHOUSE_STAFF'].includes(
    session?.user?.role || ''
  );

  const canOverride = ['SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATOR_ADMIN'].includes(
    session?.user?.role || ''
  );

  const handleAction = async (action: 'lock' | 'unlock') => {
    setDialogAction(action);
    setShowDialog(true);
  };

  const confirmAction = async () => {
    if (!reason) {
      alert('Please provide a reason');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}/payment-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: dialogAction,
          reason,
        }),
      });

      if (response.ok) {
        onUpdate();
        setShowDialog(false);
        setReason('');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update account status');
      }
    } catch (error) {
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updatePaymentInfo = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}/payment-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updatePayment',
          updatePaymentInfo: paymentData,
        }),
      });

      if (response.ok) {
        onUpdate();
        alert('Payment information updated successfully');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update payment information');
      }
    } catch (error) {
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!canManagePayments) {
    return null;
  }

  return (
    <>
      <Card className="p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Payment Control</h3>
          
          <div className="space-y-4">
            {/* Current Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Account Status</span>
              <PaymentStatusBadge 
                accountStatus={customer.accountStatus} 
                paymentStatus={customer.paymentStatus} 
              />
            </div>

            {/* Warning/Error Messages */}
            <AccountStatusIndicator
              accountStatus={customer.accountStatus}
              paymentStatus={customer.paymentStatus}
              overdueAmount={customer.overdueAmount}
              lockReason={customer.lockReason}
            />

            {/* Payment Information */}
            <div className="space-y-3 pt-4 border-t">
              <div>
                <Label htmlFor="paymentStatus">Payment Status</Label>
                <Select
                  id="paymentStatus"
                  value={paymentData.paymentStatus}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPaymentData({ ...paymentData, paymentStatus: e.target.value as CustomerPaymentStatus })}
                  disabled={!canOverride || loading}
                  className="mt-1"
                >
                  <option value="CURRENT">Current</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="DELINQUENT">Delinquent</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="overdueAmount">Overdue Amount</Label>
                <Input
                  id="overdueAmount"
                  type="number"
                  step="0.01"
                  value={paymentData.overdueAmount}
                  onChange={(e) => setPaymentData({ ...paymentData, overdueAmount: parseFloat(e.target.value) || 0 })}
                  disabled={!canOverride || loading}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="totalOutstanding">Total Outstanding</Label>
                <Input
                  id="totalOutstanding"
                  type="number"
                  step="0.01"
                  value={paymentData.totalOutstanding}
                  onChange={(e) => setPaymentData({ ...paymentData, totalOutstanding: parseFloat(e.target.value) || 0 })}
                  disabled={!canOverride || loading}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="paymentDueDate">Payment Due Date</Label>
                <Input
                  id="paymentDueDate"
                  type="date"
                  value={paymentData.paymentDueDate}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentDueDate: e.target.value })}
                  disabled={!canOverride || loading}
                  className="mt-1"
                />
              </div>

              {canOverride && (
                <Button
                  onClick={updatePaymentInfo}
                  disabled={loading}
                  className="w-full"
                >
                  Update Payment Information
                </Button>
              )}
            </div>

            {/* Lock/Unlock Actions */}
            <div className="flex gap-2 pt-4 border-t">
              {customer.accountStatus === 'LOCKED' ? (
                <Button
                  variant="success"
                  onClick={() => handleAction('unlock')}
                  disabled={loading || !canOverride}
                  className="flex-1"
                >
                  Unlock Account
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => handleAction('lock')}
                  disabled={loading}
                  className="flex-1"
                >
                  Lock Account
                </Button>
              )}
            </div>

            {/* Lock History */}
            {customer.lockHistory && customer.lockHistory.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Recent Actions</h4>
                <div className="space-y-2">
                  {customer.lockHistory.slice(0, 5).map((history: any) => (
                    <div key={history.id} className="text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>{history.action}</span>
                        <span>{new Date(history.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div className="italic">{history.reason}</div>
                      <div>By: {history.performedBy?.name || history.performedBy?.email}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === 'lock' ? 'Lock Customer Account' : 'Unlock Customer Account'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="reason">Reason</Label>
              <textarea
                id="reason"
                className="w-full mt-1 p-2 border rounded-md"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`Please provide a reason for ${dialogAction === 'lock' ? 'locking' : 'unlocking'} this account...`}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant={dialogAction === 'lock' ? 'destructive' : 'success'}
                onClick={confirmAction}
                disabled={loading || !reason}
                className="flex-1"
              >
                Confirm {dialogAction === 'lock' ? 'Lock' : 'Unlock'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}