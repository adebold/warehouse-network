import type { NextPage, GetServerSideProps } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { Skid, Customer } from '@prisma/client';
import prisma from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]';
import { AppLayout } from '@/components/layouts/AppLayout';
import { DataTable } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountLockWarning } from '@/components/ui/account-lock-warning';
import { Package, Search, Filter, Download, Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface InventoryProps {
  skids: (Skid & { location: { name: string } | null })[];
  customer: Customer | null;
}

const Inventory: NextPage<InventoryProps> = ({ skids: initialSkids, customer }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [skids, setSkids] = useState(initialSkids);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role !== 'CUSTOMER_ADMIN' && session?.user?.role !== 'CUSTOMER_USER') {
      router.push('/unauthorized');
    }
  }, [session, status, router]);

  // Filter skids based on search and status
  const filteredSkids = skids.filter(skid => {
    const matchesSearch =
      skid.skidCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      skid.location?.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || skid.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      AVAILABLE: { variant: 'default' as const, label: 'Available' },
      IN_TRANSIT: { variant: 'secondary' as const, label: 'In Transit' },
      DELIVERED: { variant: 'success' as const, label: 'Delivered' },
      DAMAGED: { variant: 'destructive' as const, label: 'Damaged' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || {
      variant: 'outline' as const,
      label: status,
    };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const columns = [
    {
      key: 'skidCode',
      header: 'Skid Code',
      accessor: (skid: (typeof skids)[0]) => <div className="font-medium">{skid.skidCode}</div>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (skid: (typeof skids)[0]) => getStatusBadge(skid.status),
    },
    {
      key: 'location',
      header: 'Location',
      accessor: (skid: (typeof skids)[0]) => (
        <div className="text-muted-foreground">{skid.location?.name || 'No location assigned'}</div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      accessor: (skid: (typeof skids)[0]) => (
        <Button variant="ghost" size="sm">
          View Details
        </Button>
      ),
    },
  ];

  if (status === 'loading') {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <div className="border-primary mx-auto h-12 w-12 animate-spin rounded-full border-b-2"></div>
            <p className="text-muted-foreground mt-4">Loading inventory...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground mt-2">
            Track and manage your warehouse inventory in real-time
          </p>
        </div>

        {/* Account Lock Warning */}
        {customer && (
          <AccountLockWarning
            customer={customer}
            operation="manage inventory"
            showManageButton={false}
          />
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Skids</CardTitle>
              <Package className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{skids.length}</div>
              <p className="text-muted-foreground text-xs">Active inventory items</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available</CardTitle>
              <Package className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {skids.filter(s => s.status === 'AVAILABLE').length}
              </div>
              <p className="text-muted-foreground text-xs">Ready for shipping</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Transit</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {skids.filter(s => s.status === 'IN_TRANSIT').length}
              </div>
              <p className="text-muted-foreground text-xs">Currently being shipped</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <Package className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {skids.filter(s => s.status === 'DELIVERED').length}
              </div>
              <p className="text-muted-foreground text-xs">Successfully delivered</p>
            </CardContent>
          </Card>
        </div>

        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div>
                <CardTitle>Inventory Items</CardTitle>
                <CardDescription>A list of all your warehouse inventory</CardDescription>
              </div>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  disabled={
                    customer?.accountStatus === 'LOCKED' || customer?.paymentStatus === 'DELINQUENT'
                  }
                  title={customer?.accountStatus === 'LOCKED' ? 'Account is locked' : ''}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Skid
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <Input
                    placeholder="Search by skid code or location..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="DAMAGED">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DataTable
              columns={columns}
              data={filteredSkids}
              onRowClick={skid => router.push(`/app/inventory/${skid.id}`)}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (
    !session ||
    (session.user?.role !== 'CUSTOMER_ADMIN' && session.user?.role !== 'CUSTOMER_USER')
  ) {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  if (!session.user.customerId) {
    return { props: { skids: [], customer: null } };
  }

  const [skids, customer] = await Promise.all([
    prisma.skid.findMany({
      where: { customerId: session.user.customerId },
      include: { location: true },
    }),
    prisma.customer.findUnique({
      where: { id: session.user.customerId },
    }),
  ]);

  return {
    props: {
      skids: JSON.parse(JSON.stringify(skids)),
      customer: JSON.parse(JSON.stringify(customer)),
    },
  };
};

export default Inventory;
