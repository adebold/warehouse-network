'use client';

/**
 * Payment Dashboard Component
 *
 * Provides a comprehensive view of payment activities including:
 * - Recent transactions
 * - Revenue analytics
 * - Subscription status
 * - Payout information
 * - Payment method management
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatAmount } from '@/lib/payments/stripe';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Users,
  Calendar,
  Download,
  ExternalLink,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface PaymentStats {
  totalRevenue: number;
  monthlyRevenue: number;
  totalTransactions: number;
  monthlyTransactions: number;
  activeSubscriptions: number;
  pendingPayouts: number;
  currency: string;
}

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  customer: {
    name: string;
    email: string;
  };
  createdAt: string;
  receiptUrl?: string;
}

interface Subscription {
  id: string;
  customer: {
    name: string;
    email: string;
  };
  status: string;
  amount: number;
  currency: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface PaymentDashboardProps {
  organizationId: string;
  userRole: 'admin' | 'manager' | 'viewer';
}

export function PaymentDashboard({ organizationId, userRole }: PaymentDashboardProps) {
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadDashboardData();
  }, [organizationId]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // In a real implementation, these would be separate API calls
      const [statsResponse, transactionsResponse, subscriptionsResponse] = await Promise.all([
        fetch(`/api/payments/stats?organizationId=${organizationId}`),
        fetch(`/api/payments/transactions?organizationId=${organizationId}&limit=10`),
        fetch(`/api/payments/subscriptions?organizationId=${organizationId}&limit=10`),
      ]);

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }

      if (transactionsResponse.ok) {
        const transactionsData = await transactionsResponse.json();
        setTransactions(transactionsData);
      }

      if (subscriptionsResponse.ok) {
        const subscriptionsData = await subscriptionsResponse.json();
        setSubscriptions(subscriptionsData);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      confirmed: { label: 'Confirmed', variant: 'default' as const, icon: CheckCircle },
      pending: { label: 'Pending', variant: 'secondary' as const, icon: AlertCircle },
      failed: { label: 'Failed', variant: 'destructive' as const, icon: AlertCircle },
      active: { label: 'Active', variant: 'default' as const, icon: CheckCircle },
      canceled: { label: 'Canceled', variant: 'destructive' as const, icon: AlertCircle },
      past_due: { label: 'Past Due', variant: 'destructive' as const, icon: AlertCircle },
    };

    const config = statusMap[status as keyof typeof statusMap] || statusMap.pending;
    const IconComponent = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <IconComponent className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const openStripeConnect = async () => {
    try {
      const response = await fetch('/api/payments/connect/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      if (response.ok) {
        const { dashboardUrl } = await response.json();
        window.open(dashboardUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to open Stripe dashboard:', error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded animate-pulse mb-2" />
                <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? formatAmount(stats.totalRevenue, stats.currency) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats ? formatAmount(stats.monthlyRevenue, stats.currency) : '$0.00'} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTransactions || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.monthlyTransactions || 0} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeSubscriptions || 0}</div>
            <p className="text-xs text-muted-foreground">Recurring revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? formatAmount(stats.pendingPayouts, stats.currency) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">Next payout date</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Button onClick={openStripeConnect} variant="outline" className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4" />
          Stripe Dashboard
        </Button>
        {userRole === 'admin' && (
          <Button variant="outline" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Data
          </Button>
        )}
      </div>

      {/* Detailed Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Your latest payment activities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {transaction.customer.name || transaction.customer.email}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {formatAmount(transaction.amount, transaction.currency)}
                        </p>
                        {getStatusBadge(transaction.status)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Subscriptions */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Subscriptions</CardTitle>
                <CardDescription>Active and recent subscription changes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {subscriptions.slice(0, 5).map((subscription) => (
                    <div key={subscription.id} className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {subscription.customer.name || subscription.customer.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {formatAmount(subscription.amount, subscription.currency)}/mo
                        </p>
                        {getStatusBadge(subscription.status)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Transactions</CardTitle>
              <CardDescription>Complete transaction history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{transaction.description}</p>
                        {getStatusBadge(transaction.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {transaction.customer.name} ({transaction.customer.email})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(transaction.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right space-y-2">
                      <p className="text-lg font-medium">
                        {formatAmount(transaction.amount, transaction.currency)}
                      </p>
                      {transaction.receiptUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={transaction.receiptUrl} target="_blank" rel="noopener noreferrer">
                            Receipt
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Subscriptions</CardTitle>
              <CardDescription>Manage recurring subscriptions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {subscriptions.map((subscription) => (
                  <div key={subscription.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {subscription.customer.name || subscription.customer.email}
                        </p>
                        {getStatusBadge(subscription.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </p>
                      {subscription.cancelAtPeriodEnd && (
                        <p className="text-sm text-yellow-600">Cancels at period end</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-medium">
                        {formatAmount(subscription.amount, subscription.currency)}/mo
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Analytics</CardTitle>
              <CardDescription>Revenue trends and insights</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  Advanced analytics coming soon
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}