# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase12-boarding-workflow.spec.js >> Phase 12.2 native boarding lifecycle: reservation, documents, approval, room, payment, check-in
- Location: e2e\phase12-boarding-workflow.spec.js:116:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('tr.booking-row').filter({ hasText: 'E2E Board Pet 1795027462644' }).filter({ hasText: 'Phase12 Board 27502386' })
Expected: 1
Received: 0
Timeout:  30000ms

Call log:
  - Expect "toHaveCount" with timeout 30000ms
  - waiting for locator('tr.booking-row').filter({ hasText: 'E2E Board Pet 1795027462644' }).filter({ hasText: 'Phase12 Board 27502386' })
    33 × locator resolved to 0 elements
       - unexpected value "0"

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
          - link "Confinements" [ref=e39] [cursor=pointer]:
            - /url: /receptionist/medical-confinements
            - img [ref=e40]
            - text: Confinements
        - listitem [ref=e42]:
          - link "Customer Profile" [ref=e43] [cursor=pointer]:
            - /url: /receptionist/customer-profile
            - img [ref=e44]
            - text: Customer Profile
        - listitem [ref=e46]:
          - link "Chatbot" [ref=e47] [cursor=pointer]:
            - /url: /receptionist/chatbot
            - img [ref=e48]
            - text: Chatbot
        - listitem [ref=e50]:
          - link "Live Chat" [ref=e51] [cursor=pointer]:
            - /url: /receptionist/live-chat
            - img [ref=e52]
            - text: Live Chat
        - listitem [ref=e54]:
          - link "History" [ref=e55] [cursor=pointer]:
            - /url: /receptionist/history
            - img [ref=e56]
            - text: History
        - listitem [ref=e58]:
          - link "Reports" [ref=e59] [cursor=pointer]:
            - /url: /receptionist/reports
            - img [ref=e60]
            - text: Reports
        - listitem [ref=e62]:
          - link "My Payroll" [ref=e63] [cursor=pointer]:
            - /url: /receptionist/payroll
            - img [ref=e64]
            - text: My Payroll
        - listitem [ref=e66]:
          - link "Profile" [ref=e67] [cursor=pointer]:
            - /url: /receptionist/profile
            - img [ref=e68]
            - text: Profile
    - button "Logout" [ref=e71] [cursor=pointer]
  - main [ref=e72]:
    - generic [ref=e73]:
      - generic [ref=e74]:
        - heading "Hotel Bookings" [level=1] [ref=e75]
        - paragraph [ref=e76]: Manage pet hotel and boarding reservations, check-ins, and check-outs.
      - generic [ref=e77]:
        - button "Notifications" [ref=e79] [cursor=pointer]:
          - img [ref=e80]
          - generic [ref=e82]: 9+
        - button "Receptionist Receptionist" [ref=e84] [cursor=pointer]:
          - img [ref=e86]
          - generic [ref=e88]:
            - strong [ref=e89]: Receptionist
            - generic [ref=e90]: Receptionist
    - generic [ref=e92]:
      - generic [ref=e93]:
        - generic [ref=e94]:
          - generic [ref=e95]:
            - img [ref=e96]
            - text: Receptionist Hotel Operations
          - heading "Hotel Boarding Management" [level=1] [ref=e98]
          - paragraph [ref=e99]: Approve boarding requests, assign rooms, check pets in, add care logs, prepare pickup, and complete hotel stay workflows.
          - generic [ref=e100]: "Last updated: 11/19/2026, 2:46:52 AM"
        - button "Export ▼" [ref=e103] [cursor=pointer]:
          - img [ref=e104]
          - text: Export ▼
      - generic [ref=e106]:
        - button "73 Total Requests" [ref=e107] [cursor=pointer]:
          - img [ref=e109]
          - generic [ref=e111]:
            - strong [ref=e112]: "73"
            - paragraph [ref=e113]: Total Requests
        - button "16 Pending" [ref=e114] [cursor=pointer]:
          - img [ref=e116]
          - generic [ref=e118]:
            - strong [ref=e119]: "16"
            - paragraph [ref=e120]: Pending
        - button "43 Approved / Scheduled" [ref=e121] [cursor=pointer]:
          - img [ref=e123]
          - generic [ref=e125]:
            - strong [ref=e126]: "43"
            - paragraph [ref=e127]: Approved / Scheduled
        - button "10 In Care" [ref=e128] [cursor=pointer]:
          - img [ref=e130]
          - generic [ref=e132]:
            - strong [ref=e133]: "10"
            - paragraph [ref=e134]: In Care
        - button "1 Completed" [ref=e135] [cursor=pointer]:
          - img [ref=e137]
          - generic [ref=e139]:
            - strong [ref=e140]: "1"
            - paragraph [ref=e141]: Completed
      - generic [ref=e142]:
        - tablist "Hotel booking stages" [ref=e143]:
          - tab "ALL 0" [ref=e144] [cursor=pointer]:
            - generic [ref=e145]: ALL
            - generic [ref=e146]: "0"
          - tab "TO APPROVE 0" [ref=e147] [cursor=pointer]:
            - generic [ref=e148]: TO APPROVE
            - generic [ref=e149]: "0"
          - tab "TO PAY 0" [ref=e150] [cursor=pointer]:
            - generic [ref=e151]: TO PAY
            - generic [ref=e152]: "0"
          - tab "ON GOING 0" [selected] [ref=e153] [cursor=pointer]:
            - generic [ref=e154]: ON GOING
            - generic [ref=e155]: "0"
          - tab "READY TO PICKUP 0" [ref=e156] [cursor=pointer]:
            - generic [ref=e157]: READY TO PICKUP
            - generic [ref=e158]: "0"
          - tab "COMPLETE 0" [ref=e159] [cursor=pointer]:
            - generic [ref=e160]: COMPLETE
            - generic [ref=e161]: "0"
          - tab "CANCELED 0" [ref=e162] [cursor=pointer]:
            - generic [ref=e163]: CANCELED
            - generic [ref=e164]: "0"
        - generic [ref=e165]:
          - generic [ref=e166]:
            - group "Filter bookings by date" [ref=e167]:
              - button "TODAY" [pressed] [ref=e168] [cursor=pointer]
              - button "UPCOMING" [ref=e169] [cursor=pointer]
              - button "YESTERDAY" [ref=e170] [cursor=pointer]
              - button "7 DAYS" [ref=e171] [cursor=pointer]
              - button "1 MONTH" [ref=e172] [cursor=pointer]
            - generic [ref=e173]: 2026-11-19
          - button "22 on later dates" [ref=e174] [cursor=pointer]
          - button "4 older pending" [ref=e175] [cursor=pointer]
      - generic [ref=e176]:
        - generic [ref=e177]:
          - textbox "Search pet, customer, room, phone, notes..." [active] [ref=e178]: E2E Board Pet 1795027462644
          - button [ref=e179] [cursor=pointer]:
            - img [ref=e180]
        - combobox [ref=e183] [cursor=pointer]:
          - option "All Payments" [selected]
          - option "Unpaid"
          - option "Pending"
          - option "Paid"
          - option "Partial"
          - option "Rejected"
        - button "Clear" [ref=e184] [cursor=pointer]:
          - img [ref=e185]
          - text: Clear
      - generic [ref=e187]:
        - generic [ref=e189]:
          - generic [ref=e190]:
            - img [ref=e191]
            - text: Live Boarding Queue
          - heading "Hotel Boarding Requests" [level=2] [ref=e193]
          - paragraph [ref=e194]:
            - text: Showing
            - strong [ref=e195]: "0"
            - text: of
            - strong [ref=e196]: "73"
            - text: record(s).
        - table [ref=e198]:
          - rowgroup [ref=e199]:
            - row "Pet Customer Stay Room Payment Status Actions" [ref=e200]:
              - columnheader "Pet" [ref=e201]
              - columnheader "Customer" [ref=e202]
              - columnheader "Stay" [ref=e203]
              - columnheader "Room" [ref=e204]
              - columnheader "Payment" [ref=e205]
              - columnheader "Status" [ref=e206]
              - columnheader "Actions" [ref=e207]
          - rowgroup [ref=e208]:
            - row "No hotel boarding records found Try adjusting the search keyword, status, or payment filter." [ref=e209]:
              - cell "No hotel boarding records found Try adjusting the search keyword, status, or payment filter." [ref=e210]:
                - generic [ref=e211]:
                  - img [ref=e212]
                  - heading "No hotel boarding records found" [level=3] [ref=e214]
                  - paragraph [ref=e215]: Try adjusting the search keyword, status, or payment filter.
```

# Test source

```ts
  153 |   await customerPage.locator(".pum-confirm-btn").click();
  154 |   const uploadResponse = await uploadPromise;
  155 |   expect(uploadResponse.status(), await uploadResponse.text()).toBe(200);
  156 |   const closePayment = customerPage.locator(".pum-confirm-btn").filter({ hasText: /Close|Done/ });
  157 |   if (await closePayment.isVisible({ timeout: 5000 }).catch(() => false)) await closePayment.click();
  158 |   await customerView.context.close();
  159 | 
  160 |   const ownerCard = await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`, { headers: { Authorization: `Bearer ${customer.token}` } });
  161 |   const anonymousCard = await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`);
  162 |   const other = await secondCustomer(request, unique);
  163 |   const otherCard = other ? await request.get(`${apiUrl}/files/vaccination-cards/${boardingId}/view`, { headers: { Authorization: `Bearer ${other.token || other.access_token}` } }) : null;
  164 |   const cashierApprove = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/approve`, { headers: { Authorization: `Bearer ${cashier.token}` } });
  165 |   const customerVerifyVax = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/verify-vaccination`, { headers: { Authorization: `Bearer ${customer.token}` } });
  166 |   const negativeChecks = {
  167 |     owner_vaccination_file: ownerCard.status(),
  168 |     anonymous_vaccination_file: anonymousCard.status(),
  169 |     other_customer_vaccination_file: otherCard?.status() ?? "no_second_customer",
  170 |     cashier_cannot_approve: cashierApprove.status(),
  171 |     customer_cannot_verify_vaccination: customerVerifyVax.status(),
  172 |   };
  173 |   expect(negativeChecks.owner_vaccination_file).toBe(200);
  174 |   expect(negativeChecks.anonymous_vaccination_file).toBe(401);
  175 |   expect(negativeChecks.other_customer_vaccination_file).toBe(403);
  176 |   expect(negativeChecks.cashier_cannot_approve).toBe(403);
  177 |   expect(negativeChecks.customer_cannot_verify_vaccination).toBe(403);
  178 | 
  179 |   const receptionistView = await openAs(browser, receptionist, "/receptionist/bookings/hotel?tab=to_approve&range=upcoming", network, consoleLog);
  180 |   const receptionistPage = receptionistView.page;
  181 |   await receptionistPage.locator(".hotel-search-box input").fill(pet.name);
  182 |   const row = receptionistPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
  183 |   await expect(row).toHaveCount(1, { timeout: 30000 });
  184 |   await row.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  185 |   await receptionistPage.getByRole("button", { name: "View / Manage" }).click();
  186 |   const modal = receptionistPage.locator(".hbk-modal");
  187 |   await expect(modal).toBeVisible();
  188 |   const verifyPromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/verify-vaccination` && r.request().method() === "POST");
  189 |   await modal.locator(".vaccination-verify-btn").click();
  190 |   expect((await verifyPromise).status()).toBe(200);
  191 |   screenshots.push(await shot(receptionistPage, "03-vaccination-verified"));
  192 |   const approvePromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/approve` && r.request().method() === "POST");
  193 |   await modal.locator(".hbk-approve-modal-btn").click();
  194 |   const confirm = receptionistPage.locator(".swal2-confirm");
  195 |   if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) await confirm.click();
  196 |   expect((await approvePromise).status()).toBe(200);
  197 |   // The action handler refreshes bookings and room availability before it
  198 |   // closes the modal; those API calls can serialize through the local worker pool.
  199 |   await expect(modal).toHaveCount(0, { timeout: 30000 });
  200 |   screenshots.push(await shot(receptionistPage, "04-boarding-approved"));
  201 | 
  202 |   // Reopen the approved booking from ALL (it leaves TO APPROVE) and schedule it
  203 |   // for today through the UI so the guarded check-in transition is exercised.
  204 |   await receptionistPage.goto("/receptionist/bookings/hotel?tab=all&range=upcoming");
  205 |   await receptionistPage.locator(".hotel-search-box input").fill(pet.name);
  206 |   const approvedRow = receptionistPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
  207 |   await expect(approvedRow).toHaveCount(1, { timeout: 30000 });
  208 |   await approvedRow.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  209 |   await receptionistPage.getByRole("button", { name: "View / Manage" }).click();
  210 |   await expect(modal).toBeVisible();
  211 |   await modal.locator("select").first().selectOption(`boarding:${room.id}`);
  212 |   const queue = await api(request, receptionist, "get", "/receptionist/boarding-requests");
  213 |   const storeToday = queue.store_today;
  214 |   expect(storeToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  215 |   const [ty, tm, td] = storeToday.split("-");
  216 |   const scheduleDate = modal.getByPlaceholder("mm/dd/yyyy");
  217 |   await scheduleDate.fill(`${tm}/${td}/${ty}`);
  218 |   await scheduleDate.press("Enter");
  219 |   const schedulePromise = receptionistPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/schedule` && r.request().method() === "POST");
  220 |   await modal.getByRole("button", { name: "Schedule Boarding" }).click();
  221 |   const scheduleResponse = await schedulePromise;
  222 |   expect(scheduleResponse.status(), await scheduleResponse.text()).toBe(200);
  223 |   screenshots.push(await shot(receptionistPage, "05-boarding-scheduled-today"));
  224 |   await receptionistView.context.close();
  225 | 
  226 |   const cashierView = await openAs(browser, cashier, "/cashier/payment-verification", network, consoleLog);
  227 |   const cashierPage = cashierView.page;
  228 |   const card = cashierPage.locator(".pa-card").filter({ hasText: reference });
  229 |   await expect(card).toHaveCount(1, { timeout: 45000 });
  230 |   await card.locator(".pa-btn-verify").click();
  231 |   await cashierPage.locator("#paRefNum").fill(reference);
  232 |   const verifyButton = cashierPage.locator(".pw-modal .pa-btn-verify");
  233 |   await expect(verifyButton).toBeEnabled({ timeout: 90000 });
  234 |   screenshots.push(await shot(cashierPage, "06-cashier-verify-boarding"));
  235 |   const verifyPromise2 = cashierPage.waitForResponse((r) => {
  236 |     const p = new URL(r.url()).pathname;
  237 |     return (p === `/api/cashier/payment-requests/${boardingId}/verify` || /^\/api\/cashier\/receipts\/\d+\/confirm$/.test(p)) && r.request().method() === "POST";
  238 |   });
  239 |   await verifyButton.click();
  240 |   const cashierConfirm = cashierPage.locator(".swal2-confirm");
  241 |   if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  242 |   const verifyResponse = await verifyPromise2;
  243 |   expect(verifyResponse.status(), await verifyResponse.text()).toBe(200);
  244 |   if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  245 |   await expect(cashierPage.locator(".pa-receipt-modal")).toBeVisible({ timeout: 30000 });
  246 |   screenshots.push(await shot(cashierPage, "07-cashier-receipt"));
  247 |   await cashierView.context.close();
  248 | 
  249 |   const checkinView = await openAs(browser, receptionist, "/receptionist/bookings/hotel?tab=on_going&range=today", network, consoleLog);
  250 |   const checkinPage = checkinView.page;
  251 |   await checkinPage.locator(".hotel-search-box input").fill(pet.name);
  252 |   const scheduledRow = checkinPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
> 253 |   await expect(scheduledRow).toHaveCount(1, { timeout: 30000 });
      |                              ^ Error: expect(locator).toHaveCount(expected) failed
  254 |   await scheduledRow.getByRole("button", { name: new RegExp(`Actions for ${pet.name}`) }).click();
  255 |   const checkinPromise = checkinPage.waitForResponse((r) => new URL(r.url()).pathname === `/api/receptionist/boarding-requests/${boardingId}/check-in` && r.request().method() === "POST");
  256 |   await checkinPage.getByRole("button", { name: "Check In" }).click();
  257 |   const checkinResponse = await checkinPromise;
  258 |   expect(checkinResponse.status(), await checkinResponse.text()).toBe(200);
  259 |   screenshots.push(await shot(checkinPage, "08-checked-in"));
  260 |   await checkinView.context.close();
  261 | 
  262 |   const db = dbBoarding(boardingId);
  263 |   const workflow = {
  264 |     boardingId, petId: pet.id, roomId: room.id, originalDate: date, scheduledDate: storeToday, reference, negativeChecks,
  265 |     uploadStatus: uploadResponse.status(), approveStatus: 200, scheduleStatus: scheduleResponse.status(), verifyStatus: verifyResponse.status(), checkinStatus: checkinResponse.status(),
  266 |     database: db, screenshots, network, console: consoleLog,
  267 |   };
  268 |   fs.mkdirSync(evidenceDir, { recursive: true });
  269 |   fs.writeFileSync(path.join(evidenceDir, "boarding-lifecycle-evidence.json"), JSON.stringify(workflow, null, 2));
  270 | 
  271 |   expect(db.boarding.status).toBe("in_care");
  272 |   expect(db.boarding.payment_status).toBe("paid");
  273 |   expect(db.boarding.booking_channel).toBe("online");
  274 |   expect(Number(db.boarding.approved_by)).toBe(receptionist.user.id);
  275 |   expect(Number(db.boarding.verified_by)).toBe(cashier.user.id);
  276 |   expect(Number(db.boarding.checked_in_by)).toBe(receptionist.user.id);
  277 |   expect(db.boarding.vaccination_card_verified_at).toBeTruthy();
  278 |   expect(db.boarding.receipt_number).toBeTruthy();
  279 |   expect(db.reservations.some((r) => Number(r.room_id) === Number(room.id) && r.status === "checked_in")).toBeTruthy();
  280 |   expect(db.receipts.length).toBeGreaterThan(0);
  281 |   expect(db.references.length).toBeGreaterThan(0);
  282 |   expect(consoleLog.filter((entry) => entry.type === "error")).toEqual([]);
  283 | });
  284 | 
  285 | test("Phase 12.2 negatives: payment/date prerequisites and cross-customer boarding access are enforced", async ({ request }) => {
  286 |   const unique = Date.now().toString().slice(-8);
  287 |   const customer = await apiLogin(request, "customer");
  288 |   const receptionist = await apiLogin(request, "receptionist");
  289 |   const pet = await existingPet(request, customer, 1);
  290 |   const room = await createRoomFixture(request, receptionist, `gate-${unique}`);
  291 |   const date = futureDate(31);
  292 |   const created = await api(request, customer, "post", "/customer/boardings", null, { multipart: {
  293 |     pet_id: String(pet.id), room_id: String(room.id), check_in_date: date, number_of_days: "1", notes: `PHASE12_GATE_${unique}`,
  294 |     vaccination_card: { name: `gate-vax-${unique}.png`, mimeType: "image/png", buffer: uniqueBuffer(`gate-${unique}`) },
  295 |   }});
  296 |   const id = created.boarding.id;
  297 |   await api(request, receptionist, "post", `/receptionist/boarding-requests/${id}/verify-vaccination`);
  298 |   await api(request, receptionist, "post", `/receptionist/boarding-requests/${id}/approve`);
  299 |   const before = dbBoarding(id).boarding;
  300 |   const unpaidCheckin = await request.post(`${apiUrl}/receptionist/boarding-requests/${id}/check-in`, { headers: { Authorization: `Bearer ${receptionist.token}` } });
  301 |   const after = dbBoarding(id).boarding;
  302 |   expect(unpaidCheckin.status()).toBe(422);
  303 |   expect(after.status).toBe(before.status);
  304 |   expect(after.checked_in_at).toBe(before.checked_in_at);
  305 | 
  306 |   const other = await secondCustomer(request, `${unique}x`);
  307 |   const otherShow = other ? await request.get(`${apiUrl}/customer/boarding-requests/${id}`, { headers: { Authorization: `Bearer ${other.token || other.access_token}` } }) : null;
  308 |   expect([403, 404]).toContain(otherShow?.status() ?? 404);
  309 |   fs.mkdirSync(evidenceDir, { recursive: true });
  310 |   fs.writeFileSync(path.join(evidenceDir, "boarding-negative-evidence.json"), JSON.stringify({ boardingId: id, unpaidCheckinStatus: unpaidCheckin.status(), statusBefore: before.status, statusAfter: after.status, otherCustomerShow: otherShow?.status() ?? null }, null, 2));
  311 | });
  312 | 
  313 | test("Phase 12.2 room race: concurrent same-room submissions allow only one reservation", async ({ request }) => {
  314 |   const unique = Date.now().toString().slice(-8);
  315 |   const customer = await apiLogin(request, "customer");
  316 |   const receptionist = await apiLogin(request, "receptionist");
  317 |   const template = list(await api(request, receptionist, "get", "/receptionist/boarding-rooms")).find((room) => room.room_type === "dog_standard" && room.is_active && room.customer_selectable);
  318 |   const room = (await api(request, receptionist, "post", "/receptionist/boarding-rooms", {
  319 |     room_code: `P12-${unique}`, room_name: `Phase12 Race ${unique}`, room_type: template.room_type,
  320 |     hotel_category: template.hotel_category, allowed_species: template.allowed_species,
  321 |     max_capacity: 1, total_rooms: 1, daily_rate: template.daily_rate,
  322 |     is_active: true, customer_selectable: true, notes: `PHASE12_RACE_${unique}`,
  323 |   })).room;
  324 |   const petA = await existingPet(request, customer, 0);
  325 |   const petB = await existingPet(request, customer, 1);
  326 |   const date = futureDate(31);
  327 |   const submit = (petId, suffix) => request.post(`${apiUrl}/customer/boardings`, {
  328 |     headers: { Accept: "application/json", Authorization: `Bearer ${customer.token}` },
  329 |     multipart: { pet_id: String(petId), room_id: String(room.id), check_in_date: date, number_of_days: "1", notes: `PHASE12_RACE_${suffix}`,
  330 |       vaccination_card: { name: `race-${suffix}-${unique}.png`, mimeType: "image/png", buffer: uniqueBuffer(`race-${suffix}-${unique}`) } },
  331 |   });
  332 |   const responses = await Promise.all([submit(petA.id, "A"), submit(petB.id, "B")]);
  333 |   const statuses = responses.map((r) => r.status()).sort();
  334 |   const bodies = await Promise.all(responses.map((r) => r.json().catch(() => ({}))));
  335 |   const boardingIds = bodies.map((b) => b.boarding?.id).filter(Boolean);
  336 |   const db = dbCount(`SELECT id,room_id,source_id,pet_id,status FROM boarding_room_reservations WHERE room_id=${Number(room.id)} AND check_in_date='${date}' AND status<>'cancelled'`);
  337 |   fs.mkdirSync(evidenceDir, { recursive: true });
  338 |   fs.writeFileSync(path.join(evidenceDir, "boarding-race-evidence.json"), JSON.stringify({ roomId: room.id, date, statuses, boardingIds, db }, null, 2));
  339 |   expect(statuses).toEqual([201, 422]);
  340 |   expect(boardingIds).toHaveLength(1);
  341 |   expect(db).toHaveLength(1);
  342 | });
  343 | 
```