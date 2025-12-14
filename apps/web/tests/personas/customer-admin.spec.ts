import { test, expect } from '@playwright/test';

test.describe('Customer Admin Persona', () => {
  test('should view inventory, submit RFQ, accept quote, pay deposit, and submit dispute', async ({ page }) => {
    // Navigate to inventory
    await page.goto('/app/inventory');
    await expect(page.locator('h1')).toHaveText('Your Inventory');
    // Expect some inventory (if seeded)
    await expect(page.locator('table')).toBeVisible();

    // Navigate to submit an RFQ
    await page.goto('/app/quotes/new');
    await expect(page.locator('h1')).toHaveText('Request a New Quote');

    // Assuming a test warehouse exists and is READY_FOR_MARKETPLACE
    // Select a preferred warehouse (the one created by operator-admin test)
    await page.locator('input[type="checkbox"]').first().check();
    
    await page.getByLabel('Estimated Skid Count').fill('5');
    await page.selectOption('select[name="footprintType"]', 'STANDARD');
    await page.getByLabel('Expected Inbound Date').fill('2026-01-01');
    await page.getByLabel('Expected Duration').fill('6 months');
    await page.getByLabel('Special Handling Notes').fill('Handle with care.');
    await page.getByRole('button', { name: 'Submit RFQ' }).click();
    
    await page.waitForURL('/app/quotes');
    await expect(page.locator('text=PENDING').first()).toBeVisible(); // RFQ status is PENDING

    // TODO: Super admin needs to create a quote for this RFQ, and customer admin accepts it
    // For now, we simulate by directly going to a quote ID (assuming one exists)
    // and accepting it. This requires a quote to be in 'PENDING' state from seed or previous test.

    // Navigate to a quote detail page (assuming a quote with ID 'test-quote-id' exists and is PENDING)
    // await page.goto('/app/quotes/test-quote-id');
    // await expect(page.locator('h1')).toHaveText('Quote Details: test-quote-id');
    // await page.getByRole('button', { name: 'Accept Quote' }).click();
    // await expect(page.locator('text=ACCEPTED').first()).toBeVisible();

    // Pay deposit for an accepted quote
    // await page.getByRole('button', { name: 'Pay Deposit' }).click();
    // await expect(page.url()).toContain('checkout.stripe.com'); // Redirects to Stripe checkout

    // Navigate to submit a dispute
    await page.goto('/app/disputes/new');
    await expect(page.locator('h1')).toHaveText('Submit New Dispute');
    await page.selectOption('select[name="type"]', 'DAMAGED_GOODS');
    await page.getByLabel('Description').fill('Some skids were damaged during handling.');
    // Select affected skids (if any)
    if (await page.locator('input[type="checkbox"]').first().isVisible()) {
      await page.locator('input[type="checkbox"]').first().check();
    }
    await page.getByLabel('Evidence (URLs, description)').fill('Photos attached in email.');
    await page.getByRole('button', { name: 'Submit Dispute' }).click();

    await page.waitForURL('/app/disputes');
    await expect(page.locator('text=DAMAGED_GOODS').first()).toBeVisible();

    // Navigate to view dispute details
    await page.locator('tr', { hasText: 'DAMAGED_GOODS' }).getByRole('link', { name: 'View Details' }).first().click();
    await expect(page.locator('h1')).toContainText('Dispute Details:');
  });

  test('should be denied access to admin pages', async ({ page }) => {
    await page.goto('/admin/operator-applications');
    await expect(page.locator('h1')).toHaveText('Access Denied');
  });
});