const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "cashier-inventory-workflow");
const resultPath = path.join(evidenceDir, "cashier-inventory-workflow-results.json");
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";

const accounts = {
  cashier: { email: "cashier@example.com", password: "Password123!", dashboard: "/cashier" },
  inventory: { email: "inventory@example.com", password: "Password123!", dashboard: "/inventory" },
  manager: { email: "manager@example.com", password: "Password123!", dashboard: "/manager" },
};

const run = {
  startedAt: new Date().toISOString(),
  completedAt: null,
  frontendUrl,
  apiUrl,
  status: "NOT_RUN",
  pages: [],
  actions: [],
  screenshots: [],
  records: {},
  console: [],
  httpFailures: [],
  navigationAborts: [],
  limitations: [],
};

function ensureEvidenceDir() {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

function writeResults() {
  run.completedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(run, null, 2));
}

function relativeToRoot(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function normalizeList(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
    if (Array.isArray(value?.data?.[key])) return value.data[key];
  }
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.products)) return value.products;
  if (Array.isArray(value?.logs)) return value.logs;
  if (Array.isArray(value?.history)) return value.history;
  if (Array.isArray(value?.transactions)) return value.transactions;
  return [];
}

function getStock(item) {
  return Number(item?.stock ?? item?.available_stock ?? item?.stock_quantity ?? item?.quantity ?? 0);
}

function getPrice(item) {
  return Number(item?.price ?? item?.selling_price ?? item?.unit_price ?? 0);
}

function recordAction(name, status, detail = "") {
  run.actions.push({ name, status, detail });
  writeResults();
}

function attachAudit(page) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      run.console.push({ type: message.type(), text: message.text(), page: page.url() });
    }
  });

  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (url.includes("/api/") && [401, 403, 404, 500].includes(status)) {
      run.httpFailures.push({
        status,
        method: response.request().method(),
        url,
        page: page.url(),
      });
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("/api/")) return;
    const failure = request.failure()?.errorText || "unknown";
    const entry = { method: request.method(), url, page: page.url(), failure };
    if (failure === "net::ERR_ABORTED") {
      run.navigationAborts.push(entry);
    } else {
      run.httpFailures.push({ status: "REQUEST_FAILED", ...entry });
    }
  });
}

async function screenshot(page, label) {
  const filePath = path.join(evidenceDir, `${label}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  const relative = relativeToRoot(filePath);
  run.screenshots.push(relative);
  return relative;
}

async function visibleText(page) {
  return page.locator("body").evaluate((body) => body.innerText.trim()).catch(() => "");
}

async function visit(page, route, label, expectedText = null, apiPattern = null) {
  const apiWait = apiPattern
    ? page.waitForResponse(
        (response) =>
          response.url().includes(apiPattern) &&
          response.request().method() === "GET" &&
          response.status() < 400,
        { timeout: 20000 }
      ).catch(() => null)
    : Promise.resolve(null);

  await page.goto(route);
  await page.waitForLoadState("domcontentloaded");
  await apiWait;
  const expectedRegex = expectedText ? new RegExp(expectedText, "i") : null;
  if (expectedRegex) {
    await page
      .getByText(expectedRegex)
      .first()
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => {});
  }
  await page.waitForTimeout(500);
  const text = await visibleText(page);
  const shot = await screenshot(page, label);
  const rendered = text.length > 40;
  const containsExpected = expectedRegex ? expectedRegex.test(text) : true;
  run.pages.push({ route, label, rendered, containsExpected, screenshot: shot });
  expect(rendered, `${route} should render visible content`).toBe(true);
  expect(containsExpected, `${route} should contain ${expectedText}`).toBe(true);
  writeResults();
  return text;
}

async function loginThroughUi(page, role) {
  const account = accounts[role];
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.locator('input[type="text"], input[type="email"]').first().fill(account.email);
  await page.locator('input[type="password"]').first().fill(account.password);
  await page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').first().click();
  const ok = page.locator(".swal2-confirm, button:has-text('OK')").first();
  await expect(ok).toBeVisible({ timeout: 15000 });
  await ok.click();
  await page.waitForURL(`**${account.dashboard}**`, { timeout: 20000 });
  recordAction(`Login as ${role}`, "PASS", account.email);
}

async function logout(page) {
  await page.goto("/logout");
  await page.waitForURL("**/login", { timeout: 15000 }).catch(() => {});
}

async function apiLogin(request, role) {
  const account = accounts[role];
  const response = await request.post(`${apiUrl}/auth/login`, {
    headers: { Accept: "application/json" },
    data: { login: account.email, email: account.email, password: account.password },
  });
  if (!response.ok()) {
    throw new Error(`API login failed for ${role}: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return { token: body.token || body.access_token, user: body.user || {} };
}

async function api(request, session, method, endpoint, options = {}) {
  const response = await request[method.toLowerCase()](`${apiUrl}${endpoint}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.token}`,
      ...(options.headers || {}),
    },
    data: options.data,
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok()) {
    throw new Error(`${method} ${endpoint} failed ${response.status()}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function apiMaybe(request, session, method, endpoint, options = {}) {
  const response = await request[method.toLowerCase()](`${apiUrl}${endpoint}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.token}`,
      ...(options.headers || {}),
    },
    data: options.data,
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: response.ok(), status: response.status(), body };
}

async function getSellableProducts(request, cashierSession) {
  const response = await api(request, cashierSession, "GET", "/cashier/inventory/sellable");
  return normalizeList(response, ["products", "data"]).filter((item) => item?.id && getStock(item) > 1 && getPrice(item) > 0);
}

async function createPosSale(request, cashierSession, products) {
  const candidates = products.slice(0, 8);
  for (const product of candidates) {
    const price = getPrice(product);
    const payload = {
      customer_name: "Walk-in Browser Test",
      items: [
        {
          item_type: "product",
          item_id: product.id,
          item_name: product.name,
          quantity: 1,
          unit_price: price,
          discount_amount: 0,
        },
      ],
      payment_method: "cash",
      cash_received: price + 100,
      subtotal: price,
      tax: Number((price * 0.12 / 1.12).toFixed(2)),
      discount: 0,
      total: price,
      notes: `CASHIER_INVENTORY_WORKFLOW ${Date.now()}`,
    };

    const result = await apiMaybe(request, cashierSession, "POST", "/cashier/pos/transaction", { data: payload });
    if (result.ok && result.body?.success) {
      return { product, transaction: result.body.transaction, receipt: result.body.receipt };
    }
  }

  throw new Error("No sellable POS product candidate could be sold successfully.");
}

function findPosLog(logs, product, transaction) {
  return logs.find((log) => {
    const itemId = Number(log.inventory_item_id ?? log.item_id ?? log.inventoryItemId ?? log.inventory_item?.id);
    const referenceId = Number(log.reference_id ?? log.referenceId);
    const movement = String(log.movement_type ?? log.action ?? log.type ?? "").toLowerCase();
    const reference = String(log.reference_type ?? "").toLowerCase();
    const itemName = String(log.item_name ?? log.inventory_item?.name ?? "").toLowerCase();

    return (
      (itemId === Number(product.id) || itemName.includes(String(product.name || "").toLowerCase())) &&
      (referenceId === Number(transaction.id) || movement.includes("pos") || reference === "sale")
    );
  });
}

test.setTimeout(360000);

test("Cashier POS to Inventory Stock Logs to Manager Reports", async ({ page, request }) => {
  ensureEvidenceDir();
  page.setDefaultTimeout(20000);
  attachAudit(page);

  const cashierSession = await apiLogin(request, "cashier");
  const inventorySession = await apiLogin(request, "inventory");
  const managerSession = await apiLogin(request, "manager");

  await loginThroughUi(page, "cashier");
  await visit(page, "/cashier/pos", "01-cashier-pos", "point of sale|cart|checkout|payment|products", "/api/cashier/inventory/sellable");

  const beforeProducts = await getSellableProducts(request, cashierSession);
  expect(beforeProducts.length, "sellable products with stock should exist").toBeGreaterThan(0);
  recordAction("Verify sellable inventory items load", "PASS", `${beforeProducts.length} product candidates`);

  const sale = await createPosSale(request, cashierSession, beforeProducts);
  run.records.productId = sale.product.id;
  run.records.productName = sale.product.name;
  run.records.stockBefore = getStock(sale.product);
  run.records.transactionId = sale.transaction.id;
  run.records.transactionNumber = sale.transaction.transaction_number;
  recordAction("Complete POS transaction via API", "PASS", `${sale.product.name} transaction #${sale.transaction.id}`);

  const transactionDetail = await api(request, cashierSession, "GET", `/cashier/pos/transaction/${sale.transaction.id}`);
  expect(transactionDetail.transaction?.id || transactionDetail.transaction?.transaction_number).toBeTruthy();
  recordAction("Verify POS transaction receipt/detail", "PASS", sale.transaction.transaction_number || `#${sale.transaction.id}`);
  await visit(page, "/cashier/transactions", "02-cashier-transactions", "transaction|sales|history|receipt", "/api/cashier/transactions");
  await logout(page);

  const afterProducts = await getSellableProducts(request, cashierSession);
  const afterProduct = afterProducts.find((item) => Number(item.id) === Number(sale.product.id));
  run.records.stockAfter = afterProduct ? getStock(afterProduct) : 0;
  expect(run.records.stockAfter, "stock should decrease by one after POS sale").toBe(run.records.stockBefore - 1);
  recordAction("Verify item stock decreased", "PASS", `${sale.product.name}: ${run.records.stockBefore} -> ${run.records.stockAfter}`);

  await loginThroughUi(page, "inventory");
  await visit(page, "/inventory/history", "03-inventory-stock-history", "inventory|history|stock|log|movement", "/api/inventory/logs");
  const inventoryLogsResponse = await api(request, inventorySession, "GET", "/inventory/logs");
  const inventoryLogs = normalizeList(inventoryLogsResponse, ["logs", "history", "data"]);
  const posLog = findPosLog(inventoryLogs, sale.product, sale.transaction);
  expect(posLog, "inventory log should show POS stock deduction").toBeTruthy();
  run.records.inventoryLogId = posLog.id;
  run.records.inventoryLogMovement = posLog.movement_type || posLog.action || posLog.type;
  recordAction("Verify inventory stock log for POS sale", "PASS", `log #${posLog.id} ${run.records.inventoryLogMovement}`);
  await logout(page);

  await loginThroughUi(page, "manager");
  await api(request, managerSession, "GET", "/manager/reports/sales");
  await api(request, managerSession, "GET", "/manager/reports/inventory");
  await visit(page, "/manager", "04-manager-dashboard-after-pos", "manager|dashboard|reports|sales", "/api/manager/dashboard");
  await visit(page, "/manager/reports", "05-manager-reports-after-pos", "reports|sales|inventory|payments", "/api/manager/reports/live");
  recordAction("Verify Manager reports after POS activity", "PASS", "sales and inventory report APIs loaded");

  run.limitations.push("Boarding/hotel workflow not included because latest DB has hotel_rooms=0.");
  run.limitations.push("Payment proof verification is separate from POS cash sale validation and remains pending if seeded proof data is unavailable.");
  run.limitations.push("Playwright net::ERR_ABORTED entries are recorded separately as navigation/background request aborts.");
  run.status = "PASSED";
  writeResults();

  const criticalHttpFailures = run.httpFailures.filter((failure) =>
    [401, 403, 404, 500, "REQUEST_FAILED"].includes(failure.status)
  );

  expect(run.console, "browser console errors").toEqual([]);
  expect(criticalHttpFailures, "HTTP 401/403/404/500 failures").toEqual([]);
});
