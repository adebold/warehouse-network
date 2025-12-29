# SDK Documentation

## Overview

Marketing Engine provides official SDKs for TypeScript/JavaScript, Python, Go, and Ruby. All SDKs offer type safety, automatic retries, and intelligent rate limit handling.

## Installation

### TypeScript/JavaScript

```bash
npm install @marketing-engine/sdk
# or
yarn add @marketing-engine/sdk
# or
pnpm add @marketing-engine/sdk
```

### Python

```bash
pip install marketing-engine
# or
poetry add marketing-engine
```

### Go

```bash
go get github.com/marketing-engine/go-sdk
```

### Ruby

```bash
gem install marketing_engine
# or add to Gemfile
gem 'marketing_engine'
```

## TypeScript/JavaScript SDK

### Initialization

```typescript
import { MarketingEngine } from '@marketing-engine/sdk';

const client = new MarketingEngine({
  // Authentication
  accessToken: 'your-access-token',
  refreshToken: 'your-refresh-token', // Optional: enables auto-refresh
  apiKey: 'your-api-key', // Alternative to tokens
  
  // Configuration
  baseURL: 'https://api.marketingengine.io', // Optional: custom API URL
  timeout: 30000, // Optional: request timeout in ms
  retries: 3, // Optional: number of retries
  
  // Callbacks
  onTokenRefresh: (tokens) => {
    // Called when tokens are refreshed
    saveTokens(tokens);
  },
  
  onRateLimit: (retryAfter) => {
    // Called when rate limited
    console.log(`Rate limited. Retrying after ${retryAfter}s`);
  }
});
```

### Content Management

```typescript
// Publish content to multiple channels
const result = await client.content.publish({
  title: 'AI in E-commerce: 2024 Trends',
  body: 'Content body with **markdown** support...',
  targetChannels: ['linkedin', 'twitter', 'blog'],
  scheduledFor: new Date('2024-01-15T10:00:00Z'), // Optional: schedule
  utmParams: {
    source: 'blog',
    medium: 'organic',
    campaign: 'thought-leadership-q1'
  },
  metadata: {
    author: 'Jane Doe',
    category: 'AI/ML',
    tags: ['ai', 'ecommerce', 'trends']
  }
});

console.log(result);
// {
//   contentId: 'c123e456-...',
//   status: 'published',
//   channels: [
//     { channel: 'linkedin', status: 'success', publishedUrl: 'https://...' },
//     { channel: 'twitter', status: 'success', publishedUrl: 'https://...' },
//     { channel: 'blog', status: 'success', publishedUrl: 'https://...' }
//   ]
// }

// List published content
const contents = await client.content.list({
  channel: 'linkedin',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  page: 1,
  limit: 50
});

// Get content details with performance metrics
const content = await client.content.get('c123e456-...');

// Update content
await client.content.update('c123e456-...', {
  title: 'Updated Title',
  metadata: { updated: true }
});

// Delete content
await client.content.delete('c123e456-...');
```

### Channel Management

```typescript
// Configure LinkedIn channel
await client.channels.configure({
  type: 'linkedin',
  name: 'Company LinkedIn',
  credentials: {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    companyId: '12345678'
  },
  settings: {
    defaultHashtags: ['#AI', '#TechTrends'],
    autoSchedule: {
      enabled: true,
      timezone: 'America/New_York',
      slots: ['09:00', '14:00', '17:00']
    }
  }
});

// Test channel connectivity
const test = await client.channels.test('linkedin');
console.log(test);
// { connected: true, message: 'Successfully connected', capabilities: ['post', 'analytics'] }

// List all channels
const channels = await client.channels.list();

// Pause/resume channel
await client.channels.pause('ch_123');
await client.channels.resume('ch_123');
```

### KPI Analytics

```typescript
// Get comprehensive KPIs
const kpis = await client.analytics.getKPIs({
  period: 'last-30-days',
  channels: ['linkedin', 'google'],
  metrics: ['cpl', 'cac', 'roas', 'conversions']
});

console.log(kpis);
// {
//   period: { start: '2024-12-01', end: '2024-12-31' },
//   overall: {
//     totalSpend: 5000,
//     totalLeads: 47,
//     totalCustomers: 5,
//     blendedCPL: 106.38,
//     blendedCAC: 1000,
//     revenue: 18000,
//     ltv: 3600,
//     ltvCacRatio: 3.6
//   },
//   byChannel: {
//     linkedin: { spend: 2000, leads: 23, cpl: 86.96, efficiency: 'high' },
//     google: { spend: 3000, leads: 24, cpl: 125, efficiency: 'medium' }
//   }
// }

// Get attribution paths
const attribution = await client.analytics.getAttribution({
  model: 'multiTouch',
  period: 'last-90-days'
});

// Generate custom report
const report = await client.analytics.generateReport({
  type: 'performance',
  dimensions: ['channel', 'campaign', 'content_type'],
  metrics: ['impressions', 'clicks', 'conversions', 'revenue'],
  filters: {
    channel: ['linkedin', 'google'],
    campaign: { contains: 'q4' }
  },
  period: {
    start: '2024-10-01',
    end: '2024-12-31'
  }
});
```

### Campaign Management

```typescript
// Create LinkedIn campaign
const campaign = await client.campaigns.create({
  name: 'Q1 2024 Thought Leadership',
  channel: 'linkedin',
  budget: {
    daily: 100,
    total: 3000
  },
  targeting: {
    jobTitles: ['CTO', 'VP Engineering', 'Director of Technology'],
    companies: { size: ['1000-5000', '5000+'] },
    industries: ['Computer Software', 'Information Technology'],
    locations: ['United States', 'Canada']
  },
  creative: {
    headline: 'Transform Your Tech Stack with AI',
    description: 'Learn how leading companies...',
    image: 'https://cdn.example.com/campaign-image.jpg',
    cta: 'Learn More',
    landingPage: 'https://example.com/ai-transformation'
  },
  schedule: {
    startDate: '2024-01-01',
    endDate: '2024-03-31'
  }
});

// Monitor campaign performance
const performance = await client.campaigns.getPerformance(campaign.id);

// Optimize campaign
await client.campaigns.optimize(campaign.id, {
  targetCPL: 75,
  adjustBidding: true,
  pausePoorPerformers: true
});

// A/B test creatives
await client.campaigns.createABTest(campaign.id, {
  variants: [
    { headline: 'AI Revolution in Tech', weight: 50 },
    { headline: 'Future-Proof Your Tech Stack', weight: 50 }
  ],
  metrics: ['ctr', 'conversions'],
  duration: 14 // days
});
```

### Webhook Management

```typescript
// Register webhook
const webhook = await client.webhooks.create({
  url: 'https://your-app.com/webhooks/marketing',
  events: ['content.published', 'lead.created', 'campaign.completed'],
  secret: 'your-webhook-secret', // For HMAC verification
  headers: {
    'X-Custom-Header': 'value'
  }
});

// Verify webhook signature (in your webhook handler)
import { verifyWebhookSignature } from '@marketing-engine/sdk';

app.post('/webhooks/marketing', (req, res) => {
  const signature = req.headers['x-marketing-engine-signature'];
  const isValid = verifyWebhookSignature(
    req.body,
    signature,
    'your-webhook-secret'
  );
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook
  const event = req.body;
  console.log(`Received ${event.type} event`);
});

// List webhooks
const webhooks = await client.webhooks.list();

// Update webhook
await client.webhooks.update(webhook.id, {
  events: ['content.published', 'lead.created']
});

// Delete webhook
await client.webhooks.delete(webhook.id);
```

### Error Handling

```typescript
import { 
  MarketingEngineError,
  RateLimitError,
  ValidationError,
  AuthenticationError 
} from '@marketing-engine/sdk';

try {
  await client.content.publish({ /* ... */ });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ValidationError) {
    console.log('Validation errors:', error.errors);
  } else if (error instanceof AuthenticationError) {
    console.log('Authentication failed:', error.message);
    // Trigger re-authentication
  } else if (error instanceof MarketingEngineError) {
    console.log('API error:', error.code, error.message);
  } else {
    console.log('Unexpected error:', error);
  }
}
```

### Advanced Features

#### Batch Operations

```typescript
// Batch publish content
const results = await client.content.publishBatch([
  { title: 'Post 1', body: '...', targetChannels: ['linkedin'] },
  { title: 'Post 2', body: '...', targetChannels: ['twitter'] },
  { title: 'Post 3', body: '...', targetChannels: ['blog'] }
]);

// Batch update campaigns
await client.campaigns.updateBatch([
  { id: 'campaign1', budget: { daily: 150 } },
  { id: 'campaign2', status: 'paused' },
  { id: 'campaign3', endDate: '2024-04-30' }
]);
```

#### Streaming Analytics

```typescript
// Stream real-time metrics
const stream = client.analytics.stream({
  metrics: ['impressions', 'clicks', 'conversions'],
  channels: ['linkedin', 'google'],
  interval: 5000 // 5 seconds
});

stream.on('data', (metrics) => {
  console.log('Real-time metrics:', metrics);
});

stream.on('error', (error) => {
  console.error('Stream error:', error);
});

// Stop streaming
stream.close();
```

#### Async Iterators

```typescript
// Iterate through all content with automatic pagination
for await (const content of client.content.iterate({ channel: 'blog' })) {
  console.log(content.title);
}

// Process large datasets efficiently
for await (const batch of client.analytics.exportData({ 
  format: 'jsonl',
  batchSize: 1000 
})) {
  await processDataBatch(batch);
}
```

## Python SDK

### Installation and Setup

```python
from marketing_engine import Client
from marketing_engine.exceptions import RateLimitError, ValidationError

# Initialize client
client = Client(
    access_token="your-access-token",
    refresh_token="your-refresh-token",
    auto_refresh=True,  # Automatically refresh tokens
    max_retries=3,
    timeout=30
)

# Or use API key
client = Client(api_key="your-api-key")

# Configure callbacks
def on_token_refresh(tokens):
    # Save new tokens
    save_tokens(tokens)

def on_rate_limit(retry_after):
    print(f"Rate limited. Retrying after {retry_after}s")

client.on_token_refresh = on_token_refresh
client.on_rate_limit = on_rate_limit
```

### Content Operations

```python
# Publish content
result = client.content.publish(
    title="AI in E-commerce: 2024 Trends",
    body="Content body with **markdown** support...",
    target_channels=["linkedin", "twitter", "blog"],
    scheduled_for="2024-01-15T10:00:00Z",
    utm_params={
        "source": "blog",
        "medium": "organic",
        "campaign": "thought-leadership-q1"
    },
    metadata={
        "author": "Jane Doe",
        "category": "AI/ML",
        "tags": ["ai", "ecommerce", "trends"]
    }
)

# List content with filters
contents = client.content.list(
    channel="linkedin",
    start_date="2024-01-01",
    end_date="2024-01-31",
    page=1,
    limit=50
)

# Iterate through all content
for content in client.content.iterate(channel="blog"):
    print(f"{content.title}: {content.metrics.views} views")

# Async operations
import asyncio

async def publish_multiple():
    tasks = [
        client.content.publish_async(title=f"Post {i}", body="...", target_channels=["linkedin"])
        for i in range(10)
    ]
    results = await asyncio.gather(*tasks)
    return results
```

### Analytics

```python
# Get KPIs
kpis = client.analytics.get_kpis(
    period="last-30-days",
    channels=["linkedin", "google"],
    metrics=["cpl", "cac", "roas", "conversions"]
)

print(f"Blended CPL: ${kpis.overall.blended_cpl}")
print(f"LTV:CAC Ratio: {kpis.overall.ltv_cac_ratio}")

# Export data to pandas DataFrame
import pandas as pd

df = client.analytics.export_to_dataframe(
    dimensions=["date", "channel", "campaign"],
    metrics=["impressions", "clicks", "conversions", "spend"],
    period="last-90-days"
)

# Analyze with pandas
channel_performance = df.groupby('channel').agg({
    'conversions': 'sum',
    'spend': 'sum'
})
channel_performance['cpa'] = channel_performance['spend'] / channel_performance['conversions']

# Stream real-time data
def handle_metrics(metrics):
    print(f"Current CTR: {metrics.ctr}%")

stream = client.analytics.stream(
    metrics=["impressions", "clicks"],
    on_data=handle_metrics,
    interval=5
)

# Stop after 5 minutes
import time
time.sleep(300)
stream.close()
```

### Error Handling

```python
from marketing_engine.exceptions import (
    MarketingEngineError,
    RateLimitError,
    ValidationError,
    AuthenticationError
)

try:
    client.content.publish(title="Test", body="Content", target_channels=["linkedin"])
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after} seconds")
    time.sleep(e.retry_after)
    # Retry operation
except ValidationError as e:
    print("Validation errors:")
    for field, errors in e.errors.items():
        print(f"  {field}: {', '.join(errors)}")
except AuthenticationError:
    print("Authentication failed. Refreshing tokens...")
    client.refresh_tokens()
except MarketingEngineError as e:
    print(f"API error {e.code}: {e.message}")
```

## Go SDK

### Installation

```go
go get github.com/marketing-engine/go-sdk
```

### Usage

```go
package main

import (
    "context"
    "fmt"
    "log"
    
    me "github.com/marketing-engine/go-sdk"
)

func main() {
    // Initialize client
    client, err := me.NewClient(
        me.WithAccessToken("your-access-token"),
        me.WithRefreshToken("your-refresh-token"),
        me.WithAutoRefresh(true),
        me.WithRetries(3),
    )
    if err != nil {
        log.Fatal(err)
    }
    
    // Set callbacks
    client.OnTokenRefresh = func(tokens *me.Tokens) {
        // Save new tokens
        saveTokens(tokens)
    }
    
    ctx := context.Background()
    
    // Publish content
    result, err := client.Content.Publish(ctx, &me.PublishRequest{
        Title: "AI in E-commerce: 2024 Trends",
        Body: "Content body...",
        TargetChannels: []string{"linkedin", "twitter"},
        UTMParams: &me.UTMParams{
            Source: "blog",
            Medium: "organic",
            Campaign: "thought-leadership-q1",
        },
    })
    if err != nil {
        if rateLimitErr, ok := err.(*me.RateLimitError); ok {
            fmt.Printf("Rate limited. Retry after %d seconds\n", rateLimitErr.RetryAfter)
        } else {
            log.Fatal(err)
        }
    }
    
    fmt.Printf("Published content: %s\n", result.ContentID)
    
    // Get KPIs
    kpis, err := client.Analytics.GetKPIs(ctx, &me.KPIRequest{
        Period: me.PeriodLast30Days,
        Channels: []string{"linkedin", "google"},
        Metrics: []string{"cpl", "cac", "roas"},
    })
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Printf("Blended CPL: $%.2f\n", kpis.Overall.BlendedCPL)
    
    // Stream metrics
    stream, err := client.Analytics.Stream(ctx, &me.StreamRequest{
        Metrics: []string{"impressions", "clicks"},
        Interval: 5 * time.Second,
    })
    if err != nil {
        log.Fatal(err)
    }
    
    go func() {
        for metrics := range stream.Data {
            fmt.Printf("CTR: %.2f%%\n", metrics.CTR)
        }
    }()
    
    // Stop after 5 minutes
    time.Sleep(5 * time.Minute)
    stream.Close()
}
```

## Ruby SDK

### Installation

```ruby
gem install marketing_engine
```

### Usage

```ruby
require 'marketing_engine'

# Initialize client
client = MarketingEngine::Client.new(
  access_token: 'your-access-token',
  refresh_token: 'your-refresh-token',
  auto_refresh: true
)

# Callbacks
client.on_token_refresh do |tokens|
  # Save new tokens
  save_tokens(tokens)
end

# Publish content
result = client.content.publish(
  title: 'AI in E-commerce: 2024 Trends',
  body: 'Content body...',
  target_channels: ['linkedin', 'twitter'],
  utm_params: {
    source: 'blog',
    medium: 'organic',
    campaign: 'thought-leadership-q1'
  }
)

puts "Published to: #{result.channels.map(&:channel).join(', ')}"

# Get KPIs
kpis = client.analytics.get_kpis(
  period: 'last-30-days',
  channels: ['linkedin', 'google']
)

puts "Blended CPL: $#{kpis.overall.blended_cpl}"
puts "LTV:CAC Ratio: #{kpis.overall.ltv_cac_ratio}"

# Error handling
begin
  client.content.publish(title: 'Test', body: 'Content')
rescue MarketingEngine::RateLimitError => e
  puts "Rate limited. Retry after #{e.retry_after} seconds"
  sleep e.retry_after
  retry
rescue MarketingEngine::ValidationError => e
  puts "Validation errors: #{e.errors}"
rescue MarketingEngine::Error => e
  puts "API error: #{e.message}"
end
```

## SDK Development

### Contributing

We welcome contributions to our SDKs! Please see our [contribution guide](https://github.com/marketing-engine/sdks/CONTRIBUTING.md).

### Building from Source

```bash
# TypeScript SDK
git clone https://github.com/marketing-engine/typescript-sdk
cd typescript-sdk
npm install
npm run build
npm test

# Python SDK
git clone https://github.com/marketing-engine/python-sdk
cd python-sdk
poetry install
poetry run pytest

# Go SDK
git clone https://github.com/marketing-engine/go-sdk
cd go-sdk
go build ./...
go test ./...
```

### SDK Generator

We use OpenAPI Generator for SDK development:

```bash
# Generate TypeScript SDK
openapi-generator generate \
  -i openapi.yaml \
  -g typescript-axios \
  -o typescript-sdk \
  --additional-properties=npmName=@marketing-engine/sdk

# Generate Python SDK  
openapi-generator generate \
  -i openapi.yaml \
  -g python \
  -o python-sdk \
  --additional-properties=packageName=marketing_engine
```

## Support

- Documentation: https://docs.marketingengine.io/sdks
- Issues: https://github.com/marketing-engine/sdks/issues
- Community: https://community.marketingengine.io
- Email: sdk-support@marketingengine.io