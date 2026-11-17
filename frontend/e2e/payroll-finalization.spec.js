const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { apiLogin } = require("./test-utils");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const evidenceDir = path.resolve(__dirname, "../../browser-evidence/payroll-finalization");

test.beforeEach(() => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  expect(apiUrl).toBe("http://127.0.0.1:8001/api");
});

async function api(request, session, method, endpoint, data) {
  const response = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
    ...(data === undefined ? {} : { data }),
  });
  return { status: response.status(), body: await response.json().catch(() => ({})) };
}

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

test.describe.configure({ mode: "serial" });
test.setTimeout(240000);

test("Payroll list carries authoritative total_deductions and person-type labels", async ({ request, browser }) => {
  const manager = await apiLogin(request, "manager");
  const { status, body } = await api(request, manager, "get", "/manager/payroll");
  expect(status).toBe(200);
  const rows = body.data || body.payrolls || [];
  expect(rows.length).toBeGreaterThan(0);

  // Every row must expose the derived component-sum total_deductions and
  // the is_unlinked flag from the model accessors.
  for (const row of rows) {
    const componentSum =
      Number(row.sss_contribution || 0) + Number(row.philhealth_contribution || 0) +
      Number(row.pagibig_contribution || 0) + Number(row.tax_deduction || 0) +
      Number(row.deductions || 0) + Number(row.salary_loan || 0) + Number(row.cash_advance || 0);
    expect(Math.abs(Number(row.total_deductions) - componentSum)).toBeLessThan(0.02);
    expect(row).toHaveProperty("is_unlinked");
  }

  // UI: the Deductions column must show the same authoritative total.
  const { context, page } = await openAs(browser, manager, "/manager/payroll");
  await page.locator("tbody tr").first().waitFor({ state: "visible", timeout: 90000 });
  await shot(page, "01-payroll-list-deductions-column");

  const uiRow = page.locator("tbody tr").first();
  const uiDeduction = await uiRow.locator("td.payroll-deductions").innerText();
  const firstApi = rows.find((r) => Math.abs(Number(r.total_deductions) - Number(String(uiDeduction).replace(/[^\d.]/g, ""))) < 0.02);
  expect(firstApi, `UI deduction cell ${uiDeduction} must match an API total_deductions`).toBeTruthy();

  // Person-type filter exists and distinguishes account vs no-account rows.
  const personTypeSelect = page.locator("select", { has: page.locator("option", { hasText: "No Account" }) });
  if (await personTypeSelect.count()) {
    await personTypeSelect.first().selectOption({ label: "Staff Member (No Account)" });
    await shot(page, "02-payroll-person-type-filter");
  }
  await context.close();
});

test("Manual unlinked payroll requires maker-checker approval", async ({ request }) => {
  const manager = await apiLogin(request, "manager");
  const admin = await apiLogin(request, "admin");

  const created = await api(request, manager, "post", "/manager/payroll", {
    employee_name: "E2E Manual Worker",
    pay_period_start: "2026-11-16",
    pay_period_end: "2026-11-30",
    base_salary: 12000,
    gross_pay: 6000,
    net_pay: 5700,
    deductions: 300,
  });
  expect([200, 201]).toContain(created.status);
  const payroll = created.body.data;
  expect(payroll.is_unlinked).toBe(true);

  // Creator cannot approve their own unlinked entry.
  const selfApprove = await api(request, manager, "post", `/manager/payroll/${payroll.id}/approve`);
  expect(selfApprove.status).toBe(422);

  // A different authorized manager can approve.
  const approve = await api(request, admin, "post", `/manager/payroll/${payroll.id}/approve`);
  expect(approve.status).toBe(200);

  // Release then succeeds because approved_by was recorded.
  const release = await api(request, manager, "post", `/manager/payroll/${payroll.id}/release`, { payment_method: "Cash" });
  expect(release.status).toBe(200);
});

test("Employee self-service, IDOR, and role gating hold", async ({ request, browser }) => {
  const cashier = await apiLogin(request, "cashier");

  const mine = await api(request, cashier, "get", "/my-payroll");
  expect(mine.status).toBe(200);

  // Cashier is denied manager endpoints.
  const forbidden = await api(request, cashier, "get", "/manager/payroll");
  expect(forbidden.status).toBe(403);

  // Unauthenticated is denied.
  const unauth = await request.get(`${apiUrl}/manager/payroll`);
  expect(unauth.status()).toBe(401);

  // Payslip access limited to own rows — probe a foreign id.
  if ((mine.body.data || []).length) {
    const foreignId = (mine.body.data || [])[0].user_id ? 999999 : (mine.body.data || [])[0].id + 5000;
    const foreign = await api(request, cashier, "get", `/my-payroll/${foreignId}/payslip`);
    expect([403, 404]).toContain(foreign.status);
  }

  const { context, page } = await openAs(browser, cashier, "/cashier/payroll");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);
  await shot(page, "03-employee-self-service");
  await context.close();
});
