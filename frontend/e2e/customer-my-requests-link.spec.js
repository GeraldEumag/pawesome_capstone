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
  let petRes;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    petRes = await request.post(`${apiUrl}/pets`, {
      headers: authH,
      data: { name: `E2E Requests Pet ${Date.now()}`, species: "Dog" },
    });
    if (petRes.status() !== 429) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  expect(petRes.ok(), `create pet: ${petRes.status()} ${await petRes.text()}`).toBeTruthy();
  const petBody = await petRes.json();
  const pet = petBody.pet || petBody;

  // The dev DB accumulates bookings across runs, so probe upcoming slots until one is free.
  let reqRes;
  let lastBody = "";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const day = 5 + Math.floor(attempt / 2);
    const hour = 10 + (attempt % 2) * 4;
    const date = new Date(Date.now() + day * 86400000).toISOString().slice(0, 10);
    const slot = `${String(hour).padStart(2, "0")}:00`;
    reqRes = await request.post(`${apiUrl}/customer/requests`, {
      headers: authH,
      data: {
        customer_name: session.user.name, customer_email: session.user.email,
        pet_id: pet.id, pet_name: pet.name, request_type: "grooming", service_type: "grooming",
        service_name: "Standard Grooming", request_date: date, request_time: slot,
        requested_date: date, requested_time: slot, notes: "E2E my-requests",
      },
    });
    if (reqRes.ok()) break;
    lastBody = await reqRes.text();
    if (reqRes.status() === 429) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    if (!/overlaps|no longer available|conflict|public holiday|store is closed/i.test(lastBody)) break;
  }
  expect(reqRes.ok(), `create service request: ${lastBody}`).toBeTruthy();
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
  await expect(page.locator(".cbb-board")).toBeVisible();
  // The customer's submitted requests (with live status) load, not just an empty shell.
  await expect(page.locator(".cbb-row").first()).toBeVisible({ timeout: 30000 });
}

for (const [label, startRoute] of [["dashboard", "/customer"], ["services-book-tab", "/customer/services"]]) {
  test(`chatbot My Requests opens My Requests tab from ${label}`, async ({ browser, request }) => {
    test.setTimeout(90000); // provisioning + page load + chatbot bootstrap
    fs.mkdirSync(evidenceDir, { recursive: true });
    const session = await customerSession(request);
    await ensureCustomerRequest(request, session);
    const { page, context } = await openAs(browser, session, startRoute);
    if (startRoute === "/customer/services") {
      await expect(page.locator(".cs-panel-header h4")).toHaveText("Book a Service");
    }

    await clickChatbotMyRequests(page);

    await expect(page).toHaveURL(/\/customer\/bookings$/);
    // The board defaults to a near-term date range; reload unfiltered so the
    // fixture request (days out) is definitely listed.
    await page.goto("/customer/bookings?range=all");
    await expectMyRequestsTab(page);
    await page.screenshot({ path: path.join(evidenceDir, `my-requests-from-${label}.png`) });
    await context.close();
  });
}
