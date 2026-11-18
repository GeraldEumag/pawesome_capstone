import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:8000/api';
const OUT = 'C:/xampp/htdocs/Pawesome/browser-evidence/vet-walkin-repro';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleMsgs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/customers/search') || u.includes('/veterinarians') || u.includes('/services') || u.includes('/availability') || u.includes('/walk-ins')) {
    let body = '';
    try { body = (await r.text()).slice(0, 250); } catch {}
    console.log('API', r.status(), u.replace('http://localhost:8000', '').replace('http://127.0.0.1:8000', ''), '=>', body);
  }
});

const login = await page.request.post(`${API}/auth/login`, {
  data: { login: 'receptionist@example.com', email: 'receptionist@example.com', password: 'Password123!' },
  headers: { Accept: 'application/json' },
});
const auth = await login.json();
console.log('LOGIN status', login.status(), 'role', auth.user?.role);

await page.addInitScript(({ token, user }) => {
  window.localStorage.setItem('token', token);
  window.localStorage.setItem('role', user.role);
  window.localStorage.setItem('name', user.name);
  window.localStorage.setItem('username', user.username || user.email);
  window.localStorage.setItem('email', user.email);
}, { token: auth.token || auth.access_token, user: auth.user });

await page.goto(`${BASE}/receptionist/walk-ins`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Click the Veterinary service card's New Booking button
const vetCard = page.locator('.service-card', { hasText: 'Veterinary' });
console.log('vet cards:', await vetCard.count());
await vetCard.locator('.svc-cta-btn').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-vet-step1.png` });
console.log('modal open:', await page.locator('.hbk-modal').count());

// Step 1: Existing Customer -> Next
await page.locator('.mode-card', { hasText: 'Existing Customer' }).click();
await page.waitForTimeout(400);
await page.locator('.hbk-foot .primary-btn').click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/02-step2-customer.png` });

// Step 2: search + pick first customer result
const search = page.locator('.walkin-search-box input');
await search.click();
await search.pressSequentially('customer', { delay: 60 });
const items = page.locator('.customer-result-item');
await items.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
console.log('customer result items:', await items.count());
if (await items.count()) {
  await items.first().click();
  await page.waitForTimeout(1000);
}
await page.screenshot({ path: `${OUT}/02b-after-pick.png` });

// pick first pet if a pet select exists
const petSel = page.locator('.hbk-body select').first();
if (await petSel.count()) {
  const opts = await petSel.locator('option').allTextContents();
  console.log('pet options:', JSON.stringify(opts));
  if (opts.length > 1) { await petSel.selectOption({ index: 1 }); await page.waitForTimeout(400); }
}
await page.screenshot({ path: `${OUT}/03-step2-pet.png` });

// Next -> booking details (step 3 for existing-customer flow)
await page.locator('.hbk-foot .primary-btn').click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/04-step3-booking.png` });
console.log('--- step3 body text ---');
console.log((await page.locator('.hbk-body').innerText()).slice(0, 1800));

// Inspect every select on the booking-details step
const selects = await page.locator('.hbk-body select').all();
console.log('select count:', selects.length);
for (let i = 0; i < selects.length; i++) {
  const opts = await selects[i].locator('option').allTextContents();
  const label = await selects[i].evaluate((el) => el.closest('.form-group')?.querySelector('label')?.textContent || '(no label)');
  console.log(`select[${i}] "${label}" options(${opts.length}):`, JSON.stringify(opts.slice(0, 10)));
}

console.log('CONSOLE ERRORS:');
consoleMsgs.slice(0, 50).forEach((m) => console.log(m));

await browser.close();
console.log('DONE ->', OUT);
