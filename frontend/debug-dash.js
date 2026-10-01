const { chromium } = require('@playwright/test');
const { apiLogin } = require('./e2e/test-utils');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const { token } = await apiLogin(page.request, 'customer');
  const res = await page.request.get('http://127.0.0.1:8000/api/customer/dashboard', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  console.log('status:', res.status());
  console.log('body:', (await res.text()).slice(0, 500));
  await browser.close();
})();
