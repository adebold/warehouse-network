/**
 * 2FA Setup API Route
 * Handles two-factor authentication setup for users
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth-secure';
import { twoFactorAuth } from '@/lib/security/two-factor';
import { rateLimiter, getClientIP } from '@/lib/security/rate-limiter';
import { validateRequest, ValidationSchemas } from '@/lib/security/input-validation';
import { logSecurityEvent } from '@/lib/security/monitoring';
import { z } from 'zod';

const SetupSchema = z.object({
  action: z.enum(['setup', 'verify', 'disable', 'regenerate-backup-codes']),
  token: z.string().optional(),
  password: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  try {
    // Rate limiting for 2FA operations
    const rateLimitResult = await rateLimiter.checkTwoFactorLimit(clientIP);
    if (!rateLimitResult.allowed) {
      await logSecurityEvent('rate_limit_exceeded', 'medium', {
        ipAddress: clientIP,
        resource: '/api/auth/2fa/setup',
        type: 'rate_limit_exceeded',
      });

      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded for 2FA operations',
        },
        { status: 429 }
      );
    }

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = SetupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          errors: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { action, token, password } = validation.data;
    const userId = session.user.id;

    switch (action) {
      case 'setup':
        try {
          const setupResult = await twoFactorAuth.setupTwoFactor(
            userId,
            session.user.email
          );

          await logSecurityEvent('two_factor_setup_initiated', 'low', {
            userId,
            ipAddress: clientIP,
            userAgent: request.headers.get('user-agent') || undefined,
          });

          // Don't return the secret in the response for security
          const { secret, ...safeResult } = setupResult;

          return NextResponse.json({
            success: true,
            data: safeResult,
          });
        } catch (error) {
          await logSecurityEvent('two_factor_setup_failed', 'medium', {
            userId,
            ipAddress: clientIP,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          return NextResponse.json(
            {
              error: 'Setup Failed',
              message: 'Failed to set up two-factor authentication',
            },
            { status: 500 }
          );
        }

      case 'verify':
        if (!token) {
          return NextResponse.json(
            {
              error: 'Validation Error',
              message: '2FA token is required',
            },
            { status: 400 }
          );
        }

        // Validate token format
        const tokenValidation = ValidationSchemas.twoFactorToken.safeParse(token);
        if (!tokenValidation.success) {
          return NextResponse.json(
            {
              error: 'Validation Error',
              message: 'Invalid 2FA token format',
            },
            { status: 400 }
          );
        }

        try {
          const isEnabled = await twoFactorAuth.enableTwoFactor(userId, token);

          if (isEnabled) {
            await logSecurityEvent('two_factor_enabled', 'low', {
              userId,
              ipAddress: clientIP,
              userAgent: request.headers.get('user-agent') || undefined,
            });

            return NextResponse.json({
              success: true,
              message: 'Two-factor authentication enabled successfully',
            });
          } else {
            await logSecurityEvent('two_factor_verification_failed', 'medium', {
              userId,
              ipAddress: clientIP,
              reason: 'invalid_token',
            });

            return NextResponse.json(
              {
                error: 'Verification Failed',
                message: 'Invalid 2FA token',
              },
              { status: 400 }
            );
          }
        } catch (error) {
          await logSecurityEvent('two_factor_enable_error', 'medium', {
            userId,
            ipAddress: clientIP,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          return NextResponse.json(
            {
              error: 'Enable Failed',
              message: 'Failed to enable two-factor authentication',
            },
            { status: 500 }
          );
        }

      case 'disable':
        if (!password) {
          return NextResponse.json(
            {
              error: 'Validation Error',
              message: 'Password is required to disable 2FA',
            },
            { status: 400 }
          );
        }

        try {
          const isDisabled = await twoFactorAuth.disableTwoFactor(userId, password);

          if (isDisabled) {
            await logSecurityEvent('two_factor_disabled', 'medium', {
              userId,
              ipAddress: clientIP,
              userAgent: request.headers.get('user-agent') || undefined,
            });

            return NextResponse.json({
              success: true,
              message: 'Two-factor authentication disabled successfully',
            });
          } else {
            await logSecurityEvent('two_factor_disable_failed', 'medium', {
              userId,
              ipAddress: clientIP,
              reason: 'invalid_password',
            });

            return NextResponse.json(
              {
                error: 'Disable Failed',
                message: 'Invalid password',
              },
              { status: 400 }
            );
          }
        } catch (error) {
          await logSecurityEvent('two_factor_disable_error', 'medium', {
            userId,
            ipAddress: clientIP,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          return NextResponse.json(
            {
              error: 'Disable Failed',
              message: 'Failed to disable two-factor authentication',
            },
            { status: 500 }
          );
        }

      case 'regenerate-backup-codes':
        if (!password) {
          return NextResponse.json(
            {
              error: 'Validation Error',
              message: 'Password is required to regenerate backup codes',
            },
            { status: 400 }
          );
        }

        try {
          const backupCodes = await twoFactorAuth.regenerateBackupCodes(userId, password);

          await logSecurityEvent('two_factor_backup_codes_regenerated', 'low', {
            userId,
            ipAddress: clientIP,
            userAgent: request.headers.get('user-agent') || undefined,
          });

          return NextResponse.json({
            success: true,
            data: { backupCodes },
            message: 'Backup codes regenerated successfully',
          });
        } catch (error) {
          await logSecurityEvent('two_factor_backup_codes_regeneration_failed', 'medium', {
            userId,
            ipAddress: clientIP,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          return NextResponse.json(
            {
              error: 'Regeneration Failed',
              message: error instanceof Error ? error.message : 'Failed to regenerate backup codes',
            },
            { status: 500 }
          );
        }

      default:
        return NextResponse.json(
          {
            error: 'Invalid Action',
            message: 'Invalid action specified',
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('2FA setup API error:', error);

    await logSecurityEvent('two_factor_api_error', 'high', {
      userId: session?.user?.id,
      ipAddress: clientIP,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

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

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get 2FA status
    const status = await twoFactorAuth.getTwoFactorStatus(session.user.id);

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('2FA status API error:', error);

    await logSecurityEvent('two_factor_status_error', 'medium', {
      userId: session?.user?.id,
      ipAddress: clientIP,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to get 2FA status',
      },
      { status: 500 }
    );
  }
}