# Marketing Engine Channel Adapters

Production-ready channel adapters for multi-platform marketing automation.

## Features

- **Production-Ready**: No mocks, real API integrations with proper error handling
- **Rate Limiting**: Built-in rate limiting for all API calls
- **Retry Logic**: Exponential backoff retry for transient failures
- **Error Handling**: Comprehensive error handling with retryable error detection
- **Analytics**: Unified analytics interface across all channels
- **Database-Backed**: PostgreSQL for persistent storage, Redis for caching
- **Type-Safe**: Full TypeScript support with strict typing

## Supported Channels

### LinkedIn (`@marketing-engine/linkedin-channel`)
- OAuth2 authentication
- Company and personal profile posting
- Media upload support (images, videos)
- Analytics retrieval
- Content scheduling (external)

### Google Ads (`@marketing-engine/google-ads-channel`)
- Google Ads API v14+ integration
- Campaign creation and management
- Responsive search ads
- Budget optimization
- Performance metrics
- Keyword targeting

### Twitter/X (`@marketing-engine/twitter-channel`)
- Twitter API v2 with OAuth
- Tweet creation and threads
- Media upload
- Engagement tracking
- Hashtag analytics
- Reply management

### Blog Platforms (`@marketing-engine/blog-channel`)
- Multi-platform support:
  - WordPress (REST API)
  - Ghost (Admin API)
  - Medium (API)
- SEO optimization
- RSS feed generation
- Content scheduling
- Media management

### Email (`@marketing-engine/email-channel`)
- Provider support:
  - SendGrid
  - AWS SES
- MJML template support
- List management
- Bounce handling
- Analytics tracking
- A/B testing support

## Installation

```bash
npm install @marketing-engine/linkedin-channel
npm install @marketing-engine/google-ads-channel
npm install @marketing-engine/twitter-channel
npm install @marketing-engine/blog-channel
npm install @marketing-engine/email-channel
```

## Configuration

### Environment Variables

Create a `.env` file with the required credentials:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/marketing_engine
REDIS_URL=redis://localhost:6379

# LinkedIn
LINKEDIN_CLIENT_ID=your-client-id
LINKEDIN_CLIENT_SECRET=your-client-secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/linkedin/callback

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=your-dev-token
GOOGLE_ADS_CLIENT_ID=your-client-id
GOOGLE_ADS_CLIENT_SECRET=your-client-secret
GOOGLE_ADS_CUSTOMER_ID=your-customer-id

# Twitter
TWITTER_API_KEY=your-api-key
TWITTER_API_SECRET=your-api-secret
TWITTER_BEARER_TOKEN=your-bearer-token

# Email
SENDGRID_API_KEY=your-sendgrid-key
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret

# Blog
WORDPRESS_API_KEY=your-wp-key
GHOST_API_KEY=your-ghost-key
MEDIUM_ACCESS_TOKEN=your-medium-token
```

### Database Setup

Run the migration to create required tables:

```bash
psql $DATABASE_URL < packages/core/src/database/migrations/001_initial_schema.sql
```

## Usage Example

```typescript
import { LinkedInAdapter } from '@marketing-engine/linkedin-channel';
import { Pool } from 'pg';
import Redis from 'ioredis';
import winston from 'winston';

// Setup dependencies
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json()
});

// Configure adapter
const config = {
  channelType: ChannelType.LINKEDIN,
  credentials: {
    channelType: ChannelType.LINKEDIN,
    accessToken: 'your-access-token',
    refreshToken: 'your-refresh-token',
    expiresAt: new Date('2025-01-01')
  },
  rateLimits: {
    maxRequests: 100,
    windowMs: 900000 // 15 minutes
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2
  }
};

// Create adapter instance
const linkedin = new LinkedInAdapter(config, logger, db, redis);

// Create a post
const result = await linkedin.createPost({
  text: 'Check out our latest product update! #innovation #tech',
  media: [{
    type: ContentType.IMAGE,
    url: 'https://example.com/image.jpg',
    altText: 'Product screenshot'
  }],
  link: 'https://example.com/blog/update'
});

if (result.success) {
  console.log('Post created:', result.data.url);
  
  // Get analytics after some time
  const analytics = await linkedin.getAnalytics(
    result.data.id,
    new Date('2025-01-01'),
    new Date('2025-01-31')
  );
  
  console.log('Post performance:', analytics.data);
}
```

## Channel-Specific Features

### LinkedIn
- Supports both personal and company page posting
- Automatic organization detection
- Video upload with duration validation
- Native analytics with custom metrics

### Google Ads
- Automatic campaign and ad group creation
- Responsive search ad optimization
- Budget management with safety limits
- Detailed performance metrics

### Twitter
- Thread creation support
- Automatic text splitting for long content
- Media upload with alt text
- Real-time engagement tracking

### Blog
- Unified interface for multiple platforms
- Automatic SEO optimization
- Featured image handling
- Category and tag management

### Email
- Template rendering with MJML
- List segmentation
- Bounce and complaint handling
- Delivery tracking

## Error Handling

All adapters implement comprehensive error handling:

```typescript
const result = await adapter.createPost(content);

if (!result.success) {
  const error = result.error;
  
  if (error.retryable) {
    // Can retry after error.retryAfter seconds
    console.log(`Retryable error: ${error.message}`);
  } else {
    // Permanent failure
    console.error(`Fatal error: ${error.code} - ${error.message}`);
  }
}
```

## Rate Limiting

Built-in rate limiting prevents API throttling:

```typescript
// Check rate limit status
const status = await adapter.getRateLimitStatus();
console.log(`Remaining requests: ${status.remaining}/${status.total}`);
console.log(`Resets at: ${status.resetsAt}`);

// Operations are automatically queued when rate limited
const result = await adapter.createPost(content); // Will wait if necessary
```

## Health Monitoring

Monitor adapter health:

```typescript
const health = await adapter.healthCheck();
if (health.data.status === 'healthy') {
  console.log('API is reachable, response time:', health.data.apiStatus.responseTimeMs);
} else {
  console.log('Service degraded:', health.data.message);
}
```

## Production Considerations

1. **Database Indexes**: Ensure proper indexes are created (included in migration)
2. **Connection Pooling**: Use connection pooling for PostgreSQL
3. **Redis Clustering**: Use Redis cluster for high availability
4. **Error Monitoring**: Integrate with error tracking service (Sentry, etc.)
5. **Metrics Collection**: Export metrics to monitoring service
6. **Backup Strategy**: Regular database backups
7. **Security**: Encrypt sensitive credentials in database

## Contributing

Each adapter follows the same pattern:

1. Extends `BaseChannelAdapter`
2. Implements all required abstract methods
3. Handles channel-specific validation
4. Provides proper error messages
5. Implements retry logic for transient failures

## License

MIT