import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { OrgType, UserStatus } from '@prisma/client'

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationType: z.enum(['WAREHOUSE', 'EBIKE_BUSINESS', 'CUSTOMER']),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
  phone: z.string().optional(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string().default('US')
  }).optional(),
  invitationToken: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = registerSchema.parse(body)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists with this email' },
        { status: 409 }
      )
    }

    // Check if invitation token is provided and valid
    let invitation = null
    if (validatedData.invitationToken) {
      invitation = await prisma.invitation.findUnique({
        where: {
          token: validatedData.invitationToken,
          status: 'PENDING',
          expiresAt: { gt: new Date() }
        },
        include: { organization: true }
      })

      if (!invitation) {
        return NextResponse.json(
          { error: 'Invalid or expired invitation' },
          { status: 400 }
        )
      }

      // Verify email matches invitation
      if (invitation.email !== validatedData.email) {
        return NextResponse.json(
          { error: 'Email does not match invitation' },
          { status: 400 }
        )
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10)

    // Create organization (if not using invitation)
    let organization
    if (invitation) {
      organization = invitation.organization
    } else {
      // Generate unique slug
      const baseSlug = validatedData.organizationName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      let slug = baseSlug
      let counter = 1
      while (await prisma.organization.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`
        counter++
      }

      organization = await prisma.organization.create({
        data: {
          name: validatedData.organizationName,
          slug,
          type: validatedData.organizationType as OrgType,
          contactEmail: validatedData.email,
          address: validatedData.address || undefined,
          settings: {
            onboardingCompleted: false,
            features: getDefaultFeatures(validatedData.organizationType)
          }
        }
      })
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        password: hashedPassword,
        phone: validatedData.phone,
        organizationId: organization.id,
        status: UserStatus.ACTIVE,
        metadata: {
          registrationDate: new Date().toISOString(),
          registrationType: invitation ? 'invitation' : 'self-signup'
        }
      }
    })

    // Assign default role based on registration type
    if (invitation) {
      // Assign roles from invitation
      for (const roleId of invitation.roleIds) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId
          }
        })
      }

      // Mark invitation as accepted
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          invitedUser: user.id
        }
      })
    } else {
      // Assign default owner role for new organizations
      const ownerRole = await createOrGetDefaultRole(
        organization.id,
        getDefaultOwnerRole(validatedData.organizationType)
      )

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: ownerRole.id
        }
      })
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        action: 'user.register',
        resource: `user:${user.id}`,
        details: {
          organizationType: validatedData.organizationType,
          registrationType: invitation ? 'invitation' : 'self-signup',
          invitationId: invitation?.id
        },
        status: 'success'
      }
    })

    return NextResponse.json({
      message: 'Registration successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug
      }
    })

  } catch (error) {
    console.error('Registration error:', error)

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

function getDefaultFeatures(orgType: string): string[] {
  switch (orgType) {
    case 'WAREHOUSE':
      return ['inventory', 'orders', 'analytics']
    case 'EBIKE_BUSINESS':
      return ['fleet', 'bookings', 'customers', 'analytics']
    case 'CUSTOMER':
      return ['bookings', 'history']
    default:
      return ['basic']
  }
}

function getDefaultOwnerRole(orgType: string) {
  switch (orgType) {
    case 'WAREHOUSE':
      return {
        name: 'Warehouse Owner',
        slug: 'warehouse-owner',
        description: 'Full ownership and management of warehouse operations',
        level: 80
      }
    case 'EBIKE_BUSINESS':
      return {
        name: 'Business Owner',
        slug: 'business-owner',
        description: 'Full ownership and management of e-bike business',
        level: 80
      }
    case 'CUSTOMER':
      return {
        name: 'Account Owner',
        slug: 'account-owner',
        description: 'Primary account holder with full access',
        level: 80
      }
    default:
      return {
        name: 'Owner',
        slug: 'owner',
        description: 'Organization owner',
        level: 80
      }
  }
}

async function createOrGetDefaultRole(organizationId: string, roleTemplate: any) {
  // Try to find existing role
  let role = await prisma.role.findFirst({
    where: {
      slug: roleTemplate.slug,
      organizationId
    }
  })

  if (!role) {
    // Create role from template
    role = await prisma.role.create({
      data: {
        ...roleTemplate,
        organizationId,
        color: '#10B981',
        icon: 'Crown'
      }
    })

    // Assign default permissions based on role type
    const defaultPermissions = await getDefaultPermissionsForRole(roleTemplate.slug)
    for (const permissionSlug of defaultPermissions) {
      const permission = await prisma.permission.findFirst({
        where: { slug: permissionSlug, organizationId }
      })

      if (permission) {
        await prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permission.id
          }
        })
      }
    }
  }

  return role
}

async function getDefaultPermissionsForRole(roleSlug: string): Promise<string[]> {
  switch (roleSlug) {
    case 'warehouse-owner':
      return [
        'org:read', 'org:update', 'org:settings', 'org:members:read',
        'org:members:invite', 'org:members:remove', 'warehouse:read',
        'warehouse:update', 'warehouse:settings', 'warehouse:inventory:read',
        'warehouse:inventory:update', 'warehouse:orders:read',
        'warehouse:orders:process', 'analytics:advanced', 'api:access'
      ]
    case 'business-owner':
      return [
        'org:read', 'org:update', 'org:settings', 'org:members:read',
        'org:members:invite', 'org:members:remove', 'analytics:advanced',
        'api:access'
      ]
    case 'account-owner':
      return [
        'org:read', 'org:update', 'user:profile:read',
        'user:profile:update', 'analytics:basic'
      ]
    default:
      return ['org:read', 'user:profile:read', 'user:profile:update']
  }
}