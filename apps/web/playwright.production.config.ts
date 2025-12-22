import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for running tests against production GCP deployment
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run sequentially to avoid rate limiting
  forbidOnly: true,
  retries: 2, // Retry for network issues
  workers: 1, // Single worker for production testing
  reporter: [
    ['list'],
    ['json', { outputFile: 'production-test-results.json' }],
    ['html', { outputFolder: 'production-test-report' }]
  ],

  use: {
    baseURL: 'https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15000, // Longer timeout for production
    navigationTimeout: 30000,
    // Respect production rate limits
    launchOptions: {
      slowMo: 100 // Add small delay between actions
    }
  },

  projects: [
    {
      name: 'production-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'production-mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],

  // No webServer - testing against live production
});