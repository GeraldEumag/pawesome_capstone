# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase12-native-ui-workflows.spec.js >> Phase 12.1 customer booking, approval, and cashier verification are native UI submissions
- Location: e2e\phase12-native-ui-workflows.spec.js:87:1

# Error details

```
Error: Command failed: php -r 
$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$id=(int)$argv[1];
$request=$db->query("SELECT id,customer_id,pet_id,request_type,service_name,status,payment_status,payment_method,payment_reference,receipt_number,booking_channel,approved_by,approved_at,verified_by,verified_at,paid_at FROM service_requests WHERE id=$id")->fetch(PDO::FETCH_ASSOC);
$receipts=$db->query("SELECT id,payable_type,payable_id,status,file_path,sha256,confirmed_at,rejected_at FROM payment_receipts WHERE payable_type='service_request' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
$references=$db->query("SELECT id,payable_type,payable_id,status,reference_number,normalized_reference,provider FROM payment_references WHERE payable_type='service_request' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(["request"=>$request,"receipts"=>$receipts,"references"=>$references],JSON_PRETTY_PRINT); 13
PHP Fatal error:  Uncaught PDOException: SQLSTATE[42S22]: Column not found: 1054 Unknown column 'file_path' in 'field list' in Command line code:5
Stack trace:
#0 Command line code(5): PDO->query('SELECT id,payab...')
#1 {main}
  thrown in Command line code on line 5

```

# Test source

```ts
  1   | const { test, expect } = require("@playwright/test");
  2   | const fs = require("node:fs");
  3   | const path = require("node:path");
  4   | const { execFileSync } = require("node:child_process");
  5   | const { apiLogin } = require("./test-utils");
  6   | 
  7   | const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
  8   | const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
  9   | const evidenceDir = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase12");
  10  | const proofPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  11  | 
  12  | test.beforeEach(() => {
  13  |   test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  14  |   expect(apiUrl).toBe("http://127.0.0.1:8001/api");
  15  | });
  16  | 
  17  | const normalizeList = (payload, keys = []) => {
  18  |   if (Array.isArray(payload)) return payload;
  19  |   for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  20  |   for (const key of ["data", "items", "requests", "pets", "services"]) if (Array.isArray(payload?.[key])) return payload[key];
  21  |   return [];
  22  | };
  23  | 
  24  | async function api(request, session, method, endpoint, data) {
  25  |   const response = await request[method](`${apiUrl}${endpoint}`, {
  26  |     headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
  27  |     data,
  28  |   });
  29  |   const body = await response.json().catch(() => ({}));
  30  |   if (!response.ok()) throw new Error(`${method.toUpperCase()} ${endpoint}: ${response.status()} ${JSON.stringify(body)}`);
  31  |   return body;
  32  | }
  33  | 
  34  | async function openAs(browser, session, route, network, consoleLog) {
  35  |   const context = await browser.newContext({ baseURL: frontendUrl });
  36  |   await context.addInitScript(({ token, user }) => {
  37  |     localStorage.setItem("token", token);
  38  |     localStorage.setItem("role", user.role);
  39  |     localStorage.setItem("name", user.name || user.email);
  40  |     localStorage.setItem("username", user.username || user.email);
  41  |     localStorage.setItem("email", user.email);
  42  |   }, session);
  43  |   const page = await context.newPage();
  44  |   page.on("console", (msg) => {
  45  |     if (["error", "warning"].includes(msg.type())) consoleLog.push({ type: msg.type(), text: msg.text(), page: page.url() });
  46  |   });
  47  |   page.on("response", (response) => {
  48  |     const url = new URL(response.url());
  49  |     if (url.pathname.startsWith("/api/")) network.push({ source: "browser", method: response.request().method(), path: url.pathname, status: response.status(), page: new URL(page.url()).pathname });
  50  |   });
  51  |   page.on("requestfailed", (request) => {
  52  |     const url = new URL(request.url());
  53  |     if (url.pathname.startsWith("/api/")) network.push({ source: "browser", method: request.method(), path: url.pathname, status: "REQUEST_FAILED", failure: request.failure()?.errorText, page: new URL(page.url()).pathname });
  54  |   });
  55  |   await page.goto(route);
  56  |   return { page, context };
  57  | }
  58  | 
  59  | async function shot(page, name) {
  60  |   fs.mkdirSync(evidenceDir, { recursive: true });
  61  |   const file = `${name}.png`;
  62  |   await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false }).catch(() => {});
  63  |   return `phase12/${file}`;
  64  | }
  65  | 
  66  | function dbRequest(requestId) {
  67  |   const code = `
  68  | $db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
  69  | $id=(int)$argv[1];
  70  | $request=$db->query("SELECT id,customer_id,pet_id,request_type,service_name,status,payment_status,payment_method,payment_reference,receipt_number,booking_channel,approved_by,approved_at,verified_by,verified_at,paid_at FROM service_requests WHERE id=$id")->fetch(PDO::FETCH_ASSOC);
  71  | $receipts=$db->query("SELECT id,payable_type,payable_id,status,file_path,sha256,confirmed_at,rejected_at FROM payment_receipts WHERE payable_type='service_request' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
  72  | $references=$db->query("SELECT id,payable_type,payable_id,status,reference_number,normalized_reference,provider FROM payment_references WHERE payable_type='service_request' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
  73  | echo json_encode(["request"=>$request,"receipts"=>$receipts,"references"=>$references],JSON_PRETTY_PRINT);`;
> 74  |   return JSON.parse(execFileSync("php", ["-r", code, String(requestId)], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
      |                     ^ Error: Command failed: php -r 
  75  | }
  76  | 
  77  | async function chooseAvailableGroomingSlot(request, session, serviceName) {
  78  |   for (let offset = 8; offset < 120; offset += 1) {
  79  |     const date = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  80  |     const data = await api(request, session, "get", `/customer/availability/grooming?date=${encodeURIComponent(date)}&service_name=${encodeURIComponent(serviceName)}`);
  81  |     const slot = (data.slots || []).find((item) => item.available);
  82  |     if (slot) return { date, time: slot.time, label: slot.label };
  83  |   }
  84  |   throw new Error("No available grooming slot found");
  85  | }
  86  | 
  87  | test("Phase 12.1 customer booking, approval, and cashier verification are native UI submissions", async ({ browser, request }) => {
  88  |   test.setTimeout(420000);
  89  |   const network = [];
  90  |   const consoleLog = [];
  91  |   const screenshots = [];
  92  |   const unique = Date.now().toString().slice(-8);
  93  |   const customer = await apiLogin(request, "customer");
  94  |   const receptionist = await apiLogin(request, "receptionist");
  95  |   const cashier = await apiLogin(request, "cashier");
  96  | 
  97  |   const pet = (await api(request, customer, "post", "/pets", {
  98  |     name: `PHASE12 Pet ${unique}`,
  99  |     species: "Dog",
  100 |     breed: "UI Workflow",
  101 |     gender: "Female",
  102 |     notes: `PHASE12_NATIVE_UI_${unique}`,
  103 |   })).pet;
  104 |   expect(pet?.id).toBeTruthy();
  105 |   const services = normalizeList(await api(request, customer, "get", "/customer/services"), ["services"]);
  106 |   const service = services.find((item) => ["grooming", "daycare"].includes(String(item.category || "").toLowerCase()));
  107 |   expect(service, "Native booking requires a grooming service").toBeTruthy();
  108 |   const slot = await chooseAvailableGroomingSlot(request, customer, service.name);
  109 |   const reference = `P12-${unique}`;
  110 |   const notes = `PHASE12_NATIVE_UI_${unique}`;
  111 | 
  112 |   // Customer: real grooming form, review modal, pay-now choice, and proof upload.
  113 |   const customerView = await openAs(browser, customer, "/customer/grooming", network, consoleLog);
  114 |   const customerPage = customerView.page;
  115 |   await customerPage.locator('select[name="pet_id"]').selectOption(String(pet.id));
  116 |   await customerPage.locator('select[name="service_name"]').selectOption(service.name);
  117 |   const [year, month, day] = slot.date.split("-");
  118 |   await customerPage.getByPlaceholder("mm/dd/yyyy").fill(`${month}/${day}/${year}`);
  119 |   await customerPage.getByPlaceholder("mm/dd/yyyy").press("Enter");
  120 |   await customerPage.locator('select[name="request_time"]').selectOption(slot.time);
  121 |   await customerPage.locator('textarea[name="notes"]').fill(notes);
  122 |   await customerPage.getByRole("button", { name: "Submit Request" }).click();
  123 |   await expect(customerPage.locator(".brm-modal")).toBeVisible();
  124 |   await customerPage.locator(".brm-pay-now input").check();
  125 |   const bookingResponsePromise = customerPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/customer/requests" && response.request().method() === "POST");
  126 |   await customerPage.locator(".brm-primary").click();
  127 |   const bookingResponse = await bookingResponsePromise;
  128 |   expect([200, 201], await bookingResponse.text()).toContain(bookingResponse.status());
  129 |   const bookingBody = await bookingResponse.json();
  130 |   const requestId = bookingBody.request?.id;
  131 |   expect(requestId).toBeTruthy();
  132 |   screenshots.push(await shot(customerPage, "01-customer-payment-modal"));
  133 |   const uploadResponsePromise = customerPage.waitForResponse((response) => new URL(response.url()).pathname === `/api/customer/requests/${requestId}/payment-proof` && response.request().method() === "POST");
  134 |   await customerPage.locator("#pum-file-input").setInputFiles({ name: `phase12-${reference}.png`, mimeType: "image/png", buffer: proofPng });
  135 |   await customerPage.locator(".pum-ref-input").fill(reference);
  136 |   await customerPage.locator(".pum-confirm-btn").click();
  137 |   const uploadResponse = await uploadResponsePromise;
  138 |   expect([200, 201], await uploadResponse.text()).toContain(uploadResponse.status());
  139 |   const uploadBody = await uploadResponse.json();
  140 |   await customerPage.waitForTimeout(1500);
  141 |   const closePayment = customerPage.locator(".pum-confirm-btn").filter({ hasText: /Close|Done/ });
  142 |   if (await closePayment.isVisible().catch(() => false)) await closePayment.click();
  143 |   screenshots.push(await shot(customerPage, "02-customer-proof-submitted"));
  144 |   await customerView.context.close();
  145 | 
  146 |   // Negative authorization probes tied to the created resource.
  147 |   const customerVerifyAttempt = await request.post(`${apiUrl}/cashier/payment-requests/${requestId}/verify`, {
  148 |     headers: { Accept: "application/json", Authorization: `Bearer ${customer.token}` },
  149 |     data: { type: "service_request", reference_number: reference },
  150 |   });
  151 |   const cashierApproveAttempt = await request.patch(`${apiUrl}/receptionist/requests/${requestId}/status`, {
  152 |     headers: { Accept: "application/json", Authorization: `Bearer ${cashier.token}` },
  153 |     data: { status: "approved" },
  154 |   });
  155 |   const anonymousAttempt = await request.get(`${apiUrl}/customer/my-requests`);
  156 |   const negativeChecks = {
  157 |     customer_cannot_verify: customerVerifyAttempt.status(),
  158 |     cashier_cannot_approve: cashierApproveAttempt.status(),
  159 |     anonymous_cannot_read_customer_requests: anonymousAttempt.status(),
  160 |   };
  161 |   expect(negativeChecks.customer_cannot_verify).toBe(403);
  162 |   expect(negativeChecks.cashier_cannot_approve).toBe(403);
  163 |   expect(negativeChecks.anonymous_cannot_read_customer_requests).toBe(401);
  164 | 
  165 |   // Receptionist: locate the pending request and approve through the row action UI.
  166 |   const receptionistView = await openAs(browser, receptionist, "/receptionist/bookings/grooming?tab=to_approve&range=upcoming", network, consoleLog);
  167 |   const receptionistPage = receptionistView.page;
  168 |   await receptionistPage.locator(".gb-search-box input").fill(pet.name);
  169 |   const bookingRow = receptionistPage.locator("tr").filter({ hasText: pet.name }).filter({ hasText: service.name });
  170 |   await expect(bookingRow).toHaveCount(1, { timeout: 30000 });
  171 |   await bookingRow.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  172 |   const approveResponsePromise = receptionistPage.waitForResponse((response) => new URL(response.url()).pathname === `/api/receptionist/requests/${requestId}/status` && response.request().method() === "PATCH");
  173 |   await receptionistPage.locator(".row-action-popover-panel .approve-btn").click();
  174 |   const confirmButton = receptionistPage.locator(".swal2-confirm");
```