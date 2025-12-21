import { test, expect, Page } from '@playwright/test';

// Test data
const testCustomer = {
  email: 'payment-test@example.com',
  password: 'test123',
  firstName: 'Payment',
  lastName: 'Tester',
  company: 'Test Payments Inc',
};

const adminUser = {
  email: 'admin@warehouse-network.com',
  password: 'admin123',
};

// Mock payment data
const testPayment = {
  amount: 1500.0,
  cardNumber: '4242424242424242',
  expiryDate: '12/25',
  cvv: '123',
  cardholderName: 'Payment Tester',
};

// Helper functions
async function loginAsCustomer(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', testCustomer.email);
  await page.fill('input[name="password"]', testCustomer.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/app/dashboard');
}

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', adminUser.email);
  await page.fill('input[name="password"]', adminUser.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/admin/dashboard');
}

async function setupTestCustomerWithOverdue(page: Page) {
  // This would typically be done through API or database seeding
  // For E2E test, we'll simulate by having admin set overdue status
  await loginAsAdmin(page);
  await page.goto('/admin/customers');
  await page.fill('input[placeholder*="Search"]', testCustomer.email);
  await page.waitForTimeout(500);

  // Set overdue amount through admin interface
  const customerRow = page.locator(`tr:has-text("${testCustomer.email}")`);
  await customerRow.locator('button[title="Edit"]').click();
  await page.fill('input[name="overdueAmount"]', testPayment.amount.toString());
  await page.fill('input[name="daysOverdue"]', '15');
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(500);

  await page.click('button[aria-label="Logout"]');
}

test.describe('Payment Submission Flow', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    // Create test customer
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

    // Setup overdue amount
    await setupTestCustomerWithOverdue(page);

    await page.close();
  });

  test('Customer can submit payment for overdue amount', async ({ page }) => {
    await loginAsCustomer(page);

    // Should see overdue notification
    await expect(page.locator('.alert-warning')).toBeVisible();
    await expect(page.locator('text=You have an overdue balance')).toBeVisible();
    await expect(page.locator(`text=$${testPayment.amount}`)).toBeVisible();

    // Click make payment
    await page.click('button:has-text("Make Payment")');

    // Payment form should open
    await expect(page.locator('h2:has-text("Make a Payment")')).toBeVisible();
    await expect(page.locator(`text=Amount Due: $${testPayment.amount}`)).toBeVisible();

    // Fill payment details
    await page.fill('input[name="cardNumber"]', testPayment.cardNumber);
    await page.fill('input[name="expiryDate"]', testPayment.expiryDate);
    await page.fill('input[name="cvv"]', testPayment.cvv);
    await page.fill('input[name="cardholderName"]', testPayment.cardholderName);

    // Submit payment
    await page.click('button:has-text("Submit Payment")');

    // Wait for processing
    await expect(page.locator('text=Processing payment...')).toBeVisible();

    // Should see success message
    await expect(page.locator('.toast-success')).toContainText('Payment successful');

    // Overdue warning should disappear
    await expect(page.locator('.alert-warning')).not.toBeVisible();
  });

  test('Payment form validation', async ({ page }) => {
    await loginAsCustomer(page);

    // Navigate to payments page
    await page.click('a[href="/app/payments"]');
    await page.waitForSelector('h1:has-text("Payments")');

    // Click make payment
    await page.click('button:has-text("Make Payment")');

    // Try to submit empty form
    await page.click('button:has-text("Submit Payment")');

    // Should see validation errors
    await expect(page.locator('text=Card number is required')).toBeVisible();
    await expect(page.locator('text=Expiry date is required')).toBeVisible();
    await expect(page.locator('text=CVV is required')).toBeVisible();
    await expect(page.locator('text=Cardholder name is required')).toBeVisible();

    // Test invalid card number
    await page.fill('input[name="cardNumber"]', '1234567890123456');
    await page.fill('input[name="expiryDate"]', testPayment.expiryDate);
    await page.fill('input[name="cvv"]', testPayment.cvv);
    await page.fill('input[name="cardholderName"]', testPayment.cardholderName);
    await page.click('button:has-text("Submit Payment")');

    // Should see invalid card error
    await expect(page.locator('text=Invalid card number')).toBeVisible();

    // Test expired card
    await page.fill('input[name="cardNumber"]', testPayment.cardNumber);
    await page.fill('input[name="expiryDate"]', '01/20'); // Past date
    await page.click('button:has-text("Submit Payment")');

    // Should see expired card error
    await expect(page.locator('text=Card has expired')).toBeVisible();
  });

  test('Partial payment flow', async ({ page }) => {
    await loginAsCustomer(page);

    // Set up overdue amount first
    const overdueAmount = 2000;
    const partialPayment = 500;

    // Navigate to payments
    await page.click('a[href="/app/payments"]');
    await page.click('button:has-text("Make Payment")');

    // Should see full overdue amount
    await expect(page.locator('text=Amount Due:')).toBeVisible();

    // Enable custom amount
    await page.click('input[type="checkbox"][name="customAmount"]');

    // Enter partial payment
    await page.fill('input[name="amount"]', partialPayment.toString());

    // Fill payment details
    await page.fill('input[name="cardNumber"]', testPayment.cardNumber);
    await page.fill('input[name="expiryDate"]', testPayment.expiryDate);
    await page.fill('input[name="cvv"]', testPayment.cvv);
    await page.fill('input[name="cardholderName"]', testPayment.cardholderName);

    // Submit partial payment
    await page.click('button:has-text("Submit Payment")');

    // Should see success for partial payment
    await expect(page.locator('.toast-success')).toContainText(
      `Payment of $${partialPayment} successful`
    );

    // Should still see remaining balance warning
    await expect(page.locator('.alert-warning')).toBeVisible();
    await expect(page.locator('text=remaining balance')).toBeVisible();
  });

  test('Payment history and receipts', async ({ page }) => {
    await loginAsCustomer(page);

    // Navigate to payment history
    await page.click('a[href="/app/payments/history"]');
    await page.waitForSelector('h1:has-text("Payment History")');

    // Should see recent payments
    const paymentRows = page.locator('table tbody tr');
    expect(await paymentRows.count()).toBeGreaterThan(0);

    // Click on a payment to view details
    await paymentRows.first().click();

    // Should see payment details modal
    await expect(page.locator('h2:has-text("Payment Details")')).toBeVisible();
    await expect(page.locator('text=Payment ID:')).toBeVisible();
    await expect(page.locator('text=Amount:')).toBeVisible();
    await expect(page.locator('text=Status:')).toBeVisible();
    await expect(page.locator('text=Date:')).toBeVisible();

    // Download receipt
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download Receipt")');
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toContain('receipt');
    expect(download.suggestedFilename()).toContain('.pdf');
  });

  test('Failed payment retry', async ({ page, context }) => {
    await loginAsCustomer(page);

    // Intercept payment API to simulate failure
    await context.route('**/api/payments/submit', route => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Payment declined',
          code: 'card_declined',
          declineReason: 'Insufficient funds',
        }),
      });
    });

    await page.click('a[href="/app/payments"]');
    await page.click('button:has-text("Make Payment")');

    // Fill payment form
    await page.fill('input[name="cardNumber"]', testPayment.cardNumber);
    await page.fill('input[name="expiryDate"]', testPayment.expiryDate);
    await page.fill('input[name="cvv"]', testPayment.cvv);
    await page.fill('input[name="cardholderName"]', testPayment.cardholderName);

    // Submit payment
    await page.click('button:has-text("Submit Payment")');

    // Should see error message
    await expect(page.locator('.alert-error')).toBeVisible();
    await expect(page.locator('text=Payment declined')).toBeVisible();
    await expect(page.locator('text=Insufficient funds')).toBeVisible();

    // Should see retry button
    await expect(page.locator('button:has-text("Try Again")')).toBeVisible();

    // Remove route interception for retry
    await context.unroute('**/api/payments/submit');

    // Retry payment
    await page.click('button:has-text("Try Again")');

    // Should maintain form data
    await expect(page.locator('input[name="cardholderName"]')).toHaveValue(
      testPayment.cardholderName
    );

    // Use different card
    await page.fill('input[name="cardNumber"]', '5555555555554444'); // Different test card
    await page.click('button:has-text("Submit Payment")');

    // Should succeed this time
    await expect(page.locator('.toast-success')).toContainText('Payment successful');
  });

  test('Payment unlocks locked account', async ({ browser }) => {
    const adminPage = await browser.newPage();
    const customerPage = await browser.newPage();

    // First, lock the account as admin
    await loginAsAdmin(adminPage);
    await adminPage.goto('/admin/customers');
    await adminPage.fill('input[placeholder*="Search"]', testCustomer.email);
    await adminPage.waitForTimeout(500);

    const customerRow = adminPage.locator(`tr:has-text("${testCustomer.email}")`);

    // Lock account with payment-related reason
    const isLocked = await customerRow
      .locator('.badge:has-text("Locked")')
      .isVisible()
      .catch(() => false);
    if (!isLocked) {
      await customerRow.locator('button[title="Lock account"]').click();
      await adminPage.fill('textarea[name="reason"]', 'Overdue payment - $1500');
      await adminPage.click('button:has-text("Confirm Lock")');
      await adminPage.waitForTimeout(1000);
    }

    // Login as customer
    await loginAsCustomer(customerPage);

    // Should see lock warning
    await expect(customerPage.locator('.alert-error')).toBeVisible();
    await expect(customerPage.locator('text=Account Access Restricted')).toBeVisible();

    // Make payment from lock warning
    await customerPage.click('button:has-text("Make Payment")');

    // Fill payment details
    await customerPage.fill('input[name="cardNumber"]', testPayment.cardNumber);
    await customerPage.fill('input[name="expiryDate"]', testPayment.expiryDate);
    await customerPage.fill('input[name="cvv"]', testPayment.cvv);
    await customerPage.fill('input[name="cardholderName"]', testPayment.cardholderName);

    // Submit payment
    await customerPage.click('button:has-text("Submit Payment")');

    // Wait for processing
    await expect(customerPage.locator('text=Processing payment...')).toBeVisible();

    // Should see success and unlock message
    await expect(customerPage.locator('.toast-success')).toContainText('Payment successful');
    await expect(customerPage.locator('.toast-info')).toContainText('Account unlocked');

    // Lock warning should disappear
    await customerPage.reload();
    await expect(customerPage.locator('.alert-error')).not.toBeVisible();

    // Verify in admin panel
    await adminPage.reload();
    await expect(customerRow.locator('.badge:has-text("Active")')).toBeVisible();

    // Clean up
    await adminPage.close();
    await customerPage.close();
  });

  test('Scheduled payment setup', async ({ page }) => {
    await loginAsCustomer(page);

    // Navigate to payments
    await page.click('a[href="/app/payments"]');

    // Click schedule payment
    await page.click('button:has-text("Schedule Payment")');

    // Should see scheduling form
    await expect(page.locator('h2:has-text("Schedule Payment")')).toBeVisible();

    // Select payment frequency
    await page.selectOption('select[name="frequency"]', 'monthly');

    // Set start date (next month)
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const dateString = nextMonth.toISOString().split('T')[0];
    await page.fill('input[name="startDate"]', dateString);

    // Set amount
    await page.fill('input[name="amount"]', '500');

    // Fill payment method
    await page.fill('input[name="cardNumber"]', testPayment.cardNumber);
    await page.fill('input[name="expiryDate"]', testPayment.expiryDate);
    await page.fill('input[name="cvv"]', testPayment.cvv);
    await page.fill('input[name="cardholderName"]', testPayment.cardholderName);

    // Enable auto-pay for overdue
    await page.check('input[name="autoPayOverdue"]');

    // Submit schedule
    await page.click('button:has-text("Schedule Payment")');

    // Should see confirmation
    await expect(page.locator('.toast-success')).toContainText('Payment scheduled successfully');

    // Should see in scheduled payments list
    await page.click('a[href="/app/payments/scheduled"]');
    await expect(page.locator('text=Monthly payment of $500')).toBeVisible();
    await expect(page.locator(`text=Starting ${dateString}`)).toBeVisible();
  });

  test('Payment methods management', async ({ page }) => {
    await loginAsCustomer(page);

    // Navigate to payment methods
    await page.click('a[href="/app/account/payment-methods"]');
    await page.waitForSelector('h1:has-text("Payment Methods")');

    // Add new payment method
    await page.click('button:has-text("Add Payment Method")');

    // Fill card details
    await page.fill('input[name="cardNumber"]', '5555555555554444');
    await page.fill('input[name="expiryDate"]', '12/26');
    await page.fill('input[name="cvv"]', '456');
    await page.fill('input[name="cardholderName"]', 'Test Card Holder');

    // Set as default
    await page.check('input[name="setAsDefault"]');

    // Save payment method
    await page.click('button:has-text("Save Payment Method")');

    // Should see success
    await expect(page.locator('.toast-success')).toContainText('Payment method saved');

    // Should see in list
    await expect(page.locator('text=•••• 4444')).toBeVisible();
    await expect(page.locator('text=Default')).toBeVisible();

    // Test quick pay with saved method
    await page.click('button:has-text("Pay Now")');

    // Should prefill saved card
    await expect(page.locator('text=Using card ending in 4444')).toBeVisible();

    // Only need to confirm
    await page.fill('input[name="amount"]', '100');
    await page.click('button:has-text("Confirm Payment")');

    // Should process quickly
    await expect(page.locator('.toast-success')).toContainText('Payment of $100 successful');
  });

  test('Invoice payment flow', async ({ page }) => {
    await loginAsCustomer(page);

    // Navigate to invoices
    await page.click('a[href="/app/invoices"]');
    await page.waitForSelector('h1:has-text("Invoices")');

    // Find unpaid invoice
    const unpaidInvoice = page.locator('tr:has-text("Unpaid")').first();
    await expect(unpaidInvoice).toBeVisible();

    // Click pay on invoice
    await unpaidInvoice.locator('button:has-text("Pay")').click();

    // Should open payment form with invoice details
    await expect(page.locator('h2:has-text("Pay Invoice")')).toBeVisible();
    await expect(page.locator('text=Invoice #')).toBeVisible();

    // Amount should be prefilled
    const amountInput = page.locator('input[name="amount"]');
    await expect(amountInput).toBeDisabled();
    await expect(amountInput).not.toHaveValue('');

    // Use saved payment method
    await page.selectOption('select[name="paymentMethod"]', { index: 1 });

    // Submit payment
    await page.click('button:has-text("Pay Invoice")');

    // Should see success
    await expect(page.locator('.toast-success')).toContainText('Invoice paid successfully');

    // Invoice should now show as paid
    await page.reload();
    await expect(
      page.locator('tr:has(text:has-text("Invoice #")):has(text:has-text("Paid"))')
    ).toBeVisible();
  });
});

test.describe('Admin Payment Management', () => {
  test('Admin can view and manage payments', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to payments dashboard
    await page.click('a[href="/admin/payments"]');
    await page.waitForSelector('h1:has-text("Payment Management")');

    // View recent payments
    await expect(page.locator('text=Recent Payments')).toBeVisible();
    const paymentRows = page.locator('table tbody tr');
    expect(await paymentRows.count()).toBeGreaterThan(0);

    // Click on a payment for details
    await paymentRows.first().click();

    // Should see payment details
    await expect(page.locator('h2:has-text("Payment Details")')).toBeVisible();

    // Admin actions available
    await expect(page.locator('button:has-text("Refund")')).toBeVisible();
    await expect(page.locator('button:has-text("Void")')).toBeVisible();

    // Test refund
    await page.click('button:has-text("Refund")');

    // Refund form
    await expect(page.locator('h3:has-text("Process Refund")')).toBeVisible();
    await page.fill('input[name="refundAmount"]', '50');
    await page.fill('textarea[name="reason"]', 'E2E test partial refund');

    await page.click('button:has-text("Process Refund")');

    // Should see success
    await expect(page.locator('.toast-success')).toContainText('Refund processed');
  });

  test('Payment reconciliation', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to reconciliation
    await page.goto('/admin/payments/reconciliation');
    await page.waitForSelector('h1:has-text("Payment Reconciliation")');

    // Should see unmatched payments
    await expect(page.locator('text=Unmatched Payments')).toBeVisible();

    // Select date range
    await page.click('button:has-text("This Month")');

    // Export reconciliation report
    await page.click('button:has-text("Export Report")');

    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Export as Excel');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('reconciliation');
    expect(download.suggestedFilename()).toMatch(/\.xlsx?$/);
  });
});
