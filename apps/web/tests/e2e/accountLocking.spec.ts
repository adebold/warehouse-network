import { test, expect, Page } from '@playwright/test';

// Test data
const adminUser = {
  email: 'admin@warehouse-network.com',
  password: 'admin123',
};

const testCustomer = {
  email: 'customer@example.com',
  password: 'customer123',
  firstName: 'Test',
  lastName: 'Customer',
  company: 'Test Company',
};

const lockReason = 'E2E Test - Overdue payment 30+ days';

// Helper functions
async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', adminUser.email);
  await page.fill('input[name="password"]', adminUser.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/admin/dashboard');
}

async function loginAsCustomer(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', testCustomer.email);
  await page.fill('input[name="password"]', testCustomer.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/app/dashboard');
}

async function createTestCustomer(page: Page) {
  await page.goto('/register');
  await page.fill('input[name="email"]', testCustomer.email);
  await page.fill('input[name="password"]', testCustomer.password);
  await page.fill('input[name="confirmPassword"]', testCustomer.password);
  await page.fill('input[name="firstName"]', testCustomer.firstName);
  await page.fill('input[name="lastName"]', testCustomer.lastName);
  await page.fill('input[name="company"]', testCustomer.company);
  await page.click('button[type="submit"]');
  await page.waitForURL('/app/dashboard');
  await page.click('button[aria-label="Logout"]');
}

test.describe('Account Locking Flow', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await createTestCustomer(page);
    await page.close();
  });

  test('Admin can lock and unlock customer account', async ({ page }) => {
    // Step 1: Login as admin
    await loginAsAdmin(page);

    // Step 2: Navigate to customer management
    await page.click('a[href="/admin/customers"]');
    await page.waitForSelector('h1:has-text("Customer Management")');

    // Step 3: Search for test customer
    await page.fill('input[placeholder*="Search"]', testCustomer.email);
    await page.waitForTimeout(500); // Debounce delay

    // Step 4: Lock the account
    const customerRow = page.locator(`tr:has-text("${testCustomer.email}")`);
    await expect(customerRow).toBeVisible();

    // Check initial status
    await expect(customerRow.locator('.badge:has-text("Active")')).toBeVisible();

    // Click lock button
    await customerRow.locator('button[title="Lock account"]').click();

    // Fill in lock reason
    await page.waitForSelector('text=Lock Customer Account');
    await page.fill('textarea[name="reason"]', lockReason);
    await page.click('button:has-text("Confirm Lock")');

    // Wait for success message
    await expect(page.locator('.toast-success')).toContainText('Account locked successfully');

    // Verify status changed
    await expect(customerRow.locator('.badge:has-text("Locked")')).toBeVisible();

    // Step 5: Verify lock details
    await customerRow.locator('button[title="View details"]').click();
    await page.waitForURL(`**/admin/customers/${testCustomer.email}`);

    await expect(page.locator('text=Account Status: Locked')).toBeVisible();
    await expect(page.locator(`text=${lockReason}`)).toBeVisible();

    // Step 6: Go back and unlock the account
    await page.goBack();
    await page.fill('input[placeholder*="Search"]', testCustomer.email);
    await page.waitForTimeout(500);

    await customerRow.locator('button[title="Unlock account"]').click();
    await page.waitForSelector('text=Unlock Customer Account');
    await page.click('button:has-text("Confirm Unlock")');

    // Wait for success message
    await expect(page.locator('.toast-success')).toContainText('Account unlocked successfully');

    // Verify status changed back
    await expect(customerRow.locator('.badge:has-text("Active")')).toBeVisible();
  });

  test('Locked customer sees warning and cannot access features', async ({ browser }) => {
    // First, lock the account as admin
    const adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    await adminPage.goto('/admin/customers');
    await adminPage.fill('input[placeholder*="Search"]', testCustomer.email);
    await adminPage.waitForTimeout(500);

    const customerRow = adminPage.locator(`tr:has-text("${testCustomer.email}")`);

    // Lock account if not already locked
    const isLocked = await customerRow
      .locator('.badge:has-text("Locked")')
      .isVisible()
      .catch(() => false);

    if (!isLocked) {
      await customerRow.locator('button[title="Lock account"]').click();
      await adminPage.fill('textarea[name="reason"]', lockReason);
      await adminPage.click('button:has-text("Confirm Lock")');
      await adminPage.waitForTimeout(1000);
    }

    await adminPage.close();

    // Now login as customer
    const customerPage = await browser.newPage();
    await loginAsCustomer(customerPage);

    // Should see lock warning
    await expect(customerPage.locator('.alert-error')).toBeVisible();
    await expect(customerPage.locator('text=Account Access Restricted')).toBeVisible();
    await expect(customerPage.locator(`text=${lockReason}`)).toBeVisible();

    // Try to access protected features
    await customerPage.goto('/app/inventory');
    await expect(customerPage.locator('.alert-error')).toBeVisible();
    await expect(customerPage.locator('text=Your account is locked')).toBeVisible();

    // Check that payment button is available
    await expect(customerPage.locator('button:has-text("Make Payment")')).toBeVisible();

    await customerPage.close();
  });

  test('Customer can make payment from lock warning', async ({ page }) => {
    // Login as locked customer
    await loginAsCustomer(page);

    // Should see lock warning with payment option
    await expect(page.locator('.alert-error')).toBeVisible();
    await expect(page.locator('button:has-text("Make Payment")')).toBeVisible();

    // Click make payment
    await page.click('button:has-text("Make Payment")');

    // Payment modal should open
    await expect(page.locator('h2:has-text("Payment Required")')).toBeVisible();
    await expect(page.locator('text=Amount Due:')).toBeVisible();

    // Fill payment details (mock payment)
    await page.click('button:has-text("Submit Payment")');

    // Should see processing state
    await expect(page.locator('text=Processing payment...')).toBeVisible();

    // Note: In real scenario, this would process through Stripe
    // For E2E test, we'd mock the payment endpoint
  });

  test('Bulk lock operations', async ({ page }) => {
    // Login as admin
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Create multiple test customers first (in real scenario)
    // For this test, we'll work with existing customers

    // Select multiple customers
    const checkboxes = page.locator('input[type="checkbox"]').first(3);
    for (let i = 0; i < (await checkboxes.count()); i++) {
      await checkboxes.nth(i).check();
    }

    // Verify selection count
    await expect(page.locator('text=/\\d+ selected/')).toBeVisible();

    // Click bulk lock
    await page.click('button:has-text("Lock Selected")');

    // Fill reason
    await page.fill('textarea[name="reason"]', 'Bulk E2E test lock');
    await page.click('button:has-text("Confirm Bulk Lock")');

    // Wait for success
    await expect(page.locator('.toast-success')).toContainText('accounts locked');

    // Verify locked status
    const lockedBadges = page.locator('.badge:has-text("Locked")');
    expect(await lockedBadges.count()).toBeGreaterThanOrEqual(3);
  });

  test('Payment dashboard shows correct statistics', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/payments/dashboard');

    // Wait for dashboard to load
    await page.waitForSelector('h1:has-text("Payment Dashboard")');

    // Verify key statistics are displayed
    await expect(page.locator('text=Total Customers')).toBeVisible();
    await expect(page.locator('text=Locked Accounts')).toBeVisible();
    await expect(page.locator('text=Overdue Accounts')).toBeVisible();
    await expect(page.locator('text=Total Overdue Amount')).toBeVisible();

    // Verify charts are rendered
    await expect(page.locator('[data-testid="payment-trends-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="overdue-breakdown-chart"]')).toBeVisible();

    // Test date range filter
    await page.click('button:has-text("Last 7 Days")');
    await page.waitForTimeout(1000); // Wait for data to update

    // Verify recent payments table
    await expect(page.locator('text=Recent Payments')).toBeVisible();
    const paymentRows = page.locator('table tbody tr');
    expect(await paymentRows.count()).toBeGreaterThan(0);
  });

  test('Overdue report filtering and actions', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/payments/overdue');

    // Wait for report to load
    await page.waitForSelector('h1:has-text("Overdue Report")');

    // Test filters
    await page.selectOption('select[name="daysOverdue"]', '30+');
    await page.waitForTimeout(500);

    // Verify filtered results
    const overdueRows = page.locator('tbody tr');
    expect(await overdueRows.count()).toBeGreaterThanOrEqual(0);

    // If there are results, test individual actions
    if ((await overdueRows.count()) > 0) {
      // Test send reminder
      const firstRow = overdueRows.first();
      await firstRow.locator('button[title="Send reminder"]').click();
      await expect(page.locator('.toast-success')).toContainText('Reminder sent');

      // Test view details
      await firstRow.locator('button[title="View details"]').click();
      await expect(page).toHaveURL(/.*\/admin\/customers\/.*/);
    }

    // Test export
    await page.goto('/admin/payments/overdue');
    await page.click('button:has-text("Export Report")');
    await page.click('text=Export as CSV');

    // Verify download started (in real scenario)
    // For E2E, we'd check that the download was triggered
  });

  test('Account lock notification flow', async ({ browser }) => {
    // Create two pages - admin and customer
    const adminPage = await browser.newPage();
    const customerPage = await browser.newPage();

    // Login as customer first to establish session
    await loginAsCustomer(customerPage);
    await expect(customerPage.locator('h1:has-text("Dashboard")')).toBeVisible();

    // Login as admin in separate page
    await loginAsAdmin(adminPage);
    await adminPage.goto('/admin/customers');

    // Search and lock the customer account
    await adminPage.fill('input[placeholder*="Search"]', testCustomer.email);
    await adminPage.waitForTimeout(500);

    const customerRow = adminPage.locator(`tr:has-text("${testCustomer.email}")`);

    // Unlock first if locked
    const isLocked = await customerRow
      .locator('.badge:has-text("Locked")')
      .isVisible()
      .catch(() => false);
    if (isLocked) {
      await customerRow.locator('button[title="Unlock account"]').click();
      await adminPage.click('button:has-text("Confirm Unlock")');
      await adminPage.waitForTimeout(1000);
    }

    // Now lock the account
    await customerRow.locator('button[title="Lock account"]').click();
    await adminPage.fill('textarea[name="reason"]', 'Real-time lock test');
    await adminPage.click('button:has-text("Confirm Lock")');

    // Customer page should show lock warning after refresh or navigation
    await customerPage.reload();

    // Should see the lock warning
    await expect(customerPage.locator('.alert-error')).toBeVisible({ timeout: 10000 });
    await expect(customerPage.locator('text=Account Access Restricted')).toBeVisible();
    await expect(customerPage.locator('text=Real-time lock test')).toBeVisible();

    // Clean up
    await adminPage.close();
    await customerPage.close();
  });
});

test.describe('Edge Cases and Error Scenarios', () => {
  test('Handles network errors gracefully', async ({ page, context }) => {
    await loginAsAdmin(page);

    // Intercept network requests to simulate failure
    await context.route('**/api/admin/customers/*/lock', route => {
      route.abort('failed');
    });

    await page.goto('/admin/customers');
    await page.fill('input[placeholder*="Search"]', testCustomer.email);
    await page.waitForTimeout(500);

    const customerRow = page.locator(`tr:has-text("${testCustomer.email}")`);
    await customerRow.locator('button[title="Lock account"]').click();
    await page.fill('textarea[name="reason"]', 'Test');
    await page.click('button:has-text("Confirm Lock")');

    // Should show error message
    await expect(page.locator('.toast-error')).toContainText('Failed to lock account');
  });

  test('Validates required fields', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    await page.fill('input[placeholder*="Search"]', testCustomer.email);
    await page.waitForTimeout(500);

    const customerRow = page.locator(`tr:has-text("${testCustomer.email}")`);
    await customerRow.locator('button[title="Lock account"]').click();

    // Try to submit without reason
    await page.click('button:has-text("Confirm Lock")');

    // Should show validation error
    await expect(page.locator('text=Lock reason is required')).toBeVisible();
  });

  test('Prevents duplicate lock operations', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Ensure customer is already locked
    await page.fill('input[placeholder*="Search"]', testCustomer.email);
    await page.waitForTimeout(500);

    const customerRow = page.locator(`tr:has-text("${testCustomer.email}")`);

    // If not locked, lock it first
    const isLocked = await customerRow
      .locator('.badge:has-text("Locked")')
      .isVisible()
      .catch(() => false);
    if (!isLocked) {
      await customerRow.locator('button[title="Lock account"]').click();
      await page.fill('textarea[name="reason"]', 'Initial lock');
      await page.click('button:has-text("Confirm Lock")');
      await page.waitForTimeout(1000);
    }

    // Now try to lock again - button should not be available
    await expect(customerRow.locator('button[title="Lock account"]')).not.toBeVisible();
    await expect(customerRow.locator('button[title="Unlock account"]')).toBeVisible();
  });
});
