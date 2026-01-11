import { format, parseISO } from 'date-fns';
import {
  CalendarDays,
  MoreVertical,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Package,
  User,
  Filter,
  Download,
  RefreshCw,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AdminBookingsPageProps {
  bookings: Array<{
    id: string;
    bookingNumber: string;
    startDate: string;
    endDate: string;
    palletCount: number;
    status: string;
    totalPrice: number;
    currency: string;
    createdAt: string;
    customer: {
      id: string;
      name: string;
      accountStatus: string;
    };
    warehouse: {
      id: string;
      name: string;
      city: string | null;
      province: string | null;
      operator: {
        id: string;
        legalName: string;
      };
    };
  }>;
  stats: {
    total: number;
    pending: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    totalRevenue: number;
  };
}

const AdminBookingsPage: NextPage<AdminBookingsPageProps> = ({ bookings, stats }) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [filteredBookings, setFilteredBookings] = useState(bookings);

  const handleSearch = () => {
    let filtered = bookings;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (booking) =>
          booking.bookingNumber.toLowerCase().includes(query) ||
          booking.customer.name.toLowerCase().includes(query) ||
          booking.warehouse.name.toLowerCase().includes(query) ||
          booking.warehouse.operator.legalName.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((booking) => booking.status === statusFilter);
    }

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter((booking) => {
        const startDate = parseISO(booking.startDate);
        switch (dateFilter) {
          case 'upcoming':
            return startDate > now;
          case 'current':
            return parseISO(booking.startDate) <= now && parseISO(booking.endDate) >= now;
          case 'past':
            return parseISO(booking.endDate) < now;
          default:
            return true;
        }
      });
    }

    setFilteredBookings(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      PENDING: { label: 'Pending', variant: 'outline' as const, icon: Clock },
      CONFIRMED: { label: 'Confirmed', variant: 'default' as const, icon: CheckCircle },
      IN_PROGRESS: { label: 'In Progress', variant: 'secondary' as const, icon: RefreshCw },
      COMPLETED: { label: 'Completed', variant: 'default' as const, icon: CheckCircle },
      CANCELLED: { label: 'Cancelled', variant: 'destructive' as const, icon: XCircle },
      EXPIRED: { label: 'Expired', variant: 'destructive' as const, icon: AlertCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleStatusUpdate = async (bookingId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        router.reload();
      }
    } catch (error) {
      logger.error('Error updating booking status:', error);
    }
  };

  const exportBookings = () => {
    // Implementation for CSV export
    logger.info('Exporting bookings...');
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
              <Link href="/admin/listings" className="hover:text-primary text-sm font-medium transition-colors">
                Warehouses
              </Link>
              <Link href="/admin/bookings" className="text-primary text-sm font-medium">
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
            <h1 className="text-3xl font-bold tracking-tight">Booking Management</h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage all warehouse bookings
            </p>
          </div>
          <Button onClick={exportBookings}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Bookings</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Active Bookings</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {stats.confirmed + stats.inProgress}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Pending Approval</CardDescription>
              <CardTitle className="text-2xl text-orange-600">{stats.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Revenue</CardDescription>
              <CardTitle className="text-2xl text-primary">
                ${stats.totalRevenue.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search bookings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="current">Current</SelectItem>
                  <SelectItem value="past">Past</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSearch}>
                <Filter className="mr-2 h-4 w-4" />
                Apply Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bookings Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Bookings</CardTitle>
            <CardDescription>
              {filteredBookings.length} bookings found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-center">Pallets</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex flex-col items-center text-muted-foreground">
                          <CalendarDays className="h-12 w-12 mb-2" />
                          <p>No bookings found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="font-medium">
                          <div>
                            <p className="font-mono text-sm">{booking.bookingNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              Created {format(parseISO(booking.createdAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <User className="mr-2 h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm">{booking.customer.name}</p>
                              <Badge variant="outline" className="text-xs">
                                {booking.customer.accountStatus}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{booking.warehouse.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {booking.warehouse.city}, {booking.warehouse.province}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              by {booking.warehouse.operator.legalName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="flex items-center">
                              <CalendarDays className="mr-1 h-3 w-3 text-muted-foreground" />
                              {format(parseISO(booking.startDate), 'MMM d')} - {format(parseISO(booking.endDate), 'MMM d, yyyy')}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <Package className="mr-1 h-4 w-4 text-muted-foreground" />
                            {booking.palletCount}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end">
                            <DollarSign className="mr-1 h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">
                              {booking.totalPrice.toLocaleString()}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(booking.status)}</TableCell>
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
                              <DropdownMenuItem onClick={() => router.push(`/admin/bookings/${booking.id}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {booking.status === 'PENDING' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleStatusUpdate(booking.id, 'CONFIRMED')}
                                    className="text-green-600"
                                  >
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Confirm Booking
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleStatusUpdate(booking.id, 'CANCELLED')}
                                    className="text-destructive"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Booking
                                  </DropdownMenuItem>
                                </>
                              )}
                              {booking.status === 'CONFIRMED' && (
                                <DropdownMenuItem
                                  onClick={() => handleStatusUpdate(booking.id, 'IN_PROGRESS')}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Mark In Progress
                                </DropdownMenuItem>
                              )}
                              {booking.status === 'IN_PROGRESS' && (
                                <DropdownMenuItem
                                  onClick={() => handleStatusUpdate(booking.id, 'COMPLETED')}
                                  className="text-green-600"
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Complete Booking
                                </DropdownMenuItem>
                              )}
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

        {/* Alert for pending bookings */}
        {stats.pending > 0 && (
          <Alert className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              There are {stats.pending} bookings pending approval.
              <Button
                variant="link"
                className="ml-2 p-0 h-auto"
                onClick={() => {
                  setStatusFilter('PENDING');
                  handleSearch();
                }}
              >
                Review pending bookings →
              </Button>
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
    const bookings = await prisma.booking.findMany({
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            accountStatus: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            city: true,
            province: true,
            operator: {
              select: {
                id: true,
                legalName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate stats
    const stats = {
      total: bookings.length,
      pending: bookings.filter((b: any) => b.status === 'PENDING').length,
      confirmed: bookings.filter((b: any) => b.status === 'CONFIRMED').length,
      inProgress: bookings.filter((b: any) => b.status === 'IN_PROGRESS').length,
      completed: bookings.filter((b: any) => b.status === 'COMPLETED').length,
      cancelled: bookings.filter((b: any) => b.status === 'CANCELLED').length,
      totalRevenue: bookings
        .filter((b: any) => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status))
        .reduce((sum: number, b: any) => sum + b.totalPrice, 0),
    };

    return {
      props: {
        bookings: JSON.parse(JSON.stringify(bookings)),
        stats,
      },
    };
  } catch (error) {
    logger.error('Error fetching bookings:', error);
    return {
      props: {
        bookings: [],
        stats: {
          total: 0,
          pending: 0,
          confirmed: 0,
          inProgress: 0,
          completed: 0,
          cancelled: 0,
          totalRevenue: 0,
        },
      },
    };
  }
};

export default AdminBookingsPage;