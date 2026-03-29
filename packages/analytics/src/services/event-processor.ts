/**
 * Event Processor Service
 * Handles processing and storage of analytics events and user sessions
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'winston';
import { EventEmitter } from 'events';
import { UAParser } from 'ua-parser-js';

import {
  AnalyticsEventData,
  SessionData,
  ConversionEvent,
  Touchpoint
} from '../types';

export class EventProcessor extends EventEmitter {
  private uaParser: UAParser;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {
    super();
    this.uaParser = new UAParser();
  }

  /**
   * Process a single analytics event
   */
  async processEvent(eventData: AnalyticsEventData): Promise<any> {
    try {
      // Enrich event data with device/browser information
      const enrichedData = await this.enrichEventData(eventData);

      // Store event in database
      const storedEvent = await this.prisma.analyticsEvent.create({
        data: {
          tenantId: enrichedData.tenantId,
          userId: enrichedData.userId,
          sessionId: enrichedData.sessionId,
          eventName: enrichedData.eventName,
          eventCategory: enrichedData.eventCategory,
          eventType: enrichedData.eventType,
          pageUrl: enrichedData.pageUrl,
          referrer: enrichedData.referrer,
          userAgent: enrichedData.userAgent,
          ipAddress: enrichedData.ipAddress,
          deviceType: enrichedData.deviceType,
          browser: enrichedData.browser,
          os: enrichedData.os,
          eventProperties: enrichedData.eventProperties || {},
          customProperties: enrichedData.customProperties || {},
          warehouseId: enrichedData.warehouseId,
          bookingId: enrichedData.bookingId,
          createdAt: enrichedData.timestamp || new Date()
        }
      });

      // Update session if applicable
      if (enrichedData.sessionId) {
        await this.updateSessionFromEvent(enrichedData);
      }

      // Process conversion events
      if (this.isConversionEvent(enrichedData)) {
        await this.processConversionEvent(enrichedData);
      }

      // Update real-time counters
      await this.updateRealtimeCounters(enrichedData);

      // Process customer journey touchpoint
      await this.processJourneyTouchpoint(enrichedData);

      this.emit('event_processed', {
        eventId: storedEvent.id,
        eventName: enrichedData.eventName,
        tenantId: enrichedData.tenantId,
        timestamp: storedEvent.createdAt
      });

      return storedEvent;
    } catch (error) {
      this.logger.error('Failed to process event', {
        error: error.message,
        eventData: JSON.stringify(eventData)
      });
      throw error;
    }
  }

  /**
   * Process multiple events in batch
   */
  async processBatch(events: AnalyticsEventData[]): Promise<any[]> {
    const batchSize = 100;
    const results: any[] = [];

    try {
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);

        const batchResults = await Promise.allSettled(
          batch.map(event => this.processEvent(event))
        );

        // Process results and collect successful ones
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            this.logger.error('Failed to process event in batch', {
              error: result.reason,
              eventIndex: i + index,
              event: batch[index]
            });
          }
        });
      }

      this.emit('batch_completed', {
        totalEvents: events.length,
        processedEvents: results.length,
        failedEvents: events.length - results.length
      });

      return results;
    } catch (error) {
      this.logger.error('Batch processing failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process user session data
   */
  async processSession(sessionData: SessionData): Promise<any> {
    try {
      // Upsert session record
      const session = await this.prisma.userSession.upsert({
        where: { sessionId: sessionData.sessionId },
        update: {
          endedAt: sessionData.endedAt,
          exitPage: sessionData.exitPage,
          pageViews: sessionData.pageViews,
          sessionDuration: sessionData.sessionDuration,
          isBounce: sessionData.isBounce,
          conversionEvents: sessionData.conversionEvents || []
        },
        create: {
          sessionId: sessionData.sessionId,
          userId: sessionData.userId,
          tenantId: sessionData.tenantId,
          ipAddress: sessionData.ipAddress,
          userAgent: sessionData.userAgent,
          deviceType: sessionData.deviceType,
          browser: sessionData.browser,
          os: sessionData.os,
          entryPage: sessionData.entryPage,
          exitPage: sessionData.exitPage,
          pageViews: sessionData.pageViews || 0,
          sessionDuration: sessionData.sessionDuration,
          isBounce: sessionData.isBounce || false,
          conversionEvents: sessionData.conversionEvents || [],
          country: sessionData.country,
          region: sessionData.region,
          city: sessionData.city,
          startedAt: sessionData.startedAt,
          endedAt: sessionData.endedAt
        }
      });

      // Update user's last login if session has user
      if (sessionData.userId) {
        await this.prisma.user.update({
          where: { id: sessionData.userId },
          data: {
            lastLogin: sessionData.startedAt,
            loginCount: { increment: sessionData.endedAt ? 1 : 0 }
          }
        });
      }

      this.emit('session_processed', {
        sessionId: sessionData.sessionId,
        userId: sessionData.userId,
        duration: sessionData.sessionDuration
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to process session', {
        error: error.message,
        sessionId: sessionData.sessionId
      });
      throw error;
    }
  }

  /**
   * Start a new session
   */
  async startSession(
    sessionId: string,
    userId?: string,
    tenantId?: string,
    metadata?: any
  ): Promise<SessionData> {
    const sessionData: SessionData = {
      sessionId,
      userId,
      tenantId,
      startedAt: new Date(),
      pageViews: 0,
      isBounce: false,
      conversionEvents: [],
      ...metadata
    };

    await this.processSession(sessionData);

    // Store session in Redis for quick access
    const sessionKey = `session:${sessionId}`;
    await this.redis.setex(sessionKey, 3600, JSON.stringify(sessionData)); // 1 hour TTL

    return sessionData;
  }

  /**
   * Update session with new activity
   */
  async updateSession(
    sessionId: string,
    updates: Partial<SessionData>
  ): Promise<void> {
    try {
      const sessionKey = `session:${sessionId}`;
      const existing = await this.redis.get(sessionKey);

      let sessionData: SessionData;
      if (existing) {
        sessionData = { ...JSON.parse(existing), ...updates };
      } else {
        // Fallback to database
        const dbSession = await this.prisma.userSession.findUnique({
          where: { sessionId }
        });

        if (!dbSession) {
          throw new Error(`Session not found: ${sessionId}`);
        }

        sessionData = {
          sessionId: dbSession.sessionId,
          userId: dbSession.userId || undefined,
          tenantId: dbSession.tenantId || undefined,
          startedAt: dbSession.startedAt,
          ...updates
        };
      }

      // Update Redis
      await this.redis.setex(sessionKey, 3600, JSON.stringify(sessionData));

      // Process updated session
      await this.processSession(sessionData);
    } catch (error) {
      this.logger.error('Failed to update session', {
        error: error.message,
        sessionId,
        updates
      });
      throw error;
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      const sessionKey = `session:${sessionId}`;
      const sessionData = await this.redis.get(sessionKey);

      if (sessionData) {
        const session: SessionData = JSON.parse(sessionData);
        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - session.startedAt.getTime()) / 1000);

        const updatedSession = {
          ...session,
          endedAt: endTime,
          sessionDuration: duration,
          isBounce: session.pageViews <= 1 && duration < 30 // Bounce if <= 1 page view and < 30 seconds
        };

        await this.processSession(updatedSession);
        await this.redis.del(sessionKey);

        this.emit('session_ended', {
          sessionId,
          duration,
          isBounce: updatedSession.isBounce
        });
      }
    } catch (error) {
      this.logger.error('Failed to end session', {
        error: error.message,
        sessionId
      });
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Enrich event data with device and browser information
   */
  private async enrichEventData(eventData: AnalyticsEventData): Promise<AnalyticsEventData> {
    const enriched = { ...eventData };

    // Parse user agent for device/browser info
    if (eventData.userAgent) {
      const uaResult = this.uaParser.setUA(eventData.userAgent).getResult();

      enriched.deviceType = enriched.deviceType || this.getDeviceType(uaResult);
      enriched.browser = enriched.browser || uaResult.browser.name;
      enriched.os = enriched.os || uaResult.os.name;
    }

    // Add timestamp if not provided
    if (!enriched.timestamp) {
      enriched.timestamp = new Date();
    }

    // Determine event type if not specified
    if (!enriched.eventType && enriched.eventName) {
      enriched.eventType = this.inferEventType(enriched.eventName);
    }

    return enriched;
  }

  /**
   * Update session information based on event
   */
  private async updateSessionFromEvent(eventData: AnalyticsEventData): Promise<void> {
    if (!eventData.sessionId) return;

    try {
      const sessionKey = `session:${eventData.sessionId}`;
      const existing = await this.redis.get(sessionKey);

      if (existing) {
        const session: SessionData = JSON.parse(existing);

        // Update page views
        if (eventData.eventName === 'page_view') {
          session.pageViews = (session.pageViews || 0) + 1;

          // Update entry/exit pages
          if (session.pageViews === 1 && eventData.pageUrl) {
            session.entryPage = eventData.pageUrl;
          }
          if (eventData.pageUrl) {
            session.exitPage = eventData.pageUrl;
          }
        }

        // Add conversion events
        if (this.isConversionEvent(eventData)) {
          const conversionEvent: ConversionEvent = {
            eventName: eventData.eventName,
            timestamp: eventData.timestamp || new Date(),
            properties: eventData.eventProperties
          };

          session.conversionEvents = session.conversionEvents || [];
          session.conversionEvents.push(conversionEvent);
        }

        // Update session in Redis
        await this.redis.setex(sessionKey, 3600, JSON.stringify(session));
      }
    } catch (error) {
      this.logger.error('Failed to update session from event', {
        error: error.message,
        sessionId: eventData.sessionId
      });
    }
  }

  /**
   * Process conversion events for attribution and journey mapping
   */
  private async processConversionEvent(eventData: AnalyticsEventData): Promise<void> {
    if (!eventData.sessionId && !eventData.userId) return;

    try {
      // Find or create customer journey
      let journey = await this.prisma.customerJourney.findFirst({
        where: {
          OR: [
            { sessionId: eventData.sessionId },
            { userId: eventData.userId }
          ],
          completedAt: null // Only active journeys
        },
        orderBy: { startedAt: 'desc' }
      });

      if (!journey && (eventData.userId || eventData.sessionId)) {
        // Create new journey
        journey = await this.prisma.customerJourney.create({
          data: {
            userId: eventData.userId,
            tenantId: eventData.tenantId,
            sessionId: eventData.sessionId,
            touchpoints: [],
            conversionEvents: [],
            journeyStage: 'awareness',
            totalTouchpoints: 0,
            converted: false,
            attributionModel: 'last_click',
            startedAt: new Date()
          }
        });
      }

      if (journey) {
        // Add conversion event
        const conversionEvents = Array.isArray(journey.conversionEvents)
          ? journey.conversionEvents as any[]
          : [];

        conversionEvents.push({
          eventName: eventData.eventName,
          timestamp: eventData.timestamp || new Date(),
          value: eventData.eventProperties?.value || 0,
          currency: eventData.eventProperties?.currency || 'USD',
          properties: eventData.eventProperties
        });

        // Update journey stage and conversion status
        let journeyStage = journey.journeyStage;
        let converted = journey.converted;

        if (eventData.eventName === 'booking_confirmed') {
          journeyStage = 'purchase';
          converted = true;
        } else if (eventData.eventName === 'booking_initiated') {
          journeyStage = 'intent';
        } else if (eventData.eventName === 'warehouse_inquiry') {
          journeyStage = 'consideration';
        }

        // Calculate journey duration
        const journeyDuration = Math.floor(
          ((eventData.timestamp || new Date()).getTime() - journey.startedAt.getTime()) / 1000
        );

        await this.prisma.customerJourney.update({
          where: { id: journey.id },
          data: {
            conversionEvents,
            journeyStage,
            converted,
            journeyDuration,
            conversionValue: converted ? eventData.eventProperties?.value || 0 : journey.conversionValue,
            completedAt: converted ? new Date() : null
          }
        });
      }
    } catch (error) {
      this.logger.error('Failed to process conversion event', {
        error: error.message,
        eventData
      });
    }
  }

  /**
   * Update real-time counters in Redis
   */
  private async updateRealtimeCounters(eventData: AnalyticsEventData): Promise<void> {
    try {
      const tenantKey = `realtime:${eventData.tenantId || 'global'}`;
      const today = new Date().toISOString().split('T')[0];
      const hourKey = `${tenantKey}:${today}:${new Date().getHours()}`;

      // Update hourly counters
      await this.redis.hincrby(hourKey, 'total_events', 1);
      await this.redis.hincrby(hourKey, `${eventData.eventCategory}_events`, 1);

      if (eventData.eventName) {
        await this.redis.hincrby(hourKey, eventData.eventName, 1);
      }

      // Set expiration for hourly keys (25 hours)
      await this.redis.expire(hourKey, 25 * 3600);

      // Update daily counters
      const dailyKey = `${tenantKey}:${today}`;
      await this.redis.hincrby(dailyKey, 'total_events', 1);
      await this.redis.hincrby(dailyKey, `${eventData.eventCategory}_events`, 1);

      // Set expiration for daily keys (7 days)
      await this.redis.expire(dailyKey, 7 * 24 * 3600);

    } catch (error) {
      this.logger.error('Failed to update realtime counters', {
        error: error.message,
        eventData
      });
    }
  }

  /**
   * Process journey touchpoint
   */
  private async processJourneyTouchpoint(eventData: AnalyticsEventData): Promise<void> {
    if (!eventData.userId && !eventData.sessionId) return;

    try {
      // Find active journey
      let journey = await this.prisma.customerJourney.findFirst({
        where: {
          OR: [
            { sessionId: eventData.sessionId },
            { userId: eventData.userId }
          ],
          completedAt: null
        },
        orderBy: { startedAt: 'desc' }
      });

      if (journey) {
        const touchpoints = Array.isArray(journey.touchpoints)
          ? journey.touchpoints as any[]
          : [];

        const touchpoint: Touchpoint = {
          timestamp: eventData.timestamp || new Date(),
          channel: this.inferChannel(eventData),
          source: eventData.referrer ? this.extractSource(eventData.referrer) : undefined,
          page: eventData.pageUrl,
          action: eventData.eventName,
          properties: eventData.eventProperties
        };

        touchpoints.push(touchpoint);

        // Determine attribution channels
        let firstTouchChannel = journey.firstTouchChannel;
        let lastTouchChannel = touchpoint.channel;

        if (!firstTouchChannel && touchpoints.length === 1) {
          firstTouchChannel = touchpoint.channel;
        }

        await this.prisma.customerJourney.update({
          where: { id: journey.id },
          data: {
            touchpoints,
            totalTouchpoints: touchpoints.length,
            firstTouchChannel,
            lastTouchChannel
          }
        });
      }
    } catch (error) {
      this.logger.error('Failed to process journey touchpoint', {
        error: error.message,
        eventData
      });
    }
  }

  /**
   * Determine if event is a conversion event
   */
  private isConversionEvent(eventData: AnalyticsEventData): boolean {
    const conversionEvents = [
      'booking_confirmed',
      'booking_initiated',
      'payment_completed',
      'registration_completed',
      'subscription_created'
    ];

    return conversionEvents.includes(eventData.eventName);
  }

  /**
   * Get device type from user agent result
   */
  private getDeviceType(uaResult: any): string {
    if (uaResult.device.type === 'mobile') return 'mobile';
    if (uaResult.device.type === 'tablet') return 'tablet';
    return 'desktop';
  }

  /**
   * Infer event type from event name
   */
  private inferEventType(eventName: string): string {
    if (eventName.includes('click')) return 'click';
    if (eventName.includes('view')) return 'view';
    if (eventName.includes('search')) return 'search';
    if (eventName.includes('booking')) return 'booking';
    if (eventName.includes('payment')) return 'payment';

    return 'interaction';
  }

  /**
   * Infer traffic channel from event data
   */
  private inferChannel(eventData: AnalyticsEventData): string {
    if (eventData.referrer) {
      if (eventData.referrer.includes('google')) return 'organic_search';
      if (eventData.referrer.includes('facebook')) return 'social';
      if (eventData.referrer.includes('twitter')) return 'social';
      if (eventData.referrer.includes('linkedin')) return 'social';
      return 'referral';
    }

    // Check for UTM parameters in custom properties
    if (eventData.customProperties?.utm_source) {
      if (eventData.customProperties.utm_medium === 'email') return 'email';
      if (eventData.customProperties.utm_medium === 'social') return 'social';
      if (eventData.customProperties.utm_medium === 'cpc') return 'paid_search';
      return 'campaign';
    }

    return 'direct';
  }

  /**
   * Extract source from referrer URL
   */
  private extractSource(referrer: string): string {
    try {
      const url = new URL(referrer);
      return url.hostname;
    } catch {
      return 'unknown';
    }
  }
}