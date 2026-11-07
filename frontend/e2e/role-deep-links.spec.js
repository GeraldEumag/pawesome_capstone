// Notification / chatbot / profile deep links must land on a real, rendered page
// (not a blank unmatched route) for the veterinary, admin and inventory roles.
const { test, expect } = require("@playwright/test");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "role-deep-links");
const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;

const { apiLogin: sharedApiLogin } = require("./test-utils");

async function apiLogin(request, role) {
  const session = await sharedApiLogin(request, role);
  return session.token;
}

async function openAs(browser, request, role, route) {
  const session = await sharedApiLogin(request, role);
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
  test.setTimeout(90000); // API provisioning (3 logins + pet + request + approve) + UI navigation
  // Self-provision: customer vet request -> receptionist approves with a vet
  // assigned -> Appointment::created notifies the veterinarian. Without this,
  // the test depends on ambient seed data that may not exist.
  const customer = await sharedApiLogin(request, "customer");
  const receptionist = await sharedApiLogin(request, "receptionist");
  const vet = await sharedApiLogin(request, "veterinary");
  const authH = (t) => ({ Accept: "application/json", Authorization: `Bearer ${t}` });

  const petRes = await request.post(`${apiUrl}/pets`, {
    headers: authH(customer.token),
    data: { name: `E2E Notify Pet ${Date.now()}`, species: "Dog" },
  });
  expect(petRes.ok(), "create pet").toBeTruthy();
  const petBody = await petRes.json();
  const pet = petBody.pet || petBody;

  // The dev DB accumulates bookings across runs — probe open slots.
  let reqRes;
  let lastBody = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const date = new Date(Date.now() + (10 + Math.floor(attempt / 8)) * 86400000).toISOString().slice(0, 10);
    const slot = `${String(10 + (attempt % 8)).padStart(2, "0")}:00`;
    reqRes = await request.post(`${apiUrl}/customer/requests`, {
      headers: authH(customer.token),
      data: {
        customer_name: customer.user.name, customer_email: customer.user.email,
        pet_id: pet.id, pet_name: pet.name, request_type: "vet", service_type: "vet",
        service_name: "Consultation", request_date: date, request_time: slot,
        requested_date: date, requested_time: slot, notes: "E2E vet notification deep link",
      },
    });
    if (reqRes.ok()) break;
    lastBody = await reqRes.text();
    if (reqRes.status() === 429) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    if (!lastBody.includes("overlaps") && !lastBody.includes("no longer available") && !lastBody.includes("conflict")) break;
  }
  expect(reqRes.ok(), `create vet request: ${lastBody}`).toBeTruthy();
  const requestId = (await reqRes.json()).request.id;

  const approveRes = await request.post(`${apiUrl}/receptionist/requests/${requestId}/approve`, {
    headers: authH(receptionist.token),
    data: { veterinarian_id: vet.user.id, receptionist_remarks: "E2E" },
  });
  expect(approveRes.ok(), "receptionist approve assigns vet").toBeTruthy();

  const { page, context } = await openAs(browser, request, "veterinary", "/veterinary/history");
  await page.locator(".pawesome-notification-btn").click();
  const item = page.locator(".pawesome-notification-item", { hasText: /Appointment/ }).first();
  await expect(item).toBeVisible({ timeout: 45000 });
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
  const petRecords = page.locator(".rbac-quick-action", { hasText: "Pet Records" });
  await petRecords.waitFor({ state: "visible", timeout: 45000 });
  await petRecords.click();
  await expectRenderedPage(page, /\/veterinary\/customer-profiles$/);
  await context.close();
});

test("inventory: chatbot Stock Logs opens stock movement history", async ({ browser, request }) => {
  const { page, context } = await openAs(browser, request, "inventory", "/inventory/stock");
  await page.locator(".rbac-chatbot-toggle").click();
  const stockLogs = page.locator(".rbac-quick-action", { hasText: "Stock Logs" });
  await stockLogs.waitFor({ state: "visible", timeout: 45000 });
  await stockLogs.click();
  await expectRenderedPage(page, /\/inventory\/history$/);
  await page.screenshot({ path: path.join(evidenceDir, "inventory-chatbot-stock-logs.png") });
  await context.close();
});

test("receptionist: retired /receptionist/orders redirects to hotel bookings", async ({ browser, request }) => {
  // The customer store-order workflow was retired — the orders page now
  // redirects to the hotel bookings board and the sidebar no longer links it.
  const { page, context } = await openAs(browser, request, "receptionist", "/receptionist/orders");
  await expectRenderedPage(page, /\/receptionist\/bookings\/hotel$/);
  await expect(page.locator(".sidebar-nav").getByText("Customer Orders")).toHaveCount(0);
  await context.close();
});
