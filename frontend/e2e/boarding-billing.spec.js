const { test, expect } = require('@playwright/test');
const { execSync } = require('node:child_process');
const path = require('node:path');
const { apiLogin: sharedApiLogin } = require('./test-utils');

const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const apiUrl = `${process.env.E2E_API_URL || 'http://127.0.0.1:8000'}/api`;
const backendDir = path.resolve(__dirname, '..', '..', 'backend');

function auth(token) {
  return { Accept: 'application/json', Authorization: `Bearer ${token}` };
}

async function openAs(browser, session, route) {
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', user.role);
    localStorage.setItem('name', user.name || user.email);
    localStorage.setItem('email', user.email);
  }, session);
  const page = await context.newPage();
  await page.goto(route);
  return { page, context };
}

async function findBillingBoarding(request, token) {
  const res = await request.get(`${apiUrl}/receptionist/boarding-requests`, { headers: auth(token) });
  expect(res.ok(), 'list boarding requests').toBeTruthy();
  const body = await res.json();
  const rows = body.boardings || body.data || body.boarding_requests || [];
  return rows.find((r) => r.notes === 'PW-E2E-BILLING');
}

async function billingSummary(request, token, boardingId) {
  const res = await request.get(`${apiUrl}/billing/boarding/${boardingId}/summary`, { headers: auth(token) });
  expect(res.ok(), 'billing summary').toBeTruthy();
  return (await res.json()).billing;
}

test.describe('Boarding itemized billing E2E', () => {
  test.setTimeout(180000);

  test.beforeEach(() => {
    execSync(`${process.env.PHP_BINARY || 'php'} pawesome_e2e_payment_fixture_seed.php`, {
      cwd: backendDir,
      stdio: 'inherit',
    });
  });

  test('base item → add-on → cashier verify → settle → receipt → notification → revenue', async ({ request, browser }) => {
    const receptionist = await sharedApiLogin(request, 'receptionist');
    const cashier = await sharedApiLogin(request, 'cashier');

    const fixture = await findBillingBoarding(request, receptionist.token);
    expect(fixture, 'seeded PW-E2E-BILLING boarding').toBeTruthy();
    expect(fixture.payment_status).toBe('unpaid');
    expect(Number(fixture.total_amount)).toBe(900);

    // Revenue baseline before any payment (manager unified revenue leg).
    const manager = await sharedApiLogin(request, 'manager');
    const revenueBeforeRes = await request.get(`${apiUrl}/manager/reports/overview`, { headers: auth(manager.token) });
    expect(revenueBeforeRes.ok(), 'manager revenue baseline').toBeTruthy();
    const revenueBefore = Number((await revenueBeforeRes.json()).data?.summary?.total_revenue ?? 0);

    // ---- Receptionist UI: billing panel materializes the base item lazily.
    const { page, context } = await openAs(browser, receptionist, '/receptionist/bookings/hotel');
    await expect(page.locator('.hotel-bookings')).toBeVisible({ timeout: 30000 });
    await page.locator('.hotel-search-box input').fill('PW-E2E-BILLING');
    const row = page.locator('tr.booking-row').first();
    await expect(row).toBeVisible({ timeout: 20000 });

    await row.locator('.row-action-popover-trigger').click();
    await page.getByRole('button', { name: 'View / Manage' }).click();

    const panel = page.locator('.service-billing-panel');
    await expect(panel).toBeVisible({ timeout: 20000 });
    await expect(panel.locator('.amount.total')).toHaveText(/900\.00/, { timeout: 15000 });

    // ---- Add a ₱300 charge through the real UI form.
    await panel.getByRole('button', { name: 'Add Charge' }).click();
    const form = panel.locator('.add-billing-form');
    await form.locator('input[type="text"]').fill('E2E Extra Care');
    await form.locator('.form-group', { hasText: 'Unit Price' }).locator('input').fill('300');
    await form.getByRole('button', { name: 'Add Item' }).click();
    await expect(panel.locator('.amount.total')).toHaveText(/1200\.00/, { timeout: 15000 });

    // Backend truth: total 1200, nothing paid yet.
    let summary = await billingSummary(request, receptionist.token, fixture.id);
    expect(Number(summary.total_bill)).toBe(1200);
    expect(Number(summary.balance_due)).toBe(1200);

    // ---- Cashier verifies the payment proof for the base (canonical path).
    const verify = await request.post(`${apiUrl}/cashier/payment-requests/${fixture.id}/verify`, {
      headers: auth(cashier.token),
      data: { type: 'boarding', reference_number: 'E2E-REF-BILLING-1', payment_method: 'cash' },
    });
    expect(verify.ok(), await verify.text()).toBeTruthy();

    summary = await billingSummary(request, receptionist.token, fixture.id);
    expect(Number(summary.total_bill)).toBe(1200);
    expect(Number(summary.total_paid)).toBe(900);
    expect(Number(summary.balance_due)).toBe(300);
    expect(summary.payment_status).toBe('partial');

    // One settlement for the base, receipt number assigned.
    const boarding = await findBillingBoarding(request, receptionist.token);
    expect(boarding.receipt_number).toBeTruthy();

    // ---- Settle the remaining add-on charge (cashier item-level payment).
    const unpaid = summary.items.find((i) => !i.is_paid && i.description === 'E2E Extra Care');
    expect(unpaid, 'unpaid add-on item').toBeTruthy();
    const markPaid = await request.patch(`${apiUrl}/billing/items/mark-paid`, {
      headers: auth(cashier.token),
      data: { item_ids: [unpaid.id], payment_method: 'cash', reference_number: 'E2E-CASH-300' },
    });
    expect(markPaid.ok(), await markPaid.text()).toBeTruthy();

    summary = await billingSummary(request, receptionist.token, fixture.id);
    expect(Number(summary.total_paid)).toBe(1200);
    expect(Number(summary.balance_due)).toBe(0);
    expect(summary.payment_status).toBe('paid');

    // UI reflects settled state.
    await expect(panel.locator('.amount.balance')).toHaveText(/0\.00/, { timeout: 15000 });

    // ---- Cashier transaction history shows the settlement rows (no fake sale).
    const txRes = await request.get(`${apiUrl}/cashier/transactions`, { headers: auth(cashier.token) });
    expect(txRes.ok(), 'cashier transactions').toBeTruthy();
    const txBody = await txRes.json();
    const txRows = txBody.transactions || txBody.data || [];
    const settlementRows = txRows.filter(
      (t) => t.source === 'payment_settlement' && t.service_type === 'boarding' && t.service_id === fixture.id
    );
    const settledTotal = settlementRows.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    expect(settledTotal, 'settlements for this boarding sum to 1200').toBe(1200);
    expect(txRows.some((t) => t.source === 'pos' && t.receipt_number === boarding.receipt_number)).toBeFalsy();

    // ---- Customer notification delivered (in-app).
    const customer = await sharedApiLogin(request, 'customer');
    const notifRes = await request.get(`${apiUrl}/notifications`, { headers: auth(customer.token) });
    expect(notifRes.ok(), 'customer notifications').toBeTruthy();
    const notifBody = await notifRes.json();
    const notifs = notifBody.notifications || notifBody.data || notifBody || [];
    const flat = JSON.stringify(notifs);
    expect(flat.includes('E2E Extra Care') || /payment|verified|receipt/i.test(flat), 'customer notified').toBeTruthy();

    // ---- Revenue counted exactly once (delta == 1200 over the baseline).
    const revenueAfterRes = await request.get(`${apiUrl}/manager/reports/overview`, { headers: auth(manager.token) });
    const revenueAfter = Number((await revenueAfterRes.json()).data?.summary?.total_revenue ?? 0);
    expect(revenueAfter - revenueBefore, 'revenue delta equals settled amount once').toBe(1200);

    await context.close();
  });
});
