const { chromium } = require('@playwright/test');
const { loginAs } = require('./e2e/test-utils');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ baseURL: 'http://localhost:3000' })).newPage();
  page.on('response', r => { if (r.url().includes('/api/')) console.log('API', r.status(), r.url()); });
  await loginAs(page, 'customer');
  await page.goto('/customer');
  await page.waitForLoadState('domcontentloaded');
  const qa = page.locator('.quick-action-card');
  try { await qa.first().waitFor({ state: 'visible', timeout: 15000 }); } catch { console.log('quick-action-card never appeared'); }
  console.log('quick action count:', await qa.count());
  console.log('error-state visible:', await page.locator('.error-state').isVisible().catch(()=>false));
  console.log('loading visible:', await page.locator('.loading-container').isVisible().catch(()=>false));
  await browser.close();
})();
