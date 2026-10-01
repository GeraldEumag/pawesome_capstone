const { chromium } = require('@playwright/test');
const { apiLogin } = require('./e2e/test-utils');
const apiUrl = 'http://127.0.0.1:8000/api';
const auth = (t) => ({ Accept: 'application/json', Authorization: `Bearer ${t}` });

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const rec = await apiLogin(page.request, 'receptionist');
  const res = await page.request.get(`${apiUrl}/receptionist/boarding-requests`, { headers: auth(rec.token) });
  console.log('status:', res.status());
  const body = await res.json();
  const arr = body.requests || body.data || body || [];
  const list = Array.isArray(arr) ? arr : [];
  const fx = list.find(b => (b.notes||'').includes('PW-E2E-APPROVAL'));
  console.log('fixture:', fx ? JSON.stringify({id:fx.id,status:fx.status,pet:fx.pet?.name||fx.pet_name,notes:fx.notes}) : 'MISSING', '| total rows:', list.length);
  if (list[0]) console.log('sample keys:', Object.keys(list[0]).join(','));
  await browser.close();
})();
