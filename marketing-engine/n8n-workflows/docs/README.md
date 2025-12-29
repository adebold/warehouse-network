# N8N Marketing Automation Workflows

## Overview

This directory contains production-ready n8n workflows for comprehensive marketing automation. All workflows include enterprise-grade features like authentication, rate limiting, error handling, and monitoring.

## Workflows

### 1. Content Distribution (`/content-distribution/multi-channel-publishing.json`)

Automates content publishing across multiple social media platforms with advanced features:

- **Multi-channel publishing**: Facebook, Twitter, LinkedIn, Instagram
- **A/B testing**: Automatic variant selection and performance tracking
- **Optimal timing**: AI-driven scheduling based on engagement patterns
- **Performance tracking**: Real-time metrics and analytics
- **Webhook endpoints**: `/publish-content` (POST)

### 2. Lead Nurturing (`/lead-nurturing/email-automation.json`)

Sophisticated lead nurturing system with CRM integration:

- **Lead scoring**: Behavioral and demographic scoring algorithm
- **Email sequences**: Dynamic content based on nurture stage
- **CRM integration**: Salesforce and HubSpot sync
- **Task automation**: Auto-create tasks for sales team
- **Webhook endpoints**: `/lead-trigger` (POST)

### 3. Social Media Management (`/social-media/engagement-monitoring.json`)

Real-time social media monitoring and engagement:

- **Engagement monitoring**: Track mentions, comments, shares
- **Competitor analysis**: Monitor competitor activity
- **Hashtag performance**: Track and optimize hashtag usage
- **Content calendar**: Auto-optimization based on performance
- **Triggers**: 15-minute scheduled checks + webhook

### 4. Analytics Reporting (`/analytics-reporting/automated-reports.json`)

Comprehensive analytics and reporting automation:

- **Multi-source data**: GA, Facebook Ads, Google Ads, database
- **KPI dashboards**: Real-time performance metrics
- **Executive summaries**: AI-generated insights
- **Alert notifications**: Slack and email alerts
- **Triggers**: Daily (8am), Weekly (Monday 9am), Monthly (1st at 10am)

### 5. Budget Optimization (`/budget-optimization/campaign-optimizer.json`)

Intelligent campaign budget optimization:

- **Performance analysis**: Real-time campaign scoring
- **Budget reallocation**: AI-driven budget distribution
- **ROI optimization**: Predictive revenue modeling
- **Bid adjustments**: Automatic bid optimization
- **Triggers**: 30-minute checks + webhook

## Setup Instructions

### 1. Environment Variables

Copy `.env.example` to `.env` and configure all required variables:

```bash
# Database
POSTGRES_HOST=your-postgres-host
POSTGRES_DATABASE=marketing_db
POSTGRES_USER=marketing_user
POSTGRES_PASSWORD=secure-password

# Redis
REDIS_HOST=your-redis-host
REDIS_PASSWORD=redis-password

# Authentication
WEBHOOK_API_KEY=generate-secure-key

# Monitoring
MONITORING_URL=https://your-monitoring-service
DASHBOARD_URL=https://your-dashboard
DASHBOARD_API_URL=https://your-dashboard-api

# Platform-specific credentials (see authentication-config.json)
```

### 2. Database Setup

Execute the database schema:

```sql
-- Create required tables
CREATE TABLE campaigns (...);
CREATE TABLE campaign_performance (...);
CREATE TABLE leads (...);
CREATE TABLE email_templates (...);
CREATE TABLE content_queue (...);
CREATE TABLE social_analytics (...);
CREATE TABLE workflow_errors (...);
CREATE TABLE error_logs (...);
-- See /docs/database-schema.sql for complete schema
```

### 3. Import Workflows

1. Open n8n interface
2. Go to Workflows > Import
3. Import each JSON file from respective directories
4. Update credential references with your credential IDs

### 4. Configure Credentials

In n8n, create credentials for each service:

1. **PostgreSQL**: Database connection
2. **Redis**: Cache connection
3. **Facebook**: OAuth2 with marketing permissions
4. **Twitter**: OAuth2 API access
5. **LinkedIn**: OAuth2 with marketing permissions
6. **Google Analytics/Ads**: OAuth2 setup
7. **Salesforce/HubSpot**: OAuth2 CRM access
8. **SendGrid**: API key for email
9. **Slack**: Bot token and webhook URL

### 5. Security Configuration

Configure security settings in `/shared/authentication-config.json`:

- API key rotation (90 days)
- IP whitelisting
- Rate limiting
- TLS 1.3 encryption

## API Endpoints

All webhooks require `X-API-Key` header authentication.

### Content Distribution
```bash
POST /publish-content
{
  "content": {
    "text": "Post content",
    "image_url": "https://...",
    "link": "https://..."
  },
  "channels": ["facebook", "twitter", "linkedin"],
  "schedule_time": "2024-01-15T10:00:00Z",
  "ab_test_variants": [...]
}
```

### Lead Nurturing
```bash
POST /lead-trigger
{
  "lead": {
    "email": "lead@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "company": "Example Corp",
    "source": "website"
  },
  "action": "start_nurture"
}
```

### Generate Report
```bash
POST /generate-report
{
  "report_type": "daily|weekly|monthly",
  "recipients": ["email@example.com"],
  "include_sections": ["kpis", "social", "campaigns"]
}
```

### Budget Optimization
```bash
POST /optimize-budget
{
  "campaigns": ["campaign_id_1", "campaign_id_2"],
  "optimization_goal": "maximize_roi",
  "constraints": {
    "min_budget_per_campaign": 100,
    "max_budget_per_campaign": 10000
  }
}
```

## Monitoring

### Health Checks

Each workflow includes monitoring webhooks that report to your monitoring service:

- Execution status
- Performance metrics
- Error counts
- Rate limit status

### Error Handling

All workflows use the centralized error handling workflow:

- Automatic error categorization
- Severity-based alerting
- Recovery action suggestions
- Pattern detection

### Rate Limiting

Platform-specific rate limits are enforced:

- Facebook: 200 req/hour
- Twitter: 300 req/15min
- LinkedIn: 20 req/min
- Google Ads: 5 req/sec
- Salesforce: 1000 req/hour

## Performance Optimization

1. **Batch Processing**: All workflows use batching for API calls
2. **Caching**: Redis caching for frequently accessed data
3. **Connection Pooling**: PostgreSQL connection pooling enabled
4. **Parallel Execution**: Multi-channel operations run in parallel
5. **Circuit Breakers**: Automatic failure detection and recovery

## Troubleshooting

### Common Issues

1. **Rate Limit Errors**
   - Check `/shared/rate-limiting.json` configuration
   - Verify platform-specific limits
   - Enable exponential backoff

2. **Authentication Failures**
   - Verify OAuth tokens are valid
   - Check token refresh configuration
   - Ensure proper scopes/permissions

3. **Database Connection Issues**
   - Verify connection pool settings
   - Check SSL certificate configuration
   - Monitor connection limits

### Debug Mode

Enable debug logging by setting:
```bash
N8N_LOG_LEVEL=debug
```

## Production Deployment

### Requirements

- n8n v1.0.0+
- PostgreSQL 13+
- Redis 6+
- SSL certificates for webhook endpoints
- Monitoring service (Datadog, New Relic, etc.)

### Scaling Considerations

1. **Horizontal Scaling**: Use n8n queue mode for distribution
2. **Database Optimization**: Index frequently queried columns
3. **Caching Strategy**: Implement Redis caching for hot data
4. **CDN Integration**: Use CDN for media content
5. **Load Balancing**: Distribute webhook traffic

## Security Best Practices

1. **Credential Rotation**: Rotate API keys every 90 days
2. **Encryption**: Use TLS 1.3 for all connections
3. **Access Control**: Implement IP whitelisting
4. **Audit Logging**: Track all workflow executions
5. **Data Privacy**: Comply with GDPR/CCPA requirements

## Support

For issues or questions:
1. Check error logs in the database
2. Review monitoring dashboards
3. Consult platform-specific documentation
4. Contact your DevOps team for infrastructure issues