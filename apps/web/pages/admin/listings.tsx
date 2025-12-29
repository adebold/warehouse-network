import {
  MapPin,
  MoreVertical,
  Search,
  Plus,
  Edit,
  Eye,
  Power,
  Trash2,
  Building2,
  Package,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getSession } from 'next-auth/react';
import { useState } from 'react';

import prisma from '../../lib/prisma';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AdminListingsPageProps {
  warehouses: Array<{
    id: string;
    name: string;
    location: string | null;
    city: string | null;
    province: string | null;
    capacity: number;
    status: string;
    createdAt: string;
    updatedAt: string;
    operator: {
      id: string;
      legalName: string;
      status: string;
    };
    _count: {
      bookings: number;
      skids: number;
    };
  }>;
  stats: {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    ready: number;
  };
}

const AdminListingsPage: NextPage<AdminListingsPageProps> = ({ warehouses, stats }) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredWarehouses, setFilteredWarehouses] = useState(warehouses);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.toLowerCase();
    const filtered = warehouses.filter(
      (warehouse) =>
        warehouse.name.toLowerCase().includes(query) ||
        warehouse.city?.toLowerCase().includes(query) ||
        warehouse.operator.legalName.toLowerCase().includes(query)
    );
    setFilteredWarehouses(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ACTIVE: { label: 'Active', variant: 'default' as const, icon: CheckCircle },
      INACTIVE: { label: 'Inactive', variant: 'secondary' as const, icon: XCircle },
      READY_FOR_MARKETPLACE: { label: 'Ready', variant: 'outline' as const, icon: Clock },
      SUSPENDED: { label: 'Suspended', variant: 'destructive' as const, icon: AlertCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.INACTIVE;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleStatusChange = async (warehouseId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/warehouses/${warehouseId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        router.reload();
      }
    } catch (error) {
      console.error('Error updating warehouse status:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Link href="/admin/dashboard" className="flex items-center">
                <img src="/brand/logo-icon.svg" alt="SkidSpace" className="h-8 w-8" />
                <span className="ml-2 text-xl font-semibold" style={{color: '#0B1220'}}>SkidSpace Admin</span>
              </Link>
            </div>
            <nav className="hidden items-center space-x-6 md:flex">
              <Link href="/admin/dashboard" className="hover:text-primary text-sm font-medium transition-colors">
                Dashboard
              </Link>
              <Link href="/admin/listings" className="text-primary text-sm font-medium">
                Warehouses
              </Link>
              <Link href="/admin/bookings" className="hover:text-primary text-sm font-medium transition-colors">
                Bookings
              </Link>
              <Link href="/admin/customers" className="hover:text-primary text-sm font-medium transition-colors">
                Customers
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Warehouse Management</h1>
            <p className="text-muted-foreground mt-1">
              Manage all warehouse listings and their status
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Warehouse
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Warehouses</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Ready</CardDescription>
              <CardTitle className="text-2xl text-blue-600">{stats.ready}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Inactive</CardDescription>
              <CardTitle className="text-2xl text-gray-600">{stats.inactive}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Suspended</CardDescription>
              <CardTitle className="text-2xl text-red-600">{stats.suspended}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Search Warehouses</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by name, city, or operator..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit">Search</Button>
              {searchQuery && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setFilteredWarehouses(warehouses);
                  }}
                >
                  Clear
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Warehouses Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Warehouses</CardTitle>
            <CardDescription>
              {filteredWarehouses.length} warehouses found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead className="text-center">Capacity</TableHead>
                    <TableHead className="text-center">Bookings</TableHead>
                    <TableHead className="text-center">Current Skids</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWarehouses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex flex-col items-center text-muted-foreground">
                          <Building2 className="h-12 w-12 mb-2" />
                          <p>No warehouses found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredWarehouses.map((warehouse) => (
                      <TableRow key={warehouse.id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{warehouse.name}</p>
                            <p className="text-xs text-muted-foreground">ID: {warehouse.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <MapPin className="mr-1 h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">
                              {warehouse.city}, {warehouse.province}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{warehouse.operator.legalName}</p>
                            <Badge variant="outline" className="text-xs">
                              {warehouse.operator.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <Package className="mr-1 h-4 w-4 text-muted-foreground" />
                            {warehouse.capacity}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{warehouse._count.bookings}</TableCell>
                        <TableCell className="text-center">{warehouse._count.skids}</TableCell>
                        <TableCell>{getStatusBadge(warehouse.status)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => router.push(`/admin/warehouses/${warehouse.id}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/admin/warehouses/${warehouse.id}/edit`)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {warehouse.status === 'ACTIVE' ? (
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(warehouse.id, 'SUSPENDED')}
                                  className="text-destructive"
                                >
                                  <Power className="mr-2 h-4 w-4" />
                                  Suspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(warehouse.id, 'ACTIVE')}
                                  className="text-green-600"
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Alert for suspended warehouses */}
        {stats.suspended > 0 && (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              There are {stats.suspended} suspended warehouses that require attention.
              <Link href="/admin/listings?status=suspended" className="ml-2 underline">
                View suspended warehouses →
              </Link>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context);

  if (!session || !['ADMIN', 'FINANCE_ADMIN'].includes(session.user.role)) {
    return {
      redirect: {
        destination: '/unauthorized',
        permanent: false,
      },
    };
  }

  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        operator: {
          select: {
            id: true,
            legalName: true,
            status: true,
          },
        },
        _count: {
          select: {
            bookings: true,
            skids: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Calculate stats
    const stats = {
      total: warehouses.length,
      active: warehouses.filter(w => w.status === 'ACTIVE').length,
      inactive: warehouses.filter(w => w.status === 'INACTIVE').length,
      suspended: warehouses.filter(w => w.status === 'SUSPENDED').length,
      ready: warehouses.filter(w => w.status === 'READY_FOR_MARKETPLACE').length,
    };

    return {
      props: {
        warehouses: JSON.parse(JSON.stringify(warehouses)),
        stats,
      },
    };
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return {
      props: {
        warehouses: [],
        stats: {
          total: 0,
          active: 0,
          inactive: 0,
          suspended: 0,
          ready: 0,
        },
      },
    };
  }
};

export default AdminListingsPage;