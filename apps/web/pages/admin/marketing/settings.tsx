import {
  Settings,
  Database,
  Server,
  Shield,
  Bell,
  Clock,
  Zap,
  RefreshCw,
  Save,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SettingsPage = () => {
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
            <span>Settings</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Settings & Configuration</h2>
          <p className="text-muted-foreground">
            Configure Marketing Engine services and environment
          </p>
        </div>

        <Tabs defaultValue="environment" className="space-y-4">
          <TabsList>
            <TabsTrigger value="environment">Environment</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="environment" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Environment Configuration</CardTitle>
                <CardDescription>
                  Required environment variables for the Marketing Engine
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-200">Configuration File Location</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        Copy <code>.env.example</code> to <code>.env</code> in the <code>marketing-engine/</code> directory
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Core Settings</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-1">
                    <p className="text-muted-foreground"># Application</p>
                    <p>NODE_ENV=production</p>
                    <p>PORT=3000</p>
                    <p>API_URL=https://api.yourdomain.com</p>
                    <p>FRONTEND_URL=https://yourdomain.com</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Database Configuration</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-1">
                    <p className="text-muted-foreground"># PostgreSQL</p>
                    <p>DATABASE_URL=postgresql://user:password@localhost:5432/marketing_engine</p>
                    <p>DATABASE_POOL_MIN=2</p>
                    <p>DATABASE_POOL_MAX=10</p>
                    <p className="mt-2 text-muted-foreground"># Redis</p>
                    <p>REDIS_URL=redis://localhost:6379</p>
                    <p>REDIS_PASSWORD=your-redis-password</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Authentication</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-1">
                    <p className="text-muted-foreground"># JWT Configuration</p>
                    <p>JWT_SECRET=your-super-secret-jwt-key-min-32-chars</p>
                    <p>JWT_EXPIRES_IN=1h</p>
                    <p>JWT_REFRESH_EXPIRES_IN=7d</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Message Queue</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-1">
                    <p className="text-muted-foreground"># Kafka Configuration</p>
                    <p>KAFKA_BROKERS=localhost:9092</p>
                    <p>KAFKA_CLIENT_ID=marketing-engine</p>
                    <p>KAFKA_GROUP_ID=marketing-workers</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Observability</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-1">
                    <p className="text-muted-foreground"># Logging</p>
                    <p>LOG_LEVEL=info</p>
                    <p>LOG_FORMAT=json</p>
                    <p className="mt-2 text-muted-foreground"># Metrics</p>
                    <p>METRICS_ENABLED=true</p>
                    <p>PROMETHEUS_PORT=9090</p>
                    <p className="mt-2 text-muted-foreground"># Tracing</p>
                    <p>OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318</p>
                    <p>OTEL_SERVICE_NAME=marketing-engine</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Service Configuration</CardTitle>
                <CardDescription>
                  Configure and manage Marketing Engine microservices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Docker Compose Services</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`# Start all services
docker-compose up -d

# Start specific services
docker-compose up -d postgres redis kafka

# View service logs
docker-compose logs -f api-gateway

# Restart a service
docker-compose restart event-bus

# Stop all services
docker-compose down`}</pre>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="h-5 w-5 text-primary" />
                        <span className="font-semibold">API Gateway</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">Running</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>Port: 3000</p>
                      <p>Health: /health</p>
                      <p>Metrics: /metrics</p>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        <span className="font-semibold">Event Bus</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">Running</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>Port: 3001</p>
                      <p>Workers: 4</p>
                      <p>Queue: Bull + Redis</p>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        <span className="font-semibold">PostgreSQL</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">Running</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>Port: 5432</p>
                      <p>Version: 16</p>
                      <p>Pool: 10 connections</p>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        <span className="font-semibold">Redis</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">Running</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>Port: 6379</p>
                      <p>Version: 7</p>
                      <p>Memory: 256MB</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Database Migrations</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`# Run pending migrations
npm run db:migrate

# Create a new migration
npm run db:migrate:create -- --name add_campaigns_table

# Rollback last migration
npm run db:migrate:rollback

# Seed database with sample data
npm run db:seed`}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Configure security policies and access controls
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Rate Limiting</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Global Rate Limit (req/min)</Label>
                      <Input type="number" defaultValue="100" />
                    </div>
                    <div className="space-y-2">
                      <Label>API Key Rate Limit (req/min)</Label>
                      <Input type="number" defaultValue="1000" />
                    </div>
                    <div className="space-y-2">
                      <Label>Auth Endpoints (req/15min)</Label>
                      <Input type="number" defaultValue="5" />
                    </div>
                    <div className="space-y-2">
                      <Label>Burst Limit</Label>
                      <Input type="number" defaultValue="50" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Security Headers</h3>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">HSTS (Strict-Transport-Security)</p>
                        <p className="text-sm text-muted-foreground">
                          Force HTTPS connections
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Content Security Policy</p>
                        <p className="text-sm text-muted-foreground">
                          Prevent XSS attacks
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">X-Frame-Options</p>
                        <p className="text-sm text-muted-foreground">
                          Prevent clickjacking
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">CORS Configuration</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`# Environment Variables
CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">IP Whitelisting</h3>
                  <div className="space-y-2">
                    <Label>Allowed IP Addresses (comma-separated)</Label>
                    <Input placeholder="192.168.1.1, 10.0.0.0/8" />
                    <p className="text-sm text-muted-foreground">
                      Leave empty to allow all IPs. Use CIDR notation for ranges.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Settings
                </CardTitle>
                <CardDescription>
                  Configure alerts and notification channels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Alert Channels</h3>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Email Alerts</p>
                        <p className="text-sm text-muted-foreground">
                          Send alerts to admin email addresses
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Slack Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Post alerts to Slack channel
                        </p>
                      </div>
                      <Switch />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">PagerDuty Integration</p>
                        <p className="text-sm text-muted-foreground">
                          Trigger PagerDuty incidents for critical alerts
                        </p>
                      </div>
                      <Switch />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Alert Thresholds</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Error Rate Threshold (%)</Label>
                      <Input type="number" defaultValue="5" />
                    </div>
                    <div className="space-y-2">
                      <Label>Response Time Threshold (ms)</Label>
                      <Input type="number" defaultValue="1000" />
                    </div>
                    <div className="space-y-2">
                      <Label>Queue Backlog Threshold</Label>
                      <Input type="number" defaultValue="10000" />
                    </div>
                    <div className="space-y-2">
                      <Label>Memory Usage Threshold (%)</Label>
                      <Input type="number" defaultValue="85" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Notification Recipients</h3>
                  <div className="space-y-2">
                    <Label>Admin Email Addresses</Label>
                    <Input placeholder="admin@example.com, ops@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Slack Webhook URL</Label>
                    <Input placeholder="https://hooks.slack.com/services/..." />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Advanced Configuration</CardTitle>
                <CardDescription>
                  Advanced settings for power users
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Performance Tuning</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Worker Concurrency</Label>
                      <Select defaultValue="4">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 workers</SelectItem>
                          <SelectItem value="4">4 workers</SelectItem>
                          <SelectItem value="8">8 workers</SelectItem>
                          <SelectItem value="16">16 workers</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Batch Size</Label>
                      <Input type="number" defaultValue="100" />
                    </div>
                    <div className="space-y-2">
                      <Label>Cache TTL (seconds)</Label>
                      <Input type="number" defaultValue="3600" />
                    </div>
                    <div className="space-y-2">
                      <Label>Request Timeout (ms)</Label>
                      <Input type="number" defaultValue="30000" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Feature Flags</h3>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">AI-Powered Optimization</p>
                        <p className="text-sm text-muted-foreground">
                          Enable AI for send time optimization and content suggestions
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">A/B Testing</p>
                        <p className="text-sm text-muted-foreground">
                          Enable multivariate testing for campaigns
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Real-time Analytics</p>
                        <p className="text-sm text-muted-foreground">
                          Stream analytics events in real-time
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Debug Mode</p>
                        <p className="text-sm text-muted-foreground">
                          Enable verbose logging for debugging
                        </p>
                      </div>
                      <Switch />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Maintenance</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Button variant="outline" className="justify-start">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Clear Cache
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <Database className="h-4 w-4 mr-2" />
                      Vacuum Database
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <Clock className="h-4 w-4 mr-2" />
                      Purge Old Logs
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Export Configuration
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
