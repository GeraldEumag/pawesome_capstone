const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { apiLogin } = require("./test-utils");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const evidenceDir = path.resolve(__dirname, "../../browser-evidence/currency-standardization");

test.beforeEach(() => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  expect(apiUrl).toBe("http://127.0.0.1:8001/api");
});

async function openAs(browser, session, route) {
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("token", token);
    window.localStorage.setItem("role", user.role);
    window.localStorage.setItem("name", user.name);
    window.localStorage.setItem("username", user.username || user.email);
    window.localStorage.setItem("email", user.email);
    if (user.email_verified_at) window.localStorage.setItem("email_verified_at", user.email_verified_at);
  }, { token: session.token, user: session.user });
  const page = await context.newPage();
  await page.goto(route);
  return { context, page };
}

function shot(page, name) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  return page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: false });
}

// Scan visible text for stray US-dollar money patterns like "$1,234.56" or "USD".
// A bare "$" in code/labels is not a defect — only $ followed by a digit is checked.
async function assertNoDollarMoney(page, screen) {
  const bodyText = await page.locator("body").innerText();
  const offenders = bodyText.match(/\$\s?\d|USD\s?\d|US\$\s?\d/g) || [];
  expect(offenders, `${screen} rendered USD-style money: ${offenders.slice(0, 5).join(", ")}`).toHaveLength(0);
}

test("admin dashboard shows peso amounts only", async ({ browser, request }) => {
  const session = await apiLogin(request, "admin");
  const { context, page } = await openAs(browser, session, "/admin");
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(2500); // let dashboard cards/charts fetch
  await assertNoDollarMoney(page, "admin dashboard");
  await shot(page, "01-admin-dashboard");
  await context.close();
});

test("manager payroll shows peso amounts only", async ({ browser, request }) => {
  const session = await apiLogin(request, "manager");
  const { context, page } = await openAs(browser, session, "/manager/payroll");
  await expect(page.locator("body")).toBeVisible();
  await page.locator("table tbody tr").first().waitFor({ timeout: 20000 }).catch(() => {});
  await assertNoDollarMoney(page, "manager payroll");
  await shot(page, "02-manager-payroll");
  await context.close();
});

test("cashier my-payroll shows peso amounts only", async ({ browser, request }) => {
  const session = await apiLogin(request, "cashier");
  const { context, page } = await openAs(browser, session, "/cashier/payroll");
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(2000);
  await assertNoDollarMoney(page, "cashier payroll");
  await shot(page, "03-cashier-my-payroll");
  await context.close();
});

test("cashier payment verification shows peso amounts only", async ({ browser, request }) => {
  const session = await apiLogin(request, "cashier");
  const { context, page } = await openAs(browser, session, "/cashier/payment-verification");
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(2500);
  await assertNoDollarMoney(page, "cashier payment verification");
  await shot(page, "04-cashier-payment-verification");
  await context.close();
});

test("cashier POS shows peso amounts only", async ({ browser, request }) => {
  const session = await apiLogin(request, "cashier");
  const { context, page } = await openAs(browser, session, "/cashier/pos");
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(2500);
  await assertNoDollarMoney(page, "cashier POS");
  await shot(page, "05-cashier-pos");
  await context.close();
});

test("customer payments shows peso amounts only", async ({ browser, request }) => {
  const session = await apiLogin(request, "customer");
  const { context, page } = await openAs(browser, session, "/customer/payments");
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(2500);
  await assertNoDollarMoney(page, "customer payments");
  await shot(page, "06-customer-payments");
  await context.close();
});

test("admin reports shows peso amounts only", async ({ browser, request }) => {
  const session = await apiLogin(request, "admin");
  const { context, page } = await openAs(browser, session, "/admin/reports");
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(3000); // reports fetch several datasets
  await assertNoDollarMoney(page, "admin reports");
  await shot(page, "07-admin-reports");
  await context.close();
});
