import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { AppLayout } from '@/components/layouts/AppLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AccountLockWarning } from '@/components/ui/account-lock-warning';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DollarSign,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  Download,
  TrendingUp,
  Lock,
  XCircle,
} from 'lucide-react';

interface PaymentData {
  customer: {
    id: string;
    name: string;
    accountStatus: string;
    paymentStatus: string;
    lockReason?: string;
    overdueAmount: number;
    totalOutstanding: number;
    paymentDueDate?: string;
  };
  recentPayments: Array<{
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    reference: string;
    status: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    status: 'PAID' | 'PENDING' | 'OVERDUE';
    createdAt: string;
  }>;
}

export default function PaymentDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CREDIT_CARD');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    if (session?.user?.customerId) {
      fetchPaymentData();
    }
  }, [session]);

  const fetchPaymentData = async () => {
    try {
      const response = await fetch('/api/customer/payment-dashboard');
      if (response.ok) {
        const data = await response.json();
        setPaymentData(data);
      }
    } catch (error) {
      console.error('Error fetching payment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMakePayment = async () => {
    setProcessingPayment(true);
    try {
      const response = await fetch('/api/customer/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          paymentMethod,
          customerId: session?.user?.customerId,
        }),
      });

      if (response.ok) {
        setShowPaymentDialog(false);
        setPaymentAmount('');
        fetchPaymentData();
        alert('Payment processed successfully!');
      } else {
        alert('Payment processing failed. Please try again.');
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge variant="success">Paid</Badge>;
      case 'PENDING':
        return <Badge variant="warning">Pending</Badge>;
      case 'OVERDUE':
        return <Badge variant="destructive">Overdue</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const invoiceColumns = [
    {
      accessorKey: 'invoiceNumber',
      header: 'Invoice #',
      cell: ({ row }: any) => <span className="font-medium">{row.original.invoiceNumber}</span>,
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }: any) => `$${row.original.amount.toFixed(2)}`,
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }: any) => new Date(row.original.dueDate).toLocaleDateString(),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => getPaymentStatusBadge(row.original.status),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => (
        <Button size="sm" variant="outline">
          <FileText className="mr-2 h-3 w-3" />
          View
        </Button>
      ),
    },
  ];

  const paymentColumns = [
    {
      accessorKey: 'paymentDate',
      header: 'Date',
      cell: ({ row }: any) => new Date(row.original.paymentDate).toLocaleDateString(),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }: any) => (
        <span className="text-success font-medium">${row.original.amount.toFixed(2)}</span>
      ),
    },
    {
      accessorKey: 'paymentMethod',
      header: 'Method',
      cell: ({ row }: any) => row.original.paymentMethod.replace('_', ' '),
    },
    {
      accessorKey: 'reference',
      header: 'Reference',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => (
        <Badge variant="success">
          <CheckCircle className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      ),
    },
  ];

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!paymentData) {
    return (
      <AppLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load payment information</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  const { customer, invoices, recentPayments } = paymentData;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payment Center</h1>
            <p className="text-muted-foreground mt-2">
              Manage your payments and view account status
            </p>
          </div>
          <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
            <DialogTrigger asChild>
              <Button disabled={customer.accountStatus === 'LOCKED'}>
                <DollarSign className="mr-2 h-4 w-4" />
                Make Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Make a Payment</DialogTitle>
                <DialogDescription>
                  Enter the amount you wish to pay toward your outstanding balance
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Outstanding Balance</Label>
                  <p className="text-2xl font-bold">${customer.totalOutstanding.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Payment Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="method">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                      <SelectItem value="ACH">ACH Transfer</SelectItem>
                      <SelectItem value="WIRE">Wire Transfer</SelectItem>
                      <SelectItem value="CHECK">Check</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleMakePayment}
                  disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || processingPayment}
                >
                  {processingPayment ? 'Processing...' : 'Process Payment'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Account Status Warning */}
        {customer.accountStatus !== 'ACTIVE' && (
          <AccountLockWarning
            customer={customer}
            operation="make payments"
            showManageButton={false}
          />
        )}

        {/* Payment Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className={customer.totalOutstanding > 0 ? 'border-destructive' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
              <DollarSign className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${customer.totalOutstanding > 0 ? 'text-destructive' : 'text-success'}`}
              >
                ${customer.totalOutstanding.toFixed(2)}
              </div>
              {customer.totalOutstanding === 0 ? (
                <p className="text-success mt-1 flex items-center text-xs">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Account current
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {customer.overdueAmount > 0 && `$${customer.overdueAmount.toFixed(2)} overdue`}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Payment Status</CardTitle>
              {customer.paymentStatus === 'CURRENT' ? (
                <CheckCircle className="text-success h-4 w-4" />
              ) : customer.paymentStatus === 'OVERDUE' ? (
                <Clock className="text-warning h-4 w-4" />
              ) : (
                <XCircle className="text-destructive h-4 w-4" />
              )}
            </CardHeader>
            <CardContent>
              <Badge
                variant={
                  customer.paymentStatus === 'CURRENT'
                    ? 'success'
                    : customer.paymentStatus === 'OVERDUE'
                      ? 'warning'
                      : 'destructive'
                }
                className="text-sm"
              >
                {customer.paymentStatus}
              </Badge>
              {customer.paymentDueDate && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Due: {new Date(customer.paymentDueDate).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Account Status</CardTitle>
              {customer.accountStatus === 'LOCKED' && <Lock className="text-destructive h-4 w-4" />}
            </CardHeader>
            <CardContent>
              <Badge
                variant={
                  customer.accountStatus === 'ACTIVE'
                    ? 'success'
                    : customer.accountStatus === 'SUSPENDED'
                      ? 'warning'
                      : 'destructive'
                }
                className="text-sm"
              >
                {customer.accountStatus}
              </Badge>
              {customer.lockReason && (
                <p className="text-muted-foreground mt-1 text-xs">{customer.lockReason}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Invoices */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Invoices</CardTitle>
                <CardDescription>Your recent billing statements</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {invoices.length > 0 ? (
              <DataTable columns={invoiceColumns} data={invoices} searchKey="invoiceNumber" />
            ) : (
              <div className="py-8 text-center">
                <FileText className="text-muted-foreground mx-auto h-12 w-12" />
                <p className="text-muted-foreground mt-4 text-sm">No invoices found</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>Your recent payment transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPayments.length > 0 ? (
              <DataTable columns={paymentColumns} data={recentPayments} searchKey="reference" />
            ) : (
              <div className="py-8 text-center">
                <CreditCard className="text-muted-foreground mx-auto h-12 w-12" />
                <p className="text-muted-foreground mt-4 text-sm">No payment history found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
