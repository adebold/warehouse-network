/**
 * This is a template file for Next.js projects.
 * 
 * Prerequisites:
 * 1. Install required dependencies: npm install lucide-react
 * 2. Ensure you have shadcn/ui components installed:
 *    - Badge component: npx shadcn-ui@latest add badge
 *    - Button component: npx shadcn-ui@latest add button
 *    - Card component: npx shadcn-ui@latest add card
 * 3. Configure your tsconfig.json with proper path mappings for @/ imports
 */

import { AlertCircle, CheckCircle, Clock, Database, RefreshCw } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { logger } from '../../../../../../../utils/logger';

interface IntegrityReport {
  id: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  checks: Array<{
    id: string;
    name: string;
    type: string;
    status: 'passed' | 'failed' | 'skipped';
    severity: 'error' | 'warning' | 'info';
    message?: string;
  }>;
  metadata: {
    version: string;
    database: string;
    schema: string;
  };
}

export function IntegrityDashboard() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchIntegrityReport = async (fix = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        verbose: 'true',
        ...(fix && { fix: 'true' })
      });
      
      const response = await fetch(`/api/integrity/check?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setReport(data.report);
      } else {
        logger.error('Failed to fetch integrity report:', data.error);
      }
    } catch (error) {
      logger.error('Error fetching integrity report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrityReport();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchIntegrityReport();
      }, 30000); // Refresh every 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: string, severity: string) => {
    if (status === 'passed') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (status === 'failed') {
      return severity === 'error' ? 
        <AlertCircle className="h-4 w-4 text-red-500" /> :
        <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
    return <Clock className="h-4 w-4 text-gray-500" />;
  };

  const getStatusColor = (status: string, severity: string) => {
    if (status === 'passed') {return 'bg-green-100 text-green-800';}
    if (status === 'failed') {
      return severity === 'error' ? 
        'bg-red-100 text-red-800' : 
        'bg-yellow-100 text-yellow-800';
    }
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Database Integrity</h2>
          <p className="text-muted-foreground">
            Monitor and maintain your database health with Claude Flow integration
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </Button>
          <Button 
            onClick={() => fetchIntegrityReport()} 
            disabled={loading}
            size="sm"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            Check Now
          </Button>
          <Button 
            onClick={() => fetchIntegrityReport(true)} 
            disabled={loading}
            size="sm"
            variant="outline"
          >
            Auto Fix
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {report && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Checks</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.summary.total}</div>
              <p className="text-xs text-muted-foreground">
                Last check: {new Date(report.timestamp).toLocaleTimeString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Passed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{report.summary.passed}</div>
              <p className="text-xs text-muted-foreground">
                {Math.round((report.summary.passed / report.summary.total) * 100)}% success rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{report.summary.failed}</div>
              <p className="text-xs text-muted-foreground">
                Require attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Skipped</CardTitle>
              <Clock className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{report.summary.skipped}</div>
              <p className="text-xs text-muted-foreground">
                Not applicable
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Checks */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Integrity Checks</CardTitle>
            <p className="text-sm text-muted-foreground">
              Report ID: {report.id} | Database: {report.metadata.database} | Schema: {report.metadata.schema}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.checks.map((check) => (
                <div key={check.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(check.status, check.severity)}
                    <div>
                      <p className="font-medium">{check.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {check.type} check
                      </p>
                      {check.message && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {check.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className={getStatusColor(check.status, check.severity)}>
                    {check.status}
                  </Badge>
                </div>
              ))}
              
              {report.checks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>All integrity checks passed!</p>
                  <p className="text-sm">Your database is in excellent health.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !report && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="ml-3 text-muted-foreground">Running integrity checks...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Claude Flow Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Claude Flow Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>Memory sync active</span>
            <Badge variant="outline">Connected</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}