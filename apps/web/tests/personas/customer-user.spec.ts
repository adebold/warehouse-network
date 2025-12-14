import { test, expect } from '@playwright/test';

test.describe('Customer User Persona', () => {
  test('should view inventory but be denied access to create RFQs, disputes, and admin pages', async ({ page }) => {
    // Navigate to inventory
    await page.goto('/app/inventory');
    await expect(page.locator('h1')).toHaveText('Your Inventory');
    // Expect some inventory (if seeded)
    await expect(page.locator('table')).toBeVisible();

    // Attempt to submit an RFQ (should be denied)
    await page.goto('/app/quotes/new');
    await expect(page.locator('h1')).toHaveText('Access Denied');

    // Attempt to submit a dispute (should be denied)
    await page.goto('/app/disputes/new');
    await expect(page.locator('h1')).toHaveText('Access Denied');

    // Attempt to access admin pages (should be denied)
    await page.goto('/admin/operator-applications');
    await expect(page.locator('h1')).toHaveText('Access Denied');

    // Attempt to access operator mobile pages (should be denied)
    await page.goto('/operator/mobile/receive');
    await expect(page.locator('h1')).toHaveText('Access Denied');
  });
});