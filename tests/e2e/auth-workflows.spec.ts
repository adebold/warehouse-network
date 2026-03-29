import { test, expect, Page, BrowserContext } from '@playwright/test'
import { AuthE2EHelper } from '../utils/e2e-auth-helper'

test.describe('Authentication Workflows', () => {
  let authHelper: AuthE2EHelper
  let context: BrowserContext
  let page: Page

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()
    authHelper = new AuthE2EHelper(page)

    // Setup test data
    await authHelper.setupTestEnvironment()
  })

  test.afterEach(async () => {
    await context.close()
  })

  test.describe('User Registration Flow', () => {
    test('should complete full registration for warehouse admin', async () => {
      await page.goto('/register/warehouse')

      // Step 1: Basic Information
      await page.fill('[data-testid="organization-name"]', 'Premium Warehouse Solutions')
      await page.fill('[data-testid="admin-first-name"]', 'John')
      await page.fill('[data-testid="admin-last-name"]', 'Smith')
      await page.fill('[data-testid="admin-email"]', 'john@premiumwarehouse.com')
      await page.fill('[data-testid="admin-phone"]', '+1-555-0123')
      await page.click('[data-testid="next-step"]')

      // Step 2: Warehouse Details
      await page.fill('[data-testid="warehouse-address"]', '123 Industrial Blvd, Business City, BC 12345')
      await page.fill('[data-testid="warehouse-capacity"]', '10000')
      await page.selectOption('[data-testid="storage-types"]', ['electronics', 'automotive', 'general'])
      await page.fill('[data-testid="operating-hours-start"]', '08:00')
      await page.fill('[data-testid="operating-hours-end"]', '18:00')
      await page.click('[data-testid="next-step"]')

      // Step 3: Security Setup
      await page.fill('[data-testid="password"]', 'SecureWarehouse123!')
      await page.fill('[data-testid="confirm-password"]', 'SecureWarehouse123!')
      await page.check('[data-testid="enable-mfa"]')
      await page.click('[data-testid="next-step"]')

      // Step 4: Legal Agreements
      await page.check('[data-testid="terms-of-service"]')
      await page.check('[data-testid="privacy-policy"]')
      await page.check('[data-testid="warehouse-agreement"]')
      await page.click('[data-testid="complete-registration"]')

      // Should redirect to verification page
      await expect(page).toHaveURL(/\/verify-email/)
      await expect(page.locator('[data-testid="verification-message"]')).toContainText(
        'We sent a verification email to john@premiumwarehouse.com'
      )

      // Verify email and complete setup
      const verificationToken = await authHelper.getEmailVerificationToken('john@premiumwarehouse.com')
      await page.goto(`/verify-email?token=${verificationToken}`)

      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Email verified successfully'
      )

      // Setup MFA
      await page.click('[data-testid="setup-mfa"]')
      const mfaSecret = await page.locator('[data-testid="mfa-secret"]').textContent()
      const mfaCode = authHelper.generateTOTPCode(mfaSecret!)

      await page.fill('[data-testid="mfa-code"]', mfaCode)
      await page.click('[data-testid="verify-mfa"]')

      // Should redirect to onboarding dashboard
      await expect(page).toHaveURL(/\/onboarding\/warehouse/)
      await expect(page.locator('[data-testid="welcome-message"]')).toContainText(
        'Welcome to Skidspace, John!'
      )

      // Verify account is fully activated
      const accountStatus = await authHelper.getAccountStatus('john@premiumwarehouse.com')
      expect(accountStatus).toMatchObject({
        emailVerified: true,
        mfaEnabled: true,
        onboardingCompleted: false,
        status: 'ACTIVE'
      })
    })

    test('should complete business manager registration', async () => {
      await page.goto('/register/business')

      // Company Information
      await page.fill('[data-testid="company-name"]', 'Urban Mobility Solutions')
      await page.fill('[data-testid="company-type"]', 'E-bike Retailer')
      await page.fill('[data-testid="business-registration"]', 'BRN-123456789')
      await page.fill('[data-testid="tax-id"]', 'TAX-987654321')

      // Primary Contact
      await page.fill('[data-testid="contact-name"]', 'Sarah Wilson')
      await page.fill('[data-testid="contact-email"]', 'sarah@urbanmobility.com')
      await page.fill('[data-testid="contact-phone"]', '+1-555-0456')
      await page.fill('[data-testid="contact-title"]', 'Operations Manager')

      // Business Requirements
      await page.selectOption('[data-testid="storage-needs"]', 'ebikes')
      await page.fill('[data-testid="monthly-volume"]', '200')
      await page.selectOption('[data-testid="preferred-regions"]', ['us-west', 'us-central'])

      // Security
      await page.fill('[data-testid="password"]', 'BusinessSecure456!')
      await page.fill('[data-testid="confirm-password"]', 'BusinessSecure456!')

      // Agreements
      await page.check('[data-testid="terms-of-service"]')
      await page.check('[data-testid="privacy-policy"]')
      await page.check('[data-testid="business-agreement"]')

      await page.click('[data-testid="submit-registration"]')

      // Should show pending approval message
      await expect(page.locator('[data-testid="approval-message"]')).toContainText(
        'Your registration is under review'
      )

      // Simulate admin approval
      await authHelper.approveBusinessRegistration('sarah@urbanmobility.com')

      // Check approval email
      const approvalEmail = await authHelper.getLatestEmail('sarah@urbanmobility.com')
      expect(approvalEmail.subject).toContain('Welcome to Skidspace')
      expect(approvalEmail.body).toContain('Your business account has been approved')
    })

    test('should handle registration validation errors', async () => {
      await page.goto('/register/warehouse')

      // Submit without required fields
      await page.click('[data-testid="next-step"]')

      // Should show validation errors
      await expect(page.locator('[data-testid="error-organization-name"]')).toContainText(
        'Organization name is required'
      )
      await expect(page.locator('[data-testid="error-admin-email"]')).toContainText(
        'Valid email address is required'
      )

      // Test invalid email format
      await page.fill('[data-testid="admin-email"]', 'invalid-email')
      await page.click('[data-testid="next-step"]')

      await expect(page.locator('[data-testid="error-admin-email"]')).toContainText(
        'Invalid email format'
      )

      // Test duplicate email
      await page.fill('[data-testid="admin-email"]', 'existing@example.com')
      await page.fill('[data-testid="organization-name"]', 'Test Warehouse')
      await page.fill('[data-testid="admin-first-name"]', 'Test')
      await page.fill('[data-testid="admin-last-name"]', 'User')
      await page.click('[data-testid="next-step"]')

      await expect(page.locator('[data-testid="error-admin-email"]')).toContainText(
        'Email address already registered'
      )
    })
  })

  test.describe('Login and Authentication', () => {
    test('should login warehouse admin with MFA', async () => {
      // Setup test user
      const testUser = await authHelper.createTestUser({
        email: 'warehouse.admin@test.com',
        password: 'TestPassword123!',
        role: 'WAREHOUSE_ADMIN',
        mfaEnabled: true,
      })

      await page.goto('/login')

      // Enter credentials
      await page.fill('[data-testid="email"]', testUser.email)
      await page.fill('[data-testid="password"]', 'TestPassword123!')
      await page.click('[data-testid="login-button"]')

      // Should prompt for MFA
      await expect(page).toHaveURL(/\/mfa-verify/)
      await expect(page.locator('[data-testid="mfa-prompt"]')).toContainText(
        'Enter your authentication code'
      )

      // Enter MFA code
      const mfaCode = authHelper.generateTOTPCode(testUser.mfaSecret)
      await page.fill('[data-testid="mfa-code"]', mfaCode)
      await page.click('[data-testid="verify-mfa"]')

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard\/warehouse/)
      await expect(page.locator('[data-testid="user-name"]')).toContainText(testUser.name)

      // Verify session is active
      const sessionData = await authHelper.getSessionData()
      expect(sessionData).toMatchObject({
        userId: testUser.id,
        role: 'WAREHOUSE_ADMIN',
        mfaVerified: true,
      })
    })

    test('should handle OAuth login with Google', async () => {
      await page.goto('/login')

      // Mock OAuth flow
      await authHelper.mockOAuthProvider('google', {
        email: 'user@gmail.com',
        name: 'John Doe',
        picture: 'https://example.com/avatar.jpg',
      })

      await page.click('[data-testid="login-google"]')

      // Should handle OAuth callback
      await expect(page).toHaveURL(/\/auth\/callback\/google/)

      // For new user, should prompt for role selection
      await expect(page).toHaveURL(/\/complete-profile/)
      await page.selectOption('[data-testid="account-type"]', 'business')
      await page.click('[data-testid="continue"]')

      // Should redirect to business onboarding
      await expect(page).toHaveURL(/\/onboarding\/business/)
    })

    test('should enforce account lockout after failed attempts', async () => {
      const testUser = await authHelper.createTestUser({
        email: 'lockout.test@example.com',
        password: 'CorrectPassword123!',
        role: 'CUSTOMER',
      })

      await page.goto('/login')

      // Attempt login with wrong password multiple times
      for (let i = 0; i < 5; i++) {
        await page.fill('[data-testid="email"]', testUser.email)
        await page.fill('[data-testid="password"]', 'WrongPassword123!')
        await page.click('[data-testid="login-button"]')

        await expect(page.locator('[data-testid="error-message"]')).toContainText(
          'Invalid email or password'
        )

        await page.locator('[data-testid="password"]').clear()
      }

      // 6th attempt should show account locked message
      await page.fill('[data-testid="password"]', 'WrongPassword123!')
      await page.click('[data-testid="login-button"]')

      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        'Account temporarily locked due to too many failed attempts'
      )

      // Even correct password should be rejected
      await page.locator('[data-testid="password"]').clear()
      await page.fill('[data-testid="password"]', 'CorrectPassword123!')
      await page.click('[data-testid="login-button"]')

      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        'Account temporarily locked'
      )
    })

    test('should handle session timeout gracefully', async () => {
      const testUser = await authHelper.createTestUser({
        email: 'session.test@example.com',
        password: 'TestPassword123!',
        role: 'BUSINESS_MANAGER',
      })

      // Login
      await authHelper.loginUser(testUser.email, 'TestPassword123!')
      await page.goto('/dashboard/business')

      // Verify logged in
      await expect(page.locator('[data-testid="dashboard-title"]')).toBeVisible()

      // Expire session
      await authHelper.expireUserSession(testUser.id)

      // Attempt to navigate to protected page
      await page.click('[data-testid="settings-menu"]')

      // Should be redirected to login with session expired message
      await expect(page).toHaveURL(/\/login/)
      await expect(page.locator('[data-testid="info-message"]')).toContainText(
        'Your session has expired. Please log in again.'
      )
    })
  })

  test.describe('Password Reset Flow', () => {
    test('should complete password reset successfully', async () => {
      const testUser = await authHelper.createTestUser({
        email: 'reset.test@example.com',
        password: 'OldPassword123!',
        role: 'CUSTOMER',
      })

      await page.goto('/forgot-password')

      // Request password reset
      await page.fill('[data-testid="email"]', testUser.email)
      await page.click('[data-testid="send-reset-email"]')

      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Password reset email sent'
      )

      // Get reset token from email
      const resetToken = await authHelper.getPasswordResetToken(testUser.email)

      // Navigate to reset page
      await page.goto(`/reset-password?token=${resetToken}`)

      // Set new password
      await page.fill('[data-testid="new-password"]', 'NewPassword456!')
      await page.fill('[data-testid="confirm-password"]', 'NewPassword456!')
      await page.click('[data-testid="reset-password"]')

      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Password reset successfully'
      )

      // Verify can login with new password
      await page.goto('/login')
      await page.fill('[data-testid="email"]', testUser.email)
      await page.fill('[data-testid="password"]', 'NewPassword456!')
      await page.click('[data-testid="login-button"]')

      await expect(page).toHaveURL(/\/dashboard/)
    })

    test('should handle expired reset tokens', async () => {
      const expiredToken = 'expired-token-12345'

      await page.goto(`/reset-password?token=${expiredToken}`)

      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        'Password reset link has expired'
      )

      await expect(page.locator('[data-testid="request-new-link"]')).toBeVisible()
    })
  })

  test.describe('Profile Management', () => {
    test('should update user profile and security settings', async () => {
      const testUser = await authHelper.createTestUser({
        email: 'profile.test@example.com',
        password: 'TestPassword123!',
        role: 'WAREHOUSE_ADMIN',
      })

      await authHelper.loginUser(testUser.email, 'TestPassword123!')
      await page.goto('/profile/settings')

      // Update profile information
      await page.fill('[data-testid="first-name"]', 'John')
      await page.fill('[data-testid="last-name"]', 'Updated')
      await page.fill('[data-testid="phone"]', '+1-555-0789')
      await page.click('[data-testid="save-profile"]')

      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Profile updated successfully'
      )

      // Enable MFA
      await page.click('[data-testid="security-tab"]')
      await page.click('[data-testid="enable-mfa"]')

      // Should show QR code and backup codes
      await expect(page.locator('[data-testid="mfa-qr-code"]')).toBeVisible()
      await expect(page.locator('[data-testid="backup-codes"]')).toBeVisible()

      // Verify MFA code
      const mfaSecret = await page.locator('[data-testid="mfa-secret"]').textContent()
      const verificationCode = authHelper.generateTOTPCode(mfaSecret!)

      await page.fill('[data-testid="verification-code"]', verificationCode)
      await page.click('[data-testid="verify-mfa-setup"]')

      await expect(page.locator('[data-testid="mfa-enabled-indicator"]')).toBeVisible()

      // Change password
      await page.click('[data-testid="change-password"]')
      await page.fill('[data-testid="current-password"]', 'TestPassword123!')
      await page.fill('[data-testid="new-password"]', 'NewSecurePassword456!')
      await page.fill('[data-testid="confirm-new-password"]', 'NewSecurePassword456!')
      await page.click('[data-testid="update-password"]')

      await expect(page.locator('[data-testid="password-change-success"]')).toContainText(
        'Password updated successfully'
      )

      // Verify logout and re-login with new password requires MFA
      await page.click('[data-testid="logout"]')
      await page.goto('/login')
      await page.fill('[data-testid="email"]', testUser.email)
      await page.fill('[data-testid="password"]', 'NewSecurePassword456!')
      await page.click('[data-testid="login-button"]')

      // Should prompt for MFA
      await expect(page).toHaveURL(/\/mfa-verify/)
    })
  })

  test.describe('Role-Based Access Control', () => {
    test('should enforce access controls for different user roles', async () => {
      const users = {
        superAdmin: await authHelper.createTestUser({
          email: 'admin@skidspace.com',
          role: 'SUPER_ADMIN',
        }),
        warehouseAdmin: await authHelper.createTestUser({
          email: 'warehouse@example.com',
          role: 'WAREHOUSE_ADMIN',
        }),
        businessManager: await authHelper.createTestUser({
          email: 'business@example.com',
          role: 'BUSINESS_MANAGER',
        }),
        customer: await authHelper.createTestUser({
          email: 'customer@example.com',
          role: 'CUSTOMER',
        }),
      }

      // Test Super Admin access
      await authHelper.loginUser(users.superAdmin.email, 'password')
      await page.goto('/admin/users')
      await expect(page.locator('[data-testid="admin-dashboard"]')).toBeVisible()
      await expect(page.locator('[data-testid="user-management"]')).toBeVisible()
      await authHelper.logout()

      // Test Warehouse Admin access
      await authHelper.loginUser(users.warehouseAdmin.email, 'password')
      await page.goto('/dashboard/warehouse')
      await expect(page.locator('[data-testid="warehouse-dashboard"]')).toBeVisible()

      // Should not access admin pages
      await page.goto('/admin/users')
      await expect(page).toHaveURL(/\/dashboard\/warehouse/) // Redirected
      await authHelper.logout()

      // Test Business Manager access
      await authHelper.loginUser(users.businessManager.email, 'password')
      await page.goto('/dashboard/business')
      await expect(page.locator('[data-testid="business-dashboard"]')).toBeVisible()

      // Should not access warehouse or admin pages
      await page.goto('/admin/users')
      await expect(page).toHaveURL(/\/dashboard\/business/)
      await page.goto('/warehouse/inventory')
      await expect(page).toHaveURL(/\/dashboard\/business/)
      await authHelper.logout()

      // Test Customer access
      await authHelper.loginUser(users.customer.email, 'password')
      await page.goto('/dashboard')
      await expect(page.locator('[data-testid="customer-dashboard"]')).toBeVisible()

      // Should not access any admin pages
      await page.goto('/admin/users')
      await expect(page).toHaveURL(/\/dashboard/)
    })
  })

  test.describe('Organization Management', () => {
    test('should manage organization users and permissions', async () => {
      const orgAdmin = await authHelper.createTestUser({
        email: 'orgadmin@warehouse.com',
        role: 'WAREHOUSE_ADMIN',
        organizationId: 'test-org-1',
      })

      await authHelper.loginUser(orgAdmin.email, 'password')
      await page.goto('/organization/users')

      // Invite new user
      await page.click('[data-testid="invite-user"]')
      await page.fill('[data-testid="invite-email"]', 'newuser@warehouse.com')
      await page.fill('[data-testid="invite-name"]', 'New Employee')
      await page.selectOption('[data-testid="invite-role"]', 'WAREHOUSE_OPERATOR')
      await page.click('[data-testid="send-invitation"]')

      await expect(page.locator('[data-testid="invitation-sent"]')).toContainText(
        'Invitation sent to newuser@warehouse.com'
      )

      // Verify invitation email
      const inviteEmail = await authHelper.getLatestEmail('newuser@warehouse.com')
      expect(inviteEmail.subject).toContain('Invitation to join')

      // Accept invitation
      const inviteToken = authHelper.extractTokenFromEmail(inviteEmail.body)
      await page.goto(`/accept-invite?token=${inviteToken}`)

      await page.fill('[data-testid="password"]', 'NewUserPassword123!')
      await page.fill('[data-testid="confirm-password"]', 'NewUserPassword123!')
      await page.click('[data-testid="accept-invitation"]')

      await expect(page.locator('[data-testid="welcome-message"]')).toContainText(
        'Welcome to the organization'
      )

      // Verify user added to organization
      await authHelper.loginUser(orgAdmin.email, 'password')
      await page.goto('/organization/users')

      await expect(page.locator('[data-testid="user-list"]')).toContainText('newuser@warehouse.com')
      await expect(page.locator('[data-testid="user-role-WAREHOUSE_OPERATOR"]')).toBeVisible()
    })
  })
})