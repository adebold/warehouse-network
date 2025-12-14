import { test, expect } from '@playwright/test';

test.describe('Operator Admin Persona', () => {
  test('should accept terms, configure profile, invite user, register warehouse, configure pricing, and initiate Stripe onboarding', async ({ page }) => {
    // Navigate to welcome page and accept terms (if applicable)
    await page.goto('/operator/welcome');
    if (await page.getByRole('button', { name: 'Accept Terms & Conditions' }).isVisible()) {
      await page.getByRole('button', { name: 'Accept Terms & Conditions' }).click();
      await page.waitForURL('/operator/dashboard');
    }

    // Navigate to settings and configure profile
    await page.goto('/operator/settings');
    await expect(page.locator('h1')).toHaveText('Operator Settings');
    await page.getByLabel('Primary Contact').fill('Updated Admin Contact');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('text=Profile updated successfully')).toBeVisible();

    // Navigate to users and invite a new WAREHOUSE_STAFF user
    await page.goto('/operator/users');
    await expect(page.locator('h1')).toHaveText('Manage Users');
    await page.getByPlaceholder('user@example.com').fill('newstaff@example.com');
    await page.getByRole('button', { name: 'Send Invitation' }).click();
    // Expect success (page reloads, so check for the new user email in the table)
    await expect(page.locator('table').filter({ hasText: 'newstaff@example.com' })).toBeVisible();

    // Navigate to register a new warehouse
    await page.goto('/operator/warehouses/new');
    await expect(page.locator('h1')).toHaveText('Register New Warehouse');
    await page.getByLabel('Warehouse Name').fill('Test Warehouse PW');
    await page.getByLabel('Address').fill('123 Test St');
    await page.getByLabel('Operating Hours').fill('9-5');
    await page.getByLabel('Capacity (Pallet Positions)').fill('1000');
    await page.getByLabel('Supported Goods Categories').fill('General Cargo');
    await page.getByLabel('Dock Access & Instructions').fill('Standard dock access');
    await page.getByRole('button', { name: 'Register Warehouse' }).click();
    await page.waitForURL('/operator/warehouses');
    await expect(page.locator('table', { hasText: 'Test Warehouse PW' })).toBeVisible();

    // Get the ID of the newly created warehouse
    const warehouseRow = page.locator('tr', { hasText: 'Test Warehouse PW' });
    const configurePricingLink = warehouseRow.getByRole('link', { name: 'Configure Pricing' });
    const warehouseId = (await configurePricingLink.getAttribute('href'))?.split('/').pop();

    // Configure pricing for the new warehouse
    await page.goto(`/operator/warehouses/${warehouseId}/pricing`);
    await expect(page.locator('h1')).toHaveText(`Pricing for Test Warehouse PW`);
    await page.getByLabel('Receiving (per skid)').fill('10');
    await page.getByLabel('Storage (per skid per day)').fill('0.5');
    await page.getByLabel('Picking (per skid or per line)').fill('5');
    await page.getByLabel('Pickup / Release (per event)').fill('20');
    await page.getByRole('button', { name: 'Save Pricing' }).click();
    await expect(page.locator('text=Pricing updated successfully')).toBeVisible();

    // Navigate to dashboard and initiate Stripe onboarding
    await page.goto('/operator/dashboard');
    await expect(page.locator('h1')).toHaveText('Operator Dashboard');
    if (await page.getByRole('button', { name: 'Connect to Stripe' }).isVisible()) {
      await page.getByRole('button', { name: 'Connect to Stripe' }).click();
      // Expect redirection to Stripe (cannot fully test Stripe flow)
      await expect(page.url()).toContain('connect.stripe.com');
      await page.goto('/operator/dashboard'); // Go back to dashboard after "initiation"
    }

    // Navigate to disputes
    await page.goto('/operator/releases');
    await expect(page.locator('h1')).toHaveText('Release Requests');
  });
});
