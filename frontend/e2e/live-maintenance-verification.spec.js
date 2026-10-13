const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { apiLogin } = require("./test-utils");

const rootDir = path.resolve(__dirname, "../..");
const evidenceRoot = process.env.E2E_LIVE_MAINTENANCE_EVIDENCE || path.join(rootDir, "browser-evidence", "live-maintenance");
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const runId = Date.now().toString();
const sessions = {};
const run = { startedAt: new Date().toISOString(), completedAt: null, workflows: [], http: [], screenshots: [] };

function saveResults() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  run.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceRoot, "live-maintenance-results.json"), JSON.stringify(run, null, 2));
}

function listFrom(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  if (Array.isArray(value?.data?.data)) return value.data.data;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function tracePage(page) {
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) {
      run.http.push({ source: "browser", method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });
}

async function api(request, session, method, endpoint, data) {
  const url = `${apiUrl}${endpoint}`;
  const options = {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
    timeout: 30000,
  };
  if (data !== undefined) options.data = data;
  const response = await request[method.toLowerCase()](url, options);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  run.http.push({ source: "api-fixture-or-check", method, path: new URL(url).pathname, status: response.status() });
  return { response, body };
}

async function openAs(browser, session, route) {
  const context = await browser.newContext();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("token", token);
    window.localStorage.setItem("role", user.role);
    window.localStorage.setItem("name", user.name || user.email);
    window.localStorage.setItem("username", user.username || user.email);
    window.localStorage.setItem("email", user.email);
  }, { token: session.token, user: session.user });
  const page = await context.newPage();
  tracePage(page);
  await page.goto(`${frontendUrl}${route}`);
  await page.waitForLoadState("domcontentloaded");
  return { context, page };
}

async function capture(page, label) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const file = path.join(evidenceRoot, `${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  run.screenshots.push(path.basename(file));
}

function dateInput(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function dateOnly(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function responseData(body, keys = []) {
  for (const key of keys) {
    if (body?.[key]) return body[key];
  }
  return body?.data || body;
}

test.describe.configure({ mode: "serial" });
test.setTimeout(900000);

test.beforeAll(async ({ request }) => {
  sessions.manager = await apiLogin(request, "manager");
  sessions.admin = await apiLogin(request, "admin");
  sessions.receptionist = await apiLogin(request, "receptionist");
  sessions.inventory = await apiLogin(request, "inventory");
  sessions.customer = await apiLogin(request, "customer");
});

test.afterEach(() => saveResults());
test.afterAll(() => saveResults());

test("live My Leave self-service and Attendance baseline", async ({ browser, request }) => {
  const { context, page } = await openAs(browser, sessions.manager, "/manager/my-leave");
  await expect(page.locator(".ml-title")).toBeVisible();
  await page.getByRole("button", { name: /file leave/i }).click();
  await page.locator(".ml-form select").selectOption("unpaid_leave");
  const dates = page.locator('.ml-form input[placeholder="mm/dd/yyyy"]');
  const leaveDate = dateInput(21);
  await dates.nth(0).fill(leaveDate);
  await dates.nth(0).press("Tab");
  await dates.nth(1).fill(leaveDate);
  await dates.nth(1).press("Tab");
  const leaveReason = `E2E live verification ${runId}`;
  await page.locator(".ml-form textarea").fill(leaveReason);
  const leavePost = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/api/my-leaves") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "Submit Request" }).click();
  const leaveResponse = await leavePost;
  const leaveBody = await leaveResponse.json();
  expect(leaveResponse.status()).toBe(201);
  const leaveId = Number(leaveBody.id || leaveBody.data?.id);
  expect(leaveId).toBeGreaterThan(0);
  await expect(page.getByText(leaveReason)).toBeVisible();

  const ownLeaves = await api(request, sessions.manager, "GET", "/my-leaves");
  const leave = listFrom(ownLeaves.body).find((item) => Number(item.id) === leaveId);
  expect(Number(leave?.user_id)).toBe(Number(sessions.manager.user.id));
  expect(leave?.type).toBe("unpaid_leave");
  await capture(page, "my-leave-submitted");
  run.workflows.push({ name: "My Leave self-service", status: "VERIFIED", httpStatus: leaveResponse.status(), ownerMatchesAuthenticatedUser: true, leaveId });
  await context.close();

  const attendanceView = await openAs(browser, sessions.manager, "/manager/attendance");
  const attendanceResponsePromise = attendanceView.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/api/manager/attendance") && response.request().method() === "GET";
  });
  const attendanceUrl = `${frontendUrl}/manager/attendance`;
  await attendanceView.page.goto(attendanceUrl);
  const attendanceResponse = await attendanceResponsePromise;
  const attendanceBody = await attendanceResponse.json();
  expect(attendanceResponse.status()).toBe(200);
  await expect(attendanceView.page.getByRole("heading", { name: "Attendance Management" })).toBeVisible();
  await expect(attendanceView.page.getByText("No attendance records found")).toBeVisible();

  const observedUrl = new URL(attendanceResponse.url());
  const endpoint = observedUrl.pathname.replace(/^\/api/, "") + observedUrl.search;
  const managerAttendance = await api(request, sessions.manager, "GET", endpoint);
  const adminAttendance = await api(request, sessions.admin, "GET", endpoint);
  const customerAttendance = await api(request, sessions.customer, "GET", endpoint);
  expect(managerAttendance.response.status()).toBe(200);
  expect(adminAttendance.response.status()).toBe(200);
  expect([401, 403]).toContain(customerAttendance.response.status());
  run.workflows.push({
    name: "Attendance live baseline",
    status: "NOT_REPRODUCED",
    route: "/manager/attendance",
    httpStatus: attendanceResponse.status(),
    resultCount: listFrom(attendanceBody, ["attendance", "records"]).length,
    managerStatus: managerAttendance.response.status(),
    adminStatus: adminAttendance.response.status(),
    customerStatus: customerAttendance.response.status(),
    note: "No original failure action or error details were available; live manager page returned the empty state without an observed UI error.",
  });
  await capture(attendanceView.page, "attendance-empty-manager");
  await attendanceView.context.close();
});

test("live service, hotel-room, and holiday deletion audits", async ({ browser, request }) => {
  const stamp = runId;
  const serviceName = `E2E Live Service ${stamp}`;
  const roomName = `E2E Live Hotel Room ${stamp}`;
  const roomNumber = `E2E${stamp.slice(-9)}`;

  const serviceCreated = await api(request, sessions.receptionist, "POST", "/receptionist/services", {
    name: serviceName,
    category: "Grooming",
    price: 25,
    duration_minutes: 30,
    is_active: true,
  });
  expect(serviceCreated.response.status()).toBe(201);
  const service = responseData(serviceCreated.body, ["data", "service"]);
  expect(service.id).toBeTruthy();

  const roomCreated = await api(request, sessions.receptionist, "POST", "/receptionist/hotel-rooms", {
    room_number: roomNumber,
    name: roomName,
    type: "standard",
    size: "medium",
    capacity: 1,
    daily_rate: 100,
  });
  expect(roomCreated.response.status()).toBe(201);
  const room = responseData(roomCreated.body, ["room"]);
  expect(room.id).toBeTruthy();

  const holidayYear = new Date().getFullYear();
  const holidayList = await api(request, sessions.manager, "GET", `/manager/holidays?year=${holidayYear}`);
  expect(holidayList.response.status()).toBe(200);
  const existingDates = new Set(listFrom(holidayList.body).map((holiday) => String(holiday.date).slice(0, 10)));
  let holidayDate = null;
  for (let offset = 21; offset < 320; offset += 1) {
    const candidate = dateOnly(offset);
    if (Number(candidate.slice(0, 4)) === holidayYear && !existingDates.has(candidate)) {
      holidayDate = candidate;
      break;
    }
  }
  expect(holidayDate).toBeTruthy();
  const holidayName = `E2E Live Archive Holiday ${stamp}`;
  const holidayCreated = await api(request, sessions.manager, "POST", "/manager/holidays", {
    date: holidayDate,
    name: holidayName,
    type: "special_non_working",
    is_recurring: false,
  });
  expect(holidayCreated.response.status()).toBe(201);
  const holiday = responseData(holidayCreated.body, ["data", "holiday"]);
  expect(holiday.id).toBeTruthy();

  const receptionistView = await openAs(browser, sessions.receptionist, "/receptionist/manage-services");
  await expect(receptionistView.page.getByRole("button", { name: `Actions for ${serviceName}` })).toBeVisible({ timeout: 20000 });
  await receptionistView.page.getByRole("button", { name: `Actions for ${serviceName}` }).click();
  await receptionistView.page.locator(".row-action-popover-panel").getByRole("button", { name: "Delete", exact: true }).click();
  await receptionistView.page.locator("#swal-reason-select").selectOption("Service permanently discontinued");
  const serviceDeletePromise = receptionistView.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(`/api/receptionist/services/${service.id}`) && response.request().method() === "DELETE";
  });
  await receptionistView.page.getByRole("button", { name: "Delete Service", exact: true }).last().click();
  const serviceDelete = await serviceDeletePromise;
  const serviceDeletePayload = serviceDelete.request().postDataJSON();
  expect(serviceDelete.status()).toBe(200);
  expect(serviceDeletePayload.reason).toBe("Service permanently discontinued");
  await expect(receptionistView.page.getByRole("button", { name: `Actions for ${serviceName}` })).toHaveCount(0);
  await capture(receptionistView.page, "service-deleted-with-reason");

  await receptionistView.page.getByRole("button", { name: "Hotel Rooms" }).click();
  const roomCard = receptionistView.page.locator(".room-card").filter({ hasText: roomName });
  await expect(roomCard).toBeVisible({ timeout: 20000 });
  await roomCard.locator(".delete-btn").click();
  const roomReason = `E2E live verification archive ${stamp}`;
  await receptionistView.page.locator("#swal-reason-other").fill(roomReason);
  const roomDeletePromise = receptionistView.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(`/api/receptionist/hotel-rooms/${room.id}`) && response.request().method() === "DELETE";
  });
  await receptionistView.page.getByRole("button", { name: "Delete Room", exact: true }).last().click();
  const roomDelete = await roomDeletePromise;
  const roomDeletePayload = roomDelete.request().postDataJSON();
  expect(roomDelete.status()).toBe(200);
  expect(roomDeletePayload.reason).toBe(roomReason);
  await expect(roomCard).toHaveCount(0);
  await capture(receptionistView.page, "hotel-room-deleted-with-reason");
  await receptionistView.context.close();

  const managerView = await openAs(browser, sessions.manager, "/manager/holidays");
  await managerView.page.locator(".hm-year-select").selectOption(String(holidayYear));
  await managerView.page.getByRole("button", { name: `Actions for ${holidayName}` }).click();
  await managerView.page.getByRole("button", { name: "Archive", exact: true }).first().click();
  const holidayReason = `E2E live verification archive ${stamp}`;
  await managerView.page.locator("#swal-reason-other").fill(holidayReason);
  const holidayDeletePromise = managerView.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(`/api/manager/holidays/${holiday.id}`) && response.request().method() === "DELETE";
  });
  await managerView.page.getByRole("button", { name: "Archive", exact: true }).last().click();
  const holidayDelete = await holidayDeletePromise;
  const holidayDeletePayload = holidayDelete.request().postDataJSON();
  expect(holidayDelete.status()).toBe(200);
  expect(holidayDeletePayload.reason).toBe(holidayReason);
  await expect(managerView.page.getByText(holidayName)).toHaveCount(0);
  const activeHolidays = await api(request, sessions.manager, "GET", `/manager/holidays?year=${holidayYear}`);
  expect(listFrom(activeHolidays.body).some((entry) => Number(entry.id) === Number(holiday.id))).toBe(false);
  await capture(managerView.page, "holiday-archived-with-reason");
  await managerView.context.close();

  run.workflows.push({
    name: "Reasoned service, hotel-room, and holiday deletion",
    status: "VERIFIED",
    serviceId: service.id,
    serviceDeleteStatus: serviceDelete.status(),
    serviceReasonPresent: Boolean(serviceDeletePayload.reason),
    hotelRoomId: room.id,
    hotelRoomDeleteStatus: roomDelete.status(),
    hotelRoomReasonPresent: Boolean(roomDeletePayload.reason),
    holidayId: holiday.id,
    holidayDeleteStatus: holidayDelete.status(),
    holidayReasonPresent: Boolean(holidayDeletePayload.reason),
    holidayActiveAfterArchive: false,
  });
});

test("live Suppliers CRUD and responsive layout", async ({ browser, request }) => {
  const before = await api(request, sessions.inventory, "GET", "/inventory/suppliers");
  expect(before.response.status()).toBe(200);
  const beforeSuppliers = listFrom(before.body, ["suppliers"]);
  const { context, page } = await openAs(browser, sessions.inventory, "/inventory/suppliers");
  await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
  const emptyStateShown = beforeSuppliers.length === 0;
  if (emptyStateShown) await expect(page.getByText("No suppliers found.")).toBeVisible();

  const supplierName = `E2E Live Supplier ${runId} Pet Nutrition and Clinic Supply Partners`;
  const initialNotes = `Live responsive fixture ${runId}`;
  await page.getByRole("button", { name: "New Supplier" }).click();
  const modal = page.locator(".sup-modal");
  await modal.locator('input[name="name"]').fill(supplierName);
  await modal.locator('input[name="contact_person"]').fill("Long Contact Person for Responsive Layout Verification");
  await modal.locator('input[name="phone"]').fill("09171112222");
  await modal.locator('input[name="email"]').fill(`e2e-supplier-${runId}@example.test`);
  await modal.locator('textarea[name="address"]').fill("Unit 12, Example Commercial Center, Long Street, Metro Manila, Philippines. ".repeat(2));
  await modal.locator('textarea[name="notes"]').fill(initialNotes);
  const supplierCreatePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/api/inventory/suppliers") && response.request().method() === "POST";
  });
  await modal.getByRole("button", { name: "Create Supplier" }).click();
  const supplierCreate = await supplierCreatePromise;
  const supplierCreateBody = await supplierCreate.json();
  expect(supplierCreate.status()).toBe(201);
  const supplier = responseData(supplierCreateBody, ["supplier"]);
  expect(supplier.id).toBeTruthy();
  const createAlert = page.locator(".swal2-confirm");
  if (await createAlert.isVisible()) await createAlert.click();
  const supplierRow = page.locator(".suppliers-table-card tr").filter({ hasText: supplierName }).first();
  await expect(supplierRow).toBeVisible({ timeout: 20000 });

  const search = page.locator(".suppliers-search input");
  await search.fill(`No matching supplier ${runId}`);
  await expect(page.getByText("No suppliers found.")).toBeVisible();
  await search.fill(supplierName.slice(0, 20));
  await expect(supplierRow).toBeVisible();
  await search.fill("");

  const viewportResults = [];
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 850 });
    const layout = await page.evaluate(() => {
      const root = document.querySelector(".suppliers-page");
      const toolbar = document.querySelector(".suppliers-toolbar");
      const searchBox = document.querySelector(".suppliers-search");
      const toggle = document.querySelector(".suppliers-toggle");
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      return {
        pageWidth: root.clientWidth,
        pageScrollWidth: root.scrollWidth,
        search: bounds(searchBox),
        toggle: bounds(toggle),
        toolbar: bounds(toolbar),
      };
    });
    expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageWidth + 1);
    const separateRows = layout.search.bottom <= layout.toggle.top || layout.toggle.bottom <= layout.search.top;
    const horizontalGap = layout.search.right <= layout.toggle.left || layout.toggle.right <= layout.search.left;
    expect(separateRows || horizontalGap, `search and filter overlap at ${width}px`).toBeTruthy();

    const tableCard = page.locator(".suppliers-table-card");
    await tableCard.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    const trigger = supplierRow.locator(".row-action-popover-trigger").first();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const actionPanel = page.locator(".row-action-popover-panel").last();
    await expect(actionPanel).toBeVisible();
    const actionBounds = await actionPanel.boundingBox();
    expect(actionBounds).not.toBeNull();
    expect(actionBounds.x).toBeGreaterThanOrEqual(0);
    expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "New Supplier" }).click();
    const modalBounds = await page.locator(".sup-modal").boundingBox();
    expect(modalBounds).not.toBeNull();
    expect(modalBounds.x).toBeGreaterThanOrEqual(0);
    expect(modalBounds.x + modalBounds.width).toBeLessThanOrEqual(width + 1);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    viewportResults.push({ width, noPageOverflow: true, controlsSeparated: true, actionMenuBounded: true, modalBounded: true });
    if (width === 360) await capture(page, "suppliers-mobile-populated");
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const tableCard = page.locator(".suppliers-table-card");
  await tableCard.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  const trigger = supplierRow.locator(".row-action-popover-trigger").first();
  await trigger.click();
  await page.locator(".row-action-popover-panel").last().getByRole("button", { name: "Edit" }).click();
  const updatedNotes = `Edited through live UI ${runId}`;
  await page.locator('.sup-modal textarea[name="notes"]').fill(updatedNotes);
  const supplierUpdatePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(`/api/inventory/suppliers/${supplier.id}`) && response.request().method() === "PUT";
  });
  await page.locator(".sup-modal").getByRole("button", { name: "Update Supplier" }).click();
  const supplierUpdate = await supplierUpdatePromise;
  expect(supplierUpdate.status()).toBe(200);
  const updateAlert = page.locator(".swal2-confirm");
  if (await updateAlert.isVisible()) await updateAlert.click();
  await expect(page.getByText(updatedNotes)).toBeVisible();
  await capture(page, "suppliers-desktop-updated");
  run.workflows.push({
    name: "Live Supplier CRUD and responsive layout",
    status: "VERIFIED",
    supplierId: supplier.id,
    createStatus: supplierCreate.status(),
    updateStatus: supplierUpdate.status(),
    emptyStateShown,
    emptySearchStateShown: true,
    viewportResults,
  });
  await context.close();
});
