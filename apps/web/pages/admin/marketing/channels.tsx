import {
  Mail,
  Linkedin,
  Twitter,
  PenTool,
  Megaphone,
  MessageSquare,
  CheckCircle2,
  Settings,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
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

const ChannelsPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

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

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
            <span>Channels</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Channel Configuration</h2>
          <p className="text-muted-foreground">
            Configure and manage marketing channel integrations
          </p>
        </div>

        <Tabs defaultValue="email" className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="linkedin" className="gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </TabsTrigger>
            <TabsTrigger value="twitter" className="gap-2">
              <Twitter className="h-4 w-4" />
              Twitter
            </TabsTrigger>
            <TabsTrigger value="google-ads" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Google Ads
            </TabsTrigger>
            <TabsTrigger value="blog" className="gap-2">
              <PenTool className="h-4 w-4" />
              Blog
            </TabsTrigger>
            <TabsTrigger value="sms" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              SMS
            </TabsTrigger>
          </TabsList>

          {/* Email Channel */}
          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Email Channel
                    </CardTitle>
                    <CardDescription>
                      Configure email service providers and templates
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Input value="SendGrid" readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showSecrets['sendgrid'] ? 'text' : 'password'}
                        value="SG.xxxxxxxxxxxxxxxxxxxxx"
                        readOnly
                        className="bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => toggleSecret('sendgrid')}
                      >
                        {showSecrets['sendgrid'] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Environment Variables</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># Email Provider Configuration</p>
                    <p>EMAIL_PROVIDER=sendgrid</p>
                    <p>SENDGRID_API_KEY=SG.your-api-key</p>
                    <p>EMAIL_FROM=noreply@yourdomain.com</p>
                    <p>EMAIL_FROM_NAME="Your Company"</p>
                    <p className="mt-2"># Optional: Fallback provider</p>
                    <p>EMAIL_FALLBACK_PROVIDER=mailgun</p>
                    <p>MAILGUN_API_KEY=key-xxxxx</p>
                    <p>MAILGUN_DOMAIN=mg.yourdomain.com</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Configuration Options</h4>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Track Opens</p>
                        <p className="text-sm text-muted-foreground">
                          Track when recipients open emails
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Track Clicks</p>
                        <p className="text-sm text-muted-foreground">
                          Track link clicks in emails
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Unsubscribe Link</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically add unsubscribe link
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LinkedIn Channel */}
          <TabsContent value="linkedin" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Linkedin className="h-5 w-5" />
                      LinkedIn Channel
                    </CardTitle>
                    <CardDescription>
                      Connect and configure LinkedIn marketing integration
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-semibold">OAuth Configuration</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># LinkedIn API Configuration</p>
                    <p>LINKEDIN_CLIENT_ID=your-client-id</p>
                    <p>LINKEDIN_CLIENT_SECRET=your-client-secret</p>
                    <p>LINKEDIN_REDIRECT_URI=https://yourdomain.com/auth/linkedin/callback</p>
                    <p className="mt-2"># Company Page ID (for posting)</p>
                    <p>LINKEDIN_COMPANY_ID=12345678</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Available Features</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="p-3 border rounded-lg">
                      <p className="font-medium">Company Page Posts</p>
                      <p className="text-sm text-muted-foreground">
                        Post updates to your company page
                      </p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="font-medium">Sponsored Content</p>
                      <p className="text-sm text-muted-foreground">
                        Create and manage sponsored posts
                      </p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="font-medium">Lead Gen Forms</p>
                      <p className="text-sm text-muted-foreground">
                        Collect leads via LinkedIn forms
                      </p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="font-medium">Analytics</p>
                      <p className="text-sm text-muted-foreground">
                        Track engagement and performance
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Required Scopes</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge>r_liteprofile</Badge>
                    <Badge>r_emailaddress</Badge>
                    <Badge>w_member_social</Badge>
                    <Badge>rw_organization_admin</Badge>
                    <Badge>w_organization_social</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Twitter Channel */}
          <TabsContent value="twitter" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Twitter className="h-5 w-5" />
                      Twitter/X Channel
                    </CardTitle>
                    <CardDescription>
                      Configure Twitter API integration for social posting
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                    Not Connected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-semibold">API v2 Configuration</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># Twitter API v2 Configuration</p>
                    <p>TWITTER_API_KEY=your-api-key</p>
                    <p>TWITTER_API_SECRET=your-api-secret</p>
                    <p>TWITTER_ACCESS_TOKEN=your-access-token</p>
                    <p>TWITTER_ACCESS_SECRET=your-access-secret</p>
                    <p>TWITTER_BEARER_TOKEN=your-bearer-token</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Setup Instructions</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Create a Twitter Developer Account at developer.twitter.com</li>
                    <li>Create a new Project and App in the Developer Portal</li>
                    <li>Enable OAuth 2.0 and set callback URLs</li>
                    <li>Generate API keys and tokens</li>
                    <li>Add the credentials to your environment variables</li>
                  </ol>
                </div>

                <Button>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Connect Twitter Account
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Google Ads Channel */}
          <TabsContent value="google-ads" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Megaphone className="h-5 w-5" />
                      Google Ads Channel
                    </CardTitle>
                    <CardDescription>
                      Connect Google Ads for campaign management and reporting
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-semibold">API Configuration</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># Google Ads API Configuration</p>
                    <p>GOOGLE_ADS_CLIENT_ID=your-client-id.apps.googleusercontent.com</p>
                    <p>GOOGLE_ADS_CLIENT_SECRET=your-client-secret</p>
                    <p>GOOGLE_ADS_DEVELOPER_TOKEN=your-developer-token</p>
                    <p>GOOGLE_ADS_REFRESH_TOKEN=your-refresh-token</p>
                    <p>GOOGLE_ADS_CUSTOMER_ID=123-456-7890</p>
                    <p className="mt-2"># Optional: Manager Account</p>
                    <p>GOOGLE_ADS_LOGIN_CUSTOMER_ID=111-222-3333</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Supported Features</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="p-3 border rounded-lg">
                      <p className="font-medium">Campaign Management</p>
                      <p className="text-sm text-muted-foreground">
                        Create and manage ad campaigns
                      </p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="font-medium">Budget Optimization</p>
                      <p className="text-sm text-muted-foreground">
                        AI-powered budget allocation
                      </p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="font-medium">Conversion Tracking</p>
                      <p className="text-sm text-muted-foreground">
                        Track conversions and ROAS
                      </p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="font-medium">Reporting</p>
                      <p className="text-sm text-muted-foreground">
                        Detailed performance reports
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Blog Channel */}
          <TabsContent value="blog" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PenTool className="h-5 w-5" />
                  Blog Channel
                </CardTitle>
                <CardDescription>
                  Configure blog publishing and content syndication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-semibold">Supported Platforms</h4>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="p-3 border rounded-lg text-center">
                      <p className="font-medium">WordPress</p>
                      <Badge variant="outline" className="mt-2">REST API</Badge>
                    </div>
                    <div className="p-3 border rounded-lg text-center">
                      <p className="font-medium">Ghost</p>
                      <Badge variant="outline" className="mt-2">Admin API</Badge>
                    </div>
                    <div className="p-3 border rounded-lg text-center">
                      <p className="font-medium">Custom CMS</p>
                      <Badge variant="outline" className="mt-2">Webhook</Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">WordPress Configuration</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># WordPress REST API</p>
                    <p>WORDPRESS_URL=https://yourblog.com</p>
                    <p>WORDPRESS_USERNAME=admin</p>
                    <p>WORDPRESS_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Ghost Configuration</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># Ghost Admin API</p>
                    <p>GHOST_URL=https://yourblog.ghost.io</p>
                    <p>GHOST_ADMIN_API_KEY=your-admin-api-key</p>
                    <p>GHOST_CONTENT_API_KEY=your-content-api-key</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SMS Channel */}
          <TabsContent value="sms" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      SMS Channel
                    </CardTitle>
                    <CardDescription>
                      Configure SMS providers for text message campaigns
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-semibold">Twilio Configuration</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p># Twilio SMS Configuration</p>
                    <p>TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx</p>
                    <p>TWILIO_AUTH_TOKEN=your-auth-token</p>
                    <p>TWILIO_PHONE_NUMBER=+1234567890</p>
                    <p className="mt-2"># Optional: Messaging Service</p>
                    <p>TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxx</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Compliance Settings</h4>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Opt-out Handling</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically handle STOP messages
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Quiet Hours</p>
                        <p className="text-sm text-muted-foreground">
                          Don't send SMS between 9 PM - 9 AM local time
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Double Opt-in</p>
                        <p className="text-sm text-muted-foreground">
                          Require confirmation for new subscribers
                        </p>
                      </div>
                      <Switch />
                    </div>
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

export default ChannelsPage;
