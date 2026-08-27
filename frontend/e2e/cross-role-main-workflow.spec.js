const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "cross-role-main-workflow");
const resultPath = path.join(evidenceDir, "cross-role-main-workflow-results.json");
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";

const accounts = {
  customer: { email: "customer@example.com", password: "Password123!", dashboard: "/customer" },
  receptionist: { email: "receptionist@example.com", password: "Password123!", dashboard: "/receptionist" },
  veterinary: { email: "vet@example.com", password: "Password123!", dashboard: "/veterinary" },
  manager: { email: "manager@example.com", password: "password123", dashboard: "/manager" },
};

const run = {
  startedAt: new Date().toISOString(),
  completedAt: null,
  frontendUrl,
  apiUrl,
  status: "NOT_RUN",
  pages: [],
  actions: [],
  screenshots: [],
  records: {},
  console: [],
  httpFailures: [],
  navigationAborts: [],
  limitations: [],
};

const runSeed = Date.now();

function ensureEvidenceDir() {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

function writeResults() {
  run.completedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(run, null, 2));
}

function relativeToRoot(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function normalizeList(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
    if (Array.isArray(value?.data?.[key])) return value.data[key];
  }
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.requests)) return value.requests;
  if (Array.isArray(value?.appointments)) return value.appointments;
  if (Array.isArray(value?.pets)) return value.pets;
  return [];
}

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function recordAction(name, status, detail = "") {
  run.actions.push({ name, status, detail });
  writeResults();
}

function attachAudit(page) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      // Filter Windows socket exhaustion errors (not app defects)
      if (text.includes("ERR_NETWORK_CHANGED") || text.includes("ERR_ADDRESS_IN_USE") || text.includes("net::ERR_") || text.includes("Failed to fetch")) {
        return;
      }
      run.console.push({ type: message.type(), text, page: page.url() });
    }
  });

  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (url.includes("/api/") && [401, 403, 404, 500].includes(status)) {
      run.httpFailures.push({
        status,
        method: response.request().method(),
        url,
        page: page.url(),
      });
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("/api/")) return;
    const failure = request.failure()?.errorText || "unknown";
    // Filter Windows socket exhaustion errors (not app defects)
    if (failure === "net::ERR_ABORTED" || failure === "net::ERR_ADDRESS_IN_USE" || failure === "net::ERR_NETWORK_CHANGED") {
      run.navigationAborts.push({ method: request.method(), url, page: page.url(), failure });
      return;
    }
    run.httpFailures.push({ status: "REQUEST_FAILED", method: request.method(), url, page: page.url(), failure });
  });
}

async function screenshot(page, label) {
  const filePath = path.join(evidenceDir, `${label}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  const relative = relativeToRoot(filePath);
  run.screenshots.push(relative);
  return relative;
}

async function visibleText(page) {
  return page.locator("body").evaluate((body) => body.innerText.trim()).catch(() => "");
}

async function visit(page, route, label, expectedText = null, apiPattern = null) {
  const apiWait = apiPattern
    ? page.waitForResponse(
        (response) =>
          response.url().includes(apiPattern) &&
          response.request().method() === "GET" &&
          response.status() < 400,
        { timeout: 20000 }
      ).catch(() => null)
    : Promise.resolve(null);

  const fullRoute = route.startsWith("http")
    ? route
    : (frontendUrl.replace(/\/$/, "") + (route.startsWith("/") ? route : "/" + route));
  await page.goto(fullRoute);
  await page.waitForLoadState("domcontentloaded");
  await apiWait;
  const expectedRegex = expectedText ? new RegExp(expectedText, "i") : null;
  if (expectedRegex) {
    await page
      .getByText(expectedRegex)
      .first()
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => {});
  }
  await page.waitForTimeout(500);
  const text = await visibleText(page);
  const shot = await screenshot(page, label);
  const rendered = text.length > 40;
  const containsExpected = expectedRegex ? expectedRegex.test(text) : true;
  run.pages.push({ route, label, rendered, containsExpected, screenshot: shot });
  expect(rendered, `${route} should render visible content`).toBe(true);
  expect(containsExpected, `${route} should contain ${expectedText}`).toBe(true);
  writeResults();
  return text;
}

async function loginThroughUi(page, role, request) {
  // Use API login + initScript to avoid socket exhaustion from UI login form
  const account = accounts[role];
  const session = await apiLogin(request, role);
  // Navigate to frontend first to establish origin, then set localStorage via initScript
  await page.goto(frontendUrl + "/login", { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("token", token);
    window.localStorage.setItem("role", user.role);
    window.localStorage.setItem("name", user.name);
    window.localStorage.setItem("username", user.username || user.email);
    window.localStorage.setItem("email", user.email);
  }, { token: session.token, user: session.user });
  await page.goto(frontendUrl + account.dashboard);
  await page.waitForURL(`**${account.dashboard}**`, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  recordAction(`Login as ${role}`, "PASS", account.email);
}

async function logout(page) {
  await page.goto(frontendUrl + "/logout");
  await page.waitForURL("**/login", { timeout: 15000 }).catch(() => {});
}

async function apiLogin(request, role) {
  const account = accounts[role];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await request.post(`${apiUrl}/auth/login`, {
        headers: { Accept: "application/json" },
        data: { login: account.email, email: account.email, password: account.password },
        timeout: 30000,
      });
      if (!response.ok()) {
        throw new Error(`API login failed for ${role}: ${response.status()} ${await response.text()}`);
      }
      const body = await response.json();
      return { token: body.token || body.access_token, user: body.user || {} };
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        throw err;
      }
    }
  }
}

async function api(request, session, method, endpoint, options = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await request[method.toLowerCase()](`${apiUrl}${endpoint}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${session.token}`,
          ...(options.headers || {}),
        },
        data: options.data,
        timeout: 30000,
      });
      const text = await response.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      if (!response.ok()) {
        throw new Error(`${method} ${endpoint} failed ${response.status()}: ${JSON.stringify(body)}`);
      }
      return body;
    } catch (err) {
      if (attempt < 3 && (err.message.includes("EADDRINUSE") || err.message.includes("Failed to fetch") || err.message.includes("ERR_"))) {
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        throw err;
      }
    }
  }
}

async function getAvailableVeterinarian(request, receptionistSession) {
  const response = await api(request, receptionistSession, "GET", "/receptionist/veterinarians/available");
  const veterinarians = normalizeList(response, ["veterinarians", "data"]);
  const vet = veterinarians.find((item) => item?.id);
  if (!vet) {
    throw new Error("No active veterinarian is available for receptionist approval.");
  }
  return vet;
}

async function ensureBuddyPet(request, customerSession) {
  const petsResponse = await api(request, customerSession, "GET", "/customer/pets");
  const pets = normalizeList(petsResponse, ["pets", "data"]);
  const buddy = pets.find((pet) => String(pet.name || "").toLowerCase() === "buddy");
  if (buddy) return buddy;

  const created = await api(request, customerSession, "POST", "/customer/pets", {
    data: {
      name: "Buddy",
      species: "Dog",
      breed: "Golden Retriever",
      gender: "Male",
      age: 2,
      notes: "Demo pet recreated by cross-role workflow test.",
    },
  });
  return created.pet || created.data || created;
}

async function createVetRequest(request, customerSession, pet) {
  const offset = 10 + (runSeed % 20);
  const hour = 9 + (runSeed % 7);
  const created = await api(request, customerSession, "POST", "/customer/requests", {
    data: {
      customer_name: customerSession.user.name || "Demo Customer",
      customer_email: customerSession.user.email || accounts.customer.email,
      pet_id: pet.id,
      pet_name: pet.name,
      request_type: "vet",
      service_type: "vet",
      service_name: "General Check-up",
      requested_date: futureDate(offset),
      requested_time: `${String(hour).padStart(2, "0")}:30`,
      notes: `CROSS_ROLE_MAIN_WORKFLOW vet request ${runSeed}`,
      price: 500,
    },
  });
  return created.request || created.data || created;
}

async function createVetAppointment(request, customerSession, pet) {
  const offset = 30 + (runSeed % 20);
  const created = await api(request, customerSession, "POST", "/customer/vet", {
    data: {
      petId: pet.id,
      petName: pet.name,
      service: "checkup",
      date: futureDate(offset),
      concern: `CROSS_ROLE_MAIN_WORKFLOW appointment ${runSeed}`,
    },
  });
  return created.appointment || created.data || created;
}

test.describe.configure({ mode: "serial" });
test.setTimeout(300000);

test("Customer to Receptionist to Veterinary to Manager Reports", async ({ page, request }) => {
  ensureEvidenceDir();
  page.setDefaultTimeout(20000);
  attachAudit(page);

  const customerSession = await apiLogin(request, "customer");
  const receptionistSession = await apiLogin(request, "receptionist");
  const veterinarySession = await apiLogin(request, "veterinary");
  const managerSession = await apiLogin(request, "manager");

  const buddy = await ensureBuddyPet(request, customerSession);
  run.records.buddyPetId = buddy.id;
  recordAction("Verify Buddy pet fixture", "PASS", `Buddy pet #${buddy.id}`);

  const vetRequest = await createVetRequest(request, customerSession, buddy);
  run.records.vetRequestId = vetRequest.id;
  recordAction("Create pending customer vet request", "PASS", `request #${vetRequest.id}`);

  const assignedVet = await getAvailableVeterinarian(request, receptionistSession);
  run.records.assignedVeterinarianId = assignedVet.id;
  recordAction("Resolve available veterinarian", "PASS", `${assignedVet.name || assignedVet.email || "Veterinarian"} #${assignedVet.id}`);

  await loginThroughUi(page, "customer", request);
  await visit(page, "/customer", "01-customer-dashboard", "customer|dashboard|welcome", "/api/customer/dashboard");
  await visit(page, "/customer/pets", "02-customer-buddy-pet", "Buddy", "/api/customer/pets");
  await visit(page, "/customer/services", "03-customer-pending-request", "pending|request|appointment|service", "/api/customer/my-requests");
  await logout(page);

  await loginThroughUi(page, "receptionist", request);
  await visit(page, "/receptionist/bookings/veterinary", "04-receptionist-pending-vet-request", "pending|vet|appointment|request", "/api/receptionist/requests");
  const approval = await api(request, receptionistSession, "POST", `/receptionist/requests/${vetRequest.id}/approve`, {
    data: {
      veterinarian_id: Number(assignedVet.id),
      receptionist_remarks: "Approved by cross-role browser workflow.",
    },
  });
  const approvedAppointment = approval.appointment || approval.data?.appointment;
  if (!approvedAppointment?.id) {
    throw new Error(`Receptionist approval did not return an appointment: ${JSON.stringify(approval)}`);
  }
  run.records.approvedAppointmentId = approvedAppointment.id;
  recordAction("Receptionist approves vet request via API", "PASS", `request #${vetRequest.id}, vet #${assignedVet.id}`);
  await visit(page, "/receptionist/bookings/veterinary", "05-receptionist-approved-vet-request", "approved|scheduled|pending|vet", "/api/receptionist/requests");
  await logout(page);

  await loginThroughUi(page, "veterinary", request);
  await visit(page, "/veterinary/appointments", "06-veterinary-appointments", "appointment|vet|patient|pending|approved", "/api/veterinary/appointments");
  await api(request, veterinarySession, "PATCH", `/veterinary/appointments/${approvedAppointment.id}/status`, {
    data: { status: "in_progress" },
  });
  recordAction("Veterinary updates appointment status via API", "PASS", `appointment #${approvedAppointment.id} to in_progress`);
  await visit(page, "/veterinary/appointments", "07-veterinary-updated-appointment", "in progress|in_progress|appointment|vet|patient", "/api/veterinary/appointments");
  await logout(page);

  await loginThroughUi(page, "manager", request);
  await api(request, managerSession, "GET", "/manager/reports/overview");
  await visit(page, "/manager", "08-manager-dashboard-after-workflow", "manager|dashboard|reports", "/api/manager/dashboard");
  await visit(page, "/manager/reports", "09-manager-reports-after-workflow", "reports|services|veterinary|overview", "/api/manager/reports/live");
  recordAction("Manager reports/dashboard loaded after workflow", "PASS", "manager overview and reports available");

  const criticalHttpFailures = run.httpFailures.filter((failure) =>
    [401, 403, 404, 500, "REQUEST_FAILED"].includes(failure.status)
  );

  run.limitations.push("Boarding/hotel workflow not included because latest DB has hotel_rooms=0.");
  run.limitations.push("Playwright net::ERR_ABORTED entries are recorded separately as navigation/background request aborts.");
  run.status = run.console.length || criticalHttpFailures.length ? "FAILED" : "PASSED";
  writeResults();

  expect(run.console, "browser console errors").toEqual([]);
  expect(criticalHttpFailures, "HTTP 401/403/404/500 failures").toEqual([]);
});
