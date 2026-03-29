/**
 * Create Payment Intent API Endpoint
 *
 * Creates a Stripe Payment Intent for processing payments
 * Supports both direct payments and marketplace payments with Connect
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { paymentService } from '@/lib/payments/payments';
import { z } from 'zod';

const createPaymentSchema = z.object({
  amount: z.number().min(50), // Minimum $0.50
  currency: z.string().optional().default('usd'),
  description: z.string().optional(),
  customerId: z.string(),
  paymentMethodId: z.string().optional(),
  receiptEmail: z.string().email().optional(),
  shipping: z.object({
    name: z.string(),
    address: z.object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      state: z.string(),
      postal_code: z.string(),
      country: z.string(),
    }),
  }).optional(),
  // Marketplace options
  destinationAccountId: z.string().optional(),
  applicationFeeAmount: z.number().optional(),
  transferGroup: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createPaymentSchema.parse(body);

    // Create payment intent
    const { paymentIntent, dbPayment } = await paymentService.createPayment({
      customerId: validatedData.customerId,
      amount: validatedData.amount,
      currency: validatedData.currency,
      description: validatedData.description,
      paymentMethodId: validatedData.paymentMethodId,
      receiptEmail: validatedData.receiptEmail,
      shipping: validatedData.shipping,
      destinationAccountId: validatedData.destinationAccountId,
      applicationFeeAmount: validatedData.applicationFeeAmount,
      transferGroup: validatedData.transferGroup,
      metadata: {
        ...validatedData.metadata,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';