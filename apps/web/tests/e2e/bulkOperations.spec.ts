import { test, expect, Page } from '@playwright/test';

// Test data
const adminUser = {
  email: 'admin@warehouse-network.com',
  password: 'admin123',
};

// Test customers for bulk operations
const testCustomers = [
  {
    email: 'bulk-test-1@example.com',
    firstName: 'Bulk',
    lastName: 'Test One',
    company: 'Test Company 1',
    overdueAmount: 1000,
    daysOverdue: 15,
  },
  {
    email: 'bulk-test-2@example.com',
    firstName: 'Bulk',
    lastName: 'Test Two',
    company: 'Test Company 2',
    overdueAmount: 2000,
    daysOverdue: 30,
  },
  {
    email: 'bulk-test-3@example.com',
    firstName: 'Bulk',
    lastName: 'Test Three',
    company: 'Test Company 3',
    overdueAmount: 500,
    daysOverdue: 7,
  },
  {
    email: 'bulk-test-4@example.com',
    firstName: 'Bulk',
    lastName: 'Test Four',
    company: 'Test Company 4',
    overdueAmount: 3000,
    daysOverdue: 45,
  },
  {
    email: 'bulk-test-5@example.com',
    firstName: 'Bulk',
    lastName: 'Test Five',
    company: 'Test Company 5',
    overdueAmount: 0,
    daysOverdue: 0,
  },
];

// Helper functions
async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', adminUser.email);
  await page.fill('input[name="password"]', adminUser.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/admin/dashboard');
}

async function createTestCustomers(page: Page) {
  // This would typically be done through API or database seeding
  // For E2E test, we'll use the admin interface to create customers
  for (const customer of testCustomers) {
    await page.goto('/admin/customers/new');
    await page.fill('input[name="email"]', customer.email);
    await page.fill('input[name="firstName"]', customer.firstName);
    await page.fill('input[name="lastName"]', customer.lastName);
    await page.fill('input[name="company"]', customer.company);
    await page.fill('input[name="overdueAmount"]', customer.overdueAmount.toString());
    await page.fill('input[name="daysOverdue"]', customer.daysOverdue.toString());
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
  }
}

test.describe('Bulk Operations', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    await createTestCustomers(page);
    await page.close();
  });

  test('Bulk lock customers', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Filter to show test customers
    await page.fill('input[placeholder*="Search"]', 'bulk-test');
    await page.waitForTimeout(500);

    // Select customers with overdue amounts
    const checkboxes = page.locator('input[type="checkbox"][data-customer-email*="bulk-test"]');
    const count = await checkboxes.count();

    // Select first 3 customers
    for (let i = 0; i < Math.min(3, count); i++) {
      await checkboxes.nth(i).check();
    }

    // Verify selection count
    await expect(page.locator('text=3 customers selected')).toBeVisible();

    // Enable bulk actions
    await expect(page.locator('.bulk-actions-bar')).toBeVisible();

    // Click bulk lock
    await page.click('button:has-text("Lock Selected (3)")');

    // Confirmation modal
    await expect(page.locator('h2:has-text("Bulk Lock Accounts")')).toBeVisible();
    await expect(page.locator('text=You are about to lock 3 customer accounts')).toBeVisible();

    // Enter lock reason
    await page.fill('textarea[name="reason"]', 'Bulk lock - Overdue payments E2E test');

    // Confirm
    await page.click('button:has-text("Lock 3 Accounts")');

    // Wait for success
    await expect(page.locator('.toast-success')).toContainText('3 accounts locked successfully');

    // Verify locked status
    await page.waitForTimeout(1000);
    const lockedBadges = page.locator('tr:has-text("bulk-test") .badge:has-text("Locked")');
    expect(await lockedBadges.count()).toBeGreaterThanOrEqual(3);
  });

  test('Bulk unlock customers', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Filter to show locked test customers
    await page.fill('input[placeholder*="Search"]', 'bulk-test');
    await page.selectOption('select[name="status"]', 'locked');
    await page.waitForTimeout(500);

    // Select all visible locked customers
    const selectAllCheckbox = page.locator('input[type="checkbox"][aria-label="Select all"]');
    await selectAllCheckbox.check();

    // Click bulk unlock
    await page.click('button:has-text("Unlock Selected")');

    // Confirmation modal
    await expect(page.locator('h2:has-text("Bulk Unlock Accounts")')).toBeVisible();

    // Confirm
    await page.click('button:has-text("Unlock")');

    // Wait for success
    await expect(page.locator('.toast-success')).toContainText('accounts unlocked successfully');

    // Clear filters to see all customers
    await page.click('button:has-text("Clear Filters")');
    await page.fill('input[placeholder*="Search"]', 'bulk-test');
    await page.waitForTimeout(500);

    // Verify unlocked status
    const activeBadges = page.locator('tr:has-text("bulk-test") .badge:has-text("Active")');
    expect(await activeBadges.count()).toBeGreaterThan(0);
  });

  test('Bulk send payment reminders', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Filter to show customers with overdue amounts
    await page.fill('input[placeholder*="Search"]', 'bulk-test');
    await page.selectOption('select[name="overdueStatus"]', 'overdue');
    await page.waitForTimeout(500);

    // Select customers
    const checkboxes = page.locator('input[type="checkbox"][data-customer-email*="bulk-test"]');
    const count = await checkboxes.count();

    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }

    // Click send reminders
    await page.click('button:has-text("Send Reminders")');

    // Confirmation modal
    await expect(page.locator('h2:has-text("Send Payment Reminders")')).toBeVisible();

    // Should show preview of reminders
    await expect(page.locator('text=Customer')).toBeVisible();
    await expect(page.locator('text=Overdue Amount')).toBeVisible();
    await expect(page.locator('text=Days Overdue')).toBeVisible();

    // Customize message (optional)
    const messageTextarea = page.locator('textarea[name="customMessage"]');
    if (await messageTextarea.isVisible()) {
      await messageTextarea.fill(
        'This is a reminder about your overdue payment. Please pay as soon as possible to avoid account restrictions.'
      );
    }

    // Send reminders
    await page.click('button:has-text("Send Reminders")');

    // Wait for success
    await expect(page.locator('.toast-success')).toContainText('Payment reminders sent');

    // Should show summary
    await expect(page.locator('text=/\\d+ reminders sent successfully/')).toBeVisible();
  });

  test('Bulk operations from overdue report', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/payments/overdue');

    // Wait for report to load
    await page.waitForSelector('h1:has-text("Overdue Report")');

    // Filter by days overdue
    await page.selectOption('select[name="daysOverdue"]', '30+');
    await page.waitForTimeout(500);

    // Select all high-risk accounts
    const selectAllCheckbox = page.locator('input[type="checkbox"][aria-label="Select all"]');
    await selectAllCheckbox.check();

    // Verify selection
    const selectedCount = await page.locator('text=/\\d+ customers selected/').textContent();
    expect(selectedCount).toBeTruthy();

    // Bulk lock high-risk accounts
    await page.click('button:has-text("Lock Accounts")');

    // Fill reason with risk assessment
    await page.fill(
      'textarea[name="reason"]',
      'High risk - 30+ days overdue - Automated bulk lock'
    );

    // Add notes about follow-up actions
    const notesField = page.locator('textarea[name="internalNotes"]');
    if (await notesField.isVisible()) {
      await notesField.fill(
        'Accounts locked due to extended overdue period. Follow up with collections team.'
      );
    }

    // Confirm
    await page.click('button:has-text("Lock Accounts")');

    // Wait for success
    await expect(page.locator('.toast-success')).toContainText('accounts locked');

    // Should update report view
    await page.waitForTimeout(1000);
    const lockedIndicators = page.locator('.lock-indicator:visible');
    expect(await lockedIndicators.count()).toBeGreaterThan(0);
  });

  test('Bulk export customer data', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Filter test customers
    await page.fill('input[placeholder*="Search"]', 'bulk-test');
    await page.waitForTimeout(500);

    // Select all
    const selectAllCheckbox = page.locator('input[type="checkbox"][aria-label="Select all"]');
    await selectAllCheckbox.check();

    // Click export
    await page.click('button:has-text("Export Selected")');

    // Export options modal
    await expect(page.locator('h2:has-text("Export Customer Data")')).toBeVisible();

    // Select fields to export
    await page.check('input[name="exportFields.basicInfo"]');
    await page.check('input[name="exportFields.paymentHistory"]');
    await page.check('input[name="exportFields.accountStatus"]');

    // Select format
    await page.selectOption('select[name="exportFormat"]', 'csv');

    // Start export
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export")');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('customers');
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('Bulk operations with filters', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Apply multiple filters
    await page.selectOption('select[name="overdueStatus"]', 'overdue');
    await page.selectOption('select[name="daysOverdueRange"]', '15-30');
    await page.selectOption('select[name="status"]', 'active');
    await page.waitForTimeout(500);

    // Count filtered results
    const rows = page.locator('table tbody tr');
    const initialCount = await rows.count();

    // Select all filtered
    const selectAllCheckbox = page.locator('input[type="checkbox"][aria-label="Select all"]');
    await selectAllCheckbox.check();

    // Perform bulk action on filtered set
    await page.click('button:has-text("Send Reminders")');

    // Should show filtered count
    await expect(page.locator(`text=Send reminders to ${initialCount} customers`)).toBeVisible();

    // Cancel and try different action
    await page.click('button:has-text("Cancel")');

    // Lock filtered customers
    await page.click('button:has-text("Lock Selected")');
    await page.fill('textarea[name="reason"]', 'Filtered bulk lock - 15-30 days overdue');
    await page.click('button:has-text("Lock")');

    // Verify only filtered customers were affected
    await expect(page.locator('.toast-success')).toContainText(`${initialCount} accounts locked`);
  });

  test('Bulk operations error handling', async ({ page, context }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Select some customers
    const checkboxes = page.locator('input[type="checkbox"]').slice(1, 4);
    for (let i = 0; i < (await checkboxes.count()); i++) {
      await checkboxes.nth(i).check();
    }

    // Intercept API to simulate partial failure
    await context.route('**/api/admin/customers/bulk', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          count: 2,
          failed: 1,
          errors: [
            {
              customerId: 'cust123',
              error: 'Customer has pending transactions',
            },
          ],
        }),
      });
    });

    // Perform bulk lock
    await page.click('button:has-text("Lock Selected")');
    await page.fill('textarea[name="reason"]', 'Test partial failure');
    await page.click('button:has-text("Lock")');

    // Should show partial success message
    await expect(page.locator('.toast-warning')).toContainText('2 of 3 accounts locked');

    // Should show error details
    await expect(page.locator('.error-details')).toBeVisible();
    await expect(page.locator('text=Customer has pending transactions')).toBeVisible();

    // Option to retry failed
    await expect(page.locator('button:has-text("Retry Failed")'));
  });

  test('Bulk operations audit trail', async ({ page }) => {
    await loginAsAdmin(page);

    // Perform a bulk operation first
    await page.goto('/admin/customers');
    await page.fill('input[placeholder*="Search"]', 'bulk-test');
    await page.waitForTimeout(500);

    const checkboxes = page
      .locator('input[type="checkbox"][data-customer-email*="bulk-test"]')
      .first(2);
    for (let i = 0; i < (await checkboxes.count()); i++) {
      await checkboxes.nth(i).check();
    }

    await page.click('button:has-text("Send Reminders")');
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(1000);

    // Navigate to audit log
    await page.goto('/admin/audit-log');
    await page.waitForSelector('h1:has-text("Audit Log")');

    // Filter by bulk operations
    await page.selectOption('select[name="actionType"]', 'BULK_OPERATION');
    await page.waitForTimeout(500);

    // Should see recent bulk operation
    const auditEntry = page.locator('tr:has-text("BULK_PAYMENT_REMINDER")').first();
    await expect(auditEntry).toBeVisible();

    // Click for details
    await auditEntry.click();

    // Should show operation details
    await expect(page.locator('h2:has-text("Audit Details")')).toBeVisible();
    await expect(page.locator('text=Action: BULK_PAYMENT_REMINDER')).toBeVisible();
    await expect(page.locator('text=Affected Customers: 2')).toBeVisible();
    await expect(page.locator('text=Performed By:')).toBeVisible();

    // Should list affected customers
    await expect(page.locator('text=Affected Customer IDs')).toBeVisible();
  });

  test('Scheduled bulk operations', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers');

    // Select customers for scheduled operation
    await page.fill('input[placeholder*="Search"]', 'bulk-test');
    await page.waitForTimeout(500);

    const selectAllCheckbox = page.locator('input[type="checkbox"][aria-label="Select all"]');
    await selectAllCheckbox.check();

    // Click schedule instead of immediate action
    await page.click('button[aria-label="More actions"]');
    await page.click('text=Schedule Action');

    // Schedule configuration
    await expect(page.locator('h2:has-text("Schedule Bulk Action")')).toBeVisible();

    // Select action type
    await page.selectOption('select[name="actionType"]', 'lock');

    // Set schedule
    await page.click('input[type="radio"][value="once"]');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.fill('input[name="scheduledDate"]', tomorrow.toISOString().split('T')[0]);
    await page.fill('input[name="scheduledTime"]', '09:00');

    // Set conditions
    await page.check('input[name="conditions.checkOverdueStatus"]');
    await page.fill('input[name="conditions.minDaysOverdue"]', '30');

    // Lock reason
    await page.fill('textarea[name="reason"]', 'Scheduled lock - 30+ days overdue');

    // Save schedule
    await page.click('button:has-text("Schedule")');

    // Should see confirmation
    await expect(page.locator('.toast-success')).toContainText('Bulk action scheduled');

    // View scheduled actions
    await page.goto('/admin/scheduled-actions');
    await expect(page.locator('text=Bulk Lock - 30+ days overdue')).toBeVisible();
  });

  test('Bulk operations with CSV import', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/customers/bulk-import');

    // Create CSV content
    const csvContent = `email,action,reason
bulk-test-1@example.com,lock,Imported bulk lock
bulk-test-2@example.com,remind,
bulk-test-3@example.com,unlock,`;

    // Create file
    const buffer = Buffer.from(csvContent);

    // Upload file
    await page.setInputFiles('input[type="file"]', {
      name: 'bulk-operations.csv',
      mimeType: 'text/csv',
      buffer: buffer,
    });

    // Preview should show
    await expect(page.locator('h3:has-text("Preview")')).toBeVisible();
    await expect(page.locator('text=3 operations to perform')).toBeVisible();

    // Verify preview table
    await expect(page.locator('td:has-text("bulk-test-1@example.com")')).toBeVisible();
    await expect(page.locator('td:has-text("lock")')).toBeVisible();
    await expect(page.locator('td:has-text("Imported bulk lock")')).toBeVisible();

    // Process import
    await page.click('button:has-text("Process Import")');

    // Progress indicator
    await expect(page.locator('.progress-bar')).toBeVisible();

    // Results
    await expect(page.locator('text=Import completed')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Successful: 3')).toBeVisible();

    // Download results
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download Results")');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('import-results');
  });
});
