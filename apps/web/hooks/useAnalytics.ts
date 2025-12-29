import { useRouter } from 'next/router';
import { useEffect, useCallback } from 'react';

import {
  logPageView,
  logEvent,
  trackConversion,
  trackForm,
  trackEngagement,
  trackSearch,
} from '@/lib/analytics';

export const useAnalytics = () => {
  const router = useRouter();

  // Track page views on route change
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      logPageView(url);
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  // Track scroll depth
  useEffect(() => {
    let maxScroll = 0;
    const trackScroll = () => {
      const scrollPercentage = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      );

      // Track in 25% increments
      if (scrollPercentage > maxScroll && scrollPercentage % 25 === 0) {
        maxScroll = scrollPercentage;
        trackEngagement.scrollDepth(scrollPercentage);
      }
    };

    const throttledScroll = throttle(trackScroll, 1000);
    window.addEventListener('scroll', throttledScroll);

    return () => window.removeEventListener('scroll', throttledScroll);
  }, []);

  // Track time on page
  useEffect(() => {
    const startTime = Date.now();

    const trackTime = () => {
      const timeOnPage = Math.round((Date.now() - startTime) / 1000);
      trackEngagement.timeOnPage(timeOnPage, router.pathname);
    };

    // Track when leaving page
    window.addEventListener('beforeunload', trackTime);

    // Also track every 30 seconds
    const interval = setInterval(() => {
      trackTime();
    }, 30000);

    return () => {
      window.removeEventListener('beforeunload', trackTime);
      clearInterval(interval);
    };
  }, [router.pathname]);

  // CTA tracking wrapper
  const trackCTA = useCallback((ctaName: string, location: string) => {
    return () => {
      trackEngagement.ctaClick(ctaName, location);
    };
  }, []);

  // Form tracking helpers
  const formTracking = {
    start: (formName: string) => trackForm.start(formName),
    field: (formName: string, fieldName: string) => logEvent('Form', 'field_interaction', `${formName} - ${fieldName}`),
    submit: (formName: string) => trackForm.complete(formName),
    abandon: (formName: string, lastField?: string) => trackForm.abandon(formName, lastField),
    error: (formName: string, errorField: string) => trackForm.error(formName, errorField),
  };

  // Search tracking helpers
  const searchTracking = {
    query: (term: string, results: number) => trackSearch(term, results),
    filter: (type: string, value: string) => logEvent('Search', 'filter', `${type}: ${value}`),
    clickResult: (id: string, position: number) => logEvent('Search', 'result_click', id, position),
  };

  return {
    trackCTA,
    formTracking,
    searchTracking,
    trackConversion,
    logEvent,
  };
};

// Utility function for throttling
function throttle(func: Function, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  let lastCall = 0;

  return function (...args: unknown[]) {
    const now = Date.now();

    if (now - lastCall >= wait) {
      func(...args);
      lastCall = now;
    } else {
      if (timeout) {clearTimeout(timeout);}
      timeout = setTimeout(
        () => {
          func(...args);
          lastCall = Date.now();
        },
        wait - (now - lastCall)
      );
    }
  };
}
