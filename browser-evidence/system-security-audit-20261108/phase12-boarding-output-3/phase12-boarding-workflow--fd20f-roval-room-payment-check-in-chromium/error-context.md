# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase12-boarding-workflow.spec.js >> Phase 12.2 native boarding lifecycle: reservation, documents, approval, room, payment, check-in
- Location: e2e\phase12-boarding-workflow.spec.js:112:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.room-card').filter({ hasText: 'Phase12 Board 39967259' })
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for locator('.room-card').filter({ hasText: 'Phase12 Board 39967259' })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e6]:
        - img [ref=e8]
        - generic [ref=e10]:
          - generic [ref=e11]: Pawesome
          - generic [ref=e12]: Customer Portal
      - navigation [ref=e13]:
        - list [ref=e14]:
          - listitem [ref=e15]:
            - link "Services" [ref=e16] [cursor=pointer]:
              - /url: /customer/services
              - img [ref=e18]
              - generic [ref=e20]: Services
          - listitem [ref=e21]:
            - link "My Pets" [ref=e22] [cursor=pointer]:
              - /url: /customer/pets
              - img [ref=e24]
              - generic [ref=e26]: My Pets
          - listitem [ref=e27]:
            - link "My Requests" [ref=e28] [cursor=pointer]:
              - /url: /customer/bookings
              - img [ref=e30]
              - generic [ref=e32]: My Requests
          - listitem [ref=e33]:
            - link "Notifications" [ref=e34] [cursor=pointer]:
              - /url: /customer/notifications
              - img [ref=e36]
              - generic [ref=e38]: Notifications
          - listitem [ref=e39]:
            - link "History" [ref=e40] [cursor=pointer]:
              - /url: /customer/history
              - img [ref=e42]
              - generic [ref=e44]: History
          - listitem [ref=e45]:
            - link "Medical" [ref=e46] [cursor=pointer]:
              - /url: /customer/medical-confinements
              - img [ref=e48]
              - generic [ref=e50]: Medical
          - listitem [ref=e51]:
            - link "Reports" [ref=e52] [cursor=pointer]:
              - /url: /customer/reports
              - img [ref=e54]
              - generic [ref=e56]: Reports
          - listitem [ref=e57]:
            - link "Profile" [ref=e58] [cursor=pointer]:
              - /url: /customer/profile
              - img [ref=e60]
              - generic [ref=e62]: Profile
      - button "Log Out" [ref=e64] [cursor=pointer]:
        - img [ref=e65]
        - generic [ref=e67]: Log Out
    - main [ref=e68]:
      - generic [ref=e69]:
        - generic [ref=e70]:
          - heading "Hotel Booking" [level=1] [ref=e71]
          - paragraph [ref=e72]: Book a comfortable stay for your pet at our hotel.
        - generic [ref=e73]:
          - button "Notifications" [ref=e75] [cursor=pointer]:
            - img [ref=e76]
            - generic [ref=e78]: 9+
          - button "CUSTOMER Customer" [ref=e80] [cursor=pointer]:
            - img [ref=e82]
            - generic [ref=e84]:
              - strong [ref=e85]: CUSTOMER
              - generic [ref=e86]: Customer
      - generic [ref=e89]:
        - link "Back to services" [ref=e90] [cursor=pointer]:
          - /url: /customer/services
          - img [ref=e91]
          - text: Back to services
        - heading "Pet Hotel" [level=3] [ref=e95]:
          - img [ref=e96]
          - text: Pet Hotel
        - generic [ref=e98]:
          - button "New Reservation" [ref=e99] [cursor=pointer]:
            - img [ref=e100]
            - text: New Reservation
          - button "My Bookings" [ref=e102] [cursor=pointer]:
            - img [ref=e103]
            - text: My Bookings
        - generic [ref=e106]:
          - heading "Boarding Request" [level=3] [ref=e107]:
            - img [ref=e108]
            - text: Boarding Request
          - generic [ref=e110]:
            - generic [ref=e111]:
              - generic [ref=e112]: Pet *
              - combobox [ref=e113]:
                - option "Select your pet"
                - option "PHASE12 Board 39868009 — Dog · Boarding UI (Not provided)" [selected]
                - option "PHASE12 Pet 39437179 — Dog · UI Workflow (Not provided)"
                - option "PHASE12 Pet 39293077 — Dog · UI Workflow (Not provided)"
                - option "PHASE12 Pet 39125594 — Dog · UI Workflow (Not provided)"
                - option "PHASE12 Pet 39045552 — Dog · UI Workflow (Not provided)"
                - option "PHASE12 Pet 38713360 — Dog · UI Workflow (Not provided)"
                - option "PHASE11_TEST Pet 1794137406954 — Dog · Demo (Not provided)"
                - option "PHASE11_TEST Pet 1794136560517 — Dog · Demo (Not provided)"
                - option "Buddy — Dog · Golden Retriever (Not provided)"
            - region "PHASE12 Board 39868009 pet details" [ref=e114]:
              - generic [ref=e115]:
                - strong [ref=e116]: PHASE12 Board 39868009
                - generic [ref=e117]: Selected pet details
              - generic [ref=e118]:
                - generic [ref=e119]:
                  - generic [ref=e120]: Type
                  - strong [ref=e121]: Dog
                - generic [ref=e122]:
                  - generic [ref=e123]: Breed
                  - strong [ref=e124]: Boarding UI
                - generic [ref=e125]:
                  - generic [ref=e126]: Gender
                  - strong [ref=e127]: Female
                - generic [ref=e128]:
                  - generic [ref=e129]: Age
                  - strong [ref=e130]: Not provided
                - generic [ref=e131]:
                  - generic [ref=e132]: Birthdate
                  - strong [ref=e133]: Not provided
                - generic [ref=e134]:
                  - generic [ref=e135]: Care notes
                  - strong [ref=e136]: PHASE12_BOARDING_PHASE12 Board 39868009
            - generic [ref=e137]:
              - generic [ref=e138]:
                - generic [ref=e139]: Stay Date *
                - generic [ref=e140]:
                  - textbox "mm/dd/yyyy" [ref=e142] [cursor=pointer]
                  - generic [ref=e143]: "Closed on public holidays: Bonifacio Day (Nov 30), Feast of the Immaculate Conception (Dec 8), Christmas Eve (Dec 24)"
              - generic [ref=e144]:
                - generic [ref=e145]: Stay Duration
                - textbox [disabled] [ref=e146]: Same-day stay — check-out by 6:00 PM
            - generic [ref=e147]:
              - generic [ref=e148]: Notes
              - textbox "Any additional notes..." [ref=e149]
            - generic [ref=e150]:
              - generic [ref=e151]: Vaccination Card *
              - generic [ref=e152]: Reception must verify this card before approving your booking.
              - button "Choose File" [ref=e153]
            - button "Submit Boarding Request" [ref=e154] [cursor=pointer]
    - button "Pawesome Assistant Assistant" [ref=e156] [cursor=pointer]:
      - img "Pawesome Assistant" [ref=e158]
      - generic [ref=e159]: Assistant
  - button "Open booking tracker" [ref=e161] [cursor=pointer]:
    - img [ref=e163]
    - generic [ref=e165]: 20 bookings
    - generic "Booking status updated" [ref=e166]
```

# Test source

```ts
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
  76  | async function existingPet(request, customer, index = 0) {
  77  |   const pets = list(await api(request, customer, "get", "/customer/pets"), ["pets"])
  78  |     .filter((pet) => pet.status !== "archived" && !pet.archived_at);
  79  |   expect(pets.length).toBeGreaterThan(index);
  80  |   return pets[index];
  81  | }
  82  | 
  83  | async function createRoomFixture(request, receptionist, unique) {
  84  |   const template = list(await api(request, receptionist, "get", "/receptionist/boarding-rooms"))
  85  |     .find((room) => room.room_type === "dog_standard" && room.is_active && room.customer_selectable);
  86  |   expect(template, "active dog room template").toBeTruthy();
  87  |   return (await api(request, receptionist, "post", "/receptionist/boarding-rooms", {
  88  |     room_code: `P12-${unique}`,
  89  |     room_name: `Phase12 Board ${unique}`,
  90  |     room_type: template.room_type,
  91  |     hotel_category: template.hotel_category,
  92  |     allowed_species: template.allowed_species,
  93  |     max_capacity: 1,
  94  |     total_rooms: 1,
  95  |     daily_rate: template.daily_rate,
  96  |     is_active: true,
  97  |     customer_selectable: true,
  98  |     notes: `PHASE12_BOARDING_${unique}`,
  99  |   })).room;
  100 | }
  101 | 
  102 | async function secondCustomer(request, unique) {
  103 |   const email = `phase12-other-${unique}@example.test`;
  104 |   await request.post(`${apiUrl}/auth/register`, {
  105 |     headers: { Accept: "application/json" },
  106 |     data: { name: `Phase12 Other ${unique}`, first_name: "Phase12", last_name: `Other${unique}`, username: `p12other${unique}`, email, password: "Password123!", password_confirmation: "Password123!" },
  107 |   });
  108 |   const login = await request.post(`${apiUrl}/auth/login`, { headers: { Accept: "application/json" }, data: { login: email, password: "Password123!" } });
  109 |   return login.ok() ? await login.json() : null;
  110 | }
  111 | 
  112 | test("Phase 12.2 native boarding lifecycle: reservation, documents, approval, room, payment, check-in", async ({ browser, request }) => {
  113 |   test.setTimeout(480000);
  114 |   const network = [], consoleLog = [], screenshots = [];
  115 |   const unique = Date.now().toString().slice(-8);
  116 |   const customer = await apiLogin(request, "customer");
  117 |   const receptionist = await apiLogin(request, "receptionist");
  118 |   const cashier = await apiLogin(request, "cashier");
  119 |   const pet = await existingPet(request, customer, 0);
  120 |   const room = await createRoomFixture(request, receptionist, unique);
  121 |   const date = futureDate(30);
  122 |   const reference = `P12B-${unique}`;
  123 |   const notes = `PHASE12_BOARDING_${unique}`;
  124 | 
  125 |   const customerView = await openAs(browser, customer, "/customer/hotel", network, consoleLog);
  126 |   const customerPage = customerView.page;
  127 |   await customerPage.locator('select[name="pet_id"]').selectOption(String(pet.id));
  128 |   const [year, month, day] = date.split("-");
  129 |   await customerPage.getByPlaceholder("mm/dd/yyyy").fill(`${month}/${day}/${year}`);
  130 |   await customerPage.getByPlaceholder("mm/dd/yyyy").press("Enter");
  131 |   const roomCard = customerPage.locator(".room-card").filter({ hasText: room.room_name });
> 132 |   await expect(roomCard).toBeVisible({ timeout: 30000 });
      |                          ^ Error: expect(locator).toBeVisible() failed
  133 |   await roomCard.click();
  134 |   await customerPage.locator('textarea[name="notes"]').fill(notes);
  135 |   await customerPage.locator('input[type="file"]').setInputFiles({ name: `vax-${unique}.png`, mimeType: "image/png", buffer: uniqueBuffer(`vax-${unique}`) });
  136 |   screenshots.push(await shot(customerPage, "01-customer-boarding-form"));
  137 |   const createPromise = customerPage.waitForResponse((r) => new URL(r.url()).pathname === "/api/customer/boardings" && r.request().method() === "POST");
  138 |   await customerPage.getByRole("button", { name: "Submit Boarding Request" }).click();
  139 |   await expect(customerPage.locator(".brm-modal")).toBeVisible();
  140 |   await customerPage.locator(".brm-pay-now input").check();
  141 |   await customerPage.locator(".brm-primary").click();
  142 |   const createResponse = await createPromise;
  143 |   expect(createResponse.status(), await createResponse.text()).toBe(201);
  144 |   const boardingId = (await createResponse.json()).boarding.id;
  145 |   screenshots.push(await shot(customerPage, "02-customer-payment-modal"));
  146 |   const uploadPromise = customerPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/customer/boarding-requests/${boardingId}/payment-proof` && r.request().method() === "POST");
  147 |   await customerPage.locator("#pum-file-input").setInputFiles({ name: `proof-${reference}.png`, mimeType: "image/png", buffer: uniqueBuffer(`proof-${unique}`) });
  148 |   await customerPage.locator(".pum-ref-input").fill(reference);
  149 |   await customerPage.locator(".pum-confirm-btn").click();
  150 |   const uploadResponse = await uploadPromise;
  151 |   expect(uploadResponse.status(), await uploadResponse.text()).toBe(200);
  152 |   const closePayment = customerPage.locator(".pum-confirm-btn").filter({ hasText: /Close|Done/ });
  153 |   if (await closePayment.isVisible({ timeout: 5000 }).catch(() => false)) await closePayment.click();
  154 |   await customerView.context.close();
  155 | 
  156 |   const ownerCard = await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`, { headers: { Authorization: `Bearer ${customer.token}` } });
  157 |   const anonymousCard = await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`);
  158 |   const other = await secondCustomer(request, unique);
  159 |   const otherCard = other ? await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`, { headers: { Authorization: `Bearer ${other.token || other.access_token}` } }) : null;
  160 |   const cashierApprove = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/approve`, { headers: { Authorization: `Bearer ${cashier.token}` } });
  161 |   const customerVerifyVax = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/verify-vaccination`, { headers: { Authorization: `Bearer ${customer.token}` } });
  162 |   const negativeChecks = {
  163 |     owner_vaccination_file: ownerCard.status(),
  164 |     anonymous_vaccination_file: anonymousCard.status(),
  165 |     other_customer_vaccination_file: otherCard?.status() ?? "no_second_customer",
  166 |     cashier_cannot_approve: cashierApprove.status(),
  167 |     customer_cannot_verify_vaccination: customerVerifyVax.status(),
  168 |   };
  169 |   expect(negativeChecks.owner_vaccination_file).toBe(200);
  170 |   expect(negativeChecks.anonymous_vaccination_file).toBe(401);
  171 |   expect(negativeChecks.other_customer_vaccination_file).toBe(403);
  172 |   expect(negativeChecks.cashier_cannot_approve).toBe(403);
  173 |   expect(negativeChecks.customer_cannot_verify_vaccination).toBe(403);
  174 | 
  175 |   const receptionistView = await openAs(browser, receptionist, "/receptionist/bookings/hotel?tab=to_approve&range=upcoming", network, consoleLog);
  176 |   const receptionistPage = receptionistView.page;
  177 |   await receptionistPage.locator(".hotel-search-box input").fill(pet.name);
  178 |   const row = receptionistPage.locator("tr.booking-row").filter({ hasText: pet.name });
  179 |   await expect(row).toHaveCount(1, { timeout: 30000 });
  180 |   await row.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  181 |   await receptionistPage.getByRole("button", { name: "View / Manage" }).click();
  182 |   const modal = receptionistPage.locator(".hbk-modal");
  183 |   await expect(modal).toBeVisible();
  184 |   const verifyPromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/verify-vaccination` && r.request().method() === "POST");
  185 |   await modal.locator(".vaccination-verify-btn").click();
  186 |   expect((await verifyPromise).status()).toBe(200);
  187 |   screenshots.push(await shot(receptionistPage, "03-vaccination-verified"));
  188 |   const approvePromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/approve` && r.request().method() === "POST");
  189 |   await modal.locator(".hbk-approve-modal-btn").click();
  190 |   const confirm = receptionistPage.locator(".swal2-confirm");
  191 |   if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) await confirm.click();
  192 |   expect((await approvePromise).status()).toBe(200);
  193 |   await expect(modal).toHaveCount(0, { timeout: 10000 });
  194 |   screenshots.push(await shot(receptionistPage, "04-boarding-approved"));
  195 | 
  196 |   // Reopen the approved booking and schedule it for today through the UI so the
  197 |   // guarded check-in transition is exercised without changing fixture data.
  198 |   await row.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  199 |   await receptionistPage.getByRole("button", { name: "View / Manage" }).click();
  200 |   await expect(modal).toBeVisible();
  201 |   await modal.locator("select").first().selectOption(`boarding:${room.id}`);
  202 |   const [ty, tm, td] = today().split("-");
  203 |   const scheduleDate = modal.getByPlaceholder("mm/dd/yyyy");
  204 |   await scheduleDate.fill(`${tm}/${td}/${ty}`);
  205 |   await scheduleDate.press("Enter");
  206 |   const schedulePromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/schedule` && r.request().method() === "POST");
  207 |   await modal.getByRole("button", { name: "Schedule Boarding" }).click();
  208 |   const scheduleResponse = await schedulePromise;
  209 |   expect(scheduleResponse.status(), await scheduleResponse.text()).toBe(200);
  210 |   screenshots.push(await shot(receptionistPage, "05-boarding-scheduled-today"));
  211 |   await receptionistView.context.close();
  212 | 
  213 |   const cashierView = await openAs(browser, cashier, "/cashier/payment-verification", network, consoleLog);
  214 |   const cashierPage = cashierView.page;
  215 |   const card = cashierPage.locator(".pa-card").filter({ hasText: reference });
  216 |   await expect(card).toHaveCount(1, { timeout: 45000 });
  217 |   await card.locator(".pa-btn-verify").click();
  218 |   await cashierPage.locator("#paRefNum").fill(reference);
  219 |   const verifyButton = cashierPage.locator(".pw-modal .pa-btn-verify");
  220 |   await expect(verifyButton).toBeEnabled({ timeout: 90000 });
  221 |   screenshots.push(await shot(cashierPage, "06-cashier-verify-boarding"));
  222 |   const verifyPromise2 = cashierPage.waitForResponse((r) => {
  223 |     const p = new URL(r.url()).pathname;
  224 |     return (p === `/api/cashier/payment-requests/${boardingId}/verify` || /^\/api\/cashier\/receipts\/\d+\/confirm$/.test(p)) && r.request().method() === "POST";
  225 |   });
  226 |   await verifyButton.click();
  227 |   const cashierConfirm = cashierPage.locator(".swal2-confirm");
  228 |   if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  229 |   const verifyResponse = await verifyPromise2;
  230 |   expect(verifyResponse.status(), await verifyResponse.text()).toBe(200);
  231 |   if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  232 |   await expect(cashierPage.locator(".pa-receipt-modal")).toBeVisible({ timeout: 30000 });
```