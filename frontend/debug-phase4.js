const { chromium } = require('@playwright/test');
const { apiLogin } = require('./e2e/test-utils');
const apiUrl = 'http://127.0.0.1:8000/api';
const auth = (t) => ({ Accept: 'application/json', Authorization: `Bearer ${t}` });

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const cust = await apiLogin(page.request, 'customer');
  const res = await page.request.get(`${apiUrl}/customer/medical-confinements`, { headers: auth(cust.token) });
  const body = await res.json();
  const records = Array.isArray(body) ? body : body.medical_confinements || body.data || [];
  for (const m of ['PW-E2E-VERIFY', 'PW-E2E-REJECT']) {
    const f = records.find(r => r.diagnosis === m);
    console.log(m, f ? `id=${f.id} payment_status=${f.payment_status}` : 'MISSING');
  }
  // boarding fixture
  const rec = await apiLogin(page.request, 'receptionist');
  const bRes = await page.request.get(`${apiUrl}/receptionist/hotel-bookings`, { headers: auth(rec.token) }).catch(e => null);
  console.log('hotel-bookings status:', bRes ? bRes.status() : 'err');
  if (bRes && bRes.ok()) {
    const bb = await bRes.json();
    const rows = bb.bookings || bb.data || bb || [];
    const arr = Array.isArray(rows) ? rows : [];
    const fx = arr.find(b => (b.notes||'').includes('PW-E2E-APPROVAL'));
    console.log('boarding fixture:', fx ? `id=${fx.id} status=${fx.status} pet=${fx.pet?.name||fx.pet_name}` : 'MISSING', 'total:', arr.length);
  }
  await browser.close();
})();
