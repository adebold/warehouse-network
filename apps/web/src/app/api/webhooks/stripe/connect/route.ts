/**
 * Stripe Connect Webhook Endpoint
 *
 * Handles webhook events from Stripe Connect accounts including:
 * - Connect account status updates
 * - Capability changes
 * - Payout events
 * - Connect account payments
 */

import { NextRequest, NextResponse } from 'next/server';
import { webhookService } from '@/lib/payments/webhooks';

export async function POST(request: NextRequest) {
  try {
    const result = await webhookService.processWebhook(request, true);

    if (!result.success) {
      console.error('Connect webhook processing failed:', result.error);
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
    console.error('Connect webhook endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Disable body parsing for webhook signature verification
export const dynamic = 'force-dynamic';
export const revalidate = 0;