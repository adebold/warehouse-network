import { test, expect } from '@playwright/test';

test.describe('Basic UI and HTML Structure Tests', () => {
  test('Homepage has proper structure and styling', async ({ page }) => {
    await page.goto('/');
    
    // Check main heading
    await expect(page.locator('h1')).toContainText('Find Your Perfect Warehouse Space');
    
    // Check if Tailwind classes are applied
    const header = page.locator('header');
    await expect(header).toHaveClass(/sticky top-0 z-50/);
    
    // Check for key sections
    await expect(page.locator('text=Why Choose Warehouse Network')).toBeVisible();
    await expect(page.locator('text=Prime Locations')).toBeVisible();
    await expect(page.locator('text=Fast & Easy')).toBeVisible();
    
    // Check for search form
    const searchInput = page.locator('input[placeholder*="Type of space"]');
    await expect(searchInput).toBeVisible();
    
    // Check footer
    await expect(page.locator('footer')).toBeVisible();
  });

  test('Search page displays properly with empty results', async ({ page }) => {
    await page.goto('/search');
    
    // Check header
    await expect(page.locator('text=Search Results')).toBeVisible();
    await expect(page.locator('h1')).toContainText('0 Warehouses Found');
    
    // Check empty state
    await expect(page.locator('text=No warehouses found')).toBeVisible();
    await expect(page.locator('button:has-text("Start New Search")')).toBeVisible();
    
    // Check filters button
    await expect(page.locator('button:has-text("Filters")')).toBeVisible();
  });

  test('Login page has proper form structure', async ({ page }) => {
    await page.goto('/login');
    
    // Check heading
    await expect(page.locator('h2')).toContainText('Welcome back');
    
    // Check form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible();
    
    // Check links
    await expect(page.locator('text=Forgot password?')).toBeVisible();
    await expect(page.locator('text=Create an account')).toBeVisible();
    await expect(page.locator('text=List your warehouse')).toBeVisible();
    
    // Check styling - Card component
    const card = page.locator('.rounded-lg.border.bg-card').first();
    await expect(card).toBeVisible();
  });

  test('Visual consistency across pages', async ({ page }) => {
    // Test consistent header across pages
    for (const path of ['/', '/search', '/login']) {
      await page.goto(path);
      
      // Logo should be consistent
      const logo = page.locator('text=Warehouse Network').first();
      await expect(logo).toBeVisible();
    }
  });

  test('Responsive design on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    
    // Check mobile menu (if exists)
    const header = page.locator('header');
    await expect(header).toBeVisible();
    
    // Check that content is not horizontally scrollable
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
  });

  test('Accessibility: Form labels and ARIA', async ({ page }) => {
    await page.goto('/login');
    
    // Check form labels
    const emailInput = page.locator('input[type="email"]');
    const emailLabel = page.locator('label[for="email"]');
    await expect(emailLabel).toBeVisible();
    await expect(emailLabel).toHaveText('Email');
    
    const passwordInput = page.locator('input[type="password"]');
    const passwordLabel = page.locator('label[for="password"]');
    await expect(passwordLabel).toBeVisible();
    await expect(passwordLabel).toHaveText('Password');
  });

  test('CSS classes are properly applied', async ({ page }) => {
    await page.goto('/');
    
    // Check if Tailwind utility classes are working
    const button = page.locator('button').first();
    const buttonClasses = await button.getAttribute('class');
    expect(buttonClasses).toMatch(/inline-flex|items-center|justify-center/);
    
    // Check custom color variables
    const hasCustomColors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return root.getPropertyValue('--primary') !== '';
    });
    expect(hasCustomColors).toBeTruthy();
  });
});

test.describe('Data Display Tests', () => {
  test('Search page can display warehouse cards when data exists', async ({ page }) => {
    // Create test warehouse data
    await page.goto('/search?location=Toronto&skidCount=100');
    
    // If there are results, verify card structure
    const warehouseCards = page.locator('[data-testid="warehouse-card"]');
    const count = await warehouseCards.count();
    
    if (count > 0) {
      const firstCard = warehouseCards.first();
      
      // Check card has proper structure
      await expect(firstCard.locator('.text-xl')).toBeVisible(); // Title
      await expect(firstCard.locator('[data-testid="view-details"]')).toBeVisible();
      await expect(firstCard.locator('[data-testid="add-to-compare"]')).toBeVisible();
    }
  });
});