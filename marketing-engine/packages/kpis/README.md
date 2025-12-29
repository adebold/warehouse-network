# Marketing KPI Engine

A comprehensive, production-ready KPI calculation engine for marketing analytics. Built with TypeScript, PostgreSQL, and Redis for high-performance real-time and batch processing.

## Features

### Core KPIs
- **Cost Per Lead (CPL)**: Multi-channel cost aggregation with quality scoring and trend analysis
- **Customer Acquisition Cost (CAC)**: Full funnel CAC with channel-specific analysis and LTV/CAC ratios
- **Content ROI**: Performance metrics, engagement value calculation, and revenue attribution
- **Channel Attribution**: Multiple attribution models (First-touch, Last-touch, Linear, Time-decay, U-shaped, W-shaped, Data-driven)

### Revenue & Retention Metrics
- **MRR Tracking**: New MRR, Expansion MRR, Churned MRR, Net New MRR with cohort analysis
- **Churn & Retention**: Customer and revenue churn rates, cohort retention analysis, predictive churn scoring

### Channel-Specific Metrics
- **Email Marketing**: Open rates, CTR, conversion rates, ROI, optimal send time analysis
- **Social Media ROI**: Platform-specific metrics, influencer ROI, hashtag performance, competitor analysis
- **SEO Performance**: Organic traffic, keyword rankings, backlink analysis, technical SEO monitoring

## Architecture

```
├── src/
│   ├── core/               # Core KPI calculators
│   ├── attribution/        # Attribution modeling
│   ├── metrics/            # Additional metrics
│   ├── infrastructure/     # Database & Redis
│   ├── types/              # TypeScript types
│   ├── migrations/         # Database migrations
│   └── config/             # Configuration
├── tests/                  # Test suites
└── scripts/                # Utility scripts
```

## Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database and Redis credentials

# Run database migrations
npm run db:migrate

# Build the package
npm run build
```

## Usage

### Basic Example

```typescript
import { KPIService } from '@marketing-engine/kpis';

// Initialize the service
const kpiService = KPIService.getInstance();
await kpiService.initialize();

// Calculate Cost Per Lead
const cplMetrics = await kpiService.getCostPerLead({
  dateRange: {
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-31')
  },
  channels: ['paid_search', 'social_media']
});

console.log(`Cost Per Lead: $${cplMetrics.costPerLead.toString()}`);
console.log(`Total Leads: ${cplMetrics.totalLeads}`);
```

### Channel Attribution

```typescript
// Compare attribution models
const attributionModels = await kpiService.compareAttributionModels(
  ['linear', 'first_touch', 'last_touch', 'u_shaped'],
  {
    dateRange: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31')
    }
  }
);

// Get budget recommendations
const linearAttribution = attributionModels.get('linear');
linearAttribution.recommendations.forEach(rec => {
  console.log(`${rec.channel}: Current $${rec.currentBudget}, Recommended $${rec.recommendedBudget}`);
});
```

### MRR Tracking

```typescript
// Get current MRR
const mrrMetrics = await kpiService.getMRR();
console.log(`Current MRR: $${mrrMetrics.currentMRR.toString()}`);
console.log(`Growth Rate: ${mrrMetrics.growthRate.toString()}%`);

// Get cohort analysis
const cohortMRR = await kpiService.getCohortMRR(6);
cohortMRR.forEach((cohortData, cohortName) => {
  console.log(`Cohort ${cohortName}:`);
  cohortData.months.forEach(month => {
    console.log(`  Month ${month.month}: $${month.mrr} (${month.retention * 100}% retained)`);
  });
});
```

### Automated Scheduling

```typescript
import { KPIScheduler } from '@marketing-engine/kpis';

// Initialize scheduler
const scheduler = KPIScheduler.getInstance();
await scheduler.initialize();

// The scheduler automatically runs:
// - Hourly calculations (every hour)
// - Daily calculations (2 AM daily)
// - Weekly calculations (Monday 3 AM)
// - Monthly calculations (1st at 4 AM)
// - Real-time updates (every 5 minutes)

// Manual job execution
await scheduler.runJob('daily-metrics');

// Check job status
const status = await scheduler.getJobStatus();
console.log(`Active jobs: ${status.queueStats.active}`);
```

## API Reference

### KPIService Methods

#### Cost & Acquisition
- `getCostPerLead(filters)`: Calculate cost per lead metrics
- `getCustomerAcquisitionCost(filters)`: Calculate CAC metrics
- `forecastCostPerLead(filters, periods)`: Forecast future CPL

#### Content & Attribution
- `getContentROI(contentId, filters)`: Calculate content ROI
- `getTopContent(filters, limit)`: Get top performing content
- `getChannelAttribution(model, filters)`: Calculate channel attribution

#### Revenue & Retention
- `getMRR(date)`: Get MRR metrics for a specific date
- `getMRRGrowth(months)`: Get MRR growth over time
- `getChurnMetrics(filters)`: Calculate churn and retention
- `predictChurn(customerId)`: Predict customer churn probability

#### Channel Metrics
- `getEmailMetrics(campaignId)`: Get email campaign metrics
- `getSocialMediaROI(platform, filters)`: Calculate social media ROI
- `getSEOMetrics(filters)`: Get SEO performance metrics

## Database Schema

The package includes comprehensive database schemas for:
- Leads and customers
- Marketing costs
- Content and content metrics
- Channel touchpoints
- Revenue tracking
- Email campaigns
- Social media metrics
- SEO metrics
- KPI calculations history

Run migrations to set up the complete schema:

```bash
npm run db:migrate
```

## Configuration

### Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=marketing_kpis
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# KPI Settings
KPI_BATCH_SIZE=100
KPI_CALC_INTERVAL=60000
LEAD_QUALITY_THRESHOLD=0.7

# Content Engagement Weights
WEIGHT_VIEWS=0.1
WEIGHT_SHARES=0.3
WEIGHT_COMMENTS=0.2
WEIGHT_CONVERSIONS=0.4
```

## Performance Optimization

### Caching Strategy
- Redis caching with 5-minute TTL for frequently accessed metrics
- Intelligent cache invalidation on data updates
- Batch processing for large datasets

### Database Optimization
- Comprehensive indexing strategy
- Connection pooling with configurable limits
- Query optimization for large datasets
- Partitioning support for historical data

### Real-time Updates
- Bull queue for asynchronous job processing
- Prioritized job execution
- Automatic retry with exponential backoff
- Dead letter queue for failed jobs

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm test CostPerLead.test.ts
```

## Production Deployment

### Health Checks

```typescript
// Check system health
const health = await kpiService.healthCheck();
if (health.status === 'healthy') {
  console.log('All systems operational');
}
```

### Monitoring

The package includes built-in monitoring with:
- Prometheus metrics endpoint (port 9090)
- Structured JSON logging
- Performance tracking for all calculations
- Error tracking and alerting

### Scaling Considerations

- Horizontal scaling supported via Redis-based coordination
- Read replicas for database queries
- Sharding support for large datasets
- Queue-based processing for resource-intensive calculations

## Contributing

1. Follow TypeScript best practices
2. Maintain test coverage above 80%
3. Document all public APIs
4. Use conventional commits
5. Run linter before committing

## License

MIT