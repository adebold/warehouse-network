import { test, expect } from '@playwright/test';

test.describe('User Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Use the local development server
    await page.goto('http://localhost:3001');
  });

  test('should navigate to registration page from login', async ({ page }) => {
    // Click login button
    await page.click('text=Sign In');
    await expect(page).toHaveURL(/.*login/);

    // Click create account link
    await page.click('text=Create an account');
    await expect(page).toHaveURL(/.*register/);

    // Verify registration form is visible
    await expect(page.locator('h2:has-text("Create an account")')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
  });

  test('should show validation errors for invalid input', async ({ page }) => {
    await page.goto('http://localhost:3001/register');

    // Try to submit empty form
    await page.click('button:has-text("Create Account")');
    
    // Check for HTML5 validation
    const emailInput = page.locator('input[name="email"]');
    const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('should show error for mismatched passwords', async ({ page }) => {
    await page.goto('http://localhost:3001/register');

    // Fill form with mismatched passwords
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'different123');

    await page.click('button:has-text("Create Account")');

    // Check for error message
    await expect(page.locator('text=Passwords do not match')).toBeVisible();
  });

  test('should navigate to partner registration', async ({ page }) => {
    await page.goto('http://localhost:3001/register');

    // Click warehouse owner link
    await page.click('text=List Your Warehouse');
    await expect(page).toHaveURL(/.*become-a-partner/);

    // Verify partner form is visible
    await expect(page.locator('h1:has-text("Turn Your Empty Space")')).toBeVisible();
  });

  test('partner registration form should be functional', async ({ page }) => {
    await page.goto('http://localhost:3001/become-a-partner');

    // Scroll to form
    await page.locator('#application-form').scrollIntoViewIfNeeded();

    // Verify all form fields are present
    await expect(page.locator('input[name="legalName"]')).toBeVisible();
    await expect(page.locator('input[name="primaryContact"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="phone"]')).toBeVisible();
    await expect(page.locator('select[name="warehouseCount"]')).toBeVisible();
    await expect(page.locator('input[name="operatingRegions"]')).toBeVisible();
    await expect(page.locator('input[name="goodsCategories"]')).toBeVisible();
    await expect(page.locator('input[name="insurance"]')).toBeVisible();
  });

  test('search functionality on homepage', async ({ page }) => {
    await page.goto('http://localhost:3001');

    // Test search form
    const searchInput = page.locator('input[placeholder*="Type of space"]');
    const locationInput = page.locator('input[placeholder*="City or postal code"]');
    
    await expect(searchInput).toBeVisible();
    await expect(locationInput).toBeVisible();

    // Fill search form
    await searchInput.fill('storage');
    await locationInput.fill('Toronto');

    // Click search button
    await page.click('button:has-text("Search")');
    
    // Should navigate to search page (even if 404)
    await expect(page).toHaveURL(/.*search/);
  });
});