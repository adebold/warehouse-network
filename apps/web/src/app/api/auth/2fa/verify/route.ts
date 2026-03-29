/**
 * 2FA Verification API Route
 * Handles two-factor authentication token verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth-secure';
import { twoFactorAuth } from '@/lib/security/two-factor';
import { rateLimiter, getClientIP } from '@/lib/security/rate-limiter';
import { ValidationSchemas } from '@/lib/security/input-validation';
import { logSecurityEvent } from '@/lib/security/monitoring';
import { z } from 'zod';

const VerifySchema = z.object({
  token: ValidationSchemas.twoFactorToken.or(ValidationSchemas.backupCode),
});

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  try {
    // Rate limiting for 2FA verification
    const rateLimitResult = await rateLimiter.checkTwoFactorLimit(clientIP);
    if (!rateLimitResult.allowed) {
      await logSecurityEvent('rate_limit_exceeded', 'medium', {
        ipAddress: clientIP,
        resource: '/api/auth/2fa/verify',
        type: 'rate_limit_exceeded',
      });

      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: 'Too many 2FA verification attempts',
          retryAfter: Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = VerifySchema.safeParse(body);

    if (!validation.success) {
      await logSecurityEvent('two_factor_invalid_format', 'low', {
        ipAddress: clientIP,
        errors: validation.error.errors,
      });

      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid 2FA token format',
          errors: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { token } = validation.data;

    // Check if user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      await logSecurityEvent('two_factor_unauthorized_attempt', 'medium', {
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    try {
      // Verify the 2FA token
      const verificationResult = await twoFactorAuth.verifyTwoFactor(userId, token);

      if (verificationResult.isValid) {
        await logSecurityEvent('two_factor_verification_success', 'low', {
          userId,
          ipAddress: clientIP,
          userAgent: request.headers.get('user-agent') || undefined,
          method: verificationResult.usedBackupCode ? 'backup_code' : 'totp',
        });

        const response = {
          success: true,
          message: 'Two-factor authentication verified successfully',
          usedBackupCode: verificationResult.usedBackupCode || false,
        };

        // Warn if backup code was used
        if (verificationResult.usedBackupCode) {
          response.message = 'Backup code verified successfully. Consider regenerating backup codes.';
        }

        return NextResponse.json(response);
      } else {
        // Log failed verification attempt
        await logSecurityEvent('two_factor_verification_failed', 'medium', {
          userId,
          ipAddress: clientIP,
          userAgent: request.headers.get('user-agent') || undefined,
          error: verificationResult.error,
          tokenLength: token.length,
        });

        return NextResponse.json(
          {
            error: 'Verification Failed',
            message: verificationResult.error || 'Invalid 2FA token or backup code',
          },
          { status: 400 }
        );
      }
    } catch (error) {
      await logSecurityEvent('two_factor_verification_error', 'high', {
        userId,
        ipAddress: clientIP,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return NextResponse.json(
        {
          error: 'Verification Error',
          message: 'An error occurred during 2FA verification',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('2FA verification API error:', error);

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