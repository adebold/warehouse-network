import {
  Mail,
  MessageSquare,
  Share2,
  BarChart3,
  Settings,
  Zap,
  Server,
  Database,
  Shield,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
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

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
}

const MarketingEngineDashboard = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'API Gateway', status: 'operational', latency: 45 },
    { name: 'Event Bus', status: 'operational', latency: 12 },
    { name: 'Email Service', status: 'operational', latency: 89 },
    { name: 'Analytics Engine', status: 'operational', latency: 34 },
    { name: 'PostgreSQL', status: 'operational', latency: 8 },
    { name: 'Redis Cache', status: 'operational', latency: 2 },
  ]);

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'down':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Marketing Engine</h2>
            <p className="text-muted-foreground">
              Enterprise marketing automation platform with multi-channel orchestration
            </p>
          </div>
          <Badge variant="outline" className="text-green-600 border-green-600">
            <Activity className="h-3 w-3 mr-1" />
            All Systems Operational
          </Badge>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
            <TabsTrigger value="architecture">Architecture</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Feature Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Link href="/admin/marketing/campaigns">
                <Card className="hover:border-primary cursor-pointer transition-colors">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">Multi-Channel</div>
                    <p className="text-xs text-muted-foreground">
                      Email, SMS, Social, Push orchestration
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/marketing/channels">
                <Card className="hover:border-primary cursor-pointer transition-colors">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Channels</CardTitle>
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">6 Integrations</div>
                    <p className="text-xs text-muted-foreground">
                      Email, LinkedIn, Twitter, Google Ads, Blog, SMS
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/marketing/analytics">
                <Card className="hover:border-primary cursor-pointer transition-colors">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Analytics</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">Real-Time</div>
                    <p className="text-xs text-muted-foreground">
                      Event streaming with Kafka & Redis
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/marketing/api">
                <Card className="hover:border-primary cursor-pointer transition-colors">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">API</CardTitle>
                    <Server className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">RESTful</div>
                    <p className="text-xs text-muted-foreground">
                      OpenAPI documentation & SDK
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/admin/marketing/settings">
                <Card className="hover:border-primary cursor-pointer transition-colors">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Settings</CardTitle>
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">Configuration</div>
                    <p className="text-xs text-muted-foreground">
                      Environment & service configuration
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Security</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Enterprise</div>
                  <p className="text-xs text-muted-foreground">
                    JWT auth, rate limiting, RBAC
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Service Status */}
            <Card>
              <CardHeader>
                <CardTitle>Service Health</CardTitle>
                <CardDescription>
                  Real-time status of Marketing Engine microservices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {services.map((service) => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(service.status)}
                        <span className="font-medium">{service.name}</span>
                      </div>
                      {service.latency && (
                        <span className="text-sm text-muted-foreground">
                          {service.latency}ms
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quickstart" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Quick Start Guide</CardTitle>
                <CardDescription>
                  Get the Marketing Engine up and running in minutes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">1. Prerequisites</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p>Node.js 18+</p>
                    <p>Docker & Docker Compose</p>
                    <p>PostgreSQL 16+</p>
                    <p>Redis 7+</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">2. Install Dependencies</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p className="text-muted-foreground"># Navigate to marketing-engine</p>
                    <p>cd marketing-engine</p>
                    <p className="text-muted-foreground mt-2"># Install packages</p>
                    <p>npm install</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">3. Configure Environment</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p className="text-muted-foreground"># Copy environment template</p>
                    <p>cp .env.example .env</p>
                    <p className="text-muted-foreground mt-2"># Required variables:</p>
                    <p>DATABASE_URL=postgresql://user:pass@localhost:5432/marketing</p>
                    <p>REDIS_URL=redis://localhost:6379</p>
                    <p>JWT_SECRET=your-secret-key</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">4. Start Services</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p className="text-muted-foreground"># Start with Docker</p>
                    <p>docker-compose up -d</p>
                    <p className="text-muted-foreground mt-2"># Run migrations</p>
                    <p>npm run db:migrate</p>
                    <p className="text-muted-foreground mt-2"># Start development server</p>
                    <p>npm run dev</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">5. Access Points</h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>API Gateway</span>
                      <code className="text-sm bg-muted px-2 py-1 rounded">localhost:3000</code>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>API Docs</span>
                      <code className="text-sm bg-muted px-2 py-1 rounded">localhost:3000/api/docs</code>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Grafana</span>
                      <code className="text-sm bg-muted px-2 py-1 rounded">localhost:3001</code>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Health Check</span>
                      <code className="text-sm bg-muted px-2 py-1 rounded">localhost:3000/health</code>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="architecture" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Architecture</CardTitle>
                <CardDescription>
                  High-level overview of the Marketing Engine microservices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted p-6 rounded-lg font-mono text-sm overflow-x-auto">
                  <pre>{`
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│   Event Bus     │────▶│   Analytics     │
│   (Express.js)  │     │   (Kafka)       │     │   Engine        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PostgreSQL    │     │     Redis       │     │  Elasticsearch  │
│   (Primary DB)  │     │   (Cache/PubSub)│     │   (Logs/Search) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                  `}</pre>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="font-semibold">Core Services</h3>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <Server className="h-4 w-4 mt-1 text-primary" />
                        <div>
                          <span className="font-medium">API Gateway</span>
                          <p className="text-sm text-muted-foreground">
                            Central entry point with auth, rate limiting, routing
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="h-4 w-4 mt-1 text-primary" />
                        <div>
                          <span className="font-medium">Event Bus</span>
                          <p className="text-sm text-muted-foreground">
                            Kafka & Redis Streams for reliable event processing
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start gap-2">
                        <BarChart3 className="h-4 w-4 mt-1 text-primary" />
                        <div>
                          <span className="font-medium">Analytics Engine</span>
                          <p className="text-sm text-muted-foreground">
                            Real-time metrics, KPI tracking, reporting
                          </p>
                        </div>
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold">Data Stores</h3>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <Database className="h-4 w-4 mt-1 text-primary" />
                        <div>
                          <span className="font-medium">PostgreSQL</span>
                          <p className="text-sm text-muted-foreground">
                            Primary database for campaigns, users, configurations
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start gap-2">
                        <Database className="h-4 w-4 mt-1 text-primary" />
                        <div>
                          <span className="font-medium">Redis</span>
                          <p className="text-sm text-muted-foreground">
                            Caching, session storage, real-time pub/sub
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start gap-2">
                        <Database className="h-4 w-4 mt-1 text-primary" />
                        <div>
                          <span className="font-medium">Elasticsearch</span>
                          <p className="text-sm text-muted-foreground">
                            Log aggregation, full-text search, analytics
                          </p>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">Package Structure</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`marketing-engine/
├── packages/           # Shared packages
│   ├── shared/        # Common utilities
│   ├── core/          # Core business logic
│   ├── analytics/     # Analytics engine
│   ├── kpis/          # KPI tracking
│   └── channels/      # Channel integrations
│       ├── email/
│       ├── linkedin/
│       ├── twitter/
│       ├── google-ads/
│       └── blog/
├── services/          # Microservices
│   ├── api-gateway/   # API Gateway
│   └── event-bus/     # Event processing
├── integrations/      # External integrations
├── monitoring/        # Monitoring configs
└── n8n-workflows/     # Automation workflows`}</pre>
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

export default MarketingEngineDashboard;
