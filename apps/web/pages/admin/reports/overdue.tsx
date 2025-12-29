import {
  ArrowLeft,
  Download,
  DollarSign,
  Calendar,
  AlertTriangle,
  Users,
  Mail,
  Lock,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/table';


interface OverdueCustomer {
  id: string;
  name: string;
  accountStatus: string;
  paymentStatus: string;
  overdueAmount: number;
  totalOutstanding: number;
  paymentDueDate: string | null;
  daysOverdue: number;
  lastPaymentDate: string | null;
  _count: {
    skids: number;
  };
  users: Array<{
    email: string;
  }>;
}

interface OverdueStats {
  totalOverdue: number;
  totalAmount: number;
  averageDaysOverdue: number;
  byAgeGroup: {
    '0-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
  byStatus: {
    overdue: number;
    delinquent: number;
    locked: number;
  };
}

export default function OverdueReportPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<OverdueCustomer[]>([]);
  const [stats, setStats] = useState<OverdueStats | null>(null);
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('amount');
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    fetchOverdueData();
  }, []);

  const fetchOverdueData = async () => {
    try {
      const response = await fetch('/api/admin/reports/overdue');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching overdue report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const csv = [
      [
        'Customer Name',
        'Status',
        'Overdue Amount',
        'Total Outstanding',
        'Days Overdue',
        'Due Date',
        'Active Skids',
      ],
      ...filteredCustomers.map(c => [
        c.name,
        c.accountStatus,
        c.overdueAmount.toFixed(2),
        c.totalOutstanding.toFixed(2),
        c.daysOverdue,
        c.paymentDueDate ? new Date(c.paymentDueDate).toLocaleDateString() : '',
        c._count.skids,
      ]),
    ]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overdue-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleSendReminders = async () => {
    setSendingReminders(true);
    try {
      const response = await fetch('/api/admin/reports/send-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerIds: filteredCustomers.map(c => c.id),
        }),
      });

      if (response.ok) {
        alert('Payment reminders sent successfully');
      }
    } catch (error) {
      console.error('Error sending reminders:', error);
    } finally {
      setSendingReminders(false);
    }
  };

  const getAgeGroup = (days: number): string => {
    if (days <= 30) {return '0-30';}
    if (days <= 60) {return '31-60';}
    if (days <= 90) {return '61-90';}
    return '90+';
  };

  const filteredCustomers = customers
    .filter(c => {
      if (ageFilter === 'all') {return true;}
      return getAgeGroup(c.daysOverdue) === ageFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'amount') {return b.overdueAmount - a.overdueAmount;}
      if (sortBy === 'days') {return b.daysOverdue - a.daysOverdue;}
      return a.name.localeCompare(b.name);
    });

  const columns = [
    {
      accessorKey: 'name',
      header: 'Customer',
      cell: ({ row }: any) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-muted-foreground text-sm">
            {row.original.users[0]?.email || 'No email'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'accountStatus',
      header: 'Status',
      cell: ({ row }: any) => (
        <div className="flex items-center space-x-2">
          <Badge
            variant={
              row.original.accountStatus === 'LOCKED'
                ? 'destructive'
                : row.original.paymentStatus === 'DELINQUENT'
                  ? 'warning'
                  : 'default'
            }
          >
            {row.original.accountStatus}
          </Badge>
          {row.original.accountStatus === 'LOCKED' && <Lock className="text-destructive h-3 w-3" />}
        </div>
      ),
    },
    {
      accessorKey: 'overdueAmount',
      header: 'Overdue',
      cell: ({ row }: any) => (
        <div className="text-destructive font-medium">${row.original.overdueAmount.toFixed(2)}</div>
      ),
    },
    {
      accessorKey: 'totalOutstanding',
      header: 'Total Outstanding',
      cell: ({ row }: any) => `$${row.original.totalOutstanding.toFixed(2)}`,
    },
    {
      accessorKey: 'daysOverdue',
      header: 'Days Overdue',
      cell: ({ row }: any) => (
        <div className="flex items-center space-x-2">
          <span
            className={
              row.original.daysOverdue > 60
                ? 'text-destructive font-medium'
                : row.original.daysOverdue > 30
                  ? 'text-warning'
                  : ''
            }
          >
            {row.original.daysOverdue} days
          </span>
          {row.original.daysOverdue > 60 && <AlertTriangle className="text-destructive h-3 w-3" />}
        </div>
      ),
    },
    {
      accessorKey: 'paymentDueDate',
      header: 'Due Date',
      cell: ({ row }: any) =>
        row.original.paymentDueDate
          ? new Date(row.original.paymentDueDate).toLocaleDateString()
          : '-',
    },
    {
      accessorKey: '_count.skids',
      header: 'Active Skids',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => (
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/admin/customers/${row.original.id}`)}
          >
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              /* Send individual reminder */
            }}
          >
            <Mail className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-96 w-full" />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => router.push('/admin/customers')}
              className="mb-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Customers
            </Button>
            <h1 className="text-3xl font-bold">Overdue Accounts Report</h1>
            <p className="text-muted-foreground mt-2">
              Analysis of customers with overdue payments
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={handleSendReminders} disabled={sendingReminders}>
              <Mail className="mr-2 h-4 w-4" />
              {sendingReminders ? 'Sending...' : 'Send Reminders'}
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        {stats && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Overdue</CardTitle>
                  <Users className="text-muted-foreground h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalOverdue}</div>
                  <p className="text-muted-foreground text-xs">Customers with overdue payments</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
                  <DollarSign className="text-muted-foreground h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-destructive text-2xl font-bold">
                    ${stats.totalAmount.toFixed(2)}
                  </div>
                  <p className="text-muted-foreground text-xs">Total overdue amount</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Days</CardTitle>
                  <Calendar className="text-muted-foreground h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{Math.round(stats.averageDaysOverdue)}</div>
                  <p className="text-muted-foreground text-xs">Average days overdue</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Locked Accounts</CardTitle>
                  <Lock className="text-muted-foreground h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <div className="text-destructive text-2xl font-bold">{stats.byStatus.locked}</div>
                  <p className="text-muted-foreground text-xs">Accounts locked for non-payment</p>
                </CardContent>
              </Card>
            </div>

            {/* Age Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Aging Analysis</CardTitle>
                <CardDescription>Distribution of overdue accounts by age</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">0-30 Days</p>
                    <p className="text-2xl font-bold">{stats.byAgeGroup['0-30']}</p>
                    <div
                      className="h-2 rounded bg-yellow-500"
                      style={{ width: `${(stats.byAgeGroup['0-30'] / stats.totalOverdue) * 100}%` }}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">31-60 Days</p>
                    <p className="text-2xl font-bold">{stats.byAgeGroup['31-60']}</p>
                    <div
                      className="h-2 rounded bg-orange-500"
                      style={{
                        width: `${(stats.byAgeGroup['31-60'] / stats.totalOverdue) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">61-90 Days</p>
                    <p className="text-2xl font-bold">{stats.byAgeGroup['61-90']}</p>
                    <div
                      className="h-2 rounded bg-red-500"
                      style={{
                        width: `${(stats.byAgeGroup['61-90'] / stats.totalOverdue) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">90+ Days</p>
                    <p className="text-2xl font-bold">{stats.byAgeGroup['90+']}</p>
                    <div
                      className="h-2 rounded bg-red-700"
                      style={{ width: `${(stats.byAgeGroup['90+'] / stats.totalOverdue) * 100}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Detailed List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Overdue Customers</CardTitle>
                <CardDescription>Detailed list of customers with overdue payments</CardDescription>
              </div>
              <div className="flex space-x-2">
                <Select value={ageFilter} onValueChange={setAgeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by age" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ages</SelectItem>
                    <SelectItem value="0-30">0-30 Days</SelectItem>
                    <SelectItem value="31-60">31-60 Days</SelectItem>
                    <SelectItem value="61-90">61-90 Days</SelectItem>
                    <SelectItem value="90+">90+ Days</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">Amount (High to Low)</SelectItem>
                    <SelectItem value="days">Days Overdue</SelectItem>
                    <SelectItem value="name">Customer Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={filteredCustomers} searchKey="name" />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
