// v0.4 screenshot capture: live stack (:8000 API, :3000 Vite, seeded dev DB).
// Run: node frontend/.manual-v04-capture.cjs  (from repo root)
const { chromium, request: pwRequest } = require('playwright');
const path = require('path');

const API = 'http://127.0.0.1:8000/api';
const WEB = 'http://127.0.0.1:3000';
const OUT = path.resolve(__dirname, '../docs/user-manual/screenshots');

const CREDS = {
  customer: ['customer@example.com', 'Password123!'],
  receptionist: ['receptionist@example.com', 'Password123!'],
  cashier: ['cashier@example.com', 'password123'],
  inventory: ['inventory@example.com', 'Password123!'],
  vet: ['vet@example.com', 'Password123!'],
  manager: ['manager@example.com', 'password123'],
  admin: ['admin@example.com', 'Password123!'],
};

async function login(request, role) {
  const [email, password] = CREDS[role];
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  const body = await res.json();
  if (!res.ok()) throw new Error(`${role} login failed: ${res.status()} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function pageAs(browser, request, role) {
  const { token, user } = await login(request, role);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', user.role);
    localStorage.setItem('name', user.name);
    localStorage.setItem('username', user.username || user.email);
    localStorage.setItem('email', user.email);
    if (user.email_verified_at) localStorage.setItem('email_verified_at', user.email_verified_at);
  }, { token, user });
  return { ctx, page };
}

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('captured', name);
};
const settle = (page) => page.waitForTimeout(2500);

(async () => {
  const browser = await chromium.launch();
  const reqCtx = await pwRequest.newContext();
  const results = [];

  const run = async (label, fn) => {
    try { await fn(); results.push(`${label}: OK`); }
    catch (e) { results.push(`${label}: FAIL ${String(e).slice(0, 160)}`); }
  };

  // UM-017 Pet Hotel reservation form (customer)
  await run('UM-017', async () => {
    const { ctx, page } = await pageAs(browser, reqCtx, 'customer');
    await page.goto(`${WEB}/customer/hotel`, { waitUntil: 'networkidle' });
    await settle(page);
    const btn = page.getByRole('button', { name: /New Reservation/i }).first();
    if (await btn.count()) await btn.click();
    await settle(page);
    await shot(page, 'UM-017-hotel-reservation-form.png');
    await ctx.close();
  });

  // UM-018 Walk-ins form + recent list (receptionist)
  await run('UM-018', async () => {
    const { ctx, page } = await pageAs(browser, reqCtx, 'receptionist');
    await page.goto(`${WEB}/receptionist/walk-ins`, { waitUntil: 'networkidle' });
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'UM-018-receptionist-walkins.png');
    await ctx.close();
  });

  // UM-019 Cashier reject dialog (payment approvals)
  await run('UM-019', async () => {
    const { ctx, page } = await pageAs(browser, reqCtx, 'cashier');
    await page.goto(`${WEB}/cashier/payment-verification`, { waitUntil: 'networkidle' });
    await settle(page);
    const rejectBtn = page.getByRole('button', { name: /^Reject$/ }).first();
    if (await rejectBtn.count()) {
      await rejectBtn.click();
      await page.waitForTimeout(1500);
    }
    await shot(page, 'UM-019-cashier-reject-dialog.png');
    await ctx.close();
  });

  // UM-020 POS cart with item (cashier)
  await run('UM-020', async () => {
    const { ctx, page } = await pageAs(browser, reqCtx, 'cashier');
    await page.goto(`${WEB}/cashier/pos`, { waitUntil: 'networkidle' });
    await settle(page);
    const card = page.locator('[class*="product"], [class*="item-card"], button:has-text("Add")').first();
    if (await card.count()) await card.click();
    await settle(page);
    await shot(page, 'UM-020-cashier-pos-cart.png');
    await ctx.close();
  });

  // UM-021 Consultation editor (vet)
  await run('UM-021', async () => {
    const { ctx, page } = await pageAs(browser, reqCtx, 'vet');
    await page.goto(`${WEB}/veterinary/appointments`, { waitUntil: 'networkidle' });
    await settle(page);
    const row = page.locator('tr', { hasText: /consult|progress/i }).first();
    const anyRow = page.locator('tbody tr').first();
    if (await row.count()) await row.click();
    else if (await anyRow.count()) await anyRow.click();
    await settle(page);
    const startBtn = page.getByRole('button', { name: /Start Consultation/i });
    if (await startBtn.count()) { await startBtn.click(); await settle(page); }
    await shot(page, 'UM-021-vet-consultation.png');
    await ctx.close();
  });

  // UM-022 Create User form (admin)
  await run('UM-022', async () => {
    const { ctx, page } = await pageAs(browser, reqCtx, 'admin');
    await page.goto(`${WEB}/admin/users/create`, { waitUntil: 'networkidle' });
    await settle(page);
    await shot(page, 'UM-022-admin-create-user.png');
    await ctx.close();
  });

  // UM-023 Invoice Approvals (manager)
  await run('UM-023', async () => {
    const { ctx, page } = await pageAs(browser, reqCtx, 'manager');
    await page.goto(`${WEB}/manager/invoice-approvals`, { waitUntil: 'networkidle' });
    await settle(page);
    await shot(page, 'UM-023-manager-invoice-approvals.png');
    await ctx.close();
  });

  // UM-024 Controlled Drugs register (inventory)
  await run('UM-024', async () => {
    const { ctx, page } = await pageAs(browser, reqCtx, 'inventory');
    await page.goto(`${WEB}/inventory/controlled-drugs`, { waitUntil: 'networkidle' });
    await settle(page);
    await shot(page, 'UM-024-inventory-controlled-drugs.png');
    await ctx.close();
  });

  console.log(results.join('\n'));
  await browser.close();
})();
