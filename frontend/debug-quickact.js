const { chromium } = require('@playwright/test');
const { apiLogin } = require('./e2e/test-utils');

(async () => {
  const browser = await chromium.launch();
  const session = await apiLogin((await browser.newContext()).request, 'customer');
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', user.role);
    localStorage.setItem('name', user.name || user.email);
    localStorage.setItem('email', user.email);
  }, session);
  const page = await context.newPage();
  page.on('console', m => { if (m.type()==='error') console.log('CONSOLE:', m.text().slice(0,200)); });
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) console.log('API', r.status(), r.url()); });
  await page.goto('/customer');
  await page.locator('.rbac-chatbot-toggle').click();
  await page.waitForTimeout(6000);
  console.log('quick-action count:', await page.locator('.rbac-quick-action').count());
  const labels = await page.locator('.rbac-quick-action span').allTextContents().catch(()=>[]);
  console.log('labels:', labels);
  console.log('state text:', await page.locator('.rbac-chatbot-state').textContent().catch(()=>null));
  console.log('livechat header:', await page.locator('.rbac-chatbot-header h3').textContent().catch(()=>null));
  await browser.close();
})();
