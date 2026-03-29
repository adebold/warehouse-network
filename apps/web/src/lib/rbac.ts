import { prisma } from './prisma'
import { cache } from 'react'

export interface UserRole {
  id: string
  name: string
  slug: string
  level: number
  organizationId?: string
  resourceType?: string
  resourceId?: string
}

export interface UserPermission {
  slug: string
  category: string
  constraints?: any
}

/**
 * Get all roles for a user across all contexts
 */
export const getUserRoles = cache(async (userId: string): Promise<UserRole[]> => {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          organization: true
        }
      }
    }
  })

  return userRoles.map(ur => ({
    id: ur.role.id,
    name: ur.role.name,
    slug: ur.role.slug,
    level: ur.role.level,
    organizationId: ur.role.organizationId || undefined,
    resourceType: ur.resourceType || undefined,
    resourceId: ur.resourceId || undefined
  }))
})

/**
 * Get all permission slugs for a user
 */
export const getUserPermissions = cache(async (userId: string): Promise<string[]> => {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  })

  const permissions = new Set<string>()

  userRoles.forEach(ur => {
    ur.role.permissions.forEach(rp => {
      permissions.add(rp.permission.slug)
    })
  })

  return Array.from(permissions)
})

/**
 * Check if user has a specific permission
 */
export const userHasPermission = cache(async (
  userId: string,
  permissionSlug: string,
  context?: {
    organizationId?: string
    resourceType?: string
    resourceId?: string
  }
): Promise<boolean> => {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      ...(context?.organizationId ? {
        role: { organizationId: context.organizationId }
      } : {}),
      ...(context?.resourceType ? { resourceType: context.resourceType } : {}),
      ...(context?.resourceId ? { resourceId: context.resourceId } : {})
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  })

  return userRoles.some(ur =>
    ur.role.permissions.some(rp => rp.permission.slug === permissionSlug)
  )
})

/**
 * Check if user has any of the specified permissions
 */
export const userHasAnyPermission = cache(async (
  userId: string,
  permissionSlugs: string[],
  context?: {
    organizationId?: string
    resourceType?: string
    resourceId?: string
  }
): Promise<boolean> => {
  for (const permission of permissionSlugs) {
    if (await userHasPermission(userId, permission, context)) {
      return true
    }
  }
  return false
})

/**
 * Check if user has a specific role
 */
export const userHasRole = cache(async (
  userId: string,
  roleSlug: string,
  context?: {
    organizationId?: string
    resourceType?: string
    resourceId?: string
  }
): Promise<boolean> => {
  const userRole = await prisma.userRole.findFirst({
    where: {
      userId,
      role: { slug: roleSlug },
      ...(context?.organizationId ? {
        role: { organizationId: context.organizationId }
      } : {}),
      ...(context?.resourceType ? { resourceType: context.resourceType } : {}),
      ...(context?.resourceId ? { resourceId: context.resourceId } : {})
    }
  })

  return !!userRole
})

/**
 * Get user's highest role level
 */
export const getUserMaxRoleLevel = cache(async (
  userId: string,
  organizationId?: string
): Promise<number> => {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      ...(organizationId ? {
        role: { organizationId }
      } : {})
    },
    include: { role: true }
  })

  return Math.max(...userRoles.map(ur => ur.role.level), 0)
})

/**
 * Check if user can perform action on another user (based on role hierarchy)
 */
export const canManageUser = cache(async (
  actorUserId: string,
  targetUserId: string,
  organizationId?: string
): Promise<boolean> => {
  const [actorLevel, targetLevel] = await Promise.all([
    getUserMaxRoleLevel(actorUserId, organizationId),
    getUserMaxRoleLevel(targetUserId, organizationId)
  ])

  return actorLevel > targetLevel
})

/**
 * Get all users that a user can manage (based on role hierarchy)
 */
export const getManageableUsers = cache(async (
  userId: string,
  organizationId?: string
) => {
  const userLevel = await getUserMaxRoleLevel(userId, organizationId)

  const manageableUsers = await prisma.user.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      userRoles: {
        some: {
          role: {
            level: { lt: userLevel }
          }
        }
      }
    },
    include: {
      organization: true,
      userRoles: {
        include: { role: true }
      }
    }
  })

  return manageableUsers
})

/**
 * Assign role to user
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  assignedBy: string,
  context?: {
    resourceType?: string
    resourceId?: string
    expiresAt?: Date
  }
) {
  // Check if role assignment already exists
  const existing = await prisma.userRole.findFirst({
    where: {
      userId,
      roleId,
      resourceType: context?.resourceType || null,
      resourceId: context?.resourceId || null
    }
  })

  if (existing) {
    throw new Error('Role already assigned to user')
  }

  // Create the assignment
  const userRole = await prisma.userRole.create({
    data: {
      userId,
      roleId,
      assignedBy,
      resourceType: context?.resourceType,
      resourceId: context?.resourceId,
      expiresAt: context?.expiresAt
    },
    include: {
      role: true,
      user: true
    }
  })

  // Log the assignment
  await prisma.auditLog.create({
    data: {
      userId: assignedBy,
      organizationId: userRole.user.organizationId,
      action: 'role.assign',
      resource: `user:${userId}`,
      details: {
        roleId,
        roleName: userRole.role.name,
        targetUserId: userId,
        resourceType: context?.resourceType,
        resourceId: context?.resourceId
      },
      status: 'success'
    }
  })

  return userRole
}

/**
 * Remove role from user
 */
export async function removeRoleFromUser(
  userId: string,
  roleId: string,
  removedBy: string,
  context?: {
    resourceType?: string
    resourceId?: string
  }
) {
  const userRole = await prisma.userRole.findFirst({
    where: {
      userId,
      roleId,
      resourceType: context?.resourceType || null,
      resourceId: context?.resourceId || null
    },
    include: {
      role: true,
      user: true
    }
  })

  if (!userRole) {
    throw new Error('Role assignment not found')
  }

  await prisma.userRole.delete({
    where: { id: userRole.id }
  })

  // Log the removal
  await prisma.auditLog.create({
    data: {
      userId: removedBy,
      organizationId: userRole.user.organizationId,
      action: 'role.remove',
      resource: `user:${userId}`,
      details: {
        roleId,
        roleName: userRole.role.name,
        targetUserId: userId,
        resourceType: context?.resourceType,
        resourceId: context?.resourceId
      },
      status: 'success'
    }
  })

  return userRole
}

/**
 * Organization-specific permission checker for multi-tenant context
 */
export const checkOrganizationPermission = cache(async (
  userId: string,
  permissionSlug: string,
  organizationId: string
): Promise<boolean> => {
  // Check for platform-wide permissions (super admin)
  const platformPermission = await userHasPermission(userId, permissionSlug)
  if (platformPermission) return true

  // Check for organization-specific permissions
  return userHasPermission(userId, permissionSlug, { organizationId })
})

/**
 * Warehouse-specific permission checker
 */
export const checkWarehousePermission = cache(async (
  userId: string,
  permissionSlug: string,
  warehouseId: string
): Promise<boolean> => {
  // Check warehouse access
  const warehouseAccess = await prisma.warehouseAccess.findFirst({
    where: {
      userId,
      warehouseId
    },
    include: {
      warehouse: true
    }
  })

  if (!warehouseAccess) return false

  // Check organization-level permission
  return checkOrganizationPermission(
    userId,
    permissionSlug,
    warehouseAccess.warehouse.organizationId
  )
})

/**
 * Get user's accessible warehouses
 */
export const getUserWarehouses = cache(async (userId: string) => {
  const warehouseAccess = await prisma.warehouseAccess.findMany({
    where: { userId },
    include: {
      warehouse: {
        include: {
          organization: true
        }
      }
    }
  })

  return warehouseAccess.map(wa => ({
    ...wa.warehouse,
    accessLevel: wa.accessLevel
  }))
})

/**
 * Permission middleware helper for API routes
 */
export function requirePermission(permissionSlug: string) {
  return async (userId: string, context?: any) => {
    const hasPermission = await userHasPermission(userId, permissionSlug, context)
    if (!hasPermission) {
      throw new Error(`Insufficient permissions: ${permissionSlug}`)
    }
  }
}

/**
 * Role middleware helper for API routes
 */
export function requireRole(roleSlug: string) {
  return async (userId: string, context?: any) => {
    const hasRole = await userHasRole(userId, roleSlug, context)
    if (!hasRole) {
      throw new Error(`Insufficient role: ${roleSlug}`)
    }
  }
}

/**
 * Organization membership checker
 */
export const isOrganizationMember = cache(async (
  userId: string,
  organizationId: string
): Promise<boolean> => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      organizationId
    }
  })

  return !!user
})