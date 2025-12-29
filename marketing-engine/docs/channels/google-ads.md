# Google Ads Channel Integration Guide

## Overview

The Google Ads integration enables automated campaign management, keyword optimization, and comprehensive performance tracking through the Google Ads API v15.

## Prerequisites

1. **Google Ads Account** - With billing configured
2. **Google Cloud Project** - For API access
3. **Developer Token** - From Google Ads API Center
4. **OAuth 2.0 Credentials**:
   - Client ID
   - Client Secret
   - Refresh Token
4. **Manager Account ID** (MCC) - Optional but recommended

## Setup Process

### Step 1: Create Google Cloud Project

```bash
# Using Google Cloud CLI
gcloud projects create marketing-engine-prod --name="Marketing Engine Production"
gcloud config set project marketing-engine-prod

# Enable required APIs
gcloud services enable googleads.googleapis.com
gcloud services enable oauth2.googleapis.com
```

### Step 2: Get Developer Token

1. Sign in to [Google Ads API Center](https://ads.google.com/aw/apicenter)
2. Apply for Basic or Standard access
3. Copy your developer token

### Step 3: OAuth 2.0 Setup

```typescript
// Generate OAuth URL
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://api.marketingengine.io/oauth/google/callback'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/adwords'],
  prompt: 'consent' // Force refresh token generation
});

// Exchange code for tokens
const { tokens } = await oauth2Client.getToken(code);
const refreshToken = tokens.refresh_token;
```

### Step 4: Configure in Marketing Engine

```typescript
import { MarketingEngine } from '@marketing-engine/sdk';
import { GoogleAdsChannel } from '@marketing-engine/channels';

const marketing = new MarketingEngine({
  channels: [
    new GoogleAdsChannel({
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      customerIds: {
        manager: '123-456-7890', // MCC account
        accounts: ['111-222-3333', '444-555-6666'] // Individual accounts
      },
      config: {
        enableSmartBidding: true,
        trackingTemplate: 'https://track.marketingengine.io/{lpurl}',
        autoTagging: true
      }
    })
  ]
});
```

## Campaign Types

### 1. Search Campaigns

```typescript
const searchCampaign = await googleAds.campaigns.create({
  name: 'Q1 2024 - Brand Keywords',
  type: 'SEARCH',
  status: 'ENABLED',
  budget: {
    name: 'Q1 Search Budget',
    amount: 100, // Daily budget in account currency
    deliveryMethod: 'STANDARD'
  },
  biddingStrategy: {
    type: 'TARGET_CPA',
    targetCpa: 50 // Target cost per acquisition
  },
  networkSettings: {
    targetGoogleSearch: true,
    targetSearchNetwork: true,
    targetPartnerSearchNetwork: false
  },
  geoTargeting: {
    locations: [
      { id: '2840' }, // United States
      { id: '2124' }  // Canada
    ]
  },
  languageTargeting: {
    languages: [
      { id: '1000' }, // English
      { id: '1002' }  // Spanish
    ]
  }
});
```

### 2. Shopping Campaigns

```typescript
const shoppingCampaign = await googleAds.campaigns.create({
  name: 'E-commerce Products - Smart Shopping',
  type: 'SMART_SHOPPING',
  status: 'ENABLED',
  merchantId: process.env.GOOGLE_MERCHANT_ID,
  budget: {
    amount: 200,
    deliveryMethod: 'ACCELERATED'
  },
  biddingStrategy: {
    type: 'MAXIMIZE_CONVERSION_VALUE',
    targetRoas: 400 // 400% target ROAS
  },
  settings: {
    salesCountry: 'US',
    campaignPriority: 'HIGH',
    enableLocalInventoryAds: true
  }
});
```

### 3. Performance Max Campaigns

```typescript
const performanceMax = await googleAds.campaigns.create({
  name: 'Performance Max - All Conversions',
  type: 'PERFORMANCE_MAX',
  status: 'ENABLED',
  budget: {
    amount: 500,
    deliveryMethod: 'STANDARD'
  },
  biddingStrategy: {
    type: 'MAXIMIZE_CONVERSIONS',
    targetCpaOptIn: true
  },
  assetGroups: [{
    name: 'Main Asset Group',
    finalUrls: ['https://example.com'],
    assets: {
      headlines: [
        'Transform Your Business with AI',
        'Get Started in Minutes',
        'Trusted by 10,000+ Companies',
        'Free Trial Available',
        'No Credit Card Required'
      ],
      descriptions: [
        'Discover how AI can revolutionize your marketing',
        'Join thousands of businesses already seeing results'
      ],
      images: {
        marketing: ['image1.jpg', 'image2.jpg'],
        square: ['square1.jpg', 'square2.jpg'],
        logo: ['logo.png']
      },
      videos: ['promo-video.mp4']
    },
    audienceSignals: {
      keywords: ['ai marketing', 'marketing automation'],
      urls: ['https://example.com/customers']
    }
  }]
});
```

### 4. Display Campaigns

```typescript
const displayCampaign = await googleAds.campaigns.create({
  name: 'Remarketing - Cart Abandoners',
  type: 'DISPLAY',
  status: 'ENABLED',
  budget: {
    amount: 50,
    deliveryMethod: 'STANDARD'
  },
  biddingStrategy: {
    type: 'TARGET_CPA',
    targetCpa: 25
  },
  targeting: {
    audienceLists: [
      { id: 'cart_abandoners_30d', exclude: false },
      { id: 'recent_purchasers_30d', exclude: true }
    ],
    contentTargeting: {
      topics: ['/Business/Business Services'],
      placements: {
        websites: ['techcrunch.com', 'businessinsider.com'],
        mobileApps: [],
        youtubeChannels: ['UC_x5XG1OV2P6uZZ5FSM9Ttw']
      }
    }
  }
});
```

## Keyword Management

### Keyword Research

```typescript
const keywordIdeas = await googleAds.keywordPlanner.generateIdeas({
  seedKeywords: ['marketing automation', 'email marketing software'],
  seedUrls: ['https://example.com/features'],
  location: '2840', // United States
  language: '1000', // English
  includeAdultKeywords: false
});

// Analyze keyword opportunities
const opportunities = keywordIdeas
  .filter(idea => idea.avgMonthlySearches > 1000)
  .filter(idea => idea.competition === 'LOW' || idea.competition === 'MEDIUM')
  .sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches)
  .slice(0, 50);

console.log(opportunities);
// [{
//   keyword: 'email marketing platforms',
//   avgMonthlySearches: 14800,
//   competition: 'MEDIUM',
//   topOfPageBidLow: 3.45,
//   topOfPageBidHigh: 12.89
// }]
```

### Ad Group Creation

```typescript
const adGroup = await googleAds.adGroups.create({
  campaignId: searchCampaign.id,
  name: 'Email Marketing - Exact',
  status: 'ENABLED',
  cpcBidAmount: 5.00,
  keywords: [
    {
      text: 'email marketing software',
      matchType: 'EXACT',
      bidAmount: 6.50 // Keyword-level bid
    },
    {
      text: 'email marketing platforms',
      matchType: 'EXACT'
    },
    {
      text: 'best email marketing tools',
      matchType: 'EXACT'
    }
  ],
  negativeKeywords: [
    { text: 'free', matchType: 'BROAD' },
    { text: 'cheap', matchType: 'BROAD' }
  ]
});
```

### Dynamic Search Ads

```typescript
const dsaAdGroup = await googleAds.adGroups.create({
  campaignId: searchCampaign.id,
  name: 'DSA - All Pages',
  type: 'SEARCH_DYNAMIC_ADS',
  dynamicSettings: {
    domainName: 'example.com',
    languageCode: 'en',
    useSuppliedUrlsOnly: false
  },
  targets: [
    {
      type: 'URL_CONTAINS',
      value: '/products/'
    },
    {
      type: 'PAGE_TITLE_CONTAINS',
      value: 'enterprise'
    }
  ]
});
```

## Ad Creation

### Responsive Search Ads (RSA)

```typescript
const rsa = await googleAds.ads.create({
  adGroupId: adGroup.id,
  type: 'RESPONSIVE_SEARCH_AD',
  finalUrls: ['https://example.com/demo'],
  headlines: [
    { text: 'AI-Powered Marketing Platform', pinning: 'FIRST' },
    { text: 'Automate Your Marketing' },
    { text: 'Get More Leads' },
    { text: 'Trusted by 10,000+ Businesses' },
    { text: 'Free 14-Day Trial' },
    { text: 'No Credit Card Required' },
    { text: 'See ROI in 30 Days' },
    { text: 'Enterprise-Ready Solution' },
    { text: '24/7 Customer Support' },
    { text: 'Marketing Automation Software' },
    { text: 'Boost Your Conversions' },
    { text: 'Start Growing Today' },
    { text: 'Limited Time Offer' },
    { text: 'Get Started in Minutes' },
    { text: 'Award-Winning Platform' }
  ],
  descriptions: [
    { text: 'Transform your marketing with AI. Automate campaigns, track ROI, and grow faster.', pinning: 'FIRST' },
    { text: 'Join thousands of businesses using our platform to scale their marketing efforts.' },
    { text: 'Get powerful analytics, automation, and integrations all in one platform.' },
    { text: 'See why marketers love our intuitive interface and powerful features. Try free today.' }
  ],
  path1: 'marketing',
  path2: 'platform'
});
```

### Ad Extensions

```typescript
// Sitelink Extensions
await googleAds.extensions.create({
  campaignId: searchCampaign.id,
  type: 'SITELINK',
  sitelinks: [
    {
      linkText: 'Features',
      finalUrls: ['https://example.com/features'],
      description1: 'Powerful automation tools',
      description2: 'Built for modern marketers'
    },
    {
      linkText: 'Pricing',
      finalUrls: ['https://example.com/pricing'],
      description1: 'Plans starting at $99/mo',
      description2: 'No setup fees'
    },
    {
      linkText: 'Free Demo',
      finalUrls: ['https://example.com/demo'],
      description1: 'See it in action',
      description2: 'Personalized walkthrough'
    },
    {
      linkText: 'Customer Stories',
      finalUrls: ['https://example.com/customers'],
      description1: 'Real results from real users',
      description2: '500% average ROI'
    }
  ]
});

// Callout Extensions
await googleAds.extensions.create({
  campaignId: searchCampaign.id,
  type: 'CALLOUT',
  callouts: [
    '24/7 Support',
    'Free Migration',
    'No Setup Fees',
    'Cancel Anytime',
    'GDPR Compliant'
  ]
});

// Structured Snippet Extensions
await googleAds.extensions.create({
  campaignId: searchCampaign.id,
  type: 'STRUCTURED_SNIPPET',
  header: 'Features',
  values: [
    'Email Automation',
    'Lead Scoring',
    'A/B Testing',
    'Analytics Dashboard',
    'CRM Integration'
  ]
});
```

## Conversion Tracking

### Setup Conversion Actions

```typescript
// Website conversion
const formSubmission = await googleAds.conversions.create({
  name: 'Demo Request Form',
  category: 'LEAD',
  type: 'WEBPAGE',
  status: 'ENABLED',
  value: {
    defaultValue: 100,
    alwaysUseDefault: false
  },
  countingType: 'ONE_PER_CLICK',
  windowDays: 30,
  windowMinutes: 43200, // 30 days
  includeInConversions: true,
  attributionModel: 'DATA_DRIVEN'
});

// Import from GA4
const ga4Import = await googleAds.conversions.import({
  name: 'Purchase',
  source: 'GOOGLE_ANALYTICS_4',
  propertyId: process.env.GA4_PROPERTY_ID,
  conversionEvent: 'purchase',
  value: {
    useEventValue: true
  }
});

// Enhanced conversions
await googleAds.conversions.enableEnhanced(formSubmission.id, {
  hashingEnabled: true,
  fields: ['email', 'phone', 'firstName', 'lastName', 'address']
});
```

### Conversion Tag Implementation

```html
<!-- Google Ads Conversion Tag -->
<script>
  gtag('event', 'conversion', {
    'send_to': 'AW-123456789/AbC-D_efG-h12_34-567',
    'value': 100.00,
    'currency': 'USD',
    'transaction_id': '12345'
  });
</script>

<!-- Enhanced Conversion Data -->
<script>
  gtag('set', 'user_data', {
    'email': 'hashedEmail@example.com', // Must be hashed
    'phone_number': '+1234567890', // Must be hashed
    'address': {
      'first_name': 'John', // Must be hashed
      'last_name': 'Doe', // Must be hashed
      'street': '123 Main St',
      'city': 'New York',
      'region': 'NY',
      'postal_code': '10001',
      'country': 'US'
    }
  });
</script>
```

## Bidding Strategies

### Smart Bidding Setup

```typescript
// Target CPA
const targetCpaBidding = await googleAds.biddingStrategies.create({
  name: 'Lead Gen - Target CPA $50',
  type: 'TARGET_CPA',
  targetCpa: {
    targetCpaMicros: 50000000, // $50 in micros
    cpcBidCeilingMicros: 10000000, // $10 max CPC
    cpcBidFloorMicros: 1000000 // $1 min CPC
  }
});

// Target ROAS
const targetRoasBidding = await googleAds.biddingStrategies.create({
  name: 'E-commerce - 400% ROAS',
  type: 'TARGET_ROAS',
  targetRoas: {
    targetRoas: 4.0, // 400% ROAS
    cpcBidCeilingMicros: 15000000, // $15 max CPC
    cpcBidFloorMicros: 500000 // $0.50 min CPC
  }
});

// Maximize Conversions with Target CPA
const maxConversionsBidding = await googleAds.biddingStrategies.create({
  name: 'Max Conversions - Optional Target',
  type: 'MAXIMIZE_CONVERSIONS',
  maximizeConversions: {
    targetCpaMicros: 40000000, // Optional: $40 target
    cpcBidCeilingMicros: 8000000 // Optional: $8 ceiling
  }
});
```

### Bid Adjustments

```typescript
// Device bid adjustments
await googleAds.bidAdjustments.create({
  campaignId: searchCampaign.id,
  type: 'DEVICE',
  adjustments: [
    { device: 'MOBILE', modifier: 1.20 }, // +20% on mobile
    { device: 'TABLET', modifier: 0.90 }, // -10% on tablet
    { device: 'DESKTOP', modifier: 1.00 } // No adjustment
  ]
});

// Location bid adjustments
await googleAds.bidAdjustments.create({
  campaignId: searchCampaign.id,
  type: 'LOCATION',
  adjustments: [
    { locationId: '9061237', modifier: 1.30 }, // New York +30%
    { locationId: '9061243', modifier: 1.25 }, // Los Angeles +25%
    { locationId: '1014221', modifier: 0.80 }  // Rural areas -20%
  ]
});

// Schedule bid adjustments
await googleAds.bidAdjustments.create({
  campaignId: searchCampaign.id,
  type: 'AD_SCHEDULE',
  adjustments: [
    { 
      dayOfWeek: 'MONDAY', 
      startHour: 9, 
      endHour: 17, 
      modifier: 1.15 // Business hours +15%
    },
    {
      dayOfWeek: 'SATURDAY',
      modifier: 0.75 // Weekends -25%
    }
  ]
});
```

## Analytics & Reporting

### Performance Reports

```typescript
// Campaign performance report
const campaignReport = await googleAds.reports.query({
  query: `
    SELECT 
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign 
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
  `
});

// Keyword performance with quality score
const keywordReport = await googleAds.reports.query({
  query: `
    SELECT
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.quality_info.quality_score,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion,
      metrics.search_impression_share
    FROM keyword_view
    WHERE 
      segments.date DURING LAST_30_DAYS
      AND ad_group_criterion.status = 'ENABLED'
    ORDER BY metrics.impressions DESC
    LIMIT 100
  `
});

// Search terms report
const searchTermsReport = await googleAds.reports.query({
  query: `
    SELECT
      search_term_view.search_term,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE 
      segments.date DURING LAST_7_DAYS
      AND metrics.impressions > 10
    ORDER BY metrics.cost_micros DESC
  `
});
```

### Custom Dashboards

```typescript
// Real-time performance dashboard
const dashboard = await googleAds.analytics.getDashboard({
  timeRange: 'TODAY',
  metrics: [
    'impressions',
    'clicks',
    'cost',
    'conversions',
    'conversionValue'
  ],
  segments: ['hour', 'device', 'campaign'],
  compareWith: 'YESTERDAY'
});

// Calculate real-time KPIs
const kpis = {
  ctr: (dashboard.clicks / dashboard.impressions) * 100,
  cpc: dashboard.cost / dashboard.clicks,
  conversionRate: (dashboard.conversions / dashboard.clicks) * 100,
  cpa: dashboard.cost / dashboard.conversions,
  roas: dashboard.conversionValue / dashboard.cost,
  pace: {
    spend: dashboard.cost / dashboard.budgetRemaining,
    conversions: dashboard.conversions / dashboard.conversionTarget
  }
};
```

## Automation & Scripts

### Google Ads Scripts

```javascript
// Automated bid adjustments based on weather
function main() {
  const WEATHER_API_KEY = 'your-api-key';
  const campaigns = AdsApp.campaigns()
    .withCondition('Status = ENABLED')
    .get();
  
  while (campaigns.hasNext()) {
    const campaign = campaigns.next();
    const weather = getWeather(campaign.targeting().targetedLocations());
    
    if (weather.temperature > 80) {
      // Hot weather: increase bids for summer products
      campaign.bidding().setStrategyBidModifier(1.20);
      Logger.log(`Increased bids by 20% for ${campaign.getName()} due to hot weather`);
    } else if (weather.temperature < 32) {
      // Cold weather: increase bids for winter products
      campaign.bidding().setStrategyBidModifier(1.15);
    }
  }
}

// Pause poor performing keywords
function pausePoorKeywords() {
  const keywords = AdsApp.keywords()
    .withCondition('Status = ENABLED')
    .withCondition('Clicks > 100')
    .withCondition('Conversions < 1')
    .withCondition('Cost > 200')
    .forDateRange('LAST_30_DAYS')
    .get();
    
  while (keywords.hasNext()) {
    const keyword = keywords.next();
    keyword.pause();
    Logger.log(`Paused keyword: ${keyword.getText()} - High cost, no conversions`);
  }
}
```

### API Automation

```typescript
// Daily budget pacing
const budgetPacer = new GoogleAdsBudgetPacer({
  monthlyBudget: 10000,
  frontLoad: 1.2, // Spend 20% more in first half of month
  minDailyBudget: 200,
  maxDailyBudget: 500
});

await budgetPacer.adjustDailyBudgets();

// Automated keyword harvesting
const keywordHarvester = new KeywordHarvester({
  minImpressions: 50,
  minCtr: 2.0, // 2% CTR minimum
  addAsExact: true,
  addNegatives: true
});

const newKeywords = await keywordHarvester.harvest({
  campaigns: [searchCampaign.id],
  lookbackDays: 30
});

// Add profitable search terms as keywords
for (const keyword of newKeywords) {
  await googleAds.keywords.create({
    adGroupId: keyword.adGroupId,
    text: keyword.searchTerm,
    matchType: 'EXACT',
    bidAmount: keyword.suggestedBid
  });
}
```

## Testing & Optimization

### A/B Testing Framework

```typescript
const experiment = await googleAds.experiments.create({
  name: 'Landing Page Test Q1 2024',
  type: 'SEARCH_CUSTOM',
  trafficSplitPercent: 50,
  status: 'ENABLED',
  startDate: '2024-01-15',
  endDate: '2024-02-15',
  campaigns: [searchCampaign.id],
  arms: [
    {
      name: 'Control',
      control: true
    },
    {
      name: 'New Landing Page',
      control: false,
      changes: [
        {
          type: 'AD_URL',
          oldValue: 'https://example.com/old-landing',
          newValue: 'https://example.com/new-landing'
        }
      ]
    }
  ],
  metrics: ['conversions', 'costPerConversion', 'conversionRate'],
  successCriteria: {
    metric: 'costPerConversion',
    improvement: 10 // 10% improvement required
  }
});

// Monitor experiment
const results = await googleAds.experiments.getResults(experiment.id);
if (results.status === 'WINNER_FOUND') {
  await googleAds.experiments.graduate(experiment.id, results.winnerId);
}
```

### Quality Score Optimization

```typescript
// Analyze quality score factors
const qualityAnalysis = await googleAds.keywords.analyzeQuality({
  adGroupId: adGroup.id,
  factors: ['relevance', 'landingPage', 'expectedCtr']
});

// Recommendations
for (const keyword of qualityAnalysis.keywords) {
  if (keyword.qualityScore < 7) {
    console.log(`Low quality score for "${keyword.text}": ${keyword.qualityScore}/10`);
    
    if (keyword.factors.relevance < 'AVERAGE') {
      console.log('- Improve ad relevance: Add keyword to ad copy');
    }
    
    if (keyword.factors.landingPage < 'AVERAGE') {
      console.log('- Improve landing page: Add keyword, improve load time');
    }
    
    if (keyword.factors.expectedCtr < 'AVERAGE') {
      console.log('- Improve expected CTR: Test new ad copy');
    }
  }
}
```

## Error Handling

### Common Errors

```typescript
try {
  await googleAds.campaigns.create(campaignData);
} catch (error) {
  if (error.code === 'RESOURCE_EXHAUSTED') {
    console.error('Rate limit hit. Waiting before retry...');
    await sleep(60000); // Wait 1 minute
  } else if (error.code === 'INVALID_ARGUMENT') {
    console.error('Invalid campaign data:', error.details);
  } else if (error.code === 'PERMISSION_DENIED') {
    console.error('Missing permissions. Check OAuth scopes.');
  } else if (error.fieldErrors) {
    // Field-specific validation errors
    error.fieldErrors.forEach(fieldError => {
      console.error(`Field ${fieldError.field}: ${fieldError.message}`);
    });
  }
}
```

### Batch Operation Error Handling

```typescript
const operations = keywords.map(keyword => ({
  create: {
    adGroup: adGroupId,
    keyword: {
      text: keyword.text,
      matchType: keyword.matchType
    }
  }
}));

const results = await googleAds.keywords.mutate(operations);

results.forEach((result, index) => {
  if (result.error) {
    console.error(`Failed to create keyword "${keywords[index].text}": ${result.error.message}`);
  } else {
    console.log(`Created keyword: ${result.resourceName}`);
  }
});
```

## Best Practices

### Account Structure

```
Account
├── Search Campaigns
│   ├── Brand
│   │   ├── Brand - Exact
│   │   └── Brand - Modified Broad
│   ├── Generic
│   │   ├── Product Category 1
│   │   ├── Product Category 2
│   │   └── Product Category 3
│   └── Competitor
│       ├── Competitor Brand 1
│       └── Competitor Brand 2
├── Shopping Campaigns
│   ├── High Priority - Brand
│   ├── Medium Priority - Generic
│   └── Low Priority - All Products
└── Display Campaigns
    ├── Remarketing
    │   ├── Cart Abandoners
    │   ├── Product Viewers
    │   └── Past Purchasers (Exclude)
    └── Prospecting
        ├── In-Market Audiences
        └── Custom Intent
```

### Optimization Checklist

1. **Daily**
   - Monitor spend pacing
   - Check for disapproved ads
   - Review search terms report
   - Pause poor performers

2. **Weekly**
   - Add negative keywords
   - Adjust bids based on performance
   - Test new ad copy
   - Review quality scores

3. **Monthly**
   - Full account audit
   - Update audience lists
   - Refresh ad creatives
   - Analyze attribution paths

## Resources

- [Google Ads API Documentation](https://developers.google.com/google-ads/api/docs/start)
- [Google Ads Scripts](https://developers.google.com/google-ads/scripts/docs/overview)
- [Best Practices Guide](https://support.google.com/google-ads/answer/2375474)
- [Marketing Engine Support](mailto:google-ads-support@marketingengine.io)