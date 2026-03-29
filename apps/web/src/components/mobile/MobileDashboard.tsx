/**
 * Mobile Dashboard Component
 * Mobile-optimized dashboard for warehouse management
 */
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  Package,
  Scan,
  MapPin,
  TrendingUp,
  Bell,
  Plus,
  BarChart3,
  Users,
  DollarSign,
  Warehouse,
  Clock,
  AlertTriangle,
  CheckCircle,
  Activity,
  Calendar,
  Search
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface DashboardStats {
  inventory: {
    total: number;
    available: number;
    reserved: number;
    lowStock: number;
  };
  warehouses: {
    total: number;
    active: number;
    capacity: number;
    utilization: number;
  };
  transactions: {
    today: number;
    thisWeek: number;
    revenue: number;
    pending: number;
  };
  notifications: {
    unread: number;
    alerts: number;
  };
}

interface RecentActivity {
  id: string;
  type: 'inventory' | 'transaction' | 'warehouse' | 'alert';
  title: string;
  description: string;
  timestamp: Date;
  status: 'success' | 'warning' | 'error' | 'info';
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  route: string;
  color: string;
  priority: number;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'scan',
    title: 'Scan Barcode',
    description: 'Quick inventory scanning',
    icon: Scan,
    route: '/mobile/scan',
    color: 'bg-blue-500',
    priority: 1
  },
  {
    id: 'find',
    title: 'Find Warehouses',
    description: 'Locate nearby storage',
    icon: MapPin,
    route: '/mobile/find',
    color: 'bg-green-500',
    priority: 2
  },
  {
    id: 'inventory',
    title: 'View Inventory',
    description: 'Check stock levels',
    icon: Package,
    route: '/inventory',
    color: 'bg-purple-500',
    priority: 3
  },
  {
    id: 'add',
    title: 'Add Item',
    description: 'Register new inventory',
    icon: Plus,
    route: '/inventory/add',
    color: 'bg-orange-500',
    priority: 4
  }
];

export function MobileDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    inventory: { total: 0, available: 0, reserved: 0, lowStock: 0 },
    warehouses: { total: 0, active: 0, capacity: 0, utilization: 0 },
    transactions: { today: 0, thisWeek: 0, revenue: 0, pending: 0 },
    notifications: { unread: 0, alerts: 0 }
  });

  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Load dashboard data
  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);

      // Fetch stats from API
      const statsResponse = await fetch('/api/dashboard/stats');
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      } else {
        // Generate mock stats for demo
        setStats(generateMockStats());
      }

      // Fetch recent activity
      const activityResponse = await fetch('/api/dashboard/activity');
      if (activityResponse.ok) {
        const activityData = await activityResponse.json();
        setRecentActivity(activityData);
      } else {
        // Generate mock activity for demo
        setRecentActivity(generateMockActivity());
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // Use mock data on error
      setStats(generateMockStats());
      setRecentActivity(generateMockActivity());
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockStats = (): DashboardStats => {
    return {
      inventory: {
        total: 1247,
        available: 892,
        reserved: 234,
        lowStock: 12
      },
      warehouses: {
        total: 8,
        active: 6,
        capacity: 50000,
        utilization: 73
      },
      transactions: {
        today: 23,
        thisWeek: 156,
        revenue: 12450.50,
        pending: 3
      },
      notifications: {
        unread: 5,
        alerts: 2
      }
    };
  };

  const generateMockActivity = (): RecentActivity[] => {
    return [
      {
        id: '1',
        type: 'inventory',
        title: 'Low Stock Alert',
        description: 'Product ABC123 is running low (12 units left)',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        status: 'warning'
      },
      {
        id: '2',
        type: 'transaction',
        title: 'Payment Received',
        description: '$2,450.00 from WareCorp Industries',
        timestamp: new Date(Date.now() - 45 * 60 * 1000),
        status: 'success'
      },
      {
        id: '3',
        type: 'warehouse',
        title: 'New Warehouse Added',
        description: 'Warehouse D is now active in Chicago',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        status: 'info'
      },
      {
        id: '4',
        type: 'inventory',
        title: 'Inventory Scan Complete',
        description: '145 items scanned in Warehouse B',
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
        status: 'success'
      }
    ];
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const getActivityIcon = (type: RecentActivity['type']) => {
    switch (type) {
      case 'inventory': return Package;
      case 'transaction': return DollarSign;
      case 'warehouse': return Warehouse;
      case 'alert': return AlertTriangle;
      default: return Activity;
    }
  };

  const getActivityColor = (status: RecentActivity['status']) => {
    switch (status) {
      case 'success': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-blue-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back! Here's your warehouse overview.
          </p>
        </div>
        {lastUpdate && (
          <div className="text-xs text-muted-foreground text-right">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(lastUpdate)}
            </div>
          </div>
        )}
      </div>

      {/* Alerts */}
      {stats.notifications.alerts > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You have {stats.notifications.alerts} critical alerts requiring attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  variant="outline"
                  onClick={() => router.push(action.route)}
                  className="h-20 flex flex-col gap-2 relative overflow-hidden"
                >
                  <div className={cn(
                    "absolute inset-0 opacity-10",
                    action.color
                  )} />
                  <Icon className="w-6 h-6" />
                  <div className="text-center">
                    <div className="text-sm font-medium">{action.title}</div>
                    <div className="text-xs text-muted-foreground">{action.description}</div>
                  </div>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-4">
        {/* Inventory Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4" />
              Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{stats.inventory.total.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Items</div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Available: {stats.inventory.available}</span>
                <span>Reserved: {stats.inventory.reserved}</span>
              </div>
              {stats.inventory.lowStock > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {stats.inventory.lowStock} Low Stock
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Warehouse Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Warehouse className="w-4 h-4" />
              Warehouses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{stats.warehouses.active}/{stats.warehouses.total}</div>
            <div className="text-xs text-muted-foreground">Active Warehouses</div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Utilization</span>
                <span>{stats.warehouses.utilization}%</span>
              </div>
              <Progress value={stats.warehouses.utilization} className="h-1" />
            </div>
          </CardContent>
        </Card>

        {/* Transaction Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xl font-bold">{formatCurrency(stats.transactions.revenue)}</div>
            <div className="text-xs text-muted-foreground">This Week</div>

            <div className="flex justify-between text-xs">
              <span>Today: {stats.transactions.today}</span>
              <span>Pending: {stats.transactions.pending}</span>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{stats.notifications.unread}</div>
            <div className="text-xs text-muted-foreground">Unread Messages</div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/notifications')}
              className="w-full text-xs h-6"
            >
              View All
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Recent Activity
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/activity')}
              className="text-xs"
            >
              View All
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-muted rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.slice(0, 5).map((activity) => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      "bg-muted"
                    )}>
                      <Icon className={cn("w-4 h-4", getActivityColor(activity.status))} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{activity.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTimeAgo(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="outline"
          onClick={() => router.push('/analytics')}
          className="h-12 flex items-center gap-2"
        >
          <BarChart3 className="w-5 h-5" />
          <span>Analytics</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push('/settings')}
          className="h-12 flex items-center gap-2"
        >
          <Users className="w-5 h-5" />
          <span>Settings</span>
        </Button>
      </div>
    </div>
  );
}

export default MobileDashboard;