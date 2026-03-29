import { PrismaClient } from '@prisma/client'
import { TenantIsolationService } from '@/lib/auth/tenant-isolation-service'
import { createAuthHelper, AuthTestHelper } from '../utils/auth-helpers'
import { createTestDatabase, TestDatabase } from '../utils/test-database'
import { testUsers, testTenants, testOrganizations } from '../fixtures/users'

describe('Multi-Tenant Data Isolation', () => {
  let testDb: TestDatabase
  let prisma: PrismaClient
  let authHelper: AuthTestHelper
  let isolationService: TenantIsolationService
  let testData: {
    tenants: Record<string, any>
    users: Record<string, any>
    organizations: Record<string, any>
  }

  beforeAll(async () => {
    testDb = createTestDatabase()
    await testDb.setup()
    prisma = testDb.getClient()
    authHelper = createAuthHelper(prisma)
    isolationService = new TenantIsolationService(prisma)
  })

  afterAll(async () => {
    await testDb.cleanup()
  })

  beforeEach(async () => {
    await testDb.reset()
    testData = await setupTenantTestData()
  })

  async function setupTenantTestData() {
    // Create tenants
    const tenants = {}
    for (const [key, tenantData] of Object.entries(testTenants)) {
      tenants[key] = await prisma.tenant.create({
        data: {
          id: tenantData.id,
          name: tenantData.name,
          type: tenantData.type,
          settings: tenantData.settings,
          status: 'ACTIVE',
        }
      })
    }

    // Create organizations
    const organizations = {}
    for (const [key, orgData] of Object.entries(testOrganizations)) {
      organizations[key] = await prisma.organization.create({
        data: {
          id: orgData.id,
          name: orgData.name,
          tenantId: orgData.tenantId,
          settings: orgData.settings,
        }
      })
    }

    // Create users
    const users = {}
    users.warehouseAdmin1 = await authHelper.createTestUser({
      ...testUsers.warehouseAdmin1,
      tenantId: testTenants.warehouseTenant1.id,
      organizationId: organizations.warehouseOrg1.id,
    })

    users.warehouseAdmin2 = await authHelper.createTestUser({
      ...testUsers.warehouseAdmin2,
      tenantId: testTenants.warehouseTenant2.id,
      organizationId: organizations.warehouseOrg2.id,
    })

    users.businessManager1 = await authHelper.createTestUser({
      ...testUsers.businessManager1,
      tenantId: testTenants.businessTenant1.id,
      organizationId: organizations.businessOrg1.id,
    })

    users.businessManager2 = await authHelper.createTestUser({
      ...testUsers.businessManager2,
      tenantId: testTenants.businessTenant2.id,
      organizationId: organizations.businessOrg2.id,
    })

    return { tenants, users, organizations }
  }

  describe('Database-Level Tenant Isolation', () => {
    it('should isolate user data by tenant', async () => {
      // Create user profiles for different tenants
      const profile1 = await prisma.userProfile.create({
        data: {
          userId: testData.users.warehouseAdmin1.id,
          tenantId: testData.tenants.warehouseTenant1.id,
          settings: { preference: 'warehouse-specific' },
          personalData: 'sensitive-data-tenant-1',
        }
      })

      const profile2 = await prisma.userProfile.create({
        data: {
          userId: testData.users.warehouseAdmin2.id,
          tenantId: testData.tenants.warehouseTenant2.id,
          settings: { preference: 'warehouse-specific' },
          personalData: 'sensitive-data-tenant-2',
        }
      })

      // Query from tenant 1 perspective
      const tenant1Profiles = await isolationService.getUserProfiles(
        testData.tenants.warehouseTenant1.id
      )

      expect(tenant1Profiles).toHaveLength(1)
      expect(tenant1Profiles[0].id).toBe(profile1.id)
      expect(tenant1Profiles[0].personalData).toBe('sensitive-data-tenant-1')

      // Query from tenant 2 perspective
      const tenant2Profiles = await isolationService.getUserProfiles(
        testData.tenants.warehouseTenant2.id
      )

      expect(tenant2Profiles).toHaveLength(1)
      expect(tenant2Profiles[0].id).toBe(profile2.id)
      expect(tenant2Profiles[0].personalData).toBe('sensitive-data-tenant-2')

      // Cross-tenant query should return empty
      const crossTenantQuery = await prisma.userProfile.findMany({
        where: {
          tenantId: testData.tenants.warehouseTenant1.id,
          userId: testData.users.warehouseAdmin2.id, // User from different tenant
        }
      })

      expect(crossTenantQuery).toHaveLength(0)
    })

    it('should prevent cross-tenant data leakage in complex queries', async () => {
      // Create orders for different tenants
      const order1 = await prisma.order.create({
        data: {
          userId: testData.users.businessManager1.id,
          tenantId: testData.tenants.businessTenant1.id,
          organizationId: testData.organizations.businessOrg1.id,
          status: 'PENDING',
          totalAmount: 1000,
          items: [{ productId: 'product-1', quantity: 5, price: 200 }],
        }
      })

      const order2 = await prisma.order.create({
        data: {
          userId: testData.users.businessManager2.id,
          tenantId: testData.tenants.businessTenant2.id,
          organizationId: testData.organizations.businessOrg2.id,
          status: 'COMPLETED',
          totalAmount: 1500,
          items: [{ productId: 'product-2', quantity: 3, price: 500 }],
        }
      })

      // Complex aggregation query should respect tenant boundaries
      const tenant1Analytics = await isolationService.getOrderAnalytics(
        testData.tenants.businessTenant1.id,
        {
          includeRevenue: true,
          includeOrderCounts: true,
          timeRange: { start: new Date(0), end: new Date() }
        }
      )

      expect(tenant1Analytics.totalRevenue).toBe(1000)
      expect(tenant1Analytics.orderCount).toBe(1)
      expect(tenant1Analytics.orders.every(o => o.tenantId === testData.tenants.businessTenant1.id)).toBe(true)

      // Join queries should also respect tenant boundaries
      const tenant2OrdersWithUsers = await isolationService.getOrdersWithUserDetails(
        testData.tenants.businessTenant2.id
      )

      expect(tenant2OrdersWithUsers).toHaveLength(1)
      expect(tenant2OrdersWithUsers[0].order.tenantId).toBe(testData.tenants.businessTenant2.id)
      expect(tenant2OrdersWithUsers[0].user.tenantId).toBe(testData.tenants.businessTenant2.id)
    })

    it('should enforce tenant isolation in cascading operations', async () => {
      // Create inventory items for different tenants
      const warehouse1Inventory = await prisma.inventory.create({
        data: {
          name: 'Warehouse 1 Inventory',
          tenantId: testData.tenants.warehouseTenant1.id,
          organizationId: testData.organizations.warehouseOrg1.id,
          capacity: 1000,
          currentOccupancy: 500,
        }
      })

      const warehouse2Inventory = await prisma.inventory.create({
        data: {
          name: 'Warehouse 2 Inventory',
          tenantId: testData.tenants.warehouseTenant2.id,
          organizationId: testData.organizations.warehouseOrg2.id,
          capacity: 800,
          currentOccupancy: 300,
        }
      })

      // Create inventory items
      await prisma.inventoryItem.createMany({
        data: [
          {
            inventoryId: warehouse1Inventory.id,
            tenantId: testData.tenants.warehouseTenant1.id,
            sku: 'SKU-001-T1',
            quantity: 100,
          },
          {
            inventoryId: warehouse2Inventory.id,
            tenantId: testData.tenants.warehouseTenant2.id,
            sku: 'SKU-001-T2',
            quantity: 150,
          },
        ]
      })

      // Bulk operation should only affect same tenant items
      const updateResult = await isolationService.updateInventoryItems(
        testData.tenants.warehouseTenant1.id,
        { quantity: 120 },
        { sku: 'SKU-001-T1' }
      )

      expect(updateResult.count).toBe(1)

      // Verify only tenant 1 items were updated
      const tenant1Items = await prisma.inventoryItem.findMany({
        where: { tenantId: testData.tenants.warehouseTenant1.id }
      })

      const tenant2Items = await prisma.inventoryItem.findMany({
        where: { tenantId: testData.tenants.warehouseTenant2.id }
      })

      expect(tenant1Items[0].quantity).toBe(120)
      expect(tenant2Items[0].quantity).toBe(150) // Unchanged
    })
  })

  describe('Application-Level Tenant Isolation', () => {
    it('should validate tenant context in service methods', async () => {
      const user = testData.users.warehouseAdmin1

      // Service method should automatically filter by user's tenant
      const userOrders = await isolationService.getUserOrders(user.id)

      // Create orders in different tenants
      await prisma.order.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          organizationId: user.organizationId,
          status: 'PENDING',
          totalAmount: 100,
          items: [],
        }
      })

      // Order in different tenant (should not be accessible)
      await prisma.order.create({
        data: {
          userId: user.id, // Same user
          tenantId: testData.tenants.businessTenant1.id, // Different tenant
          organizationId: testData.organizations.businessOrg1.id,
          status: 'PENDING',
          totalAmount: 200,
          items: [],
        }
      })

      const filteredOrders = await isolationService.getUserOrders(user.id)

      expect(filteredOrders).toHaveLength(1)
      expect(filteredOrders[0].tenantId).toBe(user.tenantId)
    })

    it('should prevent cross-tenant resource access via API', async () => {
      const warehouse1User = testData.users.warehouseAdmin1
      const warehouse2User = testData.users.warehouseAdmin2

      // Create resource in warehouse 1
      const resource = await prisma.warehouseResource.create({
        data: {
          name: 'Sensitive Warehouse Data',
          tenantId: testData.tenants.warehouseTenant1.id,
          organizationId: testData.organizations.warehouseOrg1.id,
          data: { secretInfo: 'confidential' },
          ownerId: warehouse1User.id,
        }
      })

      // Warehouse 1 user should access successfully
      const accessResult1 = await isolationService.getWarehouseResource(
        resource.id,
        warehouse1User.id
      )

      expect(accessResult1).toBeDefined()
      expect(accessResult1.data.secretInfo).toBe('confidential')

      // Warehouse 2 user should be denied
      const accessResult2 = await isolationService.getWarehouseResource(
        resource.id,
        warehouse2User.id
      )

      expect(accessResult2).toBeNull()
    })

    it('should maintain tenant isolation during data migrations', async () => {
      // Create test data for migration
      const tenant1Data = {
        users: [testData.users.warehouseAdmin1],
        orders: [],
        inventory: [],
      }

      // Add orders and inventory
      for (let i = 0; i < 5; i++) {
        const order = await prisma.order.create({
          data: {
            userId: testData.users.warehouseAdmin1.id,
            tenantId: testData.tenants.warehouseTenant1.id,
            organizationId: testData.organizations.warehouseOrg1.id,
            status: 'COMPLETED',
            totalAmount: 100 * (i + 1),
            items: [],
          }
        })
        tenant1Data.orders.push(order)
      }

      // Perform data migration (simulate moving to new tenant)
      const migrationResult = await isolationService.migrateTenantData({
        sourceTenantId: testData.tenants.warehouseTenant1.id,
        targetTenantId: 'new-tenant-id',
        dataTypes: ['orders'],
        dryRun: false,
      })

      expect(migrationResult.success).toBe(true)
      expect(migrationResult.migratedRecords.orders).toBe(5)

      // Original tenant should have no data
      const originalTenantOrders = await prisma.order.findMany({
        where: { tenantId: testData.tenants.warehouseTenant1.id }
      })

      expect(originalTenantOrders).toHaveLength(0)

      // New tenant should have migrated data
      const newTenantOrders = await prisma.order.findMany({
        where: { tenantId: 'new-tenant-id' }
      })

      expect(newTenantOrders).toHaveLength(5)

      // Other tenants should be unaffected
      const unaffectedTenantOrders = await prisma.order.findMany({
        where: { tenantId: testData.tenants.warehouseTenant2.id }
      })

      expect(unaffectedTenantOrders).toHaveLength(0) // No orders created for this tenant
    })
  })

  describe('Tenant Configuration Isolation', () => {
    it('should isolate tenant-specific configurations', async () => {
      // Update configurations for different tenants
      await isolationService.updateTenantConfiguration(
        testData.tenants.warehouseTenant1.id,
        {
          features: ['advanced-analytics', 'real-time-tracking'],
          limits: { maxUsers: 100, maxStorage: 1000 },
          integrations: { paymentGateway: 'stripe' },
        }
      )

      await isolationService.updateTenantConfiguration(
        testData.tenants.warehouseTenant2.id,
        {
          features: ['basic-analytics'],
          limits: { maxUsers: 50, maxStorage: 500 },
          integrations: { paymentGateway: 'paypal' },
        }
      )

      // Configurations should be isolated
      const tenant1Config = await isolationService.getTenantConfiguration(
        testData.tenants.warehouseTenant1.id
      )

      const tenant2Config = await isolationService.getTenantConfiguration(
        testData.tenants.warehouseTenant2.id
      )

      expect(tenant1Config.features).toContain('advanced-analytics')
      expect(tenant1Config.limits.maxUsers).toBe(100)
      expect(tenant1Config.integrations.paymentGateway).toBe('stripe')

      expect(tenant2Config.features).not.toContain('advanced-analytics')
      expect(tenant2Config.limits.maxUsers).toBe(50)
      expect(tenant2Config.integrations.paymentGateway).toBe('paypal')
    })

    it('should enforce tenant-specific feature flags', async () => {
      // Set feature flags for tenants
      await isolationService.setFeatureFlag(
        testData.tenants.businessTenant1.id,
        'advanced-reporting',
        true
      )

      await isolationService.setFeatureFlag(
        testData.tenants.businessTenant2.id,
        'advanced-reporting',
        false
      )

      // Check feature availability for each tenant
      const tenant1Features = await isolationService.getAvailableFeatures(
        testData.tenants.businessTenant1.id
      )

      const tenant2Features = await isolationService.getAvailableFeatures(
        testData.tenants.businessTenant2.id
      )

      expect(tenant1Features.includes('advanced-reporting')).toBe(true)
      expect(tenant2Features.includes('advanced-reporting')).toBe(false)

      // Feature usage should be enforced
      const reportingAccess1 = await isolationService.checkFeatureAccess(
        testData.users.businessManager1.id,
        'advanced-reporting'
      )

      const reportingAccess2 = await isolationService.checkFeatureAccess(
        testData.users.businessManager2.id,
        'advanced-reporting'
      )

      expect(reportingAccess1.allowed).toBe(true)
      expect(reportingAccess2.allowed).toBe(false)
      expect(reportingAccess2.reason).toBe('feature_not_enabled')
    })

    it('should isolate tenant-specific resource limits', async () => {
      // Set different limits for tenants
      await isolationService.setResourceLimit(
        testData.tenants.businessTenant1.id,
        'monthly_orders',
        1000
      )

      await isolationService.setResourceLimit(
        testData.tenants.businessTenant2.id,
        'monthly_orders',
        100
      )

      // Create orders up to limits
      const createOrdersForTenant = async (tenantId: string, userId: string, count: number) => {
        const results = []
        for (let i = 0; i < count; i++) {
          try {
            const order = await isolationService.createOrder({
              tenantId,
              userId,
              items: [{ productId: 'test', quantity: 1, price: 10 }],
            })
            results.push(order)
          } catch (error) {
            results.push({ error: error.message })
          }
        }
        return results
      }

      // Tenant 1 should be able to create more orders
      const tenant1Results = await createOrdersForTenant(
        testData.tenants.businessTenant1.id,
        testData.users.businessManager1.id,
        150
      )

      const tenant1Successes = tenant1Results.filter(r => !r.error).length
      expect(tenant1Successes).toBeGreaterThan(100)

      // Tenant 2 should hit limit sooner
      const tenant2Results = await createOrdersForTenant(
        testData.tenants.businessTenant2.id,
        testData.users.businessManager2.id,
        150
      )

      const tenant2Successes = tenant2Results.filter(r => !r.error).length
      expect(tenant2Successes).toBeLessThanOrEqual(100)

      const limitExceededErrors = tenant2Results.filter(r =>
        r.error && r.error.includes('monthly limit exceeded')
      ).length
      expect(limitExceededErrors).toBeGreaterThan(0)
    })
  })

  describe('Cross-Tenant Data Access Controls', () => {
    it('should audit cross-tenant access attempts', async () => {
      const user1 = testData.users.warehouseAdmin1
      const user2 = testData.users.warehouseAdmin2

      // User 1 attempts to access User 2's data
      try {
        await isolationService.getUserProfile(user2.id, user1.id)
      } catch (error) {
        // Expected to fail
      }

      // Check audit logs
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: user1.id,
          action: 'cross_tenant_access_attempt',
        }
      })

      expect(auditLogs).toHaveLength(1)
      expect(auditLogs[0].details).toMatchObject({
        sourceTenant: user1.tenantId,
        targetTenant: user2.tenantId,
        resource: 'user_profile',
        resourceId: user2.id,
        blocked: true,
      })
    })

    it('should handle legitimate cross-tenant partnerships', async () => {
      // Create partnership between business and warehouse tenants
      const partnership = await isolationService.createTenantPartnership({
        requesterTenantId: testData.tenants.businessTenant1.id,
        approverTenantId: testData.tenants.warehouseTenant1.id,
        permissions: ['inventory:read', 'warehouse:book_space'],
        approvedBy: testData.users.warehouseAdmin1.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })

      // Business user should now be able to read warehouse inventory
      const inventoryAccess = await isolationService.getPartnerInventory(
        testData.users.businessManager1.id,
        testData.tenants.warehouseTenant1.id
      )

      expect(inventoryAccess).toBeDefined()
      expect(inventoryAccess.partnershipId).toBe(partnership.id)

      // Should still be denied write access
      try {
        await isolationService.updatePartnerInventory(
          testData.users.businessManager1.id,
          testData.tenants.warehouseTenant1.id,
          'inventory-item-1',
          { quantity: 100 }
        )
        fail('Should have thrown error')
      } catch (error) {
        expect(error.message).toContain('Permission denied')
      }

      // Audit partnership usage
      const partnershipLogs = await prisma.auditLog.findMany({
        where: {
          action: 'partnership_access',
          details: {
            path: ['partnershipId'],
            equals: partnership.id,
          }
        }
      })

      expect(partnershipLogs.length).toBeGreaterThan(0)
    })

    it('should automatically clean up expired partnerships', async () => {
      // Create expired partnership
      const expiredPartnership = await prisma.tenantPartnership.create({
        data: {
          requesterTenantId: testData.tenants.businessTenant1.id,
          approverTenantId: testData.tenants.warehouseTenant1.id,
          permissions: ['inventory:read'],
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() - 1000), // Already expired
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        }
      })

      // Run cleanup task
      await isolationService.cleanupExpiredPartnerships()

      // Partnership should be deactivated
      const updatedPartnership = await prisma.tenantPartnership.findUnique({
        where: { id: expiredPartnership.id }
      })

      expect(updatedPartnership.status).toBe('EXPIRED')

      // Access should be denied
      try {
        await isolationService.getPartnerInventory(
          testData.users.businessManager1.id,
          testData.tenants.warehouseTenant1.id
        )
        fail('Should have thrown error')
      } catch (error) {
        expect(error.message).toContain('No active partnership found')
      }
    })
  })

  describe('Performance and Scalability', () => {
    it('should maintain performance with tenant filtering', async () => {
      // Create large dataset across multiple tenants
      const startTime = Date.now()

      // Create 1000 orders across different tenants
      const orderPromises = []
      for (let i = 0; i < 1000; i++) {
        const tenantId = i % 2 === 0
          ? testData.tenants.businessTenant1.id
          : testData.tenants.businessTenant2.id

        const userId = i % 2 === 0
          ? testData.users.businessManager1.id
          : testData.users.businessManager2.id

        orderPromises.push(prisma.order.create({
          data: {
            userId,
            tenantId,
            organizationId: i % 2 === 0
              ? testData.organizations.businessOrg1.id
              : testData.organizations.businessOrg2.id,
            status: 'COMPLETED',
            totalAmount: 100,
            items: [],
          }
        }))
      }

      await Promise.all(orderPromises)

      const dataCreationTime = Date.now() - startTime

      // Query tenant-specific data
      const queryStartTime = Date.now()
      const tenant1Orders = await isolationService.getOrders(
        testData.tenants.businessTenant1.id,
        { limit: 100, offset: 0 }
      )
      const queryTime = Date.now() - queryStartTime

      expect(tenant1Orders).toHaveLength(100) // Should be limited correctly
      expect(queryTime).toBeLessThan(100) // Should be fast with proper indexing
      expect(dataCreationTime).toBeLessThan(5000) // Bulk creation should be reasonable

      console.log(`Created 1000 orders in ${dataCreationTime}ms, queried in ${queryTime}ms`)
    })

    it('should handle concurrent tenant operations', async () => {
      const concurrentOperations = []

      // Simulate concurrent operations across multiple tenants
      for (let i = 0; i < 100; i++) {
        const tenantId = [
          testData.tenants.businessTenant1.id,
          testData.tenants.businessTenant2.id,
          testData.tenants.warehouseTenant1.id,
          testData.tenants.warehouseTenant2.id,
        ][i % 4]

        concurrentOperations.push(
          isolationService.performTenantOperation(tenantId, {
            operation: 'create_analytics_entry',
            data: { timestamp: new Date(), value: Math.random() }
          })
        )
      }

      const startTime = Date.now()
      const results = await Promise.allSettled(concurrentOperations)
      const completionTime = Date.now() - startTime

      const successful = results.filter(r => r.status === 'fulfilled').length
      expect(successful).toBe(100)
      expect(completionTime).toBeLessThan(2000) // Should complete within 2 seconds

      console.log(`Completed 100 concurrent operations in ${completionTime}ms`)
    })
  })
})