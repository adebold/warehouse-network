'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import {
  Users,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Building2,
  Activity,
  Target,
  Percent
} from 'lucide-react';
import { formatCurrency, formatNumber, formatPercentage, getChangeColor, getChangeIcon } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}

function KPICard({ title, value, change, icon: Icon, loading }: KPICardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            <LoadingSkeleton className="h-4 w-20" />
          </CardTitle>
          <LoadingSkeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <LoadingSkeleton className="h-8 w-16 mb-1" />
          <LoadingSkeleton className="h-3 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <p className={`text-xs flex items-center gap-1 ${getChangeColor(change)}`}>
            <span>{getChangeIcon(change)}</span>
            {formatPercentage(Math.abs(change))} from last period
          </p>
        )}
      </CardContent>
    </Card>
  );
}

async function fetchKPIMetrics() {
  const response = await fetch('/api/analytics/kpis', {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch KPI metrics');
  }

  return response.json();
}

export function KPIGrid() {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['kpi-metrics'],
    queryFn: fetchKPIMetrics,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Mock data for development
  const mockMetrics = {
    activeUsers: { value: 1247, change: 12.5 },
    totalBookings: { value: 89, change: 23.1 },
    totalRevenue: { value: 45670, change: 8.7 },
    conversionRate: { value: 3.2, change: -2.1 },
    warehouseViews: { value: 2856, change: 15.3 },
    avgSessionDuration: { value: 4.2, change: 7.8 },
    occupancyRate: { value: 76.5, change: 4.2 },
    customerSatisfaction: { value: 4.6, change: 2.1 }
  };

  const kpiData = metrics || mockMetrics;

  const kpis = [
    {
      title: 'Active Users',
      value: formatNumber(kpiData.activeUsers?.value || 0),
      change: kpiData.activeUsers?.change,
      icon: Users
    },
    {
      title: 'Total Bookings',
      value: formatNumber(kpiData.totalBookings?.value || 0),
      change: kpiData.totalBookings?.change,
      icon: ShoppingCart
    },
    {
      title: 'Revenue',
      value: formatCurrency(kpiData.totalRevenue?.value || 0),
      change: kpiData.totalRevenue?.change,
      icon: DollarSign
    },
    {
      title: 'Conversion Rate',
      value: formatPercentage(kpiData.conversionRate?.value || 0),
      change: kpiData.conversionRate?.change,
      icon: Target
    },
    {
      title: 'Warehouse Views',
      value: formatNumber(kpiData.warehouseViews?.value || 0),
      change: kpiData.warehouseViews?.change,
      icon: Building2
    },
    {
      title: 'Avg Session (min)',
      value: formatNumber(kpiData.avgSessionDuration?.value || 0, { maximumFractionDigits: 1 }),
      change: kpiData.avgSessionDuration?.change,
      icon: Activity
    },
    {
      title: 'Occupancy Rate',
      value: formatPercentage(kpiData.occupancyRate?.value || 0),
      change: kpiData.occupancyRate?.change,
      icon: TrendingUp
    },
    {
      title: 'Satisfaction',
      value: `${formatNumber(kpiData.customerSatisfaction?.value || 0, { maximumFractionDigits: 1 })}/5`,
      change: kpiData.customerSatisfaction?.change,
      icon: Percent
    }
  ];

  if (error) {
    return (
      <Card className="col-span-full">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Failed to load KPI metrics</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, index) => (
        <KPICard
          key={index}
          title={kpi.title}
          value={kpi.value}
          change={kpi.change}
          icon={kpi.icon}
          loading={isLoading}
        />
      ))}
    </div>
  );
}