import { PrismaClient } from '@prisma/client'
import { SessionService } from '@/lib/auth/session-service'
import { createAuthHelper, AuthTestHelper } from '../../utils/auth-helpers'
import { createTestDatabase, TestDatabase } from '../../utils/test-database'
import { testUsers } from '../../fixtures/users'

describe('Session Management', () => {
  let testDb: TestDatabase
  let prisma: PrismaClient
  let authHelper: AuthTestHelper
  let sessionService: SessionService
  let testUser: any

  beforeAll(async () => {
    testDb = createTestDatabase()
    await testDb.setup()
    prisma = testDb.getClient()
    authHelper = createAuthHelper(prisma)
    sessionService = new SessionService(prisma)
  })

  afterAll(async () => {
    await testDb.cleanup()
  })

  beforeEach(async () => {
    await testDb.reset()
    testUser = await authHelper.createTestUser(testUsers.customer1)
  })

  describe('createSession', () => {
    it('should create a valid session', async () => {
      const session = await sessionService.createSession(testUser.id, {
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
        deviceInfo: { type: 'desktop', os: 'macOS' }
      })

      expect(session).toBeDefined()
      expect(session.userId).toBe(testUser.id)
      expect(session.sessionToken).toBeDefined()
      expect(session.expires).toBeInstanceOf(Date)
      expect(session.expires.getTime()).toBeGreaterThan(Date.now())
    })

    it('should generate unique session tokens', async () => {
      const session1 = await sessionService.createSession(testUser.id)
      const session2 = await sessionService.createSession(testUser.id)

      expect(session1.sessionToken).not.toBe(session2.sessionToken)
    })

    it('should set appropriate expiration time', async () => {
      const session = await sessionService.createSession(testUser.id, {
        maxAge: 3600 // 1 hour
      })

      const expectedExpiry = new Date(Date.now() + 3600 * 1000)
      const timeDiff = Math.abs(session.expires.getTime() - expectedExpiry.getTime())

      expect(timeDiff).toBeLessThan(1000) // Within 1 second
    })

    it('should limit concurrent sessions', async () => {
      // Create maximum allowed sessions
      for (let i = 0; i < 5; i++) {
        await sessionService.createSession(testUser.id)
      }

      // Next session should clean up old ones
      await sessionService.createSession(testUser.id)

      const sessions = await prisma.session.findMany({
        where: { userId: testUser.id }
      })

      expect(sessions.length).toBeLessThanOrEqual(5)
    })
  })

  describe('getSession', () => {
    it('should retrieve valid session', async () => {
      const createdSession = await sessionService.createSession(testUser.id)

      const session = await sessionService.getSession(createdSession.sessionToken)

      expect(session).toBeDefined()
      expect(session?.sessionToken).toBe(createdSession.sessionToken)
      expect(session?.userId).toBe(testUser.id)
    })

    it('should return null for expired session', async () => {
      const expiredSession = await prisma.session.create({
        data: {
          userId: testUser.id,
          sessionToken: 'expired-token',
          expires: new Date(Date.now() - 1000) // 1 second ago
        }
      })

      const session = await sessionService.getSession(expiredSession.sessionToken)
      expect(session).toBeNull()
    })

    it('should return null for non-existent session', async () => {
      const session = await sessionService.getSession('non-existent-token')
      expect(session).toBeNull()
    })

    it('should include user information when requested', async () => {
      const createdSession = await sessionService.createSession(testUser.id)

      const session = await sessionService.getSession(
        createdSession.sessionToken,
        { includeUser: true }
      )

      expect(session?.user).toBeDefined()
      expect(session?.user?.id).toBe(testUser.id)
      expect(session?.user?.email).toBe(testUser.email)
    })
  })

  describe('updateSession', () => {
    it('should refresh session expiration', async () => {
      const session = await sessionService.createSession(testUser.id)
      const originalExpiry = session.expires

      await new Promise(resolve => setTimeout(resolve, 10)) // Small delay

      const updatedSession = await sessionService.refreshSession(session.sessionToken)

      expect(updatedSession).toBeDefined()
      expect(updatedSession!.expires.getTime()).toBeGreaterThan(originalExpiry.getTime())
    })

    it('should update session metadata', async () => {
      const session = await sessionService.createSession(testUser.id)

      const updatedSession = await sessionService.updateSession(session.sessionToken, {
        lastActivity: new Date(),
        ipAddress: '192.168.1.2',
        userAgent: 'Updated User Agent'
      })

      expect(updatedSession).toBeDefined()
      expect(updatedSession?.ipAddress).toBe('192.168.1.2')
      expect(updatedSession?.userAgent).toBe('Updated User Agent')
    })

    it('should track session activity', async () => {
      const session = await sessionService.createSession(testUser.id)

      await sessionService.recordActivity(session.sessionToken, {
        action: 'page_view',
        path: '/dashboard',
        timestamp: new Date()
      })

      const sessionWithActivity = await sessionService.getSession(
        session.sessionToken,
        { includeActivity: true }
      )

      expect(sessionWithActivity?.activities).toBeDefined()
      expect(sessionWithActivity?.activities).toHaveLength(1)
    })
  })

  describe('deleteSession', () => {
    it('should delete specific session', async () => {
      const session = await sessionService.createSession(testUser.id)

      await sessionService.deleteSession(session.sessionToken)

      const deletedSession = await sessionService.getSession(session.sessionToken)
      expect(deletedSession).toBeNull()
    })

    it('should delete all user sessions', async () => {
      // Create multiple sessions
      await sessionService.createSession(testUser.id)
      await sessionService.createSession(testUser.id)
      await sessionService.createSession(testUser.id)

      await sessionService.deleteAllUserSessions(testUser.id)

      const remainingSessions = await prisma.session.findMany({
        where: { userId: testUser.id }
      })

      expect(remainingSessions).toHaveLength(0)
    })

    it('should handle graceful logout', async () => {
      const session = await sessionService.createSession(testUser.id)

      await sessionService.logout(session.sessionToken, {
        reason: 'user_logout',
        timestamp: new Date()
      })

      const deletedSession = await sessionService.getSession(session.sessionToken)
      expect(deletedSession).toBeNull()

      // Should log the logout event
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: testUser.id,
          action: 'logout'
        }
      })

      expect(auditLogs).toHaveLength(1)
    })
  })

  describe('Session Security', () => {
    it('should detect suspicious activity', async () => {
      const session = await sessionService.createSession(testUser.id, {
        ipAddress: '192.168.1.1',
        userAgent: 'Original Browser'
      })

      // Simulate suspicious activity (different IP/browser)
      const suspicious = await sessionService.detectSuspiciousActivity(
        session.sessionToken,
        {
          ipAddress: '10.0.0.1',
          userAgent: 'Different Browser',
          location: { country: 'Different Country' }
        }
      )

      expect(suspicious).toBe(true)
    })

    it('should handle session hijacking detection', async () => {
      const session = await sessionService.createSession(testUser.id)

      // Simulate concurrent usage from different locations
      await sessionService.updateSession(session.sessionToken, {
        ipAddress: '192.168.1.1',
        location: { country: 'US', city: 'New York' }
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const hijackingDetected = await sessionService.checkConcurrentUsage(
        session.sessionToken,
        {
          ipAddress: '203.0.113.1',
          location: { country: 'CN', city: 'Beijing' }
        }
      )

      expect(hijackingDetected).toBe(true)
    })

    it('should automatically cleanup expired sessions', async () => {
      // Create expired session manually
      await prisma.session.create({
        data: {
          userId: testUser.id,
          sessionToken: 'expired-session-1',
          expires: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
        }
      })

      await prisma.session.create({
        data: {
          userId: testUser.id,
          sessionToken: 'expired-session-2',
          expires: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
        }
      })

      await sessionService.cleanupExpiredSessions()

      const remainingSessions = await prisma.session.findMany({
        where: { userId: testUser.id }
      })

      expect(remainingSessions).toHaveLength(0)
    })
  })

  describe('Multi-Device Support', () => {
    it('should support multiple device sessions', async () => {
      const mobileSession = await sessionService.createSession(testUser.id, {
        deviceInfo: { type: 'mobile', os: 'iOS' },
        userAgent: 'Mobile Safari'
      })

      const desktopSession = await sessionService.createSession(testUser.id, {
        deviceInfo: { type: 'desktop', os: 'macOS' },
        userAgent: 'Desktop Chrome'
      })

      expect(mobileSession.sessionToken).not.toBe(desktopSession.sessionToken)

      const userSessions = await sessionService.getUserSessions(testUser.id)
      expect(userSessions).toHaveLength(2)
    })

    it('should allow device-specific logout', async () => {
      const mobileSession = await sessionService.createSession(testUser.id, {
        deviceInfo: { type: 'mobile', os: 'iOS' }
      })

      const desktopSession = await sessionService.createSession(testUser.id, {
        deviceInfo: { type: 'desktop', os: 'macOS' }
      })

      await sessionService.deleteSession(mobileSession.sessionToken)

      const remainingSessions = await sessionService.getUserSessions(testUser.id)
      expect(remainingSessions).toHaveLength(1)
      expect(remainingSessions[0].sessionToken).toBe(desktopSession.sessionToken)
    })
  })

  describe('Session Analytics', () => {
    it('should track session duration', async () => {
      const session = await sessionService.createSession(testUser.id)

      await new Promise(resolve => setTimeout(resolve, 100))

      await sessionService.deleteSession(session.sessionToken)

      const analytics = await sessionService.getSessionAnalytics(testUser.id)

      expect(analytics.averageSessionDuration).toBeGreaterThan(0)
      expect(analytics.totalSessions).toBe(1)
    })

    it('should provide user activity insights', async () => {
      const session = await sessionService.createSession(testUser.id)

      // Simulate user activities
      await sessionService.recordActivity(session.sessionToken, {
        action: 'page_view',
        path: '/dashboard'
      })

      await sessionService.recordActivity(session.sessionToken, {
        action: 'page_view',
        path: '/inventory'
      })

      const insights = await sessionService.getUserActivityInsights(testUser.id)

      expect(insights.mostVisitedPages).toContain('/dashboard')
      expect(insights.mostVisitedPages).toContain('/inventory')
      expect(insights.totalPageViews).toBe(2)
    })
  })
})