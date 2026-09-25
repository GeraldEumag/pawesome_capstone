// Customer chatbot "My Requests" quick action must open the My Requests tab
// (not the Book / New Request tab), from any customer page.
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "customer-my-requests-link");
const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;

const { apiLogin } = require("./test-utils");

async function customerSession(request) {
  return apiLogin(request, "customer");
}

// The My Requests table must contain at least one row — create a real request
// instead of depending on ambient seed data.
async function ensureCustomerRequest(request, session) {
  const authH = { Accept: "application/json", Authorization: `Bearer ${session.token}` };
  const petRes = await request.post(`${apiUrl}/pets`, {
    headers: authH,
    data: { name: `E2E Requests Pet ${Date.now()}`, species: "Dog" },
  });
  expect(petRes.ok(), "create pet").toBeTruthy();
  const petBody = await petRes.json();
  const pet = petBody.pet || petBody;

  const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const reqRes = await request.post(`${apiUrl}/customer/requests`, {
    headers: authH,
    data: {
      customer_name: session.user.name, customer_email: session.user.email,
      pet_id: pet.id, pet_name: pet.name, request_type: "grooming", service_type: "grooming",
      service_name: "Standard Grooming", request_date: date, request_time: "10:00",
      requested_date: date, requested_time: "10:00", notes: "E2E my-requests",
    },
  });
  expect(reqRes.ok(), "create service request").toBeTruthy();
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
  // Quick actions render only after the chatbot welcome bootstrap resolves —
  // under parallel load that fetch can take a while.
  const action = page.locator(".rbac-quick-action", { hasText: "My Requests" });
  await expect(action).toBeVisible({ timeout: 45000 });
  await action.click();
}

async function expectMyRequestsTab(page) {
  await expect(page.locator(".cs-tab.active")).toHaveText(/My Requests/);
  await expect(page.locator(".cs-panel-header h4")).toHaveText("My Requests");
  // The customer's submitted requests (with live status) load, not just an empty shell.
  await expect(page.locator(".customer-status-table tbody tr").first()).toBeVisible({ timeout: 30000 });
}

for (const [label, startRoute] of [["dashboard", "/customer"], ["services-book-tab", "/customer/services"]]) {
  test(`chatbot My Requests opens My Requests tab from ${label}`, async ({ browser, request }) => {
    test.setTimeout(90000); // provisioning + page load + chatbot bootstrap
    fs.mkdirSync(evidenceDir, { recursive: true });
    const session = await customerSession(request);
    await ensureCustomerRequest(request, session);
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
