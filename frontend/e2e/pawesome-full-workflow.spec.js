const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "pawesome-full-workflow");
const reportPath = path.join(rootDir, "FULL_WORKFLOW_PLAYWRIGHT_E2E_REPORT.md");
const proofPath = path.join(evidenceDir, "payment-proof.png");
const apiBase = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";

const credentials = {
  customer: { email: process.env.E2E_CUSTOMER_EMAIL || "customer@example.com", password: process.env.E2E_CUSTOMER_PASSWORD || "Password123!", route: "/customer" },
  receptionist: { email: process.env.E2E_RECEPTIONIST_EMAIL || "receptionist@example.com", password: process.env.E2E_RECEPTIONIST_PASSWORD || "Password123!", route: "/receptionist/bookings/veterinary" },
  cashier: { email: process.env.E2E_CASHIER_EMAIL || "cashier@example.com", password: process.env.E2E_CASHIER_PASSWORD || "Password123!", route: "/cashier/dashboard/payment-verification" },
  inventory: { email: process.env.E2E_INVENTORY_EMAIL || "inventory@example.com", password: process.env.E2E_INVENTORY_PASSWORD || "Password123!", route: "/inventory/history" },
  veterinary: { email: process.env.E2E_VETERINARY_EMAIL || "vet@example.com", password: process.env.E2E_VETERINARY_PASSWORD || "Password123!", route: "/veterinary/appointments" },
  manager: { email: process.env.E2E_MANAGER_EMAIL || "manager@example.com", password: process.env.E2E_MANAGER_PASSWORD || "Password123!", route: "/manager/reports" },
  admin: { email: process.env.E2E_ADMIN_EMAIL || "admin@example.com", password: process.env.E2E_ADMIN_PASSWORD || "Password123!", route: "/admin/reports" },
};

const audit = {
  startedAt: new Date().toISOString(),
  completedAt: null,
  status: "NOT_RUN",
  screenshots: [],
  console: [],
  network: [],
  records: {},
  checks: [],
};

function ensureEvidenceFolder() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  if (!fs.existsSync(proofPath)) {
    fs.writeFileSync(
      proofPath,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
    );
  }
}

function note(name, status, detail = "") {
  audit.checks.push({ name, status, detail });
}

function writeReport() {
  audit.completedAt = new Date().toISOString();
  const screenshotRows = audit.screenshots.map((s) => `| ${s.name} | \`${s.file}\` |`).join("\n") || "| None | N/A |";
  const checkRows = audit.checks.map((c) => `| ${c.name} | ${c.status} | ${c.detail || ""} |`).join("\n") || "| None | N/A | |";
  const issueRows = [...audit.console, ...audit.network]
    .map((i) => `| ${i.kind || i.type || "network"} | ${i.status || ""} | ${String(i.text || i.url || i.message).replace(/\|/g, "\\|")} |`)
    .join("\n") || "| None detected |  |  |";

  fs.writeFileSync(reportPath, `# Pawesome Full Workflow Playwright E2E Report

Status: **${audit.status}**

Started: ${audit.startedAt}
Completed: ${audit.completedAt}
Frontend: ${process.env.E2E_BASE_URL || "http://localhost:3002"}
Backend API: ${apiBase}

## Workflow Checks

| Check | Status | Detail |
| --- | --- | --- |
${checkRows}

## Evidence Screenshots

| Evidence | File |
| --- | --- |
${screenshotRows}

## Created Records

\`\`\`json
${JSON.stringify(audit.records, null, 2)}
\`\`\`

## Console Errors And Network 404/500s

| Kind | Status | Detail |
| --- | --- | --- |
${issueRows}

## Run Instructions

\`\`\`powershell
cd frontend
$env:E2E_BASE_URL = "http://localhost:3002"
$env:E2E_API_URL = "http://127.0.0.1:8000/api"
npx playwright test e2e/pawesome-full-workflow.spec.js --config=playwright.config.js
\`\`\`
`);
}

async function capture(page, name) {
  const file = `${name}.png`;
  const fullPath = path.join(evidenceDir, file);
  await page.screenshot({ path: fullPath, fullPage: true });
  audit.screenshots.push({ name, file: path.relative(rootDir, fullPath).replace(/\\/g, "/") });
}

function attachAudit(page) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      audit.console.push({ kind: "console", type: message.type(), text: message.text(), page: page.url() });
    }
  });
  page.on("response", (response) => {
    const status = response.status();
    if ((status === 404 || status >= 500) && response.url().includes("/api/")) {
      audit.network.push({ kind: "network", status, url: response.url(), method: response.request().method(), page: page.url() });
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/")) {
      audit.network.push({ kind: "network", status: "REQUEST_FAILED", url: request.url(), method: request.method(), message: request.failure()?.errorText });
    }
  });
}

async function api(request, session, method, endpoint, options = {}) {
  const response = await request[method.toLowerCase()](`${apiBase}${endpoint}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.token}`,
      ...(options.headers || {}),
    },
    data: options.data,
    multipart: options.multipart,
  });
  const text = await response.text();
  let body;
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

async function loginByApi(request, role) {
  const account = credentials[role];
  const response = await request.post(`${apiBase}/auth/login`, {
    headers: { Accept: "application/json" },
    data: { login: account.email, email: account.email, password: account.password },
  });
  if (!response.ok()) throw new Error(`Login failed for ${role}: ${response.status()} ${await response.text()}`);
  const body = await response.json();
  return { token: body.token || body.access_token, user: body.user };
}

async function loginThroughUi(page, role) {
  const account = credentials[role];
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
  await page.locator('input[type="text"], input[type="email"], input[name="login"], input[name="email"]').first().fill(account.email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(account.password);
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click();
  const ok = page.locator(".swal2-confirm, button:has-text('OK')").first();
  await ok.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  if (await ok.isVisible().catch(() => false)) {
    await ok.click();
  }
  await page.waitForURL(new RegExp(account.route.split("/")[1]), { timeout: 15000 });
}

async function openAsRole(browser, role, route, screenshotName) {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3002" });
  const session = await loginByApi(context.request, role);
  await context.addInitScript(({ token, user, role }) => {
    window.localStorage.setItem("token", token);
    window.localStorage.setItem("role", user?.role || role);
    window.localStorage.setItem("name", user?.name || role);
    window.localStorage.setItem("username", user?.username || user?.email || role);
    window.localStorage.setItem("email", user?.email || "");
  }, { token: session.token, user: session.user, role });
  const page = await context.newPage();
  attachAudit(page);
  await page.goto(route);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await capture(page, screenshotName);
  await context.close();
}

function daysFromNow(days) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function firstRecord(body, keys) {
  if (Array.isArray(body)) return body[0];
  for (const key of keys) {
    if (Array.isArray(body?.[key])) return body[key][0];
  }
  if (Array.isArray(body?.data)) return body.data[0];
  return body?.data || body?.request || body?.appointment || body?.pet || body?.item || body;
}

test.describe.serial("Pawesome full workflow", () => {
  test.setTimeout(180000);

  test.beforeAll(() => {
    ensureEvidenceFolder();
    writeReport();
  });

  test.afterAll(() => {
    audit.status = audit.console.length || audit.network.length ? "FAILED: console/network issues detected" : audit.status;
    writeReport();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      audit.status = "FAILED";
      note(testInfo.title, "FAIL", testInfo.error?.message || "Playwright test failed");
      writeReport();
    }
  });

  for (const role of Object.keys(credentials)) {
    test(`login as ${role}`, async ({ page }) => {
      attachAudit(page);
      await loginThroughUi(page, role);
      await capture(page, `01-login-${role}`);
      note(`Login for ${role}`, "PASS", credentials[role].email);
    });
  }

  test("customer to admin full workflow", async ({ browser, request }) => {
    const customer = await loginByApi(request, "customer");
    const receptionist = await loginByApi(request, "receptionist");
    const cashier = await loginByApi(request, "cashier");
    const inventory = await loginByApi(request, "inventory");
    await loginByApi(request, "veterinary");
    const manager = await loginByApi(request, "manager");
    const admin = await loginByApi(request, "admin");

    const stamp = Date.now();
    const petBody = await api(request, customer, "POST", "/customer/pets", {
      data: { name: `PW-E2E Pet ${stamp}`, species: "Dog", breed: "Demo", gender: "Female", age: 3 },
    });
    const pet = firstRecord(petBody, ["pet", "data"]);
    audit.records.petId = pet.id;

    const serviceBody = await api(request, customer, "POST", "/customer/requests", {
      data: {
        customer_name: customer.user?.name || "Customer",
        customer_email: customer.user?.email || credentials.customer.email,
        pet_id: pet.id,
        pet_name: pet.name,
        request_type: "grooming",
        service_type: "grooming",
        service_name: "Basic Bath and Blow Dry Small Breed",
        requested_date: daysFromNow(8),
        requested_time: "10:00",
        notes: `PW-E2E service request ${stamp}`,
        price: 500,
      },
    });
    const serviceRequest = firstRecord(serviceBody, ["request", "data"]);
    audit.records.serviceRequestId = serviceRequest.id;
    note("Customer creates booking/request/order", "PASS", `service_request #${serviceRequest.id}`);
    await openAsRole(browser, "customer", "/customer/services", "02-customer-created-request");

    await api(request, receptionist, "POST", `/receptionist/requests/${serviceRequest.id}/approve`, {
      data: { notes: "PW-E2E receptionist approval" },
    });
    note("Receptionist approves or schedules", "PASS", `service_request #${serviceRequest.id}`);
    await openAsRole(browser, "receptionist", "/receptionist/bookings/grooming", "03-receptionist-approved-request");

    await api(request, customer, "POST", `/customer/requests/${serviceRequest.id}/payment-proof`, {
      multipart: {
        payment_method: "GCash",
        payment_reference: `PW-E2E-${stamp}`,
        payment_proof: { name: "payment-proof.png", mimeType: "image/png", buffer: fs.readFileSync(proofPath) },
      },
    });
    note("Customer uploads payment proof", "PASS", `service_request #${serviceRequest.id}`);
    await openAsRole(browser, "customer", "/customer/payments", "04-customer-uploaded-payment-proof");

    const pendingPayments = await api(request, cashier, "GET", "/cashier/payments");
    const payment = (pendingPayments.payments || []).find((item) => item.id === serviceRequest.id && item.type === "service_request");
    expect(payment, "uploaded service request payment must appear for cashier").toBeTruthy();
    await api(request, cashier, "PUT", `/cashier/payments/${serviceRequest.id}/service_request/verify`, {
      data: { cashier_remarks: "PW-E2E verified payment" },
    });
    note("Cashier verifies/rejects payment", "PASS", `verified service_request #${serviceRequest.id}`);
    await openAsRole(browser, "cashier", "/cashier/dashboard/payment-verification", "05-cashier-verified-payment");

    const items = await api(request, inventory, "GET", "/inventory/items");
    const item = firstRecord(items, ["items", "data"]);
    expect(item?.id, "inventory item available for stock log check").toBeTruthy();
    await api(request, inventory, "GET", `/inventory/items/${item.id}`);
    await api(request, inventory, "GET", "/inventory/logs");
    note("Inventory stock/log check", "PASS", `inventory item #${item.id}`);
    await openAsRole(browser, "inventory", "/inventory/history", "06-inventory-stock-log-check");

    const vetBody = await api(request, customer, "POST", "/customer/vet", {
      data: { petId: pet.id, petName: pet.name, service: "checkup", date: daysFromNow(9), concern: `PW-E2E vet appointment ${stamp}` },
    });
    const vetAppointment = firstRecord(vetBody, ["appointment", "data"]);
    audit.records.vetAppointmentId = vetAppointment.id;
    await api(request, receptionist, "PATCH", `/vet/${vetAppointment.id}/status`, { data: { status: "completed" } });
    note("Veterinary appointment status update", "PASS", `vet appointment #${vetAppointment.id} completed via current /vet status route`);
    await openAsRole(browser, "veterinary", "/veterinary/appointments", "07-veterinary-status-updated");

    await api(request, manager, "GET", "/manager/reports/overview");
    await api(request, admin, "GET", "/admin/reports/overview");
    note("Manager/Admin reports visibility", "PASS", "manager and admin overview reports loaded");
    await openAsRole(browser, "manager", "/manager/reports", "08-manager-reports-visible");
    await openAsRole(browser, "admin", "/admin/reports", "09-admin-reports-visible");

    expect(audit.console, "console errors").toEqual([]);
    expect(audit.network, "API network 404/500 errors").toEqual([]);
    audit.status = "PASSED";
    writeReport();
  });
});
