import {
  BarChart3,
  TrendingUp,
  Activity,
  Database,
  Zap,
  Clock,
  Target,
  Users,
  Mail,
  MousePointer,
  Eye,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const AnalyticsPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    if (session.user?.role !== 'SUPER_ADMIN' && session.user?.role !== 'ADMIN') {
      router.push('/unauthorized');
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/admin/marketing" className="hover:text-primary">
              Marketing Engine
            </Link>
            <span>/</span>
            <span>Analytics</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics & Reporting</h2>
          <p className="text-muted-foreground">
            Real-time analytics, KPI tracking, and performance insights
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="setup">Setup Guide</TabsTrigger>
            <TabsTrigger value="kpis">KPIs</TabsTrigger>
            <TabsTrigger value="events">Event Tracking</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">24</div>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                    +12% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Email Open Rate</CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">32.4%</div>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                    +4.2% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
                  <MousePointer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8.7%</div>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <ArrowDownRight className="h-3 w-3 text-red-500 mr-1" />
                    -1.2% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">3.2%</div>
                  <p className="text-xs text-muted-foreground flex items-center">
                    <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                    +0.8% from last month
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Analytics Components */}
            <Card>
              <CardHeader>
                <CardTitle>Analytics Components</CardTitle>
                <CardDescription>
                  The Marketing Engine analytics stack provides comprehensive insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-blue-500" />
                      <span className="font-semibold">Real-Time Streaming</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Kafka and Redis Streams for real-time event processing
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">Kafka</Badge>
                      <Badge variant="outline">Redis Streams</Badge>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-green-500" />
                      <span className="font-semibold">Data Warehouse</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      PostgreSQL with TimescaleDB for time-series analytics
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">PostgreSQL</Badge>
                      <Badge variant="outline">TimescaleDB</Badge>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-purple-500" />
                      <span className="font-semibold">Visualization</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Grafana dashboards for metrics visualization
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">Grafana</Badge>
                      <Badge variant="outline">Prometheus</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="setup" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analytics Setup Guide</CardTitle>
                <CardDescription>
                  Configure the analytics infrastructure for the Marketing Engine
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">1. Kafka Configuration</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># Kafka Configuration</p>
                    <p>KAFKA_BROKERS=localhost:9092</p>
                    <p>KAFKA_CLIENT_ID=marketing-engine</p>
                    <p>KAFKA_GROUP_ID=marketing-analytics</p>
                    <p className="mt-2"># Topics</p>
                    <p>KAFKA_TOPIC_EVENTS=marketing.events</p>
                    <p>KAFKA_TOPIC_CAMPAIGNS=marketing.campaigns</p>
                    <p>KAFKA_TOPIC_METRICS=marketing.metrics</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">2. Redis Streams Configuration</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># Redis Configuration</p>
                    <p>REDIS_URL=redis://localhost:6379</p>
                    <p>REDIS_STREAM_MAX_LEN=10000</p>
                    <p>REDIS_CONSUMER_GROUP=analytics-workers</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">3. Grafana Setup</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># Start Grafana with Docker</p>
                    <p>docker-compose up -d grafana</p>
                    <p className="mt-2"># Access Grafana</p>
                    <p>URL: http://localhost:3001</p>
                    <p>Default credentials: admin/admin</p>
                    <p className="mt-2"># Import dashboards</p>
                    <p>cd monitoring/grafana</p>
                    <p>./import-dashboards.sh</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">4. Prometheus Configuration</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># prometheus.yml</p>
                    <p>global:</p>
                    <p>  scrape_interval: 15s</p>
                    <p className="mt-2">scrape_configs:</p>
                    <p>  - job_name: 'marketing-engine'</p>
                    <p>    static_configs:</p>
                    <p>      - targets: ['localhost:3000']</p>
                    <p>    metrics_path: '/metrics'</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="kpis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Key Performance Indicators</CardTitle>
                <CardDescription>
                  Configure and track marketing KPIs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>KPI</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Calculation</TableHead>
                      <TableHead>Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Open Rate</TableCell>
                      <TableCell>Percentage of emails opened</TableCell>
                      <TableCell><code>opens / delivered * 100</code></TableCell>
                      <TableCell><Badge>{'>'} 25%</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Click-Through Rate</TableCell>
                      <TableCell>Percentage of clicks on links</TableCell>
                      <TableCell><code>clicks / opens * 100</code></TableCell>
                      <TableCell><Badge>{'>'} 5%</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Conversion Rate</TableCell>
                      <TableCell>Percentage of conversions</TableCell>
                      <TableCell><code>conversions / clicks * 100</code></TableCell>
                      <TableCell><Badge>{'>'} 2%</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Bounce Rate</TableCell>
                      <TableCell>Percentage of bounced emails</TableCell>
                      <TableCell><code>bounces / sent * 100</code></TableCell>
                      <TableCell><Badge>{'<'} 2%</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Unsubscribe Rate</TableCell>
                      <TableCell>Percentage of unsubscribes</TableCell>
                      <TableCell><code>unsubs / delivered * 100</code></TableCell>
                      <TableCell><Badge>{'<'} 0.5%</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">ROI</TableCell>
                      <TableCell>Return on Investment</TableCell>
                      <TableCell><code>(revenue - cost) / cost * 100</code></TableCell>
                      <TableCell><Badge>{'>'} 200%</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">CAC</TableCell>
                      <TableCell>Customer Acquisition Cost</TableCell>
                      <TableCell><code>total_spend / new_customers</code></TableCell>
                      <TableCell><Badge>{'<'} $50</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">LTV</TableCell>
                      <TableCell>Customer Lifetime Value</TableCell>
                      <TableCell><code>avg_order * frequency * lifespan</code></TableCell>
                      <TableCell><Badge>{'>'} $500</Badge></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>KPI Configuration</CardTitle>
                <CardDescription>
                  Define custom KPIs via API or configuration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                  <pre>{`POST /api/v1/analytics/kpis
{
  "name": "Email Engagement Score",
  "formula": "(open_rate * 0.3) + (click_rate * 0.5) + (conversion_rate * 0.2)",
  "thresholds": {
    "excellent": 80,
    "good": 60,
    "average": 40,
    "poor": 0
  },
  "aggregation": "daily",
  "dimensions": ["campaign", "channel", "segment"]
}`}</pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Event Tracking</CardTitle>
                <CardDescription>
                  Track and analyze marketing events in real-time
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Standard Events</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Properties</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell><code>email.sent</code></TableCell>
                        <TableCell>Email was sent to recipient</TableCell>
                        <TableCell>campaign_id, recipient_id, template</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>email.delivered</code></TableCell>
                        <TableCell>Email was delivered</TableCell>
                        <TableCell>campaign_id, recipient_id</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>email.opened</code></TableCell>
                        <TableCell>Email was opened</TableCell>
                        <TableCell>campaign_id, recipient_id, device, location</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>email.clicked</code></TableCell>
                        <TableCell>Link in email was clicked</TableCell>
                        <TableCell>campaign_id, recipient_id, url, link_id</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>email.bounced</code></TableCell>
                        <TableCell>Email bounced</TableCell>
                        <TableCell>campaign_id, recipient_id, bounce_type</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>email.unsubscribed</code></TableCell>
                        <TableCell>Recipient unsubscribed</TableCell>
                        <TableCell>campaign_id, recipient_id, reason</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>conversion.completed</code></TableCell>
                        <TableCell>Conversion goal achieved</TableCell>
                        <TableCell>campaign_id, recipient_id, value, goal_id</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Tracking Implementation</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`// Track custom event via API
POST /api/v1/analytics/events
{
  "event": "conversion.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "properties": {
    "campaign_id": "camp_123",
    "recipient_id": "user_456",
    "value": 99.99,
    "currency": "USD",
    "goal_id": "purchase"
  },
  "context": {
    "source": "email",
    "medium": "campaign",
    "utm_content": "summer-sale"
  }
}

// JavaScript SDK
marketingEngine.track('conversion.completed', {
  campaignId: 'camp_123',
  value: 99.99,
  goalId: 'purchase'
});`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Event Processing Pipeline</h3>
                  <div className="bg-muted p-6 rounded-lg font-mono text-sm">
                    <pre>{`
Event Source     Kafka Topic      Stream Processor     Data Store
    │                 │                  │                 │
    ▼                 ▼                  ▼                 ▼
┌─────────┐    ┌──────────────┐    ┌───────────┐    ┌───────────┐
│ Webhook │───▶│ events.raw   │───▶│ Enricher  │───▶│PostgreSQL │
└─────────┘    └──────────────┘    └───────────┘    └───────────┘
                      │                  │                 │
                      ▼                  ▼                 ▼
               ┌──────────────┐    ┌───────────┐    ┌───────────┐
               │events.enriched│───▶│Aggregator │───▶│   Redis   │
               └──────────────┘    └───────────┘    └───────────┘
                                         │
                                         ▼
                                   ┌───────────┐
                                   │ Prometheus│
                                   └───────────┘
                    `}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AnalyticsPage;
