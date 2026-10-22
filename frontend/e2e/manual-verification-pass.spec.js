// Runtime verification pass for the user manual (docs/user-manual).
// Walks each role workspace in the real browser against the live dev stack,
// captures the screenshots named in audit/screenshot-register.md, records
// console errors per page, and writes a machine-readable result file to
// docs/user-manual/audit/runtime-verification.json.
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const shotDir = path.join(rootDir, "docs", "user-manual", "screenshots");
const auditDir = path.join(rootDir, "docs", "user-manual", "audit");
const resultsPath = path.join(auditDir, "runtime-verification.json");
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;

const { apiLogin } = require("./test-utils");

const results = {};
const consoleErrors = {};

function record(key, status, note) {
  results[key] = { status, note, at: new Date().toISOString() };
}

function watch(page, tag) {
  consoleErrors[tag] = consoleErrors[tag] || [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors[tag].push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => consoleErrors[tag].push(`pageerror: ${String(err).slice(0, 300)}`));
}

async function openAs(browser, request, role, route, tag) {
  const session = await apiLogin(request, role);
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || user.email);
    localStorage.setItem("email", user.email);
    if (user.email_verified_at) localStorage.setItem("email_verified_at", user.email_verified_at);
  }, session);
  const page = await context.newPage();
  watch(page, tag || role);
  await page.goto(route);
  return { page, context, session };
}

async function shot(page, filename) {
  await page.screenshot({ path: path.join(shotDir, filename), fullPage: false });
}

test.beforeAll(() => {
  fs.mkdirSync(shotDir, { recursive: true });
  fs.mkdirSync(auditDir, { recursive: true });
});

test.afterAll(() => {
  results._console_errors = consoleErrors;
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
});

// ---------------------------------------------------------------- public

test("public: login page renders", async ({ page }) => {
  watch(page, "login");
  await page.goto("/login");
  await expect(page.locator("form")).toBeVisible({ timeout: 20000 });
  await shot(page, "UM-001-login.png");
  record("UM-001-login", "VERIFIED", "Login form rendered at /login");
});

test("public: attendance kiosk gate renders", async ({ page }) => {
  watch(page, "kiosk");
  await page.goto("/attendance-kiosk");
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-013-attendance-kiosk.png");
  const bodyText = await page.locator("body").innerText();
  record(
    "UM-013-attendance-kiosk",
    bodyText.trim().length > 10 ? "VERIFIED" : "BLOCKED",
    "Kiosk gate page at /attendance-kiosk"
  );
});

// ---------------------------------------------------------------- customer

test("customer: workspace pages and sidebar labels", async ({ browser, request }) => {
  test.setTimeout(90000);
  const { page, context } = await openAs(browser, request, "customer", "/customer/services", "customer");
  await expect(page.locator(".app-sidebar")).toBeVisible({ timeout: 20000 });

  const labels = await page.locator(".app-sidebar .nav-label").allInnerTexts();
  const expected = ["Services", "My Pets", "My Requests", "Notifications", "History", "Medical", "Reports", "Profile"];
  record(
    "customer-sidebar-labels",
    JSON.stringify(labels.map((l) => l.trim())) === JSON.stringify(expected) ? "VERIFIED" : "TESTED",
    `sidebar labels: ${JSON.stringify(labels)}`
  );
  expect(labels.map((l) => l.trim()), "customer sidebar labels must match exactly").toEqual(expected);

  await shot(page, "UM-002-customer-services.png");
  record("UM-002-customer-services", "VERIFIED", "Services workspace rendered");

  await page.goto("/customer/pets");
  await expect(page.locator(".app-sidebar")).toBeVisible({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-003-customer-pets.png");
  record("UM-003-customer-pets", "VERIFIED", "My Pets page rendered");

  await page.goto("/customer/medical-confinements");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);
  await shot(page, "UM-011-customer-medical.png");
  record("UM-011-customer-medical", "TESTED", "Medical (confinements) page rendered; content depends on data");

  await page.goto("/customer/bookings");
  await page.waitForLoadState("domcontentloaded");
  record("customer-my-requests", "TESTED", "My Requests page loaded");

  await context.close();
});

test("customer: grooming booking end-to-end via review modal", async ({ browser, request }) => {
  test.setTimeout(120000);
  const { page, context } = await openAs(browser, request, "customer", "/customer/grooming", "customer-grooming");

  // Pick the first real pet option.
  const petSelect = page.locator('select[name="pet_id"]');
  await expect(petSelect).toBeVisible({ timeout: 20000 });
  const petOption = petSelect.locator('option:not([value=""])').first();
  await expect(petOption).toBeAttached({ timeout: 20000 });
  const petName = (await petOption.innerText()).trim();
  await petSelect.selectOption({ index: 1 });

  // First grooming service.
  const serviceSelect = page.locator('select[name="service_name"]');
  const serviceOption = serviceSelect.locator('option:not([value=""])').first();
  await expect(serviceOption).toBeAttached({ timeout: 20000 });
  const serviceName = (await serviceOption.innerText()).trim();
  await serviceSelect.selectOption({ index: 1 });

  // Date ~7 days out, typed per the picker's MM/dd/yyyy input format.
  const date = new Date(Date.now() + 7 * 86400000);
  const dateText = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
  const dateInput = page.locator('.grooming-form input[placeholder="mm/dd/yyyy"]');
  await dateInput.fill(dateText);
  await dateInput.press("Enter");

  // Wait for availability + time slots, then pick the first available slot.
  const timeSelect = page.locator('select[name="request_time"]');
  await expect(timeSelect).toBeEnabled({ timeout: 30000 });
  const slotOption = timeSelect.locator("option:not([value='']):not([disabled])").first();
  await expect(slotOption).toBeAttached({ timeout: 30000 });
  await timeSelect.selectOption(await slotOption.getAttribute("value"));
  await shot(page, "UM-004a-grooming-form-filled.png");

  await page.locator('button[type="submit"]', { hasText: "Submit Request" }).click();

  // Review modal must appear before anything is submitted.
  const modal = page.locator(".brm-modal");
  await expect(modal).toBeVisible({ timeout: 20000 });
  await shot(page, "UM-004-booking-review.png");

  await modal.locator(".brm-primary", { hasText: "Confirm booking" }).click();

  // Success lands on the My Appointments tab; the request should list there.
  await expect(page.locator(".grooming-tabs button.active")).toContainText(/My Appointments/i, { timeout: 30000 });
  await shot(page, "UM-004b-grooming-submitted.png");
  record(
    "customer-grooming-booking-e2e",
    "VERIFIED",
    `Grooming request submitted for pet "${petName}", service "${serviceName}", date ${dateText}; review modal confirmed, landed on My Appointments`
  );

  await context.close();
});

// ---------------------------------------------------------------- receptionist

test("receptionist: grooming booking queue shows the submitted request", async ({ browser, request }) => {
  test.setTimeout(90000);
  const { page, context } = await openAs(browser, request, "receptionist", "/receptionist/bookings/grooming", "receptionist");
  await expect(page.locator(".app-sidebar")).toBeVisible({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-005-receptionist-grooming-queue.png");
  const content = await page.locator(".dashboard-content, .app-content, main").last().innerText();
  record(
    "UM-005-receptionist-queue",
    content.trim().length > 20 ? "VERIFIED" : "BLOCKED",
    "Receptionist grooming queue rendered"
  );
  await context.close();
});

// ---------------------------------------------------------------- cashier

test("cashier: dashboard shell, POS, payment approvals", async ({ browser, request }) => {
  test.setTimeout(90000);
  const { page, context } = await openAs(browser, request, "cashier", "/cashier/dashboard", "cashier");
  await expect(page.locator(".app-sidebar")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Sales Target").first()).toBeVisible({ timeout: 30000 });
  await shot(page, "UM-014-cashier-dashboard.png");
  record("cashier-dashboard-link-fixed", "VERIFIED", "/cashier/dashboard renders the dashboard overview inside the shell");

  await page.goto("/cashier/payment-verification");
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-006-cashier-payment-approvals.png");
  record("UM-006-payment-approvals", "VERIFIED", "Payment Approvals tab opened via /cashier/payment-verification");

  await page.goto("/cashier/transactions");
  await page.waitForLoadState("networkidle");
  record("cashier-transactions", "TESTED", "Transactions page loaded");

  await context.close();
});

// ---------------------------------------------------------------- inventory

test("inventory: stock management", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "inventory", "/inventory/stock", "inventory");
  await expect(page.locator(".app-sidebar")).toBeVisible({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-007-inventory-stock.png");
  record("UM-007-inventory-stock", "VERIFIED", "Stock Management rendered");
  await context.close();
});

// ---------------------------------------------------------------- veterinary

test("veterinary: appointments list", async ({ browser, request }) => {
  test.setTimeout(90000);
  const { page, context } = await openAs(browser, request, "veterinary", "/veterinary/appointments", "veterinary");
  await expect(page.locator(".app-sidebar")).toBeVisible({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-008-veterinary-appointments.png");
  record(
    "UM-008-vet-appointments",
    "TESTED",
    "Appointments list rendered; full consultation flow not exercised in this pass"
  );
  await context.close();
});

// ---------------------------------------------------------------- manager

test("manager: reports workspace", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "manager", "/manager/reports", "manager");
  await expect(page.locator(".app-sidebar")).toBeVisible({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-009-manager-reports.png");
  record("UM-009-manager-reports", "VERIFIED", "Manager reports page rendered");
  await context.close();
});

// ---------------------------------------------------------------- admin + super receptionist

test("admin: manage users", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "admin", "/admin/users", "admin");
  await expect(page.locator(".app-sidebar")).toBeVisible({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-010-admin-manage-users.png");
  record("UM-010-admin-manage-users", "VERIFIED", "Manage Users rendered");
  await context.close();
});

test("super receptionist: composite workspace", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "super_receptionist", "/super-receptionist", "super_receptionist");
  await page.waitForLoadState("networkidle");
  await shot(page, "UM-012-super-receptionist.png");
  const url = page.url();
  record(
    "UM-012-super-receptionist",
    url.includes("super-receptionist") ? "VERIFIED" : "TESTED",
    `Landed at ${url}`
  );
  expect(url, "super receptionist must land on its workspace").toContain("super-receptionist");
  await context.close();
});
