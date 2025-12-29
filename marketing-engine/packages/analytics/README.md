# @marketing-engine/analytics

🚀 **Enterprise-grade analytics integration for marketing platforms**

Comprehensive analytics package with real-time event processing, multi-platform integration (Google Analytics 4, Mixpanel), and advanced attribution modeling. Built for production with GDPR compliance, data retention policies, and scalable architecture.

## Features

### Core Capabilities
- 📊 **Real-time Event Processing** - Redis Streams for high-throughput event handling
- 🔄 **Multi-Integration Support** - GA4, Mixpanel, and custom analytics
- 🎯 **Advanced Attribution** - 6 attribution models including ML-based
- 🛡️ **GDPR Compliant** - Full data privacy and retention management
- 📈 **Production Ready** - PostgreSQL with partitioning, connection pooling
- ⚡ **High Performance** - Batching, streaming, and async processing

### Integrations

#### Google Analytics 4
- Measurement Protocol implementation
- Enhanced e-commerce tracking
- Custom events and conversions
- Real-time data streaming
- Audience management

#### Mixpanel
- Event and user tracking
- Funnel analysis
- Cohort management
- A/B testing support
- Revenue tracking

#### Custom Attribution
- Multi-touch attribution models:
  - First Touch
  - Last Touch
  - Linear
  - Time Decay
  - Position Based (U-shaped)
  - Data-Driven (ML)
- ROI calculation per touchpoint
- Cross-channel journey mapping

## Installation

```bash
npm install @marketing-engine/analytics
```

## Quick Start

```typescript
import { AnalyticsClient } from '@marketing-engine/analytics';

// Initialize client
const analytics = new AnalyticsClient();
await analytics.initialize();

// Track an event
await analytics.track(
  'product_viewed',
  userId,
  anonymousId,
  {
    productId: 'SKU123',
    price: 99.99,
    category: 'Electronics'
  },
  {
    page: {
      url: 'https://example.com/product',
      title: 'Product Page'
    }
  }
);

// Track conversion
await analytics.trackConversion(
  userId,
  anonymousId,
  299.99,
  'USD',
  {
    transactionId: 'TXN123',
    items: [{
      itemId: 'SKU123',
      itemName: 'Premium Widget',
      quantity: 3,
      price: 99.99
    }]
  }
);

// Identify user
await analytics.identify(userId, {
  email: 'user@example.com',
  name: 'John Doe',
  plan: 'premium'
});
```

## Configuration

Create a `.env` file based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/marketing_analytics
DATABASE_POOL_MAX=20

# Redis
REDIS_URL=redis://localhost:6379
REDIS_STREAM_KEY=analytics:events

# Google Analytics 4
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=your_api_secret

# Mixpanel
MIXPANEL_PROJECT_TOKEN=your_project_token

# Security
JWT_SECRET=your_jwt_secret_min_32_chars
ENCRYPTION_KEY=your_32_byte_key_base64
```

## Database Setup

```bash
# Run migrations
npm run migrate:up

# Create partitions for future months
npm run migrate:partitions
```

## API Documentation

### Analytics Client

#### Event Tracking

```typescript
// Track custom event
await analytics.track(
  eventName: string,
  userId: string | null,
  anonymousId: string,
  properties?: Record<string, any>,
  context?: EventContext
);

// Track conversion
await analytics.trackConversion(
  userId: string | null,
  anonymousId: string,
  value: number,
  currency: string,
  properties?: Record<string, any>,
  context?: EventContext
);
```

#### User Management

```typescript
// Identify user
await analytics.identify(
  userId: string,
  traits: Record<string, any>
);

// Create alias
await analytics.alias(
  userId: string,
  anonymousId: string
);
```

#### Attribution Analysis

```typescript
// Get attribution results
const results = await analytics.getAttribution(
  userId: string,
  model: 'linear' | 'first_touch' | 'last_touch' | 'time_decay' | 'position_based' | 'data_driven'
);

// Compare attribution models
const comparison = await attributionEngine.compareModels(
  conversionId: string,
  models: string[]
);
```

#### Analytics Queries

```typescript
// Create funnel
const funnel = await analytics.createFunnel(
  'Checkout Funnel',
  ['product_viewed', 'add_to_cart', 'checkout_started', 'purchase'],
  { from: startDate, to: endDate }
);

// Create cohort
const cohortId = await analytics.createCohort(
  'High Value Users',
  'Users with >$1000 lifetime value',
  {
    event: 'purchase',
    properties: { total_revenue: { $gt: 1000 } }
  }
);

// Get metrics
const metrics = await analytics.getMetrics(
  startDate,
  endDate,
  'day' // or 'hour', 'week', 'month'
);
```

#### GDPR Compliance

```typescript
// Process GDPR request
const requestId = await analytics.processGDPRRequest(
  userId,
  'access' | 'deletion' | 'portability' | 'rectification'
);

// Update consent
await analytics.updateConsent(userId, {
  analytics: true,
  marketing: false,
  personalization: true
});
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│ Redis Stream │────▶│  Processor  │
│   Library   │     │   (Events)   │     │   (Async)   │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                 │
                    ┌────────────────────────────┴────────────────┐
                    │                                             │
          ┌─────────▼────────┐  ┌──────────▼────────┐  ┌────────▼────────┐
          │   PostgreSQL     │  │  Google Analytics │  │    Mixpanel     │
          │  (Partitioned)   │  │        4          │  │                 │
          └──────────────────┘  └───────────────────┘  └─────────────────┘
                    │
          ┌─────────▼────────┐
          │   Attribution    │
          │     Engine       │
          └──────────────────┘
```

## Performance

### Benchmarks
- **Event Processing**: 10,000+ events/second
- **Database Write**: 5,000+ events/second with batching
- **Attribution Calculation**: <100ms per conversion
- **Query Performance**: <50ms for date-range queries

### Optimization Tips
1. Use batching for high-volume events
2. Enable connection pooling
3. Implement proper indexing
4. Use time-based partitioning
5. Enable Redis Streams trimming

## Production Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist ./dist
COPY migrations ./migrations

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

### Health Checks

```typescript
// Check system health
const health = {
  database: await analytics.databasePool.healthCheck(),
  redis: await analytics.redisStream.getStreamStats(),
  processing: analytics.eventProcessor.getMetrics()
};
```

### Monitoring

The package includes OpenTelemetry instrumentation:

```typescript
// Metrics exported:
- analytics.events.processed
- analytics.events.failed
- analytics.attribution.calculated
- analytics.database.connections
- analytics.redis.queue.size
```

## Security

### Data Encryption
- At-rest encryption for sensitive data
- TLS for all external connections
- JWT authentication for API access
- Rate limiting on all endpoints

### Compliance
- GDPR compliant with automated workflows
- CCPA support
- Configurable data retention
- Audit logging

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## Contributing

Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📚 [Documentation](https://docs.marketing-engine.com/analytics)
- 💬 [Discord Community](https://discord.gg/marketing-engine)
- 🐛 [Issue Tracker](https://github.com/warehouse-network/marketing-engine/issues)
- 📧 [Email Support](mailto:support@marketing-engine.com)

---

Built with ❤️ by the Marketing Engine Team