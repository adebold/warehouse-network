/**
 * Customer Behavior Analyzer Service
 * Analyzes customer journeys, funnels, and cohorts for behavioral insights
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'winston';
import { EventEmitter } from 'events';
import { groupBy, orderBy, sumBy, meanBy } from 'lodash';
import { startOfDay, endOfDay, format, differenceInDays } from 'date-fns';

import {
  CustomerJourneyData,
  FunnelAnalysis,
  FunnelStep,
  CohortAnalysisData,
  CohortData,
  Touchpoint
} from '../types';

export class CustomerBehaviorAnalyzer extends EventEmitter {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Analyze customer journey for a specific user
   */
  async analyzeJourney(
    userId: string,
    timeframe?: { startDate: Date; endDate: Date }
  ): Promise<CustomerJourneyData> {
    try {
      const { startDate, endDate } = timeframe || {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        endDate: new Date()
      };

      // Get customer journey data
      const journeys = await this.prisma.customerJourney.findMany({
        where: {
          userId,
          startedAt: { gte: startDate, lte: endDate }
        },
        orderBy: { startedAt: 'asc' }
      });

      if (journeys.length === 0) {
        // Create journey from events if no journey exists
        return await this.constructJourneyFromEvents(userId, startDate, endDate);
      }

      // Merge multiple journeys if they exist
      const mergedJourney = this.mergeJourneys(journeys);

      this.emit('journey_analyzed', {
        userId,
        journeyCount: journeys.length,
        totalTouchpoints: mergedJourney.totalTouchpoints
      });

      return mergedJourney;
    } catch (error) {
      this.logger.error('Failed to analyze customer journey', {
        error: error.message,
        userId,
        timeframe
      });
      throw error;
    }
  }

  /**
   * Analyze funnel conversion rates
   */
  async analyzeFunnel(
    funnelName: string,
    tenantId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<FunnelAnalysis> {
    try {
      // Define standard funnel steps
      const standardFunnels = {
        booking_funnel: [
          { name: 'Landing Page View', eventName: 'page_view' },
          { name: 'Warehouse Search', eventName: 'warehouse_search' },
          { name: 'Warehouse View', eventName: 'warehouse_view' },
          { name: 'Booking Initiated', eventName: 'booking_initiated' },
          { name: 'Payment Started', eventName: 'payment_started' },
          { name: 'Booking Confirmed', eventName: 'booking_confirmed' }
        ],
        registration_funnel: [
          { name: 'Landing Page', eventName: 'page_view' },
          { name: 'Registration Form View', eventName: 'registration_form_view' },
          { name: 'Registration Attempted', eventName: 'registration_attempted' },
          { name: 'Registration Completed', eventName: 'registration_completed' }
        ]
      };

      const funnelSteps = standardFunnels[funnelName as keyof typeof standardFunnels] || [];
      if (funnelSteps.length === 0) {
        throw new Error(`Unknown funnel: ${funnelName}`);
      }

      // Calculate step completions
      const stepCompletions: number[] = [];
      const stepUsers: Set<string>[] = [];

      for (let i = 0; i < funnelSteps.length; i++) {
        const step = funnelSteps[i];
        const events = await this.prisma.analyticsEvent.findMany({
          where: {
            tenantId,
            eventName: step.eventName,
            createdAt: { gte: dateRange.start, lte: dateRange.end }
          },
          select: { userId: true, sessionId: true, createdAt: true }
        });

        const uniqueUsers = new Set(
          events.map(e => e.userId || e.sessionId).filter(Boolean)
        );

        stepCompletions.push(events.length);
        stepUsers.push(uniqueUsers);
      }

      // Calculate conversion rates and drop-off rates
      const steps: FunnelStep[] = [];
      const totalEntries = stepCompletions[0] || 0;

      for (let i = 0; i < funnelSteps.length; i++) {
        const completions = stepCompletions[i];
        const completionRate = totalEntries > 0 ? (completions / totalEntries) * 100 : 0;
        const dropOffRate = i > 0 && stepCompletions[i - 1] > 0
          ? ((stepCompletions[i - 1] - completions) / stepCompletions[i - 1]) * 100
          : 0;

        steps.push({
          name: funnelSteps[i].name,
          position: i + 1,
          completions,
          completionRate,
          dropOffRate
        });
      }

      const overallConversionRate = totalEntries > 0 && stepCompletions.length > 0
        ? (stepCompletions[stepCompletions.length - 1] / totalEntries) * 100
        : 0;

      // Identify drop-off points (steps with highest drop-off rates)
      const dropOffPoints = steps
        .filter(step => step.dropOffRate > 20) // Arbitrary threshold
        .sort((a, b) => b.dropOffRate - a.dropOffRate)
        .slice(0, 3)
        .map(step => step.name);

      const analysis: FunnelAnalysis = {
        funnelName,
        tenantId,
        steps,
        dateRange,
        totalEntries,
        overallConversionRate,
        dropOffPoints,
        insights: this.generateFunnelInsights(steps, dropOffPoints)
      };

      // Cache results
      const cacheKey = `funnel:${funnelName}:${tenantId}:${format(dateRange.start, 'yyyy-MM-dd')}:${format(dateRange.end, 'yyyy-MM-dd')}`;
      await this.redis.setex(cacheKey, 3600, JSON.stringify(analysis));

      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze funnel', {
        error: error.message,
        funnelName,
        tenantId,
        dateRange
      });
      throw error;
    }
  }

  /**
   * Perform cohort analysis
   */
  async analyzeCohorts(
    cohortType: string,
    tenantId: string,
    params: {
      period: 'daily' | 'weekly' | 'monthly';
      startDate: Date;
      endDate: Date;
      retentionPeriods: number;
    }
  ): Promise<CohortAnalysisData> {
    try {
      const { period, startDate, endDate, retentionPeriods } = params;

      // Get user acquisition data based on cohort type
      let users: Array<{ userId: string; cohortPeriod: string; acquisitionDate: Date }> = [];

      switch (cohortType) {
        case 'user_acquisition':
          users = await this.getUserAcquisitionCohorts(tenantId, startDate, endDate, period);
          break;
        case 'first_purchase':
          users = await this.getFirstPurchaseCohorts(tenantId, startDate, endDate, period);
          break;
        case 'feature_adoption':
          users = await this.getFeatureAdoptionCohorts(tenantId, startDate, endDate, period);
          break;
        default:
          throw new Error(`Unknown cohort type: ${cohortType}`);
      }

      // Group users by cohort period
      const cohortGroups = groupBy(users, 'cohortPeriod');
      const cohorts: CohortData[] = [];

      for (const [cohortId, cohortUsers] of Object.entries(cohortGroups)) {
        const cohortStartDate = cohortUsers[0].acquisitionDate;
        const retentionRates: number[] = [];
        const revenueData: number[] = [];

        // Calculate retention for each period
        for (let i = 0; i < retentionPeriods; i++) {
          const periodStart = this.addPeriods(cohortStartDate, i, period);
          const periodEnd = this.addPeriods(periodStart, 1, period);

          // Count retained users (users who were active in this period)
          const retainedUsers = await this.getActiveUsersInPeriod(
            cohortUsers.map(u => u.userId),
            periodStart,
            periodEnd,
            tenantId
          );

          const retentionRate = cohortUsers.length > 0
            ? (retainedUsers.length / cohortUsers.length) * 100
            : 0;

          retentionRates.push(retentionRate);

          // Calculate revenue for this cohort in this period
          const revenue = await this.getCohortRevenueInPeriod(
            cohortUsers.map(u => u.userId),
            periodStart,
            periodEnd,
            tenantId
          );

          revenueData.push(revenue);
        }

        cohorts.push({
          cohortId,
          period: cohortId,
          initialSize: cohortUsers.length,
          retentionRates,
          revenueData
        });
      }

      // Calculate average retention rates across all cohorts
      const averageRetention: number[] = [];
      for (let i = 0; i < retentionPeriods; i++) {
        const rates = cohorts.map(c => c.retentionRates[i]);
        averageRetention.push(
          rates.length > 0 ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0
        );
      }

      // Calculate average lifetime value
      const totalRevenue = cohorts.reduce((sum, cohort) =>
        sum + cohort.revenueData.reduce((s, r) => s + r, 0), 0
      );
      const totalUsers = cohorts.reduce((sum, cohort) => sum + cohort.initialSize, 0);
      const averageLifetimeValue = totalUsers > 0 ? totalRevenue / totalUsers : 0;

      const analysis: CohortAnalysisData = {
        cohortName: `${cohortType}_${period}`,
        cohortType: cohortType as any,
        cohortPeriod: period,
        cohorts,
        averageRetention,
        averageLifetimeValue,
        insights: this.generateCohortInsights(cohorts, averageRetention)
      };

      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze cohorts', {
        error: error.message,
        cohortType,
        tenantId,
        params
      });
      throw error;
    }
  }

  /**
   * Track conversion attribution
   */
  async trackAttribution(
    userId: string,
    conversionEvent: string,
    attributionModel: 'first_click' | 'last_click' | 'linear' | 'time_decay' = 'last_click'
  ): Promise<any> {
    try {
      // Get user's customer journey
      const journey = await this.prisma.customerJourney.findFirst({
        where: { userId, converted: true },
        orderBy: { completedAt: 'desc' }
      });

      if (!journey || !Array.isArray(journey.touchpoints)) {
        return null;
      }

      const touchpoints = journey.touchpoints as Touchpoint[];
      const attribution = this.calculateAttribution(touchpoints, attributionModel);

      // Store attribution data
      await this.prisma.customerJourney.update({
        where: { id: journey.id },
        data: { attributionModel }
      });

      return {
        userId,
        conversionEvent,
        attributionModel,
        touchpoints: touchpoints.length,
        attribution
      };
    } catch (error) {
      this.logger.error('Failed to track attribution', {
        error: error.message,
        userId,
        conversionEvent
      });
      throw error;
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Construct journey from analytics events when no journey record exists
   */
  private async constructJourneyFromEvents(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CustomerJourneyData> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate }
      },
      orderBy: { createdAt: 'asc' }
    });

    const touchpoints: Touchpoint[] = events.map(event => ({
      timestamp: event.createdAt,
      channel: this.inferChannelFromEvent(event),
      source: event.referrer ? this.extractSource(event.referrer) : undefined,
      page: event.pageUrl || undefined,
      action: event.eventName,
      properties: event.eventProperties as any
    }));

    const conversionEvents = events
      .filter(e => this.isConversionEvent(e.eventName))
      .map(e => ({
        eventName: e.eventName,
        timestamp: e.createdAt,
        properties: e.eventProperties as any
      }));

    const converted = conversionEvents.length > 0;
    const journeyDuration = events.length > 0
      ? Math.floor((events[events.length - 1].createdAt.getTime() - events[0].createdAt.getTime()) / 1000)
      : 0;

    return {
      userId,
      touchpoints,
      conversionEvents,
      journeyStage: this.determineJourneyStage(events),
      totalTouchpoints: touchpoints.length,
      journeyDuration,
      converted,
      conversionValue: this.calculateConversionValue(conversionEvents),
      firstTouchChannel: touchpoints.length > 0 ? touchpoints[0].channel : undefined,
      lastTouchChannel: touchpoints.length > 0 ? touchpoints[touchpoints.length - 1].channel : undefined,
      attributionModel: 'last_click',
      startedAt: events.length > 0 ? events[0].createdAt : new Date(),
      completedAt: converted ? events[events.length - 1].createdAt : undefined
    };
  }

  /**
   * Merge multiple journey records into a single journey
   */
  private mergeJourneys(journeys: any[]): CustomerJourneyData {
    const allTouchpoints: Touchpoint[] = [];
    const allConversionEvents: any[] = [];

    journeys.forEach(journey => {
      if (Array.isArray(journey.touchpoints)) {
        allTouchpoints.push(...journey.touchpoints);
      }
      if (Array.isArray(journey.conversionEvents)) {
        allConversionEvents.push(...journey.conversionEvents);
      }
    });

    // Sort touchpoints chronologically
    allTouchpoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    allConversionEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const firstJourney = journeys[0];
    const lastJourney = journeys[journeys.length - 1];

    return {
      userId: firstJourney.userId,
      tenantId: firstJourney.tenantId,
      sessionId: firstJourney.sessionId,
      touchpoints: allTouchpoints,
      conversionEvents: allConversionEvents,
      journeyStage: lastJourney.journeyStage || 'awareness',
      totalTouchpoints: allTouchpoints.length,
      journeyDuration: lastJourney.journeyDuration,
      converted: journeys.some(j => j.converted),
      conversionValue: sumBy(journeys, 'conversionValue') || 0,
      firstTouchChannel: firstJourney.firstTouchChannel,
      lastTouchChannel: lastJourney.lastTouchChannel,
      attributionModel: lastJourney.attributionModel || 'last_click',
      startedAt: firstJourney.startedAt,
      completedAt: lastJourney.completedAt
    };
  }

  /**
   * Get user acquisition cohorts
   */
  private async getUserAcquisitionCohorts(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<Array<{ userId: string; cohortPeriod: string; acquisitionDate: Date }>> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate }
      },
      select: { id: true, createdAt: true }
    });

    return users.map(user => ({
      userId: user.id,
      cohortPeriod: this.formatPeriod(user.createdAt, period),
      acquisitionDate: user.createdAt
    }));
  }

  /**
   * Get first purchase cohorts
   */
  private async getFirstPurchaseCohorts(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<Array<{ userId: string; cohortPeriod: string; acquisitionDate: Date }>> {
    // Get first booking for each user
    const firstBookings = await this.prisma.booking.groupBy({
      by: ['customerId'],
      where: {
        tenantId,
        status: 'confirmed',
        createdAt: { gte: startDate, lte: endDate }
      },
      _min: { createdAt: true }
    });

    return firstBookings
      .filter(booking => booking._min.createdAt)
      .map(booking => ({
        userId: booking.customerId,
        cohortPeriod: this.formatPeriod(booking._min.createdAt!, period),
        acquisitionDate: booking._min.createdAt!
      }));
  }

  /**
   * Get feature adoption cohorts
   */
  private async getFeatureAdoptionCohorts(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<Array<{ userId: string; cohortPeriod: string; acquisitionDate: Date }>> {
    // Get first feature usage for each user (e.g., first warehouse search)
    const firstUsage = await this.prisma.analyticsEvent.groupBy({
      by: ['userId'],
      where: {
        tenantId,
        eventName: 'warehouse_search', // Example feature
        createdAt: { gte: startDate, lte: endDate },
        userId: { not: null }
      },
      _min: { createdAt: true }
    });

    return firstUsage
      .filter(usage => usage.userId && usage._min.createdAt)
      .map(usage => ({
        userId: usage.userId!,
        cohortPeriod: this.formatPeriod(usage._min.createdAt!, period),
        acquisitionDate: usage._min.createdAt!
      }));
  }

  /**
   * Get active users in a specific period
   */
  private async getActiveUsersInPeriod(
    userIds: string[],
    startDate: Date,
    endDate: Date,
    tenantId: string
  ): Promise<string[]> {
    const activeSessions = await this.prisma.userSession.findMany({
      where: {
        userId: { in: userIds },
        tenantId,
        startedAt: { gte: startDate, lte: endDate }
      },
      select: { userId: true }
    });

    return [...new Set(activeSessions.map(s => s.userId).filter(Boolean))] as string[];
  }

  /**
   * Get cohort revenue in a specific period
   */
  private async getCohortRevenueInPeriod(
    userIds: string[],
    startDate: Date,
    endDate: Date,
    tenantId: string
  ): Promise<number> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: { in: userIds },
        tenantId,
        status: 'completed',
        createdAt: { gte: startDate, lte: endDate }
      },
      select: { amount: true }
    });

    return sumBy(transactions, t => Number(t.amount));
  }

  /**
   * Calculate attribution based on model
   */
  private calculateAttribution(
    touchpoints: Touchpoint[],
    model: 'first_click' | 'last_click' | 'linear' | 'time_decay'
  ): Record<string, number> {
    const attribution: Record<string, number> = {};

    if (touchpoints.length === 0) return attribution;

    switch (model) {
      case 'first_click':
        attribution[touchpoints[0].channel] = 1.0;
        break;

      case 'last_click':
        attribution[touchpoints[touchpoints.length - 1].channel] = 1.0;
        break;

      case 'linear':
        const weight = 1.0 / touchpoints.length;
        touchpoints.forEach(tp => {
          attribution[tp.channel] = (attribution[tp.channel] || 0) + weight;
        });
        break;

      case 'time_decay':
        // More recent touchpoints get more credit
        const totalWeight = touchpoints.reduce((sum, _, i) => sum + Math.pow(2, i), 0);
        touchpoints.forEach((tp, i) => {
          const weight = Math.pow(2, i) / totalWeight;
          attribution[tp.channel] = (attribution[tp.channel] || 0) + weight;
        });
        break;
    }

    return attribution;
  }

  /**
   * Generate funnel insights
   */
  private generateFunnelInsights(steps: FunnelStep[], dropOffPoints: string[]): string[] {
    const insights: string[] = [];

    if (dropOffPoints.length > 0) {
      insights.push(`Highest drop-off occurs at: ${dropOffPoints[0]}`);
    }

    const avgCompletionRate = meanBy(steps, 'completionRate');
    if (avgCompletionRate < 20) {
      insights.push('Overall conversion rate is below industry average (20%)');
    }

    const biggestDropStep = steps.reduce((max, step) =>
      step.dropOffRate > max.dropOffRate ? step : max, steps[0]);

    if (biggestDropStep.dropOffRate > 50) {
      insights.push(`Consider optimizing ${biggestDropStep.name} - ${biggestDropStep.dropOffRate.toFixed(1)}% drop-off`);
    }

    return insights;
  }

  /**
   * Generate cohort insights
   */
  private generateCohortInsights(cohorts: CohortData[], averageRetention: number[]): string[] {
    const insights: string[] = [];

    if (averageRetention.length > 1 && averageRetention[1] < 30) {
      insights.push('Low day-1 retention suggests onboarding issues');
    }

    const bestCohort = cohorts.reduce((best, cohort) =>
      cohort.retentionRates[cohort.retentionRates.length - 1] >
      best.retentionRates[best.retentionRates.length - 1] ? cohort : best, cohorts[0]);

    insights.push(`Best performing cohort: ${bestCohort.period}`);

    return insights;
  }

  /**
   * Helper methods for period formatting and calculations
   */
  private formatPeriod(date: Date, period: 'daily' | 'weekly' | 'monthly'): string {
    switch (period) {
      case 'daily':
        return format(date, 'yyyy-MM-dd');
      case 'weekly':
        return format(date, 'yyyy-\\'W\\'II');
      case 'monthly':
        return format(date, 'yyyy-MM');
    }
  }

  private addPeriods(date: Date, amount: number, period: 'daily' | 'weekly' | 'monthly'): Date {
    const newDate = new Date(date);
    switch (period) {
      case 'daily':
        newDate.setDate(newDate.getDate() + amount);
        break;
      case 'weekly':
        newDate.setDate(newDate.getDate() + amount * 7);
        break;
      case 'monthly':
        newDate.setMonth(newDate.getMonth() + amount);
        break;
    }
    return newDate;
  }

  private inferChannelFromEvent(event: any): string {
    // Simplified channel inference logic
    if (event.referrer) {
      if (event.referrer.includes('google')) return 'organic_search';
      if (event.referrer.includes('facebook')) return 'social';
      return 'referral';
    }
    return 'direct';
  }

  private extractSource(referrer: string): string {
    try {
      return new URL(referrer).hostname;
    } catch {
      return 'unknown';
    }
  }

  private isConversionEvent(eventName: string): boolean {
    return ['booking_confirmed', 'payment_completed', 'registration_completed'].includes(eventName);
  }

  private determineJourneyStage(events: any[]): string {
    const eventNames = events.map(e => e.eventName);

    if (eventNames.includes('booking_confirmed')) return 'purchase';
    if (eventNames.includes('booking_initiated')) return 'intent';
    if (eventNames.includes('warehouse_view')) return 'consideration';
    return 'awareness';
  }

  private calculateConversionValue(conversionEvents: any[]): number {
    return sumBy(conversionEvents, e => e.properties?.value || 0);
  }
}