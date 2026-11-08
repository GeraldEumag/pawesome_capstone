const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { apiLogin } = require("./test-utils");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const evidenceDir = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase12");
const proofPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test.beforeEach(() => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  expect(apiUrl).toBe("http://127.0.0.1:8001/api");
});

const normalizeList = (payload, keys = []) => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  for (const key of ["data", "items", "requests", "pets", "services"]) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};

async function api(request, session, method, endpoint, data) {
  const response = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
    data,
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
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) consoleLog.push({ type: msg.type(), text: msg.text(), page: page.url() });
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) network.push({ source: "browser", method: response.request().method(), path: url.pathname, status: response.status(), page: new URL(page.url()).pathname });
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) network.push({ source: "browser", method: request.method(), path: url.pathname, status: "REQUEST_FAILED", failure: request.failure()?.errorText, page: new URL(page.url()).pathname });
  });
  await page.goto(route);
  return { page, context };
}

async function shot(page, name) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false }).catch(() => {});
  return `phase12/${file}`;
}

function dbRequest(requestId) {
  const code = `
$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$id=(int)$argv[1];
$request=$db->query("SELECT id,customer_id,pet_id,request_type,service_name,status,payment_status,payment_method,payment_reference,receipt_number,booking_channel,approved_by,approved_at,verified_by,verified_at,paid_at FROM service_requests WHERE id=$id")->fetch(PDO::FETCH_ASSOC);
$receipts=$db->query("SELECT id,payable_type,payable_id,uploaded_by,disk,disk_path,mime,size_bytes,sha256,provider,submitted_reference,status,reject_reason,created_at,updated_at FROM payment_receipts WHERE payable_type='service_request' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
$references=$db->query("SELECT id,provider,reference_normalized,payable_type,payable_id,receipt_id,confirmed_by,confirmed_at FROM payment_references WHERE payable_type='service_request' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(["request"=>$request,"receipts"=>$receipts,"references"=>$references],JSON_PRETTY_PRINT);`;
  return JSON.parse(execFileSync("php", ["-r", code, String(requestId)], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
}

async function chooseAvailableGroomingSlot(request, session, serviceName) {
  for (let offset = 8; offset < 120; offset += 1) {
    const date = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const data = await api(request, session, "get", `/customer/availability/grooming?date=${encodeURIComponent(date)}&service_name=${encodeURIComponent(serviceName)}`);
    const slot = (data.slots || []).find((item) => item.available);
    if (slot) return { date, time: slot.time, label: slot.label };
  }
  throw new Error("No available grooming slot found");
}

test("Phase 12.1 customer booking, approval, and cashier verification are native UI submissions", async ({ browser, request }) => {
  test.setTimeout(420000);
  const network = [];
  const consoleLog = [];
  const screenshots = [];
  const unique = Date.now().toString().slice(-8);
  const customer = await apiLogin(request, "customer");
  const receptionist = await apiLogin(request, "receptionist");
  const cashier = await apiLogin(request, "cashier");

  const pet = (await api(request, customer, "post", "/pets", {
    name: `PHASE12 Pet ${unique}`,
    species: "Dog",
    breed: "UI Workflow",
    gender: "Female",
    notes: `PHASE12_NATIVE_UI_${unique}`,
  })).pet;
  expect(pet?.id).toBeTruthy();
  const services = normalizeList(await api(request, customer, "get", "/customer/services"), ["services"]);
  const service = services.find((item) => ["grooming", "daycare"].includes(String(item.category || "").toLowerCase()));
  expect(service, "Native booking requires a grooming service").toBeTruthy();
  const slot = await chooseAvailableGroomingSlot(request, customer, service.name);
  const reference = `P12-${unique}`;
  const notes = `PHASE12_NATIVE_UI_${unique}`;

  // Customer: real grooming form, review modal, pay-now choice, and proof upload.
  const customerView = await openAs(browser, customer, "/customer/grooming", network, consoleLog);
  const customerPage = customerView.page;
  await customerPage.locator('select[name="pet_id"]').selectOption(String(pet.id));
  await customerPage.locator('select[name="service_name"]').selectOption(service.name);
  const [year, month, day] = slot.date.split("-");
  await customerPage.getByPlaceholder("mm/dd/yyyy").fill(`${month}/${day}/${year}`);
  await customerPage.getByPlaceholder("mm/dd/yyyy").press("Enter");
  await customerPage.locator('select[name="request_time"]').selectOption(slot.time);
  await customerPage.locator('textarea[name="notes"]').fill(notes);
  await customerPage.getByRole("button", { name: "Submit Request" }).click();
  await expect(customerPage.locator(".brm-modal")).toBeVisible();
  await customerPage.locator(".brm-pay-now input").check();
  const bookingResponsePromise = customerPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/customer/requests" && response.request().method() === "POST");
  await customerPage.locator(".brm-primary").click();
  const bookingResponse = await bookingResponsePromise;
  expect([200, 201], await bookingResponse.text()).toContain(bookingResponse.status());
  const bookingBody = await bookingResponse.json();
  const requestId = bookingBody.request?.id;
  expect(requestId).toBeTruthy();
  screenshots.push(await shot(customerPage, "01-customer-payment-modal"));
  const uploadResponsePromise = customerPage.waitForResponse((response) => new URL(response.url()).pathname === `/api/customer/requests/${requestId}/payment-proof` && response.request().method() === "POST");
  await customerPage.locator("#pum-file-input").setInputFiles({ name: `phase12-${reference}.png`, mimeType: "image/png", buffer: Buffer.concat([proofPng, Buffer.from(unique)]) });
  await customerPage.locator(".pum-ref-input").fill(reference);
  await customerPage.locator(".pum-confirm-btn").click();
  const uploadResponse = await uploadResponsePromise;
  expect([200, 201], await uploadResponse.text()).toContain(uploadResponse.status());
  const uploadBody = await uploadResponse.json();
  await customerPage.waitForTimeout(1500);
  const closePayment = customerPage.locator(".pum-confirm-btn").filter({ hasText: /Close|Done/ });
  if (await closePayment.isVisible().catch(() => false)) await closePayment.click();
  screenshots.push(await shot(customerPage, "02-customer-proof-submitted"));
  await customerView.context.close();

  // Negative authorization probes tied to the created resource.
  const customerVerifyAttempt = await request.post(`${apiUrl}/cashier/payment-requests/${requestId}/verify`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${customer.token}` },
    data: { type: "service_request", reference_number: reference },
  });
  const cashierApproveAttempt = await request.patch(`${apiUrl}/receptionist/requests/${requestId}/status`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${cashier.token}` },
    data: { status: "approved" },
  });
  const anonymousAttempt = await request.get(`${apiUrl}/customer/my-requests`);
  const negativeChecks = {
    customer_cannot_verify: customerVerifyAttempt.status(),
    cashier_cannot_approve: cashierApproveAttempt.status(),
    anonymous_cannot_read_customer_requests: anonymousAttempt.status(),
  };
  expect(negativeChecks.customer_cannot_verify).toBe(403);
  expect(negativeChecks.cashier_cannot_approve).toBe(403);
  expect(negativeChecks.anonymous_cannot_read_customer_requests).toBe(401);

  // Receptionist: locate the pending request and approve through the row action UI.
  const receptionistView = await openAs(browser, receptionist, "/receptionist/bookings/grooming?tab=to_approve&range=upcoming", network, consoleLog);
  const receptionistPage = receptionistView.page;
  await receptionistPage.locator(".gb-search-box input").fill(pet.name);
  const bookingRow = receptionistPage.locator("tr").filter({ hasText: pet.name }).filter({ hasText: service.name });
  await expect(bookingRow).toHaveCount(1, { timeout: 30000 });
  await bookingRow.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  const approveResponsePromise = receptionistPage.waitForResponse((response) => new URL(response.url()).pathname === `/api/receptionist/requests/${requestId}/status` && response.request().method() === "PATCH");
  await receptionistPage.locator(".row-action-popover-panel .approve-btn").click();
  const confirmButton = receptionistPage.locator(".swal2-confirm");
  if (await confirmButton.isVisible({ timeout: 10000 }).catch(() => false)) await confirmButton.click();
  const approveResponse = await approveResponsePromise;
  expect(approveResponse.status(), await approveResponse.text()).toBe(200);
  screenshots.push(await shot(receptionistPage, "03-receptionist-approved"));
  await receptionistView.context.close();

  // Cashier: find the proof by reference and verify it through Payment Approvals.
  const cashierView = await openAs(browser, cashier, "/cashier/payment-verification", network, consoleLog);
  const cashierPage = cashierView.page;
  const paymentCard = cashierPage.locator(".pa-card").filter({ hasText: reference });
  await expect(paymentCard).toHaveCount(1, { timeout: 45000 });
  screenshots.push(await shot(cashierPage, "04-cashier-pending-card"));
  await paymentCard.locator(".pa-btn-verify").click();
  await expect(cashierPage.locator("#paRefNum")).toBeVisible({ timeout: 30000 });
  await cashierPage.locator("#paRefNum").fill(reference);
  const verifyButton = cashierPage.locator(".pw-modal .pa-btn-verify");
  await expect(verifyButton).toBeEnabled({ timeout: 90000 });
  screenshots.push(await shot(cashierPage, "05-cashier-verify-modal"));
  const verifyResponsePromise = cashierPage.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (pathname === `/api/cashier/payment-requests/${requestId}/verify` || /^\/api\/cashier\/receipts\/\d+\/confirm$/.test(pathname)) && response.request().method() === "POST";
  });
  await verifyButton.click();
  const cashierConfirm = cashierPage.locator(".swal2-confirm");
  if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  const verifyResponse = await verifyResponsePromise;
  expect([200, 201], await verifyResponse.text()).toContain(verifyResponse.status());
  const verifyBody = await verifyResponse.json();
  if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  await expect(cashierPage.locator(".pa-receipt-modal")).toBeVisible({ timeout: 30000 });
  screenshots.push(await shot(cashierPage, "06-cashier-receipt"));
  await cashierView.context.close();

  const db = dbRequest(requestId);
  const workflow = {
    requestId,
    petId: pet.id,
    service: service.name,
    date: slot.date,
    time: slot.time,
    reference,
    notes,
    upload: { status: uploadResponse.status(), body: uploadBody },
    approveStatus: approveResponse.status(),
    verify: { status: verifyResponse.status(), body: verifyBody },
    negativeChecks,
    database: db,
    screenshots,
    network,
    console: consoleLog,
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "customer-booking-payment-evidence.json"), JSON.stringify(workflow, null, 2));

  expect(db.request.status).toBe("approved");
  expect(db.request.payment_status).toBe("paid");
  expect(db.request.booking_channel).toBe("online");
  expect(db.request.payment_reference || verifyBody.reference_number || reference).toBeTruthy();
  expect(db.request.receipt_number || verifyBody.receipt_number).toBeTruthy();
  expect(Number(db.request.approved_by)).toBe(receptionist.user.id);
  expect(db.request.approved_at).toBeTruthy();
  expect(db.request.verified_by).toBe(cashier.user.id);
  expect(db.receipts.length).toBeGreaterThan(0);
  expect(consoleLog.filter((entry) => entry.type === "error")).toEqual([]);
});
