# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase12-boarding-workflow.spec.js >> Phase 12.2 native boarding lifecycle: reservation, documents, approval, room, payment, check-in
- Location: e2e\phase12-boarding-workflow.spec.js:112:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('tr.booking-row').filter({ hasText: 'PHASE12 Board 39868009' })
Expected: 1
Received: 2
Timeout:  30000ms

Call log:
  - Expect "toHaveCount" with timeout 30000ms
  - waiting for locator('tr.booking-row').filter({ hasText: 'PHASE12 Board 39868009' })
    5 × locator resolved to 0 elements
      - unexpected value "0"
    28 × locator resolved to 2 elements
       - unexpected value "2"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e7]: Reception Portal
    - navigation [ref=e8]:
      - list [ref=e9]:
        - listitem [ref=e10]:
          - button "Booking" [expanded] [ref=e11] [cursor=pointer]:
            - img [ref=e12]
            - generic [ref=e14]: Booking
            - img [ref=e15]
          - list [ref=e17]:
            - listitem [ref=e18]:
              - link "Hotel" [ref=e19] [cursor=pointer]:
                - /url: /receptionist/bookings/hotel
                - img [ref=e20]
                - text: Hotel
            - listitem [ref=e22]:
              - link "Veterinary" [ref=e23] [cursor=pointer]:
                - /url: /receptionist/bookings/veterinary
                - img [ref=e24]
                - text: Veterinary
            - listitem [ref=e26]:
              - link "Grooming" [ref=e27] [cursor=pointer]:
                - /url: /receptionist/bookings/grooming
                - img [ref=e28]
                - text: Grooming
        - listitem [ref=e30]:
          - link "Manage Services" [ref=e31] [cursor=pointer]:
            - /url: /receptionist/manage-services
            - img [ref=e32]
            - text: Manage Services
        - listitem [ref=e34]:
          - link "Walk-ins" [ref=e35] [cursor=pointer]:
            - /url: /receptionist/walk-ins
            - img [ref=e36]
            - text: Walk-ins
        - listitem [ref=e38]:
          - link "Customer Profile" [ref=e39] [cursor=pointer]:
            - /url: /receptionist/customer-profile
            - img [ref=e40]
            - text: Customer Profile
        - listitem [ref=e42]:
          - link "Chatbot" [ref=e43] [cursor=pointer]:
            - /url: /receptionist/chatbot
            - img [ref=e44]
            - text: Chatbot
        - listitem [ref=e46]:
          - link "Live Chat" [ref=e47] [cursor=pointer]:
            - /url: /receptionist/live-chat
            - img [ref=e48]
            - text: Live Chat
        - listitem [ref=e50]:
          - link "History" [ref=e51] [cursor=pointer]:
            - /url: /receptionist/history
            - img [ref=e52]
            - text: History
        - listitem [ref=e54]:
          - link "Reports" [ref=e55] [cursor=pointer]:
            - /url: /receptionist/reports
            - img [ref=e56]
            - text: Reports
        - listitem [ref=e58]:
          - link "My Payroll" [ref=e59] [cursor=pointer]:
            - /url: /receptionist/payroll
            - img [ref=e60]
            - text: My Payroll
        - listitem [ref=e62]:
          - link "Profile" [ref=e63] [cursor=pointer]:
            - /url: /receptionist/profile
            - img [ref=e64]
            - text: Profile
    - button "Logout" [ref=e67] [cursor=pointer]
  - main [ref=e68]:
    - generic [ref=e69]:
      - generic [ref=e70]:
        - heading "Hotel Bookings" [level=1] [ref=e71]
        - paragraph [ref=e72]: Manage pet hotel and boarding reservations, check-ins, and check-outs.
      - generic [ref=e73]:
        - button "Notifications" [ref=e75] [cursor=pointer]:
          - img [ref=e76]
          - generic [ref=e78]: 9+
        - button "RECEPTIONIST Receptionist" [ref=e80] [cursor=pointer]:
          - img [ref=e82]
          - generic [ref=e84]:
            - strong [ref=e85]: RECEPTIONIST
            - generic [ref=e86]: Receptionist
    - generic [ref=e88]:
      - generic [ref=e89]:
        - generic [ref=e90]:
          - generic [ref=e91]:
            - img [ref=e92]
            - text: Receptionist Hotel Operations
          - heading "Hotel Boarding Management" [level=1] [ref=e94]
          - paragraph [ref=e95]: Approve boarding requests, assign rooms, check pets in, add care logs, prepare pickup, and complete hotel stay workflows.
          - generic [ref=e96]: "Last updated: 11/8/2026, 8:22:56 PM"
        - button "Export ▼" [ref=e99] [cursor=pointer]:
          - img [ref=e100]
          - text: Export ▼
      - generic [ref=e102]:
        - button "4 Total Requests" [ref=e103] [cursor=pointer]:
          - img [ref=e105]
          - generic [ref=e107]:
            - strong [ref=e108]: "4"
            - paragraph [ref=e109]: Total Requests
        - button "0 Pending" [ref=e110] [cursor=pointer]:
          - img [ref=e112]
          - generic [ref=e114]:
            - strong [ref=e115]: "0"
            - paragraph [ref=e116]: Pending
        - button "4 Approved / Scheduled" [ref=e117] [cursor=pointer]:
          - img [ref=e119]
          - generic [ref=e121]:
            - strong [ref=e122]: "4"
            - paragraph [ref=e123]: Approved / Scheduled
        - button "0 In Care" [ref=e124] [cursor=pointer]:
          - img [ref=e126]
          - generic [ref=e128]:
            - strong [ref=e129]: "0"
            - paragraph [ref=e130]: In Care
        - button "0 Completed" [ref=e131] [cursor=pointer]:
          - img [ref=e133]
          - generic [ref=e135]:
            - strong [ref=e136]: "0"
            - paragraph [ref=e137]: Completed
      - generic [ref=e138]:
        - tablist "Hotel booking stages" [ref=e139]:
          - tab "ALL 2" [selected] [ref=e140] [cursor=pointer]:
            - generic [ref=e141]: ALL
            - generic [ref=e142]: "2"
          - tab "TO APPROVE 0" [ref=e143] [cursor=pointer]:
            - generic [ref=e144]: TO APPROVE
            - generic [ref=e145]: "0"
          - tab "TO PAY 2" [ref=e146] [cursor=pointer]:
            - generic [ref=e147]: TO PAY
            - generic [ref=e148]: "2"
          - tab "ON GOING 0" [ref=e149] [cursor=pointer]:
            - generic [ref=e150]: ON GOING
            - generic [ref=e151]: "0"
          - tab "READY TO PICKUP 0" [ref=e152] [cursor=pointer]:
            - generic [ref=e153]: READY TO PICKUP
            - generic [ref=e154]: "0"
          - tab "COMPLETE 0" [ref=e155] [cursor=pointer]:
            - generic [ref=e156]: COMPLETE
            - generic [ref=e157]: "0"
          - tab "CANCELED 0" [ref=e158] [cursor=pointer]:
            - generic [ref=e159]: CANCELED
            - generic [ref=e160]: "0"
        - generic [ref=e161]:
          - generic [ref=e162]:
            - group "Filter bookings by date" [ref=e163]:
              - button "TODAY" [ref=e164] [cursor=pointer]
              - button "UPCOMING" [pressed] [ref=e165] [cursor=pointer]
              - button "YESTERDAY" [ref=e166] [cursor=pointer]
              - button "7 DAYS" [ref=e167] [cursor=pointer]
              - button "1 MONTH" [ref=e168] [cursor=pointer]
            - generic [ref=e169]: 2026-11-08 to 2027-01-07
          - button "2 on later dates" [ref=e170] [cursor=pointer]
      - generic [ref=e171]:
        - generic [ref=e172]:
          - textbox "Search pet, customer, room, phone, notes..." [active] [ref=e173]: PHASE12 Board 39868009
          - button [ref=e174] [cursor=pointer]:
            - img [ref=e175]
        - combobox [ref=e178] [cursor=pointer]:
          - option "All Payments" [selected]
          - option "Unpaid"
          - option "Pending"
          - option "Paid"
          - option "Partial"
          - option "Rejected"
        - button "Clear" [ref=e179] [cursor=pointer]:
          - img [ref=e180]
          - text: Clear
      - generic [ref=e182]:
        - generic [ref=e184]:
          - generic [ref=e185]:
            - img [ref=e186]
            - text: Live Boarding Queue
          - heading "Hotel Boarding Requests" [level=2] [ref=e188]
          - paragraph [ref=e189]:
            - text: Showing
            - strong [ref=e190]: "2"
            - text: of
            - strong [ref=e191]: "4"
            - text: record(s).
        - table [ref=e193]:
          - rowgroup [ref=e194]:
            - row "Pet Customer Stay Room Payment Status Actions" [ref=e195]:
              - columnheader "Pet" [ref=e196]
              - columnheader "Customer" [ref=e197]
              - columnheader "Stay" [ref=e198]
              - columnheader "Room" [ref=e199]
              - columnheader "Payment" [ref=e200]
              - columnheader "Status" [ref=e201]
              - columnheader "Actions" [ref=e202]
          - rowgroup [ref=e203]:
            - row "PHASE12 Board 39868009 CUSTOMER Dec 09, 2026 - Dec 09, 2026 Phase12 Board 40537077 Pending Approved Actions for PHASE12 Board 39868009" [ref=e204]:
              - cell "PHASE12 Board 39868009" [ref=e205]:
                - generic [ref=e206]:
                  - img [ref=e208]
                  - generic [ref=e210]: PHASE12 Board 39868009
              - cell "CUSTOMER" [ref=e211]:
                - generic [ref=e212]:
                  - img [ref=e213]
                  - generic [ref=e215]: CUSTOMER
              - cell "Dec 09, 2026 - Dec 09, 2026" [ref=e216]:
                - generic [ref=e217]:
                  - img [ref=e218]
                  - generic [ref=e220]: Dec 09, 2026 - Dec 09, 2026
              - cell "Phase12 Board 40537077" [ref=e221]:
                - generic [ref=e223]: Phase12 Board 40537077
              - cell "Pending" [ref=e224]:
                - generic [ref=e226]: Pending
              - cell "Approved" [ref=e227]:
                - generic [ref=e229]: Approved
              - cell "Actions for PHASE12 Board 39868009" [ref=e230]:
                - button "Actions for PHASE12 Board 39868009" [ref=e232] [cursor=pointer]:
                  - img [ref=e233]
            - row "PHASE12 Board 39868009 CUSTOMER Dec 09, 2026 - Dec 09, 2026 Phase12 Board 40037794 Pending Approved Actions for PHASE12 Board 39868009" [ref=e235]:
              - cell "PHASE12 Board 39868009" [ref=e236]:
                - generic [ref=e237]:
                  - img [ref=e239]
                  - generic [ref=e241]: PHASE12 Board 39868009
              - cell "CUSTOMER" [ref=e242]:
                - generic [ref=e243]:
                  - img [ref=e244]
                  - generic [ref=e246]: CUSTOMER
              - cell "Dec 09, 2026 - Dec 09, 2026" [ref=e247]:
                - generic [ref=e248]:
                  - img [ref=e249]
                  - generic [ref=e251]: Dec 09, 2026 - Dec 09, 2026
              - cell "Phase12 Board 40037794" [ref=e252]:
                - generic [ref=e254]: Phase12 Board 40037794
              - cell "Pending" [ref=e255]:
                - generic [ref=e257]: Pending
              - cell "Approved" [ref=e258]:
                - generic [ref=e260]: Approved
              - cell "Actions for PHASE12 Board 39868009" [ref=e261]:
                - button "Actions for PHASE12 Board 39868009" [ref=e263] [cursor=pointer]:
                  - img [ref=e264]
```

# Test source

```ts
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
  121 |   const date = futureDate(31);
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
  132 |   await expect(roomCard).toBeVisible({ timeout: 30000 });
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
  196 |   // Reopen the approved booking from ALL (it leaves TO APPROVE) and schedule it
  197 |   // for today through the UI so the guarded check-in transition is exercised.
  198 |   await receptionistPage.goto("/receptionist/bookings/hotel?tab=all&range=upcoming");
  199 |   await receptionistPage.locator(".hotel-search-box input").fill(pet.name);
  200 |   const approvedRow = receptionistPage.locator("tr.booking-row").filter({ hasText: pet.name });
> 201 |   await expect(approvedRow).toHaveCount(1, { timeout: 30000 });
      |                             ^ Error: expect(locator).toHaveCount(expected) failed
  202 |   await approvedRow.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  203 |   await receptionistPage.getByRole("button", { name: "View / Manage" }).click();
  204 |   await expect(modal).toBeVisible();
  205 |   await modal.locator("select").first().selectOption(`boarding:${room.id}`);
  206 |   const [ty, tm, td] = today().split("-");
  207 |   const scheduleDate = modal.getByPlaceholder("mm/dd/yyyy");
  208 |   await scheduleDate.fill(`${tm}/${td}/${ty}`);
  209 |   await scheduleDate.press("Enter");
  210 |   const schedulePromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/schedule` && r.request().method() === "POST");
  211 |   await modal.getByRole("button", { name: "Schedule Boarding" }).click();
  212 |   const scheduleResponse = await schedulePromise;
  213 |   expect(scheduleResponse.status(), await scheduleResponse.text()).toBe(200);
  214 |   screenshots.push(await shot(receptionistPage, "05-boarding-scheduled-today"));
  215 |   await receptionistView.context.close();
  216 | 
  217 |   const cashierView = await openAs(browser, cashier, "/cashier/payment-verification", network, consoleLog);
  218 |   const cashierPage = cashierView.page;
  219 |   const card = cashierPage.locator(".pa-card").filter({ hasText: reference });
  220 |   await expect(card).toHaveCount(1, { timeout: 45000 });
  221 |   await card.locator(".pa-btn-verify").click();
  222 |   await cashierPage.locator("#paRefNum").fill(reference);
  223 |   const verifyButton = cashierPage.locator(".pw-modal .pa-btn-verify");
  224 |   await expect(verifyButton).toBeEnabled({ timeout: 90000 });
  225 |   screenshots.push(await shot(cashierPage, "06-cashier-verify-boarding"));
  226 |   const verifyPromise2 = cashierPage.waitForResponse((r) => {
  227 |     const p = new URL(r.url()).pathname;
  228 |     return (p === `/api/cashier/payment-requests/${boardingId}/verify` || /^\/api\/cashier\/receipts\/\d+\/confirm$/.test(p)) && r.request().method() === "POST";
  229 |   });
  230 |   await verifyButton.click();
  231 |   const cashierConfirm = cashierPage.locator(".swal2-confirm");
  232 |   if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  233 |   const verifyResponse = await verifyPromise2;
  234 |   expect(verifyResponse.status(), await verifyResponse.text()).toBe(200);
  235 |   if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  236 |   await expect(cashierPage.locator(".pa-receipt-modal")).toBeVisible({ timeout: 30000 });
  237 |   screenshots.push(await shot(cashierPage, "07-cashier-receipt"));
  238 |   await cashierView.context.close();
  239 | 
  240 |   const checkinView = await openAs(browser, receptionist, "/receptionist/bookings/hotel?tab=on_going&range=today", network, consoleLog);
  241 |   const checkinPage = checkinView.page;
  242 |   await checkinPage.locator(".hotel-search-box input").fill(pet.name);
  243 |   const scheduledRow = checkinPage.locator("tr.booking-row").filter({ hasText: pet.name });
  244 |   await expect(scheduledRow).toHaveCount(1, { timeout: 30000 });
  245 |   await scheduledRow.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  246 |   const checkinPromise = checkinPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/check-in` && r.request().method() === "POST");
  247 |   await checkinPage.getByRole("button", { name: "Check In" }).click();
  248 |   const checkinResponse = await checkinPromise;
  249 |   expect(checkinResponse.status(), await checkinResponse.text()).toBe(200);
  250 |   screenshots.push(await shot(checkinPage, "08-checked-in"));
  251 |   await checkinView.context.close();
  252 | 
  253 |   const db = dbBoarding(boardingId);
  254 |   const workflow = {
  255 |     boardingId, petId: pet.id, roomId: room.id, originalDate: date, scheduledDate: today(), reference, negativeChecks,
  256 |     uploadStatus: uploadResponse.status(), approveStatus: 200, scheduleStatus: scheduleResponse.status(), verifyStatus: verifyResponse.status(), checkinStatus: checkinResponse.status(),
  257 |     database: db, screenshots, network, console: consoleLog,
  258 |   };
  259 |   fs.mkdirSync(evidenceDir, { recursive: true });
  260 |   fs.writeFileSync(path.join(evidenceDir, "boarding-lifecycle-evidence.json"), JSON.stringify(workflow, null, 2));
  261 | 
  262 |   expect(db.boarding.status).toBe("in_care");
  263 |   expect(db.boarding.payment_status).toBe("paid");
  264 |   expect(db.boarding.booking_channel).toBe("online");
  265 |   expect(Number(db.boarding.approved_by)).toBe(receptionist.user.id);
  266 |   expect(Number(db.boarding.verified_by)).toBe(cashier.user.id);
  267 |   expect(Number(db.boarding.checked_in_by)).toBe(receptionist.user.id);
  268 |   expect(db.boarding.vaccination_card_verified_at).toBeTruthy();
  269 |   expect(db.boarding.receipt_number).toBeTruthy();
  270 |   expect(db.reservations.some((r) => Number(r.room_id) === Number(room.id) && r.status === "checked_in")).toBeTruthy();
  271 |   expect(db.receipts.length).toBeGreaterThan(0);
  272 |   expect(db.references.length).toBeGreaterThan(0);
  273 |   expect(consoleLog.filter((entry) => entry.type === "error")).toEqual([]);
  274 | });
  275 | 
  276 | test("Phase 12.2 negatives: payment/date prerequisites and cross-customer boarding access are enforced", async ({ request }) => {
  277 |   const unique = Date.now().toString().slice(-8);
  278 |   const customer = await apiLogin(request, "customer");
  279 |   const receptionist = await apiLogin(request, "receptionist");
  280 |   const pet = await existingPet(request, customer, 1);
  281 |   const room = await createRoomFixture(request, receptionist, `gate-${unique}`);
  282 |   const date = futureDate(31);
  283 |   const created = await api(request, customer, "post", "/customer/boardings", null, { multipart: {
  284 |     pet_id: String(pet.id), room_id: String(room.id), check_in_date: date, number_of_days: "1", notes: `PHASE12_GATE_${unique}`,
  285 |     vaccination_card: { name: `gate-vax-${unique}.png`, mimeType: "image/png", buffer: uniqueBuffer(`gate-${unique}`) },
  286 |   }});
  287 |   const id = created.boarding.id;
  288 |   await api(request, receptionist, "post", `/receptionist/boarding-requests/${id}/verify-vaccination`);
  289 |   await api(request, receptionist, "post", `/receptionist/boarding-requests/${id}/approve`);
  290 |   const before = dbBoarding(id).boarding;
  291 |   const unpaidCheckin = await request.post(`${apiUrl}/receptionist/boarding-requests/${id}/check-in`, { headers: { Authorization: `Bearer ${receptionist.token}` } });
  292 |   const after = dbBoarding(id).boarding;
  293 |   expect(unpaidCheckin.status()).toBe(422);
  294 |   expect(after.status).toBe(before.status);
  295 |   expect(after.checked_in_at).toBe(before.checked_in_at);
  296 | 
  297 |   const other = await secondCustomer(request, `${unique}x`);
  298 |   const otherShow = other ? await request.get(`${apiUrl}/customer/boarding-requests/${id}`, { headers: { Authorization: `Bearer ${other.token || other.access_token}` } }) : null;
  299 |   expect([403, 404]).toContain(otherShow?.status() ?? 404);
  300 |   fs.mkdirSync(evidenceDir, { recursive: true });
  301 |   fs.writeFileSync(path.join(evidenceDir, "boarding-negative-evidence.json"), JSON.stringify({ boardingId: id, unpaidCheckinStatus: unpaidCheckin.status(), statusBefore: before.status, statusAfter: after.status, otherCustomerShow: otherShow?.status() ?? null }, null, 2));
```