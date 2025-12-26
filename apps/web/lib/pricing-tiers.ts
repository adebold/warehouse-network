/**
 * Pricing Tiers for Warehouse Marketplace
 * Simple, realistic pricing for a startup
 */

export const PRICING_TIERS = {
  FREE: {
    name: 'Free',
    price: 0,
    features: [
      '1 warehouse listing',
      '10 AI searches per month',
      'Basic email support',
      'Standard listing visibility'
    ],
    limits: {
      warehouses: 1,
      aiSearches: 10,
      leads: 20,
      photos: 5
    }
  },
  
  PRO: {
    name: 'Pro',
    price: 49,
    features: [
      'Unlimited warehouse listings',
      '100 AI searches per month',
      'Lead scoring & analytics',
      'Pricing intelligence',
      'Priority support',
      'Featured listings',
      'Advanced search filters'
    ],
    limits: {
      warehouses: -1, // unlimited
      aiSearches: 100,
      leads: -1,
      photos: 20
    }
  },
  
  ENTERPRISE: {
    name: 'Enterprise',
    price: 299,
    features: [
      'Everything in Pro',
      'Unlimited AI searches',
      'Custom AI training',
      'API access',
      'White-glove onboarding',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantees'
    ],
    limits: {
      warehouses: -1,
      aiSearches: -1,
      leads: -1,
      photos: -1
    }
  }
};

export function checkFeatureLimit(
  userTier: keyof typeof PRICING_TIERS,
  feature: keyof typeof PRICING_TIERS.FREE.limits,
  currentUsage: number
): { allowed: boolean; limit: number; remaining: number } {
  const tier = PRICING_TIERS[userTier];
  const limit = tier.limits[feature];
  
  if (limit === -1) {
    return { allowed: true, limit: -1, remaining: -1 };
  }
  
  return {
    allowed: currentUsage < limit,
    limit,
    remaining: Math.max(0, limit - currentUsage)
  };
}

export function getPricingRecommendation(usage: {
  warehouses: number;
  searches: number;
  leads: number;
}): keyof typeof PRICING_TIERS {
  if (usage.warehouses > 1 || usage.searches > 10 || usage.leads > 20) {
    if (usage.searches > 100 || usage.warehouses > 10) {
      return 'ENTERPRISE';
    }
    return 'PRO';
  }
  return 'FREE';
}