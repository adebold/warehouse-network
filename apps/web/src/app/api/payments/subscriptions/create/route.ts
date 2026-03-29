/**
 * Create Subscription API Endpoint
 *
 * Creates a new subscription for warehouse storage fees or other services
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { subscriptionService } from '@/lib/payments/subscriptions';
import { z } from 'zod';

const createSubscriptionSchema = z.object({
  customerId: z.string(),
  priceId: z.string(),
  stripeAccountId: z.string().optional(),
  trialPeriodDays: z.number().optional(),
  promotionCode: z.string().optional(),
  defaultPaymentMethod: z.string().optional(),
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
    const validatedData = createSubscriptionSchema.parse(body);

    // Create subscription
    const { subscription, clientSecret } = await subscriptionService.createSubscription({
      customerId: validatedData.customerId,
      priceId: validatedData.priceId,
      stripeAccountId: validatedData.stripeAccountId,
      trialPeriodDays: validatedData.trialPeriodDays,
      promotionCode: validatedData.promotionCode,
      defaultPaymentMethod: validatedData.defaultPaymentMethod,
      metadata: {
        ...validatedData.metadata,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      trialEnd: subscription.trial_end,
    });
  } catch (error) {
    console.error('Create subscription error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';