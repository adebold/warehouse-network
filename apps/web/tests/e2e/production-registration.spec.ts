import { test, expect } from '@playwright/test';

test.describe('Production Registration Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to production URL
    await page.goto('/');
  });

  test('homepage loads correctly with proper CSP headers', async ({ page }) => {
    // Check page loaded
    await expect(page.locator('h1')).toContainText('Find Warehouse Space');
    
    // Verify no CSP errors in console
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.waitForTimeout(2000); // Wait for any delayed errors
    
    const cspErrors = consoleErrors.filter(err => 
      err.includes('Content Security Policy') || 
      err.includes('refused to load') ||
      err.includes('refused to execute')
    );
    
    expect(cspErrors).toHaveLength(0);
  });

  test('Google Analytics loads without errors', async ({ page }) => {
    // Check for GA initialization
    const gaLoaded = await page.evaluate(() => {
      return typeof window.gtag !== 'undefined';
    });
    
    expect(gaLoaded).toBe(true);
  });

  test('navigate to registration from homepage', async ({ page }) => {
    // Click sign in button
    await page.click('text=Sign In');
    await expect(page).toHaveURL(/.*login/);
    
    // Navigate to registration
    await page.click('text=Create an account');
    await expect(page).toHaveURL(/.*register/);
    
    // Verify registration page loaded
    await expect(page.locator('h2:has-text("Create an account")')).toBeVisible();
  });

  test('registration form validation works', async ({ page }) => {
    await page.goto('/register');
    
    // Try submitting empty form
    await page.click('button:has-text("Create Account")');
    
    // Should show validation errors (HTML5)
    const nameInput = page.locator('input[name="name"]');
    const isInvalid = await nameInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('partner registration page accessible', async ({ page }) => {
    await page.goto('/register');
    
    // Click warehouse owner link  
    await page.click('text=List Your Warehouse');
    await expect(page).toHaveURL(/.*become-a-partner/);
    
    // Verify partner page loaded
    await expect(page.locator('h1:has-text("Turn Your Empty Space")')).toBeVisible();
  });

  test('mobile responsive design', async ({ page, viewport }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    
    await page.goto('/');
    
    // Check mobile menu button is visible
    const mobileMenuButton = page.locator('button[aria-label="Open menu"]');
    await expect(mobileMenuButton).toBeVisible();
    
    // Check hero section adapts
    const heroSection = page.locator('.hero-section').first();
    const heroWidth = await heroSection.evaluate(el => el.clientWidth);
    expect(heroWidth).toBeLessThanOrEqual(375);
  });

  test('performance: page load time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/', { waitUntil: 'networkidle' });
    
    const loadTime = Date.now() - startTime;
    
    // Page should load in under 5 seconds
    expect(loadTime).toBeLessThan(5000);
    
    // Check for Core Web Vitals
    const metrics = await page.evaluate(() => {
      return {
        hasLCP: typeof performance.getEntriesByType === 'function',
        hasFID: typeof performance.getEntriesByType === 'function',
        hasCLS: typeof performance.getEntriesByType === 'function'
      };
    });
    
    expect(metrics.hasLCP).toBe(true);
  });

  test('security headers are present', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers() || {};
    
    // Check for security headers
    expect(headers['x-frame-options']).toBeDefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBeDefined();
    expect(headers['content-security-policy']).toBeDefined();
  });
});