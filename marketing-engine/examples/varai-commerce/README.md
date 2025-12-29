# VarAI Commerce - E-commerce Marketing Automation

Production-ready marketing automation system for e-commerce businesses with inventory-aware campaigns, customer retention workflows, and revenue attribution.

## Features

- **Product Launch Campaigns**: Automated multi-channel campaigns for new product releases
- **Customer Retention**: Lifecycle marketing with personalized recommendations
- **Revenue Attribution**: Multi-touch attribution tracking across channels
- **Inventory-Aware Marketing**: Real-time inventory sync prevents overselling
- **Dynamic Segmentation**: Behavioral and predictive customer segments

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   E-commerce API    │────▶│  Marketing Engine   │
│   (Shopify/WooC)    │     │   Orchestrator      │
└─────────────────────┘     └──────────┬──────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
┌───────▼────────┐          ┌────────▼────────┐          ┌────────▼────────┐
│    Campaign    │          │   Customer      │          │    Revenue      │
│   Automation   │          │   Retention     │          │   Attribution   │
└────────────────┘          └─────────────────┘          └─────────────────┘
```

## Quick Start

```bash
# Install dependencies
cd examples/varai-commerce
npm install

# Setup database
pg_ctl start
psql -f database/schema.sql
psql -f database/migrations/001_initial.sql

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start services
docker-compose up -d
npm run start
```

## Configuration

### API Integrations
- Shopify/WooCommerce for product catalog
- Stripe for payment processing
- SendGrid for email campaigns
- Facebook/Google Ads for paid media
- Segment for analytics

### Environment Variables
```env
# E-commerce Platform
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_secret
SHOPIFY_STORE_URL=https://your-store.myshopify.com

# Email Service
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=marketing@varai.com

# Analytics
SEGMENT_WRITE_KEY=your_segment_key

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/varai_marketing
REDIS_URL=redis://localhost:6379
```

## Usage Examples

### Product Launch Campaign
```javascript
// Create automated product launch workflow
const campaign = await marketingEngine.createCampaign({
  type: 'product_launch',
  product_id: 'SKU12345',
  channels: ['email', 'sms', 'facebook', 'google'],
  segments: ['vip_customers', 'high_value', 'engaged_browsers'],
  schedule: {
    announcement: '-7d',
    early_access: '-3d',
    launch: '0',
    follow_up: '+3d'
  }
});
```

### Customer Retention Flow
```javascript
// Setup retention workflow
const retention = await marketingEngine.createRetentionFlow({
  triggers: [
    { event: 'first_purchase', delay: '3d', action: 'welcome_series' },
    { event: 'no_purchase_30d', action: 'win_back_campaign' },
    { event: 'high_cart_value', action: 'vip_upgrade_offer' }
  ],
  personalization: {
    product_recommendations: true,
    dynamic_discounts: true,
    loyalty_points: true
  }
});
```

## Metrics & KPIs

Access dashboard at http://localhost:3000/dashboard

- **Revenue Attribution**: Multi-touch ROI by channel
- **Customer Lifetime Value**: Predictive CLV modeling
- **Campaign Performance**: CTR, conversion, revenue per campaign
- **Retention Metrics**: Churn rate, repeat purchase rate
- **Inventory Impact**: Stock-out prevention rate

## Production Deployment

```bash
# Build for production
npm run build

# Deploy with Docker
docker build -t varai-marketing .
docker push your-registry/varai-marketing

# Kubernetes deployment
kubectl apply -f k8s/

# Monitor
kubectl logs -f deployment/varai-marketing
```

## Security

- JWT authentication for all APIs
- Rate limiting: 100 req/min per IP
- Data encryption at rest and in transit
- PCI compliance for payment data
- GDPR compliant data handling

## Support

- Documentation: [docs.varai.com/marketing](https://docs.varai.com/marketing)
- API Reference: [api.varai.com/docs](https://api.varai.com/docs)
- Support: support@varai.com