/**
 * Transform analytics events to GA4 format
 */

import { AnalyticsEvent, ConversionEvent, EventContext } from '../core/types';
import { GA4Event } from './client';
import crypto from 'crypto';

export class GA4EventTransformer {
  /**
   * Transform generic event to GA4 format
   */
  transformEvent(event: AnalyticsEvent): GA4Event {
    const ga4Event: GA4Event = {
      client_id: event.anonymousId,
      user_id: event.userId,
      timestamp_micros: (event.timestamp.getTime() * 1000).toString(),
      events: [{
        name: this.normalizeEventName(event.eventName),
        params: {
          ...this.extractContextParams(event.context),
          ...this.normalizeProperties(event.properties),
          engagement_time_msec: 100,
          session_id: this.generateSessionId(event.anonymousId)
        }
      }]
    };

    // Add non-personalized ads flag if no user ID
    if (!event.userId) {
      ga4Event.non_personalized_ads = true;
    }

    return ga4Event;
  }

  /**
   * Transform conversion event with e-commerce data
   */
  transformConversion(event: ConversionEvent): GA4Event {
    const items = event.items?.map(item => ({
      item_id: item.itemId,
      item_name: item.itemName,
      item_category: item.category,
      quantity: item.quantity,
      price: item.price,
      currency: item.currency
    }));

    const ga4Event: GA4Event = {
      client_id: event.anonymousId,
      user_id: event.userId,
      timestamp_micros: (event.timestamp.getTime() * 1000).toString(),
      events: [{
        name: 'purchase',
        params: {
          ...this.extractContextParams(event.context),
          ...this.normalizeProperties(event.properties),
          transaction_id: event.transactionId || event.eventId,
          value: event.conversionValue,
          currency: event.currency,
          items: items,
          engagement_time_msec: 100,
          session_id: this.generateSessionId(event.anonymousId)
        }
      }]
    };

    if (!event.userId) {
      ga4Event.non_personalized_ads = true;
    }

    return ga4Event;
  }

  /**
   * Normalize event name to GA4 conventions
   */
  private normalizeEventName(eventName: string): string {
    // GA4 event names must be alphanumeric with underscores
    // Maximum 40 characters
    return eventName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 40);
  }

  /**
   * Normalize properties for GA4
   */
  private normalizeProperties(properties: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Parameter names must be 40 characters or fewer
      const normalizedKey = key
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .substring(0, 40);

      // GA4 has specific value type requirements
      if (value === null || value === undefined) {
        continue;
      } else if (typeof value === 'boolean') {
        normalized[normalizedKey] = value ? 1 : 0;
      } else if (typeof value === 'string') {
        // String values limited to 100 characters
        normalized[normalizedKey] = value.substring(0, 100);
      } else if (typeof value === 'number') {
        normalized[normalizedKey] = value;
      } else if (Array.isArray(value)) {
        // Arrays not directly supported, convert to string
        normalized[normalizedKey] = value.join(',').substring(0, 100);
      } else if (typeof value === 'object') {
        // Objects not directly supported, stringify
        try {
          normalized[normalizedKey] = JSON.stringify(value).substring(0, 100);
        } catch {
          // Skip if can't stringify
        }
      }
    }

    return normalized;
  }

  /**
   * Extract GA4 parameters from event context
   */
  private extractContextParams(context: EventContext): Record<string, any> {
    const params: Record<string, any> = {};

    // Page context
    if (context.page) {
      params.page_location = context.page.url;
      params.page_title = context.page.title;
      params.page_referrer = context.page.referrer;
      
      // Extract page path
      try {
        const url = new URL(context.page.url);
        params.page_path = url.pathname;
        params.page_hostname = url.hostname;
      } catch {
        // Invalid URL
      }
    }

    // Campaign parameters
    if (context.campaign) {
      params.campaign_source = context.campaign.utmSource || context.campaign.source;
      params.campaign_medium = context.campaign.utmMedium || context.campaign.medium;
      params.campaign_name = context.campaign.utmCampaign || context.campaign.name;
      params.campaign_term = context.campaign.utmTerm || context.campaign.term;
      params.campaign_content = context.campaign.utmContent || context.campaign.content;
    }

    // Device context
    if (context.device) {
      params.device_category = context.device.type;
      if (context.device.browser) {
        params.browser = context.device.browser.name;
        params.browser_version = context.device.browser.version;
      }
      if (context.device.os) {
        params.operating_system = context.device.os.name;
        params.operating_system_version = context.device.os.version;
      }
      if (context.device.screen) {
        params.screen_resolution = `${context.device.screen.width}x${context.device.screen.height}`;
      }
    }

    // User context
    params.language = context.locale?.split('-')[0] || 'en';
    params.country = context.locale?.split('-')[1] || 'US';

    return params;
  }

  /**
   * Generate consistent session ID for user
   */
  private generateSessionId(anonymousId: string): string {
    // Create a session ID that changes every 30 minutes
    const thirtyMinutes = 30 * 60 * 1000;
    const sessionWindow = Math.floor(Date.now() / thirtyMinutes);
    const hash = crypto
      .createHash('md5')
      .update(`${anonymousId}-${sessionWindow}`)
      .digest('hex');
    
    // Return numeric session ID (GA4 requirement)
    return parseInt(hash.substring(0, 8), 16).toString();
  }
}