import type { Warehouse, Inventory, Customer } from '@warehouse/types';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, FileText, TrendingUp } from 'lucide-react';
import { BRAND_ASSETS } from '@/lib/asset-urls';
import { AppLayout } from '@/components/layouts/AppLayout';

const CustomerDashboard: NextPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState({
    activeSkids: 0,
    totalWarehouses: 0,
    activeRFQs: 0,
    monthlySpend: 0,
  });

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
      return;
    }

    // Check if user has customer role
    if (session.user?.role !== 'CUSTOMER_ADMIN' && session.user?.role !== 'CUSTOMER_USER') {
      router.push('/unauthorized');
      return;
    }

    // TODO: Fetch customer stats
  }, [session, status, router]);

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Customer Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome back, {session?.user?.name || session?.user?.email}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Skids</CardTitle>
              <Package className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeSkids}</div>
              <p className="text-muted-foreground text-xs">Currently in storage</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Warehouses</CardTitle>
              <img src={BRAND_ASSETS.systemIcon} alt="" className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalWarehouses}</div>
              <p className="text-muted-foreground text-xs">Active locations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active RFQs</CardTitle>
              <FileText className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeRFQs}</div>
              <p className="text-muted-foreground text-xs">Pending quotes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Spend</CardTitle>
              <TrendingUp className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.monthlySpend.toFixed(2)}</div>
              <p className="text-muted-foreground text-xs">Current month</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => router.push('/app/inventory')}
                >
                  View Inventory
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => router.push('/app/releases/new')}
                >
                  Create Release Request
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => router.push('/search')}
                >
                  Find Warehouse Space
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">No recent activity</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default CustomerDashboard;
