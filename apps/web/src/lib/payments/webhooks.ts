/**
 * Stripe Webhook Handler Service
 *
 * This service securely handles Stripe webhook events including:
 * - Payment intent status updates
 * - Subscription lifecycle events
 * - Customer and payment method changes
 * - Connect account events
 * - Invoice and billing events
 * - Secure event verification and processing
 */

import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { validateWebhookSignature, WEBHOOK_CONFIG, handleStripeError } from './stripe';
import { prisma } from '@/lib/db';
import { paymentService } from './payments';
import { subscriptionService } from './subscriptions';
import { connectService } from './connect';

export interface WebhookProcessingResult {
  success: boolean;
  eventId: string;
  eventType: string;
  processed: boolean;
  error?: string;
}

/**
 * Webhook Event Handler Service
 */
export class WebhookService {
  /**
   * Process incoming Stripe webhook
   */
  async processWebhook(
    request: NextRequest,
    isConnect = false
  ): Promise<WebhookProcessingResult> {
    try {
      // Get raw body and signature
      const body = await request.text();
      const signature = request.headers.get('stripe-signature');

      if (!signature) {
        throw new Error('Missing stripe-signature header');
      }

      // Validate webhook signature
      const secret = isConnect
        ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET!
        : process.env.STRIPE_WEBHOOK_SECRET!;

      const event = validateWebhookSignature(body, signature, secret);

      // Check for duplicate events
      const existingEvent = await prisma.webhookEvent.findUnique({
        where: { stripeEventId: event.id },
      });

      if (existingEvent) {
        return {
          success: true,
          eventId: event.id,
          eventType: event.type,
          processed: true,
        };
      }

      // Store webhook event
      const webhookEvent = await prisma.webhookEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
          data: event.data as any,
          processed: false,
          stripeAccountId: isConnect ? this.extractAccountId(event) : null,
        },
      });

      try {
        // Process event based on type
        await this.handleEvent(event, isConnect);

        // Mark as processed
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            processed: true,
            processedAt: new Date(),
          },
        });

        return {
          success: true,
          eventId: event.id,
          eventType: event.type,
          processed: true,
        };
      } catch (processingError) {
        // Log processing error but don't fail the webhook
        await this.logProcessingError(webhookEvent.id, processingError);

        return {
          success: true,
          eventId: event.id,
          eventType: event.type,
          processed: false,
          error: processingError instanceof Error ? processingError.message : 'Unknown error',
        };
      }
    } catch (error) {
      return {
        success: false,
        eventId: '',
        eventType: '',
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle different types of Stripe events
   */
  private async handleEvent(event: Stripe.Event, isConnect = false): Promise<void> {
    switch (event.type) {
      // Customer events
      case 'customer.created':
      case 'customer.updated':
        await this.handleCustomerEvent(event);
        break;

      case 'customer.deleted':
        await this.handleCustomerDeleted(event);
        break;

      // Payment method events
      case 'payment_method.attached':
        await this.handlePaymentMethodAttached(event);
        break;

      case 'payment_method.detached':
        await this.handlePaymentMethodDetached(event);
        break;

      // Payment intent events
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await this.handlePaymentIntentEvent(event);
        break;

      // Subscription events
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionEvent(event);
        break;

      // Invoice events
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        await this.handleInvoiceEvent(event);
        break;

      // Connect account events (for Connect webhooks)
      case 'account.updated':
        if (isConnect) {
          await this.handleAccountUpdated(event);
        }
        break;

      case 'capability.updated':
        if (isConnect) {
          await this.handleCapabilityUpdated(event);
        }
        break;

      // Payout events (for Connect accounts)
      case 'payout.created':
      case 'payout.updated':
      case 'payout.paid':
      case 'payout.failed':
        if (isConnect) {
          await this.handlePayoutEvent(event);
        }
        break;

      // Charge events
      case 'charge.succeeded':
      case 'charge.failed':
        await this.handleChargeEvent(event);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Customer event handlers
   */
  private async handleCustomerEvent(event: Stripe.Event): Promise<void> {
    const customer = event.data.object as Stripe.Customer;

    try {
      await prisma.customer.upsert({
        where: { stripeCustomerId: customer.id },
        update: {
          email: customer.email || '',
          name: customer.name,
          phone: customer.phone,
          address: customer.address ? JSON.stringify(customer.address) : undefined,
          defaultPaymentMethod: customer.invoice_settings?.default_payment_method as string || undefined,
          metadata: customer.metadata,
        },
        create: {
          stripeCustomerId: customer.id,
          email: customer.email || '',
          name: customer.name,
          phone: customer.phone,
          address: customer.address ? JSON.stringify(customer.address) : undefined,
          defaultPaymentMethod: customer.invoice_settings?.default_payment_method as string || undefined,
          metadata: customer.metadata,
          userId: customer.metadata?.userId || undefined,
          organizationId: customer.metadata?.organizationId || undefined,
        },
      });
    } catch (error) {
      console.error('Error handling customer event:', error);
    }
  }

  private async handleCustomerDeleted(event: Stripe.Event): Promise<void> {
    const customer = event.data.object as Stripe.Customer;

    try {
      await prisma.customer.delete({
        where: { stripeCustomerId: customer.id },
      });
    } catch (error) {
      console.error('Error handling customer deletion:', error);
    }
  }

  /**
   * Payment method event handlers
   */
  private async handlePaymentMethodAttached(event: Stripe.Event): Promise<void> {
    const paymentMethod = event.data.object as Stripe.PaymentMethod;

    if (!paymentMethod.customer) return;

    try {
      const customer = await prisma.customer.findUnique({
        where: { stripeCustomerId: paymentMethod.customer as string },
      });

      if (customer) {
        await prisma.paymentMethod.upsert({
          where: { stripePaymentMethodId: paymentMethod.id },
          update: {
            type: paymentMethod.type,
            card: paymentMethod.card ? JSON.stringify(paymentMethod.card) : undefined,
            billingDetails: paymentMethod.billing_details ? JSON.stringify(paymentMethod.billing_details) : undefined,
          },
          create: {
            stripePaymentMethodId: paymentMethod.id,
            customerId: customer.id,
            type: paymentMethod.type,
            card: paymentMethod.card ? JSON.stringify(paymentMethod.card) : undefined,
            billingDetails: paymentMethod.billing_details ? JSON.stringify(paymentMethod.billing_details) : undefined,
          },
        });
      }
    } catch (error) {
      console.error('Error handling payment method attached:', error);
    }
  }

  private async handlePaymentMethodDetached(event: Stripe.Event): Promise<void> {
    const paymentMethod = event.data.object as Stripe.PaymentMethod;

    try {
      await prisma.paymentMethod.delete({
        where: { stripePaymentMethodId: paymentMethod.id },
      });
    } catch (error) {
      console.error('Error handling payment method detached:', error);
    }
  }

  /**
   * Payment intent event handlers
   */
  private async handlePaymentIntentEvent(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await paymentService.updatePaymentFromWebhook(paymentIntent);
  }

  /**
   * Subscription event handlers
   */
  private async handleSubscriptionEvent(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    await subscriptionService.updateSubscriptionFromWebhook(subscription);
  }

  /**
   * Invoice event handlers
   */
  private async handleInvoiceEvent(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;

    // Handle subscription payment events
    if (invoice.subscription) {
      const subscriptionId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription.id;

      try {
        const dbSubscription = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: subscriptionId },
        });

        if (dbSubscription) {
          if (event.type === 'invoice.payment_succeeded') {
            // Update subscription status and create payment record if needed
            await prisma.subscription.update({
              where: { id: dbSubscription.id },
              data: {
                status: 'ACTIVE',
                currentPeriodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : undefined,
                currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
              },
            });
          } else if (event.type === 'invoice.payment_failed') {
            await prisma.subscription.update({
              where: { id: dbSubscription.id },
              data: { status: 'PAST_DUE' },
            });
          }
        }
      } catch (error) {
        console.error('Error handling invoice event:', error);
      }
    }
  }

  /**
   * Connect account event handlers
   */
  private async handleAccountUpdated(event: Stripe.Event): Promise<void> {
    const account = event.data.object as Stripe.Account;
    await connectService.updateAccountStatus(account.id, account);
  }

  private async handleCapabilityUpdated(event: Stripe.Event): Promise<void> {
    // Handle capability updates for Connect accounts
    const capability = event.data.object as Stripe.Capability;

    try {
      const stripeAccount = await prisma.stripeAccount.findUnique({
        where: { stripeAccountId: capability.account },
      });

      if (stripeAccount) {
        // Update capabilities in the account record
        const currentCapabilities = (stripeAccount.capabilities as any) || {};
        currentCapabilities[capability.id] = capability.status;

        await prisma.stripeAccount.update({
          where: { id: stripeAccount.id },
          data: { capabilities: currentCapabilities },
        });
      }
    } catch (error) {
      console.error('Error handling capability updated:', error);
    }
  }

  /**
   * Payout event handlers (for Connect accounts)
   */
  private async handlePayoutEvent(event: Stripe.Event): Promise<void> {
    const payout = event.data.object as Stripe.Payout;

    // Log payout events for Connect accounts
    // This can be extended to create payout records in the database
    console.log(`Payout event ${event.type} for account ${payout.destination}:`, {
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      status: payout.status,
      arrival_date: payout.arrival_date,
    });
  }

  /**
   * Charge event handlers
   */
  private async handleChargeEvent(event: Stripe.Event): Promise<void> {
    const charge = event.data.object as Stripe.Charge;

    try {
      if (charge.payment_intent) {
        const paymentIntentId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent.id;

        await prisma.payment.updateMany({
          where: { stripePaymentIntentId: paymentIntentId },
          data: {
            stripeChargeId: charge.id,
            receiptUrl: charge.receipt_url,
            status: charge.status === 'succeeded' ? 'CONFIRMED' : 'FAILED',
            failureCode: charge.failure_code,
            failureMessage: charge.failure_message,
          },
        });
      }
    } catch (error) {
      console.error('Error handling charge event:', error);
    }
  }

  /**
   * Helper methods
   */
  private extractAccountId(event: Stripe.Event): string | null {
    // For Connect webhook events, the account ID is in the event context
    return (event as any).account || null;
  }

  private async logProcessingError(webhookEventId: string, error: any): Promise<void> {
    try {
      const webhookEvent = await prisma.webhookEvent.findUnique({
        where: { id: webhookEventId },
      });

      if (webhookEvent) {
        const currentErrors = (webhookEvent.processingErrors as any[]) || [];
        const errorEntry = {
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        };

        await prisma.webhookEvent.update({
          where: { id: webhookEventId },
          data: {
            processingErrors: [...currentErrors, errorEntry],
            retryCount: webhookEvent.retryCount + 1,
          },
        });
      }
    } catch (logError) {
      console.error('Failed to log processing error:', logError);
    }
  }

  /**
   * Retry failed webhook processing
   */
  async retryFailedEvents(limit = 10): Promise<void> {
    try {
      const failedEvents = await prisma.webhookEvent.findMany({
        where: {
          processed: false,
          retryCount: { lt: 5 }, // Max 5 retries
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      for (const event of failedEvents) {
        try {
          // Reconstruct the Stripe event object
          const stripeEvent: Stripe.Event = {
            id: event.stripeEventId,
            type: event.eventType as any,
            data: event.data as any,
          } as Stripe.Event;

          await this.handleEvent(stripeEvent, !!event.stripeAccountId);

          // Mark as processed
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              processed: true,
              processedAt: new Date(),
            },
          });

          console.log(`Successfully retried event ${event.stripeEventId}`);
        } catch (retryError) {
          await this.logProcessingError(event.id, retryError);
          console.error(`Failed to retry event ${event.stripeEventId}:`, retryError);
        }
      }
    } catch (error) {
      console.error('Error retrying failed events:', error);
    }
  }
}

export const webhookService = new WebhookService();