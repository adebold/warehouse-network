/**
 * Stripe Main Account Webhook Endpoint
 *
 * Handles webhook events from the main Stripe account including:
 * - Customer lifecycle events
 * - Payment intent updates
 * - Subscription changes
 * - Invoice payments
 * - Payment method updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { webhookService } from '@/lib/payments/webhooks';

export async function POST(request: NextRequest) {
  try {
    const result = await webhookService.processWebhook(request, false);

    if (!result.success) {
      console.error('Webhook processing failed:', result.error);
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      received: true,
      eventId: result.eventId,
      eventType: result.eventType,
      processed: result.processed,
    });
  } catch (error) {
    console.error('Webhook endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Disable body parsing for webhook signature verification
export const dynamic = 'force-dynamic';
export const revalidate = 0;