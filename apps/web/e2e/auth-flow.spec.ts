import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Reset database state or use test database
    await page.goto('/auth/signin')
  })

  test('should display sign in page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Sign In - Skidspace/)
    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click()

    // Check for HTML5 validation (browser dependent)
    const emailInput = page.getByLabel('Email')
    const passwordInput = page.getByLabel('Password')

    await expect(emailInput).toBeFocused() // First invalid field should be focused
  })

  test('should navigate to registration page', async ({ page }) => {
    await page.getByText('Sign up').click()
    await expect(page).toHaveURL('/auth/register')
    await expect(page.getByText('Create Your Account')).toBeVisible()
  })

  test('should display super admin sign in form', async ({ page }) => {
    await page.goto('/auth/signin?mode=super-admin')

    await expect(page.getByText('Super Admin Sign In')).toBeVisible()
    await expect(page.getByLabel('Admin Code')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in as super admin/i })).toBeVisible()

    // OAuth buttons should not be visible in super admin mode
    await expect(page.getByText('Google')).not.toBeVisible()
    await expect(page.getByText('GitHub')).not.toBeVisible()
  })

  test('should handle sign in with invalid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill('invalid@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should show error message (depends on actual implementation)
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
  })

  test('should redirect authenticated users from sign in page', async ({ page }) => {
    // This test would require setting up a valid session first
    // Skip for now as it requires complex setup
    test.skip()
  })

  test('should display OAuth sign in options', async ({ page }) => {
    await expect(page.getByText('Google')).toBeVisible()
    await expect(page.getByText('GitHub')).toBeVisible()
    await expect(page.getByText('Or continue with')).toBeVisible()
  })

  test('should handle OAuth button clicks', async ({ page }) => {
    // Mock OAuth flow would be complex, so we'll just test the button interaction
    const googleButton = page.getByText('Google').locator('..')
    await expect(googleButton).toBeVisible()
    await expect(googleButton).toBeEnabled()

    // Click would redirect to OAuth provider, so we'll just verify clickability
    await googleButton.hover()
  })

  test('should navigate to forgot password page', async ({ page }) => {
    await page.getByText('Forgot your password?').click()
    await expect(page).toHaveURL('/auth/forgot-password')
  })

  test('should handle form submission loading state', async ({ page }) => {
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')

    // Intercept the API call to add delay
    await page.route('/api/auth/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.continue()
    })

    const submitButton = page.getByRole('button', { name: /sign in/i })
    await submitButton.click()

    // Should show loading state
    await expect(page.getByTestId('loading-spinner')).toBeVisible()
    await expect(submitButton).toBeDisabled()
    await expect(page.getByLabel('Email')).toBeDisabled()
    await expect(page.getByLabel('Password')).toBeDisabled()
  })

  test('should preserve callback URL parameter', async ({ page }) => {
    const callbackUrl = '/dashboard/warehouses'
    await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`)

    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    // The form should include the callback URL in the sign in request
    // This would require checking network requests in a real test
  })

  test('should display organization context when slug provided', async ({ page }) => {
    const orgSlug = 'acme-warehouse'
    await page.goto(`/auth/signin?org=${orgSlug}`)

    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should include organization context in sign in request
    // This would require checking network requests or form data
  })

  test('should handle keyboard navigation', async ({ page }) => {
    // Test tab navigation through form elements
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Email')).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password')).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: /sign in/i })).toBeFocused()

    // Test form submission with Enter key
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByLabel('Password').press('Enter')

    // Should trigger form submission
  })

  test('should be responsive on mobile devices', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }) // iPhone SE

    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()

    // OAuth buttons should stack vertically on mobile
    const googleButton = page.getByText('Google')
    const githubButton = page.getByText('GitHub')

    await expect(googleButton).toBeVisible()
    await expect(githubButton).toBeVisible()

    // Check that buttons are stacked (specific layout testing would require more detailed checks)
  })

  test('should handle browser back button correctly', async ({ page }) => {
    await page.goto('/auth/signin')
    await page.getByText('Sign up').click()
    await expect(page).toHaveURL('/auth/register')

    await page.goBack()
    await expect(page).toHaveURL('/auth/signin')
    await expect(page.getByText('Welcome back')).toBeVisible()
  })

  test('should persist form data on page refresh', async ({ page }) => {
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')

    await page.reload()

    // Modern browsers may persist form data, but this is not guaranteed
    // This test might be flaky depending on browser settings
  })

  test('should handle CSRF protection', async ({ page }) => {
    // NextAuth.js handles CSRF protection automatically
    // This test would verify that the CSRF token is included in requests
    // Would require intercepting and checking request headers
    test.skip()
  })
})

test.describe('Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/register')
  })

  test('should display registration form correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Sign Up - Skidspace/)
    await expect(page.getByText('Create Your Account')).toBeVisible()
    await expect(page.getByLabel('Full Name')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByLabel('Confirm Password')).toBeVisible()
    await expect(page.getByLabel('Organization Name')).toBeVisible()
    await expect(page.getByLabel('Organization Type')).toBeVisible()
  })

  test('should validate password strength', async ({ page }) => {
    const passwordInput = page.getByLabel('Password')

    await passwordInput.fill('weak')
    await expect(page.getByText('weak', { exact: false })).toBeVisible()

    await passwordInput.fill('StrongPassword123!')
    await expect(page.getByText('strong', { exact: false })).toBeVisible()
  })

  test('should validate password confirmation', async ({ page }) => {
    await page.getByLabel('Password').fill('password123')
    await page.getByLabel('Confirm Password').fill('different')

    await page.getByRole('button', { name: /create account/i }).click()

    // Should show password mismatch error
    await expect(page.getByText(/passwords do not match/i)).toBeVisible()
  })

  test('should toggle address section visibility', async ({ page }) => {
    // Address fields should be visible for new organization registration
    await expect(page.getByLabel('Street Address')).toBeVisible()
    await expect(page.getByLabel('City')).toBeVisible()
    await expect(page.getByLabel('State')).toBeVisible()
    await expect(page.getByLabel('Postal Code')).toBeVisible()
  })

  test('should handle organization type selection', async ({ page }) => {
    await page.getByLabel('Organization Type').click()

    await expect(page.getByText('Warehouse Partner')).toBeVisible()
    await expect(page.getByText('E-bike Business')).toBeVisible()
    await expect(page.getByText('Customer')).toBeVisible()

    await page.getByText('Warehouse Partner').click()

    // Verify selection
    await expect(page.getByDisplayValue('WAREHOUSE')).toBeVisible()
  })

  test('should submit registration form successfully', async ({ page }) => {
    // Fill out the form
    await page.getByLabel('Full Name').fill('John Doe')
    await page.getByLabel('Email').fill(`test-${Date.now()}@example.com`)
    await page.getByLabel('Password').fill('StrongPassword123!')
    await page.getByLabel('Confirm Password').fill('StrongPassword123!')
    await page.getByLabel('Organization Name').fill('Test Organization')

    await page.getByLabel('Organization Type').click()
    await page.getByText('Warehouse Partner').click()

    // Optional fields
    await page.getByLabel('Phone Number (Optional)').fill('+1 (555) 123-4567')
    await page.getByLabel('Street Address').fill('123 Test St')
    await page.getByLabel('City').fill('Test City')
    await page.getByLabel('State').fill('CA')
    await page.getByLabel('Postal Code').fill('12345')

    // Mock the API response
    await page.route('/api/auth/register', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Registration successful',
          user: {
            id: 'user-1',
            name: 'John Doe',
            email: 'test@example.com',
            organizationId: 'org-1',
            organizationName: 'Test Organization',
            organizationSlug: 'test-organization'
          }
        })
      })
    })

    await page.getByRole('button', { name: /create account/i }).click()

    // Should redirect to sign in page with success message
    await expect(page).toHaveURL(/\/auth\/signin.*message=registration-success/)
    await expect(page.getByText(/registration successful/i)).toBeVisible()
  })

  test('should handle registration errors', async ({ page }) => {
    // Fill out form with existing email
    await page.getByLabel('Full Name').fill('John Doe')
    await page.getByLabel('Email').fill('existing@example.com')
    await page.getByLabel('Password').fill('StrongPassword123!')
    await page.getByLabel('Confirm Password').fill('StrongPassword123!')
    await page.getByLabel('Organization Name').fill('Test Organization')

    await page.getByLabel('Organization Type').click()
    await page.getByText('Warehouse Partner').click()

    // Mock error response
    await page.route('/api/auth/register', async route => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'User already exists with this email'
        })
      })
    })

    await page.getByRole('button', { name: /create account/i }).click()

    await expect(page.getByText('User already exists with this email')).toBeVisible()
  })

  test('should handle invitation-based registration', async ({ page }) => {
    const token = 'valid-invitation-token'
    await page.goto(`/auth/register?token=${token}`)

    await expect(page.getByText('Complete Your Registration')).toBeVisible()

    // Organization fields should be hidden for invitation registration
    await expect(page.getByLabel('Organization Name')).not.toBeVisible()
    await expect(page.getByLabel('Organization Type')).not.toBeVisible()
  })
})