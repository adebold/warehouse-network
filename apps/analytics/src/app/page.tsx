import { Suspense } from 'react';
import { Metadata } from 'next';

import { DashboardShell } from '@/components/dashboard/shell';
import { DashboardHeader } from '@/components/dashboard/header';
import { KPIGrid } from '@/components/dashboard/kpi-grid';
import { ChartsGrid } from '@/components/dashboard/charts-grid';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { AlertsPanel } from '@/components/dashboard/alerts-panel';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

export const metadata: Metadata = {
  title: 'Analytics Dashboard | Skidspace',
  description: 'Real-time analytics and key performance indicators'
};

export default function DashboardPage() {
  return (
    <DashboardShell>
      <DashboardHeader
        title="Analytics Dashboard"
        description="Real-time insights and key performance indicators for your warehouse marketplace"
      />

      <div className="space-y-6">
        {/* KPI Cards */}
        <Suspense fallback={<LoadingSkeleton className="h-32" />}>
          <KPIGrid />
        </Suspense>

        {/* Main Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Suspense fallback={<LoadingSkeleton className="h-96" />}>
              <ChartsGrid />
            </Suspense>
          </div>

          <div className="space-y-6">
            {/* Active Alerts */}
            <Suspense fallback={<LoadingSkeleton className="h-48" />}>
              <AlertsPanel />
            </Suspense>

            {/* Recent Activity */}
            <Suspense fallback={<LoadingSkeleton className="h-64" />}>
              <RecentActivity />
            </Suspense>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}