/**
 * Webhook Service Tests
 *
 * Tests for secure webhook processing including:
 * - Webhook signature validation
 * - Event deduplication
 * - Event processing for different types
 * - Error handling and retry logic
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebhookService } from '../webhooks';
import { prismaMock } from '@/lib/__mocks__/prisma';
import { NextRequest } from 'next/server';

// Mock Stripe webhook validation
jest.mock('../stripe', () => ({
  validateWebhookSignature: jest.fn(),
  handleStripeError: jest.fn((error) => error),
}));

const { validateWebhookSignature } = require('../stripe');

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let mockRequest: Partial<NextRequest>;

  beforeEach(() => {
    webhookService = new WebhookService();
    mockRequest = {
      text: jest.fn(),
      headers: {
        get: jest.fn(),
      },
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('processWebhook', () => {
    it('should process webhook successfully', async () => {
      const mockEvent = {
        id: 'evt_test123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test123',
            status: 'succeeded',
          },
        },
      };

      (mockRequest.text as jest.Mock).mockResolvedValue('webhook_body');
      (mockRequest.headers!.get as jest.Mock).mockReturnValue('stripe_signature');
      validateWebhookSignature.mockReturnValue(mockEvent);
      prismaMock.webhookEvent.findUnique.mockResolvedValue(null);
      prismaMock.webhookEvent.create.mockResolvedValue({
        id: 'webhook-123',
        stripeEventId: mockEvent.id,
        eventType: mockEvent.type,
        processed: false,
        retryCount: 0,
      });
      prismaMock.webhookEvent.update.mockResolvedValue({});
      prismaMock.payment.update.mockResolvedValue({});

      const result = await webhookService.processWebhook(mockRequest as NextRequest);

      expect(validateWebhookSignature).toHaveBeenCalledWith(
        'webhook_body',
        'stripe_signature',
        process.env.STRIPE_WEBHOOK_SECRET
      );

      expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith({
        data: {
          stripeEventId: mockEvent.id,
          eventType: mockEvent.type,
          data: mockEvent.data,
          processed: false,
          stripeAccountId: null,
        },
      });

      expect(result).toEqual({
        success: true,
        eventId: mockEvent.id,
        eventType: mockEvent.type,
        processed: true,
      });
    });

    it('should handle duplicate events', async () => {
      const mockEvent = {
        id: 'evt_test123',
        type: 'payment_intent.succeeded',
        data: {},
      };

      (mockRequest.text as jest.Mock).mockResolvedValue('webhook_body');
      (mockRequest.headers!.get as jest.Mock).mockReturnValue('stripe_signature');
      validateWebhookSignature.mockReturnValue(mockEvent);
      prismaMock.webhookEvent.findUnique.mockResolvedValue({
        id: 'webhook-123',
        stripeEventId: mockEvent.id,
        processed: true,
      });

      const result = await webhookService.processWebhook(mockRequest as NextRequest);

      expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        eventId: mockEvent.id,
        eventType: mockEvent.type,
        processed: true,
      });
    });

    it('should handle processing errors gracefully', async () => {
      const mockEvent = {
        id: 'evt_test123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test123',
            status: 'succeeded',
          },
        },
      };

      const webhookEventRecord = {
        id: 'webhook-123',
        stripeEventId: mockEvent.id,
        eventType: mockEvent.type,
        processed: false,
        retryCount: 0,
        processingErrors: [],
      };

      (mockRequest.text as jest.Mock).mockResolvedValue('webhook_body');
      (mockRequest.headers!.get as jest.Mock).mockReturnValue('stripe_signature');
      validateWebhookSignature.mockReturnValue(mockEvent);
      prismaMock.webhookEvent.findUnique.mockResolvedValue(null);
      prismaMock.webhookEvent.create.mockResolvedValue(webhookEventRecord);
      prismaMock.webhookEvent.update
        .mockRejectedValueOnce(new Error('Processing failed')) // First call (mark as processed)
        .mockResolvedValueOnce({}); // Second call (log error)
      prismaMock.webhookEvent.findUnique.mockResolvedValueOnce(webhookEventRecord);
      prismaMock.payment.update.mockRejectedValue(new Error('Database error'));

      const result = await webhookService.processWebhook(mockRequest as NextRequest);

      expect(result).toEqual({
        success: true,
        eventId: mockEvent.id,
        eventType: mockEvent.type,
        processed: false,
        error: 'Database error',
      });
    });

    it('should fail for missing signature', async () => {
      (mockRequest.text as jest.Mock).mockResolvedValue('webhook_body');
      (mockRequest.headers!.get as jest.Mock).mockReturnValue(null);

      const result = await webhookService.processWebhook(mockRequest as NextRequest);

      expect(result).toEqual({
        success: false,
        eventId: '',
        eventType: '',
        processed: false,
        error: 'Missing stripe-signature header',
      });
    });

    it('should fail for invalid signature', async () => {
      (mockRequest.text as jest.Mock).mockResolvedValue('webhook_body');
      (mockRequest.headers!.get as jest.Mock).mockReturnValue('invalid_signature');
      validateWebhookSignature.mockImplementation(() => {
        throw new Error('Invalid webhook signature');
      });

      const result = await webhookService.processWebhook(mockRequest as NextRequest);

      expect(result).toEqual({
        success: false,
        eventId: '',
        eventType: '',
        processed: false,
        error: 'Invalid webhook signature',
      });
    });
  });

  describe('handleEvent', () => {
    it('should handle customer.created event', async () => {
      const customerEvent = {
        id: 'evt_test123',
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_test123',
            email: 'test@example.com',
            name: 'Test Customer',
            metadata: { userId: 'user-123' },
          },
        },
      };

      prismaMock.customer.upsert.mockResolvedValue({});

      // Access private method for testing
      await (webhookService as any).handleEvent(customerEvent);

      expect(prismaMock.customer.upsert).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_test123' },
        update: {
          email: 'test@example.com',
          name: 'Test Customer',
          phone: undefined,
          address: undefined,
          defaultPaymentMethod: undefined,
          metadata: { userId: 'user-123' },
        },
        create: {
          stripeCustomerId: 'cus_test123',
          email: 'test@example.com',
          name: 'Test Customer',
          phone: undefined,
          address: undefined,
          defaultPaymentMethod: undefined,
          metadata: { userId: 'user-123' },
          userId: 'user-123',
          organizationId: undefined,
        },
      });
    });

    it('should handle payment_method.attached event', async () => {
      const paymentMethodEvent = {
        id: 'evt_test123',
        type: 'payment_method.attached',
        data: {
          object: {
            id: 'pm_test123',
            type: 'card',
            customer: 'cus_test456',
            card: { brand: 'visa', last4: '4242' },
            billing_details: {},
          },
        },
      };

      const mockCustomer = {
        id: 'db-cus-123',
        stripeCustomerId: 'cus_test456',
      };

      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer as any);
      prismaMock.paymentMethod.upsert.mockResolvedValue({});

      await (webhookService as any).handleEvent(paymentMethodEvent);

      expect(prismaMock.paymentMethod.upsert).toHaveBeenCalledWith({
        where: { stripePaymentMethodId: 'pm_test123' },
        update: {
          type: 'card',
          card: JSON.stringify({ brand: 'visa', last4: '4242' }),
          billingDetails: JSON.stringify({}),
        },
        create: {
          stripePaymentMethodId: 'pm_test123',
          customerId: mockCustomer.id,
          type: 'card',
          card: JSON.stringify({ brand: 'visa', last4: '4242' }),
          billingDetails: JSON.stringify({}),
        },
      });
    });

    it('should handle subscription events', async () => {
      const subscriptionEvent = {
        id: 'evt_test123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            status: 'active',
            current_period_start: 1640995200,
            current_period_end: 1643673600,
            cancel_at_period_end: false,
            metadata: {},
          },
        },
      };

      // Mock the subscription service method
      const mockSubscriptionService = {
        updateSubscriptionFromWebhook: jest.fn(),
      };

      // Replace the service import temporarily
      jest.doMock('../subscriptions', () => ({
        subscriptionService: mockSubscriptionService,
      }));

      await (webhookService as any).handleEvent(subscriptionEvent);

      expect(mockSubscriptionService.updateSubscriptionFromWebhook).toHaveBeenCalledWith(
        subscriptionEvent.data.object
      );
    });
  });

  describe('retryFailedEvents', () => {
    it('should retry failed webhook events', async () => {
      const failedEvents = [
        {
          id: 'webhook-123',
          stripeEventId: 'evt_test123',
          eventType: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test123',
              status: 'succeeded',
            },
          },
          processed: false,
          retryCount: 1,
          stripeAccountId: null,
        },
      ];

      prismaMock.webhookEvent.findMany.mockResolvedValue(failedEvents as any);
      prismaMock.webhookEvent.update.mockResolvedValue({});
      prismaMock.payment.update.mockResolvedValue({});

      await webhookService.retryFailedEvents(5);

      expect(prismaMock.webhookEvent.findMany).toHaveBeenCalledWith({
        where: {
          processed: false,
          retryCount: { lt: 5 },
        },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });

      expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'webhook-123' },
        data: {
          processed: true,
          processedAt: expect.any(Date),
        },
      });
    });

    it('should handle retry failures', async () => {
      const failedEvents = [
        {
          id: 'webhook-123',
          stripeEventId: 'evt_test123',
          eventType: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test123',
              status: 'succeeded',
            },
          },
          processed: false,
          retryCount: 1,
          processingErrors: [],
          stripeAccountId: null,
        },
      ];

      prismaMock.webhookEvent.findMany.mockResolvedValue(failedEvents as any);
      prismaMock.payment.update.mockRejectedValue(new Error('Still failing'));
      prismaMock.webhookEvent.findUnique.mockResolvedValue(failedEvents[0] as any);
      prismaMock.webhookEvent.update.mockResolvedValue({});

      // Should not throw, but handle gracefully
      await expect(webhookService.retryFailedEvents(5)).resolves.not.toThrow();

      // Should log the processing error
      expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'webhook-123' },
        data: {
          processingErrors: expect.arrayContaining([
            expect.objectContaining({
              error: 'Still failing',
            }),
          ]),
          retryCount: 2,
        },
      });
    });
  });
});