/**
 * Stripe Connect Dashboard API Endpoint
 *
 * Provides access to Connect account dashboard links
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectService } from '@/lib/payments/connect';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const dashboardRequestSchema = z.object({
  organizationId: z.string(),
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
    const validatedData = dashboardRequestSchema.parse(body);

    // Check if user has permission to manage this organization
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId: session.user.id,
        role: {
          organizationId: validatedData.organizationId,
          slug: { in: ['admin', 'owner', 'manager'] },
        },
      },
    });

    if (!userRole) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get dashboard URL
    const dashboardUrl = await connectService.getDashboardUrl(validatedData.organizationId);

    return NextResponse.json({
      dashboardUrl,
    });
  } catch (error) {
    console.error('Connect dashboard error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to get dashboard URL' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';