# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: security-concurrency-audit.spec.js >> concurrent POS retries with one key create exactly one sale
- Location: e2e\security-concurrency-audit.spec.js:15:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 2
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | const { apiLogin } = require('./test-utils');
  3  | const { spawn } = require('node:child_process');
  4  | const path = require('node:path');
  5  | 
  6  | const apiUrl = process.env.E2E_API_URL;
  7  | const secondApiUrl = process.env.E2E_SECOND_API_URL;
  8  | 
  9  | test.beforeEach(() => {
  10 |   test.skip(process.env.E2E_AUDIT_DATABASE !== 'pawesome_e2e_audit', 'Requires the explicitly approved disposable audit database.');
  11 |   expect(apiUrl).toMatch(/^http:\/\/127\.0\.0\.1:8001\/api$/);
  12 |   expect(secondApiUrl).toBe('http://127.0.0.1:8002/api');
  13 | });
  14 | 
  15 | test('concurrent POS retries with one key create exactly one sale', async ({ request }, testInfo) => {
  16 |   test.setTimeout(60000);
  17 |   const admin = await apiLogin(request, 'admin');
  18 |   const cashier = await apiLogin(request, 'cashier');
  19 |   const sku = `AUDIT-RACE-${Date.now()}`;
  20 |   const created = await request.post(`${apiUrl}/admin/inventory`, {
  21 |     headers: { Authorization: `Bearer ${admin.token}` },
  22 |     data: { sku, barcode: `AUDIT${Date.now()}`, name: sku, category: 'Food', price: 100, stock: 5, reorder_level: 0, status: 'active' },
  23 |   });
  24 |   expect(created.status(), await created.text()).toBe(201);
  25 |   const item = (await created.json()).item;
  26 |   expect(item.stock).toBe(5);
  27 | 
  28 |   const holder = spawn('php', ['-r', '$db = new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit", "root", ""); $db->beginTransaction(); $q = $db->prepare("SELECT id FROM inventory_items WHERE id = ? FOR UPDATE"); $q->execute([(int)$argv[1]]); echo "locked\\n"; flush(); sleep(5); $db->rollBack();', String(item.id)], {
  29 |     cwd: path.resolve(__dirname, '../../backend'),
  30 |     stdio: ['ignore', 'pipe', 'pipe'],
  31 |   });
  32 |   const closed = new Promise((resolve, reject) => {
  33 |     holder.once('error', reject);
  34 |     holder.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Row-lock holder exited ${code}`)));
  35 |   });
  36 |   await new Promise((resolve, reject) => {
  37 |     holder.stdout.once('data', resolve);
  38 |     holder.once('error', reject);
  39 |     holder.once('exit', (code) => { if (code !== 0) reject(new Error(`Row-lock holder exited ${code}`)); });
  40 |   });
  41 | 
  42 |   const key = `audit-retry-${Date.now()}`;
  43 |   const payload = {
  44 |     items: [{ item_id: item.id, item_type: 'product', item_name: item.name, quantity: 1, unit_price: 100 }],
  45 |     payment_method: 'cash',
  46 |     cash_received: 100,
  47 |   };
  48 |   const responses = await Promise.all([apiUrl, secondApiUrl].map((url) => request.post(`${url}/cashier/pos/transaction`, {
  49 |     headers: { Authorization: `Bearer ${cashier.token}`, 'Idempotency-Key': key },
  50 |     data: payload,
  51 |   })));
  52 |   await closed;
  53 |   const results = await Promise.all(responses.map(async (response) => ({ status: response.status(), body: await response.json() })));
  54 |   const updated = await request.get(`${apiUrl}/admin/inventory/${item.id}`, { headers: { Authorization: `Bearer ${admin.token}` } });
  55 |   expect(updated.ok()).toBeTruthy();
  56 |   const finalItem = (await updated.json()).item;
  57 |   await testInfo.attach('concurrency-evidence', {
  58 |     body: JSON.stringify({ sku, item_id: item.id, initial_stock: 5, final_stock: finalItem.stock, results }, null, 2),
  59 |     contentType: 'application/json',
  60 |   });
  61 |   expect(results.map((result) => result.status)).toEqual([200, 200]);
> 62 |   expect(results[0].body.transaction.id).toBe(results[1].body.transaction.id);
     |                                          ^ Error: expect(received).toBe(expected) // Object.is equality
  63 |   expect(finalItem.stock).toBe(4);
  64 | });
  65 | 
```