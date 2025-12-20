import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE_ADMIN, STORAGE_STATE_CUSTOMER_ADMIN, STORAGE_STATE_CUSTOMER_USER, STORAGE_STATE_OPERATOR_ADMIN, STORAGE_STATE_WAREHOUSE_STAFF } from './tests/test-utils';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
require('dotenv').config({ path: '.env.test' });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'junit.xml' }],
    process.env.CI ? ['github'] : ['list']
  ],

  globalSetup: require.resolve('./tests/auth.setup.ts'),
  globalTeardown: require.resolve('./tests/integration/setup.ts'),

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Screenshot configuration */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    /* Default viewport */
    viewport: { width: 1440, height: 900 },
    
    /* Test timeout */
    actionTimeout: 10000,
    navigationTimeout: 30000,
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
    
    // Visual Regression Testing
    {
      name: 'visual-regression',
      use: { 
        ...devices['Desktop Chrome'],
        // Visual comparison settings
        screenshot: {
          mode: 'only-on-failure',
          fullPage: true
        },
        // Consistent rendering
        locale: 'en-US',
        timezoneId: 'America/Toronto',
        // Disable animations for consistent screenshots
        reducedMotion: 'reduce',
      },
      testMatch: /.*\.visual\.spec\.ts/,
    },
    
    // Mobile Testing
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        storageState: STORAGE_STATE_CUSTOMER_USER,
      },
      dependencies: ['setup'],
      testMatch: /.*\.mobile\.spec\.ts/,
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 13'],
        storageState: STORAGE_STATE_CUSTOMER_USER,
      },
      dependencies: ['setup'],
      testMatch: /.*\.mobile\.spec\.ts/,
    },
    
    // Accessibility Testing
    {
      name: 'accessibility',
      use: {
        ...devices['Desktop Chrome'],
        // High contrast mode
        colorScheme: 'dark',
        // Screen reader simulation
        reducedMotion: 'reduce',
      },
      testMatch: /.*\.(a11y|accessibility)\.spec\.ts/,
    },
    
    // Performance Testing
    {
      name: 'performance',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-precise-memory-info', '--disable-gpu'],
        },
      },
      testMatch: /.*\.perf\.spec\.ts/,
    },
    
    // HTML/CSS Audit
    {
      name: 'html-css-audit',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*html-css-audit\.ts/,
    },
    
    // Integration Tests
    {
      name: 'integration',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*integration.*\.spec\.ts/,
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'bash scripts/test-db.sh setup && npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for test setup
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/warehouse_test',
      REDIS_URL: 'redis://localhost:6380',
      NODE_ENV: 'test',
    },
  },
});
