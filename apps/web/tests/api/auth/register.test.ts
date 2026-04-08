/**
 * Unified Register API Tests
 * Supports both integration tests (real DB) and unit tests (mocked)
 */

import { POST } from '@/app/api/auth/register/route'
import { NextRequest } from 'next/server'
import {
  getTestPrismaClient,
  isIntegrationTest,
  cleanupDatabase,
  setupTestData,
  testPrisma,
  getMockedPrisma,
  type MockedPrismaClient
} from '@/lib/test-prisma'
import { prismaMock, resetPrismaMocks } from '@/lib/__mocks__/prisma'

// Determine test client based on environment
const getTestClient = () => {
  return isIntegrationTest() ? testPrisma : prismaMock
}

describe('/api/auth/register', () => {
  let testData: any
  let testClient: any

  beforeAll(async () => {
    testClient = getTestClient()

    if (isIntegrationTest()) {
      await cleanupDatabase()
      testData = await setupTestData()
    } else {
      // Setup mock data for unit tests
      testData = {
        testOrg: { id: 'test-org-1', name: 'Test Warehouse' },
        adminRole: { id: 'admin-role-1', name: 'Admin' },
        userRole: { id: 'user-role-1', name: 'User' }
      }
    }
  })

  afterAll(async () => {
    if (isIntegrationTest()) {
      await cleanupDatabase()
      await testPrisma.$disconnect()
    } else {
      resetPrismaMocks()
    }
  })

  beforeEach(async () => {
    if (isIntegrationTest()) {
      // Clean user data but keep organizations and roles for integration tests
      await testPrisma.userRole.deleteMany()
      await testPrisma.auditLog.deleteMany()
      await testPrisma.user.deleteMany()
      await testPrisma.invitation.deleteMany()
    } else {
      // Reset mocks for unit tests
      resetPrismaMocks()
    }
  })

  const createMockRequest = (body: any) => {
    return {
      json: () => Promise.resolve(body),
    } as NextRequest
  }

  describe('POST', () => {
    it('should register a new user successfully', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'StrongPassword123!',
        organizationType: 'WAREHOUSE',
        organizationName: 'Acme Warehouse',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          postalCode: '12345',
          country: 'US'
        }
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.message).toBe('Registration successful')
      expect(responseData.user).toMatchObject({
        name: 'John Doe',
        email: 'john@example.com',
        organizationName: 'Acme Warehouse'
      })

      if (isIntegrationTest()) {
        // Verify user was created in real database
        const createdUser = await testPrisma.user.findUnique({
          where: { email: 'john@example.com' },
          include: { organization: true }
        })

        expect(createdUser).not.toBeNull()
        expect(createdUser?.name).toBe('John Doe')
        expect(createdUser?.organization?.name).toBe('Acme Warehouse')
        expect(createdUser?.password).not.toBe('StrongPassword123!') // Password should be hashed
      }
    })

    it('should reject registration with existing email', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'existing@example.com',
        password: 'StrongPassword123!',
        organizationType: 'WAREHOUSE',
        organizationName: 'Test Warehouse'
      }

      if (isIntegrationTest()) {
        // Create an existing user in the test database
        await testPrisma.user.create({
          data: {
            name: 'Existing User',
            email: 'existing@example.com',
            password: 'hashedPassword',
            organizationId: testData.testOrg.id,
            status: 'ACTIVE',
            metadata: {}
          }
        })
      } else {
        // Mock existing user for unit test
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'existing-user',
          email: 'existing@example.com'
        } as any)
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(409)
      expect(responseData.error).toBe('User already exists with this email')
    })

    it('should handle invitation-based registration', async () => {
      const requestBody = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'StrongPassword123!',
        organizationType: 'WAREHOUSE',
        organizationName: 'Test Warehouse',
        invitationToken: 'valid-token'
      }

      const mockInvitation = {
        id: 'invitation-1',
        email: 'jane@example.com',
        roleIds: ['role-1'],
        organization: {
          id: 'org-1',
          name: 'Existing Org',
          slug: 'existing-org'
        }
      }

      if (isIntegrationTest()) {
        // Integration test: setup real data
        await testPrisma.invitation.create({
          data: {
            id: 'invitation-1',
            email: 'jane@example.com',
            token: 'valid-token',
            status: 'PENDING',
            organizationId: testData.testOrg.id,
            roleIds: [testData.userRole.id],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          } as any
        })
      } else {
        // Unit test: setup mocks
        prismaMock.user.findUnique.mockResolvedValue(null)
        prismaMock.invitation.findUnique.mockResolvedValue(mockInvitation as any)
        prismaMock.user.create.mockResolvedValue({
          id: 'user-1',
          name: 'Jane Doe',
          email: 'jane@example.com'
        } as any)
        prismaMock.userRole.create.mockResolvedValue({} as any)
        prismaMock.invitation.update.mockResolvedValue({} as any)
        prismaMock.auditLog.create.mockResolvedValue({} as any)
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.message).toBe('Registration successful')

      if (!isIntegrationTest()) {
        // Verify invitation was accepted (only for unit tests with mocks)
        expect(prismaMock.invitation.update).toHaveBeenCalledWith({
          where: { id: 'invitation-1' },
          data: {
            status: 'ACCEPTED',
            acceptedAt: expect.any(Date),
            invitedUser: 'user-1'
          }
        })
      }
    })

    it('should reject invalid invitation token', async () => {
      const requestBody = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'StrongPassword123!',
        organizationType: 'WAREHOUSE',
        organizationName: 'Test Warehouse',
        invitationToken: 'invalid-token'
      }

      if (!isIntegrationTest()) {
        // Unit test: setup mocks
        prismaMock.user.findUnique.mockResolvedValue(null)
        prismaMock.invitation.findUnique.mockResolvedValue(null)
      }
      // Integration test: no setup needed, real DB will return null for invalid token

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('Invalid or expired invitation')
    })

    it('should reject invalid input data', async () => {
      const requestBody = {
        name: 'A', // Too short
        email: 'invalid-email',
        password: 'weak',
        organizationType: 'INVALID',
        organizationName: 'X' // Too short
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('Validation error')
      expect(responseData.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.any(Array),
            message: expect.any(String)
          })
        ])
      )
    })

    it('should generate unique organization slug', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'StrongPassword123!',
        organizationType: 'WAREHOUSE',
        organizationName: 'Test Warehouse'
      }

      if (isIntegrationTest()) {
        // Integration test: create conflicting organization first
        await testPrisma.organization.create({
          data: {
            name: 'Existing Test Warehouse',
            slug: 'test-warehouse',
            type: 'WAREHOUSE',
            status: 'ACTIVE',
            settings: {},
            metadata: {}
          }
        })
      } else {
        // Unit test: setup mocks
        prismaMock.user.findUnique.mockResolvedValue(null)
        prismaMock.organization.findUnique
          .mockResolvedValueOnce({ id: 'existing' } as any) // First slug exists
          .mockResolvedValueOnce(null) // Second slug is available

        prismaMock.organization.create.mockResolvedValue({
          id: 'org-1',
          name: 'Test Warehouse',
          slug: 'test-warehouse-1' // Should append number
        } as any)

        prismaMock.user.create.mockResolvedValue({
          id: 'user-1'
        } as any)
        prismaMock.role.findFirst.mockResolvedValue({ id: 'role-1' } as any)
        prismaMock.userRole.create.mockResolvedValue({} as any)
        prismaMock.auditLog.create.mockResolvedValue({} as any)
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)

      expect(response.status).toBe(200)

      if (!isIntegrationTest()) {
        // Verify it checked for existing slug and then used test-warehouse-1 (unit tests only)
        expect(prismaMock.organization.findUnique).toHaveBeenCalledTimes(2)
        expect(prismaMock.organization.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              slug: expect.stringMatching(/^test-warehouse(-\d+)?$/)
            })
          })
        )
      } else {
        // Integration test: verify unique slug was generated
        const responseData = await response.json()
        expect(responseData.user.organizationName).toBe('Test Warehouse')

        // Verify organization was created with unique slug
        const createdOrg = await testPrisma.organization.findFirst({
          where: { name: 'Test Warehouse' }
        })
        expect(createdOrg?.slug).toMatch(/^test-warehouse(-\d+)?$/)
      }
    })

    it('should handle database errors gracefully', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'StrongPassword123!',
        organizationType: 'WAREHOUSE',
        organizationName: 'Test Warehouse'
      }

      prismaMock.user.findUnique.mockRejectedValue(new Error('Database connection failed'))

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(500)
      expect(responseData.error).toBe('Internal server error')
    })
  })
})