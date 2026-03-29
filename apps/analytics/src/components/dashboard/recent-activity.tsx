'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDateTime } from '@/lib/utils';
import {
  ShoppingCart,
  Users,
  CreditCard,
  Building2,
  Eye,
  MessageSquare,
  UserPlus,
  TrendingUp
} from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'booking' | 'user' | 'payment' | 'warehouse' | 'view' | 'inquiry' | 'signup' | 'metric';
  title: string;
  description: string;
  timestamp: string;
  user?: {
    name: string;
    email: string;
  };
  metadata?: Record<string, any>;
}

const activityIcons = {
  booking: ShoppingCart,
  user: Users,
  payment: CreditCard,
  warehouse: Building2,
  view: Eye,
  inquiry: MessageSquare,
  signup: UserPlus,
  metric: TrendingUp
};

const activityColors = {
  booking: 'text-green-600 bg-green-50',
  user: 'text-blue-600 bg-blue-50',
  payment: 'text-purple-600 bg-purple-50',
  warehouse: 'text-orange-600 bg-orange-50',
  view: 'text-gray-600 bg-gray-50',
  inquiry: 'text-indigo-600 bg-indigo-50',
  signup: 'text-emerald-600 bg-emerald-50',
  metric: 'text-red-600 bg-red-50'
};

async function fetchRecentActivity() {
  const response = await fetch('/api/analytics/activity');
  if (!response.ok) throw new Error('Failed to fetch recent activity');
  return response.json();
}

// Mock data for development
const mockActivity: ActivityItem[] = [
  {
    id: '1',
    type: 'booking',
    title: 'New booking confirmed',
    description: 'Downtown Logistics Hub - 2000 sq ft',
    timestamp: new Date().toISOString(),
    user: { name: 'John Doe', email: 'john@example.com' },
    metadata: { amount: 1250, duration: '30 days' }
  },
  {
    id: '2',
    type: 'signup',
    title: 'New user registered',
    description: 'E-bike company account created',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    user: { name: 'Sarah Wilson', email: 'sarah@bikeflow.com' }
  },
  {
    id: '3',
    type: 'payment',
    title: 'Payment processed',
    description: '$2,450 payment completed',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    user: { name: 'Mike Chen', email: 'mike@logistics.co' }
  },
  {
    id: '4',
    type: 'inquiry',
    title: 'Warehouse inquiry',
    description: 'Port Storage Center - Hazmat requirements',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    user: { name: 'Lisa Rodriguez', email: 'lisa@chemcorp.com' }
  },
  {
    id: '5',
    type: 'warehouse',
    title: 'New warehouse listed',
    description: 'Metro Distribution Center - Climate controlled',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    user: { name: 'David Park', email: 'david@metrostorage.com' }
  },
  {
    id: '6',
    type: 'metric',
    title: 'High conversion rate',
    description: 'Booking conversion reached 4.2%',
    timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString()
  }
];

function ActivityItem({ activity }: { activity: ActivityItem }) {
  const Icon = activityIcons[activity.type];
  const colorClasses = activityColors[activity.type];

  return (
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-full ${colorClasses}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {activity.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {activity.description}
            </p>
            {activity.user && (
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-xs">
                    {activity.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">
                  {activity.user.name}
                </span>
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDateTime(activity.timestamp, {
              hour: '2-digit',
              minute: '2-digit',
              month: 'short',
              day: 'numeric'
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RecentActivity() {
  const { data: activities, isLoading, error } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    refetchInterval: 60000, // Refetch every minute
  });

  const activityData = activities || mockActivity;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <LoadingSkeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <LoadingSkeleton className="h-4 w-3/4" />
                <LoadingSkeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center">
            Failed to load recent activity
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {activityData.map((activity: ActivityItem) => (
            <ActivityItem key={activity.id} activity={activity} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}