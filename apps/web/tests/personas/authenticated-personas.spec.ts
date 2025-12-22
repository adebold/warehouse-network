import { test, expect } from '@playwright/test';

// Helper function to login
async function login(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**', { timeout: 10000 });
}

test.describe('Authenticated Persona Tests', () => {
  test.describe('Super Admin Persona', () => {
    test('should access admin dashboard and manage operator applications', async ({ page }) => {
      // Login as super admin
      await login(page, 'superadmin@example.com', 'password');
      
      // Navigate to admin dashboard
      await page.goto('/admin/dashboard');
      await expect(page.locator('h1')).toContainText(/admin|dashboard/i);
      
      // Check for admin-specific elements
      await expect(page.getByText(/operator applications/i)).toBeVisible();
    });
  });

  test.describe('Customer Admin Persona', () => {
    test('should access customer dashboard and view inventory', async ({ page }) => {
      // Register a new customer admin
      await page.goto('/register');
      const timestamp = Date.now();
      const email = `customer-admin-${timestamp}@test.com`;
      
      await page.getByLabel('Name').fill('Customer Admin Test');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('Test123!@#');
      await page.getByLabel('Company Name').fill('Test Company');
      await page.getByRole('button', { name: /create account/i }).click();
      
      // Should redirect to dashboard after registration
      await page.waitForURL('**/dashboard', { timeout: 10000 });
      
      // Navigate to customer dashboard
      await page.goto('/customer/dashboard');
      await expect(page.locator('h1')).toContainText(/dashboard/i);
    });
  });

  test.describe('Warehouse Staff Persona', () => {
    test('should be able to access login but not admin areas', async ({ page }) => {
      // Try to access operator area without auth
      await page.goto('/operator/dashboard');
      
      // Should be redirected to login or see access denied
      const h1Text = await page.locator('h1').textContent();
      expect(h1Text).toMatch(/access denied|sign in|login/i);
    });
  });
});

test.describe('Public Access Tests', () => {
  test('should allow access to public pages without authentication', async ({ page }) => {
    // Homepage
    await page.goto('/');
    await expect(page.getByText(/warehouse network/i)).toBeVisible();
    
    // Search page
    await page.goto('/search');
    // Should not see "Access Denied" for public pages
    const h1Text = await page.locator('h1').textContent();
    expect(h1Text).not.toContain('Access Denied');
    
    // Become a partner page
    await page.goto('/become-a-partner');
    await expect(page.getByText(/become a partner|list.*property/i)).toBeVisible();
  });
  
  test('should show login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
  
  test('should show registration page', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });
});