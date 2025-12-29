# EasyReno - B2B Lead Generation & Local Marketing Automation

Production-ready marketing automation for home renovation contractors with local SEO, review management, and automated quote workflows.

## Features

- **B2B Lead Generation**: Multi-channel lead capture and nurturing
- **Local SEO Optimization**: Google My Business integration, local citations
- **Review Management**: Automated review requests and reputation monitoring
- **Quote Automation**: Instant quote generation with follow-up sequences
- **Service Area Targeting**: Geo-targeted campaigns by neighborhood
- **Contractor Network**: Partner referral system

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│  Lead Sources       │────▶│  Lead Scoring &     │
│  (Web/GMB/Social)   │     │  Qualification      │
└─────────────────────┘     └──────────┬──────────┘
                                       │
┌─────────────────────┐                │
│  Review Platforms   │                ▼
│  (Google/Yelp/BBB)  │     ┌─────────────────────┐
└──────────┬──────────┘     │  CRM & Automation   │
           │                 │  Orchestrator       │
           ▼                 └──────────┬──────────┘
┌─────────────────────┐                │
│  Review Management  │◀───────────────┘
│  & Response Engine  │
└─────────────────────┘
```

## Quick Start

```bash
# Install dependencies
cd examples/easyreno
npm install

# Setup database
psql -f database/schema.sql
psql -f database/seed.sql

# Configure API keys
cp .env.example .env
# Edit .env with your credentials

# Start services
docker-compose up -d
npm run start

# Access dashboard
open http://localhost:3000
```

## Configuration

### Required API Integrations

```env
# Google My Business
GOOGLE_MY_BUSINESS_ACCOUNT_ID=your_account_id
GOOGLE_PLACES_API_KEY=your_api_key

# Review Platforms
YELP_API_KEY=your_yelp_key
BIRDEYE_API_KEY=your_birdeye_key

# Communication
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
SENDGRID_API_KEY=your_key

# Lead Sources
FACEBOOK_LEAD_ACCESS_TOKEN=your_token
ANGI_API_KEY=your_angi_key
THUMBTACK_API_KEY=your_thumbtack_key

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/easyreno
REDIS_URL=redis://localhost:6379
```

## Usage Examples

### Lead Capture & Scoring

```javascript
// Automatic lead scoring based on multiple factors
const lead = await leadEngine.capture({
  source: 'website_form',
  data: {
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+1-555-0123',
    project_type: 'kitchen_remodel',
    budget: '$25,000-50,000',
    timeline: 'next_30_days',
    address: '123 Main St, Austin, TX'
  }
});

// Returns:
{
  id: 'lead_123',
  score: 85, // High intent score
  qualifications: {
    budget_qualified: true,
    service_area_match: true,
    timeline_urgent: true,
    project_complexity: 'medium'
  },
  recommended_actions: [
    'immediate_phone_call',
    'send_portfolio',
    'schedule_consultation'
  ]
}
```

### Review Management Automation

```javascript
// Automated review request after project completion
await reviewManager.createCampaign({
  customer_id: 'cust_456',
  project_id: 'proj_789',
  trigger: 'project_completed',
  sequence: [
    {
      delay: '1d',
      channel: 'sms',
      message: 'Thank you for choosing EasyReno! How was your experience?',
      include_review_links: true
    },
    {
      delay: '3d',
      channel: 'email',
      template: 'review_request_email',
      platforms: ['google', 'yelp', 'facebook']
    },
    {
      delay: '7d',
      channel: 'sms',
      condition: 'no_review_submitted',
      message: 'We'd love your feedback! Takes just 30 seconds.',
      incentive: '$25_gift_card'
    }
  ]
});
```

### Local SEO Campaign

```javascript
// Service area targeting with local SEO
const campaign = await localSEO.createCampaign({
  type: 'neighborhood_domination',
  target_area: {
    center: { lat: 30.2672, lng: -97.7431 }, // Austin, TX
    radius: 15, // miles
    neighborhoods: ['Downtown', 'South Congress', 'East Austin']
  },
  keywords: [
    'kitchen remodeling austin',
    'bathroom renovation near me',
    'home contractors austin tx'
  ],
  content: {
    landing_pages: true,
    blog_posts: 5,
    gmb_posts: 'weekly',
    citation_building: true
  },
  budget: {
    monthly: 2500,
    allocation: {
      'google_ads': 0.6,
      'facebook_local': 0.2,
      'nextdoor': 0.1,
      'content': 0.1
    }
  }
});
```

## Lead Management Dashboard

### Real-time Lead Pipeline

```javascript
// Get dashboard metrics
const metrics = await dashboard.getMetrics('realtime');

// Returns:
{
  active_leads: {
    new: 47,
    contacted: 23,
    qualified: 18,
    quoted: 12,
    won: 3
  },
  response_times: {
    average_minutes: 4.3,
    under_5_min: '89%',
    under_1_hour: '98%'
  },
  conversion_rates: {
    lead_to_appointment: '34%',
    appointment_to_quote: '78%',
    quote_to_close: '23%'
  },
  revenue_pipeline: {
    quoted: 285000,
    probable: 125000,
    forecasted: 98000
  }
}
```

## Automation Workflows

### New Lead Workflow

1. **Instant Response** (< 1 minute)
   - SMS acknowledgment
   - Email with portfolio
   - CRM record creation

2. **Lead Qualification** (< 5 minutes)
   - Budget verification
   - Service area check
   - Project type match
   - Availability check

3. **Nurture Sequence**
   - Personalized follow-ups
   - Educational content
   - Social proof (reviews)
   - Limited-time offers

### Review Generation Workflow

1. **Project Completion**
   - Quality check survey
   - Photo collection
   - Initial satisfaction gauge

2. **Review Requests**
   - Multi-channel outreach
   - Platform optimization
   - Incentive management

3. **Response Management**
   - Positive review amplification
   - Negative review mitigation
   - Owner response automation

## Advanced Features

### AI-Powered Quote Generation

```javascript
const quote = await quoteEngine.generate({
  lead_id: 'lead_123',
  project_details: {
    type: 'kitchen_remodel',
    size: '200_sqft',
    current_condition: 'fair',
    desired_features: [
      'granite_countertops',
      'new_cabinets',
      'tile_backsplash'
    ]
  },
  use_ai_optimization: true
});

// Returns detailed quote with:
// - Line item breakdown
// - Material options
// - Timeline estimate
// - Payment terms
// - 3D visualization link
```

### Competitor Monitoring

```javascript
// Track competitor activity
await competitorMonitor.track({
  competitors: ['competitor1', 'competitor2'],
  metrics: [
    'review_velocity',
    'average_rating',
    'response_time',
    'pricing_changes',
    'service_offerings'
  ],
  alerts: {
    new_negative_review: true,
    price_undercut: true,
    new_service_area: true
  }
});
```

## Reporting & Analytics

### ROI Tracking

- **Cost per Lead**: By source and campaign
- **Customer Acquisition Cost**: Full funnel analysis
- **Lifetime Value**: By service type and area
- **Attribution**: Multi-touch revenue tracking

### Performance KPIs

- Lead response time
- Quote-to-close ratio
- Average project value
- Review rating trends
- Market share by area

## Security & Compliance

- **SSL/TLS**: All data encrypted in transit
- **PCI Compliance**: For payment processing
- **TCPA Compliance**: Automated consent management
- **Data Privacy**: CCPA/GDPR compliant
- **License Verification**: Automated contractor validation

## Production Deployment

```bash
# Build production image
docker build -t easyreno-marketing .

# Deploy to Kubernetes
kubectl apply -f k8s/

# Setup monitoring
kubectl apply -f monitoring/

# Configure auto-scaling
kubectl autoscale deployment easyreno --min=2 --max=10 --cpu-percent=70
```

## Support

- API Documentation: [api.easyreno.com/docs](https://api.easyreno.com/docs)
- Support: support@easyreno.com
- Status: [status.easyreno.com](https://status.easyreno.com)