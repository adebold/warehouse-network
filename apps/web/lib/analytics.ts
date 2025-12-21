import type { User } from '@warehouse/types';
import ReactGA from 'react-ga4';

// Initialize Google Analytics
export const initGA = (measurementId: string) => {
  ReactGA.initialize(measurementId);
};

// Log page views
export const logPageView = (url?: string) => {
  ReactGA.send({ hitType: 'pageview', page: url || window.location.pathname });
};

// Log custom events
export const logEvent = (category: string, action: string, label?: string, value?: number) => {
  ReactGA.event({
    category,
    action,
    label,
    value,
  });
};

// Track conversions
export const trackConversion = (conversionId: string, value?: number, currency?: string) => {
  logEvent('Conversion', conversionId, undefined, value);

  // Send to Google Ads if gtag is available
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', 'conversion', {
      send_to: conversionId,
      value: value,
      currency: currency || 'USD',
    });
  }
};

// Track user properties
export const setUserProperties = (properties: Record<string, any>) => {
  ReactGA.set(properties);
};

// Track exceptions
export const trackException = (description: string, fatal: boolean = false) => {
  ReactGA.event({
    category: 'Exception',
    action: description,
    label: fatal ? 'Fatal' : 'Non-Fatal',
  });
};

// E-commerce tracking
export const trackEcommerce = {
  // Track product view
  viewItem: (item: any) => {
    ReactGA.event({
      category: 'ecommerce',
      action: 'view_item',
      label: item.name,
      value: item.price,
    });
  },

  // Track add to cart
  addToCart: (item: any, quantity: number = 1) => {
    ReactGA.event({
      category: 'ecommerce',
      action: 'add_to_cart',
      label: item.name,
      value: item.price * quantity,
    });
  },

  // Track purchase
  purchase: (transactionId: string, items: unknown[], totalValue: number) => {
    ReactGA.event({
      category: 'ecommerce',
      action: 'purchase',
      label: transactionId,
      value: totalValue,
    });
  },
};

// Search tracking
export const trackSearch = (searchTerm: string, resultsCount: number) => {
  ReactGA.event({
    category: 'search',
    action: 'search',
    label: searchTerm,
    value: resultsCount,
  });
};

// Social interactions tracking
export const trackSocial = (network: string, action: string, target?: string) => {
  ReactGA.event({
    category: 'social',
    action: action,
    label: `${network}${target ? ` - ${target}` : ''}`,
  });
};

// Timing tracking
export const trackTiming = (category: string, variable: string, value: number, label?: string) => {
  ReactGA.event({
    category: `timing_${category}`,
    action: variable,
    label: label,
    value: Math.round(value),
  });
};

// Custom dimensions
export const setCustomDimension = (dimensionIndex: number, value: string) => {
  ReactGA.set({ [`dimension${dimensionIndex}`]: value });
};

// User ID tracking
export const setUserId = (userId: string) => {
  ReactGA.set({ userId });
};

// Campaign tracking
export const trackCampaign = (campaign: string, source: string, medium: string) => {
  ReactGA.set({
    campaignName: campaign,
    campaignSource: source,
    campaignMedium: medium,
  });
};

// Form tracking
export const trackForm = {
  start: (formName: string) => {
    logEvent('Form', 'form_start', formName);
  },
  complete: (formName: string) => {
    logEvent('Form', 'form_complete', formName);
  },
  abandon: (formName: string, lastField?: string) => {
    logEvent('Form', 'form_abandon', `${formName}${lastField ? ` - ${lastField}` : ''}`);
  },
  error: (formName: string, errorField: string) => {
    logEvent('Form', 'form_error', `${formName} - ${errorField}`);
  },
};

// Engagement tracking
export const trackEngagement = {
  scrollDepth: (percentage: number) => {
    logEvent('Engagement', 'scroll_depth', `${percentage}%`, percentage);
  },
  timeOnPage: (seconds: number, pageName: string) => {
    trackTiming('Engagement', 'time_on_page', seconds * 1000, pageName);
  },
  interaction: (element: string, action: string = 'click') => {
    logEvent('Engagement', action, element);
  },
  ctaClick: (ctaName: string, location: string) => {
    logEvent('Engagement', 'cta_click', `${ctaName} - ${location}`);
  },
};
