import { PrismaClient } from '@prisma/client'
import { UserService } from '@/lib/auth/user-service'
import { createAuthHelper, AuthTestHelper } from '../../utils/auth-helpers'
import { createTestDatabase, TestDatabase } from '../../utils/test-database'
import { testUsers } from '../../fixtures/users'

describe('User Management', () => {
  let testDb: TestDatabase
  let prisma: PrismaClient
  let authHelper: AuthTestHelper
  let userService: UserService

  beforeAll(async () => {
    testDb = createTestDatabase()
    await testDb.setup()
    prisma = testDb.getClient()
    authHelper = createAuthHelper(prisma)
    userService = new UserService(prisma)
  })

  afterAll(async () => {
    await testDb.cleanup()
  })

  beforeEach(async () => {
    await testDb.reset()
  })

  describe('createUser', () => {
    it('should create a valid user', async () => {
      const userData = testUsers.customer1
      const user = await userService.createUser(userData)

      expect(user).toBeDefined()
      expect(user.id).toBeDefined()
      expect(user.email).toBe(userData.email)
      expect(user.name).toBe(userData.name)
      expect(user.role).toBe(userData.role)
      expect(user.emailVerified).toBeNull()
    })

    it('should hash password during creation', async () => {
      const userData = testUsers.customer1
      const user = await userService.createUser(userData)

      // Verify password is hashed
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id }
      })

      expect(dbUser?.password).toBeDefined()
      expect(dbUser?.password).not.toBe(userData.password)
      expect(dbUser?.password?.startsWith('$2')).toBe(true)
    })

    it('should reject duplicate emails', async () => {
      const userData = testUsers.customer1
      await userService.createUser(userData)

      await expect(userService.createUser(userData))
        .rejects.toThrow('Email already exists')
    })

    it('should validate email format', async () => {
      const invalidUserData = {
        ...testUsers.customer1,
        email: 'invalid-email'
      }

      await expect(userService.createUser(invalidUserData))
        .rejects.toThrow('Invalid email format')
    })

    it('should validate password requirements', async () => {
      const weakPasswordData = {
        ...testUsers.customer1,
        password: 'weak'
      }

      await expect(userService.createUser(weakPasswordData))
        .rejects.toThrow('Password does not meet requirements')
    })

    it('should assign correct default role', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: 'New User'
      }

      const user = await userService.createUser(userData)
      expect(user.role).toBe('CUSTOMER')
    })

    it('should handle organization assignment', async () => {
      const organization = await authHelper.createTestOrganization(
        'Test Organization',
        'test-tenant'
      )

      const userData = {
        ...testUsers.businessManager1,
        organizationId: organization.id
      }

      const user = await userService.createUser(userData)
      expect(user.organizationId).toBe(organization.id)
    })
  })

  describe('getUserById', () => {
    it('should retrieve existing user', async () => {
      const userData = testUsers.customer1
      const createdUser = await userService.createUser(userData)

      const foundUser = await userService.getUserById(createdUser.id)

      expect(foundUser).toBeDefined()
      expect(foundUser?.id).toBe(createdUser.id)
      expect(foundUser?.email).toBe(userData.email)
    })

    it('should return null for non-existent user', async () => {
      const foundUser = await userService.getUserById('non-existent-id')
      expect(foundUser).toBeNull()
    })
  })

  describe('getUserByEmail', () => {
    it('should retrieve user by email', async () => {
      const userData = testUsers.customer1
      const createdUser = await userService.createUser(userData)

      const foundUser = await userService.getUserByEmail(userData.email)

      expect(foundUser).toBeDefined()
      expect(foundUser?.id).toBe(createdUser.id)
      expect(foundUser?.email).toBe(userData.email)
    })

    it('should return null for non-existent email', async () => {
      const foundUser = await userService.getUserByEmail('nonexistent@example.com')
      expect(foundUser).toBeNull()
    })

    it('should be case insensitive', async () => {
      const userData = testUsers.customer1
      await userService.createUser(userData)

      const foundUser = await userService.getUserByEmail(userData.email.toUpperCase())
      expect(foundUser).toBeDefined()
      expect(foundUser?.email).toBe(userData.email)
    })
  })

  describe('updateUser', () => {
    it('should update user profile', async () => {
      const userData = testUsers.customer1
      const createdUser = await userService.createUser(userData)

      const updateData = {
        name: 'Updated Name',
        emailVerified: true
      }

      const updatedUser = await userService.updateUser(createdUser.id, updateData)

      expect(updatedUser.name).toBe(updateData.name)
      expect(updatedUser.emailVerified).toBeTruthy()
    })

    it('should not update protected fields without authorization', async () => {
      const userData = testUsers.customer1
      const createdUser = await userService.createUser(userData)

      await expect(userService.updateUser(createdUser.id, { role: 'SUPER_ADMIN' }))
        .rejects.toThrow('Unauthorized role change')
    })

    it('should validate email uniqueness on update', async () => {
      const user1 = await userService.createUser(testUsers.customer1)
      const user2 = await userService.createUser(testUsers.customer2)

      await expect(userService.updateUser(user2.id, { email: user1.email }))
        .rejects.toThrow('Email already exists')
    })
  })

  describe('deleteUser', () => {
    it('should soft delete user', async () => {
      const userData = testUsers.customer1
      const createdUser = await userService.createUser(userData)

      await userService.deleteUser(createdUser.id)

      const deletedUser = await userService.getUserById(createdUser.id)
      expect(deletedUser).toBeNull()

      // Verify soft delete in database
      const dbUser = await prisma.user.findFirst({
        where: { id: createdUser.id, deletedAt: { not: null } }
      })
      expect(dbUser).toBeDefined()
    })

    it('should handle cascade deletions', async () => {
      const userData = testUsers.customer1
      const createdUser = await userService.createUser(userData)

      // Create related session
      await authHelper.createTestSession(createdUser.id)

      await userService.deleteUser(createdUser.id)

      // Verify sessions are also deleted
      const sessions = await prisma.session.findMany({
        where: { userId: createdUser.id }
      })
      expect(sessions).toHaveLength(0)
    })
  })

  describe('Authentication', () => {
    it('should authenticate valid credentials', async () => {
      const userData = testUsers.customer1
      await userService.createUser(userData)

      const authResult = await userService.authenticate(
        userData.email,
        userData.password
      )

      expect(authResult.success).toBe(true)
      expect(authResult.user).toBeDefined()
      expect(authResult.user?.email).toBe(userData.email)
    })

    it('should reject invalid credentials', async () => {
      const userData = testUsers.customer1
      await userService.createUser(userData)

      const authResult = await userService.authenticate(
        userData.email,
        'wrong-password'
      )

      expect(authResult.success).toBe(false)
      expect(authResult.user).toBeNull()
      expect(authResult.error).toBe('Invalid credentials')
    })

    it('should reject unverified email if required', async () => {
      const userData = testUsers.unverifiedUser
      await userService.createUser(userData)

      const authResult = await userService.authenticate(
        userData.email,
        userData.password,
        { requireEmailVerification: true }
      )

      expect(authResult.success).toBe(false)
      expect(authResult.error).toBe('Email not verified')
    })

    it('should track login attempts', async () => {
      const userData = testUsers.customer1
      const user = await userService.createUser(userData)

      // Failed attempts
      await userService.authenticate(userData.email, 'wrong1')
      await userService.authenticate(userData.email, 'wrong2')
      await userService.authenticate(userData.email, 'wrong3')

      // Check if account is locked
      const authResult = await userService.authenticate(
        userData.email,
        userData.password
      )

      expect(authResult.success).toBe(false)
      expect(authResult.error).toBe('Account temporarily locked')
    })
  })

  describe('Role Management', () => {
    it('should validate role assignments', async () => {
      const userData = testUsers.customer1
      const user = await userService.createUser(userData)

      // Valid role change by super admin
      await userService.updateUserRole(user.id, 'BUSINESS_MANAGER', {
        adminUserId: 'super-admin-id',
        adminRole: 'SUPER_ADMIN'
      })

      const updatedUser = await userService.getUserById(user.id)
      expect(updatedUser?.role).toBe('BUSINESS_MANAGER')
    })

    it('should reject unauthorized role changes', async () => {
      const userData = testUsers.customer1
      const user = await userService.createUser(userData)

      await expect(userService.updateUserRole(user.id, 'SUPER_ADMIN', {
        adminUserId: 'customer-id',
        adminRole: 'CUSTOMER'
      })).rejects.toThrow('Insufficient permissions')
    })
  })
})