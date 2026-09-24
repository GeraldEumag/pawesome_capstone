// Customer chatbot "My Requests" quick action must open the My Requests tab
// (not the Book / New Request tab), from any customer page.
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "customer-my-requests-link");
const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;

async function customerSession(request) {
  const email = "customer@example.com";
  const res = await request.post(`${apiUrl}/auth/login`, {
    headers: { Accept: "application/json" },
    data: { login: email, email, password: "Password123!" },
  });
  expect(res.ok(), "customer login").toBeTruthy();
  const body = await res.json();
  return { token: body.token || body.access_token, user: body.user };
}

async function openAs(browser, session, route) {
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

async function clickChatbotMyRequests(page) {
  await page.locator(".rbac-chatbot-toggle").click();
  const action = page.locator(".rbac-quick-action", { hasText: "My Requests" });
  await expect(action).toBeVisible({ timeout: 20000 });
  await action.click();
}

async function expectMyRequestsTab(page) {
  await expect(page.locator(".cs-tab.active")).toHaveText(/My Requests/);
  await expect(page.locator(".cs-panel-header h4")).toHaveText("My Requests");
  // The customer's submitted requests (with live status) load, not just an empty shell.
  await expect(page.locator(".customer-status-table tbody tr").first()).toBeVisible({ timeout: 20000 });
}

for (const [label, startRoute] of [["dashboard", "/customer"], ["services-book-tab", "/customer/services"]]) {
  test(`chatbot My Requests opens My Requests tab from ${label}`, async ({ browser, request }) => {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const session = await customerSession(request);
    const { page, context } = await openAs(browser, session, startRoute);
    if (startRoute === "/customer/services") {
      await expect(page.locator(".cs-tab.active")).toHaveText(/New Request/);
    }

    await clickChatbotMyRequests(page);

    await expect(page).toHaveURL(/\/customer\/bookings$/);
    await expectMyRequestsTab(page);
    await page.screenshot({ path: path.join(evidenceDir, `my-requests-from-${label}.png`) });
    await context.close();
  });
}
