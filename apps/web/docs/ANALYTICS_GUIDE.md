# Analytics & Conversion Tracking Guide

## Overview

This platform implements comprehensive Google Analytics 4 (GA4) tracking with conversion monitoring to optimize user acquisition and engagement.

## Setup

### 1. Google Analytics 4 Configuration

1. Create a GA4 property at [analytics.google.com](https://analytics.google.com)
2. Get your Measurement ID (format: G-XXXXXXXXXX)
3. Add to `.env.local`:
   ```
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```

### 2. Conversion Goals Setup

In GA4, configure these conversion events:

- `partner_application_submit` - When partner form is submitted
- `partner_signup_complete` - When partner successfully signs up
- `login_success` - Successful user login
- `referral_signup_complete` - Successful referral registration
- `revenue_calculator_interest` - User engages with revenue calculator

## Tracking Implementation

### Page Views

Automatically tracked on route changes with enhanced measurement.

### Events Tracked

#### User Journey Events

- **Search**: Query terms, filters, result clicks
- **Form Interactions**: Field focus, abandonment, completion
- **CTA Clicks**: Button name, location, context
- **Engagement**: Scroll depth, time on page, bounce rate

#### E-commerce Events

- **view_item**: Warehouse listing views
- **add_to_cart**: Adding to comparison
- **begin_checkout**: Starting inquiry process
- **purchase**: Completing booking/inquiry

### Custom Dimensions

1. **User Type**: visitor, customer, partner, admin
2. **Warehouse Category**: storage, distribution, manufacturing
3. **Location**: City/region of interest
4. **Signup Method**: direct, referral, social

## Usage Examples

### Track Custom Events

```typescript
import { logEvent } from '@/lib/analytics';

// Track a custom action
logEvent('Video', 'play', 'warehouse_tour', 30); // 30 second video
```

### Track Conversions

```typescript
import { trackConversion } from '@/lib/analytics';

// Track high-value conversion
trackConversion('warehouse_booking', {
  value: 5000,
  warehouse_id: 'WH123',
  duration_months: 6,
});
```

### Form Tracking

```typescript
const { formTracking } = useAnalytics();

// Start tracking
formTracking.start('contact_form');

// Field interaction
formTracking.field('contact_form', 'email');

// Submission
formTracking.submit('contact_form');
```

### CTA Performance

```typescript
const { trackCTA } = useAnalytics()

<Button onClick={trackCTA('download_guide', 'footer')}>
  Download Guide
</Button>
```

## Conversion Optimization Tips

### 1. A/B Testing

```typescript
import { trackExperiment } from '@/lib/analytics';

// Track variant exposure
trackExperiment('hero_cta_test', variantA ? 'control' : 'variant_b');
```

### 2. Enhanced E-commerce

- Track product impressions in search results
- Monitor cart abandonment points
- Analyze checkout funnel drop-offs

### 3. User Segmentation

```typescript
import { setUserProperties } from '@/lib/analytics';

// Segment users
setUserProperties({
  account_type: 'premium',
  industry: 'logistics',
  company_size: 'enterprise',
});
```

## Performance Monitoring

### Core Web Vitals

```typescript
import { trackTiming } from '@/lib/analytics';

// Track page load performance
trackTiming('page_load', 'warehouse_search', 1234); // milliseconds
```

### Error Tracking

```typescript
import { trackException } from '@/lib/analytics';

try {
  // Your code
} catch (error) {
  trackException(error.message, false); // non-fatal
}
```

## Reports & Dashboards

### Key Reports in GA4:

1. **Acquisition**: Traffic sources, campaign performance
2. **Engagement**: Pages, events, conversions
3. **Monetization**: Revenue, conversion value
4. **Retention**: User return rate, lifetime value

### Custom Reports:

- Partner acquisition funnel
- Search to booking conversion
- Form abandonment analysis
- CTA effectiveness comparison

## Privacy & Compliance

### GDPR Compliance

- IP anonymization available
- Cookie consent implementation
- Data retention controls
- User data deletion requests

### Cookie Settings

```javascript
gtag('config', 'GA_MEASUREMENT_ID', {
  cookie_expires: 63072000, // 2 years
  cookie_prefix: 'wn_',
  cookie_domain: 'auto',
  cookie_flags: 'SameSite=None;Secure',
});
```

## Debugging

### Enable Debug Mode

Set in development:

```
NODE_ENV=development
```

### GA4 DebugView

1. Install GA Debugger Chrome extension
2. View real-time events in GA4 > DebugView

### Console Logging

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('Analytics Event:', { category, action, label, value });
}
```

## Best Practices

1. **Meaningful Event Names**: Use descriptive, consistent naming
2. **Value Tracking**: Assign monetary values to key conversions
3. **User Properties**: Set persistent user attributes for segmentation
4. **Custom Dimensions**: Track business-specific metrics
5. **Regular Audits**: Review tracking implementation monthly

## Integration Checklist

- [ ] GA4 property created and configured
- [ ] Measurement ID added to environment
- [ ] Conversion goals defined in GA4
- [ ] Enhanced e-commerce enabled
- [ ] Custom dimensions configured
- [ ] Google Ads linked (if applicable)
- [ ] Privacy policy updated
- [ ] Cookie banner implemented
- [ ] Debug mode tested
- [ ] Initial data flowing to GA4
