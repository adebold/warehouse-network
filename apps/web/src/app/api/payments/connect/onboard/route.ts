/**
 * Stripe Connect Onboarding API Endpoint
 *
 * Creates Connect accounts and onboarding links for warehouse operators
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectService } from '@/lib/payments/connect';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const onboardAccountSchema = z.object({
  organizationId: z.string(),
  email: z.string().email(),
  country: z.string().optional(),
  businessType: z.enum(['individual', 'company']).optional(),
  businessProfile: z.object({
    name: z.string().optional(),
    url: z.string().url().optional(),
    description: z.string().optional(),
    mcc: z.string().optional(),
  }).optional(),
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
    const validatedData = onboardAccountSchema.parse(body);

    // Check if user has permission to manage this organization
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId: session.user.id,
        role: {
          organizationId: validatedData.organizationId,
          slug: { in: ['admin', 'owner', 'manager'] },
        },
      },
      include: {
        role: true,
      },
    });

    if (!userRole) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Check if organization already has a Stripe account
    const existingAccount = await prisma.stripeAccount.findUnique({
      where: { organizationId: validatedData.organizationId },
    });

    if (existingAccount) {
      // Refresh onboarding URL if account exists but not completed
      if (!existingAccount.detailsSubmitted) {
        const { onboardingUrl, expiresAt } = await connectService.refreshOnboardingUrl(
          validatedData.organizationId
        );

        return NextResponse.json({
          accountId: existingAccount.stripeAccountId,
          onboardingUrl,
          expiresAt,
          existing: true,
        });
      }

      return NextResponse.json(
        { error: 'Organization already has a completed Stripe account' },
        { status: 400 }
      );
    }

    // Create new Connect account
    const result = await connectService.createConnectAccount({
      organizationId: validatedData.organizationId,
      email: validatedData.email,
      country: validatedData.country,
      businessType: validatedData.businessType,
      businessProfile: validatedData.businessProfile,
    });

    return NextResponse.json({
      accountId: result.stripeAccountId,
      onboardingUrl: result.onboardingUrl,
      expiresAt: result.expiresAt,
      existing: false,
    });
  } catch (error) {
    console.error('Connect onboarding error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create Connect account' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';