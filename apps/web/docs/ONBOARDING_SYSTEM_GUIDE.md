# SkidSpace Onboarding System - Complete Guide

## Overview

The SkidSpace onboarding system provides a comprehensive, role-based user onboarding experience with progressive disclosure, interactive guidance, and intelligent flow management. It's designed to quickly get users productive on the platform while providing flexibility for different user types.

## System Architecture

### Core Components

1. **OnboardingProvider** - Context provider managing onboarding state
2. **OnboardingModal** - Main modal for guided onboarding flows
3. **OnboardingTrigger** - Auto-triggers onboarding for new users
4. **ProgressTracker** - Visual progress tracking component
5. **InteractiveTooltips** - Feature discovery and guided tours
6. **EmailTemplates** - Automated email notifications

### User Flows

#### Customer Onboarding Flow
1. **Welcome Step** - Platform introduction and benefits
2. **Profile Setup** - Business information and requirements
3. **Preferences** - Location, notification, and search preferences
4. **First Search** - Guided warehouse space discovery
5. **Payment Setup** - Payment method configuration (optional)

#### Operator Onboarding Flow
1. **Welcome Step** - Revenue opportunity introduction
2. **Business Verification** - Legal entity and insurance verification
3. **Warehouse Setup** - Property listing and capacity configuration
4. **Pricing Setup** - Rate setting and pricing strategy
5. **Team Setup** - Staff invitation and role assignment (optional)
6. **Payout Setup** - Stripe integration for payments

#### Admin Onboarding Flow
1. **Welcome Step** - Platform administration overview
2. **Platform Overview** - System architecture understanding
3. **User Management** - User and operator management training
4. **Monitoring Setup** - Alert and monitoring configuration (optional)

## Implementation Guide

### 1. Setup Provider

Wrap your app with the OnboardingProvider:

```tsx
import { OnboardingProvider, OnboardingTrigger } from '@/components/onboarding';

function App() {
  return (
    <OnboardingProvider>
      <OnboardingTrigger>
        {/* Your app content */}
      </OnboardingTrigger>
    </OnboardingProvider>
  );
}
```

### 2. Auto-trigger for New Users

The system automatically starts onboarding for:
- Users created within the last 24 hours
- Users with incomplete onboarding flows
- Users with specific role requirements

### 3. Manual Trigger

Trigger onboarding manually:

```tsx
import { useOnboarding } from '@/components/onboarding';

function MyComponent() {
  const { startOnboarding } = useOnboarding();
  
  return (
    <button onClick={() => startOnboarding('customer')}>
      Start Customer Onboarding
    </button>
  );
}
```

### 4. Progress Tracking

Display onboarding progress anywhere:

```tsx
import { ProgressTracker } from '@/components/onboarding';

function Dashboard() {
  return (
    <div>
      <ProgressTracker compact={true} showResume={true} />
    </div>
  );
}
```

### 5. Interactive Tooltips

Add feature discovery tours:

```tsx
import { InteractiveTooltips, useTooltipTour } from '@/components/onboarding';

function Dashboard() {
  const { startTour } = useTooltipTour();
  
  return (
    <div>
      <button 
        data-tour="search-warehouses"
        onClick={() => startTour('customer-onboarding')}
      >
        Search Warehouses
      </button>
      <InteractiveTooltips />
    </div>
  );
}
```

## API Integration

### Required API Endpoints

1. **GET/POST /api/user/onboarding-state** - Save/load user onboarding progress
2. **POST /api/user/profile** - Update user profile during onboarding
3. **POST /api/user/preferences** - Save user preferences
4. **POST /api/user/payment-setup** - Configure payment methods
5. **GET /api/admin/users** - Admin user management
6. **GET /api/admin/onboarding-stats** - Onboarding analytics

### Database Schema Requirements

Add these tables to support onboarding:

```sql
-- User onboarding state
CREATE TABLE "UserOnboardingState" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "onboardingData" JSONB NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- User profile data
CREATE TABLE "UserProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "profile_data" JSONB NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- User preferences
CREATE TABLE "UserPreferences" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "preferences" JSONB NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
```

## Customization

### Creating Custom Steps

1. Create a new step component:

```tsx
import React from 'react';

interface CustomStepProps {
  onComplete: () => void;
  onSkip?: () => void;
  isRequired: boolean;
  flowId: string;
  stepId: string;
}

export const CustomStep: React.FC<CustomStepProps> = ({
  onComplete,
  onSkip,
  isRequired
}) => {
  return (
    <div>
      {/* Your custom step content */}
      <button onClick={onComplete}>Complete</button>
    </div>
  );
};
```

2. Add to the OnboardingProvider flows:

```tsx
// Update ONBOARDING_FLOWS in OnboardingProvider.tsx
{
  id: 'custom-step',
  title: 'Custom Step',
  description: 'A custom onboarding step',
  component: 'CustomStep', // Must match component name
  isComplete: false,
  isRequired: true,
  order: 6
}
```

3. Register in OnboardingModal component map:

```tsx
// Add to STEP_COMPONENTS in OnboardingModal.tsx
const STEP_COMPONENTS = {
  // ... existing components
  CustomStep
};
```

### Custom Email Templates

Create custom email templates:

```tsx
import { EmailService } from '@/components/onboarding';

const CustomEmailTemplate = {
  subject: 'Custom Email Subject',
  html: `<html>...</html>`,
  text: `Text version...`
};

// Send custom email
await EmailService.sendEmail({
  to: 'user@example.com',
  subject: CustomEmailTemplate.subject,
  html: EmailService.replaceVariables(CustomEmailTemplate.html, variables),
  text: EmailService.replaceVariables(CustomEmailTemplate.text, variables)
});
```

### Custom Tours

Define custom tooltip tours:

```tsx
const customTour = {
  id: 'my-custom-tour',
  name: 'Custom Feature Tour',
  description: 'Learn about custom features',
  category: 'feature-discovery',
  steps: [
    {
      id: 'step1',
      target: '[data-tour="custom-element"]',
      title: 'Custom Element',
      description: 'This is a custom element',
      placement: 'bottom'
    }
  ]
};
```

## Analytics & Tracking

The system automatically tracks:
- Onboarding flow starts and completions
- Step completion rates and timing
- Drop-off points and user behavior
- Email engagement metrics

### Google Analytics Events

```javascript
// Automatically tracked events:
'onboarding_flow_started'
'onboarding_step_completed'
'onboarding_step_skipped'
'onboarding_flow_completed'
'tooltip_tour_started'
'tooltip_step_completed'
'tooltip_tour_completed'
```

### Custom Analytics

Add custom tracking:

```tsx
// Track custom events
if (typeof window !== 'undefined' && window.gtag) {
  window.gtag('event', 'custom_onboarding_event', {
    flow_id: 'customer',
    custom_property: 'value'
  });
}
```

## Admin Tools

### User Management Dashboard

Access the admin dashboard at `/admin/users` to:
- View all user onboarding progress
- Manually trigger onboarding flows
- Reset user onboarding state
- View completion statistics
- Identify drop-off points

### Onboarding Analytics

Track key metrics:
- Overall completion rates
- Time to completion
- Step-by-step conversion
- User segmentation analysis
- A/B testing results

## Best Practices

### UX Guidelines

1. **Progressive Disclosure** - Show only relevant information for current step
2. **Clear Progress Indicators** - Always show completion percentage
3. **Easy Exit/Resume** - Allow users to pause and resume later
4. **Mobile Responsive** - Ensure all components work on mobile
5. **Accessibility** - Support keyboard navigation and screen readers

### Technical Guidelines

1. **Performance** - Lazy load step components
2. **Error Handling** - Graceful degradation for API failures
3. **State Management** - Persist state across sessions
4. **Testing** - Unit tests for all step components
5. **Security** - Validate all user input server-side

### Content Guidelines

1. **Clear Language** - Use simple, jargon-free explanations
2. **Value-Focused** - Emphasize benefits at each step
3. **Action-Oriented** - Use active voice and clear CTAs
4. **Helpful Context** - Provide examples and help text
5. **Consistent Tone** - Maintain friendly, professional voice

## Troubleshooting

### Common Issues

1. **Onboarding Not Starting**
   - Check user role mapping
   - Verify localStorage isn't blocked
   - Ensure API endpoints are responding

2. **Step Components Not Loading**
   - Verify component is registered in STEP_COMPONENTS
   - Check for TypeScript errors
   - Ensure proper imports

3. **State Not Persisting**
   - Check localStorage permissions
   - Verify API endpoints for saving state
   - Check network connectivity

4. **Tooltips Not Positioning**
   - Ensure target elements have data-tour attributes
   - Check for CSS conflicts
   - Verify element visibility

### Debug Mode

Enable debug logging:

```tsx
// Set in development environment
localStorage.setItem('onboarding-debug', 'true');
```

## Performance Considerations

1. **Lazy Loading** - Step components load on demand
2. **Chunked Uploads** - Large forms split into smaller requests
3. **Optimistic Updates** - UI updates before API confirmation
4. **Caching** - LocalStorage for quick resume
5. **Compression** - Gzip API responses

## Security Notes

1. **Input Validation** - All user input validated server-side
2. **CSRF Protection** - API endpoints protected with CSRF tokens
3. **Rate Limiting** - Onboarding API calls are rate limited
4. **Data Encryption** - Sensitive data encrypted in transit and at rest
5. **Access Control** - Proper authorization checks on all endpoints

## Migration Guide

### From Legacy Onboarding

1. **Export Existing Data** - Backup current user progress
2. **Install New System** - Follow implementation guide
3. **Migrate Data** - Convert to new format
4. **Test Thoroughly** - Verify all flows work correctly
5. **Deploy Gradually** - Use feature flags for rollout

### Version Updates

1. **Check Breaking Changes** - Review changelog
2. **Update Dependencies** - npm update
3. **Test Components** - Verify custom steps still work
4. **Update Database** - Run migration scripts
5. **Monitor Rollout** - Watch for errors after deployment

## Support

For issues or questions:
- Check GitHub issues: https://github.com/skidspace/onboarding
- Documentation: https://docs.skidspace.com/onboarding
- Email: dev-support@skidspace.com

## License

This onboarding system is proprietary to SkidSpace. All rights reserved.