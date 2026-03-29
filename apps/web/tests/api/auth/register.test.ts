/**
 * @jest-environment node
 */

import { POST } from '@/app/api/auth/register/route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// Mock dependencies
jest.mock('@/lib/prisma')
jest.mock('bcryptjs')

const mockedPrisma = prisma as jest.Mocked<typeof prisma>
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

describe('/api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedBcrypt.hash.mockResolvedValue('hashed-password')
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

      // Mock database responses
      mockedPrisma.user.findUnique.mockResolvedValue(null) // No existing user
      mockedPrisma.organization.findUnique.mockResolvedValue(null) // Slug available

      const mockOrganization = {
        id: 'org-1',
        name: 'Acme Warehouse',
        slug: 'acme-warehouse',
        type: 'WAREHOUSE'
      }

      const mockUser = {
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        organizationId: 'org-1'
      }

      mockedPrisma.organization.create.mockResolvedValue(mockOrganization as any)
      mockedPrisma.user.create.mockResolvedValue(mockUser as any)
      mockedPrisma.role.findFirst.mockResolvedValue({ id: 'role-1' } as any)
      mockedPrisma.userRole.create.mockResolvedValue({} as any)
      mockedPrisma.auditLog.create.mockResolvedValue({} as any)

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.message).toBe('Registration successful')
      expect(responseData.user).toEqual({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        organizationId: 'org-1',
        organizationName: 'Acme Warehouse',
        organizationSlug: 'acme-warehouse'
      })

      // Verify password was hashed
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('StrongPassword123!', 10)

      // Verify user creation
      expect(mockedPrisma.user.create).toHaveBeenCalledWith({
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'hashed-password',
          phone: undefined,
          organizationId: 'org-1',
          status: 'ACTIVE',
          metadata: {
            registrationDate: expect.any(String),
            registrationType: 'self-signup'
          }
        }
      })
    })

    it('should reject registration with existing email', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'existing@example.com',
        password: 'StrongPassword123!',
        organizationType: 'WAREHOUSE',
        organizationName: 'Test Warehouse'
      }

      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com'
      } as any)

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

      mockedPrisma.user.findUnique.mockResolvedValue(null)
      mockedPrisma.invitation.findUnique.mockResolvedValue(mockInvitation as any)
      mockedPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com'
      } as any)
      mockedPrisma.userRole.create.mockResolvedValue({} as any)
      mockedPrisma.invitation.update.mockResolvedValue({} as any)
      mockedPrisma.auditLog.create.mockResolvedValue({} as any)

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.message).toBe('Registration successful')

      // Verify invitation was accepted
      expect(mockedPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: {
          status: 'ACCEPTED',
          acceptedAt: expect.any(Date),
          invitedUser: 'user-1'
        }
      })
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

      mockedPrisma.user.findUnique.mockResolvedValue(null)
      mockedPrisma.invitation.findUnique.mockResolvedValue(null)

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

      mockedPrisma.user.findUnique.mockResolvedValue(null)
      mockedPrisma.organization.findUnique
        .mockResolvedValueOnce({ id: 'existing' } as any) // First slug exists
        .mockResolvedValueOnce(null) // Second slug is available

      mockedPrisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Test Warehouse',
        slug: 'test-warehouse-1' // Should append number
      } as any)

      mockedPrisma.user.create.mockResolvedValue({
        id: 'user-1'
      } as any)
      mockedPrisma.role.findFirst.mockResolvedValue({ id: 'role-1' } as any)
      mockedPrisma.userRole.create.mockResolvedValue({} as any)
      mockedPrisma.auditLog.create.mockResolvedValue({} as any)

      const request = createMockRequest(requestBody)
      const response = await POST(request)

      expect(response.status).toBe(200)

      // Verify it checked for existing slug and then used test-warehouse-1
      expect(mockedPrisma.organization.findUnique).toHaveBeenCalledTimes(2)
      expect(mockedPrisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: expect.stringMatching(/^test-warehouse(-\d+)?$/)
          })
        })
      )
    })

    it('should handle database errors gracefully', async () => {
      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'StrongPassword123!',
        organizationType: 'WAREHOUSE',
        organizationName: 'Test Warehouse'
      }

      mockedPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'))

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const responseData = await response.json()

      expect(response.status).toBe(500)
      expect(responseData.error).toBe('Internal server error')
    })
  })
})