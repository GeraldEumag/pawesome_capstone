const { chromium } = require("./frontend/node_modules/playwright");

const APP_URL = "http://localhost:3000";
const API_URL = "http://127.0.0.1:8000/api";

const credentials = {
  admin: { login: "admin@test.com", password: "password123" },
  customer: { login: "customer@test.com", password: "password123" },
  receptionist: { login: "receptionist@test.com", password: "password123" },
};

const reportSections = [
  { label: "Executive Summary", endpoint: "/admin/reports/overview" },
  { label: "Sales / Orders", endpoint: "/admin/reports/orders" },
  { label: "Payments", endpoint: "/admin/reports/payments" },
  { label: "Services / Bookings", endpoint: "/admin/reports/services" },
  { label: "Inventory", endpoint: "/admin/reports/inventory" },
  { label: "Customers", endpoint: "/admin/reports/customers" },
  { label: "Veterinary", endpoint: "/admin/reports/veterinary" },
  { label: "Cashier / POS", endpoint: "/admin/reports/cashier" },
  { label: "Staff / Payroll", endpoint: "/admin/reports/payroll" },
  { label: "System Health / Audit Logs", endpoint: "/admin/reports/system-health" },
];

async function login(role) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(credentials[role]).toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${role} login failed ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function apiGet(token, endpoint) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { parse_error: text.slice(0, 300) };
  }
  return { endpoint, status: response.status, ok: response.ok, json };
}

async function seedBrowser(page, auth) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || "");
    localStorage.setItem("username", user.username || user.email || "");
    localStorage.setItem("email", user.email || "");
  }, { token: auth.token, user: auth.user });
}

function summarizePayload(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const table =
    Array.isArray(payload?.table) ? payload.table :
    Array.isArray(data?.table) ? data.table :
    Array.isArray(payload?.data) ? payload.data :
    [];
  return {
    success: payload?.success !== false,
    hasSummary: Boolean(payload?.summary || data?.summary),
    topKeys: Object.keys(payload || {}).slice(0, 12),
    tableRows: table.length,
  };
}

async function main() {
  const results = {
    accounts: {},
    adminApi: [],
    adminBrowser: {},
    customerApi: {},
    customerBrowser: {},
    bookingCreation: {},
    receptionistApi: {},
    receptionistBrowser: {},
    consoleErrors: [],
    failedResponses: [],
  };

  const admin = await login("admin");
  const customer = await login("customer");
  const receptionist = await login("receptionist");
  results.accounts = {
    admin: admin.user?.email,
    customer: customer.user?.email,
    receptionist: receptionist.user?.email,
  };

  for (const section of reportSections) {
    const result = await apiGet(admin.token, section.endpoint);
    results.adminApi.push({
      label: section.label,
      endpoint: section.endpoint,
      status: result.status,
      ok: result.ok,
      summary: summarizePayload(result.json),
      error: result.ok ? null : result.json,
    });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      results.consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/") && response.status() >= 400) {
      results.failedResponses.push({ status: response.status(), url });
    }
  });

  await seedBrowser(page, admin);
  await page.goto(`${APP_URL}/admin/reports`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByText("Reports Center", { exact: false }).waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const adminText = await page.locator("body").innerText({ timeout: 15000 });
  results.adminBrowser.initial = {
    url: page.url(),
    hasReportsCenter: adminText.includes("Reports Center"),
    hasExecutiveSummary: adminText.includes("Executive Summary"),
    overviewMentions: (adminText.match(/\bOverview\b/g) || []).length,
    hasCompletionPercent: /0%\s*completion/i.test(adminText),
    hasActiveUsersPercent: /0%\s*active users/i.test(adminText),
    hasLastUpdated: adminText.includes("Last updated:"),
    reportsSubmenuMentions: (adminText.match(/\bCashier\b|\bLogistics\b/g) || []).length,
  };

  for (const section of reportSections) {
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes(section.endpoint) && response.request().method() === "GET",
      { timeout: 15000 }
    ).catch((error) => ({ error: error.message }));
    await page.getByRole("button", { name: new RegExp(section.label.replace(/[\/]/g, "\\/"), "i") }).click({ timeout: 15000 }).catch(async () => {
      await page.getByText(section.label, { exact: false }).click({ timeout: 15000 });
    });
    const response = await responsePromise;
    await page.waitForTimeout(500);
    const body = await page.locator("body").innerText();
    results.adminBrowser[section.label] = {
      requestStatus: response?.status ? response.status() : null,
      requestError: response?.error || null,
      visible: body.includes(section.label),
      noMapError: !body.includes("map is not a function"),
      noUndefinedCrash: !body.includes("Cannot read properties of undefined"),
    };
  }

  const refreshResponse = page.waitForResponse((response) => response.url().includes("/admin/reports/system-health"), { timeout: 15000 }).catch((error) => ({ error: error.message }));
  await page.getByRole("button", { name: /refresh/i }).click({ timeout: 15000 });
  const refreshed = await refreshResponse;
  results.adminBrowser.refresh = { status: refreshed?.status ? refreshed.status() : null, error: refreshed?.error || null };

  const searchInput = page.getByPlaceholder(/Search .* only/i);
  await searchInput.fill("__no_such_report_row__");
  await page.waitForTimeout(300);
  const searchText = await page.locator("body").innerText();
  results.adminBrowser.search = {
    placeholderScoped: await searchInput.getAttribute("placeholder"),
    rendersEmptyState: /No .* records found/i.test(searchText),
  };

  const selects = await page.locator(".admin-report-filter-grid select").count();
  if (selects >= 3) {
    await page.locator(".admin-report-filter-grid select").nth(0).selectOption("7d");
    await page.locator(".admin-report-filter-grid select").nth(1).selectOption("pending");
    await page.locator(".admin-report-filter-grid select").nth(2).selectOption("paid");
    await page.waitForTimeout(750);
  }
  results.adminBrowser.filters = { selectCount: selects, pageStillAlive: (await page.locator("body").innerText()).includes("Reports Center") };

  const customerBoardings = await apiGet(customer.token, "/customer/boardings");
  results.customerApi.boardingsBefore = {
    status: customerBoardings.status,
    ok: customerBoardings.ok,
    summary: summarizePayload(customerBoardings.json),
    count: Array.isArray(customerBoardings.json?.data) ? customerBoardings.json.data.length : Array.isArray(customerBoardings.json?.boardings) ? customerBoardings.json.boardings.length : null,
    error: customerBoardings.ok ? null : customerBoardings.json,
  };

  await context.clearCookies();
  const customerPage = await context.newPage();
  customerPage.on("console", (message) => {
    if (message.type() === "error") results.consoleErrors.push(`customer: ${message.text()}`);
  });
  customerPage.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/") && response.status() >= 400) results.failedResponses.push({ status: response.status(), url });
  });
  await seedBrowser(customerPage, customer);
  await customerPage.goto(`${APP_URL}/customer/bookings`, { waitUntil: "networkidle", timeout: 60000 });
  const customerText = await customerPage.locator("body").innerText({ timeout: 15000 });
  results.customerBrowser.bookingsPage = {
    url: customerPage.url(),
    hasBookingsUi: customerText.includes("Booking") || customerText.includes("Pet Hotel"),
    hasFailedBoardingsError: customerText.includes("Failed to load customer boardings"),
    hasHotelText: customerText.includes("Pet Hotel") || customerText.includes("Hotel"),
  };

  const pets = await apiGet(customer.token, "/customer/pets");
  let petList = Array.isArray(pets.json?.pets) ? pets.json.pets : Array.isArray(pets.json?.data) ? pets.json.data : Array.isArray(pets.json) ? pets.json : [];
  if (!petList.length) {
    const petResponse = await fetch(`${API_URL}/customer/pets`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${customer.token}`,
      },
      body: JSON.stringify({
        name: "QA Buddy",
        species: "Dog",
        breed: "Mixed",
        age: 3,
        gender: "Male",
        notes: "Created for validation-only booking workflow.",
      }),
    });
    const petText = await petResponse.text();
    let petJson = {};
    try { petJson = petText ? JSON.parse(petText) : {}; } catch { petJson = { raw: petText }; }
    results.bookingCreation.petCreated = {
      status: petResponse.status,
      ok: petResponse.ok,
      id: petJson?.id || petJson?.pet?.id || null,
      error: petResponse.ok ? null : petJson,
    };
    const refreshedPets = await apiGet(customer.token, "/customer/pets");
    petList = Array.isArray(refreshedPets.json?.pets) ? refreshedPets.json.pets : Array.isArray(refreshedPets.json?.data) ? refreshedPets.json.data : Array.isArray(refreshedPets.json) ? refreshedPets.json : [];
  }
  const from = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const rooms = await apiGet(customer.token, `/customer/boardings/available-rooms?check_in=${from}&check_out=${to}`);
  const roomList = Array.isArray(rooms.json?.available_rooms) ? rooms.json.available_rooms : [];
  results.bookingCreation.prerequisites = {
    petsStatus: pets.status,
    petCount: petList.length,
    roomsStatus: rooms.status,
    roomCount: roomList.length,
  };

  if (petList.length && roomList.length) {
    const createResponse = await fetch(`${API_URL}/customer/boardings`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${customer.token}`,
      },
      body: JSON.stringify({
        pet_id: petList[0].id,
        room_id: roomList[0].id,
        check_in_date: from,
        check_out_date: to,
        special_requests: "Automated QA validation booking",
      }),
    });
    const createText = await createResponse.text();
    let createJson = {};
    try { createJson = createText ? JSON.parse(createText) : {}; } catch { createJson = { raw: createText }; }
    results.bookingCreation.create = {
      status: createResponse.status,
      ok: createResponse.ok,
      id: createJson?.boarding?.id || null,
      error: createResponse.ok ? null : createJson,
    };

    const after = await apiGet(customer.token, "/customer/boardings");
    const afterRows = Array.isArray(after.json?.data) ? after.json.data : Array.isArray(after.json?.boardings) ? after.json.boardings : [];
    results.customerApi.boardingsAfter = {
      status: after.status,
      count: afterRows.length,
      createdVisible: createJson?.boarding?.id ? afterRows.some((row) => String(row.id) === String(createJson.boarding.id)) : false,
    };
  } else {
    results.bookingCreation.create = { skipped: "No pet or available room found for validation dates." };
  }

  const recBoardings = await apiGet(receptionist.token, "/receptionist/boarding-requests");
  const recRows = Array.isArray(recBoardings.json?.boarding_requests)
    ? recBoardings.json.boarding_requests
    : Array.isArray(recBoardings.json?.boardings)
      ? recBoardings.json.boardings
      : Array.isArray(recBoardings.json?.data)
        ? recBoardings.json.data
        : [];
  results.receptionistApi.boardingRequests = {
    status: recBoardings.status,
    ok: recBoardings.ok,
    count: recRows.length,
    createdVisible: results.bookingCreation.create?.id ? recRows.some((row) => String(row.id) === String(results.bookingCreation.create.id)) : null,
  };

  const recPage = await context.newPage();
  await seedBrowser(recPage, receptionist);
  await recPage.goto(`${APP_URL}/receptionist/bookings/hotel`, { waitUntil: "networkidle", timeout: 60000 });
  const recText = await recPage.locator("body").innerText({ timeout: 15000 });
  results.receptionistBrowser.hotelPage = {
    url: recPage.url(),
    hasHotelManagement: recText.includes("Hotel Boarding Management"),
    hasBoardingRequests: recText.includes("Hotel Boarding Requests"),
    createdVisible: results.bookingCreation.create?.id ? recText.includes(String(results.bookingCreation.create.id)) : null,
  };

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
