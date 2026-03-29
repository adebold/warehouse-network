# Warehouse Network Notifications System

Enterprise-grade notification and communication system supporting multiple channels, real-time delivery, and advanced workflow automation.

## Features

- **Multi-Channel Support**: Email, SMS, Push notifications, Webhooks, In-app notifications
- **Template Engine**: Handlebars-based templates with variable substitution and helpers
- **User Preferences**: Granular notification preferences with quiet hours and opt-out controls
- **Workflow Automation**: Event-driven workflows with conditions, triggers, and actions
- **Real-time Analytics**: Comprehensive metrics and delivery tracking
- **Enterprise Security**: Rate limiting, input validation, and secure webhook signatures
- **High Performance**: Redis-based queuing, bulk operations, and async processing
- **Resilient Architecture**: Retry policies, error handling, and graceful degradation

## Installation

```bash
npm install @warehouse-network/notifications
```

## Quick Start

```typescript
import { createNotificationEngine, NotificationChannel, NotificationPriority, NotificationCategory } from '@warehouse-network/notifications';

// Initialize the notification engine
const engine = createNotificationEngine({
  redis: {
    host: 'localhost',
    port: 6379
  },
  email: {
    provider: 'smtp',
    host: 'smtp.example.com',
    port: 587,
    auth: {
      user: 'notifications@example.com',
      pass: 'your-password'
    },
    fromAddress: 'noreply@example.com',
    fromName: 'Your App'
  },
  analytics: {
    enabled: true,
    retentionDays: 90
  }
});

// Initialize the engine
await engine.initialize();

// Send a notification
const resultIds = await engine.send({
  recipients: [{
    id: 'user-123',
    type: 'user',
    userId: 'user-123',
    email: 'user@example.com'
  }],
  content: 'Welcome to our platform!',
  subject: 'Welcome!',
  channels: [NotificationChannel.EMAIL],
  priority: NotificationPriority.NORMAL,
  category: NotificationCategory.USER_ACTION
});

console.log('Notification sent:', resultIds);
```

## API Reference

### NotificationEngine

The main class for managing notifications.

#### Constructor

```typescript
new NotificationEngine(config: NotificationEngineConfig)
```

#### Methods

##### `initialize(): Promise<void>`

Initialize the notification engine and all providers.

##### `send(request: NotificationRequest): Promise<string[]>`

Send a notification to recipients.

```typescript
const resultIds = await engine.send({
  recipients: [
    {
      id: 'user-123',
      type: 'user',
      userId: 'user-123',
      email: 'user@example.com',
      phone: '+1234567890'
    }
  ],
  content: 'Your order has been shipped!',
  subject: 'Order Update',
  channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
  priority: NotificationPriority.HIGH,
  category: NotificationCategory.OPERATIONAL,
  variables: {
    orderNumber: 'ORD-12345',
    trackingNumber: 'TRK-67890'
  },
  metadata: {
    campaignId: 'shipping-updates'
  }
});
```

##### `sendBulk(requests: NotificationRequest[]): Promise<string[][]>`

Send multiple notifications in bulk.

```typescript
const results = await engine.sendBulk([
  {
    recipients: [{ id: 'user-1', type: 'user', email: 'user1@example.com' }],
    content: 'Message 1',
    channels: [NotificationChannel.EMAIL],
    priority: NotificationPriority.NORMAL,
    category: NotificationCategory.MARKETING
  },
  {
    recipients: [{ id: 'user-2', type: 'user', email: 'user2@example.com' }],
    content: 'Message 2',
    channels: [NotificationChannel.EMAIL],
    priority: NotificationPriority.NORMAL,
    category: NotificationCategory.MARKETING
  }
]);
```

##### `getStatus(notificationId: string): Promise<NotificationResult | null>`

Get the status of a notification.

##### `getMetrics(startDate: Date, endDate: Date, organizationId?: string): Promise<NotificationMetrics>`

Get analytics metrics for a time period.

##### `registerTemplate(template: NotificationTemplate): Promise<void>`

Register a notification template.

##### `shutdown(): Promise<void>`

Gracefully shutdown the notification engine.

### Templates

Templates support Handlebars syntax with built-in helpers.

#### Creating a Template

```typescript
const template: NotificationTemplate = {
  id: 'order-confirmation',
  name: 'Order Confirmation',
  category: NotificationCategory.OPERATIONAL,
  channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
  content: {
    email: {
      subject: 'Order Confirmation - {{orderNumber}}',
      body: `Hi {{customerName}},

Your order has been confirmed!

Order Details:
- Order Number: {{orderNumber}}
- Total: {{formatCurrency totalAmount currency}}
- Estimated Delivery: {{formatDate estimatedDelivery 'long'}}

Thank you for your business!`,
      htmlBody: `<h1>Order Confirmation</h1>
<p>Hi {{customerName}},</p>
<p>Your order {{orderNumber}} has been confirmed!</p>
<ul>
  <li>Total: {{formatCurrency totalAmount currency}}</li>
  <li>Estimated Delivery: {{formatDate estimatedDelivery 'long'}}</li>
</ul>`
    },
    sms: {
      body: 'Order {{orderNumber}} confirmed! Total: {{formatCurrency totalAmount currency}}. Delivery: {{formatDate estimatedDelivery "short"}}'
    }
  },
  variables: [
    { name: 'customerName', type: 'string', required: true },
    { name: 'orderNumber', type: 'string', required: true },
    { name: 'totalAmount', type: 'number', required: true },
    { name: 'currency', type: 'string', required: true },
    { name: 'estimatedDelivery', type: 'date', required: true }
  ],
  priority: NotificationPriority.HIGH,
  version: '1.0.0',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

await engine.registerTemplate(template);
```

#### Using a Template

```typescript
await engine.send({
  templateId: 'order-confirmation',
  recipients: [{
    id: 'customer-123',
    type: 'user',
    email: 'customer@example.com',
    phone: '+1234567890'
  }],
  channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
  priority: NotificationPriority.HIGH,
  category: NotificationCategory.OPERATIONAL,
  variables: {
    customerName: 'John Doe',
    orderNumber: 'ORD-12345',
    totalAmount: 9999, // in cents
    currency: 'USD',
    estimatedDelivery: new Date('2024-02-15')
  }
});
```

### Built-in Template Helpers

The template engine includes several helpful Handlebars helpers:

```handlebars
{{!-- Date formatting --}}
{{formatDate date 'short'}}    {{!-- 2/15/2024 --}}
{{formatDate date 'long'}}     {{!-- February 15, 2024 --}}
{{formatDate date 'time'}}     {{!-- 3:30 PM --}}

{{!-- Currency formatting --}}
{{formatCurrency 9999 'USD'}}  {{!-- $99.99 --}}

{{!-- Text helpers --}}
{{capitalize 'hello world'}}   {{!-- Hello world --}}

{{!-- Conditionals --}}
{{#if (eq status 'shipped')}}
  Your order has been shipped!
{{/if}}

{{#if (gt quantity 1)}}
  You ordered {{quantity}} items.
{{/if}}

{{!-- Array helpers --}}
{{#each items}}
  {{@index}}: {{this.name}} - {{formatCurrency this.price 'USD'}}
{{/each}}

{{!-- JSON output --}}
{{json metadata}}
```

### User Preferences

Manage user notification preferences with granular controls.

```typescript
import { PreferenceManager } from '@warehouse-network/notifications';

const preferenceManager = new PreferenceManager(redis);

// Update user preferences
await preferenceManager.updatePreferences('user-123', {
  channels: {
    email: {
      enabled: true,
      priority: [NotificationPriority.HIGH, NotificationPriority.CRITICAL],
      categories: [NotificationCategory.SECURITY, NotificationCategory.BILLING],
      quietHours: {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'America/New_York'
      }
    },
    sms: {
      enabled: true,
      priority: [NotificationPriority.CRITICAL],
      categories: [NotificationCategory.SECURITY]
    },
    push: {
      enabled: true,
      priority: [NotificationPriority.NORMAL, NotificationPriority.HIGH, NotificationPriority.CRITICAL]
    }
  },
  frequency: {
    digest: false,
    immediate: true
  },
  optOut: {
    marketing: false,
    promotional: true
  }
});

// Check if user can receive a notification
const canReceive = await preferenceManager.canReceiveNotification(
  'user-123',
  NotificationChannel.EMAIL,
  NotificationCategory.MARKETING,
  NotificationPriority.NORMAL
);
```

### In-App Notifications

The in-app notification provider manages real-time notifications within your application.

```typescript
import { createInAppProvider } from '@warehouse-network/notifications';

const inAppProvider = createInAppProvider({
  redis,
  maxNotificationsPerUser: 1000,
  retentionDays: 30,
  enableRealTimeUpdates: true
});

// Get user notifications with pagination
const notifications = await inAppProvider.getUserNotifications('user-123', {
  limit: 20,
  offset: 0,
  includeRead: false,
  category: NotificationCategory.SYSTEM
});

// Mark notification as read
await inAppProvider.markAsRead('notification-id', 'user-123');

// Mark all notifications as read
await inAppProvider.markAllAsRead('user-123');

// Archive notification
await inAppProvider.archiveNotification('notification-id', 'user-123');

// Get unread count
const unreadCount = await inAppProvider.getUnreadCount('user-123');
```

### Workflow Automation

Create automated notification workflows with triggers, conditions, and actions.

```typescript
import { WorkflowEngine } from '@warehouse-network/notifications';

const workflowEngine = new WorkflowEngine(redis, notificationEngine);
await workflowEngine.initialize();

// Create a workflow
const workflow: NotificationWorkflow = {
  id: 'low-stock-alert',
  name: 'Low Stock Alert Workflow',
  description: 'Alert when inventory levels are low',
  isActive: true,
  priority: 1,
  triggers: [{
    id: 'inventory-check',
    name: 'Daily Inventory Check',
    type: 'schedule',
    cronExpression: '0 9 * * *' // Daily at 9 AM
  }],
  conditions: [{
    id: 'stock-level-check',
    field: 'currentStock',
    operator: 'less_than',
    value: 10
  }],
  actions: [{
    id: 'send-alert',
    type: 'send_notification',
    notification: {
      templateId: 'low-stock-alert',
      channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      priority: NotificationPriority.HIGH,
      category: NotificationCategory.INVENTORY,
      recipients: [{
        type: 'role',
        roleSlug: 'inventory-manager'
      }]
    }
  }],
  createdAt: new Date(),
  updatedAt: new Date(),
  executionCount: 0
};

await workflowEngine.registerWorkflow(workflow);

// Trigger workflow by event
await workflowEngine.triggerByEvent('inventory.updated', {
  itemId: 'item-123',
  currentStock: 5,
  minThreshold: 10,
  warehouseName: 'Main Warehouse'
});
```

### Analytics

Track notification performance and user engagement.

```typescript
import { AnalyticsCollector } from '@warehouse-network/notifications';

const analytics = new AnalyticsCollector(redis, {
  enabled: true,
  retentionDays: 90,
  aggregationIntervals: {
    hourly: true,
    daily: true,
    weekly: false,
    monthly: false
  },
  enableRealTimeMetrics: true
});

await analytics.initialize();

// Get real-time metrics
const realTimeMetrics = await analytics.getRealTimeMetrics();
console.log('Sent:', realTimeMetrics.sent);
console.log('Delivered:', realTimeMetrics.delivered);
console.log('Failed:', realTimeMetrics.failed);

// Get metrics for date range
const metrics = await analytics.getMetrics(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

console.log('Total sent:', metrics.totalSent);
console.log('Delivery rate:', metrics.deliveryRate);
console.log('Email performance:', metrics.byChannel.email);
console.log('Security alerts:', metrics.byCategory.security);

// Get channel performance
const channelPerformance = await analytics.getChannelPerformance(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

channelPerformance.forEach(channel => {
  console.log(`${channel.channel}: ${channel.deliveryRate * 100}% delivery rate`);
});

// Get top failure reasons
const failureReasons = await analytics.getTopFailureReasons(
  new Date('2024-01-01'),
  new Date('2024-01-31'),
  10
);

failureReasons.forEach(reason => {
  console.log(`${reason.reason}: ${reason.count} failures (${reason.percentage.toFixed(1)}%)`);
});
```

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0

# Email Configuration
EMAIL_PROVIDER=smtp|sendgrid|mailgun|ses
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASSWORD=your-password
EMAIL_FROM_ADDRESS=noreply@example.com
EMAIL_FROM_NAME=Your App

# SendGrid
SENDGRID_API_KEY=your-sendgrid-api-key

# Twilio SMS
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1234567890

# Firebase Push Notifications
FIREBASE_SERVICE_ACCOUNT_KEY=path/to/service-account-key.json

# Webhooks
WEBHOOK_SIGNATURE_SECRET=your-webhook-secret
WEBHOOK_TIMEOUT=30000

# Logging
LOG_LEVEL=info|warn|error|debug
NODE_ENV=development|production|test
```

### Provider Configuration

#### Email Providers

```typescript
// SMTP
{
  provider: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: 'username',
    pass: 'password'
  },
  fromAddress: 'noreply@example.com',
  fromName: 'Your App'
}

// SendGrid
{
  provider: 'sendgrid',
  apiKey: 'your-sendgrid-api-key',
  fromAddress: 'noreply@example.com',
  fromName: 'Your App'
}

// Amazon SES
{
  provider: 'ses',
  region: 'us-east-1',
  auth: {
    user: 'your-access-key-id',
    pass: 'your-secret-access-key'
  },
  fromAddress: 'noreply@example.com',
  fromName: 'Your App'
}
```

#### SMS Providers

```typescript
// Twilio
{
  provider: 'twilio',
  accountSid: 'your-account-sid',
  authToken: 'your-auth-token',
  fromNumber: '+1234567890'
}

// AWS SNS
{
  provider: 'aws-sns',
  apiKey: 'your-access-key-id',
  apiSecret: 'your-secret-access-key',
  fromNumber: '+1234567890'
}
```

#### Push Notification Providers

```typescript
// Firebase Cloud Messaging
{
  provider: 'fcm',
  serviceAccountKey: '/path/to/service-account-key.json',
  // or as object:
  serviceAccountKey: {
    type: 'service_account',
    project_id: 'your-project-id',
    private_key_id: 'key-id',
    private_key: 'private-key',
    client_email: 'firebase-adminsdk@project.iam.gserviceaccount.com',
    // ... other fields
  }
}

// Apple Push Notification Service
{
  provider: 'apns',
  keyId: 'your-key-id',
  teamId: 'your-team-id',
  bundleId: 'com.yourapp.bundle',
  privateKey: 'path/to/AuthKey.p8',
  production: false
}
```

## Error Handling

The notification system provides comprehensive error handling and retry mechanisms.

### Retry Policies

```typescript
const engine = createNotificationEngine({
  // ... other config
  defaultRetryPolicy: {
    maxAttempts: 3,
    backoffStrategy: 'exponential', // 'linear', 'exponential', 'fixed'
    initialDelay: 1000, // milliseconds
    maxDelay: 30000
  }
});
```

### Error Types

```typescript
import { NotificationStatus } from '@warehouse-network/notifications';

// Check notification result
const results = await engine.send(request);
const status = await engine.getStatus(results[0]);

switch (status?.status) {
  case NotificationStatus.SENT:
    console.log('Notification sent successfully');
    break;
  case NotificationStatus.DELIVERED:
    console.log('Notification delivered');
    break;
  case NotificationStatus.FAILED:
    console.log('Notification failed:', status.error);
    break;
  case NotificationStatus.PENDING:
    console.log('Notification is pending');
    break;
}
```

### Validation Errors

```typescript
import { validateNotificationRequest } from '@warehouse-network/notifications';

const validation = validateNotificationRequest(request);
if (!validation.isValid) {
  console.log('Validation errors:', validation.errors);
}
```

## Security

### Rate Limiting

Rate limits are enforced per channel to prevent abuse:

```typescript
const config = {
  rateLimits: {
    email: {
      perSecond: 10,
      perMinute: 100,
      perHour: 1000
    },
    sms: {
      perSecond: 1,
      perMinute: 10,
      perHour: 100
    },
    push: {
      perSecond: 100,
      perMinute: 1000,
      perHour: 10000
    }
  }
};
```

### Webhook Security

Webhook notifications include HMAC signatures for verification:

```typescript
import crypto from 'crypto';

// Verify webhook signature
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Input Validation

All inputs are validated and sanitized:

```typescript
import { sanitizeContent, validateRecipient } from '@warehouse-network/notifications';

// Sanitize content for specific channels
const sanitized = sanitizeContent(userInput, NotificationChannel.EMAIL);

// Validate recipients
const validation = validateRecipient(recipient);
if (!validation.isValid) {
  console.log('Invalid recipient:', validation.errors);
}
```

## Performance

### Bulk Operations

Use bulk operations for better performance:

```typescript
// Instead of multiple individual sends
const results = [];
for (const user of users) {
  results.push(await engine.send(createRequestForUser(user)));
}

// Use bulk send
const requests = users.map(createRequestForUser);
const results = await engine.sendBulk(requests);
```

### Connection Pooling

Redis connections are pooled and reused across requests. Configure connection limits:

```typescript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  maxLoadingTimeout: 5000
});
```

### Monitoring

Monitor performance with built-in metrics:

```typescript
// Get queue statistics
const queueStats = await engine.getQueueStats();
console.log('Pending:', queueStats.pending);
console.log('Processing:', queueStats.processing);
console.log('Completed:', queueStats.completed);
console.log('Failed:', queueStats.failed);
```

## Testing

The package includes comprehensive test utilities:

```typescript
import { createMockNotificationEngine } from '@warehouse-network/notifications/testing';

describe('My App Notifications', () => {
  let engine: NotificationEngine;

  beforeEach(() => {
    engine = createMockNotificationEngine();
  });

  it('should send welcome notification', async () => {
    const resultIds = await engine.send({
      recipients: [{ id: 'user-1', type: 'user', email: 'test@example.com' }],
      content: 'Welcome!',
      channels: [NotificationChannel.EMAIL],
      priority: NotificationPriority.NORMAL,
      category: NotificationCategory.USER_ACTION
    });

    expect(resultIds).toHaveLength(1);
  });
});
```

## Migration

### From v0.x to v1.x

The v1.x release includes breaking changes:

1. **Configuration Changes**: Provider configuration has been simplified
2. **Template Variables**: Template variable validation is now stricter
3. **Error Handling**: Error types have been restructured

See [MIGRATION.md](./MIGRATION.md) for detailed migration instructions.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to this package.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- 📖 [Documentation](https://docs.warehouse-network.com/notifications)
- 🐛 [Issue Tracker](https://github.com/warehouse-network/notifications/issues)
- 💬 [Discussions](https://github.com/warehouse-network/notifications/discussions)
- 📧 [Email Support](mailto:support@warehouse-network.com)