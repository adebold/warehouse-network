import { PrismaClient } from '@prisma/client'
import { MultiTenantService } from '@/lib/auth/multi-tenant-service'
import { createAuthHelper, AuthTestHelper } from '../../utils/auth-helpers'
import { createTestDatabase, TestDatabase } from '../../utils/test-database'
import { testUsers, testTenants, testOrganizations } from '../../fixtures/users'

describe('Multi-Tenant Access Control', () => {
  let testDb: TestDatabase
  let prisma: PrismaClient
  let authHelper: AuthTestHelper
  let multiTenantService: MultiTenantService
  let tenants: Record<string, any> = {}
  let users: Record<string, any> = {}

  beforeAll(async () => {
    testDb = createTestDatabase()
    await testDb.setup()
    prisma = testDb.getClient()
    authHelper = createAuthHelper(prisma)
    multiTenantService = new MultiTenantService(prisma)
  })

  afterAll(async () => {
    await testDb.cleanup()
  })

  beforeEach(async () => {
    await testDb.reset()

    // Create test tenants
    for (const [key, tenantData] of Object.entries(testTenants)) {
      tenants[key] = await multiTenantService.createTenant({
        id: tenantData.id,
        name: tenantData.name,
        type: tenantData.type,
        settings: tenantData.settings,
      })
    }

    // Create test users in different tenants
    users.warehouseAdmin1 = await authHelper.createTestUser({
      ...testUsers.warehouseAdmin1,
      tenantId: testTenants.warehouseTenant1.id,
    })

    users.warehouseAdmin2 = await authHelper.createTestUser({
      ...testUsers.warehouseAdmin2,
      tenantId: testTenants.warehouseTenant2.id,
    })

    users.businessManager1 = await authHelper.createTestUser({
      ...testUsers.businessManager1,
      tenantId: testTenants.businessTenant1.id,
    })

    users.businessManager2 = await authHelper.createTestUser({
      ...testUsers.businessManager2,
      tenantId: testTenants.businessTenant2.id,
    })
  })

  describe('Tenant Isolation', () => {
    it('should isolate data between tenants', async () => {
      // Create inventory in different tenants
      const inventory1 = await prisma.inventory.create({
        data: {
          name: 'Tenant 1 Inventory',
          tenantId: testTenants.warehouseTenant1.id,
          organizationId: users.warehouseAdmin1.organizationId,
        }
      })

      const inventory2 = await prisma.inventory.create({
        data: {
          name: 'Tenant 2 Inventory',
          tenantId: testTenants.warehouseTenant2.id,
          organizationId: users.warehouseAdmin2.organizationId,
        }
      })

      // Warehouse admin 1 should only see their tenant's inventory
      const tenant1Inventory = await multiTenantService.getInventory(
        users.warehouseAdmin1.tenantId,
        users.warehouseAdmin1.id
      )

      expect(tenant1Inventory).toHaveLength(1)
      expect(tenant1Inventory[0].id).toBe(inventory1.id)
      expect(tenant1Inventory[0].name).toBe('Tenant 1 Inventory')

      // Warehouse admin 2 should only see their tenant's inventory
      const tenant2Inventory = await multiTenantService.getInventory(
        users.warehouseAdmin2.tenantId,
        users.warehouseAdmin2.id
      )

      expect(tenant2Inventory).toHaveLength(1)
      expect(tenant2Inventory[0].id).toBe(inventory2.id)
      expect(tenant2Inventory[0].name).toBe('Tenant 2 Inventory')
    })

    it('should prevent cross-tenant data access', async () => {
      const sensitiveData = await prisma.businessData.create({
        data: {
          title: 'Confidential Business Plan',
          content: 'Sensitive business information',
          tenantId: testTenants.businessTenant1.id,
          organizationId: users.businessManager1.organizationId,
        }
      })

      // Business manager from different tenant should not access this data
      const accessAttempt = await multiTenantService.getBusinessData(
        testTenants.businessTenant2.id,
        sensitiveData.id,
        users.businessManager2.id
      )

      expect(accessAttempt).toBeNull()
    })

    it('should isolate user authentication by tenant', async () => {
      // User should only authenticate within their tenant context
      const authResult1 = await multiTenantService.authenticate({
        email: users.warehouseAdmin1.email,
        password: testUsers.warehouseAdmin1.password,
        tenantId: testTenants.warehouseTenant1.id,
      })

      expect(authResult1.success).toBe(true)
      expect(authResult1.user?.tenantId).toBe(testTenants.warehouseTenant1.id)

      // Same user should not authenticate in different tenant
      const authResult2 = await multiTenantService.authenticate({
        email: users.warehouseAdmin1.email,
        password: testUsers.warehouseAdmin1.password,
        tenantId: testTenants.warehouseTenant2.id,
      })

      expect(authResult2.success).toBe(false)
      expect(authResult2.error).toBe('User not found in specified tenant')
    })
  })

  describe('Tenant Configuration', () => {
    it('should apply tenant-specific settings', async () => {
      const warehouseTenant = tenants.warehouseTenant1
      const businessTenant = tenants.businessTenant1

      // Warehouse tenant should have warehouse-specific features
      const warehouseFeatures = await multiTenantService.getTenantFeatures(
        warehouseTenant.id
      )

      expect(warehouseFeatures).toContain('advanced-analytics')
      expect(warehouseFeatures).toContain('api-access')
      expect(warehouseFeatures).toContain('white-label')

      // Business tenant should have different features
      const businessFeatures = await multiTenantService.getTenantFeatures(
        businessTenant.id
      )

      expect(businessFeatures).toContain('inventory-management')
      expect(businessFeatures).toContain('reporting')
      expect(businessFeatures).not.toContain('advanced-analytics')
    })

    it('should enforce tenant-specific limits', async () => {
      const businessTenant = tenants.businessTenant1

      // Try to create more orders than allowed
      const limit = businessTenant.settings.monthlyOrderLimit || 0

      // Create orders up to limit
      const orders = []
      for (let i = 0; i < limit; i++) {
        const order = await multiTenantService.createOrder({
          tenantId: businessTenant.id,
          userId: users.businessManager1.id,
          items: [{ productId: 'product-1', quantity: 1 }],
        })
        orders.push(order)
      }

      // Next order should be rejected
      await expect(multiTenantService.createOrder({
        tenantId: businessTenant.id,
        userId: users.businessManager1.id,
        items: [{ productId: 'product-2', quantity: 1 }],
      })).rejects.toThrow('Monthly order limit exceeded')
    })

    it('should handle tenant-specific compliance requirements', async () => {
      const gdprTenant = tenants.businessTenant1 // Has GDPR compliance

      // GDPR-compliant tenant should have additional data handling
      const userDataExport = await multiTenantService.exportUserData(
        users.businessManager1.id,
        { tenantId: gdprTenant.id }
      )

      expect(userDataExport).toBeDefined()
      expect(userDataExport.format).toBe('json')
      expect(userDataExport.includeDeleted).toBe(true)
      expect(userDataExport.auditTrail).toBeTruthy()

      // Non-GDPR tenant should have standard export
      const standardExport = await multiTenantService.exportUserData(
        users.warehouseAdmin2.id,
        { tenantId: testTenants.warehouseTenant2.id }
      )

      expect(standardExport.includeDeleted).toBe(false)
      expect(standardExport.auditTrail).toBeFalsy()
    })
  })

  describe('Cross-Tenant Operations', () => {
    it('should handle controlled cross-tenant interactions', async () => {
      // Super admin should be able to access multiple tenants
      const superAdmin = await authHelper.createTestUser({
        ...testUsers.superAdmin,
        tenantId: null, // Super admin not bound to specific tenant
      })

      // Super admin can access data across tenants
      const allInventory = await multiTenantService.getAllInventory(
        superAdmin.id,
        { includeTenants: [testTenants.warehouseTenant1.id, testTenants.warehouseTenant2.id] }
      )

      expect(allInventory.length).toBeGreaterThan(0)
    })

    it('should enable tenant partnerships with permissions', async () => {
      // Create partnership between business and warehouse tenants
      await multiTenantService.createTenantPartnership({
        sourceTenantId: testTenants.businessTenant1.id,
        targetTenantId: testTenants.warehouseTenant1.id,
        permissions: ['inventory:read', 'order:create'],
        approvedBy: users.warehouseAdmin1.id,
      })

      // Business tenant should now be able to read warehouse inventory
      const partnerInventory = await multiTenantService.getPartnerInventory(
        testTenants.businessTenant1.id,
        testTenants.warehouseTenant1.id,
        users.businessManager1.id
      )

      expect(partnerInventory).toBeDefined()

      // But should not be able to delete inventory
      await expect(multiTenantService.deletePartnerInventory(
        testTenants.businessTenant1.id,
        testTenants.warehouseTenant1.id,
        'inventory-item-1',
        users.businessManager1.id
      )).rejects.toThrow('Permission denied')
    })

    it('should audit cross-tenant access', async () => {
      const partnership = await multiTenantService.createTenantPartnership({
        sourceTenantId: testTenants.businessTenant1.id,
        targetTenantId: testTenants.warehouseTenant1.id,
        permissions: ['inventory:read'],
        approvedBy: users.warehouseAdmin1.id,
      })

      // Access partner data
      await multiTenantService.getPartnerInventory(
        testTenants.businessTenant1.id,
        testTenants.warehouseTenant1.id,
        users.businessManager1.id
      )

      // Check audit logs
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'cross_tenant_access',
          userId: users.businessManager1.id,
        }
      })

      expect(auditLogs).toHaveLength(1)
      expect(auditLogs[0].details).toMatchObject({
        sourceTenant: testTenants.businessTenant1.id,
        targetTenant: testTenants.warehouseTenant1.id,
        resource: 'inventory',
        partnershipId: partnership.id,
      })
    })
  })

  describe('Tenant Lifecycle Management', () => {
    it('should handle tenant creation with proper isolation', async () => {
      const newTenant = await multiTenantService.createTenant({
        name: 'New Test Tenant',
        type: 'BUSINESS',
        settings: {
          region: 'us-central',
          features: ['basic-features'],
        },
      })

      expect(newTenant).toBeDefined()
      expect(newTenant.id).toBeDefined()
      expect(newTenant.status).toBe('ACTIVE')

      // New tenant should be isolated
      const tenantData = await multiTenantService.getTenantData(newTenant.id)
      expect(tenantData.users).toHaveLength(0)
      expect(tenantData.organizations).toHaveLength(0)
    })

    it('should handle tenant deactivation', async () => {
      const tenant = tenants.businessTenant2

      // Deactivate tenant
      await multiTenantService.deactivateTenant(tenant.id, {
        reason: 'Subscription cancelled',
        deactivatedBy: users.businessManager2.id,
      })

      // Users should not be able to authenticate
      const authResult = await multiTenantService.authenticate({
        email: users.businessManager2.email,
        password: testUsers.businessManager2.password,
        tenantId: tenant.id,
      })

      expect(authResult.success).toBe(false)
      expect(authResult.error).toBe('Tenant is not active')

      // Existing sessions should be invalidated
      const sessions = await prisma.session.findMany({
        where: { user: { tenantId: tenant.id } }
      })

      expect(sessions.filter(s => s.expires > new Date())).toHaveLength(0)
    })

    it('should handle tenant data migration', async () => {
      const sourceTenant = tenants.warehouseTenant1
      const targetTenant = await multiTenantService.createTenant({
        name: 'Migration Target Tenant',
        type: 'WAREHOUSE',
        settings: sourceTenant.settings,
      })

      // Create some data in source tenant
      await prisma.inventory.create({
        data: {
          name: 'Migration Test Inventory',
          tenantId: sourceTenant.id,
          organizationId: users.warehouseAdmin1.organizationId,
        }
      })

      // Migrate data
      const migration = await multiTenantService.migrateTenantData({
        sourceTenantId: sourceTenant.id,
        targetTenantId: targetTenant.id,
        includeData: ['inventory', 'organizations'],
        migratedBy: users.warehouseAdmin1.id,
      })

      expect(migration.success).toBe(true)
      expect(migration.migratedRecords.inventory).toBe(1)

      // Verify data moved to target tenant
      const targetInventory = await prisma.inventory.findMany({
        where: { tenantId: targetTenant.id }
      })

      expect(targetInventory).toHaveLength(1)
      expect(targetInventory[0].name).toBe('Migration Test Inventory')
    })
  })

  describe('Performance and Scalability', () => {
    it('should efficiently filter data by tenant', async () => {
      // Create large dataset across multiple tenants
      const inventoryPromises = []
      for (let i = 0; i < 1000; i++) {
        const tenantId = i % 2 === 0
          ? testTenants.warehouseTenant1.id
          : testTenants.warehouseTenant2.id

        inventoryPromises.push(prisma.inventory.create({
          data: {
            name: `Inventory Item ${i}`,
            tenantId,
            organizationId: 'test-org',
          }
        }))
      }

      await Promise.all(inventoryPromises)

      // Query should only return tenant-specific data efficiently
      const startTime = Date.now()
      const tenantInventory = await multiTenantService.getInventory(
        testTenants.warehouseTenant1.id,
        users.warehouseAdmin1.id
      )
      const queryTime = Date.now() - startTime

      expect(tenantInventory).toHaveLength(500)
      expect(queryTime).toBeLessThan(100) // Should complete quickly
    })

    it('should handle concurrent tenant operations', async () => {
      const concurrentOperations = []

      // Simulate concurrent user operations across tenants
      for (let i = 0; i < 50; i++) {
        const tenantId = i % 2 === 0
          ? testTenants.warehouseTenant1.id
          : testTenants.warehouseTenant2.id

        concurrentOperations.push(
          multiTenantService.createOrder({
            tenantId,
            userId: i % 2 === 0 ? users.warehouseAdmin1.id : users.warehouseAdmin2.id,
            items: [{ productId: `product-${i}`, quantity: 1 }],
          })
        )
      }

      const results = await Promise.allSettled(concurrentOperations)
      const successful = results.filter(r => r.status === 'fulfilled').length

      expect(successful).toBe(50)
    })
  })

  describe('Tenant Backup and Recovery', () => {
    it('should create tenant-specific backups', async () => {
      const tenant = tenants.businessTenant1

      // Create some test data
      await prisma.inventory.create({
        data: {
          name: 'Backup Test Inventory',
          tenantId: tenant.id,
          organizationId: users.businessManager1.organizationId,
        }
      })

      // Create backup
      const backup = await multiTenantService.createTenantBackup(tenant.id, {
        includeData: ['users', 'organizations', 'inventory'],
        compression: true,
      })

      expect(backup).toBeDefined()
      expect(backup.tenantId).toBe(tenant.id)
      expect(backup.status).toBe('COMPLETED')
      expect(backup.metadata.recordCounts.inventory).toBe(1)
    })

    it('should restore tenant from backup', async () => {
      const tenant = tenants.businessTenant2

      // Create and then delete test data
      const inventory = await prisma.inventory.create({
        data: {
          name: 'Restore Test Inventory',
          tenantId: tenant.id,
          organizationId: users.businessManager2.organizationId,
        }
      })

      const backup = await multiTenantService.createTenantBackup(tenant.id)

      // Delete the data
      await prisma.inventory.delete({ where: { id: inventory.id } })

      // Restore from backup
      const restoration = await multiTenantService.restoreTenantFromBackup(
        tenant.id,
        backup.id,
        { overwriteExisting: true }
      )

      expect(restoration.success).toBe(true)

      // Verify data restored
      const restoredInventory = await prisma.inventory.findMany({
        where: { tenantId: tenant.id }
      })

      expect(restoredInventory).toHaveLength(1)
      expect(restoredInventory[0].name).toBe('Restore Test Inventory')
    })
  })
})