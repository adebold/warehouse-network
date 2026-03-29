/**
 * Payment Service Tests
 *
 * Comprehensive tests for payment processing functionality including:
 * - Customer creation and management
 * - Payment intent creation and confirmation
 * - Payment method handling
 * - Refund processing
 * - Error handling scenarios
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PaymentService } from '../payments';
import { prismaMock } from '@/lib/__mocks__/prisma';

// Mock Stripe
const mockStripe = {
  customers: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
  },
  paymentIntents: {
    create: jest.fn(),
    confirm: jest.fn(),
    capture: jest.fn(),
    cancel: jest.fn(),
    retrieve: jest.fn(),
  },
  paymentMethods: {
    attach: jest.fn(),
    list: jest.fn(),
  },
  refunds: {
    create: jest.fn(),
  },
  charges: {
    retrieve: jest.fn(),
  },
};

jest.mock('../stripe', () => ({
  stripe: mockStripe,
  handleStripeError: jest.fn((error) => error),
  PAYMENT_CONFIG: {
    DEFAULT_CURRENCY: 'usd',
    PAYMENT_METHOD_TYPES: ['card'],
  },
}));

describe('PaymentService', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    paymentService = new PaymentService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createCustomer', () => {
    it('should create a new customer when none exists', async () => {
      const customerData = {
        email: 'test@example.com',
        name: 'Test Customer',
        phone: '+1234567890',
        userId: 'user-123',
      };

      const mockStripeCustomer = {
        id: 'cus_test123',
        email: customerData.email,
        name: customerData.name,
        phone: customerData.phone,
        metadata: {},
      };

      const mockDbCustomer = {
        id: 'db-cus-123',
        stripeCustomerId: mockStripeCustomer.id,
        ...customerData,
      };

      prismaMock.customer.findUnique.mockResolvedValue(null);
      mockStripe.customers.create.mockResolvedValue(mockStripeCustomer);
      prismaMock.customer.create.mockResolvedValue(mockDbCustomer);

      const result = await paymentService.createCustomer(customerData);

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: customerData.email,
        name: customerData.name,
        phone: customerData.phone,
        address: undefined,
        metadata: {
          userId: customerData.userId,
          organizationId: '',
        },
      });

      expect(prismaMock.customer.create).toHaveBeenCalledWith({
        data: {
          stripeCustomerId: mockStripeCustomer.id,
          email: customerData.email,
          name: customerData.name,
          phone: customerData.phone,
          address: undefined,
          userId: customerData.userId,
          organizationId: undefined,
          metadata: mockStripeCustomer.metadata,
        },
      });

      expect(result).toEqual({
        customer: mockStripeCustomer,
        dbCustomer: mockDbCustomer,
      });
    });

    it('should retrieve existing customer and update if needed', async () => {
      const customerData = {
        email: 'test@example.com',
        name: 'Updated Name',
        userId: 'user-123',
      };

      const existingDbCustomer = {
        id: 'db-cus-123',
        stripeCustomerId: 'cus_test123',
        email: customerData.email,
        name: 'Old Name',
        userId: customerData.userId,
      };

      const mockStripeCustomer = {
        id: 'cus_test123',
        email: customerData.email,
        name: 'Old Name',
        metadata: {},
      };

      const updatedStripeCustomer = {
        ...mockStripeCustomer,
        name: customerData.name,
      };

      prismaMock.customer.findUnique.mockResolvedValue(existingDbCustomer as any);
      mockStripe.customers.retrieve.mockResolvedValue(mockStripeCustomer);
      mockStripe.customers.update.mockResolvedValue(updatedStripeCustomer);

      const result = await paymentService.createCustomer(customerData);

      expect(mockStripe.customers.update).toHaveBeenCalledWith('cus_test123', {
        name: customerData.name,
        phone: undefined,
        address: undefined,
        metadata: {},
      });

      expect(result.customer).toEqual(updatedStripeCustomer);
    });
  });

  describe('createPayment', () => {
    it('should create a payment intent successfully', async () => {
      const paymentData = {
        customerId: 'cus_test123',
        amount: 2000,
        currency: 'usd',
        description: 'Test payment',
      };

      const mockDbCustomer = {
        id: 'db-cus-123',
        stripeCustomerId: 'cus_test123',
        email: 'test@example.com',
      };

      const mockPaymentIntent = {
        id: 'pi_test123',
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: 'requires_payment_method',
        metadata: {},
      };

      const mockDbPayment = {
        id: 'db-pay-123',
        stripePaymentIntentId: mockPaymentIntent.id,
        customerId: mockDbCustomer.id,
        amount: paymentData.amount,
      };

      prismaMock.customer.findUnique.mockResolvedValue(mockDbCustomer as any);
      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);
      prismaMock.payment.create.mockResolvedValue(mockDbPayment as any);

      const result = await paymentService.createPayment(paymentData);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: paymentData.amount,
        currency: paymentData.currency,
        customer: paymentData.customerId,
        description: paymentData.description,
        receipt_email: undefined,
        shipping: undefined,
        metadata: {},
        automatic_payment_methods: { enabled: true },
      });

      expect(result).toEqual({
        paymentIntent: mockPaymentIntent,
        dbPayment: mockDbPayment,
      });
    });

    it('should create marketplace payment with application fee', async () => {
      const paymentData = {
        customerId: 'cus_test123',
        amount: 2000,
        destinationAccountId: 'acct_test456',
        applicationFeeAmount: 100,
      };

      const mockDbCustomer = {
        id: 'db-cus-123',
        stripeCustomerId: 'cus_test123',
      };

      const mockPaymentIntent = {
        id: 'pi_test123',
        amount: paymentData.amount,
        currency: 'usd',
        status: 'requires_payment_method',
        metadata: {},
      };

      prismaMock.customer.findUnique.mockResolvedValue(mockDbCustomer as any);
      prismaMock.stripeAccount.findUnique.mockResolvedValue({ id: 'stripe-acc-123' } as any);
      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);
      prismaMock.payment.create.mockResolvedValue({
        id: 'db-pay-123',
        stripePaymentIntentId: mockPaymentIntent.id,
      } as any);

      await paymentService.createPayment(paymentData);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          application_fee_amount: paymentData.applicationFeeAmount,
          transfer_data: {
            destination: paymentData.destinationAccountId,
          },
        })
      );
    });

    it('should throw error if customer not found', async () => {
      const paymentData = {
        customerId: 'cus_nonexistent',
        amount: 2000,
      };

      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(paymentService.createPayment(paymentData)).rejects.toThrow();
    });
  });

  describe('confirmPayment', () => {
    it('should confirm payment intent successfully', async () => {
      const paymentIntentId = 'pi_test123';
      const paymentMethodId = 'pm_test456';

      const mockConfirmedPaymentIntent = {
        id: paymentIntentId,
        status: 'succeeded',
      };

      mockStripe.paymentIntents.confirm.mockResolvedValue(mockConfirmedPaymentIntent);
      prismaMock.payment.update.mockResolvedValue({} as any);

      const result = await paymentService.confirmPayment(paymentIntentId, paymentMethodId);

      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      expect(prismaMock.payment.update).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: paymentIntentId },
        data: {
          status: 'CONFIRMED',
          paymentMethod: paymentMethodId,
          confirmedAt: expect.any(Date),
        },
      });

      expect(result).toEqual(mockConfirmedPaymentIntent);
    });
  });

  describe('createRefund', () => {
    it('should create refund successfully', async () => {
      const refundData = {
        paymentId: 'db-pay-123',
        amount: 1000,
        reason: 'requested_by_customer' as const,
      };

      const mockDbPayment = {
        id: refundData.paymentId,
        stripeChargeId: 'ch_test123',
        amount: 2000,
      };

      const mockRefund = {
        id: 're_test123',
        amount: refundData.amount,
        currency: 'usd',
        status: 'succeeded',
        metadata: {},
      };

      const mockDbRefund = {
        id: 'db-ref-123',
        stripeRefundId: mockRefund.id,
        paymentId: refundData.paymentId,
      };

      prismaMock.payment.findUnique.mockResolvedValue(mockDbPayment as any);
      mockStripe.refunds.create.mockResolvedValue(mockRefund);
      prismaMock.refund.create.mockResolvedValue(mockDbRefund as any);
      prismaMock.payment.update.mockResolvedValue({} as any);

      const result = await paymentService.createRefund(refundData);

      expect(mockStripe.refunds.create).toHaveBeenCalledWith({
        charge: mockDbPayment.stripeChargeId,
        amount: refundData.amount,
        reason: refundData.reason,
        metadata: {},
      });

      expect(result).toEqual({
        refund: mockRefund,
        dbRefund: mockDbRefund,
      });
    });

    it('should update payment status to REFUNDED for full refund', async () => {
      const refundData = {
        paymentId: 'db-pay-123',
        amount: 2000, // Full amount
      };

      const mockDbPayment = {
        id: refundData.paymentId,
        stripeChargeId: 'ch_test123',
        amount: 2000,
      };

      const mockRefund = {
        id: 're_test123',
        amount: refundData.amount,
        currency: 'usd',
        status: 'succeeded',
        metadata: {},
      };

      prismaMock.payment.findUnique.mockResolvedValue(mockDbPayment as any);
      mockStripe.refunds.create.mockResolvedValue(mockRefund);
      prismaMock.refund.create.mockResolvedValue({} as any);
      prismaMock.payment.update.mockResolvedValue({} as any);

      await paymentService.createRefund(refundData);

      expect(prismaMock.payment.update).toHaveBeenCalledWith({
        where: { id: refundData.paymentId },
        data: { status: 'REFUNDED' },
      });
    });

    it('should update payment status to PARTIALLY_REFUNDED for partial refund', async () => {
      const refundData = {
        paymentId: 'db-pay-123',
        amount: 1000, // Partial amount
      };

      const mockDbPayment = {
        id: refundData.paymentId,
        stripeChargeId: 'ch_test123',
        amount: 2000,
      };

      const mockRefund = {
        id: 're_test123',
        amount: refundData.amount,
        currency: 'usd',
        status: 'succeeded',
        metadata: {},
      };

      prismaMock.payment.findUnique.mockResolvedValue(mockDbPayment as any);
      mockStripe.refunds.create.mockResolvedValue(mockRefund);
      prismaMock.refund.create.mockResolvedValue({} as any);
      prismaMock.payment.update.mockResolvedValue({} as any);

      await paymentService.createRefund(refundData);

      expect(prismaMock.payment.update).toHaveBeenCalledWith({
        where: { id: refundData.paymentId },
        data: { status: 'PARTIALLY_REFUNDED' },
      });
    });
  });

  describe('attachPaymentMethod', () => {
    it('should attach payment method to customer', async () => {
      const paymentMethodId = 'pm_test123';
      const customerId = 'cus_test456';

      const mockPaymentMethod = {
        id: paymentMethodId,
        type: 'card',
        card: { brand: 'visa', last4: '4242' },
        billing_details: {},
      };

      const mockDbCustomer = {
        id: 'db-cus-123',
        stripeCustomerId: customerId,
      };

      mockStripe.paymentMethods.attach.mockResolvedValue(mockPaymentMethod);
      prismaMock.customer.findUnique.mockResolvedValue(mockDbCustomer as any);
      prismaMock.paymentMethod.create.mockResolvedValue({} as any);

      const result = await paymentService.attachPaymentMethod(paymentMethodId, customerId);

      expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith(paymentMethodId, {
        customer: customerId,
      });

      expect(prismaMock.paymentMethod.create).toHaveBeenCalledWith({
        data: {
          stripePaymentMethodId: paymentMethodId,
          customerId: mockDbCustomer.id,
          type: mockPaymentMethod.type,
          card: JSON.stringify(mockPaymentMethod.card),
          billingDetails: JSON.stringify(mockPaymentMethod.billing_details),
        },
      });

      expect(result).toEqual(mockPaymentMethod);
    });
  });

  describe('updatePaymentFromWebhook', () => {
    it('should update payment status from succeeded webhook', async () => {
      const paymentIntentData = {
        id: 'pi_test123',
        status: 'succeeded' as const,
        latest_charge: 'ch_test456',
      };

      const mockCharge = {
        id: 'ch_test456',
        receipt_url: 'https://stripe.com/receipt/test',
      };

      mockStripe.charges.retrieve.mockResolvedValue(mockCharge);
      prismaMock.payment.update.mockResolvedValue({} as any);

      await paymentService.updatePaymentFromWebhook(paymentIntentData as any);

      expect(prismaMock.payment.update).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: paymentIntentData.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: expect.any(Date),
          stripeChargeId: 'ch_test456',
          receiptUrl: mockCharge.receipt_url,
        },
      });
    });

    it('should update payment status from failed webhook', async () => {
      const paymentIntentData = {
        id: 'pi_test123',
        status: 'payment_failed' as const,
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined.',
        },
      };

      prismaMock.payment.update.mockResolvedValue({} as any);

      await paymentService.updatePaymentFromWebhook(paymentIntentData as any);

      expect(prismaMock.payment.update).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: paymentIntentData.id },
        data: {
          status: 'FAILED',
          failureCode: 'card_declined',
          failureMessage: 'Your card was declined.',
        },
      });
    });
  });
});