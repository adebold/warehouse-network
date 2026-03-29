import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { userHasPermission } from '@/lib/rbac'
import { generateInvitationToken } from '@/lib/utils'
import { sendInvitationEmail } from '@/lib/email'

const invitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  roleIds: z.array(z.string()).min(1, 'At least one role is required'),
  message: z.string().optional(),
  expiresInDays: z.number().min(1).max(30).default(7)
})

// Create invitation
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = invitationSchema.parse(body)

    // Check if user can invite members
    const canInvite = await userHasPermission(
      session.user.id,
      'org:members:invite',
      { organizationId: session.user.organizationId! }
    )

    if (!canInvite) {
      return NextResponse.json(
        { error: 'Insufficient permissions to invite users' },
        { status: 403 }
      )
    }

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

    // Check if there's already a pending invitation
    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email: validatedData.email,
        organizationId: session.user.organizationId!,
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      }
    })

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'Pending invitation already exists for this email' },
        { status: 409 }
      )
    }

    // Validate that roles exist and belong to the organization
    const roles = await prisma.role.findMany({
      where: {
        id: { in: validatedData.roleIds },
        organizationId: session.user.organizationId!
      }
    })

    if (roles.length !== validatedData.roleIds.length) {
      return NextResponse.json(
        { error: 'Some roles are invalid or do not belong to your organization' },
        { status: 400 }
      )
    }

    // Generate invitation token
    const token = generateInvitationToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + validatedData.expiresInDays)

    // Create invitation
    const invitation = await prisma.invitation.create({
      data: {
        email: validatedData.email,
        token,
        organizationId: session.user.organizationId!,
        roleIds: validatedData.roleIds,
        invitedBy: session.user.id,
        message: validatedData.message,
        expiresAt,
        status: 'PENDING'
      },
      include: {
        organization: true,
        inviter: {
          select: {
            name: true,
            email: true
          }
        }
      }
    })

    // Send invitation email
    try {
      await sendInvitationEmail({
        email: validatedData.email,
        token,
        organizationName: invitation.organization.name,
        inviterName: invitation.inviter?.name || 'Someone',
        message: validatedData.message,
        expiresAt
      })
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError)
      // Don't fail the invitation creation if email fails
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        organizationId: session.user.organizationId!,
        action: 'invitation.create',
        resource: `invitation:${invitation.id}`,
        details: {
          invitedEmail: validatedData.email,
          roleIds: validatedData.roleIds,
          expiresAt
        },
        status: 'success'
      }
    })

    return NextResponse.json({
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        roles: roles.map(role => ({
          id: role.id,
          name: role.name,
          slug: role.slug
        }))
      }
    })

  } catch (error) {
    console.error('Create invitation error:', error)

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

// Get invitations
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user can view invitations
    const canView = await userHasPermission(
      session.user.id,
      'org:members:read',
      { organizationId: session.user.organizationId! }
    )

    if (!canView) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view invitations' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit

    const where = {
      organizationId: session.user.organizationId!,
      ...(status && { status: status.toUpperCase() as any })
    }

    const [invitations, total] = await Promise.all([
      prisma.invitation.findMany({
        where,
        include: {
          inviter: {
            select: {
              name: true,
              email: true
            }
          },
          invitee: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.invitation.count({ where })
    ])

    // Get role names for each invitation
    const invitationsWithRoles = await Promise.all(
      invitations.map(async (invitation) => {
        const roles = await prisma.role.findMany({
          where: {
            id: { in: invitation.roleIds }
          },
          select: {
            id: true,
            name: true,
            slug: true
          }
        })

        return {
          ...invitation,
          roles
        }
      })
    )

    return NextResponse.json({
      invitations: invitationsWithRoles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    console.error('Get invitations error:', error)

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}