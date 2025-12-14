import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE_ADMIN, STORAGE_STATE_CUSTOMER_ADMIN, STORAGE_STATE_CUSTOMER_USER, STORAGE_STATE_OPERATOR_ADMIN, STORAGE_STATE_WAREHOUSE_STAFF } from './tests/test-utils';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/personas',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',

  globalSetup: require.resolve('./tests/auth.setup.ts'),

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'super-admin',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_ADMIN },
      dependencies: ['setup'],
    },
    {
      name: 'operator-admin',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_OPERATOR_ADMIN },
      dependencies: ['setup'],
    },
    {
      name: 'warehouse-staff',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_WAREHOUSE_STAFF },
      dependencies: ['setup'],
    },
    {
      name: 'customer-admin',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_CUSTOMER_ADMIN },
      dependencies: ['setup'],
    },
    {
      name: 'customer-user',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_CUSTOMER_USER },
      dependencies: ['setup'],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
