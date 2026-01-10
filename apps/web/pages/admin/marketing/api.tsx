import {
  Server,
  Key,
  Shield,
  Clock,
  Code,
  BookOpen,
  Terminal,
  Copy,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ApiPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

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
            <span>API</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">API Documentation</h2>
          <p className="text-muted-foreground">
            RESTful API reference and integration guides
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="authentication">Authentication</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="sdk">SDK</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Base URL</CardTitle>
                  <Server className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <code className="text-sm">https://api.marketing-engine.com</code>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Version</CardTitle>
                  <Code className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <code className="text-sm">v1</code>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rate Limit</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <code className="text-sm">1000 req/min</code>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Format</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <code className="text-sm">JSON</code>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Quick Start</CardTitle>
                <CardDescription>
                  Make your first API request in minutes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`curl -X GET "https://api.marketing-engine.com/v1/campaigns" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}</pre>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard('curl -X GET...', 'quick-start')}
                  >
                    {copiedCode === 'quick-start' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Response</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`{
  "data": [
    {
      "id": "camp_123abc",
      "name": "Summer Sale 2024",
      "status": "active",
      "type": "email",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "meta": {
    "total": 24,
    "page": 1,
    "per_page": 20
  }
}`}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="authentication" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Authentication
                </CardTitle>
                <CardDescription>
                  Secure your API requests with JWT tokens
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Bearer Token Authentication</h3>
                  <p className="text-sm text-muted-foreground">
                    All API requests must include a valid JWT token in the Authorization header.
                  </p>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p>Authorization: Bearer {'<your-jwt-token>'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Obtaining an Access Token</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`POST /api/v1/auth/token
Content-Type: application/json

{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "grant_type": "client_credentials"
}

# Response
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "dGhpcyBpcyBhIHJl..."
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Refreshing Tokens</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "your-refresh-token",
  "grant_type": "refresh_token"
}`}</pre>
                  </div>
                </div>

                <div className="p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                  <div className="flex items-start gap-2">
                    <Shield className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">Security Best Practices</p>
                      <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 space-y-1">
                        <li>• Never expose API keys in client-side code</li>
                        <li>• Rotate API keys regularly</li>
                        <li>• Use environment variables for credentials</li>
                        <li>• Implement IP whitelisting for production</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="endpoints" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Endpoints</CardTitle>
                <CardDescription>
                  Complete list of available API endpoints
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-lg mb-3">Campaigns</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Method</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell><Badge className="bg-green-500">GET</Badge></TableCell>
                          <TableCell><code>/v1/campaigns</code></TableCell>
                          <TableCell>List all campaigns</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-blue-500">POST</Badge></TableCell>
                          <TableCell><code>/v1/campaigns</code></TableCell>
                          <TableCell>Create a new campaign</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-green-500">GET</Badge></TableCell>
                          <TableCell><code>/v1/campaigns/:id</code></TableCell>
                          <TableCell>Get campaign details</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-yellow-500">PUT</Badge></TableCell>
                          <TableCell><code>/v1/campaigns/:id</code></TableCell>
                          <TableCell>Update campaign</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-red-500">DELETE</Badge></TableCell>
                          <TableCell><code>/v1/campaigns/:id</code></TableCell>
                          <TableCell>Delete campaign</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <h3 className="font-semibold text-lg mb-3">Contacts</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Method</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell><Badge className="bg-green-500">GET</Badge></TableCell>
                          <TableCell><code>/v1/contacts</code></TableCell>
                          <TableCell>List all contacts</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-blue-500">POST</Badge></TableCell>
                          <TableCell><code>/v1/contacts</code></TableCell>
                          <TableCell>Create a new contact</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-blue-500">POST</Badge></TableCell>
                          <TableCell><code>/v1/contacts/bulk</code></TableCell>
                          <TableCell>Bulk create contacts</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-green-500">GET</Badge></TableCell>
                          <TableCell><code>/v1/contacts/:id</code></TableCell>
                          <TableCell>Get contact details</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <h3 className="font-semibold text-lg mb-3">Analytics</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Method</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell><Badge className="bg-green-500">GET</Badge></TableCell>
                          <TableCell><code>/v1/analytics/campaigns/:id</code></TableCell>
                          <TableCell>Get campaign analytics</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-green-500">GET</Badge></TableCell>
                          <TableCell><code>/v1/analytics/overview</code></TableCell>
                          <TableCell>Get analytics overview</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-blue-500">POST</Badge></TableCell>
                          <TableCell><code>/v1/analytics/events</code></TableCell>
                          <TableCell>Track custom event</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><Badge className="bg-green-500">GET</Badge></TableCell>
                          <TableCell><code>/v1/analytics/kpis</code></TableCell>
                          <TableCell>Get KPI metrics</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sdk" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SDK & Libraries</CardTitle>
                <CardDescription>
                  Official SDKs for popular programming languages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-5 w-5" />
                      <span className="font-semibold">Node.js / TypeScript</span>
                    </div>
                    <div className="bg-muted p-3 rounded font-mono text-sm">
                      <p>npm install @marketing-engine/sdk</p>
                    </div>
                    <div className="bg-muted p-3 rounded font-mono text-sm">
                      <pre>{`import { MarketingEngine } from '@marketing-engine/sdk';

const client = new MarketingEngine({
  apiKey: process.env.ME_API_KEY
});

const campaigns = await client.campaigns.list();`}</pre>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-5 w-5" />
                      <span className="font-semibold">Python</span>
                    </div>
                    <div className="bg-muted p-3 rounded font-mono text-sm">
                      <p>pip install marketing-engine</p>
                    </div>
                    <div className="bg-muted p-3 rounded font-mono text-sm">
                      <pre>{`from marketing_engine import Client

client = Client(api_key=os.environ['ME_API_KEY'])

campaigns = client.campaigns.list()`}</pre>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>
                  Receive real-time notifications for events
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Available Events</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell><code>campaign.created</code></TableCell>
                        <TableCell>A new campaign was created</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>campaign.started</code></TableCell>
                        <TableCell>A campaign started sending</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>campaign.completed</code></TableCell>
                        <TableCell>A campaign finished sending</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>email.bounced</code></TableCell>
                        <TableCell>An email bounced</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>contact.unsubscribed</code></TableCell>
                        <TableCell>A contact unsubscribed</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><code>conversion.completed</code></TableCell>
                        <TableCell>A conversion goal was achieved</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Webhook Payload</h3>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`{
  "id": "evt_123abc",
  "type": "campaign.completed",
  "created_at": "2024-01-15T10:30:00Z",
  "data": {
    "campaign_id": "camp_456def",
    "name": "Summer Sale 2024",
    "stats": {
      "sent": 10000,
      "delivered": 9800,
      "opened": 3200,
      "clicked": 450
    }
  }
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Webhook Security</h3>
                  <p className="text-sm text-muted-foreground">
                    Verify webhook signatures to ensure authenticity:
                  </p>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <pre>{`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from('sha256=' + expected)
  );
}`}</pre>
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

export default ApiPage;
