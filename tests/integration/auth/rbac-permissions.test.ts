import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { RoleBasedAccessControl } from '@/lib/auth/rbac'
import { createAuthHelper, AuthTestHelper, mockRequest, mockResponse } from '../../utils/auth-helpers'
import { createTestDatabase, TestDatabase } from '../../utils/test-database'
import { testUsers, testOrganizations } from '../../fixtures/users'

describe('Role-Based Access Control Integration', () => {
  let testDb: TestDatabase
  let prisma: PrismaClient
  let authHelper: AuthTestHelper
  let rbac: RoleBasedAccessControl
  let testUsersByRole: Record<string, any> = {}

  beforeAll(async () => {
    testDb = createTestDatabase()
    await testDb.setup()
    prisma = testDb.getClient()
    authHelper = createAuthHelper(prisma)
    rbac = new RoleBasedAccessControl(prisma)
  })

  afterAll(async () => {
    await testDb.cleanup()
  })

  beforeEach(async () => {
    await testDb.reset()

    // Create test users for each role
    testUsersByRole.superAdmin = await authHelper.createTestUser(testUsers.superAdmin)
    testUsersByRole.warehouseAdmin = await authHelper.createTestUser(testUsers.warehouseAdmin1)
    testUsersByRole.businessManager = await authHelper.createTestUser(testUsers.businessManager1)
    testUsersByRole.customer = await authHelper.createTestUser(testUsers.customer1)

    // Create test organizations
    await authHelper.createTestOrganization(
      testOrganizations.warehouseOrg1.name,
      testOrganizations.warehouseOrg1.tenantId
    )
    await authHelper.createTestOrganization(
      testOrganizations.businessOrg1.name,
      testOrganizations.businessOrg1.tenantId
    )
  })

  describe('Permission Validation', () => {
    it('should allow super admin full access', async () => {
      const permissions = [
        'user:create',
        'user:read',
        'user:update',
        'user:delete',
        'organization:create',
        'organization:read',
        'organization:update',
        'organization:delete',
        'system:configure',
        'audit:read',
      ]

      for (const permission of permissions) {
        const hasPermission = await rbac.hasPermission(
          testUsersByRole.superAdmin.id,
          permission
        )
        expect(hasPermission).toBe(true)
      }
    })

    it('should restrict warehouse admin to organization scope', async () => {
      const allowedPermissions = [
        'inventory:create',
        'inventory:read',
        'inventory:update',
        'warehouse:configure',
        'user:read',
      ]

      const deniedPermissions = [
        'user:create',
        'user:delete',
        'organization:create',
        'organization:delete',
        'system:configure',
      ]

      for (const permission of allowedPermissions) {
        const hasPermission = await rbac.hasPermission(
          testUsersByRole.warehouseAdmin.id,
          permission,
          { organizationId: testUsersByRole.warehouseAdmin.organizationId }
        )
        expect(hasPermission).toBe(true)
      }

      for (const permission of deniedPermissions) {
        const hasPermission = await rbac.hasPermission(
          testUsersByRole.warehouseAdmin.id,
          permission
        )
        expect(hasPermission).toBe(false)
      }
    })

    it('should limit business manager to business operations', async () => {
      const allowedPermissions = [
        'inventory:read',
        'order:create',
        'order:read',
        'order:update',
        'billing:read',
      ]

      const deniedPermissions = [
        'inventory:delete',
        'warehouse:configure',
        'user:create',
        'system:configure',
        'audit:read',
      ]

      for (const permission of allowedPermissions) {
        const hasPermission = await rbac.hasPermission(
          testUsersByRole.businessManager.id,
          permission,
          { organizationId: testUsersByRole.businessManager.organizationId }
        )
        expect(hasPermission).toBe(true)
      }

      for (const permission of deniedPermissions) {
        const hasPermission = await rbac.hasPermission(
          testUsersByRole.businessManager.id,
          permission
        )
        expect(hasPermission).toBe(false)
      }
    })

    it('should restrict customer to basic operations', async () => {
      const allowedPermissions = [
        'profile:read',
        'profile:update',
        'order:read',
      ]

      const deniedPermissions = [
        'user:create',
        'inventory:create',
        'warehouse:configure',
        'organization:read',
        'system:configure',
      ]

      for (const permission of allowedPermissions) {
        const hasPermission = await rbac.hasPermission(
          testUsersByRole.customer.id,
          permission
        )
        expect(hasPermission).toBe(true)
      }

      for (const permission of deniedPermissions) {
        const hasPermission = await rbac.hasPermission(
          testUsersByRole.customer.id,
          permission
        )
        expect(hasPermission).toBe(false)
      }
    })
  })

  describe('Resource Access Control', () => {
    it('should enforce organization boundaries', async () => {
      // Create resources in different organizations
      const org1Warehouse = await prisma.warehouse.create({
        data: {
          name: 'Org 1 Warehouse',
          organizationId: testUsersByRole.warehouseAdmin.organizationId,
        }
      })

      const org2Warehouse = await prisma.warehouse.create({
        data: {
          name: 'Org 2 Warehouse',
          organizationId: 'different-org-id',
        }
      })

      // Warehouse admin should only access their organization's warehouse
      const canAccessOwn = await rbac.canAccessResource(
        testUsersByRole.warehouseAdmin.id,
        'warehouse',
        org1Warehouse.id
      )
      expect(canAccessOwn).toBe(true)

      const canAccessOther = await rbac.canAccessResource(
        testUsersByRole.warehouseAdmin.id,
        'warehouse',
        org2Warehouse.id
      )
      expect(canAccessOther).toBe(false)
    })

    it('should enforce tenant isolation', async () => {
      const customer1 = await authHelper.createTestUser(testUsers.customer1)
      const customer2 = await authHelper.createTestUser(testUsers.customer2)

      // Create orders for different tenants
      const order1 = await prisma.order.create({
        data: {
          userId: customer1.id,
          tenantId: customer1.tenantId!,
          status: 'PENDING',
          items: [],
        }
      })

      const order2 = await prisma.order.create({
        data: {
          userId: customer2.id,
          tenantId: customer2.tenantId!,
          status: 'PENDING',
          items: [],
        }
      })

      // Customer should only access their tenant's orders
      const canAccessOwnOrder = await rbac.canAccessResource(
        customer1.id,
        'order',
        order1.id
      )
      expect(canAccessOwnOrder).toBe(true)

      const canAccessOtherOrder = await rbac.canAccessResource(
        customer1.id,
        'order',
        order2.id
      )
      expect(canAccessOtherOrder).toBe(false)
    })

    it('should handle hierarchical access correctly', async () => {
      const organization = await authHelper.createTestOrganization(
        'Test Hierarchy Org',
        'hierarchy-tenant'
      )

      // Create users at different levels
      const orgAdmin = await authHelper.createTestUser({
        ...testUsers.warehouseAdmin1,
        email: 'orgadmin@example.com',
        organizationId: organization.id,
        tenantId: 'hierarchy-tenant',
      })

      const manager = await authHelper.createTestUser({
        ...testUsers.businessManager1,
        email: 'manager@example.com',
        organizationId: organization.id,
        tenantId: 'hierarchy-tenant',
        role: 'BUSINESS_MANAGER',
      })

      const employee = await authHelper.createTestUser({
        ...testUsers.customer1,
        email: 'employee@example.com',
        organizationId: organization.id,
        tenantId: 'hierarchy-tenant',
        role: 'CUSTOMER',
      })

      // Create a report that should be accessible by hierarchy
      const report = await prisma.report.create({
        data: {
          title: 'Monthly Inventory Report',
          organizationId: organization.id,
          createdById: employee.id,
        }
      })

      // All should be able to read the report within their organization
      expect(await rbac.canAccessResource(orgAdmin.id, 'report', report.id)).toBe(true)
      expect(await rbac.canAccessResource(manager.id, 'report', report.id)).toBe(true)
      expect(await rbac.canAccessResource(employee.id, 'report', report.id)).toBe(true)

      // Only admin should be able to delete
      expect(await rbac.hasPermission(orgAdmin.id, 'report:delete')).toBe(true)
      expect(await rbac.hasPermission(manager.id, 'report:delete')).toBe(false)
      expect(await rbac.hasPermission(employee.id, 'report:delete')).toBe(false)
    })
  })

  describe('Dynamic Role Assignment', () => {
    it('should update permissions when role changes', async () => {
      const user = testUsersByRole.customer

      // Initially customer with limited permissions
      expect(await rbac.hasPermission(user.id, 'inventory:create')).toBe(false)

      // Promote to business manager
      await rbac.assignRole(user.id, 'BUSINESS_MANAGER', {
        assignedBy: testUsersByRole.superAdmin.id,
        organizationId: 'business-org-id',
      })

      // Should now have business manager permissions
      expect(await rbac.hasPermission(user.id, 'order:create', {
        organizationId: 'business-org-id'
      })).toBe(true)
    })

    it('should handle temporary role assignments', async () => {
      const user = testUsersByRole.customer

      // Assign temporary admin role
      await rbac.assignTemporaryRole(user.id, 'WAREHOUSE_ADMIN', {
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        assignedBy: testUsersByRole.superAdmin.id,
        organizationId: 'warehouse-org-id',
      })

      // Should have admin permissions temporarily
      expect(await rbac.hasPermission(user.id, 'warehouse:configure', {
        organizationId: 'warehouse-org-id'
      })).toBe(true)

      // Should automatically expire
      jest.advanceTimersByTime(60 * 60 * 1000 + 1000) // 1 hour + 1 second

      expect(await rbac.hasPermission(user.id, 'warehouse:configure', {
        organizationId: 'warehouse-org-id'
      })).toBe(false)
    })

    it('should validate role assignment permissions', async () => {
      const customer = testUsersByRole.customer
      const warehouseAdmin = testUsersByRole.warehouseAdmin

      // Customer cannot assign roles
      await expect(rbac.assignRole(customer.id, 'BUSINESS_MANAGER', {
        assignedBy: customer.id,
      })).rejects.toThrow('Insufficient permissions to assign role')

      // Warehouse admin cannot assign super admin role
      await expect(rbac.assignRole(customer.id, 'SUPER_ADMIN', {
        assignedBy: warehouseAdmin.id,
      })).rejects.toThrow('Insufficient permissions to assign role')
    })
  })

  describe('Permission Caching and Performance', () => {
    it('should cache permission checks efficiently', async () => {
      const user = testUsersByRole.warehouseAdmin

      // First check - should hit database
      const start1 = Date.now()
      await rbac.hasPermission(user.id, 'inventory:read')
      const time1 = Date.now() - start1

      // Second check - should use cache
      const start2 = Date.now()
      await rbac.hasPermission(user.id, 'inventory:read')
      const time2 = Date.now() - start2

      expect(time2).toBeLessThan(time1)
    })

    it('should invalidate cache on role changes', async () => {
      const user = testUsersByRole.customer

      // Initial permission check
      await rbac.hasPermission(user.id, 'order:create')

      // Change role
      await rbac.assignRole(user.id, 'BUSINESS_MANAGER', {
        assignedBy: testUsersByRole.superAdmin.id,
        organizationId: 'business-org-id',
      })

      // Permission check should reflect new role immediately
      expect(await rbac.hasPermission(user.id, 'order:create', {
        organizationId: 'business-org-id'
      })).toBe(true)
    })
  })

  describe('Audit and Compliance', () => {
    it('should log permission checks for audit', async () => {
      const user = testUsersByRole.warehouseAdmin

      await rbac.hasPermission(user.id, 'inventory:delete', {
        auditTrail: true,
        context: { resource: 'inventory-item-123' }
      })

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: user.id,
          action: 'permission_check',
        }
      })

      expect(auditLogs).toHaveLength(1)
      expect(auditLogs[0].details).toMatchObject({
        permission: 'inventory:delete',
        result: false,
        context: { resource: 'inventory-item-123' }
      })
    })

    it('should track role assignment changes', async () => {
      const user = testUsersByRole.customer

      await rbac.assignRole(user.id, 'BUSINESS_MANAGER', {
        assignedBy: testUsersByRole.superAdmin.id,
        reason: 'Promotion to business manager',
      })

      const roleChanges = await prisma.roleAssignment.findMany({
        where: { userId: user.id }
      })

      expect(roleChanges).toHaveLength(1)
      expect(roleChanges[0].role).toBe('BUSINESS_MANAGER')
      expect(roleChanges[0].assignedBy).toBe(testUsersByRole.superAdmin.id)
    })

    it('should generate permission reports', async () => {
      const report = await rbac.generatePermissionReport({
        organizationId: testUsersByRole.warehouseAdmin.organizationId,
        includeUsers: true,
        includePermissions: true,
      })

      expect(report.organization).toBeDefined()
      expect(report.users).toHaveLength(1)
      expect(report.users[0].role).toBe('WAREHOUSE_ADMIN')
      expect(report.users[0].permissions).toBeDefined()
      expect(report.summary.totalUsers).toBe(1)
    })
  })

  describe('API Endpoint Protection', () => {
    it('should protect admin endpoints', async () => {
      const req = mockRequest({
        method: 'GET',
        url: '/api/admin/users',
      })
      const res = mockResponse()

      // Mock session for warehouse admin
      await authHelper.mockUserSession(req, testUsersByRole.warehouseAdmin)

      // Should be denied access to admin endpoints
      const middleware = rbac.createMiddleware(['SUPER_ADMIN'])
      await middleware(req, res, () => {})

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' })
    })

    it('should allow access with correct permissions', async () => {
      const req = mockRequest({
        method: 'GET',
        url: '/api/warehouse/inventory',
      })
      const res = mockResponse()

      await authHelper.mockUserSession(req, testUsersByRole.warehouseAdmin)

      const middleware = rbac.createMiddleware(['WAREHOUSE_ADMIN', 'SUPER_ADMIN'])
      let nextCalled = false
      await middleware(req, res, () => { nextCalled = true })

      expect(nextCalled).toBe(true)
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should validate organization context', async () => {
      const req = mockRequest({
        method: 'PUT',
        url: '/api/warehouse/123/settings',
        query: { warehouseId: '123' },
      })
      const res = mockResponse()

      await authHelper.mockUserSession(req, testUsersByRole.warehouseAdmin)

      // Create warehouse in different organization
      const warehouse = await prisma.warehouse.create({
        data: {
          id: '123',
          name: 'Different Org Warehouse',
          organizationId: 'different-org',
        }
      })

      const middleware = rbac.createResourceMiddleware('warehouse', 'warehouseId')
      await middleware(req, res, () => {})

      expect(res.status).toHaveBeenCalledWith(404) // Not found due to organization boundary
    })
  })
})