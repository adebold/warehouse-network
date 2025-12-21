import { test, expect } from '@playwright/test';

test.describe('Super Admin Persona', () => {
  test('should approve a pending operator application and create a city page', async ({ page }) => {
    // Navigate to operator applications page
    await page.goto('/admin/operator-applications');
    await expect(page.locator('h1')).toHaveText('Operator Applications');

    // TODO: Dynamically create a pending operator application for this test
    // For now, assuming there's at least one pending application from seed or previous test run
    // Find a pending application and approve it
    const pendingAppRow = page.locator('tr', { hasText: 'APPLIED' }).first();
    await pendingAppRow.getByRole('button', { name: 'Approve' }).click();

    // Expect the status to change (page reload will happen)
    await expect(page.locator('tr', { hasText: 'APPROVED' }).first()).toBeVisible();

    // Navigate to create city page
    await page.goto('/admin/content/city-pages');
    await expect(page.locator('h1')).toHaveText('Manage City Pages');

    // Fill the form to create a new city page
    await page.getByLabel('City').fill('TestCity');
    await page.getByLabel('Region').fill('TestRegion');
    await page.getByLabel('H1 Title').fill('Warehouse Space in TestCity');
    await page.getByLabel('Intro Content').fill('This is an intro for TestCity.');
    await page.getByLabel('Active').check();
    await page.getByRole('button', { name: 'Create City Page' }).click();

    // Expect the new city page to appear in the list
    await expect(page.locator('table', { hasText: 'TestCity' })).toBeVisible();
  });
});
