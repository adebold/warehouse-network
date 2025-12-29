# LinkedIn Channel Integration Guide

## Overview

The LinkedIn integration enables automated content publishing, campaign management, and performance analytics through the LinkedIn Marketing API v2.

## Prerequisites

1. **LinkedIn Company Page** - Admin access required
2. **LinkedIn Developer Application** - For API access
3. **Marketing Developer Platform Access** - For ads functionality
4. **API Credentials**:
   - Client ID
   - Client Secret
   - Access Token (with required scopes)

## Setup Process

### Step 1: Create LinkedIn App

1. Visit [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Click "Create app"
3. Fill in application details:
   - App name: "Marketing Engine Integration"
   - LinkedIn Page: Select your company page
   - Privacy policy URL: Your privacy policy
   - App logo: Upload logo

### Step 2: Request API Access

Request access to required products:

1. **Share on LinkedIn** - For organic posts
2. **Marketing Developer Platform** - For advertising
3. **Sign In with LinkedIn** - For authentication

### Step 3: Configure OAuth 2.0

```typescript
const linkedInAuth = {
  clientId: process.env.LINKEDIN_CLIENT_ID,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  redirectUri: 'https://api.marketingengine.io/oauth/linkedin/callback',
  scope: [
    'r_liteprofile',
    'r_emailaddress', 
    'w_member_social',
    'r_organization_social',
    'w_organization_social',
    'r_ads',
    'w_ads',
    'r_ads_reporting'
  ].join(' ')
};
```

### Step 4: Generate Access Token

```bash
# Step 1: Get authorization code
https://www.linkedin.com/oauth/v2/authorization?
  response_type=code&
  client_id={clientId}&
  redirect_uri={redirectUri}&
  state={randomState}&
  scope={scope}

# Step 2: Exchange code for access token
curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code={authorizationCode}" \
  -d "redirect_uri={redirectUri}" \
  -d "client_id={clientId}" \
  -d "client_secret={clientSecret}"
```

### Step 5: Configure in Marketing Engine

```typescript
import { MarketingEngine } from '@marketing-engine/sdk';
import { LinkedInChannel } from '@marketing-engine/channels';

const marketing = new MarketingEngine({
  channels: [
    new LinkedInChannel({
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
      organizationId: '12345678', // Your organization URN
      config: {
        defaultVisibility: 'PUBLIC',
        enableHashtagSuggestions: true,
        scheduleOptimization: true,
        timezone: 'America/New_York'
      }
    })
  ]
});
```

## Content Publishing

### Post Types

#### 1. Text Post

```typescript
const result = await marketing.publishContent({
  title: 'Exciting announcement!',
  body: 'We are thrilled to share our latest innovation in AI-powered marketing...',
  targetChannels: ['linkedin'],
  linkedinOptions: {
    visibility: 'PUBLIC'
  }
});
```

#### 2. Article Share

```typescript
const result = await marketing.publishContent({
  title: 'AI in Marketing: 2024 Comprehensive Guide',
  body: 'Check out our latest blog post on AI trends',
  targetChannels: ['linkedin'],
  linkedinOptions: {
    articleUrl: 'https://blog.example.com/ai-marketing-2024',
    articleTitle: 'AI in Marketing: 2024 Comprehensive Guide',
    articleDescription: 'Discover how AI is transforming marketing strategies',
    articleImage: 'https://blog.example.com/images/ai-marketing.jpg'
  }
});
```

#### 3. Media Post

```typescript
const result = await marketing.publishContent({
  title: 'Product Demo Video',
  body: 'Watch our 2-minute demo of the new features',
  targetChannels: ['linkedin'],
  linkedinOptions: {
    media: {
      type: 'VIDEO',
      url: 'https://videos.example.com/product-demo.mp4',
      title: 'Product Demo Q4 2024',
      description: 'See the latest features in action'
    }
  }
});
```

#### 4. Native Video Upload

```typescript
// Step 1: Initialize video upload
const upload = await linkedIn.video.initializeUpload({
  fileSize: 10485760, // 10MB
  fileName: 'product-demo.mp4'
});

// Step 2: Upload video chunks
await linkedIn.video.uploadChunk(upload.uploadUrl, videoBuffer);

// Step 3: Finalize and publish
const result = await marketing.publishContent({
  title: 'New Product Demo',
  body: 'Check out our latest features',
  targetChannels: ['linkedin'],
  linkedinOptions: {
    video: {
      assetUrn: upload.assetUrn,
      thumbnail: 'https://example.com/thumbnail.jpg'
    }
  }
});
```

### Content Best Practices

```typescript
// Optimal post configuration
const optimalPost = {
  title: 'Compelling headline under 150 characters',
  body: `
🚀 Start with an emoji to catch attention

Share valuable insights in 3-4 paragraphs. LinkedIn's algorithm favors:

✅ Native content (not just links)
✅ Engaging questions
✅ Industry insights
✅ Personal stories

What's your experience with [topic]? Share below! 

#AI #MarketingAutomation #DigitalTransformation
  `.trim(),
  targetChannels: ['linkedin'],
  linkedinOptions: {
    visibility: 'PUBLIC',
    commentPolicy: 'EVERYONE', // Encourage engagement
    hashtags: ['AI', 'MarketingAutomation', 'DigitalTransformation']
  },
  scheduledFor: '2024-01-15T10:00:00-05:00' // Best times: Tue-Thu, 10am-12pm
};
```

## LinkedIn Ads Integration

### Campaign Creation

```typescript
const campaign = await linkedIn.campaigns.create({
  account: 'urn:li:sponsoredAccount:123456',
  name: 'Q1 2024 Lead Generation',
  objective: 'LEAD_GENERATION',
  type: 'SPONSORED_CONTENT',
  status: 'ACTIVE',
  budget: {
    amount: { value: 5000, currencyCode: 'USD' },
    type: 'TOTAL'
  },
  schedule: {
    start: '2024-01-01',
    end: '2024-03-31'
  },
  targeting: {
    locations: ['urn:li:country:us', 'urn:li:country:ca'],
    industries: [
      'urn:li:industry:96', // IT & Services
      'urn:li:industry:4'   // Computer Software
    ],
    jobFunctions: [
      'urn:li:function:12', // Information Technology
      'urn:li:function:8'   // Engineering
    ],
    seniorities: [
      'urn:li:seniority:8', // VP
      'urn:li:seniority:9', // CXO
      'urn:li:seniority:10' // Director
    ],
    companySize: ['SIZE_501_1000', 'SIZE_1001_5000', 'SIZE_5001_PLUS']
  }
});
```

### Ad Creative

```typescript
const creative = await linkedIn.creatives.create({
  campaign: campaign.id,
  type: 'SPONSORED_UPDATE',
  status: 'ACTIVE',
  reference: postResult.linkedinUrn, // From content publish
  callToAction: {
    label: 'LEARN_MORE',
    target: 'https://example.com/demo?utm_source=linkedin'
  }
});
```

### Conversion Tracking

```typescript
// Create conversion rule
const conversion = await linkedIn.conversions.create({
  name: 'Demo Request Form Submission',
  type: 'LEAD',
  attribution: {
    window: 30, // days
    model: 'LAST_TOUCH_ADS_PREFERRED'
  },
  url: {
    matchType: 'EXACT',
    value: 'https://example.com/demo/thank-you'
  }
});

// Install Insight Tag
const insightTag = `
<script type="text/javascript">
_linkedin_partner_id = "${process.env.LINKEDIN_PARTNER_ID}";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
<script type="text/javascript">
(function(l) {
  if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
  window.lintrk.q=[]}
  var s = document.getElementsByTagName("script")[0];
  var b = document.createElement("script");
  b.type = "text/javascript";b.async = true;
  b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
  s.parentNode.insertBefore(b, s);})(window.lintrk);
</script>
<noscript>
  <img height="1" width="1" style="display:none;" alt="" 
    src="https://px.ads.linkedin.com/collect/?pid=${process.env.LINKEDIN_PARTNER_ID}&fmt=gif" />
</noscript>
`;
```

### Lead Gen Forms

```typescript
const leadForm = await linkedIn.leadForms.create({
  name: 'Demo Request Form',
  privacyPolicy: 'https://example.com/privacy',
  headline: 'Get Your Free Demo',
  description: 'See how our platform can transform your marketing',
  fields: [
    { type: 'FIRST_NAME', required: true },
    { type: 'LAST_NAME', required: true },
    { type: 'EMAIL', required: true },
    { type: 'COMPANY', required: true },
    { type: 'JOB_TITLE', required: false },
    { type: 'PHONE', required: false }
  ],
  customQuestions: [
    {
      question: 'What is your biggest marketing challenge?',
      type: 'SINGLE_LINE_TEXT',
      required: false
    }
  ],
  confirmation: {
    headline: 'Thank you!',
    message: "We'll be in touch within 24 hours.",
    cta: {
      label: 'Visit our website',
      url: 'https://example.com'
    }
  }
});
```

## Analytics & Reporting

### Organic Post Analytics

```typescript
const analytics = await linkedIn.analytics.getPostMetrics({
  postUrn: 'urn:li:share:123456789',
  metrics: [
    'impressionCount',
    'clickCount',
    'engagement',
    'shareCount',
    'likeCount',
    'commentCount'
  ]
});

console.log(analytics);
// {
//   impressionCount: 12543,
//   clickCount: 342,
//   engagement: 0.0456, // 4.56% engagement rate
//   shareCount: 23,
//   likeCount: 156,
//   commentCount: 34
// }
```

### Campaign Performance

```typescript
const performance = await linkedIn.analytics.getCampaignMetrics({
  campaign: campaign.id,
  dateRange: {
    start: '2024-01-01',
    end: '2024-01-31'
  },
  metrics: [
    'impressions',
    'clicks',
    'costInUsd',
    'leads',
    'conversionValueInUsd'
  ],
  pivot: 'DAILY'
});

// Calculate KPIs
const kpis = {
  ctr: (performance.clicks / performance.impressions) * 100,
  cpc: performance.costInUsd / performance.clicks,
  cpl: performance.costInUsd / performance.leads,
  roas: performance.conversionValueInUsd / performance.costInUsd
};
```

### Audience Demographics

```typescript
const demographics = await linkedIn.analytics.getAudienceInsights({
  campaign: campaign.id,
  dimensions: ['COMPANY_INDUSTRY', 'JOB_FUNCTION', 'SENIORITY']
});

// Top performing segments
const topIndustries = demographics.COMPANY_INDUSTRY
  .sort((a, b) => b.conversions - a.conversions)
  .slice(0, 5);
```

## Automation & Optimization

### Auto-Scheduling

```typescript
const scheduler = new LinkedInScheduler({
  timezone: 'America/New_York',
  optimalTimes: [
    { day: 'Tuesday', time: '10:00' },
    { day: 'Wednesday', time: '10:00' },
    { day: 'Thursday', time: '10:00' }
  ],
  avoidHolidays: true,
  spacingHours: 48 // Minimum hours between posts
});

// Queue content for optimal scheduling
await scheduler.queue({
  content: [
    { title: 'Post 1', body: '...' },
    { title: 'Post 2', body: '...' },
    { title: 'Post 3', body: '...' }
  ],
  distribute: 'weekly'
});
```

### Bid Optimization

```typescript
const optimizer = new LinkedInBidOptimizer({
  targetCPL: 75,
  adjustmentInterval: 'daily',
  maxBidIncrease: 0.20, // 20%
  maxBidDecrease: 0.30  // 30%
});

// Run optimization
const adjustments = await optimizer.optimize(campaign.id);
console.log(adjustments);
// {
//   previousBid: 8.50,
//   newBid: 7.65,
//   change: -0.10,
//   reason: 'CPL above target',
//   projectedCPL: 72.50
// }
```

### A/B Testing

```typescript
const abTest = await linkedIn.experiments.create({
  name: 'Headline Test Q1 2024',
  campaign: campaign.id,
  variants: [
    {
      name: 'Control',
      weight: 50,
      creative: { headline: 'Transform Your Marketing with AI' }
    },
    {
      name: 'Variant A',
      weight: 50,
      creative: { headline: 'Get 10X Marketing ROI with AI Automation' }
    }
  ],
  metrics: ['CTR', 'CPL', 'CONVERSION_RATE'],
  duration: 14, // days
  minimumSampleSize: 1000
});

// Monitor results
const results = await linkedIn.experiments.getResults(abTest.id);
if (results.winner) {
  console.log(`Winner: ${results.winner.name} with ${results.winner.improvement}% improvement`);
}
```

## Error Handling

### Common Errors

```typescript
try {
  await linkedIn.publish(content);
} catch (error) {
  switch (error.code) {
    case 'UNAUTHORIZED':
      // Token expired - refresh
      await refreshLinkedInToken();
      break;
      
    case 'RATE_LIMIT_EXCEEDED':
      // LinkedIn rate limits: 100 requests/day for organic, 1000/day for ads
      console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
      break;
      
    case 'INVALID_URN':
      // Organization or asset URN is invalid
      console.error('Invalid LinkedIn URN:', error.details);
      break;
      
    case 'CONTENT_TOO_LONG':
      // Text exceeds LinkedIn limits (3000 chars for posts)
      console.error('Content too long:', error.details);
      break;
      
    case 'INSUFFICIENT_PERMISSIONS':
      // Missing required OAuth scopes
      console.error('Need additional permissions:', error.requiredScopes);
      break;
  }
}
```

### Retry Strategy

```typescript
const retryableErrors = [
  'RATE_LIMIT_EXCEEDED',
  'TEMPORARY_SERVER_ERROR',
  'TIMEOUT'
];

async function publishWithRetry(content, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await linkedIn.publish(content);
    } catch (error) {
      if (!retryableErrors.includes(error.code) || attempt === maxAttempts) {
        throw error;
      }
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.log(`Attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}
```

## Best Practices

### Content Strategy

1. **Posting Frequency**: 2-3 times per week maximum
2. **Optimal Times**: Tuesday-Thursday, 10 AM - 12 PM EST
3. **Content Mix**:
   - 40% - Industry insights and thought leadership
   - 30% - Company updates and culture
   - 20% - Educational content
   - 10% - Promotional content

### Targeting Best Practices

```typescript
// Effective B2B targeting
const b2bTargeting = {
  // Start broad, then narrow
  locations: ['urn:li:country:us'],
  
  // Target decision makers
  seniorities: [
    'urn:li:seniority:8',  // VP
    'urn:li:seniority:9',  // CXO
    'urn:li:seniority:10', // Director
    'urn:li:seniority:7'   // Manager
  ],
  
  // Relevant industries
  industries: [
    'urn:li:industry:96',  // IT & Services
    'urn:li:industry:4',   // Computer Software
    'urn:li:industry:6'    // Internet
  ],
  
  // Exclude competitors
  excludedCompanies: [
    'urn:li:company:1234', // Competitor 1
    'urn:li:company:5678'  // Competitor 2
  ],
  
  // Audience size should be 50k-300k for optimal performance
  enableAudienceExpansion: true
};
```

### Performance Optimization

1. **Use native video**: 5x more engagement than links
2. **Include faces**: Posts with faces get 2x more engagement
3. **Ask questions**: Increases comments by 50%
4. **Use 3-5 hashtags**: Optimal for discoverability
5. **Post consistently**: Same days/times each week

## Troubleshooting

### Connection Issues

```bash
# Test LinkedIn API connectivity
curl -H "Authorization: Bearer ${LINKEDIN_TOKEN}" \
  https://api.linkedin.com/v2/me

# Verify organization access
curl -H "Authorization: Bearer ${LINKEDIN_TOKEN}" \
  "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&projection=(elements*(organization~))"
```

### Debug Mode

```typescript
const linkedIn = new LinkedInChannel({
  accessToken: token,
  debug: true, // Enable detailed logging
  logger: (level, message, data) => {
    console.log(`[LinkedIn ${level}]`, message, data);
  }
});
```

## Resources

- [LinkedIn Marketing API Docs](https://docs.microsoft.com/en-us/linkedin/marketing/)
- [LinkedIn OAuth 2.0 Guide](https://docs.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [LinkedIn Asset Library](https://www.linkedin.com/help/lms/answer/a423089)
- [LinkedIn Targeting Options](https://business.linkedin.com/marketing-solutions/ad-targeting)
- [Marketing Engine LinkedIn Support](mailto:linkedin-support@marketingengine.io)