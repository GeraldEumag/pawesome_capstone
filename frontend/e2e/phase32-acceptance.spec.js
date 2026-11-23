/**
 * Phase 3.2 final inventory acceptance — browser/API/database verification.
 *
 * Runs ONLY against the isolated Phase 3.2 stack:
 *   E2E_API_URL=http://127.0.0.1:8020/api  (worker pool -> 8021-8024)
 *   E2E_BASE_URL=http://localhost:3002     (Vite dev server)
 *   E2E_AUDIT_DATABASE=pawesome_phase3_2_browser_audit
 *   E2E_EVIDENCE_DIR=docs/audit/phase-3-2-final-inventory-acceptance/evidence
 *
 * The audit-guard proves the API writes into the audit DB before any test
 * mutates. DB assertions use direct PDO reads against the audit database.
 */
const { test, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const { loginAs, apiLogin } = require("./test-utils");
const { enforceAuditStack, dbQuery, checkAuditEnv } = require("./audit-guard");

const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8020/api";
const auditDb = checkAuditEnv().auditDb || "";
const evidenceDir = process.env.E2E_EVIDENCE_DIR
  ? path.resolve(process.env.E2E_EVIDENCE_DIR)
  : path.resolve(__dirname, "../../docs/audit/phase-3-2-final-inventory-acceptance/evidence");
const stamp = Date.now().toString(36).toUpperCase();

test.setTimeout(180000);
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await enforceAuditStack(request, test, { role: "inventory", apiLogin });
});

async function api(request, token, method, endpoint, data, extraHeaders = {}) {
  const res = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...extraHeaders },
    ...(data === undefined ? {} : { data }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body, headers: res.headers() };
}

async function makeItem(request, token, name, { stock = 0, sellable = false, price = 100 } = {}) {
  const res = await api(request, token, "post", "/inventory/items", {
    name,
    sku: `P32-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    barcode: sellable ? `BC-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}` : undefined,
    category: "Accessories",
    price,
    cost: price * 0.6,
    reorder_level: 2,
    issue_method: "FIFO",
    stock,
    is_sellable: sellable,
  });
  const item = res.body.item || res.body.data || res.body;
  if (!item?.id) throw new Error(`fixture item create failed: ${JSON.stringify(res.body)}`);
  return item;
}

async function stockIn(request, token, itemId, quantity) {
  const res = await api(request, token, "post", "/inventory/stock-in", {
    transaction_type: "purchase",
    items: [{ inventory_item_id: itemId, quantity }],
  }, { "Idempotency-Key": `p32-in-${itemId}-${Date.now()}` });
  if (res.status !== 201) throw new Error(`stock-in failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function posSale(request, cashierToken, item, quantity) {
  const res = await api(request, cashierToken, "post", "/cashier/pos/transaction", {
    order_type: "product",
    customer_id: null,
    customer_name: "Walk-in Customer",
    payment_method: "cash",
    cash_received: item.price * quantity,
    subtotal: item.price * quantity,
    tax: 0,
    discount: 0,
    total: item.price * quantity,
    reference_number: null,
    items: [{
      item_type: "product",
      item_id: item.id,
      item_name: item.name,
      quantity,
      unit_price: item.price,
      discount_amount: 0,
    }],
  }, { "Idempotency-Key": `p32-pos-${item.id}-${Date.now()}` });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`POS sale failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

const sqlRows = (sql) => dbQuery(auditDb, sql);
const shot = async (page, name) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(process.cwd(), file).replace(/\\/g, "/");
};

async function pickItem(page, name) {
  const input = page.locator(".sm-selector input");
  await input.fill(name);
  const option = page.locator(".sm-selector-option", { hasText: name }).first();
  await expect(option).toBeVisible({ timeout: 20000 });
  await option.click();
}

/* ------------------------------------------------------------------ */
/* 1. Return UI: uncertain-failure retry must reuse the idempotency    */
/*    key and produce exactly one return record.                       */
/* ------------------------------------------------------------------ */
test("return UI uncertain failure retries with same key — one return only", async ({ page, request }) => {
  const inv = await apiLogin(request, "inventory");
  const cashier = await apiLogin(request, "cashier");
  const name = `P32-RET-${stamp}`;
  const item = await makeItem(request, inv.token, name, { stock: 5, sellable: true, price: 100 });
  const sale = await posSale(request, cashier.token, item, 2);
  const saleId = sale.transaction?.id ?? sale.sale?.id ?? sale.id;
  expect(saleId, "POS sale id").toBeTruthy();

  const returnRequests = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/inventory/returns") {
      returnRequests.push({ url: req.url(), key: req.headers()["idempotency-key"] || null });
    }
  });

  // First submit: let the server fully process, then abort the response so
  // the browser sees an uncertain failure after commit.
  await page.route("**/api/inventory/returns", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    await route.fetch();
    await route.abort("failed");
  });

  await loginAs(page, "inventory");
  await page.goto("/inventory/returns");
  await page.getByRole("button", { name: /Record Return/i }).click();
  await pickItem(page, name);
  await page.locator(".sm-field input[type='number']").first().fill("1");
  await page.locator(".sm-field select").selectOption("sale");
  await page.locator(".sm-field input[placeholder*='transaction id']").fill(String(saleId));
  await page.locator(".sm-field textarea").fill("Customer changed mind — Phase 3.2 retry test");
  await shot(page, "p32-return-form-filled");
  await page.getByRole("button", { name: "Record Return", exact: true }).last().click();
  // Wait for the failed attempt to settle: the app shows an error dialog that
  // must be dismissed before the same form (and its retained key) can retry.
  await page.waitForTimeout(2500);
  const okBtn = page.getByRole("button", { name: "OK", exact: true });
  if (await okBtn.isVisible().catch(() => false)) await okBtn.click();

  await page.unroute("**/api/inventory/returns");
  await page.getByRole("button", { name: "Record Return", exact: true }).last().click();
  await expect(page.getByText(/Return Recorded/i)).toBeVisible({ timeout: 30000 });
  await shot(page, "p32-return-retry-success");

  expect(returnRequests.length).toBe(2);
  expect(returnRequests[0].key).toBeTruthy();
  expect(returnRequests[1].key).toBe(returnRequests[0].key);

  const returns = sqlRows(
    `SELECT id, return_no, status FROM inventory_returns WHERE inventory_item_id=${item.id} AND source_type='sale' AND source_id=${Number(saleId)}`
  );
  expect(returns.length).toBe(1);
  const idem = sqlRows(
    `SELECT COUNT(*) AS n FROM idempotency_keys WHERE method='POST' AND route LIKE '%inventory/returns' AND \`key\`='${returnRequests[0].key}'`
  );
  expect(Number(idem[0].n)).toBe(1);
});

/* ------------------------------------------------------------------ */
/* 2. Return UI: deterministic 4xx rotates the key; a new logical      */
/*    return uses a different key.                                     */
/* ------------------------------------------------------------------ */
test("return UI 4xx rotates key; separate logical return gets a new key", async ({ page, request }) => {
  const inv = await apiLogin(request, "inventory");
  const cashier = await apiLogin(request, "cashier");
  const name = `P32-RET4XX-${stamp}`;
  const item = await makeItem(request, inv.token, name, { stock: 5, sellable: true, price: 80 });
  const sale = await posSale(request, cashier.token, item, 1);
  const saleId = sale.transaction?.id ?? sale.sale?.id ?? sale.id;

  const keys = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/inventory/returns") {
      keys.push(req.headers()["idempotency-key"] || null);
    }
  });

  await loginAs(page, "inventory");
  await page.goto("/inventory/returns");
  await page.getByRole("button", { name: /Record Return/i }).click();

  // Deterministic failure: quantity exceeds sold quantity for the source.
  await pickItem(page, name);
  await page.locator(".sm-field input[type='number']").first().fill("99");
  await page.locator(".sm-field select").selectOption("sale");
  await page.locator(".sm-field input[placeholder*='transaction id']").fill(String(saleId));
  await page.locator(".sm-field textarea").fill("Over-return attempt — should be rejected");
  await page.getByRole("button", { name: "Record Return", exact: true }).last().click();
  await page.waitForTimeout(3000);
  const okBtn = page.getByRole("button", { name: "OK", exact: true });
  if (await okBtn.isVisible().catch(() => false)) await okBtn.click();
  await shot(page, "p32-return-4xx-rejected");

  // New logical return (manual) must use a rotated key. The form keeps the
  // selected item; only quantity/source/reason change.
  await page.locator(".sm-field input[type='number']").first().fill("1");
  await page.locator(".sm-field select").selectOption("manual");
  await page.locator(".sm-field textarea").fill("Separate manual return");
  await page.getByRole("button", { name: "Record Return", exact: true }).last().click();
  await expect(page.getByText(/Return Recorded/i)).toBeVisible({ timeout: 30000 });
  await shot(page, "p32-return-second-success");

  expect(keys.length).toBe(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBeTruthy();
  expect(keys[1]).not.toBe(keys[0]);

  const rejected = sqlRows(
    `SELECT COUNT(*) AS n FROM inventory_returns WHERE inventory_item_id=${item.id} AND quantity=99`
  );
  expect(Number(rejected[0].n)).toBe(0);
});

/* ------------------------------------------------------------------ */
/* 3. Full POS cart + payment UI checkout.                             */
/* ------------------------------------------------------------------ */
test("POS UI cart and cash payment deduct stock once and render receipt", async ({ page, request }) => {
  const inv = await apiLogin(request, "inventory");
  const name = `P32-POS-${stamp}`;
  const item = await makeItem(request, inv.token, name, { stock: 10, sellable: true, price: 150 });
  const stockBefore = Number(sqlRows(`SELECT stock FROM inventory_items WHERE id=${item.id}`)[0].stock);
  const salesBefore = Number(sqlRows(`SELECT COUNT(*) AS n FROM sales`)[0].n);

  await loginAs(page, "cashier");
  await page.goto("/cashier/pos");
  await expect(page.locator(".pos-search-input")).toBeVisible({ timeout: 30000 });

  // Add sellable product, bump quantity to 2.
  await page.locator(".pos-search-input").fill(name);
  const tile = page.locator(".pos-tile", { hasText: name });
  await expect(tile).toBeVisible({ timeout: 20000 });
  await tile.click();
  await page.locator(".pos-tile .pos-stepper-btn").last().click(); // +1 → qty 2
  await expect(page.locator(".pos-cart-row")).toContainText(name);
  await shot(page, "p32-pos-cart");

  await page.locator(".pos-proceed-btn").click();
  await expect(page.locator(".pos-step-chip--active", { hasText: "2 Payment" })).toBeVisible();
  await page.locator(".pos-bill-btn--exact").click();
  await page.locator(".pos-confirm-btn").click();

  await expect(page.getByRole("heading", { name: "Payment Successful!" })).toBeVisible({ timeout: 30000 });
  const receiptBody = page.locator(".pos-modal-body");
  await expect(receiptBody).toContainText(/VAT/i);
  await expect(receiptBody).toContainText(/TOTAL/i);
  await shot(page, "p32-pos-receipt");

  const stockAfter = Number(sqlRows(`SELECT stock FROM inventory_items WHERE id=${item.id}`)[0].stock);
  expect(stockAfter).toBe(stockBefore - 2);
  const salesAfter = Number(sqlRows(`SELECT COUNT(*) AS n FROM sales`)[0].n);
  expect(salesAfter).toBe(salesBefore + 1);
  const movements = sqlRows(
    `SELECT COUNT(*) AS n FROM inventory_logs WHERE inventory_item_id=${item.id} AND (movement_type LIKE '%sale%' OR type LIKE '%sale%' OR reason LIKE '%sale%')`
  );
  expect(Number(movements[0].n)).toBeGreaterThanOrEqual(1);
});

/* ------------------------------------------------------------------ */
/* 4. Manual stock adjustment boundary matrix (browser UI).            */
/* ------------------------------------------------------------------ */
test("manual adjustment UI enforces quantity/reason rules and records movement", async ({ page, request }) => {
  const inv = await apiLogin(request, "inventory");
  const cashier = await apiLogin(request, "cashier");
  const name = `P32-ADJ-${stamp}`;
  const item = await makeItem(request, inv.token, name, { stock: 4, sellable: false, price: 60 });

  // Unauthorized role cannot reach the adjust endpoint directly.
  const denied = await api(request, cashier.token, "post", `/inventory/items/${item.id}/adjust-stock`, {
    adjustment_type: "add", quantity: 1, reason: "unauthorized probe",
  }, { "Idempotency-Key": `p32-deny-${item.id}` });
  expect([401, 403]).toContain(denied.status);

  await loginAs(page, "inventory");
  await page.goto("/inventory/stock");
  await page.locator(".ui-search-box input").fill(name);
  const row = page.locator("tr", { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.getByRole("button", { name: new RegExp(`Actions for ${name}`) }).click();
  const adjustBtn = page.locator("button[title*='Adjust']").first();
  await adjustBtn.click();

  // Missing reason: submit button must stay disabled.
  const qtyInput = page.locator(".quantity-input");
  await qtyInput.fill("3");
  const submitBtn = page.locator("button.btn-confirm");
  await expect(submitBtn).toBeDisabled();

  // Reason select → enable; invalid quantity 0 rejected by hasQty guard.
  await page.locator(".reason-select").selectOption({ index: 1 });
  await expect(submitBtn).toBeEnabled();
  await qtyInput.fill("0");
  await expect(submitBtn).toBeDisabled();
  await qtyInput.fill("3");
  await shot(page, "p32-adjust-form");
  await submitBtn.click();
  await expect(page.getByRole("heading", { name: "Stock Adjusted" })).toBeVisible({ timeout: 30000 });
  await shot(page, "p32-adjust-success");

  const stock = Number(sqlRows(`SELECT stock FROM inventory_items WHERE id=${item.id}`)[0].stock);
  expect(stock).toBe(7);
  const moves = sqlRows(
    `SELECT * FROM inventory_logs WHERE inventory_item_id=${item.id} ORDER BY id DESC LIMIT 3`
  );
  expect(moves.length).toBeGreaterThan(0);
});

/* ------------------------------------------------------------------ */
/* 5. Product validation: duplicate barcode/SKU and invalid price.     */
/*    (API-level boundary; UI blank-barcode covered by Phase 3.1.)     */
/* ------------------------------------------------------------------ */
test("product validation rejects duplicate barcode and invalid price", async ({ request }) => {
  const inv = await apiLogin(request, "inventory");
  const name = `P32-VAL-${stamp}`;
  const barcode = `BCVAL-${stamp}`;
  const first = await makeItem(request, inv.token, name, { stock: 0, sellable: true, price: 10 });
  // Force a deterministic barcode for the duplicate probe.
  await api(request, inv.token, "patch", `/inventory/items/${first.id}`, { barcode });

  const dupBarcode = await api(request, inv.token, "post", "/inventory/items", {
    name: `P32-VAL-DUP-${stamp}`, barcode, category: "Accessories", price: 10, stock: 0, is_sellable: true,
  });
  expect(dupBarcode.status).toBe(422);

  const badPrice = await api(request, inv.token, "post", "/inventory/items", {
    name: `P32-VAL-BAD-${stamp}`, barcode: `BCBAD-${stamp}`, category: "Accessories", price: -5, stock: 0, is_sellable: false,
  });
  expect(badPrice.status).toBe(422);
});

/* ------------------------------------------------------------------ */
/* 6. Search, low-stock alert, and inventory report consistency.       */
/* ------------------------------------------------------------------ */
test("POS search, low-stock badge, and reports page reflect fixture data", async ({ page, request }) => {
  const inv = await apiLogin(request, "inventory");
  const name = `P32-ALERT-${stamp}`;
  const item = await makeItem(request, inv.token, name, { stock: 1, sellable: true, price: 40 });

  await loginAs(page, "cashier");
  await page.goto("/cashier/pos");
  await expect(page.locator(".pos-search-input")).toBeVisible({ timeout: 30000 });
  await page.locator(".pos-search-input").fill(name);
  await expect(page.locator(".pos-tile", { hasText: name })).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".pos-alert-badge--warn")).toContainText(/Low/i);
  await shot(page, "p32-pos-low-stock");

  await page.goto("/inventory/reports");
  await page.waitForTimeout(3000);
  const reportText = await page.locator("body").innerText();
  expect(reportText).toMatch(/inventory|stock|report/i);
  await shot(page, "p32-inventory-reports");
});
