# Attribution Models Guide

## Overview

Attribution modeling determines how credit for conversions is assigned to touchpoints in marketing campaigns. Marketing Engine supports multiple attribution models to help you understand your customer journey and optimize marketing spend.

## Attribution Models Comparison

| Model | Credit Distribution | Best For | Limitations |
|-------|-------------------|----------|-------------|
| Last Touch | 100% to last interaction | Direct response campaigns | Ignores awareness building |
| First Touch | 100% to first interaction | Brand awareness analysis | Ignores nurturing efforts |
| Linear | Equal across all touches | Long sales cycles | Over-values minor touchpoints |
| Time Decay | More to recent touches | Considered purchases | Complex to implement |
| Position-Based | 40% first, 40% last, 20% middle | Balanced view | Arbitrary percentages |
| Data-Driven | ML-based distribution | Most accurate | Requires significant data |

## Implementation Guide

### Setting Up Attribution Tracking

```typescript
import { AttributionEngine } from '@marketing-engine/attribution';

const attribution = new AttributionEngine({
  // Configuration
  model: 'multiTouch',
  lookbackWindow: 90, // days
  conversionTypes: ['purchase', 'subscription', 'demo_request'],
  
  // Data sources
  dataSources: {
    analytics: {
      provider: 'googleAnalytics4',
      propertyId: process.env.GA4_PROPERTY_ID
    },
    crm: {
      provider: 'salesforce',
      instanceUrl: process.env.SALESFORCE_URL
    },
    advertising: {
      google: { accountId: process.env.GOOGLE_ADS_ID },
      linkedin: { accountId: process.env.LINKEDIN_AD_ACCOUNT }
    }
  },
  
  // Custom rules
  rules: {
    minimumTouchpoints: 1,
    excludeDirectTraffic: false,
    requireUserConsent: true
  }
});
```

### Tracking Customer Touchpoints

```typescript
// Client-side tracking
const tracker = new TouchpointTracker({
  userId: getUserId(),
  sessionId: getSessionId(),
  attribution: {
    source: getUTMSource(),
    medium: getUTMMedium(),
    campaign: getUTMCampaign()
  }
});

// Track page views
tracker.trackPageView({
  url: window.location.href,
  title: document.title,
  referrer: document.referrer,
  timestamp: new Date().toISOString()
});

// Track events
tracker.trackEvent({
  action: 'download_whitepaper',
  category: 'content',
  label: 'ai-marketing-guide',
  value: 10 // Content score
});

// Track conversions
tracker.trackConversion({
  type: 'demo_request',
  value: 1000, // Estimated value
  attributes: {
    company_size: 'enterprise',
    industry: 'technology'
  }
});
```

## Last Touch Attribution

### Implementation

```typescript
class LastTouchAttribution {
  async calculate(conversionId: string): Promise<Attribution> {
    // Get all touchpoints for the converting user
    const touchpoints = await this.getTouchpoints(conversionId);
    
    // Sort by timestamp
    const sorted = touchpoints.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // Last touchpoint gets 100% credit
    const lastTouch = sorted[0];
    
    return {
      model: 'lastTouch',
      conversion: conversionId,
      attribution: [{
        touchpoint: lastTouch,
        credit: 100,
        revenue: lastTouch.conversionValue
      }]
    };
  }
}

// Example usage
const lastTouch = new LastTouchAttribution();
const result = await lastTouch.calculate('conv_123');

console.log(result);
// {
//   model: 'lastTouch',
//   conversion: 'conv_123',
//   attribution: [{
//     touchpoint: {
//       channel: 'email',
//       campaign: 'nurture_sequence_5',
//       timestamp: '2024-01-15T10:30:00Z'
//     },
//     credit: 100,
//     revenue: 5000
//   }]
// }
```

### Use Cases

1. **E-commerce checkout analysis**
2. **Direct response campaigns**
3. **Promotional campaign effectiveness**
4. **Retargeting performance**

## First Touch Attribution

### Implementation

```typescript
class FirstTouchAttribution {
  async calculate(conversionId: string): Promise<Attribution> {
    const touchpoints = await this.getTouchpoints(conversionId);
    
    // Sort by timestamp ascending
    const sorted = touchpoints.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // First touchpoint gets 100% credit
    const firstTouch = sorted[0];
    
    return {
      model: 'firstTouch',
      conversion: conversionId,
      attribution: [{
        touchpoint: firstTouch,
        credit: 100,
        revenue: firstTouch.conversionValue
      }],
      insights: {
        daysFromFirstTouch: this.calculateDays(firstTouch.timestamp, conversion.timestamp),
        totalTouchpoints: touchpoints.length
      }
    };
  }
}
```

### Use Cases

1. **Brand awareness campaigns**
2. **Content marketing ROI**
3. **Top-of-funnel optimization**
4. **New market entry analysis**

## Linear Attribution

### Implementation

```typescript
class LinearAttribution {
  async calculate(conversionId: string): Promise<Attribution> {
    const touchpoints = await this.getTouchpoints(conversionId);
    const creditPerTouch = 100 / touchpoints.length;
    const revenuePerTouch = this.conversionValue / touchpoints.length;
    
    return {
      model: 'linear',
      conversion: conversionId,
      attribution: touchpoints.map(touchpoint => ({
        touchpoint,
        credit: creditPerTouch,
        revenue: revenuePerTouch
      })),
      summary: {
        totalTouchpoints: touchpoints.length,
        avgCreditPerTouch: creditPerTouch,
        channels: this.summarizeByChannel(touchpoints, creditPerTouch)
      }
    };
  }
  
  private summarizeByChannel(touchpoints: Touchpoint[], creditPerTouch: number) {
    const summary = {};
    
    touchpoints.forEach(tp => {
      if (!summary[tp.channel]) {
        summary[tp.channel] = {
          touches: 0,
          credit: 0
        };
      }
      summary[tp.channel].touches++;
      summary[tp.channel].credit += creditPerTouch;
    });
    
    return summary;
  }
}
```

### Example Journey

```typescript
// Customer journey with 5 touchpoints
const journey = {
  touchpoints: [
    { channel: 'LinkedIn Ad', day: 1 },
    { channel: 'Blog Visit', day: 5 },
    { channel: 'Webinar', day: 12 },
    { channel: 'Email', day: 18 },
    { channel: 'Demo', day: 25 }
  ],
  conversion: { value: 10000, day: 25 }
};

// Linear attribution result
const linearResult = {
  'LinkedIn Ad': { credit: 20, revenue: 2000 },
  'Blog Visit': { credit: 20, revenue: 2000 },
  'Webinar': { credit: 20, revenue: 2000 },
  'Email': { credit: 20, revenue: 2000 },
  'Demo': { credit: 20, revenue: 2000 }
};
```

## Time Decay Attribution

### Implementation

```typescript
class TimeDecayAttribution {
  private halfLife: number = 7; // Days
  
  async calculate(conversionId: string): Promise<Attribution> {
    const touchpoints = await this.getTouchpoints(conversionId);
    const conversionDate = new Date(this.conversion.timestamp);
    
    // Calculate decay factor for each touchpoint
    const decayFactors = touchpoints.map(tp => {
      const touchDate = new Date(tp.timestamp);
      const daysDiff = this.getDaysDifference(touchDate, conversionDate);
      return Math.pow(2, -daysDiff / this.halfLife);
    });
    
    // Normalize to sum to 100
    const totalDecay = decayFactors.reduce((a, b) => a + b, 0);
    const credits = decayFactors.map(factor => (factor / totalDecay) * 100);
    
    return {
      model: 'timeDecay',
      conversion: conversionId,
      attribution: touchpoints.map((tp, index) => ({
        touchpoint: tp,
        credit: credits[index],
        revenue: (credits[index] / 100) * this.conversionValue,
        decayFactor: decayFactors[index],
        daysBeforeConversion: this.getDaysDifference(
          new Date(tp.timestamp), 
          conversionDate
        )
      }))
    };
  }
}

// Example with half-life of 7 days
const timeDecayExample = {
  touchpoints: [
    { channel: 'Display Ad', daysAgo: 30, credit: 6.25 },
    { channel: 'Search Ad', daysAgo: 14, credit: 12.5 },
    { channel: 'Email', daysAgo: 7, credit: 25 },
    { channel: 'Retargeting', daysAgo: 3, credit: 35.7 },
    { channel: 'Direct', daysAgo: 0, credit: 20.55 }
  ]
};
```

### Configuration Options

```typescript
const timeDecayConfig = {
  halfLife: 7, // Days until credit is halved
  minimumCredit: 1, // Minimum credit percentage
  lookbackWindow: 90, // Maximum days to look back
  excludeChannels: ['direct'], // Channels to exclude
  customDecayRates: {
    'email': 14, // Different half-life for email
    'social': 3  // Faster decay for social
  }
};
```

## Position-Based Attribution (U-Shaped)

### Implementation

```typescript
class PositionBasedAttribution {
  private firstTouchCredit = 40;
  private lastTouchCredit = 40;
  private middleTouchCredit = 20;
  
  async calculate(conversionId: string): Promise<Attribution> {
    const touchpoints = await this.getTouchpoints(conversionId);
    
    if (touchpoints.length === 1) {
      // Single touchpoint gets 100%
      return this.singleTouchAttribution(touchpoints[0]);
    }
    
    if (touchpoints.length === 2) {
      // Split 50/50 between first and last
      return this.dualTouchAttribution(touchpoints);
    }
    
    // Standard U-shaped for 3+ touchpoints
    const middleCount = touchpoints.length - 2;
    const creditPerMiddle = this.middleTouchCredit / middleCount;
    
    return {
      model: 'positionBased',
      conversion: conversionId,
      attribution: touchpoints.map((tp, index) => {
        let credit;
        if (index === 0) {
          credit = this.firstTouchCredit;
        } else if (index === touchpoints.length - 1) {
          credit = this.lastTouchCredit;
        } else {
          credit = creditPerMiddle;
        }
        
        return {
          touchpoint: tp,
          credit,
          revenue: (credit / 100) * this.conversionValue,
          position: this.getPosition(index, touchpoints.length)
        };
      })
    };
  }
  
  private getPosition(index: number, total: number): string {
    if (index === 0) return 'first';
    if (index === total - 1) return 'last';
    return 'middle';
  }
}
```

### W-Shaped Variant

```typescript
class WShapedAttribution extends PositionBasedAttribution {
  // Includes opportunity creation as key milestone
  private firstTouchCredit = 30;
  private leadCreationCredit = 30;
  private opportunityCredit = 30;
  private lastTouchCredit = 10;
  
  async calculate(conversionId: string): Promise<Attribution> {
    const touchpoints = await this.getTouchpoints(conversionId);
    const milestones = await this.identifyMilestones(touchpoints);
    
    // Distribute credit based on milestone positions
    return this.distributeMilestoneCredit(touchpoints, milestones);
  }
}
```

## Data-Driven Attribution (DDA)

### Machine Learning Implementation

```typescript
class DataDrivenAttribution {
  private model: AttributionModel;
  
  constructor() {
    this.model = new ShapleyValueModel({
      features: [
        'channel',
        'campaign',
        'dayOfWeek',
        'timeOfDay',
        'deviceType',
        'previousTouches',
        'timeSinceLastTouch'
      ],
      target: 'conversion',
      minSamplesForTraining: 10000
    });
  }
  
  async train(historicalData: Journey[]) {
    // Prepare training data
    const features = this.extractFeatures(historicalData);
    const labels = this.extractLabels(historicalData);
    
    // Train the model
    await this.model.fit(features, labels);
    
    // Validate model performance
    const validation = await this.validateModel();
    
    return {
      modelAccuracy: validation.accuracy,
      featureImportance: validation.featureImportance,
      crossValidationScore: validation.cvScore
    };
  }
  
  async calculate(conversionId: string): Promise<Attribution> {
    const touchpoints = await this.getTouchpoints(conversionId);
    
    // Calculate Shapley values for each touchpoint
    const shapleyValues = await this.calculateShapleyValues(touchpoints);
    
    // Normalize to percentage
    const totalValue = shapleyValues.reduce((a, b) => a + b, 0);
    const credits = shapleyValues.map(v => (v / totalValue) * 100);
    
    return {
      model: 'dataDriver',
      conversion: conversionId,
      attribution: touchpoints.map((tp, index) => ({
        touchpoint: tp,
        credit: credits[index],
        revenue: (credits[index] / 100) * this.conversionValue,
        shapleyValue: shapleyValues[index],
        confidence: this.calculateConfidence(tp, touchpoints)
      })),
      modelMetrics: {
        accuracy: this.model.accuracy,
        dataPoints: this.model.trainingSize,
        lastUpdated: this.model.lastTrainingDate
      }
    };
  }
  
  private async calculateShapleyValues(touchpoints: Touchpoint[]) {
    // Shapley value calculation
    const values = [];
    
    for (let i = 0; i < touchpoints.length; i++) {
      let marginalContribution = 0;
      
      // Calculate contribution of touchpoint i
      const subsets = this.generateSubsets(touchpoints, i);
      
      for (const subset of subsets) {
        const withContribution = await this.predictConversion([...subset, touchpoints[i]]);
        const withoutContribution = await this.predictConversion(subset);
        
        marginalContribution += withContribution - withoutContribution;
      }
      
      values.push(marginalContribution / subsets.length);
    }
    
    return values;
  }
}
```

### Incrementality Testing

```typescript
class IncrementalityTest {
  async runHoldoutTest(config: {
    testChannel: string;
    holdoutPercentage: number;
    duration: number; // days
  }) {
    // Create control and test groups
    const users = await this.getEligibleUsers();
    const { control, test } = this.randomlySplitUsers(users, config.holdoutPercentage);
    
    // Run test
    await this.excludeChannelForUsers(control, config.testChannel);
    await this.waitForDuration(config.duration);
    
    // Analyze results
    const results = {
      control: await this.measureConversions(control),
      test: await this.measureConversions(test)
    };
    
    // Calculate incrementality
    const incrementality = {
      lift: ((results.test.rate - results.control.rate) / results.control.rate) * 100,
      incrementalConversions: results.test.conversions - results.control.conversions,
      confidence: this.calculateStatisticalSignificance(results),
      recommendation: this.generateRecommendation(results)
    };
    
    return incrementality;
  }
}
```

## Multi-Channel Attribution Challenges

### Cross-Device Tracking

```typescript
class CrossDeviceAttribution {
  async linkUserJourneys(userId: string) {
    // Deterministic matching
    const deterministicMatches = await this.matchByLogin(userId);
    
    // Probabilistic matching
    const probabilisticMatches = await this.matchByBehavior({
      ipAddress: true,
      userAgent: true,
      behavioralPatterns: true,
      temporalProximity: true
    });
    
    // Identity graph
    const identityGraph = await this.buildIdentityGraph(
      deterministicMatches,
      probabilisticMatches
    );
    
    // Unified journey
    return this.createUnifiedJourney(identityGraph);
  }
}
```

### Offline Attribution

```typescript
class OfflineAttribution {
  async trackOfflineConversions(config: {
    uploadMethod: 'manual' | 'api' | 'sftp';
    matchingFields: string[];
    conversionWindow: number;
  }) {
    // Upload offline conversions
    const offlineData = await this.getOfflineConversions();
    
    // Match to online users
    const matches = await this.matchOfflineToOnline(offlineData, {
      fields: config.matchingFields,
      fuzzyMatch: true,
      confidence: 0.85
    });
    
    // Attribute to touchpoints
    const attributedConversions = [];
    
    for (const match of matches) {
      const onlineJourney = await this.getOnlineJourney(match.onlineUserId);
      const attribution = await this.attributeOfflineConversion(
        match.conversion,
        onlineJourney
      );
      
      attributedConversions.push(attribution);
    }
    
    return {
      totalOfflineConversions: offlineData.length,
      matchedConversions: matches.length,
      matchRate: (matches.length / offlineData.length) * 100,
      attributions: attributedConversions
    };
  }
}
```

## Attribution Reports

### Channel Performance Report

```typescript
const channelPerformance = await attribution.getChannelReport({
  dateRange: { start: '2024-01-01', end: '2024-12-31' },
  model: 'dataDriver',
  metrics: ['conversions', 'revenue', 'ROAS']
});

// Example output
{
  channels: [
    {
      name: 'Paid Search',
      conversions: 450,
      revenue: 675000,
      spend: 125000,
      ROAS: 5.4,
      attribution: {
        firstTouch: 125,
        lastTouch: 189,
        multiTouch: 167,
        dataDriver: 174
      }
    },
    {
      name: 'Email',
      conversions: 320,
      revenue: 480000,
      spend: 25000,
      ROAS: 19.2,
      attribution: {
        firstTouch: 45,
        lastTouch: 198,
        multiTouch: 142,
        dataDriver: 156
      }
    }
  ],
  summary: {
    totalConversions: 1250,
    totalRevenue: 1875000,
    totalSpend: 325000,
    blendedROAS: 5.77
  }
}
```

### Path Analysis Report

```typescript
const pathAnalysis = await attribution.getPathAnalysis({
  dateRange: { start: '2024-01-01', end: '2024-12-31' },
  minPathLength: 2,
  maxPathLength: 10,
  topPaths: 20
});

// Example output
{
  topPaths: [
    {
      path: ['Paid Search', 'Email', 'Direct'],
      conversions: 145,
      revenue: 217500,
      avgTimeToConversion: 12.5, // days
      avgTouchpoints: 3
    },
    {
      path: ['Social', 'Blog', 'Email', 'Demo'],
      conversions: 89,
      revenue: 178000,
      avgTimeToConversion: 28.3,
      avgTouchpoints: 4
    }
  ],
  pathMetrics: {
    avgPathLength: 3.7,
    mostCommonFirst: 'Paid Search',
    mostCommonLast: 'Email',
    conversionRate: {
      shortPaths: 12.5, // 2-3 touches
      mediumPaths: 8.3, // 4-6 touches
      longPaths: 4.2    // 7+ touches
    }
  }
}
```

## Best Practices

### Model Selection Guide

```typescript
const modelSelector = {
  selectModel: (businessType: string, salesCycle: number, dataVolume: number) => {
    if (dataVolume < 1000) {
      return 'lastTouch'; // Not enough data for complex models
    }
    
    if (salesCycle < 7) {
      return 'lastTouch'; // Short cycle, direct response
    } else if (salesCycle < 30) {
      return 'timeDecay'; // Medium cycle
    } else if (salesCycle < 90) {
      return 'positionBased'; // Long cycle
    } else {
      return 'dataDriver'; // Very long cycle, need ML
    }
  },
  
  minimumDataRequirements: {
    lastTouch: 100,
    firstTouch: 100,
    linear: 500,
    timeDecay: 1000,
    positionBased: 1000,
    dataDriver: 10000
  }
};
```

### Implementation Checklist

1. **Data Collection**
   - [ ] UTM parameter tracking
   - [ ] Cross-domain tracking
   - [ ] Offline conversion tracking
   - [ ] CRM integration

2. **Model Configuration**
   - [ ] Select appropriate model
   - [ ] Set lookback window
   - [ ] Configure conversion types
   - [ ] Define business rules

3. **Validation**
   - [ ] Compare models
   - [ ] Run incrementality tests
   - [ ] Validate with finance data
   - [ ] Check for data anomalies

4. **Optimization**
   - [ ] Regular model retraining
   - [ ] A/B test attribution models
   - [ ] Monitor model drift
   - [ ] Update based on business changes

## Support

For attribution modeling support:
- Documentation: https://docs.marketingengine.io/attribution
- Support: attribution@marketingengine.io
- Training: https://learn.marketingengine.io/attribution