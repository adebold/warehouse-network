import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { OrgType, UserStatus } from '@prisma/client'
import { generate2FASetup } from '@/lib/two-factor-auth'
import { logSecurityEvent } from '@/lib/security-monitoring'
import { validatePassword } from '@/lib/input-sanitization'

// Helper function for timing-safe comparison
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

const superAdminSetupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').max(254),
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
  confirmPassword: z.string(),
  setupKey: z.string().min(1, 'Setup key is required'),
  organizationName: z.string().default('Skidspace Platform').max(100),
  timeLimitedCode: z.string().optional(), // For additional security
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = superAdminSetupSchema.parse(body)

    // Comprehensive password validation
    const passwordValidation = validatePassword(validatedData.password)
    if (!passwordValidation.isValid) {
      await logSecurityEvent('authentication_failure', 'medium', request, {
        reason: 'weak_password',
        errors: passwordValidation.errors
      })
      return NextResponse.json(
        { error: 'Password validation failed', details: passwordValidation.errors },
        { status: 400 }
      )
    }

    // Verify setup key with timing-safe comparison
    const expectedSetupKey = process.env.SUPER_ADMIN_SETUP_KEY
    if (!expectedSetupKey || !timingSafeEqual(
      Buffer.from(validatedData.setupKey),
      Buffer.from(expectedSetupKey)
    )) {
      await logSecurityEvent('authentication_failure', 'high', request, {
        reason: 'invalid_setup_key',
        attemptedKey: validatedData.setupKey.substring(0, 4) + '***'
      })
      return NextResponse.json(
        { error: 'Invalid setup key' },
        { status: 403 }
      )
    }

    // Check time-limited code if provided (additional security layer)
    if (validatedData.timeLimitedCode) {
      const isValidTimeLimitedCode = await verifyTimeLimitedCode(validatedData.timeLimitedCode)
      if (!isValidTimeLimitedCode) {
        await logSecurityEvent('authentication_failure', 'high', request, {
          reason: 'invalid_time_limited_code'
        })
        return NextResponse.json(
          { error: 'Invalid or expired time-limited code' },
          { status: 403 }
        )
      }
    }

    // Check if super admin already exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: {
        organization: {
          type: OrgType.PLATFORM
        },
        userRoles: {
          some: {
            role: {
              slug: 'super-admin'
            }
          }
        }
      }
    })

    if (existingSuperAdmin) {
      return NextResponse.json(
        { error: 'Super admin already exists' },
        { status: 409 }
      )
    }

    // Check if user with email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists with this email' },
        { status: 409 }
      )
    }

    // Create or get platform organization
    let platformOrg = await prisma.organization.findFirst({
      where: { type: OrgType.PLATFORM }
    })

    if (!platformOrg) {
      platformOrg = await prisma.organization.create({
        data: {
          name: validatedData.organizationName,
          slug: 'platform',
          type: OrgType.PLATFORM,
          contactEmail: validatedData.email,
          subscriptionTier: 'ENTERPRISE',
          settings: {
            features: ['all'],
            limits: {
              users: -1, // unlimited
              warehouses: -1,
              apiCalls: -1
            }
          }
        }
      })
    }

    // Get or create super admin role
    let superAdminRole = await prisma.role.findFirst({
      where: {
        slug: 'super-admin',
        organizationId: platformOrg.id
      }
    })

    if (!superAdminRole) {
      superAdminRole = await prisma.role.create({
        data: {
          name: 'Super Administrator',
          slug: 'super-admin',
          description: 'Full platform administration access',
          organizationId: platformOrg.id,
          level: 100,
          isSystem: true,
          color: '#EF4444',
          icon: 'Shield'
        }
      })

      // Assign all platform permissions to super admin role
      const platformPermissions = await prisma.permission.findMany({
        where: { organizationId: platformOrg.id }
      })

      for (const permission of platformPermissions) {
        await prisma.rolePermission.create({
          data: {
            roleId: superAdminRole.id,
            permissionId: permission.id
          }
        })
      }
    }

    // Hash password with high cost factor
    const hashedPassword = await bcrypt.hash(validatedData.password, 14)

    // Create super admin user with 2FA requirement
    const superAdminUser = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        password: hashedPassword,
        emailVerified: new Date(),
        status: UserStatus.ACTIVE,
        organizationId: platformOrg.id,
        requires2FA: true, // Super admin must have 2FA
        metadata: {
          isSystemUser: true,
          createdBy: 'setup',
          setupDate: new Date().toISOString(),
          securityLevel: 'maximum'
        }
      }
    })

    // Setup 2FA for the super admin user
    const twoFactorSetup = await generate2FASetup(superAdminUser.id, validatedData.organizationName)

    // Assign super admin role
    await prisma.userRole.create({
      data: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id
      }
    })

    // Create initial audit log
    await prisma.auditLog.create({
      data: {
        userId: superAdminUser.id,
        organizationId: platformOrg.id,
        action: 'system.setup',
        resource: 'system',
        details: {
          action: 'super_admin_setup',
          platformOrganizationId: platformOrg.id
        },
        status: 'success'
      }
    })

    // Update system config
    await prisma.systemConfig.upsert({
      where: { key: 'system.setup.completed' },
      update: {
        value: {
          completedAt: new Date().toISOString(),
          superAdminUserId: superAdminUser.id,
          version: '1.0.0'
        }
      },
      create: {
        key: 'system.setup.completed',
        value: {
          completedAt: new Date().toISOString(),
          superAdminUserId: superAdminUser.id,
          version: '1.0.0'
        },
        description: 'System setup completion record',
        category: 'system'
      }
    })

    // Log successful setup
    await logSecurityEvent('authentication_success', 'high', request, {
      action: 'super_admin_setup',
      userId: superAdminUser.id,
      organizationId: platformOrg.id
    })

    // Invalidate the setup key after successful use
    await invalidateSetupKey()

    return NextResponse.json({
      message: 'Super admin setup completed successfully',
      user: {
        id: superAdminUser.id,
        name: superAdminUser.name,
        email: superAdminUser.email,
        organizationId: platformOrg.id,
        requires2FA: true
      },
      organization: {
        id: platformOrg.id,
        name: platformOrg.name,
        slug: platformOrg.slug,
        type: platformOrg.type
      },
      twoFactorAuth: {
        qrCodeUrl: twoFactorSetup.qrCodeUrl,
        backupCodes: twoFactorSetup.backupCodes,
        manualEntryKey: twoFactorSetup.manualEntryKey,
        message: '2FA setup is required. Please scan the QR code or enter the manual key.'
      }
    })

  } catch (error) {
    console.error('Super admin setup error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Check if setup is required
export async function GET() {
  try {
    const setupCompleted = await prisma.systemConfig.findUnique({
      where: { key: 'system.setup.completed' }
    })

    const hasSuperAdmin = await prisma.user.findFirst({
      where: {
        organization: {
          type: OrgType.PLATFORM
        },
        userRoles: {
          some: {
            role: {
              slug: 'super-admin'
            }
          }
        }
      }
    })

    return NextResponse.json({
      setupRequired: !setupCompleted || !hasSuperAdmin,
      setupCompleted: !!setupCompleted,
      hasSuperAdmin: !!hasSuperAdmin
    })

  } catch (error) {
    console.error('Setup status check error:', error)

    return NextResponse.json(
      { error: 'Unable to check setup status' },
      { status: 500 }
    )
  }
}

// Helper functions
async function verifyTimeLimitedCode(code: string): Promise<boolean> {
  try {
    // Check if the time-limited code exists and is not expired
    const setupCode = await prisma.setupCode.findUnique({
      where: { code },
    })

    if (!setupCode || setupCode.expiresAt < new Date() || setupCode.used) {
      return false
    }

    // Mark the code as used
    await prisma.setupCode.update({
      where: { code },
      data: { used: true, usedAt: new Date() },
    })

    return true
  } catch (error) {
    console.error('Error verifying time-limited code:', error)
    return false
  }
}

async function invalidateSetupKey(): Promise<void> {
  try {
    // Mark setup as completed and invalidate further setup attempts
    await prisma.systemConfig.upsert({
      where: { key: 'system.setup.key_invalidated' },
      update: {
        value: {
          invalidatedAt: new Date().toISOString(),
          reason: 'setup_completed'
        }
      },
      create: {
        key: 'system.setup.key_invalidated',
        value: {
          invalidatedAt: new Date().toISOString(),
          reason: 'setup_completed'
        },
        description: 'Setup key invalidation record',
        category: 'security'
      }
    })
  } catch (error) {
    console.error('Error invalidating setup key:', error)
  }
}