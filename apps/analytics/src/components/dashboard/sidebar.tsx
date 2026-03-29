'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Users,
  ShoppingCart,
  Building2,
  TrendingUp,
  AlertCircle,
  Settings,
  PieChart,
  Activity,
  Target,
  Database,
  Bell
} from 'lucide-react';

const navigation = [
  {
    name: 'Dashboard',
    href: '/',
    icon: BarChart3,
    current: true
  },
  {
    name: 'Analytics',
    icon: PieChart,
    children: [
      { name: 'Overview', href: '/analytics' },
      { name: 'Revenue', href: '/analytics/revenue' },
      { name: 'Users', href: '/analytics/users' },
      { name: 'Conversions', href: '/analytics/conversions' }
    ]
  },
  {
    name: 'Business Intelligence',
    icon: TrendingUp,
    children: [
      { name: 'Reports', href: '/reports' },
      { name: 'Forecasting', href: '/forecasting' },
      { name: 'Cohort Analysis', href: '/cohorts' },
      { name: 'Funnel Analysis', href: '/funnels' }
    ]
  },
  {
    name: 'Customer Behavior',
    icon: Users,
    children: [
      { name: 'Journey Maps', href: '/behavior/journeys' },
      { name: 'Session Analytics', href: '/behavior/sessions' },
      { name: 'Attribution', href: '/behavior/attribution' }
    ]
  },
  {
    name: 'Warehouse Analytics',
    icon: Building2,
    children: [
      { name: 'Performance', href: '/warehouses/performance' },
      { name: 'Utilization', href: '/warehouses/utilization' },
      { name: 'Occupancy', href: '/warehouses/occupancy' }
    ]
  },
  {
    name: 'Bookings',
    href: '/bookings',
    icon: ShoppingCart
  },
  {
    name: 'Monitoring',
    icon: Activity,
    children: [
      { name: 'System Health', href: '/monitoring/system' },
      { name: 'Performance', href: '/monitoring/performance' },
      { name: 'Uptime', href: '/monitoring/uptime' }
    ]
  },
  {
    name: 'Alerts',
    href: '/alerts',
    icon: Bell
  },
  {
    name: 'Data Sources',
    href: '/data-sources',
    icon: Database
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings
  }
];

interface NavigationItemProps {
  item: any;
  pathname: string;
}

function NavigationItem({ item, pathname }: NavigationItemProps) {
  const Icon = item.icon;
  const isActive = pathname === item.href ||
    (item.children && item.children.some((child: any) => pathname.startsWith(child.href)));

  if (item.children) {
    return (
      <div>
        <div className={cn(
          'flex items-center px-3 py-2 text-sm font-medium rounded-md',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        )}>
          <Icon className="mr-3 h-4 w-4" />
          {item.name}
        </div>
        <div className="ml-6 mt-1 space-y-1">
          {item.children.map((child: any) => (
            <Link
              key={child.name}
              href={child.href}
              className={cn(
                'block px-3 py-2 text-sm rounded-md',
                pathname === child.href
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {child.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center px-3 py-2 text-sm font-medium rounded-md',
        pathname === item.href
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      <Icon className="mr-3 h-4 w-4" />
      {item.name}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full bg-background border-r">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Skidspace</h1>
            <p className="text-xs text-muted-foreground">Analytics</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navigation.map((item) => (
          <NavigationItem
            key={item.name}
            item={item}
            pathname={pathname}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t">
        <div className="text-xs text-muted-foreground">
          <p>Last updated: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}