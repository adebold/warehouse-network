import { PrismaClient } from '@prisma/client'
import { TestCacheManager } from './rbac-cache'

// Test database configuration
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://localhost:5432/warehouse_test'
    }
  }
})

// Database cleanup utility for tests with cache invalidation
export async function cleanupDatabase() {
  const tables = [
    'UserRole',
    'RolePermission',
    'Permission',
    'Role',
    'AuditLog',
    'Invitation',
    'User',
    'Organization',
    'Address'
  ]

  // Clear caches BEFORE database cleanup to prevent stale cache issues
  await TestCacheManager.clearTestCaches()

  for (const table of tables) {
    try {
      await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`)
    } catch (error) {
      console.warn(`Failed to cleanup table ${table}:`, error)
    }
  }

  // Clear caches AFTER database cleanup as well
  await TestCacheManager.clearTestCaches()
}

// Setup test data
export async function setupTestData() {
  // Create test organization
  const testOrg = await testPrisma.organization.create({
    data: {
      name: 'Test Warehouse',
      slug: 'test-warehouse',
      type: 'WAREHOUSE',
      status: 'ACTIVE',
      settings: {},
      metadata: {}
    }
  })

  // Create test roles
  const adminRole = await testPrisma.role.create({
    data: {
      name: 'Admin',
      slug: 'admin',
      level: 80,
      organizationId: testOrg.id
    }
  })

  const userRole = await testPrisma.role.create({
    data: {
      name: 'User',
      slug: 'user',
      level: 20,
      organizationId: testOrg.id
    }
  })

  return { testOrg, adminRole, userRole }
}

// Test utilities with cache warming
export async function createTestUser(data: {
  name: string
  email: string
  password: string
  organizationId: string
}) {
  const user = await testPrisma.user.create({
    data: {
      ...data,
      status: 'ACTIVE',
      metadata: {
        registrationDate: new Date().toISOString(),
        registrationType: 'test'
      }
    }
  })

  // Warm cache for created user to improve test performance
  await TestCacheManager.warmTestCache({
    userId: user.id,
    organizationId: data.organizationId
  })

  return user
}

// Helper to clean user caches during test operations
export async function cleanUserCache(userId: string) {
  const { RBACCacheManager } = await import('./rbac-cache')
  await RBACCacheManager.invalidateUserCache(userId)
}

// Helper to ensure consistent cache state in tests
export async function ensureCleanCacheState() {
  await TestCacheManager.clearTestCaches()
}