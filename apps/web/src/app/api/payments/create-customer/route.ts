/**
 * Create Customer API Endpoint
 *
 * Creates or retrieves a Stripe customer for payment processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { paymentService } from '@/lib/payments/payments';
import { z } from 'zod';

const createCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  organizationId: z.string().optional(),
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
    const validatedData = createCustomerSchema.parse(body);

    // Create or retrieve customer
    const { customer, dbCustomer } = await paymentService.createCustomer({
      email: validatedData.email,
      name: validatedData.name,
      phone: validatedData.phone,
      address: validatedData.address,
      organizationId: validatedData.organizationId,
      userId: session.user.id,
      metadata: {
        ...validatedData.metadata,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      defaultPaymentMethod: customer.invoice_settings?.default_payment_method,
    });
  } catch (error) {
    console.error('Create customer error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';