# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase12-boarding-workflow.spec.js >> Phase 12.2 native boarding lifecycle: reservation, documents, approval, room, payment, check-in
- Location: e2e\phase12-boarding-workflow.spec.js:109:1

# Error details

```
Error: POST /pets: 429 {"message":"Too Many Attempts."}
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
  9   | const evidenceDir = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase12-boarding");
  10  | const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  11  | 
  12  | test.describe.configure({ mode: "serial" });
  13  | test.beforeEach(() => {
  14  |   test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  15  |   expect(apiUrl).toBe("http://127.0.0.1:8001/api");
  16  | });
  17  | 
  18  | const uniqueBuffer = (tag) => Buffer.concat([png, Buffer.from(`-${tag}`)]);
  19  | const today = () => new Date().toISOString().slice(0, 10);
  20  | const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  21  | const list = (body) => body?.rooms || body?.available_rooms || body?.boarding_requests || body?.boardings || body?.pets || body?.data || body || [];
  22  | 
  23  | async function api(request, session, method, endpoint, data, extra = {}) {
  24  |   const response = await request[method](`${apiUrl}${endpoint}`, {
  25  |     headers: { Accept: "application/json", Authorization: `Bearer ${session.token}`, ...extra.headers },
  26  |     data,
  27  |     multipart: extra.multipart,
  28  |   });
  29  |   const body = await response.json().catch(() => ({}));
> 30  |   if (!response.ok()) throw new Error(`${method.toUpperCase()} ${endpoint}: ${response.status()} ${JSON.stringify(body)}`);
      |                             ^ Error: POST /pets: 429 {"message":"Too Many Attempts."}
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
  44  |   page.on("console", (m) => ["error", "warning"].includes(m.type()) && consoleLog.push({ type: m.type(), text: m.text(), page: page.url() }));
  45  |   page.on("response", (r) => new URL(r.url()).pathname.startsWith("/api/") && network.push({ method: r.request().method(), path: new URL(r.url()).pathname, status: r.status(), page: new URL(page.url()).pathname }));
  46  |   page.on("requestfailed", (r) => new URL(r.url()).pathname.startsWith("/api/") && network.push({ method: r.method(), path: new URL(r.url()).pathname, status: "REQUEST_FAILED", failure: r.failure()?.errorText }));
  47  |   await page.goto(route);
  48  |   return { page, context };
  49  | }
  50  | 
  51  | async function shot(page, name) {
  52  |   fs.mkdirSync(evidenceDir, { recursive: true });
  53  |   const file = `${name}.png`;
  54  |   await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false }).catch(() => {});
  55  |   return `phase12-boarding/${file}`;
  56  | }
  57  | 
  58  | function dbBoarding(id) {
  59  |   const code = `
  60  | $db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
  61  | $id=(int)$argv[1];
  62  | $b=$db->query("SELECT id,service_request_id,pet_id,customer_id,room_name,room_type,check_in,check_out,status,total_amount,payment_status,payment_method,payment_reference,payment_proof,vaccination_card,vaccination_card_verified_at,booking_channel,approved_by,approved_at,verified_by,verified_at,paid_at,receipt_number,actual_check_in,checked_in_at,checked_in_by FROM boardings WHERE id=$id")->fetch(PDO::FETCH_ASSOC);
  63  | $r=$db->query("SELECT id,room_id,source_type,source_id,pet_id,customer_id,check_in_date,check_out_date,status FROM boarding_room_reservations WHERE source_type='pet_hotel' AND source_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
  64  | $pr=$db->query("SELECT id,payable_type,payable_id,uploaded_by,disk,disk_path,mime,size_bytes,sha256,submitted_reference,status FROM payment_receipts WHERE payable_type='boarding' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
  65  | $refs=$db->query("SELECT id,provider,reference_normalized,payable_type,payable_id,receipt_id,confirmed_by,confirmed_at FROM payment_references WHERE payable_type='boarding' AND payable_id=$id ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
  66  | $logs=$db->query("SELECT id,boarding_id,logged_by,log_type,title,notes FROM boarding_care_logs WHERE boarding_id=$id ORDER BY id DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
  67  | echo json_encode(["boarding"=>$b,"reservations"=>$r,"receipts"=>$pr,"references"=>$refs,"careLogs"=>$logs],JSON_PRETTY_PRINT);`;
  68  |   return JSON.parse(execFileSync("php", ["-r", code, String(id)], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
  69  | }
  70  | 
  71  | function dbCount(sql) {
  72  |   const code = `$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root",""); echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`;
  73  |   return JSON.parse(execFileSync("php", ["-r", code], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
  74  | }
  75  | 
  76  | async function createPet(request, customer, name) {
  77  |   return (await api(request, customer, "post", "/pets", { name, species: "Dog", breed: "Boarding UI", gender: "Female", notes: `PHASE12_BOARDING_${name}` })).pet;
  78  | }
  79  | 
  80  | async function createRoomFixture(request, receptionist, unique) {
  81  |   const template = list(await api(request, receptionist, "get", "/receptionist/boarding-rooms"))
  82  |     .find((room) => room.room_type === "dog_standard" && room.is_active && room.customer_selectable);
  83  |   expect(template, "active dog room template").toBeTruthy();
  84  |   return (await api(request, receptionist, "post", "/receptionist/boarding-rooms", {
  85  |     room_code: `P12-${unique}`,
  86  |     room_name: `Phase12 Board ${unique}`,
  87  |     room_type: template.room_type,
  88  |     hotel_category: template.hotel_category,
  89  |     allowed_species: template.allowed_species,
  90  |     max_capacity: 1,
  91  |     total_rooms: 1,
  92  |     daily_rate: template.daily_rate,
  93  |     is_active: true,
  94  |     customer_selectable: true,
  95  |     notes: `PHASE12_BOARDING_${unique}`,
  96  |   })).room;
  97  | }
  98  | 
  99  | async function secondCustomer(request, unique) {
  100 |   const email = `phase12-other-${unique}@example.test`;
  101 |   await request.post(`${apiUrl}/auth/register`, {
  102 |     headers: { Accept: "application/json" },
  103 |     data: { name: `Phase12 Other ${unique}`, first_name: "Phase12", last_name: `Other${unique}`, username: `p12other${unique}`, email, password: "Password123!", password_confirmation: "Password123!" },
  104 |   });
  105 |   const login = await request.post(`${apiUrl}/auth/login`, { headers: { Accept: "application/json" }, data: { login: email, password: "Password123!" } });
  106 |   return login.ok() ? await login.json() : null;
  107 | }
  108 | 
  109 | test("Phase 12.2 native boarding lifecycle: reservation, documents, approval, room, payment, check-in", async ({ browser, request }) => {
  110 |   test.setTimeout(480000);
  111 |   const network = [], consoleLog = [], screenshots = [];
  112 |   const unique = Date.now().toString().slice(-8);
  113 |   const customer = await apiLogin(request, "customer");
  114 |   const receptionist = await apiLogin(request, "receptionist");
  115 |   const cashier = await apiLogin(request, "cashier");
  116 |   const pet = await createPet(request, customer, `PHASE12 Board ${unique}`);
  117 |   const room = await createRoomFixture(request, receptionist, unique);
  118 |   const date = futureDate(30);
  119 |   const reference = `P12B-${unique}`;
  120 |   const notes = `PHASE12_BOARDING_${unique}`;
  121 | 
  122 |   const customerView = await openAs(browser, customer, "/customer/hotel", network, consoleLog);
  123 |   const customerPage = customerView.page;
  124 |   await customerPage.locator('select[name="pet_id"]').selectOption(String(pet.id));
  125 |   const [year, month, day] = date.split("-");
  126 |   await customerPage.getByPlaceholder("mm/dd/yyyy").fill(`${month}/${day}/${year}`);
  127 |   await customerPage.getByPlaceholder("mm/dd/yyyy").press("Enter");
  128 |   const roomCard = customerPage.locator(".room-card").filter({ hasText: room.room_name });
  129 |   await expect(roomCard).toBeVisible({ timeout: 30000 });
  130 |   await roomCard.click();
```