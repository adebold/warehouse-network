import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface TestUser {
  id: string
  email: string
  name: string
  role: string
  organizationId?: string
  tenantId?: string
}

export interface CreateTestUserOptions {
  email: string
  password: string
  name: string
  role: 'SUPER_ADMIN' | 'WAREHOUSE_ADMIN' | 'BUSINESS_MANAGER' | 'CUSTOMER'
  organizationId?: string
  tenantId?: string
  emailVerified?: boolean
}

export class AuthTestHelper {
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  async createTestUser(options: CreateTestUserOptions): Promise<TestUser> {
    const hashedPassword = await bcrypt.hash(options.password, 4) // Low rounds for testing

    const user = await this.prisma.user.create({
      data: {
        email: options.email,
        name: options.name,
        password: hashedPassword,
        role: options.role,
        organizationId: options.organizationId,
        tenantId: options.tenantId,
        emailVerified: options.emailVerified ? new Date() : null,
      }
    })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      tenantId: user.tenantId,
    }
  }

  async createTestOrganization(name: string, tenantId?: string) {
    return await this.prisma.organization.create({
      data: {
        name,
        tenantId: tenantId || 'test-tenant',
        settings: {},
      }
    })
  }

  async createTestSession(userId: string): Promise<string> {
    const session = await this.prisma.session.create({
      data: {
        userId,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        sessionToken: generateSessionToken(),
      }
    })

    return session.sessionToken
  }

  async mockUserSession(req: NextApiRequest, user: TestUser): Promise<void> {
    // Mock the session for testing
    req.cookies = {
      ...req.cookies,
      'next-auth.session-token': await this.createTestSession(user.id),
    }
  }

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword)
  }

  generateMockJWT(user: TestUser): string {
    // Simple mock JWT for testing (not secure, only for tests)
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      tenantId: user.tenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    }

    return Buffer.from(JSON.stringify(payload)).toString('base64')
  }

  async cleanupTestUser(email: string): Promise<void> {
    await this.prisma.user.deleteMany({
      where: { email }
    })
  }

  async cleanupTestSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId }
    })
  }
}

export function generateSessionToken(): string {
  return Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('')
}

export function mockRequest(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: 'GET',
    url: '/',
    headers: {},
    cookies: {},
    query: {},
    body: {},
    ...overrides,
  } as NextApiRequest
}

export function mockResponse(): NextApiResponse {
  const res = {} as NextApiResponse
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  res.getHeader = jest.fn()
  res.removeHeader = jest.fn().mockReturnValue(res)
  res.redirect = jest.fn().mockReturnValue(res)
  res.end = jest.fn().mockReturnValue(res)
  return res
}

export const mockUserRoles = {
  superAdmin: {
    id: 'super-admin-id',
    email: 'admin@skidspace.com',
    name: 'Super Admin',
    role: 'SUPER_ADMIN',
  } as TestUser,

  warehouseAdmin: {
    id: 'warehouse-admin-id',
    email: 'warehouse@example.com',
    name: 'Warehouse Admin',
    role: 'WAREHOUSE_ADMIN',
    organizationId: 'warehouse-org-id',
    tenantId: 'warehouse-tenant',
  } as TestUser,

  businessManager: {
    id: 'business-manager-id',
    email: 'business@example.com',
    name: 'Business Manager',
    role: 'BUSINESS_MANAGER',
    organizationId: 'business-org-id',
    tenantId: 'business-tenant',
  } as TestUser,

  customer: {
    id: 'customer-id',
    email: 'customer@example.com',
    name: 'Customer',
    role: 'CUSTOMER',
    tenantId: 'customer-tenant',
  } as TestUser,
}

export function createAuthHelper(prisma: PrismaClient): AuthTestHelper {
  return new AuthTestHelper(prisma)
}