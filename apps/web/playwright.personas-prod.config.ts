import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for persona tests against production
 */
export default defineConfig({
  testDir: './tests/personas',
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'persona-prod-test-results.json' }],
    ['html', { outputFolder: 'persona-prod-test-report' }],
  ],

  use: {
    baseURL: 'https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});