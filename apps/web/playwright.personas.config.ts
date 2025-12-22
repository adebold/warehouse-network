import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration specifically for persona tests
 */
export default defineConfig({
  testDir: './tests/personas',
  fullyParallel: false, // Run personas sequentially to avoid conflicts
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'persona-test-results.json' }],
    ['html', { outputFolder: 'persona-test-report' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /* Configure projects for different browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
});