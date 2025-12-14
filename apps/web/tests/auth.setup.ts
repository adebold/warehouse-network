import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE_ADMIN, STORAGE_STATE_CUSTOMER_ADMIN, STORAGE_STATE_CUSTOMER_USER, STORAGE_STATE_OPERATOR_ADMIN, STORAGE_STATE_WAREHOUSE_STAFF } from './test-utils';

const BASE_URL = 'http://localhost:3000';

setup('authenticate as super admin', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill('superadmin@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(`${BASE_URL}/admin/operator-applications`);
  await page.context().storageState({ path: STORAGE_STATE_ADMIN });
});

setup('authenticate as operator admin', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill('operatoradmin@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(`${BASE_URL}/operator/dashboard`);
  await page.context().storageState({ path: STORAGE_STATE_OPERATOR_ADMIN });
});

setup('authenticate as warehouse staff', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill('warehousestaff@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  // Assuming warehouse staff lands on a relevant mobile page, adjust if different
  await page.waitForURL(`${BASE_URL}/operator/mobile/receive`); 
  await page.context().storageState({ path: STORAGE_STATE_WAREHOUSE_STAFF });
});

setup('authenticate as customer admin', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill('customeradmin@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  // Assuming customer admin lands on a relevant app page, adjust if different
  await page.waitForURL(`${BASE_URL}/app/inventory`); 
  await page.context().storageState({ path: STORAGE_STATE_CUSTOMER_ADMIN });
});

setup('authenticate as customer user', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill('customeruser@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  // Assuming customer user lands on a relevant app page, adjust if different
  await page.waitForURL(`${BASE_URL}/app/inventory`); 
  await page.context().storageState({ path: STORAGE_STATE_CUSTOMER_USER });
});