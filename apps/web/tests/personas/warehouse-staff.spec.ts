import { test, expect } from '@playwright/test';

test.describe('Warehouse Staff Persona', () => {
  test('should create a receiving order, generate skids, and perform a skid move', async ({
    page,
  }) => {
    // Access /operator/mobile/receive and create a receiving order
    await page.goto('/operator/mobile/receive');
    await expect(page.locator('h1')).toHaveText('Receive Skids');

    // Assuming a test customer and warehouse exist
    await page.getByLabel('Customer ID').fill('test-customer-id'); // TODO: Use a real customer ID from seed
    await page.getByLabel('Carrier').fill('Test Carrier');
    await page.getByLabel('Expected Skid Count').fill('2');
    await page.getByLabel('Notes (damage, exceptions)').fill('Fragile items');
    await page.getByRole('button', { name: 'Create Receiving Order' }).click();

    // Wait for redirection to receiving order details page
    await page.waitForURL(/\/operator\/mobile\/receiving-orders\/.+/);
    await expect(page.locator('h1')).toContainText('Receiving Order: RO-');

    // Generate skids
    await page.getByRole('button', { name: 'Generate Skids' }).click();
    await expect(page.locator('text=Skid Code')).toBeVisible(); // Check for presence of generated skids

    // Get the first skid code for moving
    const firstSkidCode = await page.locator('ul > li').first().textContent();
    expect(firstSkidCode).not.toBeNull();

    // Access /operator/mobile/move and perform a skid move
    await page.goto('/operator/mobile/move');
    await expect(page.locator('h1')).toHaveText('Move Skid');

    // Simulate scanning a Skid QR Code
    await page.evaluate(skidCode => {
      (window as any).handleScan(skidCode);
    }, firstSkidCode);

    await expect(page.locator('p', { hasText: `Skid: ${firstSkidCode}` })).toBeVisible();
    await expect(page.locator('p', { hasText: 'Scan a Location QR Code' })).toBeVisible();

    // Simulate scanning a Location QR Code
    await page.evaluate(() => {
      (window as any).handleScan('TEST-LOC-A1'); // Simulate scan for a location
    });

    await expect(page.locator('p', { hasText: 'Location: TEST-LOC-A1' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('text=Skid moved successfully')).toBeVisible();
  });

  test('should be denied access to operator admin pages', async ({ page }) => {
    await page.goto('/operator/users');
    await expect(page.locator('h1')).toHaveText('Access Denied');
  });
});
