/**
 * Transform analytics events to Mixpanel format
 */

import { AnalyticsEvent, ConversionEvent, EventContext } from '../core/types';
import { MixpanelEvent } from './client';

export class MixpanelEventTransformer {
  /**
   * Transform generic event to Mixpanel format
   */
  transformEvent(event: AnalyticsEvent): MixpanelEvent {
    return {
      event: event.eventName,
      properties: {
        ...this.extractContextProperties(event.context),
        ...event.properties,
        mp_lib: 'node',
        mp_api_endpoint: event.context.ip ? 'track' : 'track-eu'
      }
    };
  }

  /**
   * Transform conversion event to Mixpanel format
   */
  transformConversion(event: ConversionEvent): MixpanelEvent {
    const items = event.items?.map(item => ({
      id: item.itemId,
      name: item.itemName,
      category: item.category,
      quantity: item.quantity,
      price: item.price
    }));

    return {
      event: 'Purchase',
      properties: {
        ...this.extractContextProperties(event.context),
        ...event.properties,
        transaction_id: event.transactionId || event.eventId,
        revenue: event.conversionValue,
        currency: event.currency,
        products: items,
        item_count: items?.length || 0,
        mp_lib: 'node'
      }
    };
  }

  /**
   * Extract Mixpanel properties from context
   */
  private extractContextProperties(context: EventContext): Record<string, any> {
    const properties: Record<string, any> = {};

    // User properties
    properties.$ip = context.ip;
    properties.$user_agent = context.userAgent;
    properties.$locale = context.locale;
    properties.$timezone = context.timezone;

    // Page properties
    if (context.page) {
      properties.$current_url = context.page.url;
      properties.$pathname = context.page.path;
      properties.$page_title = context.page.title;
      properties.$referrer = context.page.referrer;
      properties.$search = context.page.search;

      // Parse URL for additional properties
      try {
        const url = new URL(context.page.url);
        properties.$host = url.hostname;
        properties.$search_engine = this.detectSearchEngine(url);
      } catch {
        // Invalid URL
      }
    }

    // Device properties
    if (context.device) {
      properties.$device_type = context.device.type;
      properties.$manufacturer = context.device.manufacturer;
      properties.$model = context.device.model;
      
      if (context.device.os) {
        properties.$os = context.device.os.name;
        properties.$os_version = context.device.os.version;
      }
      
      if (context.device.browser) {
        properties.$browser = context.device.browser.name;
        properties.$browser_version = context.device.browser.version;
      }
      
      if (context.device.screen) {
        properties.$screen_width = context.device.screen.width;
        properties.$screen_height = context.device.screen.height;
      }
    }

    // Campaign properties
    if (context.campaign) {
      properties.utm_source = context.campaign.utmSource || context.campaign.source;
      properties.utm_medium = context.campaign.utmMedium || context.campaign.medium;
      properties.utm_campaign = context.campaign.utmCampaign || context.campaign.name;
      properties.utm_term = context.campaign.utmTerm || context.campaign.term;
      properties.utm_content = context.campaign.utmContent || context.campaign.content;

      // Mixpanel campaign properties
      properties.$campaign_id = context.campaign.name;
      properties.$source = context.campaign.source;
      properties.$medium = context.campaign.medium;
    }

    // Referrer properties
    if (context.referrer) {
      properties.$referrer = context.referrer.url;
      properties.$referring_domain = context.referrer.domain;
      properties.$referrer_type = context.referrer.type;
      
      // Social network detection
      properties.$social_source = this.detectSocialNetwork(context.referrer.domain);
    }

    return properties;
  }

  /**
   * Detect search engine from referrer
   */
  private detectSearchEngine(url: URL): string | undefined {
    const searchEngines: Record<string, string> = {
      'google.com': 'google',
      'bing.com': 'bing',
      'yahoo.com': 'yahoo',
      'duckduckgo.com': 'duckduckgo',
      'baidu.com': 'baidu',
      'yandex.': 'yandex'
    };

    for (const [domain, engine] of Object.entries(searchEngines)) {
      if (url.hostname.includes(domain)) {
        return engine;
      }
    }

    return undefined;
  }

  /**
   * Detect social network from domain
   */
  private detectSocialNetwork(domain: string): string | undefined {
    const socialNetworks: Record<string, string> = {
      'facebook.com': 'Facebook',
      'fb.com': 'Facebook',
      'instagram.com': 'Instagram',
      'twitter.com': 'Twitter',
      'x.com': 'Twitter',
      'linkedin.com': 'LinkedIn',
      'pinterest.com': 'Pinterest',
      'reddit.com': 'Reddit',
      'tiktok.com': 'TikTok',
      'youtube.com': 'YouTube'
    };

    for (const [networkDomain, network] of Object.entries(socialNetworks)) {
      if (domain.includes(networkDomain)) {
        return network;
      }
    }

    return undefined;
  }
}