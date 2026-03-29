import {
  getUserRoles,
  getUserPermissions,
  userHasPermission,
  userHasRole,
  getUserMaxRoleLevel,
  canManageUser,
  assignRoleToUser,
  removeRoleFromUser
} from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

// Mock Prisma
jest.mock('@/lib/prisma')
const mockedPrisma = prisma as jest.Mocked<typeof prisma>

describe('RBAC Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getUserRoles', () => {
    it('should return user roles correctly', async () => {
      const mockUserRoles = [
        {
          role: {
            id: 'role-1',
            name: 'Admin',
            slug: 'admin',
            level: 80,
            organizationId: 'org-1'
          },
          resourceType: null,
          resourceId: null
        }
      ]

      mockedPrisma.userRole.findMany.mockResolvedValue(mockUserRoles as any)

      const result = await getUserRoles('user-1')

      expect(result).toEqual([
        {
          id: 'role-1',
          name: 'Admin',
          slug: 'admin',
          level: 80,
          organizationId: 'org-1',
          resourceType: undefined,
          resourceId: undefined
        }
      ])

      expect(mockedPrisma.userRole.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: {
          role: {
            include: {
              organization: true
            }
          }
        }
      })
    })

    it('should handle empty roles', async () => {
      mockedPrisma.userRole.findMany.mockResolvedValue([])

      const result = await getUserRoles('user-1')

      expect(result).toEqual([])
    })
  })

  describe('getUserPermissions', () => {
    it('should return unique permission slugs', async () => {
      const mockUserRoles = [
        {
          role: {
            permissions: [
              { permission: { slug: 'user:read' } },
              { permission: { slug: 'user:write' } }
            ]
          }
        },
        {
          role: {
            permissions: [
              { permission: { slug: 'user:read' } }, // Duplicate
              { permission: { slug: 'org:read' } }
            ]
          }
        }
      ]

      mockedPrisma.userRole.findMany.mockResolvedValue(mockUserRoles as any)

      const result = await getUserPermissions('user-1')

      expect(result).toEqual(['user:read', 'user:write', 'org:read'])
      expect(result).toHaveLength(3) // No duplicates
    })
  })

  describe('userHasPermission', () => {
    it('should return true if user has permission', async () => {
      const mockUserRoles = [
        {
          role: {
            permissions: [
              { permission: { slug: 'user:read' } }
            ]
          }
        }
      ]

      mockedPrisma.userRole.findMany.mockResolvedValue(mockUserRoles as any)

      const result = await userHasPermission('user-1', 'user:read')

      expect(result).toBe(true)
    })

    it('should return false if user does not have permission', async () => {
      mockedPrisma.userRole.findMany.mockResolvedValue([])

      const result = await userHasPermission('user-1', 'user:write')

      expect(result).toBe(false)
    })

    it('should respect organization context', async () => {
      mockedPrisma.userRole.findMany.mockResolvedValue([])

      await userHasPermission('user-1', 'user:read', { organizationId: 'org-1' })

      expect(mockedPrisma.userRole.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          role: { organizationId: 'org-1' }
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
    })
  })

  describe('userHasRole', () => {
    it('should return true if user has role', async () => {
      mockedPrisma.userRole.findFirst.mockResolvedValue({ id: 'user-role-1' } as any)

      const result = await userHasRole('user-1', 'admin')

      expect(result).toBe(true)
      expect(mockedPrisma.userRole.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          role: { slug: 'admin' }
        }
      })
    })

    it('should return false if user does not have role', async () => {
      mockedPrisma.userRole.findFirst.mockResolvedValue(null)

      const result = await userHasRole('user-1', 'admin')

      expect(result).toBe(false)
    })
  })

  describe('getUserMaxRoleLevel', () => {
    it('should return highest role level', async () => {
      const mockUserRoles = [
        { role: { level: 50 } },
        { role: { level: 80 } },
        { role: { level: 30 } }
      ]

      mockedPrisma.userRole.findMany.mockResolvedValue(mockUserRoles as any)

      const result = await getUserMaxRoleLevel('user-1')

      expect(result).toBe(80)
    })

    it('should return 0 if user has no roles', async () => {
      mockedPrisma.userRole.findMany.mockResolvedValue([])

      const result = await getUserMaxRoleLevel('user-1')

      expect(result).toBe(0)
    })
  })

  describe('canManageUser', () => {
    it('should return true if actor has higher role level', async () => {
      mockedPrisma.userRole.findMany
        .mockResolvedValueOnce([{ role: { level: 80 } }] as any) // Actor
        .mockResolvedValueOnce([{ role: { level: 50 } }] as any) // Target

      const result = await canManageUser('actor-1', 'target-1')

      expect(result).toBe(true)
    })

    it('should return false if actor has same or lower role level', async () => {
      mockedPrisma.userRole.findMany
        .mockResolvedValueOnce([{ role: { level: 50 } }] as any) // Actor
        .mockResolvedValueOnce([{ role: { level: 80 } }] as any) // Target

      const result = await canManageUser('actor-1', 'target-1')

      expect(result).toBe(false)
    })
  })

  describe('assignRoleToUser', () => {
    it('should assign role to user successfully', async () => {
      mockedPrisma.userRole.findFirst.mockResolvedValue(null) // No existing assignment
      mockedPrisma.userRole.create.mockResolvedValue({
        id: 'user-role-1',
        role: { name: 'Admin' },
        user: { organizationId: 'org-1' }
      } as any)
      mockedPrisma.auditLog.create.mockResolvedValue({} as any)

      const result = await assignRoleToUser('user-1', 'role-1', 'assigned-by-1')

      expect(mockedPrisma.userRole.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          roleId: 'role-1',
          assignedBy: 'assigned-by-1',
          resourceType: undefined,
          resourceId: undefined,
          expiresAt: undefined
        },
        include: {
          role: true,
          user: true
        }
      })

      expect(mockedPrisma.auditLog.create).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('should throw error if role already assigned', async () => {
      mockedPrisma.userRole.findFirst.mockResolvedValue({ id: 'existing' } as any)

      await expect(
        assignRoleToUser('user-1', 'role-1', 'assigned-by-1')
      ).rejects.toThrow('Role already assigned to user')
    })
  })

  describe('removeRoleFromUser', () => {
    it('should remove role from user successfully', async () => {
      const mockUserRole = {
        id: 'user-role-1',
        role: { name: 'Admin' },
        user: { organizationId: 'org-1' }
      }

      mockedPrisma.userRole.findFirst.mockResolvedValue(mockUserRole as any)
      mockedPrisma.userRole.delete.mockResolvedValue(mockUserRole as any)
      mockedPrisma.auditLog.create.mockResolvedValue({} as any)

      const result = await removeRoleFromUser('user-1', 'role-1', 'removed-by-1')

      expect(mockedPrisma.userRole.delete).toHaveBeenCalledWith({
        where: { id: 'user-role-1' }
      })

      expect(mockedPrisma.auditLog.create).toHaveBeenCalled()
      expect(result).toEqual(mockUserRole)
    })

    it('should throw error if role assignment not found', async () => {
      mockedPrisma.userRole.findFirst.mockResolvedValue(null)

      await expect(
        removeRoleFromUser('user-1', 'role-1', 'removed-by-1')
      ).rejects.toThrow('Role assignment not found')
    })
  })
})