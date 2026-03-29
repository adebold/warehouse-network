/**
 * Security Dashboard API Route
 * Provides security metrics, alerts, and monitoring data for admin dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth-secure';
import { securityMonitor } from '@/lib/security/monitoring';
import { rateLimiter, getClientIP } from '@/lib/security/rate-limiter';
import { logSecurityEvent } from '@/lib/security/monitoring';

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

    // Check if user has admin privileges
    const isAdmin = session.user.roles?.some(role =>
      ['super-admin', 'platform-admin', 'security-admin'].includes(role.slug)
    );

    if (!isAdmin) {
      await logSecurityEvent('unauthorized_security_dashboard_access', 'high', {
        userId: session.user.id,
        ipAddress: clientIP,
        userRoles: session.user.roles?.map(r => r.slug),
      });

      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin privileges required' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '7');
    const includeAlerts = url.searchParams.get('alerts') === 'true';

    // Validate days parameter
    if (days < 1 || days > 90) {
      return NextResponse.json(
        { error: 'Invalid days parameter. Must be between 1 and 90' },
        { status: 400 }
      );
    }

    try {
      // Get security metrics
      const metrics = await securityMonitor.getSecurityMetrics(days);

      let alerts = [];
      if (includeAlerts) {
        alerts = await securityMonitor.getActiveAlerts();
      }

      // Log dashboard access
      await logSecurityEvent('security_dashboard_accessed', 'low', {
        userId: session.user.id,
        ipAddress: clientIP,
        daysRequested: days,
        includeAlerts,
      });

      return NextResponse.json({
        success: true,
        data: {
          metrics,
          alerts,
          generatedAt: new Date().toISOString(),
          period: {
            days,
            startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      await logSecurityEvent('security_dashboard_error', 'medium', {
        userId: session.user.id,
        ipAddress: clientIP,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return NextResponse.json(
        {
          error: 'Dashboard Error',
          message: 'Failed to retrieve security dashboard data',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Security dashboard API error:', error);

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}