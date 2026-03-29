/**
 * Security Alerts Management API Route
 * Handles security alert acknowledgment, resolution, and management
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth-secure';
import { securityMonitor } from '@/lib/security/monitoring';
import { rateLimiter, getClientIP } from '@/lib/security/rate-limiter';
import { logSecurityEvent } from '@/lib/security/monitoring';
import { z } from 'zod';

const AlertActionSchema = z.object({
  action: z.enum(['acknowledge', 'resolve']),
  alertId: z.string().uuid(),
  resolution: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request);

  try {
    // Rate limiting
    const rateLimitResult = await rateLimiter.checkApiLimit(clientIP);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429 }
      );
    }

    // Check authentication and authorization
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const isAdmin = session.user.roles?.some(role =>
      ['super-admin', 'platform-admin', 'security-admin'].includes(role.slug)
    );

    if (!isAdmin) {
      await logSecurityEvent('unauthorized_security_alerts_access', 'high', {
        userId: session.user.id,
        ipAddress: clientIP,
      });

      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Get active alerts
    const alerts = await securityMonitor.getActiveAlerts();

    return NextResponse.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error('Security alerts API error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  try {
    // Rate limiting
    const rateLimitResult = await rateLimiter.checkApiLimit(clientIP);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429 }
      );
    }

    // Check authentication and authorization
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const isAdmin = session.user.roles?.some(role =>
      ['super-admin', 'platform-admin', 'security-admin'].includes(role.slug)
    );

    if (!isAdmin) {
      await logSecurityEvent('unauthorized_security_alert_action', 'high', {
        userId: session.user.id,
        ipAddress: clientIP,
      });

      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = AlertActionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          errors: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { action, alertId, resolution } = validation.data;
    const userId = session.user.id;

    try {
      switch (action) {
        case 'acknowledge':
          await securityMonitor.acknowledgeAlert(alertId, userId);

          await logSecurityEvent('security_alert_acknowledged', 'low', {
            userId,
            ipAddress: clientIP,
            alertId,
          });

          return NextResponse.json({
            success: true,
            message: 'Alert acknowledged successfully',
          });

        case 'resolve':
          await securityMonitor.resolveAlert(alertId, userId, resolution);

          await logSecurityEvent('security_alert_resolved', 'low', {
            userId,
            ipAddress: clientIP,
            alertId,
            resolution,
          });

          return NextResponse.json({
            success: true,
            message: 'Alert resolved successfully',
          });

        default:
          return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
          );
      }
    } catch (error) {
      await logSecurityEvent('security_alert_action_error', 'medium', {
        userId,
        ipAddress: clientIP,
        action,
        alertId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return NextResponse.json(
        {
          error: 'Action Failed',
          message: `Failed to ${action} alert`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Security alert action API error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}