/**
 * Stock Movement & Control — browser E2E coverage.
 *
 * Exercises the real UI + real API on an explicitly isolated audit stack.
 * Every test creates its own uniquely-named fixture item (SKU prefix E2ESM-).
 *
 * Requires E2E_API_URL/E2E_AUDIT_DATABASE plus a live audit API and frontend.
 */
const { test, expect } = require('@playwright/test');
const { loginAs, apiLogin } = require('./test-utils');
const { enforceAuditStack } = require('./audit-guard');

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';
const stamp = Date.now().toString(36).toUpperCase();

async function api(request, token, method, path, data, extraHeaders = {}) {
  const res = await request[method](`${apiUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    ...(data === undefined ? {} : { data }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body, headers: res.headers() };
}

async function makeItem(request, token, name, stock = 0) {
  const res = await api(request, token, 'post', '/inventory/items', {
    name, sku: `E2ESM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    category: 'Accessories', price: 100, reorder_level: 1,
    issue_method: 'FIFO', stock, is_sellable: false,
  });
  const item = res.body.item || res.body.data || res.body;
  if (!item?.id) throw new Error(`fixture item create failed: ${JSON.stringify(res.body)}`);
  return item;
}

async function stockIn(request, token, itemId, quantity) {
  const res = await api(request, token, 'post', '/inventory/stock-in', {
    transaction_type: 'purchase',
    items: [{ inventory_item_id: itemId, quantity }],
  }, { 'Idempotency-Key': `e2e-in-${itemId}-${Date.now()}` });
  if (res.status !== 201) throw new Error(`stock-in failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function getStock(request, token, itemId) {
  const res = await api(request, token, 'get', `/inventory/items/${itemId}`);
  return res.body.item?.stock ?? res.body.stock ?? res.body.data?.stock;
}

/** Find the pending stock-out request covering a given fixture item. */
async function findRequestNo(request, token, itemId) {
  const res = await api(request, token, 'get', '/inventory/stock-requests?status=pending');
  const reqs = res.body.requests || res.body.data || [];
  const match = reqs.find((r) => (r.items || []).some((i) => i.inventory_item_id === itemId));
  return match?.request_no;
}

/** Type into the QuickItemSelector and pick the named result. */
async function pickItem(page, name) {
  const input = page.locator('.sm-selector input');
  await input.fill(name);
  const option = page.locator('.sm-selector-option', { hasText: name }).first();
  await expect(option).toBeVisible({ timeout: 15000 });
  await option.click();
}

test.setTimeout(120000);
test.beforeEach(async ({ request }) => {
  await enforceAuditStack(request, test, { role: 'inventory', apiLogin });
});

  test('stock in via browser posts a transaction and updates stock', async ({ page, request }) => {
    const inv = await apiLogin(request, 'inventory');
    const item = await makeItem(request, inv.token, `E2ESM-IN-${stamp}`);

    await loginAs(page, 'inventory');
    await page.goto('/inventory/stock-in');
    await pickItem(page, item.name);
    await page.locator('.sm-table tbody tr input[type="number"]').first().fill('7');
    await page.getByRole('button', { name: /Review & Confirm/i }).click();
    await page.getByRole('button', { name: 'Confirm Stock In', exact: true }).click();

    await expect(page.locator('.sm-queued-notice')).toContainText('Last transaction posted', { timeout: 15000 });
    expect(await getStock(request, inv.token, item.id)).toBe(7);
  });

  test('immediate stock-out (service consumption) deducts in browser', async ({ page, request }) => {
    const inv = await apiLogin(request, 'inventory');
    const item = await makeItem(request, inv.token, `E2ESM-OUT-${stamp}`);
    await stockIn(request, inv.token, item.id, 10);

    await loginAs(page, 'inventory');
    await page.goto('/inventory/stock-out');
    await page.locator('select').first().selectOption('service_consumption');
    await page.locator('.sm-card input[type="text"]').first().fill('E2E grooming service');
    await pickItem(page, item.name);
    await page.locator('.sm-table tbody tr input[type="number"]').first().fill('3');
    await page.getByRole('button', { name: /Review & Confirm/i }).click();
    await page.getByRole('button', { name: 'Confirm Stock Out', exact: true }).click();

    await expect(page.locator('.sm-queued-notice')).toContainText('Last transaction posted', { timeout: 15000 });
    expect(await getStock(request, inv.token, item.id)).toBe(7);
  });

  test('sensitive stock-out queues, then a manager approval deducts exactly once', async ({ page, request }) => {
    const inv = await apiLogin(request, 'inventory');
    const item = await makeItem(request, inv.token, `E2ESM-APR-${stamp}`);
    await stockIn(request, inv.token, item.id, 10);

    await loginAs(page, 'inventory');
    await page.goto('/inventory/stock-out');
    await page.locator('select').first().selectOption('damaged');
    await page.locator('.sm-card textarea').first().fill('Water-damaged packaging from storage leak');
    await pickItem(page, item.name);
    await page.locator('.sm-table tbody tr input[type="number"]').first().fill('4');
    await page.getByRole('button', { name: /Review & Confirm/i }).click();
    await page.getByRole('button', { name: 'Submit Request', exact: true }).click();

    await expect(page.locator('.sm-queued-notice').first()).toContainText('pending manager/admin approval', { timeout: 15000 });
    expect(await getStock(request, inv.token, item.id)).toBe(10);
    const requestNo = await findRequestNo(request, inv.token, item.id);
    expect(requestNo).toBeTruthy();

    // Manager reviews and approves through the browser.
    const mgr = await apiLogin(request, 'manager');
    await loginAs(page, 'manager');
    await page.goto('/manager/stock-approvals');
    const row = page.locator('tr', { hasText: requestNo });
    await expect(row).toBeVisible({ timeout: 30000 });
    await row.getByRole('button', { name: 'View' }).click();
    const approveResp = page.waitForResponse((r) => r.url().includes('/stock-requests/') && r.url().endsWith('/approve'));
    await page.getByRole('button', { name: /Approve & Deduct Stock/i }).click();
    expect((await approveResp).status()).toBe(200);

    expect(await getStock(request, inv.token, item.id)).toBe(6);
  });

  test('manager rejection leaves stock untouched', async ({ page, request }) => {
    const inv = await apiLogin(request, 'inventory');
    const item = await makeItem(request, inv.token, `E2ESM-REJ-${stamp}`);
    await stockIn(request, inv.token, item.id, 8);

    const queued = await api(request, inv.token, 'post', '/inventory/stock-out', {
      reason_code: 'lost_missing',
      incident_details: 'E2E missing item investigation',
      items: [{ inventory_item_id: item.id, quantity: 5 }],
    }, { 'Idempotency-Key': `e2e-rej-${item.id}` });
    expect(queued.status).toBe(202);
    const requestNo = queued.body.request?.request_no;
    expect(await getStock(request, inv.token, item.id)).toBe(8);

    await apiLogin(request, 'manager');
    await loginAs(page, 'manager');
    await page.goto('/manager/stock-approvals');
    const row = page.locator('tr', { hasText: requestNo });
    await expect(row).toBeVisible({ timeout: 30000 });
    await row.getByRole('button', { name: 'View' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
    await page.locator('.swal2-input').fill('Insufficient evidence for write-off');
    const rejectResp = page.waitForResponse((r) => r.url().includes('/stock-requests/') && r.url().endsWith('/reject'));
    await page.locator('.swal2-confirm').click();
    expect((await rejectResp).status()).toBe(200);

    expect(await getStock(request, inv.token, item.id)).toBe(8);
  });

  test('return record → inspect → restock returns stock once', async ({ page, request }) => {
    const inv = await apiLogin(request, 'inventory');
    const item = await makeItem(request, inv.token, `E2ESM-RET-${stamp}`);
    await stockIn(request, inv.token, item.id, 5);

    await loginAs(page, 'inventory');
    await page.goto('/inventory/returns');
    await page.getByRole('button', { name: /Record Return/i }).first().click();
    await pickItem(page, item.name);
    await page.locator('textarea[placeholder*="returning"]').fill('Customer brought back unopened item');
    await page.getByRole('button', { name: 'Record Return', exact: true }).last().click();
    await expect(page.getByText(/pending inspection/i).first()).toBeVisible({ timeout: 15000 });
    expect(await getStock(request, inv.token, item.id)).toBe(5);

    await page.locator('.sm-table').getByRole('button', { name: 'Inspect' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply Disposition' }).click();
    await expect(page.getByText(/returned to sellable stock/i)).toBeVisible({ timeout: 15000 });
    expect(await getStock(request, inv.token, item.id)).toBe(6);
  });

  test('quarantine holds stock out until release restocks once', async ({ page, request }) => {
    const inv = await apiLogin(request, 'inventory');
    const item = await makeItem(request, inv.token, `E2ESM-QTN-${stamp}`);
    await stockIn(request, inv.token, item.id, 5);

    const ret = await api(request, inv.token, 'post', '/inventory/returns', {
      inventory_item_id: item.id, quantity: 2,
      source_type: 'manual', return_reason: 'Suspect seal — hold for inspection',
    }, { 'Idempotency-Key': `e2e-qtn-${item.id}` });
    expect(ret.status).toBe(201);

    await loginAs(page, 'inventory');
    await page.goto('/inventory/returns');
    await page.locator('.sm-table').getByRole('button', { name: 'Inspect' }).first().click();
    await page.locator('input[type="radio"][value="quarantine"]').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply Disposition' }).click();
    await expect(page.getByText(/Marked as quarantine/i)).toBeVisible({ timeout: 15000 });
    expect(await getStock(request, inv.token, item.id)).toBe(5);

    // Release from quarantine → exactly one stock-in movement.
    await page.locator('.sm-tab', { hasText: 'Quarantined' }).click();
    await page.locator('.sm-table').getByRole('button', { name: 'Inspect' }).first().click();
    await page.locator('input[type="radio"][value="restock"]').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply Disposition' }).click();
    await expect(page.getByText(/returned to sellable stock/i)).toBeVisible({ timeout: 15000 });
    expect(await getStock(request, inv.token, item.id)).toBe(7);
  });

  test('movement reversal restores stock and stays linked to the original', async ({ page, request }) => {
    const inv = await apiLogin(request, 'inventory');
    const item = await makeItem(request, inv.token, `E2ESM-REV-${stamp}`);
    await stockIn(request, inv.token, item.id, 10);
    const out = await api(request, inv.token, 'post', '/inventory/stock-out', {
      reason_code: 'service_consumption',
      service_reference: 'E2E reversal source',
      items: [{ inventory_item_id: item.id, quantity: 4 }],
    }, { 'Idempotency-Key': `e2e-rev-src-${item.id}` });
    expect(out.status).toBe(201);
    expect(await getStock(request, inv.token, item.id)).toBe(6);

    await loginAs(page, 'inventory');
    await page.goto('/inventory/movements');
    const row = page.locator('tr', { hasText: item.name }).first();
    await row.getByRole('button', { name: /Reverse/i }).click();
    await expect(page.getByText(/remaining reversible|Restore/i).first()).toBeVisible({ timeout: 10000 });
    const qtyInput = page.locator('input[type="number"]').last();
    await qtyInput.fill('2');
    await page.locator('textarea').last().fill('Over-deducted at service close');
    await page.getByRole('button', { name: /Restore Stock|Remove Stock/i }).click();
    await expect(page.getByText(/Reversed 2 unit/i)).toBeVisible({ timeout: 15000 });
    expect(await getStock(request, inv.token, item.id)).toBe(8);
  });

  test('cashier cannot open the stock-out page', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.goto('/inventory/stock-out');
    await expect(page).not.toHaveURL(/\/inventory\/stock-out/, { timeout: 10000 });
  });

  test('idempotent replay applies stock-in exactly once', async ({ request }) => {
    const inv = await apiLogin(request, 'inventory');
    const item = await makeItem(request, inv.token, `E2ESM-IDEM-${stamp}`);
    const key = `e2e-idem-${item.id}`;
    const payload = {
      transaction_type: 'purchase',
      items: [{ inventory_item_id: item.id, quantity: 5 }],
    };

    const first = await api(request, inv.token, 'post', '/inventory/stock-in', payload, { 'Idempotency-Key': key });
    const replay = await api(request, inv.token, 'post', '/inventory/stock-in', payload, { 'Idempotency-Key': key });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed'] || replay.body.replayed).toBeTruthy();
    expect(replay.body.transaction_no).toBe(first.body.transaction_no);
    expect(await getStock(request, inv.token, item.id)).toBe(5);

    // Same key with a different payload must conflict.
    const clash = await api(request, inv.token, 'post', '/inventory/stock-in', {
      ...payload, items: [{ inventory_item_id: item.id, quantity: 6 }],
    }, { 'Idempotency-Key': key });
    expect(clash.status).toBe(409);
    expect(await getStock(request, inv.token, item.id)).toBe(5);
  });

  test('inventory role cannot reach approve endpoint even with a token', async ({ request }) => {
    const inv = await apiLogin(request, 'inventory');
    const res = await api(request, inv.token, 'post', '/manager/inventory/stock-requests/1/approve', {});
    expect(res.status).toBe(403);
  });
