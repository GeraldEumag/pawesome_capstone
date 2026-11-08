const { test, expect } = require('@playwright/test');
const { apiLogin } = require('./test-utils');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const apiUrl = process.env.E2E_API_URL;
const secondApiUrl = process.env.E2E_SECOND_API_URL;

test.beforeEach(() => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== 'pawesome_e2e_audit', 'Requires the explicitly approved disposable audit database.');
  expect(apiUrl).toMatch(/^http:\/\/127\.0\.0\.1:8001\/api$/);
  expect(secondApiUrl).toBe('http://127.0.0.1:8002/api');
});

test('concurrent POS retries with one key create exactly one sale', async ({ request }, testInfo) => {
  test.setTimeout(60000);
  const admin = await apiLogin(request, 'admin');
  const cashier = await apiLogin(request, 'cashier');
  const sku = `AUDIT-RACE-${Date.now()}`;
  const created = await request.post(`${apiUrl}/admin/inventory`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { sku, barcode: `AUDIT${Date.now()}`, name: sku, category: 'Food', price: 100, stock: 5, reorder_level: 0, status: 'active' },
  });
  expect(created.status(), await created.text()).toBe(201);
  const item = (await created.json()).item;
  expect(item.stock).toBe(5);

  const holder = spawn('php', ['-r', '$db = new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit", "root", ""); $db->beginTransaction(); $q = $db->prepare("SELECT id FROM inventory_items WHERE id = ? FOR UPDATE"); $q->execute([(int)$argv[1]]); echo "locked\\n"; flush(); sleep(5); $db->rollBack();', String(item.id)], {
    cwd: path.resolve(__dirname, '../../backend'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Row-lock holder exited ${code}`)));
  });
  await new Promise((resolve, reject) => {
    holder.stdout.once('data', resolve);
    holder.once('error', reject);
    holder.once('exit', (code) => { if (code !== 0) reject(new Error(`Row-lock holder exited ${code}`)); });
  });

  const key = `audit-retry-${Date.now()}`;
  const payload = {
    items: [{ item_id: item.id, item_type: 'product', item_name: item.name, quantity: 1, unit_price: 100 }],
    payment_method: 'cash',
    cash_received: 100,
  };
  const responses = await Promise.all([apiUrl, secondApiUrl].map((url) => request.post(`${url}/cashier/pos/transaction`, {
    headers: { Authorization: `Bearer ${cashier.token}`, 'Idempotency-Key': key },
    data: payload,
  })));
  await closed;
  const results = await Promise.all(responses.map(async (response) => ({ status: response.status(), body: await response.json() })));
  const updated = await request.get(`${apiUrl}/admin/inventory/${item.id}`, { headers: { Authorization: `Bearer ${admin.token}` } });
  expect(updated.ok()).toBeTruthy();
  const finalItem = (await updated.json()).item;
  const evidencePath = testInfo.outputPath('concurrency-evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({ sku, item_id: item.id, initial_stock: 5, final_stock: finalItem.stock, results }, null, 2));
  await testInfo.attach('concurrency-evidence', { path: evidencePath, contentType: 'application/json' });
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  expect(results[0].body.transaction.id).toBe(results[1].body.transaction.id);
  expect(finalItem.stock).toBe(4);
});
