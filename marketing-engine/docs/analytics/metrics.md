# Marketing Metrics Definitions

## Overview

This guide provides comprehensive definitions and calculation methods for all metrics tracked by Marketing Engine, ensuring consistent understanding across your organization.

## Financial Metrics

### Cost Per Lead (CPL)

**Definition**: The average cost to acquire a single lead across all marketing channels.

**Formula**: 
```
CPL = Total Marketing Spend / Total Number of Leads
```

**Components**:
- **Total Marketing Spend**: Includes ad spend, content creation costs, tool subscriptions, and labor
- **Lead**: A qualified contact who has expressed interest (form submission, demo request, trial signup)

**Example Calculation**:
```typescript
const cpl = {
  totalSpend: 10000, // $10,000 total spend
  totalLeads: 147,   // 147 leads generated
  cpl: 10000 / 147   // $68.03 per lead
};

// Channel breakdown
const channelCPL = {
  linkedin: { spend: 3000, leads: 52, cpl: 57.69 },
  google: { spend: 4000, leads: 61, cpl: 65.57 },
  content: { spend: 3000, leads: 34, cpl: 88.24 }
};
```

### Customer Acquisition Cost (CAC)

**Definition**: The total cost to acquire a paying customer, including all marketing and sales expenses.

**Formula**:
```
CAC = (Marketing Costs + Sales Costs) / Number of New Customers
```

**Extended Formula** (including overhead):
```
CAC = (Marketing Costs + Sales Costs + Overhead Allocation) / New Customers
```

**Components**:
- **Marketing Costs**: All marketing spend including ads, content, tools
- **Sales Costs**: Salaries, commissions, sales tools
- **Overhead Allocation**: Portion of general business expenses

**Example**:
```typescript
const cac = {
  marketingCosts: 50000,
  salesCosts: 75000,
  overheadAllocation: 25000,
  newCustomers: 42,
  cac: (50000 + 75000 + 25000) / 42 // $3,571.43
};

// Payback period
const paybackPeriod = cac.cac / (averageRevenue / 12); // Months to recover CAC
```

### Return on Ad Spend (ROAS)

**Definition**: Revenue generated for every dollar spent on advertising.

**Formula**:
```
ROAS = Revenue from Ads / Ad Spend
```

**Variations**:
- **Gross ROAS**: Total revenue / Ad spend
- **Net ROAS**: (Revenue - COGS) / Ad spend
- **LTV ROAS**: Customer lifetime value / Ad spend

**Example**:
```typescript
const roas = {
  adSpend: 10000,
  directRevenue: 45000,    // Revenue from ad clicks
  assistedRevenue: 15000,  // Revenue from multi-touch
  grossROAS: 60000 / 10000, // 6:1 or 600%
  netROAS: (60000 - 24000) / 10000 // 3.6:1 (after COGS)
};
```

### Lifetime Value (LTV)

**Definition**: The predicted total revenue a customer will generate over their entire relationship.

**Formula**:
```
LTV = Average Order Value × Purchase Frequency × Customer Lifespan
```

**SaaS Formula**:
```
LTV = (Monthly Recurring Revenue × Gross Margin %) / Monthly Churn Rate
```

**Example**:
```typescript
const ltv = {
  // E-commerce
  ecommerce: {
    avgOrderValue: 150,
    purchasesPerYear: 4,
    avgCustomerLifespan: 3, // years
    ltv: 150 * 4 * 3 // $1,800
  },
  
  // SaaS
  saas: {
    monthlyRevenue: 299,
    grossMargin: 0.80, // 80%
    monthlyChurn: 0.05, // 5%
    ltv: (299 * 0.80) / 0.05 // $4,784
  }
};
```

### LTV:CAC Ratio

**Definition**: The relationship between customer lifetime value and acquisition cost.

**Formula**:
```
LTV:CAC Ratio = Customer Lifetime Value / Customer Acquisition Cost
```

**Benchmarks**:
- **< 1:1**: Losing money on each customer
- **1:1 - 3:1**: Break-even to modest profit
- **3:1 - 5:1**: Healthy, sustainable growth
- **> 5:1**: Strong profitability (may be under-investing in growth)

**Example**:
```typescript
const ltvCacRatio = {
  ltv: 4784,
  cac: 1200,
  ratio: 4784 / 1200, // 3.99:1
  health: 'healthy',
  recommendation: 'Current ratio is healthy. Consider increasing acquisition spend.'
};
```

## Engagement Metrics

### Click-Through Rate (CTR)

**Definition**: The percentage of people who click on your content after seeing it.

**Formula**:
```
CTR = (Clicks / Impressions) × 100
```

**Channel Benchmarks**:
- **Google Search Ads**: 3-5%
- **Google Display**: 0.5-1%
- **LinkedIn Sponsored Content**: 0.4-0.6%
- **Email Marketing**: 2-3%

**Example**:
```typescript
const ctr = {
  googleSearch: { impressions: 10000, clicks: 425, ctr: 4.25 },
  linkedIn: { impressions: 50000, clicks: 250, ctr: 0.50 },
  email: { sent: 5000, clicks: 125, ctr: 2.50 }
};
```

### Conversion Rate

**Definition**: The percentage of visitors who complete a desired action.

**Formula**:
```
Conversion Rate = (Conversions / Total Visitors) × 100
```

**Types**:
- **Macro Conversions**: Primary goals (purchases, subscriptions)
- **Micro Conversions**: Secondary goals (newsletter signups, downloads)

**Example**:
```typescript
const conversionRates = {
  overall: { visitors: 10000, conversions: 250, rate: 2.5 },
  bySource: {
    organic: { visitors: 4000, conversions: 120, rate: 3.0 },
    paid: { visitors: 3000, conversions: 90, rate: 3.0 },
    social: { visitors: 2000, conversions: 30, rate: 1.5 },
    direct: { visitors: 1000, conversions: 10, rate: 1.0 }
  },
  funnel: {
    landingToSignup: 15.0,  // 15% sign up for trial
    signupToActive: 60.0,   // 60% become active users
    activeToPaid: 25.0      // 25% convert to paid
  }
};
```

### Engagement Rate

**Definition**: The level of interaction with your content relative to reach.

**Social Media Formula**:
```
Engagement Rate = (Total Engagements / Reach) × 100
```

**Email Formula**:
```
Engagement Rate = ((Opens + Clicks) / Delivered) × 100
```

**Example**:
```typescript
const engagement = {
  linkedin: {
    impressions: 10000,
    reactions: 245,
    comments: 32,
    shares: 18,
    totalEngagements: 295,
    rate: (295 / 10000) * 100 // 2.95%
  },
  email: {
    delivered: 5000,
    opens: 1250,
    clicks: 300,
    rate: ((1250 + 300) / 5000) * 100 // 31%
  }
};
```

### Bounce Rate

**Definition**: The percentage of visitors who leave after viewing only one page.

**Formula**:
```
Bounce Rate = (Single Page Sessions / Total Sessions) × 100
```

**Benchmarks by Type**:
- **Blog posts**: 70-90%
- **Landing pages**: 25-40%
- **E-commerce**: 20-40%
- **SaaS websites**: 30-50%

## Attribution Metrics

### First-Touch Attribution

**Definition**: Credits the first marketing touchpoint with 100% of the conversion value.

**Use Case**: Understanding top-of-funnel effectiveness

**Example**:
```typescript
const firstTouch = {
  customer: 'ABC Corp',
  touchpoints: [
    { channel: 'LinkedIn Ad', date: '2024-01-01' }, // Gets 100% credit
    { channel: 'Blog Visit', date: '2024-01-05' },
    { channel: 'Email', date: '2024-01-10' },
    { channel: 'Demo Request', date: '2024-01-15' }
  ],
  attribution: {
    'LinkedIn Ad': 100,
    'Blog Visit': 0,
    'Email': 0
  }
};
```

### Last-Touch Attribution

**Definition**: Credits the last marketing touchpoint before conversion.

**Use Case**: Understanding what closes deals

**Example**:
```typescript
const lastTouch = {
  touchpoints: [
    { channel: 'LinkedIn Ad', date: '2024-01-01' },
    { channel: 'Blog Visit', date: '2024-01-05' },
    { channel: 'Email', date: '2024-01-10' } // Gets 100% credit
  ],
  attribution: {
    'LinkedIn Ad': 0,
    'Blog Visit': 0,
    'Email': 100
  }
};
```

### Multi-Touch Attribution

**Definition**: Distributes credit across all touchpoints in the customer journey.

**Models**:

#### Linear Attribution
```typescript
// Equal credit to all touchpoints
const linear = {
  touchpoints: ['LinkedIn', 'Blog', 'Email', 'Demo'],
  attribution: {
    'LinkedIn': 25,
    'Blog': 25,
    'Email': 25,
    'Demo': 25
  }
};
```

#### Time Decay Attribution
```typescript
// More credit to recent touchpoints
const timeDecay = {
  touchpoints: [
    { channel: 'LinkedIn', daysAgo: 30, credit: 10 },
    { channel: 'Blog', daysAgo: 20, credit: 20 },
    { channel: 'Email', daysAgo: 10, credit: 30 },
    { channel: 'Demo', daysAgo: 1, credit: 40 }
  ]
};
```

#### Position-Based (U-Shaped)
```typescript
// 40% first, 40% last, 20% middle
const positionBased = {
  touchpoints: ['LinkedIn', 'Blog', 'Webinar', 'Email', 'Demo'],
  attribution: {
    'LinkedIn': 40,    // First touch
    'Blog': 6.67,      // Middle
    'Webinar': 6.67,   // Middle
    'Email': 6.67,     // Middle
    'Demo': 40         // Last touch
  }
};
```

## Content Performance Metrics

### Content ROI

**Definition**: Return on investment for content marketing efforts.

**Formula**:
```
Content ROI = (Revenue from Content - Content Costs) / Content Costs × 100
```

**Example**:
```typescript
const contentROI = {
  costs: {
    creation: 2000,    // Writer, designer costs
    promotion: 500,    // Paid promotion
    tools: 300,        // Software costs
    total: 2800
  },
  results: {
    directRevenue: 8000,      // Trackable sales
    assistedRevenue: 4000,    // Influenced sales
    totalRevenue: 12000
  },
  roi: ((12000 - 2800) / 2800) * 100, // 328.57%
  paybackPeriod: 2800 / (12000 / 12)   // 2.8 months
};
```

### Share of Voice (SOV)

**Definition**: Your brand's visibility compared to competitors.

**Formula**:
```
SOV = (Your Brand Mentions / Total Industry Mentions) × 100
```

**Example**:
```typescript
const shareOfVoice = {
  yourMentions: 1250,
  competitorA: 3200,
  competitorB: 2100,
  competitorC: 1800,
  totalMentions: 8350,
  sov: (1250 / 8350) * 100, // 14.97%
  ranking: 4 // Fourth in market
};
```

### Virality Rate

**Definition**: How quickly content spreads through sharing.

**Formula**:
```
Virality Rate = (Shares / Impressions) × 100
```

**Viral Coefficient**:
```
K = Average Shares per User × Conversion Rate of Shared Content
```

**Example**:
```typescript
const virality = {
  impressions: 10000,
  shares: 450,
  viralityRate: (450 / 10000) * 100, // 4.5%
  
  viralCoefficient: {
    avgSharesPerUser: 2.5,
    sharedContentConversion: 0.15,
    k: 2.5 * 0.15 // 0.375 (needs to be >1 for true virality)
  }
};
```

## Channel-Specific Metrics

### Email Marketing Metrics

```typescript
const emailMetrics = {
  deliverability: {
    sent: 10000,
    bounced: 200,
    delivered: 9800,
    deliveryRate: 98.0
  },
  
  engagement: {
    opens: 2450,
    uniqueOpens: 2100,
    clicks: 490,
    uniqueClicks: 420,
    openRate: (2100 / 9800) * 100,      // 21.43%
    clickRate: (420 / 9800) * 100,      // 4.29%
    clickToOpenRate: (420 / 2100) * 100 // 20%
  },
  
  conversions: {
    conversions: 42,
    revenue: 12600,
    conversionRate: (42 / 420) * 100,    // 10%
    revenuePerEmail: 12600 / 9800        // $1.29
  },
  
  listHealth: {
    unsubscribes: 25,
    complaints: 3,
    unsubscribeRate: (25 / 9800) * 100,  // 0.26%
    complaintRate: (3 / 9800) * 100      // 0.03%
  }
};
```

### Social Media Metrics

```typescript
const socialMetrics = {
  reach: {
    organic: 25000,
    paid: 75000,
    total: 100000
  },
  
  engagement: {
    likes: 2500,
    comments: 350,
    shares: 450,
    saves: 180,
    totalEngagements: 3480,
    engagementRate: (3480 / 100000) * 100 // 3.48%
  },
  
  growth: {
    startFollowers: 10000,
    endFollowers: 10850,
    newFollowers: 850,
    unfollows: 125,
    netGrowth: 725,
    growthRate: (725 / 10000) * 100 // 7.25%
  },
  
  sentiment: {
    positive: 280,
    neutral: 50,
    negative: 20,
    sentimentScore: ((280 - 20) / 350) * 100 // 74.29%
  }
};
```

### SEO Metrics

```typescript
const seoMetrics = {
  visibility: {
    impressions: 150000,
    clicks: 4500,
    ctr: 3.0,
    avgPosition: 12.5
  },
  
  rankings: {
    top3: 45,
    top10: 125,
    top20: 230,
    total: 500
  },
  
  traffic: {
    organic: 25000,
    direct: 10000,
    referral: 5000,
    organicGrowth: 15.5 // % YoY
  },
  
  backlinks: {
    total: 1250,
    dofollow: 950,
    unique: 450,
    domainAuthority: 65
  }
};
```

## Advanced Metrics

### Marketing Qualified Lead (MQL) to Sales Qualified Lead (SQL) Ratio

**Definition**: The percentage of MQLs that become SQLs.

**Formula**:
```
MQL to SQL Ratio = (SQLs / MQLs) × 100
```

**Example**:
```typescript
const leadQuality = {
  mqls: 500,
  sqls: 150,
  ratio: (150 / 500) * 100, // 30%
  benchmark: 25, // Industry average
  performance: 'Above Average'
};
```

### Pipeline Velocity

**Definition**: How quickly leads move through your sales pipeline.

**Formula**:
```
Pipeline Velocity = (Number of Deals × Average Deal Value × Win Rate) / Sales Cycle Length
```

**Example**:
```typescript
const pipelineVelocity = {
  numberOfDeals: 50,
  avgDealValue: 10000,
  winRate: 0.25, // 25%
  salesCycleDays: 45,
  velocity: (50 * 10000 * 0.25) / 45, // $2,777.78 per day
  monthlyRevenuePotential: 2777.78 * 30 // $83,333.40
};
```

### Marketing Influence

**Definition**: The percentage of revenue that marketing touchpoints influenced.

**Formula**:
```
Marketing Influence = (Revenue with Marketing Touch / Total Revenue) × 100
```

**Example**:
```typescript
const marketingInfluence = {
  totalRevenue: 1000000,
  revenueWithMarketingTouch: 750000,
  influenceRate: (750000 / 1000000) * 100, // 75%
  byChannel: {
    content: 350000,
    paid: 250000,
    email: 100000,
    social: 50000
  }
};
```

### Net Promoter Score (NPS) Impact

**Definition**: Correlation between NPS and revenue growth.

**Example**:
```typescript
const npsImpact = {
  promoters: {
    count: 450,
    avgLTV: 5000,
    referralRate: 0.30
  },
  passives: {
    count: 300,
    avgLTV: 3500,
    referralRate: 0.10
  },
  detractors: {
    count: 50,
    avgLTV: 2000,
    churnRisk: 0.40
  },
  npsScore: ((450 - 50) / 800) * 100, // 50
  revenueImpact: {
    promoterValue: 450 * 5000 * 1.3, // Including referrals
    passiveValue: 300 * 3500 * 1.1,
    detractorRisk: 50 * 2000 * 0.4
  }
};
```

## Metric Calculation Best Practices

### Data Quality Checks

```typescript
const dataQualityChecks = {
  // Validate metric inputs
  validateInputs: (data) => {
    if (data.clicks > data.impressions) {
      throw new Error('Clicks cannot exceed impressions');
    }
    if (data.conversions > data.clicks) {
      throw new Error('Conversions cannot exceed clicks');
    }
    return true;
  },
  
  // Handle edge cases
  safeDivision: (numerator, denominator) => {
    if (denominator === 0) return 0;
    return numerator / denominator;
  },
  
  // Confidence intervals
  calculateConfidence: (conversions, trials, confidence = 0.95) => {
    const z = 1.96; // 95% confidence
    const p = conversions / trials;
    const margin = z * Math.sqrt((p * (1 - p)) / trials);
    return {
      rate: p,
      lower: Math.max(0, p - margin),
      upper: Math.min(1, p + margin)
    };
  }
};
```

### Time Period Normalization

```typescript
const normalizeMetrics = {
  // Annualize metrics
  annualize: (value, days) => (value / days) * 365,
  
  // Monthly average
  monthlyAverage: (value, days) => (value / days) * 30,
  
  // Cohort analysis
  cohortNormalization: (cohorts) => {
    return cohorts.map(cohort => ({
      ...cohort,
      normalizedLTV: cohort.revenue / cohort.customers,
      normalizedCAC: cohort.spend / cohort.customers
    }));
  }
};
```

## Reporting Templates

### Executive Dashboard Metrics

```typescript
const executiveDashboard = {
  revenue: {
    mrr: 250000,
    growth: 15.5, // % MoM
    target: 300000,
    attainment: 83.3
  },
  
  efficiency: {
    ltv: 4800,
    cac: 1200,
    ratio: 4.0,
    payback: 3.2 // months
  },
  
  marketing: {
    spend: 50000,
    leads: 450,
    cpl: 111.11,
    mqls: 150,
    mqlRate: 33.3
  },
  
  pipeline: {
    value: 2500000,
    velocity: 83333, // $/month
    coverage: 3.5 // x quota
  }
};
```

## Support

For questions about metric calculations:
- Email: analytics@marketingengine.io
- Documentation: https://docs.marketingengine.io/analytics
- Community: https://community.marketingengine.io/analytics