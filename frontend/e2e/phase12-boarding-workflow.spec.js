const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { apiLogin } = require("./test-utils");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const evidenceDir = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase12-boarding");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test.describe.configure({ mode: "serial" });
test.beforeEach(() => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  expect(apiUrl).toBe("http://127.0.0.1:8001/api");
});

const uniqueBuffer = (tag) => Buffer.concat([png, Buffer.from(`-${tag}`)]);
const today = () => new Date().toISOString().slice(0, 10);
const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const list = (body) => body?.rooms || body?.available_rooms || body?.boarding_requests || body?.boardings || body?.pets || body?.data || body || [];

async function api(request, session, method, endpoint, data, extra = {}) {
  const response = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}`, ...extra.headers },
    ...(extra.multipart ? { multipart: extra.multipart } : data === undefined ? {} : { data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`${method.toUpperCase()} ${endpoint}: ${response.status()} ${JSON.stringify(body)}`);
  return body;
}

async function openAs(browser, session, route, network, consoleLog) {
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || user.email);
    localStorage.setItem("username", user.username || user.email);
    localStorage.setItem("email", user.email);
  }, session);
  const page = await context.newPage();
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && consoleLog.push({ type: m.type(), text: m.text(), page: page.url() }));
  page.on("response", (r) => new URL(r.url()).pathname.startsWith("/api/") && network.push({ method: r.request().method(), path: new URL(r.url()).pathname, status: r.status(), page: new URL(page.url()).pathname }));
  page.on("requestfailed", (r) => new URL(r.url()).pathname.startsWith("/api/") && network.push({ method: r.method(), path: new URL(r.url()).pathname, status: "REQUEST_FAILED", failure: r.failure()?.errorText }));
  await page.goto(route);
  return { page, context };
}

async function shot(page, name) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false }).catch(() => {});
  return `phase12-boarding/${file}`;
}

function dbBoarding(id) {
  const code = `
$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$id=(int)$argv[1];
$b=$db->query("SELECT id,service_request_id,pet_id,customer_id,boarding_type,check_in,check_out,status,total_amount,payment_status,payment_method,payment_reference,payment_proof,vaccination_card,vaccination_card_verified_at,booking_channel,approved_by,approved_at,verified_by,verified_at,paid_at,receipt_number,actual_check_in,checked_in_at,checked_in_by FROM boardings WHERE id=$id")->fetch(PDO::FETCH_ASSOC);
$r=$db->query("SELECT id,room_id,source_type,source_id,pet_id,customer_id,check_in_date,check_out_date,status FROM boarding_room_reservations WHERE source_type='pet_hotel' AND source_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
$pr=$db->query("SELECT id,payable_type,payable_id,uploaded_by,disk,disk_path,mime,size_bytes,sha256,submitted_reference,status FROM payment_receipts WHERE payable_type='boarding' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
$refs=$db->query("SELECT id,provider,reference_normalized,payable_type,payable_id,receipt_id,confirmed_by,confirmed_at FROM payment_references WHERE payable_type='boarding' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
$logs=$db->query("SELECT id,boarding_id,logged_by,log_type,title,notes FROM boarding_care_logs WHERE boarding_id=$id ORDER BY id DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(["boarding"=>$b,"reservations"=>$r,"receipts"=>$pr,"references"=>$refs,"careLogs"=>$logs],JSON_PRETTY_PRINT);`;
  return JSON.parse(execFileSync("php", ["-r", code, String(id)], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
}

function dbCount(sql) {
  const code = `$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root",""); echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`;
  return JSON.parse(execFileSync("php", ["-r", code], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
}

async function existingPet(request, customer, index = 0) {
  const pets = list(await api(request, customer, "get", "/customer/pets"), ["pets"])
    .filter((pet) => pet.status !== "archived" && !pet.archived_at);
  expect(pets.length).toBeGreaterThan(index);
  return pets[index];
}

async function createRoomFixture(request, receptionist, unique) {
  const template = list(await api(request, receptionist, "get", "/receptionist/boarding-rooms"))
    .find((room) => room.room_type === "dog_standard" && room.is_active && room.customer_selectable);
  expect(template, "active dog room template").toBeTruthy();
  return (await api(request, receptionist, "post", "/receptionist/boarding-rooms", {
    room_code: `P12-${unique}`,
    room_name: `Phase12 Board ${unique}`,
    room_type: template.room_type,
    hotel_category: template.hotel_category,
    allowed_species: template.allowed_species,
    max_capacity: 1,
    total_rooms: 1,
    daily_rate: template.daily_rate,
    is_active: true,
    customer_selectable: true,
    notes: `PHASE12_BOARDING_${unique}`,
  })).room;
}

async function secondCustomer(request, unique) {
  const email = `phase12-other-${unique}@example.test`;
  await request.post(`${apiUrl}/auth/register`, {
    headers: { Accept: "application/json" },
    data: { name: `Phase12 Other ${unique}`, first_name: "Phase12", last_name: `Other${unique}`, username: `p12other${unique}`, email, password: "Password123!", password_confirmation: "Password123!" },
  });
  const login = await request.post(`${apiUrl}/auth/login`, { headers: { Accept: "application/json" }, data: { login: email, password: "Password123!" } });
  return login.ok() ? await login.json() : null;
}

test("Phase 12.2 native boarding lifecycle: reservation, documents, approval, room, payment, check-in", async ({ browser, request }) => {
  test.setTimeout(480000);
  const network = [], consoleLog = [], screenshots = [];
  const unique = Date.now().toString().slice(-8);
  const customer = await apiLogin(request, "customer");
  const receptionist = await apiLogin(request, "receptionist");
  const cashier = await apiLogin(request, "cashier");
  const pet = await existingPet(request, customer, 0);
  const room = await createRoomFixture(request, receptionist, unique);
  const date = futureDate(31);
  const reference = `P12B-${unique}`;
  const notes = `PHASE12_BOARDING_${unique}`;

  const customerView = await openAs(browser, customer, "/customer/hotel", network, consoleLog);
  const customerPage = customerView.page;
  await customerPage.locator('select[name="pet_id"]').selectOption(String(pet.id));
  const [year, month, day] = date.split("-");
  await customerPage.getByPlaceholder("mm/dd/yyyy").fill(`${month}/${day}/${year}`);
  await customerPage.getByPlaceholder("mm/dd/yyyy").press("Enter");
  const roomCard = customerPage.locator(".room-card").filter({ hasText: room.room_name });
  await expect(roomCard).toBeVisible({ timeout: 30000 });
  await roomCard.click();
  await customerPage.locator('textarea[name="notes"]').fill(notes);
  await customerPage.locator('input[type="file"]').setInputFiles({ name: `vax-${unique}.png`, mimeType: "image/png", buffer: uniqueBuffer(`vax-${unique}`) });
  screenshots.push(await shot(customerPage, "01-customer-boarding-form"));
  const createPromise = customerPage.waitForResponse((r) => new URL(r.url()).pathname === "/api/customer/boardings" && r.request().method() === "POST");
  await customerPage.getByRole("button", { name: "Submit Boarding Request" }).click();
  await expect(customerPage.locator(".brm-modal")).toBeVisible();
  await customerPage.locator(".brm-pay-now input").check();
  await customerPage.locator(".brm-primary").click();
  const createResponse = await createPromise;
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const boardingId = (await createResponse.json()).boarding.id;
  screenshots.push(await shot(customerPage, "02-customer-payment-modal"));
  const uploadPromise = customerPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/customer/boarding-requests/${boardingId}/payment-proof` && r.request().method() === "POST");
  await customerPage.locator("#pum-file-input").setInputFiles({ name: `proof-${reference}.png`, mimeType: "image/png", buffer: uniqueBuffer(`proof-${unique}`) });
  await customerPage.locator(".pum-ref-input").fill(reference);
  await customerPage.locator(".pum-confirm-btn").click();
  const uploadResponse = await uploadPromise;
  expect(uploadResponse.status(), await uploadResponse.text()).toBe(200);
  const closePayment = customerPage.locator(".pum-confirm-btn").filter({ hasText: /Close|Done/ });
  if (await closePayment.isVisible({ timeout: 5000 }).catch(() => false)) await closePayment.click();
  await customerView.context.close();

  const ownerCard = await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`, { headers: { Authorization: `Bearer ${customer.token}` } });
  const anonymousCard = await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`);
  const other = await secondCustomer(request, unique);
  const otherCard = other ? await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`, { headers: { Authorization: `Bearer ${other.token || other.access_token}` } }) : null;
  const cashierApprove = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/approve`, { headers: { Authorization: `Bearer ${cashier.token}` } });
  const customerVerifyVax = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/verify-vaccination`, { headers: { Authorization: `Bearer ${customer.token}` } });
  const negativeChecks = {
    owner_vaccination_file: ownerCard.status(),
    anonymous_vaccination_file: anonymousCard.status(),
    other_customer_vaccination_file: otherCard?.status() ?? "no_second_customer",
    cashier_cannot_approve: cashierApprove.status(),
    customer_cannot_verify_vaccination: customerVerifyVax.status(),
  };
  expect(negativeChecks.owner_vaccination_file).toBe(200);
  expect(negativeChecks.anonymous_vaccination_file).toBe(401);
  expect(negativeChecks.other_customer_vaccination_file).toBe(403);
  expect(negativeChecks.cashier_cannot_approve).toBe(403);
  expect(negativeChecks.customer_cannot_verify_vaccination).toBe(403);

  const receptionistView = await openAs(browser, receptionist, "/receptionist/bookings/hotel?tab=to_approve&range=upcoming", network, consoleLog);
  const receptionistPage = receptionistView.page;
  await receptionistPage.locator(".hotel-search-box input").fill(pet.name);
  const row = receptionistPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
  await expect(row).toHaveCount(1, { timeout: 30000 });
  await row.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  await receptionistPage.getByRole("button", { name: "View / Manage" }).click();
  const modal = receptionistPage.locator(".hbk-modal");
  await expect(modal).toBeVisible();
  const verifyPromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/verify-vaccination` && r.request().method() === "POST");
  await modal.locator(".vaccination-verify-btn").click();
  expect((await verifyPromise).status()).toBe(200);
  screenshots.push(await shot(receptionistPage, "03-vaccination-verified"));
  const approvePromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/approve` && r.request().method() === "POST");
  await modal.locator(".hbk-approve-modal-btn").click();
  const confirm = receptionistPage.locator(".swal2-confirm");
  if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) await confirm.click();
  expect((await approvePromise).status()).toBe(200);
  await expect(modal).toHaveCount(0, { timeout: 10000 });
  screenshots.push(await shot(receptionistPage, "04-boarding-approved"));

  // Reopen the approved booking from ALL (it leaves TO APPROVE) and schedule it
  // for today through the UI so the guarded check-in transition is exercised.
  await receptionistPage.goto("/receptionist/bookings/hotel?tab=all&range=upcoming");
  await receptionistPage.locator(".hotel-search-box input").fill(pet.name);
  const approvedRow = receptionistPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
  await expect(approvedRow).toHaveCount(1, { timeout: 30000 });
  await approvedRow.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  await receptionistPage.getByRole("button", { name: "View / Manage" }).click();
  await expect(modal).toBeVisible();
  await modal.locator("select").first().selectOption(`boarding:${room.id}`);
  const [ty, tm, td] = today().split("-");
  const scheduleDate = modal.getByPlaceholder("mm/dd/yyyy");
  await scheduleDate.fill(`${tm}/${td}/${ty}`);
  await scheduleDate.press("Enter");
  const schedulePromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/schedule` && r.request().method() === "POST");
  await modal.getByRole("button", { name: "Schedule Boarding" }).click();
  const scheduleResponse = await schedulePromise;
  expect(scheduleResponse.status(), await scheduleResponse.text()).toBe(200);
  screenshots.push(await shot(receptionistPage, "05-boarding-scheduled-today"));
  await receptionistView.context.close();

  const cashierView = await openAs(browser, cashier, "/cashier/payment-verification", network, consoleLog);
  const cashierPage = cashierView.page;
  const card = cashierPage.locator(".pa-card").filter({ hasText: reference });
  await expect(card).toHaveCount(1, { timeout: 45000 });
  await card.locator(".pa-btn-verify").click();
  await cashierPage.locator("#paRefNum").fill(reference);
  const verifyButton = cashierPage.locator(".pw-modal .pa-btn-verify");
  await expect(verifyButton).toBeEnabled({ timeout: 90000 });
  screenshots.push(await shot(cashierPage, "06-cashier-verify-boarding"));
  const verifyPromise2 = cashierPage.waitForResponse((r) => {
    const p = new URL(r.url()).pathname;
    return (p === `/api/cashier/payment-requests/${boardingId}/verify` || /^\/api\/cashier\/receipts\/\d+\/confirm$/.test(p)) && r.request().method() === "POST";
  });
  await verifyButton.click();
  const cashierConfirm = cashierPage.locator(".swal2-confirm");
  if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  const verifyResponse = await verifyPromise2;
  expect(verifyResponse.status(), await verifyResponse.text()).toBe(200);
  if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  await expect(cashierPage.locator(".pa-receipt-modal")).toBeVisible({ timeout: 30000 });
  screenshots.push(await shot(cashierPage, "07-cashier-receipt"));
  await cashierView.context.close();

  const checkinView = await openAs(browser, receptionist, "/receptionist/bookings/hotel?tab=on_going&range=today", network, consoleLog);
  const checkinPage = checkinView.page;
  await checkinPage.locator(".hotel-search-box input").fill(pet.name);
  const scheduledRow = checkinPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
  await expect(scheduledRow).toHaveCount(1, { timeout: 30000 });
  await scheduledRow.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  const checkinPromise = checkinPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/check-in` && r.request().method() === "POST");
  await checkinPage.getByRole("button", { name: "Check In" }).click();
  const checkinResponse = await checkinPromise;
  expect(checkinResponse.status(), await checkinResponse.text()).toBe(200);
  screenshots.push(await shot(checkinPage, "08-checked-in"));
  await checkinView.context.close();

  const db = dbBoarding(boardingId);
  const workflow = {
    boardingId, petId: pet.id, roomId: room.id, originalDate: date, scheduledDate: today(), reference, negativeChecks,
    uploadStatus: uploadResponse.status(), approveStatus: 200, scheduleStatus: scheduleResponse.status(), verifyStatus: verifyResponse.status(), checkinStatus: checkinResponse.status(),
    database: db, screenshots, network, console: consoleLog,
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "boarding-lifecycle-evidence.json"), JSON.stringify(workflow, null, 2));

  expect(db.boarding.status).toBe("in_care");
  expect(db.boarding.payment_status).toBe("paid");
  expect(db.boarding.booking_channel).toBe("online");
  expect(Number(db.boarding.approved_by)).toBe(receptionist.user.id);
  expect(Number(db.boarding.verified_by)).toBe(cashier.user.id);
  expect(Number(db.boarding.checked_in_by)).toBe(receptionist.user.id);
  expect(db.boarding.vaccination_card_verified_at).toBeTruthy();
  expect(db.boarding.receipt_number).toBeTruthy();
  expect(db.reservations.some((r) => Number(r.room_id) === Number(room.id) && r.status === "checked_in")).toBeTruthy();
  expect(db.receipts.length).toBeGreaterThan(0);
  expect(db.references.length).toBeGreaterThan(0);
  expect(consoleLog.filter((entry) => entry.type === "error")).toEqual([]);
});

test("Phase 12.2 negatives: payment/date prerequisites and cross-customer boarding access are enforced", async ({ request }) => {
  const unique = Date.now().toString().slice(-8);
  const customer = await apiLogin(request, "customer");
  const receptionist = await apiLogin(request, "receptionist");
  const pet = await existingPet(request, customer, 1);
  const room = await createRoomFixture(request, receptionist, `gate-${unique}`);
  const date = futureDate(31);
  const created = await api(request, customer, "post", "/customer/boardings", null, { multipart: {
    pet_id: String(pet.id), room_id: String(room.id), check_in_date: date, number_of_days: "1", notes: `PHASE12_GATE_${unique}`,
    vaccination_card: { name: `gate-vax-${unique}.png`, mimeType: "image/png", buffer: uniqueBuffer(`gate-${unique}`) },
  }});
  const id = created.boarding.id;
  await api(request, receptionist, "post", `/receptionist/boarding-requests/${id}/verify-vaccination`);
  await api(request, receptionist, "post", `/receptionist/boarding-requests/${id}/approve`);
  const before = dbBoarding(id).boarding;
  const unpaidCheckin = await request.post(`${apiUrl}/receptionist/boarding-requests/${id}/check-in`, { headers: { Authorization: `Bearer ${receptionist.token}` } });
  const after = dbBoarding(id).boarding;
  expect(unpaidCheckin.status()).toBe(422);
  expect(after.status).toBe(before.status);
  expect(after.checked_in_at).toBe(before.checked_in_at);

  const other = await secondCustomer(request, `${unique}x`);
  const otherShow = other ? await request.get(`${apiUrl}/customer/boarding-requests/${id}`, { headers: { Authorization: `Bearer ${other.token || other.access_token}` } }) : null;
  expect([403, 404]).toContain(otherShow?.status() ?? 404);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "boarding-negative-evidence.json"), JSON.stringify({ boardingId: id, unpaidCheckinStatus: unpaidCheckin.status(), statusBefore: before.status, statusAfter: after.status, otherCustomerShow: otherShow?.status() ?? null }, null, 2));
});

test("Phase 12.2 room race: concurrent same-room submissions allow only one reservation", async ({ request }) => {
  const unique = Date.now().toString().slice(-8);
  const customer = await apiLogin(request, "customer");
  const receptionist = await apiLogin(request, "receptionist");
  const template = list(await api(request, receptionist, "get", "/receptionist/boarding-rooms")).find((room) => room.room_type === "dog_standard" && room.is_active && room.customer_selectable);
  const room = (await api(request, receptionist, "post", "/receptionist/boarding-rooms", {
    room_code: `P12-${unique}`, room_name: `Phase12 Race ${unique}`, room_type: template.room_type,
    hotel_category: template.hotel_category, allowed_species: template.allowed_species,
    max_capacity: 1, total_rooms: 1, daily_rate: template.daily_rate,
    is_active: true, customer_selectable: true, notes: `PHASE12_RACE_${unique}`,
  })).room;
  const petA = await existingPet(request, customer, 0);
  const petB = await existingPet(request, customer, 1);
  const date = futureDate(31);
  const submit = (petId, suffix) => request.post(`${apiUrl}/customer/boardings`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${customer.token}` },
    multipart: { pet_id: String(petId), room_id: String(room.id), check_in_date: date, number_of_days: "1", notes: `PHASE12_RACE_${suffix}`,
      vaccination_card: { name: `race-${suffix}-${unique}.png`, mimeType: "image/png", buffer: uniqueBuffer(`race-${suffix}-${unique}`) } },
  });
  const responses = await Promise.all([submit(petA.id, "A"), submit(petB.id, "B")]);
  const statuses = responses.map((r) => r.status()).sort();
  const bodies = await Promise.all(responses.map((r) => r.json().catch(() => ({}))));
  const boardingIds = bodies.map((b) => b.boarding?.id).filter(Boolean);
  const db = dbCount(`SELECT id,room_id,source_id,pet_id,status FROM boarding_room_reservations WHERE room_id=${Number(room.id)} AND check_in_date='${date}' AND status<>'cancelled'`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "boarding-race-evidence.json"), JSON.stringify({ roomId: room.id, date, statuses, boardingIds, db }, null, 2));
  expect(statuses).toEqual([201, 422]);
  expect(boardingIds).toHaveLength(1);
  expect(db).toHaveLength(1);
});
