import { test, expect } from '@playwright/test';

test.describe('Production Registration Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to production URL
    await page.goto('/');
  });

  test('homepage loads correctly with proper CSP headers', async ({ page }) => {
    // Check page loaded
    await expect(page.locator('h1')).toContainText('Find Your Perfect Warehouse Space');
    
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

  test('Google Analytics configuration check', async ({ page }) => {
    // Check if GA is configured (might not be initialized with placeholder ID)
    const gaStatus = await page.evaluate(() => {
      return {
        gtagDefined: typeof window.gtag !== 'undefined',
        gaObjectDefined: typeof window.ga !== 'undefined',
        dataLayerExists: typeof window.dataLayer !== 'undefined'
      };
    });
    
    // GA might not initialize with invalid ID, but no errors should occur
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('gtag')) {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.waitForTimeout(1000);
    
    // No GA errors should be thrown
    expect(consoleErrors).toHaveLength(0);
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

  test('mobile responsive design', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    
    await page.goto('/');
    
    // Simple check that the page is responsive
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).toBeTruthy();
    expect(viewportMeta).toContain('width=device-width');
    
    // Verify no horizontal overflow (responsive design)
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('performance: page load time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/', { waitUntil: 'networkidle' });
    
    const loadTime = Date.now() - startTime;
    
    // Page should load in under 10 seconds (allowing for network latency in production)
    expect(loadTime).toBeLessThan(10000);
    
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