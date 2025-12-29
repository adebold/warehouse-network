
import { formatDistanceToNow } from 'date-fns';
import {
import { logger } from './utils/logger';
  ArrowLeft,
  Lock,
  Unlock,
  AlertTriangle,
  History,
  Ban,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';


interface CustomerDetail {
  id: string;
  name: string;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  paymentStatus: 'CURRENT' | 'OVERDUE' | 'DELINQUENT';
  lockReason?: string;
  lockedAt?: string;
  lockedBy?: string;
  paymentDueDate?: string;
  overdueAmount: number;
  totalOutstanding: number;
  createdAt: string;
  updatedAt: string;
  _count: {
    skids: number;
    rfqs: number;
    disputes: number;
    deposits: number;
    releaseRequests: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
  lockHistory: Array<{
    id: string;
    action: 'LOCKED' | 'UNLOCKED';
    reason?: string;
    overrideReason?: string;
    timestamp: string;
    performedBy: {
      name: string;
      email: string;
    };
  }>;
  activeSkids?: Array<{
    id: string;
    trackingNumber: string;
    status: string;
    weight: number;
    createdAt: string;
  }>;
}

export default function CustomerDetailPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { id } = router.query;
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCustomerDetail();
    }
  }, [id]);

  const fetchCustomerDetail = async () => {
    try {
      const response = await fetch(`/api/admin/customers/${id}`);
      if (response.ok) {
        const data = await response.json();
        setCustomer(data);
      }
    } catch (error) {
      logger.error('Error fetching customer detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLockUnlock = async () => {
    if (!customer) {return;}

    setActionLoading(true);
    try {
      const action = customer.accountStatus === 'LOCKED' ? 'unlock' : 'lock';
      const response = await fetch(`/api/admin/customers/${id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: lockReason || undefined,
          overrideReason: overrideReason || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.warnings && (data.warnings.pendingReleases > 0 || data.warnings.activeSkids > 0)) {
          alert(
            `Warning: This customer has ${data.warnings.activeSkids} active skids and ${data.warnings.pendingReleases} pending release requests.`
          );
        }
        fetchCustomerDetail();
        setShowLockDialog(false);
        setLockReason('');
        setOverrideReason('');
      }
    } catch (error) {
      logger.error('Error updating account lock:', error);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!customer) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Customer not found</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.push('/admin/customers')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Customers
            </Button>
            <h1 className="text-3xl font-bold">{customer.name}</h1>
            {customer.accountStatus === 'LOCKED' && (
              <Badge variant="destructive" className="ml-2">
                <Lock className="mr-1 h-3 w-3" />
                LOCKED
              </Badge>
            )}
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={() => router.push(`/admin/customers/${id}/history`)}>
              <History className="mr-2 h-4 w-4" />
              Lock History
            </Button>
            <Dialog open={showLockDialog} onOpenChange={setShowLockDialog}>
              <DialogTrigger asChild>
                <Button variant={customer.accountStatus === 'LOCKED' ? 'default' : 'destructive'}>
                  {customer.accountStatus === 'LOCKED' ? (
                    <>
                      <Unlock className="mr-2 h-4 w-4" />
                      Unlock Account
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Lock Account
                    </>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {customer.accountStatus === 'LOCKED' ? 'Unlock' : 'Lock'} Customer Account
                  </DialogTitle>
                  <DialogDescription>
                    {customer.accountStatus === 'LOCKED'
                      ? 'Unlocking this account will allow the customer to receive new inventory and release existing skids.'
                      : 'Locking this account will prevent the customer from receiving new inventory or releasing existing skids.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="reason">
                      {customer.accountStatus === 'LOCKED' ? 'Unlock Reason' : 'Lock Reason'}
                    </Label>
                    <Input
                      id="reason"
                      value={lockReason}
                      onChange={e => setLockReason(e.target.value)}
                      placeholder={
                        customer.accountStatus === 'LOCKED'
                          ? 'e.g., Payment received, Issue resolved'
                          : 'e.g., Late payment, Policy violation'
                      }
                    />
                  </div>
                  {session?.user.role === 'admin' && (
                    <div className="space-y-2">
                      <Label htmlFor="override">Override Reason (Optional)</Label>
                      <Input
                        id="override"
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        placeholder="Administrative override reason"
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowLockDialog(false)}
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={customer.accountStatus === 'LOCKED' ? 'default' : 'destructive'}
                    onClick={handleLockUnlock}
                    disabled={actionLoading || !lockReason}
                  >
                    {actionLoading ? 'Processing...' : 'Confirm'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Warning Alert for Locked Accounts */}
        {customer.accountStatus === 'LOCKED' && (
          <Alert variant="destructive">
            <Ban className="h-4 w-4" />
            <AlertTitle>Account Locked</AlertTitle>
            <AlertDescription>
              This account was locked on {new Date(customer.lockedAt!).toLocaleDateString()}
              {customer.lockReason && ` due to: ${customer.lockReason}`}. The customer cannot
              receive new inventory or release existing skids until the account is unlocked.
            </AlertDescription>
          </Alert>
        )}

        {/* Account Overview */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Account Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      customer.accountStatus === 'ACTIVE'
                        ? 'success'
                        : customer.accountStatus === 'SUSPENDED'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {customer.accountStatus}
                  </Badge>
                </div>
                {customer.lockedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Locked</span>
                    <span className="text-sm">
                      {formatDistanceToNow(new Date(customer.lockedAt))} ago
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Payment Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      customer.paymentStatus === 'CURRENT'
                        ? 'success'
                        : customer.paymentStatus === 'OVERDUE'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {customer.paymentStatus}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Outstanding</span>
                  <span
                    className={`font-medium ${customer.totalOutstanding > 0 ? 'text-destructive' : ''}`}
                  >
                    ${customer.totalOutstanding.toFixed(2)}
                  </span>
                </div>
                {customer.paymentDueDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="text-sm">
                      {new Date(customer.paymentDueDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Activity Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Active Skids</span>
                  <span className="font-medium">{customer._count.skids}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Open RFQs</span>
                  <span className="font-medium">{customer._count.rfqs}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Disputes</span>
                  <span className="font-medium">{customer._count.disputes}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Lock History */}
        {customer.lockHistory && customer.lockHistory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Lock History</CardTitle>
              <CardDescription>
                Recent changes to this customer&apos;s account lock status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {customer.lockHistory.slice(0, 5).map(entry => (
                  <div key={entry.id} className="flex items-start space-x-4">
                    <div
                      className={`mt-1 rounded-full p-1 ${
                        entry.action === 'LOCKED' ? 'bg-destructive/10' : 'bg-success/10'
                      }`}
                    >
                      {entry.action === 'LOCKED' ? (
                        <Lock
                          className={`h-4 w-4 ${
                            entry.action === 'LOCKED' ? 'text-destructive' : 'text-success'
                          }`}
                        />
                      ) : (
                        <Unlock className="text-success h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">
                        Account {entry.action.toLowerCase()} by {entry.performedBy.name}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {entry.reason || 'No reason provided'}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(entry.timestamp))} ago
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push(`/admin/customers/${id}/history`)}
              >
                View Full History
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
