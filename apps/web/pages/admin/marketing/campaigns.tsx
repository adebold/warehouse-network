import {
  Mail,
  MessageSquare,
  Bell,
  Share2,
  Play,
  Pause,
  Calendar,
  Target,
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Plus,
  Filter,
  Search,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const CampaignsPage = () => {
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
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link href="/admin/marketing" className="hover:text-primary">
                Marketing Engine
              </Link>
              <span>/</span>
              <span>Campaigns</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Campaign Management</h2>
            <p className="text-muted-foreground">
              Create and manage multi-channel marketing campaigns
            </p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="creation">Creating Campaigns</TabsTrigger>
            <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
            <TabsTrigger value="api">API Reference</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Campaign Types */}
            <Card>
              <CardHeader>
                <CardTitle>Campaign Types</CardTitle>
                <CardDescription>
                  Marketing Engine supports multiple campaign types for comprehensive outreach
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-blue-500" />
                      <span className="font-semibold">Email</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Transactional, promotional, and drip campaigns with A/B testing
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">SendGrid</Badge>
                      <Badge variant="outline">Mailgun</Badge>
                      <Badge variant="outline">SES</Badge>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-green-500" />
                      <span className="font-semibold">SMS</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Text message campaigns with delivery tracking and opt-out handling
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">Twilio</Badge>
                      <Badge variant="outline">Plivo</Badge>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Share2 className="h-5 w-5 text-purple-500" />
                      <span className="font-semibold">Social</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Cross-platform social media posting and engagement tracking
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">LinkedIn</Badge>
                      <Badge variant="outline">Twitter</Badge>
                      <Badge variant="outline">Facebook</Badge>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-orange-500" />
                      <span className="font-semibold">Push</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Web and mobile push notifications with segmentation
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">Firebase</Badge>
                      <Badge variant="outline">OneSignal</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Campaign Lifecycle */}
            <Card>
              <CardHeader>
                <CardTitle>Campaign Lifecycle</CardTitle>
                <CardDescription>
                  Understanding the stages of a marketing campaign
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 items-center justify-center py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium">1</span>
                    </div>
                    <span className="font-medium">Draft</span>
                  </div>
                  <div className="w-8 border-t border-dashed" />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center">
                      <span className="text-sm font-medium">2</span>
                    </div>
                    <span className="font-medium">Scheduled</span>
                  </div>
                  <div className="w-8 border-t border-dashed" />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center">
                      <span className="text-sm font-medium">3</span>
                    </div>
                    <span className="font-medium">Active</span>
                  </div>
                  <div className="w-8 border-t border-dashed" />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-yellow-200 flex items-center justify-center">
                      <span className="text-sm font-medium">4</span>
                    </div>
                    <span className="font-medium">Paused</span>
                  </div>
                  <div className="w-8 border-t border-dashed" />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center">
                      <span className="text-sm font-medium text-white">5</span>
                    </div>
                    <span className="font-medium">Completed</span>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Campaign States</h4>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Draft:</strong> Campaign is being created and configured</li>
                        <li><strong>Scheduled:</strong> Campaign is queued for future execution</li>
                        <li><strong>Active:</strong> Campaign is currently running</li>
                        <li><strong>Paused:</strong> Campaign execution temporarily stopped</li>
                        <li><strong>Completed:</strong> Campaign has finished running</li>
                      </ul>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Automation Triggers</h4>
                      <ul className="space-y-2 text-sm">
                        <li><strong>Time-based:</strong> Schedule at specific date/time</li>
                        <li><strong>Event-based:</strong> Trigger on user actions</li>
                        <li><strong>Behavioral:</strong> Based on user behavior patterns</li>
                        <li><strong>Segment-based:</strong> When users enter segments</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="creation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Creating a Campaign</CardTitle>
                <CardDescription>
                  Step-by-step guide to creating marketing campaigns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Step 1: Define Campaign</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm mb-3">Create a new campaign with basic information:</p>
                    <pre className="font-mono text-sm overflow-x-auto">{`POST /api/v1/campaigns
{
  "name": "Summer Sale 2024",
  "type": "email",
  "description": "Promotional campaign for summer products",
  "budget": 10000,
  "startDate": "2024-06-01T00:00:00Z",
  "endDate": "2024-08-31T23:59:59Z",
  "targetAudience": {
    "segments": ["active-customers", "high-value"],
    "excludeSegments": ["unsubscribed"]
  }
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Step 2: Configure Content</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm mb-3">Add campaign content and variants:</p>
                    <pre className="font-mono text-sm overflow-x-auto">{`POST /api/v1/campaigns/{id}/content
{
  "subject": "Don't Miss Our Summer Sale!",
  "preheader": "Up to 50% off on selected items",
  "template": "promotional-v2",
  "variables": {
    "discount": "50%",
    "ctaText": "Shop Now",
    "ctaUrl": "https://example.com/summer-sale"
  },
  "variants": [
    {
      "name": "Variant A",
      "subject": "Summer Sale: Save Big Today!",
      "weight": 50
    },
    {
      "name": "Variant B",
      "subject": "Your Exclusive Summer Discount Awaits",
      "weight": 50
    }
  ]
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Step 3: Set Schedule</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm mb-3">Configure campaign timing and frequency:</p>
                    <pre className="font-mono text-sm overflow-x-auto">{`POST /api/v1/campaigns/{id}/schedule
{
  "type": "scheduled",
  "sendAt": "2024-06-01T09:00:00Z",
  "timezone": "America/New_York",
  "frequency": "once",
  "throttling": {
    "enabled": true,
    "maxPerHour": 10000,
    "maxPerDay": 50000
  }
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Step 4: Activate Campaign</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm mb-3">Launch the campaign:</p>
                    <pre className="font-mono text-sm overflow-x-auto">{`POST /api/v1/campaigns/{id}/activate
{
  "confirmBudget": true,
  "confirmAudience": true
}

# Response
{
  "id": "camp_123",
  "status": "scheduled",
  "estimatedRecipients": 45000,
  "scheduledAt": "2024-06-01T09:00:00Z"
}`}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scheduling" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Scheduling</CardTitle>
                <CardDescription>
                  Advanced scheduling options for marketing campaigns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      <span className="font-semibold">One-Time Schedule</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Send campaign at a specific date and time
                    </p>
                    <div className="bg-muted p-3 rounded font-mono text-sm">
                      {`"schedule": {
  "type": "once",
  "sendAt": "2024-06-01T09:00:00Z"
}`}
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Recurring Schedule</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Send campaign on a recurring basis
                    </p>
                    <div className="bg-muted p-3 rounded font-mono text-sm">
                      {`"schedule": {
  "type": "recurring",
  "cron": "0 9 * * 1",
  "until": "2024-12-31"
}`}
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Smart Send Time</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      AI-optimized send time per recipient
                    </p>
                    <div className="bg-muted p-3 rounded font-mono text-sm">
                      {`"schedule": {
  "type": "smart",
  "window": "24h",
  "optimizeFor": "open_rate"
}`}
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Timezone Aware</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Send at local time for each recipient
                    </p>
                    <div className="bg-muted p-3 rounded font-mono text-sm">
                      {`"schedule": {
  "type": "timezone",
  "localTime": "09:00",
  "fallback": "UTC"
}`}
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-3">Throttling Configuration</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Control the rate of message delivery to prevent overloading systems or hitting provider limits
                  </p>
                  <div className="bg-muted p-3 rounded font-mono text-sm">
                    {`"throttling": {
  "enabled": true,
  "maxPerSecond": 100,
  "maxPerMinute": 5000,
  "maxPerHour": 100000,
  "maxPerDay": 500000,
  "burstLimit": 500,
  "retryStrategy": {
    "maxRetries": 3,
    "backoffMultiplier": 2,
    "initialDelay": 1000
  }
}`}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Campaign API Reference</CardTitle>
                <CardDescription>
                  Complete API documentation for campaign management
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns</code></TableCell>
                      <TableCell>List all campaigns with pagination</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="default">POST</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns</code></TableCell>
                      <TableCell>Create a new campaign</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns/:id</code></TableCell>
                      <TableCell>Get campaign details</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="secondary">PUT</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns/:id</code></TableCell>
                      <TableCell>Update campaign</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="destructive">DELETE</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns/:id</code></TableCell>
                      <TableCell>Delete campaign</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="default">POST</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns/:id/activate</code></TableCell>
                      <TableCell>Activate/schedule campaign</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="default">POST</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns/:id/pause</code></TableCell>
                      <TableCell>Pause running campaign</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="default">POST</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns/:id/resume</code></TableCell>
                      <TableCell>Resume paused campaign</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns/:id/stats</code></TableCell>
                      <TableCell>Get campaign statistics</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/api/v1/campaigns/:id/recipients</code></TableCell>
                      <TableCell>List campaign recipients</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default CampaignsPage;
