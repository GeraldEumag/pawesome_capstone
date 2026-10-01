const { chromium, devices } = require('@playwright/test');
const { mockLoginAs } = require('./e2e/test-utils');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    baseURL: 'http://localhost:3000',
  });
  const page = await context.newPage();

  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 300)));

  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/src/') || u.pathname.startsWith('/node_modules/')) return route.continue();
    if (!u.pathname.includes('/api/')) return route.continue();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await mockLoginAs(page, 'customer', 'Portrait Audit customer');
  await page.goto('/customer');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  console.log('has .app-dashboard:', await page.locator('.app-dashboard').count());
  const html = await page.evaluate(() => document.body.innerHTML.slice(0, 800));
  console.log('BODY:', html);
  await browser.close();
})();
