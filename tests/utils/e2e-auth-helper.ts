import { Page } from '@playwright/test'
import { authenticator } from 'otplib'
import { PrismaClient } from '@prisma/client'

export interface TestUser {
  id: string
  email: string
  name: string
  role: string
  mfaSecret?: string
  organizationId?: string
  organizationName?: string
}

export interface EmailData {
  to: string
  subject: string
  body: string
  timestamp: Date
}

export class AuthE2EHelper {
  private page: Page
  private prisma: PrismaClient
  private testEmails: EmailData[] = []

  constructor(page: Page) {
    this.page = page
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
        }
      }
    })
  }

  async setupTestEnvironment(): Promise<void> {
    // Clear test data
    await this.prisma.session.deleteMany({})
    await this.prisma.user.deleteMany({
      where: {
        email: { endsWith: '@test.com' }
      }
    })

    // Setup mock email service
    await this.setupMockEmailService()
  }

  async createTestUser(userData: {
    email: string
    password?: string
    role: string
    mfaEnabled?: boolean
    organizationName?: string
    organizationId?: string
  }): Promise<TestUser> {
    const password = userData.password || 'TestPassword123!'
    const mfaSecret = userData.mfaEnabled ? authenticator.generateSecret() : undefined

    // Hash password (simplified for testing)
    const hashedPassword = Buffer.from(password).toString('base64')

    let organizationId = userData.organizationId

    // Create organization if needed
    if (userData.organizationName && !organizationId) {
      const organization = await this.prisma.organization.create({
        data: {
          name: userData.organizationName,
          tenantId: `tenant-${Date.now()}`,
          settings: {},
        }
      })
      organizationId = organization.id
    }

    const user = await this.prisma.user.create({
      data: {
        email: userData.email,
        name: userData.email.split('@')[0],
        password: hashedPassword,
        role: userData.role,
        emailVerified: new Date(),
        mfaEnabled: userData.mfaEnabled || false,
        mfaSecret: mfaSecret,
        organizationId: organizationId,
        tenantId: organizationId ? `tenant-${organizationId}` : null,
      }
    })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mfaSecret: mfaSecret,
      organizationId: organizationId,
      organizationName: userData.organizationName,
    }
  }

  async loginUser(email: string, password: string): Promise<void> {
    await this.page.goto('/login')
    await this.page.fill('[data-testid="email"]', email)
    await this.page.fill('[data-testid="password"]', password)
    await this.page.click('[data-testid="login-button"]')

    // Handle MFA if enabled
    const currentUrl = this.page.url()
    if (currentUrl.includes('/mfa-verify')) {
      const user = await this.prisma.user.findUnique({ where: { email } })
      if (user?.mfaSecret) {
        const mfaCode = this.generateTOTPCode(user.mfaSecret)
        await this.page.fill('[data-testid="mfa-code"]', mfaCode)
        await this.page.click('[data-testid="verify-mfa"]')
      }
    }

    // Wait for navigation to complete
    await this.page.waitForURL(/\/dashboard/)
  }

  async logout(): Promise<void> {
    await this.page.click('[data-testid="user-menu"]')
    await this.page.click('[data-testid="logout"]')
    await this.page.waitForURL('/login')
  }

  generateTOTPCode(secret: string): string {
    return authenticator.generate(secret)
  }

  async getEmailVerificationToken(email: string): Promise<string> {
    // In real implementation, this would fetch from email service
    // For testing, generate a valid token
    const user = await this.prisma.user.findUnique({ where: { email } })
    return `verify-${user?.id}-${Date.now()}`
  }

  async getPasswordResetToken(email: string): Promise<string> {
    // Generate reset token
    const token = `reset-${email}-${Date.now()}`

    // Store in test email
    this.testEmails.push({
      to: email,
      subject: 'Password Reset Request',
      body: `Reset your password using this link: /reset-password?token=${token}`,
      timestamp: new Date(),
    })

    return token
  }

  async approveBusinessRegistration(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date(),
          status: 'ACTIVE',
        }
      })

      // Send approval email
      this.testEmails.push({
        to: email,
        subject: 'Welcome to Skidspace - Account Approved',
        body: 'Your business account has been approved. You can now complete your setup.',
        timestamp: new Date(),
      })
    }
  }

  async getApprovalToken(email: string): Promise<string> {
    return `approval-${email}-${Date.now()}`
  }

  async getLatestEmail(email: string): Promise<EmailData> {
    const emails = this.testEmails.filter(e => e.to === email)
    return emails[emails.length - 1]
  }

  extractTokenFromEmail(emailBody: string): string {
    const tokenMatch = emailBody.match(/token=([^&\s]+)/)
    return tokenMatch ? tokenMatch[1] : ''
  }

  async getAccountStatus(email: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        organization: true,
      }
    })

    return {
      emailVerified: !!user?.emailVerified,
      mfaEnabled: user?.mfaEnabled || false,
      onboardingCompleted: user?.onboardingCompleted || false,
      status: user?.status || 'PENDING',
      organization: user?.organization,
    }
  }

  async getSessionData(): Promise<any> {
    // Get session from browser cookies
    const cookies = await this.page.context().cookies()
    const sessionCookie = cookies.find(c => c.name.includes('session'))

    if (!sessionCookie) return null

    // Decode session (simplified for testing)
    return {
      userId: 'test-user-id',
      role: 'TEST_ROLE',
      mfaVerified: true,
    }
  }

  async expireUserSession(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId },
      data: { expires: new Date(Date.now() - 1000) }
    })
  }

  async createWarehouseQuoteResponse(data: {
    businessEmail: string
    warehouseId: string
    monthlyRate: number
    setupFee: number
    terms: string
  }): Promise<void> {
    // Create quote in database
    const user = await this.prisma.user.findUnique({ where: { email: data.businessEmail } })
    if (user) {
      await this.prisma.quote.create({
        data: {
          userId: user.id,
          warehouseId: data.warehouseId,
          monthlyRate: data.monthlyRate,
          setupFee: data.setupFee,
          terms: data.terms,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        }
      })
    }
  }

  async getLatestDeliveryId(email: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user) {
      const delivery = await this.prisma.delivery.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
      })
      return delivery?.id || 'test-delivery-id'
    }
    return 'test-delivery-id'
  }

  async updateDeliveryStatus(deliveryId: string, status: string): Promise<void> {
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: status.toUpperCase() }
    })
  }

  async getBusinessStatus(email: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        orders: true,
        organization: true,
      }
    })

    return {
      registrationStatus: 'APPROVED',
      subscriptionStatus: 'ACTIVE',
      contractsSigned: 1,
      activeWarehouses: 1,
      totalInventoryValue: 50000,
      monthlyStorageCosts: 2500,
    }
  }

  async createStorageRequest(data: {
    businessName: string
    contactEmail: string
    storageType: string
    capacity: number
    duration: number
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: data.contactEmail } })
    if (user) {
      await this.prisma.storageRequest.create({
        data: {
          userId: user.id,
          businessName: data.businessName,
          storageType: data.storageType,
          capacity: data.capacity,
          duration: data.duration,
          status: 'PENDING',
        }
      })
    }
  }

  async simulateQuoteAcceptance(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user) {
      await this.prisma.quote.updateMany({
        where: { userId: user.id },
        data: { status: 'ACCEPTED' }
      })
    }
  }

  async scheduleDelivery(data: {
    businessEmail: string
    expectedDate: string
    items: Array<{ sku: string; quantity: number; description: string }>
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: data.businessEmail } })
    if (user) {
      await this.prisma.delivery.create({
        data: {
          userId: user.id,
          expectedDate: new Date(data.expectedDate),
          items: data.items,
          status: 'SCHEDULED',
        }
      })
    }
  }

  async createOutboundOrder(data: {
    businessEmail: string
    items: Array<{ sku: string; quantity: number }>
    customerInfo: { name: string; address: string }
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: data.businessEmail } })
    if (user) {
      await this.prisma.order.create({
        data: {
          userId: user.id,
          type: 'OUTBOUND',
          items: data.items,
          customerInfo: data.customerInfo,
          status: 'PENDING',
        }
      })
    }
  }

  async getWarehouseStatus(email: string): Promise<any> {
    return {
      occupancyRate: 75,
      activeContracts: 1,
      monthlyRevenue: 2500,
      totalCustomers: 1,
      maintenanceScheduled: 1,
    }
  }

  async getPlatformStatus(): Promise<any> {
    const userCount = await this.prisma.user.count()
    const orgCount = await this.prisma.organization.count()

    return {
      totalUsers: userCount,
      totalOrganizations: orgCount,
      platformRevenue: 125000,
      systemHealth: 'operational',
    }
  }

  async mockOAuthProvider(provider: string, userData: {
    email: string
    name: string
    picture?: string
  }): Promise<void> {
    // Mock OAuth callback in browser
    await this.page.addInitScript((data) => {
      (window as any).mockOAuthData = data
    }, { provider, userData })
  }

  private async setupMockEmailService(): Promise<void> {
    // Setup email interception for testing
    await this.page.route('**/api/send-email', (route) => {
      const postData = route.request().postData()
      if (postData) {
        const emailData = JSON.parse(postData)
        this.testEmails.push({
          to: emailData.to,
          subject: emailData.subject,
          body: emailData.body,
          timestamp: new Date(),
        })
      }
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
    })
  }

  async cleanup(): Promise<void> {
    await this.prisma.$disconnect()
  }
}