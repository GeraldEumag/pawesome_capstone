// Cashier deep link: customer submits payment proof -> cashier notification ->
// clicking it lands on POS with the Payment Approvals tab open (not the Products tab).
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "cashier-deep-link");
const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;
const PNG = fs.readFileSync(path.join(__dirname, "..", "src", "assets", "PAWESOME TEST GCASH.png"));

const accounts = {
  customer: { email: "customer@example.com", password: "Password123!" },
  receptionist: { email: "receptionist@example.com", password: "Password123!" },
  cashier: { email: "cashier@example.com", password: "password123" },
};

async function login(request, role) {
  const { email, password } = accounts[role];
  const res = await request.post(`${apiUrl}/auth/login`, {
    headers: { Accept: "application/json" },
    data: { login: email, email, password },
  });
  expect(res.ok(), `login ${role}`).toBeTruthy();
  const body = await res.json();
  return { token: body.token || body.access_token, user: body.user };
}

async function api(request, session, method, endpoint, options = {}) {
  const res = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  expect(res.ok(), `${method.toUpperCase()} ${endpoint}: ${res.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return body;
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

const approvalsTab = (page) => page.locator(".pos-cat-tab--approvals");

test("cashier payment notification opens Payment Approvals", async ({ browser, request }) => {
  test.setTimeout(150000);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const customer = await login(request, "customer");
  const receptionist = await login(request, "receptionist");
  const cashier = await login(request, "cashier");
  const uniquePrice = 400 + (Date.now() % 500);

  // Customer -> Receptionist -> Customer uploads proof (creates the cashier notification).
  const pet = (await api(request, customer, "post", "/pets", { data: { name: `DEEPLINK_TEST Pet ${Date.now()}`, species: "Dog" } })).pet;
  const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const requestId = (await api(request, customer, "post", "/customer/requests", {
    data: {
      customer_name: customer.user.name, customer_email: customer.user.email, pet_id: pet.id, pet_name: pet.name,
      request_type: "grooming", service_type: "grooming", service_name: "Standard Grooming",
      request_date: date, request_time: "10:00", requested_date: date, requested_time: "10:00",
      price: uniquePrice, notes: "DEEPLINK_TEST",
    },
  })).request.id;
  await api(request, receptionist, "post", `/receptionist/requests/${requestId}/approve`, { data: { receptionist_remarks: "DEEPLINK_TEST" } });
  await api(request, customer, "post", `/customer/requests/${requestId}/payment-proof`, {
    multipart: {
      payment_method: "GCash", payment_reference: `DEEPLINK-${requestId}`,
      payment_proof: { name: "proof.png", mimeType: "image/png", buffer: PNG },
    },
  });

  // Cashier clicks the notification from a sidebar page.
  const { page, context } = await openAs(browser, cashier, "/cashier/transactions");
  await page.locator(".pawesome-notification-btn").click();
  const item = page.locator(".pawesome-notification-item", { hasText: `service request #${requestId}` }).first();
  await expect(item).toBeVisible({ timeout: 20000 });
  await item.click();

  await expect(page).toHaveURL(/\/cashier\/payment-verification$/);
  await expect(approvalsTab(page)).toHaveClass(/active/);
  const card = page.locator(".pa-card", { hasText: `₱${uniquePrice.toLocaleString("en-PH")}` }).filter({ hasText: "Standard Grooming" });
  await expect(card.first()).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: path.join(evidenceDir, "1-notification-lands-on-approvals.png") });

  // Direct visit also opens Approvals; plain /cashier/pos still defaults to Products.
  await page.goto("/cashier/pos");
  await expect(approvalsTab(page)).not.toHaveClass(/active/);
  await page.goto("/cashier/payment-verification");
  await expect(approvalsTab(page)).toHaveClass(/active/);
  await context.close();

  fs.writeFileSync(path.join(evidenceDir, "result.json"), JSON.stringify({
    date: new Date().toISOString(), requestId, landedOn: "/cashier/payment-verification", approvalsTabActive: true,
  }, null, 2));
});
