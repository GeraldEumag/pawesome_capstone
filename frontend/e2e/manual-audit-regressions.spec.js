// Regressions found by the user-manual audit (docs/user-manual):
// 1. The cashier sidebar "Dashboard" link previously pointed at /cashier,
//    which renders the full-screen POS — not the dashboard. It must land on
//    /cashier/dashboard, i.e. the CashierDashboard overview inside the shell.
// 2. The admin Create User role dropdown offered a "Payroll" option that the
//    backend validation list rejects (Admin\UserController in: rule) and that
//    has no role workspace. It must not be selectable.
const { test, expect } = require("@playwright/test");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

const { apiLogin } = require("./test-utils");

async function openAs(browser, request, role, route) {
  const session = await apiLogin(request, role);
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || user.email);
    localStorage.setItem("email", user.email);
  }, session);
  const page = await context.newPage();
  await page.goto(route);
  return { page, context };
}

test("cashier: sidebar Dashboard opens the dashboard shell, not the POS", async ({
  browser,
  request,
}) => {
  const { page, context } = await openAs(
    browser,
    request,
    "cashier",
    "/cashier/transactions"
  );

  const sidebar = page.locator(".app-sidebar, .cashier-sidebar").first();
  await expect(sidebar).toBeVisible({ timeout: 20000 });

  await sidebar.getByRole("link", { name: "Dashboard" }).click();

  await expect(page).toHaveURL(/\/cashier\/dashboard$/, { timeout: 20000 });
  // The dashboard shell keeps the sidebar; the overview renders Sales Target.
  await expect(sidebar).toBeVisible();
  await expect(
    page.getByText("Sales Target", { exact: false }).first()
  ).toBeVisible({ timeout: 30000 });

  await context.close();
});

test("admin: Create User role list matches backend-supported roles only", async ({
  browser,
  request,
}) => {
  const { page, context } = await openAs(
    browser,
    request,
    "admin",
    "/admin/users/create"
  );

  const roleSelect = page.locator('select[name="role"], select#role').first();
  await expect(roleSelect).toBeVisible({ timeout: 20000 });

  // Payroll is not a valid backend role and must not be offered.
  await expect(roleSelect.locator('option[value="payroll"]')).toHaveCount(0);

  for (const role of [
    "admin",
    "manager",
    "receptionist",
    "super_receptionist",
    "veterinary",
    "cashier",
    "inventory",
    "customer",
  ]) {
    await expect(
      roleSelect.locator(`option[value="${role}"]`)
    ).toHaveCount(1);
  }

  await context.close();
});
