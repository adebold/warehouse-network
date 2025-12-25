import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import AdminLayout from '../../components/layouts/AdminLayout';
import { prisma } from '@warehouse-network/db';
import {
  IntegrityLog,
  IntegrityAlert,
  IntegrityLogCategory,
  IntegrityLogLevel,
  IntegrityAlertStatus
} from '@warehouse-network/db';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { AlertTriangle, CheckCircle, Info, AlertCircle, Search, Download, RefreshCw } from 'lucide-react';

interface Props {
  initialLogs: IntegrityLog[];
  initialAlerts: IntegrityAlert[];
  analytics: any;
}

export default function IntegrityLogsPage({ initialLogs, initialAlerts, analytics }: Props) {
  const [logs, setLogs] = useState<IntegrityLog[]>(initialLogs);
  const [alerts, setAlerts] = useState<IntegrityAlert[]>(initialAlerts);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const getLevelIcon = (level: IntegrityLogLevel) => {
    switch (level) {
      case IntegrityLogLevel.ERROR:
      case IntegrityLogLevel.CRITICAL:
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case IntegrityLogLevel.WARNING:
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case IntegrityLogLevel.INFO:
        return <Info className="w-4 h-4 text-blue-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
  };

  const getLevelBadge = (level: IntegrityLogLevel) => {
    const colors = {
      [IntegrityLogLevel.DEBUG]: 'bg-gray-100 text-gray-800',
      [IntegrityLogLevel.INFO]: 'bg-blue-100 text-blue-800',
      [IntegrityLogLevel.WARNING]: 'bg-amber-100 text-amber-800',
      [IntegrityLogLevel.ERROR]: 'bg-red-100 text-red-800',
      [IntegrityLogLevel.CRITICAL]: 'bg-purple-100 text-purple-800'
    };

    return (
      <Badge className={colors[level] || 'bg-gray-100 text-gray-800'}>
        {level}
      </Badge>
    );
  };

  const getAlertSeverityBadge = (severity: string) => {
    const colors = {
      'LOW': 'bg-green-100 text-green-800',
      'MEDIUM': 'bg-yellow-100 text-yellow-800',
      'HIGH': 'bg-orange-100 text-orange-800',
      'CRITICAL': 'bg-red-100 text-red-800'
    };

    return (
      <Badge className={colors[severity] || 'bg-gray-100 text-gray-800'}>
        {severity}
      </Badge>
    );
  };

  const refreshLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/integrity/logs');
      const data = await response.json();
      setLogs(data.logs);
      setAlerts(data.alerts);
    } catch (error) {
      console.error('Failed to refresh logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = async () => {
    try {
      const response = await fetch('/api/admin/integrity/export?format=csv');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `integrity-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      await fetch(`/api/admin/integrity/alerts/${alertId}/acknowledge`, {
        method: 'POST'
      });
      // Refresh alerts
      await refreshLogs();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const resolveAlert = async (alertId: string, notes: string) => {
    try {
      await fetch(`/api/admin/integrity/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      // Refresh alerts
      await refreshLogs();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Database Integrity Logs</h1>
          <div className="flex space-x-2">
            <Button onClick={refreshLogs} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={exportLogs} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Analytics Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Health Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.summary.healthScore}%</div>
              <p className="text-xs text-muted-foreground">System health</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(analytics.logs.errorRate * 100).toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.alerts.activeAlerts}</div>
              <p className="text-xs text-muted-foreground">{analytics.alerts.unacknowledgedCritical} critical</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.logs.avgDuration.toFixed(0)}ms</div>
              <p className="text-xs text-muted-foreground">All operations</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-4">
            {/* Filters */}
            <div className="flex space-x-4">
              <div className="flex-1">
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.values(IntegrityLogCategory).map(category => (
                    <SelectItem key={category} value={category}>
                      {category.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All Levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  {Object.values(IntegrityLogLevel).map(level => (
                    <SelectItem key={level} value={level}>{level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Logs Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left p-4 font-medium">Time</th>
                        <th className="text-left p-4 font-medium">Level</th>
                        <th className="text-left p-4 font-medium">Category</th>
                        <th className="text-left p-4 font-medium">Component</th>
                        <th className="text-left p-4 font-medium">Message</th>
                        <th className="text-left p-4 font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="border-b hover:bg-gray-50">
                          <td className="p-4 text-sm">
                            {format(new Date(log.timestamp), 'MMM dd HH:mm:ss')}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center space-x-1">
                              {getLevelIcon(log.level)}
                              {getLevelBadge(log.level)}
                            </div>
                          </td>
                          <td className="p-4 text-sm">{log.category.replace(/_/g, ' ')}</td>
                          <td className="p-4 text-sm">{log.component}</td>
                          <td className="p-4 text-sm">
                            <div className="max-w-md truncate">{log.message}</div>
                            {log.errorCode && (
                              <div className="text-xs text-red-500 mt-1">Error: {log.errorCode}</div>
                            )}
                          </td>
                          <td className="p-4 text-sm">
                            {log.duration ? `${log.duration}ms` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            {alerts.map((alert) => (
              <Card key={alert.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{alert.title}</CardTitle>
                      <div className="flex items-center space-x-2 mt-2">
                        {getAlertSeverityBadge(alert.severity)}
                        <Badge variant="outline">{alert.alertType.replace(/_/g, ' ')}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(alert.createdAt), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                    </div>
                    {alert.status !== IntegrityAlertStatus.RESOLVED && (
                      <div className="flex space-x-2">
                        {!alert.acknowledged && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            Acknowledge
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => {
                            const notes = window.prompt('Resolution notes:');
                            if (notes) resolveAlert(alert.id, notes);
                          }}
                        >
                          Resolve
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
                  {alert.affectedModels?.length > 0 && (
                    <div className="text-sm">
                      <strong>Affected Models:</strong> {alert.affectedModels.join(', ')}
                    </div>
                  )}
                  {alert.resolvedAt && (
                    <div className="mt-4 p-3 bg-green-50 rounded-lg">
                      <div className="text-sm text-green-800">
                        Resolved by {alert.resolvedBy} on{' '}
                        {format(new Date(alert.resolvedAt), 'MMM dd, yyyy HH:mm')}
                      </div>
                      {alert.resolutionNotes && (
                        <div className="text-sm text-gray-600 mt-1">{alert.resolutionNotes}</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top Errors */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Errors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analytics.logs.topErrors.map((error: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center">
                        <div className="text-sm">
                          <div className="font-medium">{error.errorCode}</div>
                          <div className="text-gray-500 text-xs">{error.message}</div>
                        </div>
                        <Badge variant="outline">{error.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Component Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Component Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analytics.logs.componentActivity.map((comp: any) => (
                      <div key={comp.component} className="flex justify-between items-center">
                        <div className="text-sm font-medium">{comp.component}</div>
                        <div className="text-sm text-gray-500">
                          {comp.operations} ops ({comp.errors} errors)
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analytics.summary.recommendations.map((rec: string, idx: number) => (
                    <li key={idx} className="flex items-start">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mr-2 mt-0.5" />
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  // Get recent logs
  const [logs, alerts] = await Promise.all([
    prisma.integrityLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100
    }),
    prisma.integrityAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    })
  ]);

  // Get analytics
  const analytics = await generateAnalytics();

  return {
    props: {
      initialLogs: JSON.parse(JSON.stringify(logs)),
      initialAlerts: JSON.parse(JSON.stringify(alerts)),
      analytics
    }
  };
};

async function generateAnalytics() {
  // This would normally call the analytics service
  // For now, return mock data
  return {
    logs: {
      totalLogs: 1234,
      errorRate: 0.05,
      avgDuration: 127,
      topErrors: [
        { errorCode: 'TABLE_NOT_FOUND', message: 'Referenced table not found', count: 15 },
        { errorCode: 'TYPE_MISMATCH', message: 'Column type mismatch', count: 8 }
      ],
      componentActivity: [
        { component: 'DriftDetector', operations: 342, errors: 5, avgDuration: 234 },
        { component: 'FormScanner', operations: 156, errors: 12, avgDuration: 89 }
      ]
    },
    alerts: {
      activeAlerts: 3,
      unacknowledgedCritical: 1
    },
    summary: {
      healthScore: 85,
      recommendations: [
        'High error rate detected. Review top errors and implement fixes.',
        '1 critical alert needs immediate attention.'
      ]
    }
  };
}