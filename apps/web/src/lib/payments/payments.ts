/**
 * Customer Payment Processing Service
 *
 * This service handles customer payment processing including:
 * - Payment intent creation and confirmation
 * - Customer and payment method management
 * - Refund processing
 * - Payment status tracking
 * - Integration with Connect accounts for marketplace payments
 */

import { stripe, PAYMENT_CONFIG, StripeError, handleStripeError } from './stripe';
import { prisma } from '@/lib/db';
import { PaymentStatus, RefundStatus } from '@prisma/client';
import Stripe from 'stripe';

export interface CreateCustomerData {
  email: string;
  name?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  organizationId?: string;
  userId?: string;
  metadata?: Record<string, string>;
}

export interface CreatePaymentData {
  customerId: string;
  amount: number;
  currency?: string;
  description?: string;
  paymentMethodId?: string;
  confirmPayment?: boolean;
  receiptEmail?: string;
  shipping?: {
    name: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
  metadata?: Record<string, string>;

  // Connect marketplace options
  destinationAccountId?: string;
  applicationFeeAmount?: number;
  transferGroup?: string;
}

export interface RefundData {
  paymentId: string;
  amount?: number; // If not provided, full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  metadata?: Record<string, string>;
}

/**
 * Payment Processing Service
 */
export class PaymentService {
  /**
   * Create or retrieve a customer
   */
  async createCustomer(data: CreateCustomerData): Promise<{
    customer: Stripe.Customer;
    dbCustomer: any;
  }> {
    try {
      // Check if customer already exists in our database
      let dbCustomer = null;
      if (data.userId) {
        dbCustomer = await prisma.customer.findUnique({
          where: { userId: data.userId },
        });
      } else {
        dbCustomer = await prisma.customer.findFirst({
          where: {
            email: data.email,
            organizationId: data.organizationId,
          },
        });
      }

      let customer: Stripe.Customer;

      if (dbCustomer) {
        // Retrieve existing Stripe customer
        customer = await stripe.customers.retrieve(dbCustomer.stripeCustomerId) as Stripe.Customer;

        // Update customer data if needed
        if (data.name || data.phone || data.address) {
          customer = await stripe.customers.update(dbCustomer.stripeCustomerId, {
            name: data.name || customer.name,
            phone: data.phone || customer.phone,
            address: data.address as any || customer.address,
            metadata: { ...customer.metadata, ...data.metadata },
          });
        }
      } else {
        // Create new Stripe customer
        customer = await stripe.customers.create({
          email: data.email,
          name: data.name,
          phone: data.phone,
          address: data.address as any,
          metadata: {
            userId: data.userId || '',
            organizationId: data.organizationId || '',
            ...data.metadata,
          },
        });

        // Store in database
        dbCustomer = await prisma.customer.create({
          data: {
            stripeCustomerId: customer.id,
            email: data.email,
            name: data.name,
            phone: data.phone,
            address: data.address ? JSON.stringify(data.address) : undefined,
            userId: data.userId,
            organizationId: data.organizationId,
            metadata: customer.metadata,
          },
        });
      }

      return { customer, dbCustomer };
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Create a payment intent
   */
  async createPayment(data: CreatePaymentData): Promise<{
    paymentIntent: Stripe.PaymentIntent;
    dbPayment: any;
  }> {
    try {
      // Get customer
      const dbCustomer = await prisma.customer.findUnique({
        where: { stripeCustomerId: data.customerId },
      });

      if (!dbCustomer) {
        throw new StripeError('Customer not found', 'customer_not_found');
      }

      // Prepare payment intent params
      const paymentParams: Stripe.PaymentIntentCreateParams = {
        amount: data.amount,
        currency: data.currency || PAYMENT_CONFIG.DEFAULT_CURRENCY,
        customer: data.customerId,
        description: data.description,
        receipt_email: data.receiptEmail,
        shipping: data.shipping as any,
        metadata: data.metadata || {},
        automatic_payment_methods: {
          enabled: true,
        },
      };

      // Add payment method if provided
      if (data.paymentMethodId) {
        paymentParams.payment_method = data.paymentMethodId;
        if (data.confirmPayment) {
          paymentParams.confirm = true;
        }
      }

      // Add Connect marketplace data if provided
      if (data.destinationAccountId) {
        if (data.applicationFeeAmount) {
          paymentParams.application_fee_amount = data.applicationFeeAmount;
        }
        paymentParams.transfer_data = {
          destination: data.destinationAccountId,
        };
      }

      if (data.transferGroup) {
        paymentParams.transfer_group = data.transferGroup;
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create(paymentParams);

      // Get Stripe account ID for database
      const stripeAccountId = data.destinationAccountId ?
        await this.getStripeAccountId(data.destinationAccountId) : null;

      // Store in database
      const dbPayment = await prisma.payment.create({
        data: {
          stripePaymentIntentId: paymentIntent.id,
          customerId: dbCustomer.id,
          stripeAccountId,
          amount: data.amount,
          currency: data.currency || PAYMENT_CONFIG.DEFAULT_CURRENCY,
          description: data.description,
          status: this.mapPaymentStatus(paymentIntent.status),
          paymentMethod: data.paymentMethodId,
          applicationFee: data.applicationFeeAmount,
          orderId: data.metadata?.orderId,
          metadata: paymentIntent.metadata,
        },
      });

      return { paymentIntent, dbPayment };
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Confirm a payment intent
   */
  async confirmPayment(
    paymentIntentId: string,
    paymentMethodId?: string
  ): Promise<Stripe.PaymentIntent> {
    try {
      const confirmParams: Stripe.PaymentIntentConfirmParams = {};

      if (paymentMethodId) {
        confirmParams.payment_method = paymentMethodId;
      }

      const paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        confirmParams
      );

      // Update database
      await prisma.payment.update({
        where: { stripePaymentIntentId: paymentIntentId },
        data: {
          status: this.mapPaymentStatus(paymentIntent.status),
          paymentMethod: paymentMethodId || undefined,
          confirmedAt: paymentIntent.status === 'succeeded' ? new Date() : null,
        },
      });

      return paymentIntent;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Capture a payment intent (for manual confirmation)
   */
  async capturePayment(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);

      // Update database
      await prisma.payment.update({
        where: { stripePaymentIntentId: paymentIntentId },
        data: {
          status: this.mapPaymentStatus(paymentIntent.status),
          confirmedAt: paymentIntent.status === 'succeeded' ? new Date() : null,
        },
      });

      return paymentIntent;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Cancel a payment intent
   */
  async cancelPayment(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);

      // Update database
      await prisma.payment.update({
        where: { stripePaymentIntentId: paymentIntentId },
        data: {
          status: this.mapPaymentStatus(paymentIntent.status),
        },
      });

      return paymentIntent;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Create a refund
   */
  async createRefund(data: RefundData): Promise<{
    refund: Stripe.Refund;
    dbRefund: any;
  }> {
    try {
      // Get payment from database
      const dbPayment = await prisma.payment.findUnique({
        where: { id: data.paymentId },
      });

      if (!dbPayment || !dbPayment.stripeChargeId) {
        throw new StripeError('Payment not found or not charged', 'payment_not_found');
      }

      // Create refund
      const refund = await stripe.refunds.create({
        charge: dbPayment.stripeChargeId,
        amount: data.amount,
        reason: data.reason,
        metadata: data.metadata || {},
      });

      // Store in database
      const dbRefund = await prisma.refund.create({
        data: {
          stripeRefundId: refund.id,
          paymentId: data.paymentId,
          amount: refund.amount,
          currency: refund.currency,
          reason: data.reason,
          status: this.mapRefundStatus(refund.status),
          metadata: refund.metadata,
        },
      });

      // Update payment status
      const isFullRefund = refund.amount === dbPayment.amount;
      await prisma.payment.update({
        where: { id: data.paymentId },
        data: {
          status: isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });

      return { refund, dbRefund };
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Attach a payment method to a customer
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      // Store in database
      const dbCustomer = await prisma.customer.findUnique({
        where: { stripeCustomerId: customerId },
      });

      if (dbCustomer) {
        await prisma.paymentMethod.create({
          data: {
            stripePaymentMethodId: paymentMethod.id,
            customerId: dbCustomer.id,
            type: paymentMethod.type,
            card: paymentMethod.card ? JSON.stringify(paymentMethod.card) : undefined,
            billingDetails: paymentMethod.billing_details ? JSON.stringify(paymentMethod.billing_details) : undefined,
          },
        });
      }

      return paymentMethod;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Set default payment method for customer
   */
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<Stripe.Customer> {
    try {
      const customer = await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Update database
      await prisma.customer.update({
        where: { stripeCustomerId: customerId },
        data: { defaultPaymentMethod: paymentMethodId },
      });

      // Update payment method records
      await prisma.paymentMethod.updateMany({
        where: {
          customer: { stripeCustomerId: customerId },
        },
        data: { isDefault: false },
      });

      await prisma.paymentMethod.updateMany({
        where: {
          stripePaymentMethodId: paymentMethodId,
          customer: { stripeCustomerId: customerId },
        },
        data: { isDefault: true },
      });

      return customer;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * List customer payment methods
   */
  async listPaymentMethods(
    customerId: string,
    type?: 'card' | 'us_bank_account'
  ): Promise<Stripe.PaymentMethod[]> {
    try {
      const params: Stripe.PaymentMethodListParams = {
        customer: customerId,
        type: type || 'card',
      };

      const paymentMethods = await stripe.paymentMethods.list(params);
      return paymentMethods.data;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Update payment status from webhook
   */
  async updatePaymentFromWebhook(paymentIntentData: Stripe.PaymentIntent): Promise<void> {
    try {
      const updates: any = {
        status: this.mapPaymentStatus(paymentIntentData.status),
      };

      if (paymentIntentData.status === 'succeeded') {
        updates.confirmedAt = new Date();
        // Get charge ID from the latest charge
        if (paymentIntentData.latest_charge) {
          const chargeId = typeof paymentIntentData.latest_charge === 'string'
            ? paymentIntentData.latest_charge
            : paymentIntentData.latest_charge.id;
          updates.stripeChargeId = chargeId;

          // Get receipt URL
          const charge = await stripe.charges.retrieve(chargeId);
          if (charge.receipt_url) {
            updates.receiptUrl = charge.receipt_url;
          }
        }
      }

      if (paymentIntentData.status === 'payment_failed') {
        updates.failureCode = paymentIntentData.last_payment_error?.code;
        updates.failureMessage = paymentIntentData.last_payment_error?.message;
      }

      await prisma.payment.update({
        where: { stripePaymentIntentId: paymentIntentData.id },
        data: updates,
      });
    } catch (error) {
      console.error('Failed to update payment from webhook:', error);
    }
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['customer', 'payment_method'],
      });
      return paymentIntent;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Private helper methods
   */
  private mapPaymentStatus(stripeStatus: Stripe.PaymentIntent.Status): PaymentStatus {
    switch (stripeStatus) {
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return PaymentStatus.PENDING;
      case 'processing':
        return PaymentStatus.PROCESSING;
      case 'succeeded':
        return PaymentStatus.CONFIRMED;
      case 'requires_capture':
        return PaymentStatus.CONFIRMED; // For manual capture
      case 'canceled':
        return PaymentStatus.CANCELED;
      default:
        return PaymentStatus.FAILED;
    }
  }

  private mapRefundStatus(stripeStatus: Stripe.Refund.Status): RefundStatus {
    switch (stripeStatus) {
      case 'pending':
        return RefundStatus.PENDING;
      case 'succeeded':
        return RefundStatus.SUCCEEDED;
      case 'failed':
        return RefundStatus.FAILED;
      case 'canceled':
        return RefundStatus.CANCELED;
      default:
        return RefundStatus.FAILED;
    }
  }

  private async getStripeAccountId(stripeAccountId: string): Promise<string | null> {
    try {
      const account = await prisma.stripeAccount.findUnique({
        where: { stripeAccountId },
        select: { id: true },
      });
      return account?.id || null;
    } catch {
      return null;
    }
  }
}

export const paymentService = new PaymentService();