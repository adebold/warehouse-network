# Skidspace Analytics System

A comprehensive analytics, monitoring, and business intelligence platform for the Skidspace warehouse marketplace.

## Overview

The Skidspace Analytics System provides real-time insights, business intelligence, and monitoring capabilities for the warehouse marketplace platform. It includes advanced features such as:

- **Real-time Analytics Dashboard** - Live KPIs and metrics
- **Business Intelligence** - Advanced reporting and forecasting
- **Customer Behavior Analysis** - Journey mapping and attribution
- **Automated Alerting** - Performance and business metric monitoring
- **Mobile-Responsive Interface** - Analytics on any device

## Architecture

### Core Components

1. **Analytics Engine** (`/src/core/analytics-engine.ts`)
   - Central processing hub for all analytics operations
   - Event processing and batch operations
   - Real-time metric updates
   - Background job scheduling

2. **Services Layer** (`/src/services/`)
   - `MetricsCalculator` - KPI calculations and aggregations
   - `EventProcessor` - Event tracking and session management
   - `AlertManager` - Automated alerting and notifications
   - `ForecastEngine` - Revenue and booking forecasting
   - `CustomerBehaviorAnalyzer` - Journey and cohort analysis
   - `PerformanceMonitor` - System health monitoring

3. **Database Schema** (`/prisma/analytics-schema-extension.sql`)
   - Comprehensive analytics tables
   - Optimized indexes for performance
   - Multi-tenant data isolation

## Features

### 📊 Real-time Analytics
- Live KPI dashboard with 30-second updates
- Real-time event tracking
- Session monitoring
- Revenue and booking metrics

### 📈 Business Intelligence
- Advanced reporting capabilities
- Revenue forecasting using statistical models
- Cohort analysis and retention tracking
- Funnel analysis and conversion optimization

### 👥 Customer Behavior
- Customer journey mapping
- Attribution modeling (first-click, last-click, linear, time-decay)
- Session analysis and user segmentation
- Behavioral insights and recommendations

### 🚨 Monitoring & Alerting
- System performance monitoring
- Custom alert rules and thresholds
- Multi-channel notifications (email, SMS, Slack, webhooks)
- Alert acknowledgment and resolution tracking

### 📱 Mobile-Responsive Dashboard
- Responsive design for all devices
- Touch-friendly interface
- Offline-capable PWA features
- Real-time data synchronization

## Installation

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Start development
npm run dev
```

## Usage

### Basic Setup

```typescript
import { AnalyticsEngine, createLogger } from '@skidspace/analytics';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL);
const logger = createLogger('analytics');

const analyticsEngine = new AnalyticsEngine(prisma, redis, {
  realtimeEnabled: true,
  batchProcessingInterval: 5, // minutes
  dataRetentionDays: 365,
  cacheEnabled: true,
  cacheTTL: 300 // seconds
}, logger);
```

### Event Tracking

```typescript
// Track user events
await analyticsEngine.trackEvent({
  eventName: 'warehouse_view',
  eventCategory: 'user_action',
  eventType: 'view',
  userId: 'user-123',
  sessionId: 'session-abc',
  tenantId: 'tenant-xyz',
  warehouseId: 'warehouse-456',
  pageUrl: '/warehouses/downtown-hub',
  eventProperties: {
    warehouseType: 'climate_controlled',
    capacity: 5000
  }
});

// Track sessions
await analyticsEngine.trackSession({
  sessionId: 'session-abc',
  userId: 'user-123',
  tenantId: 'tenant-xyz',
  startedAt: new Date(),
  deviceType: 'desktop',
  browser: 'Chrome',
  entryPage: '/search'
});
```

### Metrics and KPIs

```typescript
// Get KPI metrics
const kpis = await analyticsEngine.getKPIMetrics({
  startDate: new Date('2024-03-01'),
  endDate: new Date('2024-03-31'),
  tenantId: 'tenant-xyz',
  segmentBy: 'day'
});

console.log(kpis.totalRevenue); // 125000
console.log(kpis.conversionRate); // 3.2
console.log(kpis.activeUsers); // 1247
```

### Customer Journey Analysis

```typescript
// Analyze customer journey
const journey = await analyticsEngine.analyzeCustomerJourney(
  'user-123',
  {
    startDate: new Date('2024-03-01'),
    endDate: new Date('2024-03-31')
  }
);

console.log(journey.totalTouchpoints); // 12
console.log(journey.converted); // true
console.log(journey.attributionModel); // 'last_click'
```

### Alert Management

```typescript
// Create alert rule
const alertRule = await analyticsEngine.createAlertRule({
  tenantId: 'tenant-xyz',
  ruleName: 'High Response Time',
  metricName: 'api_avg_response_time',
  conditionType: 'greater_than',
  thresholdValue: 2000,
  severity: 'critical',
  notificationChannels: [
    { type: 'email', target: 'alerts@company.com', isActive: true },
    { type: 'slack', target: 'webhook-url', isActive: true }
  ]
});
```

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/skidspace"

# Redis
REDIS_URL="redis://localhost:6379"

# Analytics Configuration
ANALYTICS_RETENTION_DAYS=365
ANALYTICS_BATCH_INTERVAL=5
ANALYTICS_CACHE_TTL=300

# Real-time Features
REALTIME_ENABLED=true
WEBSOCKET_URL="ws://localhost:3001"

# Notifications
EMAIL_SMTP_HOST="smtp.sendgrid.net"
EMAIL_SMTP_PORT=587
SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
```

### Analytics Config Object

```typescript
const config: AnalyticsConfig = {
  // Data retention
  dataRetentionDays: 365,
  aggregationIntervals: ['1h', '1d', '1w', '1m'],

  // Real-time processing
  realtimeEnabled: true,
  batchProcessingInterval: 5, // minutes

  // Performance
  cacheEnabled: true,
  cacheTTL: 300, // seconds
  maxConcurrentQueries: 10,

  // Security
  dataSampling: 100, // percentage
  anonymizeUserData: false,
  encryptSensitiveData: true,

  // External integrations
  webhookEndpoints: ['https://api.company.com/webhooks/analytics'],
  slackIntegration: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: '#analytics-alerts'
  }
};
```

## Dashboard Application

The analytics dashboard is built with Next.js 14 and provides:

- **Real-time KPI monitoring** with auto-refresh
- **Interactive charts** using Recharts
- **Mobile-responsive design** with Tailwind CSS
- **Real-time updates** via WebSocket connection
- **Alert management** interface
- **Custom dashboard** configuration

### Running the Dashboard

```bash
cd apps/analytics
npm install
npm run dev
```

Visit `http://localhost:3001` to access the dashboard.

## API Endpoints

The analytics system provides REST API endpoints:

- `GET /api/analytics/kpis` - Get KPI metrics
- `GET /api/analytics/charts` - Get chart data
- `GET /api/analytics/alerts` - Get active alerts
- `GET /api/analytics/activity` - Get recent activity
- `POST /api/analytics/events` - Track events
- `POST /api/analytics/alerts` - Create alert rules

## Performance Considerations

### Optimization Strategies

1. **Database Indexing**
   - Optimized indexes on frequently queried fields
   - Composite indexes for complex queries
   - Time-based partitioning for large tables

2. **Caching**
   - Redis caching for frequently accessed data
   - Query result caching with TTL
   - Real-time counter caching

3. **Batch Processing**
   - Configurable batch intervals
   - Queue-based event processing
   - Background job scheduling

4. **Data Aggregation**
   - Pre-computed daily/hourly metrics
   - Incremental aggregation updates
   - Time-window based calculations

### Scalability

- **Horizontal scaling** - Multiple analytics engine instances
- **Database sharding** - Tenant-based data partitioning
- **Load balancing** - Distribute processing across instances
- **Async processing** - Non-blocking event handling

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project is proprietary to Skidspace and not open source.

## Support

For support and questions:
- Documentation: Internal wiki
- Issues: Internal issue tracker
- Team: Analytics Engineering Team