/**
 * Subscription Billing Service
 *
 * This service handles all subscription-related functionality including:
 * - Warehouse storage fee subscriptions
 * - Usage-based billing for metered storage
 * - Subscription lifecycle management
 * - Trial periods and promotions
 * - Subscription updates and cancellations
 */

import { stripe, SUBSCRIPTION_CONFIG, StripeError, handleStripeError } from './stripe';
import { prisma } from '@/lib/db';
import { SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

export interface CreateSubscriptionData {
  customerId: string;
  priceId: string;
  stripeAccountId?: string; // For Connect accounts
  trialPeriodDays?: number;
  promotionCode?: string;
  defaultPaymentMethod?: string;
  metadata?: Record<string, string>;
}

export interface UpdateSubscriptionData {
  subscriptionId: string;
  priceId?: string;
  quantity?: number;
  prorate?: boolean;
  metadata?: Record<string, string>;
}

export interface UsageRecord {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number;
  action?: 'increment' | 'set';
}

/**
 * Subscription Management Service
 */
export class SubscriptionService {
  /**
   * Create a new subscription for a customer
   */
  async createSubscription(data: CreateSubscriptionData): Promise<{
    subscription: Stripe.Subscription;
    clientSecret?: string;
  }> {
    try {
      // Prepare subscription params
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: data.customerId,
        items: [{ price: data.priceId }],
        trial_period_days: data.trialPeriodDays || SUBSCRIPTION_CONFIG.TRIAL_PERIOD_DAYS,
        expand: ['latest_invoice.payment_intent'],
        metadata: data.metadata || {},
      };

      // Add default payment method if provided
      if (data.defaultPaymentMethod) {
        subscriptionParams.default_payment_method = data.defaultPaymentMethod;
      }

      // Apply promotion code if provided
      if (data.promotionCode) {
        const promotionCodes = await stripe.promotionCodes.list({
          code: data.promotionCode,
          active: true,
          limit: 1,
        });

        if (promotionCodes.data.length > 0) {
          subscriptionParams.promotion_code = promotionCodes.data[0].id;
        }
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create(
        subscriptionParams,
        data.stripeAccountId ? { stripeAccount: data.stripeAccountId } : {}
      );

      // Store in database
      const dbSubscription = await prisma.subscription.create({
        data: {
          stripeSubscriptionId: subscription.id,
          stripePriceId: data.priceId,
          customerId: data.customerId,
          stripeAccountId: data.stripeAccountId,
          status: this.mapStripeStatus(subscription.status),
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          amount: subscription.items.data[0].price.unit_amount || 0,
          currency: subscription.currency,
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
          metadata: subscription.metadata,
        },
      });

      // Extract client secret for payment confirmation if needed
      let clientSecret: string | undefined;
      if (subscription.latest_invoice && typeof subscription.latest_invoice !== 'string') {
        const paymentIntent = subscription.latest_invoice.payment_intent;
        if (paymentIntent && typeof paymentIntent !== 'string') {
          clientSecret = paymentIntent.client_secret || undefined;
        }
      }

      return { subscription, clientSecret };
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Update an existing subscription
   */
  async updateSubscription(data: UpdateSubscriptionData): Promise<Stripe.Subscription> {
    try {
      const updateParams: Stripe.SubscriptionUpdateParams = {
        proration_behavior: data.prorate ? 'create_prorations' : 'none',
        metadata: data.metadata,
      };

      // Update subscription items if price or quantity changed
      if (data.priceId || data.quantity) {
        const subscription = await stripe.subscriptions.retrieve(data.subscriptionId);
        const currentItem = subscription.items.data[0];

        updateParams.items = [{
          id: currentItem.id,
          price: data.priceId || currentItem.price.id,
          quantity: data.quantity || currentItem.quantity || 1,
        }];
      }

      const subscription = await stripe.subscriptions.update(
        data.subscriptionId,
        updateParams
      );

      // Update database
      await prisma.subscription.update({
        where: { stripeSubscriptionId: data.subscriptionId },
        data: {
          stripePriceId: data.priceId || undefined,
          status: this.mapStripeStatus(subscription.status),
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          amount: subscription.items.data[0].price.unit_amount || 0,
          metadata: subscription.metadata,
        },
      });

      return subscription;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    options?: {
      immediately?: boolean;
      reason?: string;
      cancelAtPeriodEnd?: boolean;
    }
  ): Promise<Stripe.Subscription> {
    try {
      let subscription: Stripe.Subscription;

      if (options?.immediately) {
        // Cancel immediately
        subscription = await stripe.subscriptions.cancel(subscriptionId);
      } else {
        // Cancel at period end (default behavior)
        subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: options?.cancelAtPeriodEnd !== false,
        });
      }

      // Update database
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: this.mapStripeStatus(subscription.status),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
          cancellationReason: options?.reason,
        },
      });

      return subscription;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Resume a canceled subscription (if not past due)
   */
  async resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      // Update database
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: this.mapStripeStatus(subscription.status),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          cancellationReason: null,
        },
      });

      return subscription;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Record usage for metered billing
   */
  async recordUsage(
    subscriptionId: string,
    usageRecords: UsageRecord[]
  ): Promise<Stripe.UsageRecord[]> {
    try {
      const results: Stripe.UsageRecord[] = [];

      for (const record of usageRecords) {
        const usageRecord = await stripe.subscriptionItems.createUsageRecord(
          record.subscriptionItemId,
          {
            quantity: record.quantity,
            timestamp: record.timestamp || Math.floor(Date.now() / 1000),
            action: record.action || 'increment',
          }
        );
        results.push(usageRecord);
      }

      // Update usage records in database
      const currentRecords = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        select: { usageRecords: true },
      });

      const existingRecords = (currentRecords?.usageRecords as any[]) || [];
      const newRecords = usageRecords.map(record => ({
        timestamp: record.timestamp || Math.floor(Date.now() / 1000),
        quantity: record.quantity,
        action: record.action || 'increment',
        subscriptionItemId: record.subscriptionItemId,
      }));

      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          usageRecords: [...existingRecords, ...newRecords],
        },
      });

      return results;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Get usage summary for a subscription
   */
  async getUsageSummary(subscriptionId: string): Promise<{
    subscription: Stripe.Subscription;
    usageSummary: Stripe.UsageRecordSummary[];
  }> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      });

      const usageSummary: Stripe.UsageRecordSummary[] = [];

      for (const item of subscription.items.data) {
        if (item.price.usage_type === 'metered') {
          const summary = await stripe.subscriptionItems.listUsageRecordSummaries(item.id);
          usageSummary.push(...summary.data);
        }
      }

      return { subscription, usageSummary };
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Preview upcoming invoice for subscription changes
   */
  async previewInvoice(
    customerId: string,
    subscriptionId: string,
    options?: {
      priceId?: string;
      quantity?: number;
      couponId?: string;
    }
  ): Promise<Stripe.Invoice> {
    try {
      const invoiceParams: Stripe.InvoiceRetrieveUpcomingParams = {
        customer: customerId,
        subscription: subscriptionId,
      };

      if (options?.priceId || options?.quantity) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const currentItem = subscription.items.data[0];

        invoiceParams.subscription_items = [{
          id: currentItem.id,
          price: options.priceId || currentItem.price.id,
          quantity: options.quantity || currentItem.quantity || 1,
        }];
      }

      if (options?.couponId) {
        invoiceParams.coupon = options.couponId;
      }

      const invoice = await stripe.invoices.retrieveUpcoming(invoiceParams);
      return invoice;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['customer', 'items.data.price', 'latest_invoice'],
      });
      return subscription;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * List subscriptions for a customer
   */
  async listCustomerSubscriptions(
    customerId: string,
    status?: 'active' | 'canceled' | 'incomplete' | 'past_due' | 'trialing'
  ): Promise<Stripe.Subscription[]> {
    try {
      const params: Stripe.SubscriptionListParams = {
        customer: customerId,
        expand: ['data.items.data.price'],
      };

      if (status) {
        params.status = status;
      }

      const subscriptions = await stripe.subscriptions.list(params);
      return subscriptions.data;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Update subscription status from webhook
   */
  async updateSubscriptionFromWebhook(subscriptionData: Stripe.Subscription): Promise<void> {
    try {
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionData.id },
        data: {
          status: this.mapStripeStatus(subscriptionData.status),
          currentPeriodStart: new Date(subscriptionData.current_period_start * 1000),
          currentPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
          cancelAtPeriodEnd: subscriptionData.cancel_at_period_end,
          canceledAt: subscriptionData.canceled_at ? new Date(subscriptionData.canceled_at * 1000) : null,
          trialEnd: subscriptionData.trial_end ? new Date(subscriptionData.trial_end * 1000) : null,
          metadata: subscriptionData.metadata,
        },
      });
    } catch (error) {
      console.error('Failed to update subscription from webhook:', error);
    }
  }

  /**
   * Private helper methods
   */
  private mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
    switch (stripeStatus) {
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'incomplete':
        return SubscriptionStatus.INCOMPLETE;
      case 'incomplete_expired':
        return SubscriptionStatus.INCOMPLETE_EXPIRED;
      case 'paused':
        return SubscriptionStatus.PAUSED;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }
}

export const subscriptionService = new SubscriptionService();