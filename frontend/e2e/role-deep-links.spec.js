// Notification / chatbot / profile deep links must land on a real, rendered page
// (not a blank unmatched route) for the veterinary, admin and inventory roles.
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "role-deep-links");
const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;

const accounts = {
  veterinary: { email: "vet@example.com", password: "Password123!" },
  admin: { email: "admin@example.com", password: "Password123!" },
  inventory: { email: "inventory@example.com", password: "Password123!" },
  receptionist: { email: "receptionist@example.com", password: "Password123!" },
  customer: { email: "customer@example.com", password: "Password123!" },
};

async function apiLogin(request, role) {
  const { email, password } = accounts[role];
  const res = await request.post(`${apiUrl}/auth/login`, {
    headers: { Accept: "application/json" },
    data: { login: email, email, password },
  });
  expect(res.ok(), `login ${role}`).toBeTruthy();
  const body = await res.json();
  return body.token || body.access_token;
}

async function openAs(browser, request, role, route) {
  const { email, password } = accounts[role];
  const res = await request.post(`${apiUrl}/auth/login`, {
    headers: { Accept: "application/json" },
    data: { login: email, email, password },
  });
  expect(res.ok(), `login ${role}`).toBeTruthy();
  const body = await res.json();
  const session = { token: body.token || body.access_token, user: body.user };
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

// A matched page renders the role layout with non-empty content.
// Nested layouts produce two .dashboard-content sections; the inner one holds the page body.
async function expectRenderedPage(page, urlPattern) {
  await expect(page).toHaveURL(urlPattern);
  const content = page.locator(".dashboard-content").last();
  await expect(content).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await content.innerText()).trim().length, { timeout: 20000 }).toBeGreaterThan(20);
}

test.beforeAll(() => fs.mkdirSync(evidenceDir, { recursive: true }));

test("vet: appointment notification opens Veterinary Appointments", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "veterinary", "/veterinary/history");
  await page.locator(".pawesome-notification-btn").click();
  const item = page.locator(".pawesome-notification-item", { hasText: /Appointment/ }).first();
  await expect(item).toBeVisible({ timeout: 20000 });
  await item.click();
  await expectRenderedPage(page, /\/veterinary\/appointments$/);
  await page.screenshot({ path: path.join(evidenceDir, "vet-notification-appointments.png") });
  await context.close();
});

test("vet: topbar profile opens Veterinary profile", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "veterinary", "/veterinary/appointments");
  await page.locator(".dashboard-profile-btn").first().click();
  await expectRenderedPage(page, /\/veterinary\/profile$/);
  await context.close();
});

test("vet: chatbot Pet Records opens customer/pet profiles", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "veterinary", "/veterinary/appointments");
  await page.locator(".rbac-chatbot-toggle").click();
  await page.locator(".rbac-quick-action", { hasText: "Pet Records" }).click();
  await expectRenderedPage(page, /\/veterinary\/customer-profiles$/);
  await context.close();
});

test("inventory: chatbot Stock Logs opens stock movement history", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "inventory", "/inventory/stock");
  await page.locator(".rbac-chatbot-toggle").click();
  await page.locator(".rbac-quick-action", { hasText: "Stock Logs" }).click();
  await expectRenderedPage(page, /\/inventory\/history$/);
  await page.screenshot({ path: path.join(evidenceDir, "inventory-chatbot-stock-logs.png") });
  await context.close();
});

test("receptionist: Customer Orders page lists a real pending order", async ({ browser, request }) => {
  const customerToken = await apiLogin(request, "customer");

  // Find a sellable item with stock, then place a real order through the API.
  const itemsRes = await request.get(`${apiUrl}/inventory/sellable`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${customerToken}` },
  });
  expect(itemsRes.ok(), "sellable items").toBeTruthy();
  const itemsBody = await itemsRes.json();
  const items = itemsBody.products || itemsBody.items || itemsBody.data || itemsBody;
  const item = (Array.isArray(items) ? items : []).find((i) => (i.stock ?? 0) > 0);
  expect(item, "a sellable item in stock").toBeTruthy();

  const orderRes = await request.post(`${apiUrl}/customer/store/checkout`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${customerToken}` },
    data: {
      items: [{ product_id: item.id, name: item.name, quantity: 1, price: item.price }],
      payment_method: "Online Payment",
      order_type: "Pick-up",
      total_amount: item.price,
    },
  });
  expect(orderRes.ok(), "customer checkout").toBeTruthy();
  const orderBody = await orderRes.json();
  // The list displays the order reference number (e.g. #C0EBC392438B).
  const orderRef =
    orderBody.reference_number ||
    orderBody.order?.reference_number ||
    orderBody.order_number ||
    orderBody.order_id;
  expect(orderRef, "order reference").toBeTruthy();

  // Receptionist reaches the page through the sidebar link, not a typed URL.
  const { page, context } = await openAs(browser, request, "receptionist", "/receptionist/bookings/hotel");
  await page.locator(".sidebar-nav").getByText("Customer Orders").click();
  await expectRenderedPage(page, /\/receptionist\/orders$/);
  await expect(page.locator(".dashboard-content").last()).toContainText(String(orderRef), { timeout: 20000 });
  await page.screenshot({ path: path.join(evidenceDir, "receptionist-customer-orders.png") });
  await context.close();
});
