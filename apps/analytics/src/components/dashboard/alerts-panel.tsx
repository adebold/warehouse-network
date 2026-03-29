'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Alert {
  id: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
}

const levelConfig = {
  low: {
    icon: Clock,
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  medium: {
    icon: AlertCircle,
    bgColor: 'bg-yellow-50 dark:bg-yellow-950',
    textColor: 'text-yellow-700 dark:text-yellow-300',
    borderColor: 'border-yellow-200 dark:border-yellow-800'
  },
  high: {
    icon: AlertCircle,
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    textColor: 'text-orange-700 dark:text-orange-300',
    borderColor: 'border-orange-200 dark:border-orange-800'
  },
  critical: {
    icon: XCircle,
    bgColor: 'bg-red-50 dark:bg-red-950',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-200 dark:border-red-800'
  }
};

async function fetchAlerts() {
  const response = await fetch('/api/analytics/alerts');
  if (!response.ok) throw new Error('Failed to fetch alerts');
  return response.json();
}

// Mock data for development
const mockAlerts: Alert[] = [
  {
    id: '1',
    level: 'critical',
    message: 'API response time exceeded 2000ms threshold',
    timestamp: new Date().toISOString(),
    acknowledged: false,
    resolved: false
  },
  {
    id: '2',
    level: 'high',
    message: 'Database connection pool at 85% capacity',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    acknowledged: true,
    resolved: false
  },
  {
    id: '3',
    level: 'medium',
    message: 'Booking conversion rate dropped by 15%',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    acknowledged: false,
    resolved: false
  },
  {
    id: '4',
    level: 'low',
    message: 'Weekly backup completed successfully',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    acknowledged: true,
    resolved: true
  }
];

function AlertItem({ alert, onAcknowledge, onResolve }: {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const config = levelConfig[alert.level];
  const Icon = config.icon;

  return (
    <div className={`p-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-4 w-4 mt-0.5 ${config.textColor}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${config.textColor}`}>
            {alert.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDateTime(alert.timestamp)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {alert.resolved && (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
          {!alert.acknowledged && !alert.resolved && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAcknowledge(alert.id)}
              className="h-6 px-2 text-xs"
            >
              Ack
            </Button>
          )}
          {alert.acknowledged && !alert.resolved && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onResolve(alert.id)}
              className="h-6 px-2 text-xs"
            >
              Resolve
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AlertsPanel() {
  const { data: alerts, isLoading, error } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const alertData = alerts || mockAlerts;
  const activeAlerts = alertData.filter((alert: Alert) => !alert.resolved);
  const criticalCount = activeAlerts.filter((alert: Alert) => alert.level === 'critical').length;
  const highCount = activeAlerts.filter((alert: Alert) => alert.level === 'high').length;

  const handleAcknowledge = async (id: string) => {
    try {
      await fetch(`/api/analytics/alerts/${id}/acknowledge`, {
        method: 'POST'
      });
      // Invalidate and refetch
      // queryClient.invalidateQueries(['alerts']);
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await fetch(`/api/analytics/alerts/${id}/resolve`, {
        method: 'POST'
      });
      // Invalidate and refetch
      // queryClient.invalidateQueries(['alerts']);
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <LoadingSkeleton className="h-16" />
          <LoadingSkeleton className="h-16" />
          <LoadingSkeleton className="h-16" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center">
            Failed to load alerts
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Active Alerts</span>
          <div className="flex gap-2 text-xs">
            {criticalCount > 0 && (
              <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">
                {criticalCount} Critical
              </span>
            )}
            {highCount > 0 && (
              <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                {highCount} High
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeAlerts.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-muted-foreground">No active alerts</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activeAlerts.map((alert: Alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}