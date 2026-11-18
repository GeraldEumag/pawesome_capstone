const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { apiLogin } = require("./test-utils");
const { checkAuditEnv } = require("./audit-guard");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const auditDatabase = process.env.E2E_AUDIT_DATABASE || "";
const evidenceDir = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase12-walk-in");

test.beforeEach(() => {
  const audit = checkAuditEnv();
  if (audit.action !== "proceed" || !["pawesome_e2e_audit", "pawesome_booking_audit"].includes(auditDatabase)) {
    throw new Error(`Refusing live mutation with unverified audit configuration: ${audit.reason || audit.action}`);
  }
  expect(audit.auditDb).toBe(auditDatabase);
});

const auth = (session) => ({ Accept: "application/json", Authorization: `Bearer ${session.token}` });
const list = (body, key) => Array.isArray(body?.[key]) ? body[key] : Array.isArray(body?.data) ? body.data : [];
const dateAfter = (days) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

async function api(request, session, method, endpoint, data) {
  const response = await request[method](`${apiUrl}${endpoint}`, {
    headers: auth(session),
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`${method.toUpperCase()} ${endpoint}: ${response.status()} ${JSON.stringify(body)}`);
  return body;
}

async function openAs(browser, session, route, network) {
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || user.email);
    localStorage.setItem("email", user.email);
  }, session);
  const page = await context.newPage();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) network.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) network.push({ method: request.method(), path: url.pathname, status: "REQUEST_FAILED", failure: request.failure()?.errorText });
  });
  await page.goto(route);
  return { page, context };
}

function databaseState(type, requestId) {
  const queries = {
    hotel: `$booking=$db->query("SELECT id,service_request_id,check_in,check_out,status,payment_status,booking_channel FROM boardings WHERE service_request_id=$id")->fetch(PDO::FETCH_ASSOC);
      $reservation=$booking ? $db->query("SELECT id,room_id,source_type,source_id,check_in_date,check_out_date,status FROM boarding_room_reservations WHERE source_type='pet_hotel' AND source_id=".(int)$booking['id'])->fetch(PDO::FETCH_ASSOC) : null;`,
    veterinary: `$booking=$db->query("SELECT id,service_request_id,scheduled_at,status,booking_channel,veterinarian_id FROM appointments WHERE service_request_id=$id ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC); $reservation=null;`,
    grooming: `$booking=$db->query("SELECT id,service_request_id,appointment_date,appointment_time,status,payment_status,booking_channel FROM groomings WHERE service_request_id=$id ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC); $reservation=null;`,
  };
  const code = `$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=${auditDatabase}","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $id=(int)$argv[1];
    $request=$db->query("SELECT id,customer_id,pet_id,request_type,service_name,request_date,request_time,status,payment_status,booking_channel,price FROM service_requests WHERE id=$id")->fetch(PDO::FETCH_ASSOC);
    ${queries[type]}
    echo json_encode(["request"=>$request,"booking"=>$booking,"reservation"=>$reservation],JSON_PRETTY_PRINT);`;
  const { execFileSync } = require("node:child_process");
  return JSON.parse(execFileSync("php", ["-r", code, String(requestId)], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
}

async function freeSlot(request, session, type, serviceName, veterinarianId) {
  for (let offset = 3; offset <= 60; offset += 1) {
    const date = dateAfter(offset);
    const query = new URLSearchParams({ date, service_name: serviceName });
    if (veterinarianId) query.set("veterinarian_id", veterinarianId);
    const response = await request.get(`${apiUrl}/availability/${type}?${query}`, { headers: auth(session) });
    if (!response.ok()) continue;
    const body = await response.json();
    const slot = (body.slots || []).find((item) => item.available);
    if (slot) return { date, time: slot.time };
  }
  throw new Error(`No available ${type} slot for "${serviceName}" within 60 days`);
}

async function createThroughWalkInUI(browser, request, type) {
  test.setTimeout(180000);
  const network = [];
  const receptionist = await apiLogin(request, "receptionist");
  const customer = await apiLogin(request, "customer");
  const cashier = await apiLogin(request, "cashier");
  const pets = list(await api(request, customer, "get", "/customer/pets"), "pets")
    .filter((pet) => pet.status !== "archived" && !pet.archived_at);
  expect(pets.length, "the seeded customer has an active pet").toBeGreaterThan(0);
  const pet = pets[0];
  const unique = `${type}-${Date.now()}`;
  let hotelRoom = null;
  if (type === "hotel") {
    const roomList = await api(request, receptionist, "get", "/receptionist/boarding-rooms");
    const template = (roomList.rooms || []).find((room) =>
      room.room_type === "dog_standard"
      && room.is_active
      && (room.allowed_species || []).some((species) => String(species).toLowerCase() === String(pet.species).toLowerCase())
    );
    expect(template, `a room template accepts ${pet.species}`).toBeTruthy();
    hotelRoom = (await api(request, receptionist, "post", "/receptionist/boarding-rooms", {
      room_code: `WALKIN-${Date.now()}`,
      room_name: `Walk-in Acceptance ${Date.now()}`,
      room_type: template.room_type,
      hotel_category: template.hotel_category,
      allowed_species: template.allowed_species,
      max_capacity: 1,
      total_rooms: 1,
      daily_rate: template.daily_rate,
      is_active: true,
      customer_selectable: true,
      notes: `PHASE12_WALKIN_${unique}`,
    })).room;
  }
  const receptionistView = await openAs(browser, receptionist, "/receptionist/walk-ins", network);
  const page = receptionistView.page;
  const serviceLabels = { hotel: "Hotel / Boarding", veterinary: "Veterinary", grooming: "Grooming" };
  const recentTypeLabels = { hotel: "Hotel ·", veterinary: "Vet ·", grooming: "Grooming ·" };
  const serviceCard = page.locator(".service-card").filter({ hasText: serviceLabels[type] });
  await serviceCard.getByRole("button", { name: /New Booking/ }).click();
  const modal = page.locator(".hbk-modal");
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: /Existing Customer/ }).click();
  await modal.getByRole("button", { name: /Next/ }).click();
  const search = modal.getByPlaceholder("Search customers by name, email or phone...");
  await search.fill(customer.user.email);
  const customerSearchResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/receptionist/customers/search"
    && new URL(response.url()).searchParams.get("q") === customer.user.email
  );
  await modal.getByRole("button", { name: "Search" }).click();
  expect((await customerSearchResponse).status()).toBe(200);
  const customerResult = modal.locator(".customer-result-item").filter({ hasText: customer.user.email });
  await expect(customerResult).toHaveCount(1, { timeout: 30000 });
  await customerResult.click();
  await modal.locator(".pet-select").selectOption(String(pet.id));
  await modal.getByRole("button", { name: /Next/ }).click();

  let selectedService = null;
  let slot = null;
  let veterinarianId = null;
  let roomId = null;
  if (type === "hotel") {
    const date = dateAfter(7);
    roomId = hotelRoom.id;
    const dateInput = modal.getByPlaceholder("mm/dd/yyyy");
    const [year, month, day] = date.split("-");
    await dateInput.fill(`${month}/${day}/${year}`);
    await dateInput.press("Enter");
    const roomField = modal.locator(".form-group").filter({ hasText: "Room *" }).locator("select");
    await expect.poll(() => roomField.locator("option").count(), { timeout: 30000 }).toBeGreaterThan(1);
    await roomField.selectOption(String(roomId));
    slot = { date, time: null };
  } else {
    const services = list(await api(request, receptionist, "get", "/receptionist/services?active_only=1"), "data");
    const allowed = type === "veterinary"
      ? ["Consultation", "Vaccination", "Surgery", "Dental", "Diagnostics"]
      : ["Grooming"];
    selectedService = services.find((service) => allowed.includes(service.category));
    expect(selectedService, `an active ${type} service is available`).toBeTruthy();

    if (type === "veterinary") {
      const vets = list(await api(request, receptionist, "get", "/receptionist/veterinarians/available"), "veterinarians");
      expect(vets.length, "an active veterinarian is available").toBeGreaterThan(0);
      veterinarianId = vets[0].id;
      await modal.locator(".form-group").filter({ hasText: "Assign Veterinarian" }).locator("select").selectOption(String(veterinarianId));
    }

    slot = await freeSlot(request, receptionist, type, selectedService.name, veterinarianId);
    const dateInput = modal.getByPlaceholder("mm/dd/yyyy");
    const [year, month, day] = slot.date.split("-");
    await dateInput.fill(`${month}/${day}/${year}`);
    await dateInput.press("Enter");
    await modal.locator(".form-group").filter({ hasText: "Service *" }).locator("select").selectOption(selectedService.name);
    if (type === "veterinary") {
      await modal.locator(".form-group").filter({ hasText: "Reason for Visit *" }).locator("textarea").fill(`Walk-in acceptance ${unique}`);
    }
    const timeSelect = modal.locator(".form-group").filter({ hasText: "Appointment Time *" }).locator("select");
    await expect(timeSelect.locator(`option[value="${slot.time}"]`)).toBeAttached({ timeout: 30000 });
    await timeSelect.selectOption(slot.time);
  }

  const submit = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/receptionist/walk-ins" && response.request().method() === "POST"
  );
  await modal.getByRole("button", { name: "Create Booking" }).click();
  const review = page.locator(".brm-modal");
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Confirm booking" }).click();
  const response = await submit;
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(201);
  const serviceRequestId = body.data?.service_request_id;
  expect(serviceRequestId).toBeTruthy();
  await expect(page.locator(".walkins-toast")).toContainText("Walk-in booking created successfully.");
  const recentRow = page.locator(".recent-item")
    .filter({ hasText: pet.name })
    .filter({ hasText: recentTypeLabels[type] });
  await expect(recentRow.first()).toBeVisible({ timeout: 30000 });

  const createdDb = databaseState(type, serviceRequestId);
  expect(createdDb.request).toMatchObject({
    id: serviceRequestId,
    pet_id: pet.id,
    request_type: type,
    booking_channel: "walk_in",
    payment_status: "unpaid",
  });
  expect(createdDb.request.status).toBe("pending");
  expect(createdDb.booking).toBeTruthy();
  expect(createdDb.booking.booking_channel).toBe("walk_in");
  if (type === "hotel") {
    expect(createdDb.reservation).toMatchObject({ status: "pending", check_in_date: slot.date, check_out_date: slot.date });
  }
  if (type === "veterinary") expect(Number(createdDb.booking.veterinarian_id)).toBe(Number(veterinarianId));

  const approvalEndpoint = type === "hotel"
    ? `/receptionist/boarding-requests/${createdDb.booking.id}/approve`
    : `/receptionist/requests/${serviceRequestId}/approve`;
  const approvalResponse = await request.post(`${apiUrl}${approvalEndpoint}`, {
    headers: auth(receptionist),
    data: type === "veterinary" ? { veterinarian_id: veterinarianId } : {},
  });
  expect(approvalResponse.status(), await approvalResponse.text()).toBe(200);
  await receptionistView.context.close();
  const db = databaseState(type, serviceRequestId);
  expect(db.request.status).toBe("approved");

  const cashierQueue = await api(request, cashier, "get", "/cashier/payment-requests");
  const payments = list(cashierQueue, "payments");
  expect(payments.some((payment) =>
    Number(payment.id) === Number(serviceRequestId)
    || Number(payment.payable_id) === Number(serviceRequestId)
    || Number(payment.service_request_id) === Number(serviceRequestId)
  ), `cashier queue contains walk-in request ${serviceRequestId}`).toBeTruthy();
  const customerView = await openAs(browser, customer, "/customer/bookings?tab=all&range=upcoming", network);
  await expect(customerView.page.locator(".cbb-board")).toContainText(pet.name, { timeout: 30000 });

  fs.mkdirSync(evidenceDir, { recursive: true });
  const stem = `${type}-walk-in`;
  const screenshot = `${stem}.png`;
  await customerView.page.screenshot({ path: path.join(evidenceDir, screenshot) });
  const evidence = {
    type,
    channel: db.request.booking_channel,
    serviceRequestId,
    bookingId: db.booking.id,
    petId: pet.id,
    date: slot.date,
    time: slot.time,
    responseStatus: response.status(),
    approvalStatus: approvalResponse.status(),
    customerVisible: true,
    cashierQueueVisible: true,
    database: db,
    screenshots: [screenshot],
    network,
  };
  fs.writeFileSync(path.join(evidenceDir, `${stem}-evidence.json`), JSON.stringify(evidence, null, 2));
  expect(network.filter((event) => event.status === "REQUEST_FAILED" && !event.failure?.includes("ERR_ABORTED"))).toEqual([]);
  await customerView.context.close();
  return evidence;
}

for (const type of ["veterinary", "hotel", "grooming"]) {
  test(`Phase 12.5 native ${type} walk-in booking is persisted and visible across roles`, async ({ browser, request }) => {
    await createThroughWalkInUI(browser, request, type);
  });
}
