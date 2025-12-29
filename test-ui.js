const { chromium } = require('@playwright/test');
const { logger } = require('./utils/logger');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Test homepage
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'homepage.png', fullPage: true });

  // Test search page
  await page.goto('http://localhost:3000/search');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'search-page.png', fullPage: true });

  // Test login page
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'login-page.png', fullPage: true });

  logger.info('Screenshots saved: homepage.png, search-page.png, login-page.png');

  await browser.close();
})();
