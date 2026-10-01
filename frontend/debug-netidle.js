const { chromium } = require('@playwright/test');
const { loginAs } = require('./e2e/test-utils');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const page = await context.newPage();
  const inflight = new Map();
  page.on('request', r => inflight.set(r.url(), Date.now()));
  page.on('requestfinished', r => inflight.delete(r.url()));
  page.on('requestfailed', r => inflight.delete(r.url()));

  await loginAs(page, 'manager');
  await page.goto('/manager');
  try {
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    console.log('networkidle reached');
  } catch {
    console.log('networkidle TIMEOUT. Still in-flight:');
    for (const [u, t] of inflight) console.log(' ', u, `${Date.now() - t}ms`);
  }
  await browser.close();
})();
