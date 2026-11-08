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

Locator:  locator('.pa-card').filter({ hasText: 'P12B-40624788' })
Expected: 1
Received: 0
Timeout:  45000ms

Call log:
  - Expect "toHaveCount" with timeout 45000ms
  - waiting for locator('.pa-card').filter({ hasText: 'P12B-40624788' })
    48 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - generic [ref=e6]:
      - img [ref=e8]
      - generic [ref=e10]: Pawesome POS
    - generic [ref=e11]:
      - generic [ref=e12]:
        - img [ref=e13]
        - textbox "Search products or scan barcode… (Enter to add)" [ref=e15]:
          - /placeholder: Search products or scan barcode…  (Enter to add)
      - button "Toggle webcam scanner" [ref=e16] [cursor=pointer]:
        - img [ref=e17]
    - generic [ref=e19]:
      - generic [ref=e20]:
        - img [ref=e21]
        - text: 187 Low
      - button "Fullscreen" [ref=e23] [cursor=pointer]:
        - img [ref=e24]
      - button "Keyboard shortcuts" [ref=e26] [cursor=pointer]:
        - img [ref=e27]
      - button [ref=e30] [cursor=pointer]:
        - img [ref=e31]
  - navigation [ref=e33]:
    - button "All Items 340" [ref=e34] [cursor=pointer]:
      - img [ref=e35]
      - generic [ref=e37]: All Items
      - generic [ref=e38]: "340"
    - button "Accessories 174" [ref=e39] [cursor=pointer]:
      - img [ref=e40]
      - generic [ref=e42]: Accessories
      - generic [ref=e43]: "174"
    - button "Health & Meds 95" [ref=e44] [cursor=pointer]:
      - img [ref=e45]
      - generic [ref=e47]: Health & Meds
      - generic [ref=e48]: "95"
    - button "Pet Food 42" [ref=e49] [cursor=pointer]:
      - img [ref=e50]
      - generic [ref=e52]: Pet Food
      - generic [ref=e53]: "42"
    - button "Services 29" [ref=e54] [cursor=pointer]:
      - img [ref=e55]
      - generic [ref=e57]: Services
      - generic [ref=e58]: "29"
    - button "Payment Approvals 5" [ref=e60] [cursor=pointer]:
      - img [ref=e61]
      - generic [ref=e63]: Payment Approvals
      - generic [ref=e64]: "5"
  - main [ref=e65]:
    - generic [ref=e67]:
      - generic [ref=e68]:
        - generic [ref=e69]:
          - generic [ref=e70]: CASHIER
          - heading "Payment Approvals" [level=2] [ref=e71]
          - paragraph [ref=e72]: Verify customer payments and process transactions
        - button "Export CSV" [ref=e74] [cursor=pointer]:
          - img [ref=e75]
          - text: Export CSV
      - generic [ref=e77]:
        - generic [ref=e78]:
          - img [ref=e80]
          - generic [ref=e82]:
            - generic [ref=e83]: "5"
            - generic [ref=e84]: Pending
        - generic [ref=e85]:
          - img [ref=e87]
          - generic [ref=e89]:
            - generic [ref=e90]: ₱2,500
            - generic [ref=e91]: Total Amount
        - generic [ref=e92]:
          - img [ref=e94]
          - generic [ref=e96]:
            - generic [ref=e97]: "0"
            - generic [ref=e98]: Verified Today
      - generic [ref=e99]:
        - generic [ref=e100]:
          - img [ref=e101]
          - textbox "Search customer…" [ref=e103]
        - generic [ref=e104]:
          - img [ref=e105]
          - combobox [ref=e107] [cursor=pointer]:
            - option "All Types" [selected]
            - option "Boarding"
            - option "Appointment"
            - option "Grooming"
            - option "Service"
            - option "Order"
        - generic [ref=e108]:
          - button "All" [ref=e109] [cursor=pointer]
          - button "Cash" [ref=e110] [cursor=pointer]:
            - img [ref=e111]
            - text: Cash
          - button "GCash" [ref=e113] [cursor=pointer]:
            - img [ref=e114]
            - text: GCash
          - button "Maya" [ref=e116] [cursor=pointer]:
            - img [ref=e117]
            - text: Maya
        - generic [ref=e119]:
          - img [ref=e120]
          - combobox [ref=e122] [cursor=pointer]:
            - option "Newest First" [selected]
            - option "Oldest First"
            - option "Highest Amount"
            - option "Lowest Amount"
            - option "Name A-Z"
            - option "Name Z-A"
        - generic [ref=e123]:
          - generic [ref=e124]: 5 results
          - generic [ref=e125]: Updated 08:24 PM
      - generic [ref=e126]:
        - generic [ref=e127]:
          - generic [ref=e129]:
            - checkbox [ref=e131] [cursor=pointer]
            - generic [ref=e133]: C
            - generic [ref=e134]:
              - generic [ref=e135]: CUSTOMER
              - generic [ref=e136]: customer@example.com
            - generic [ref=e137]:
              - generic [ref=e138]:
                - img [ref=e139]
                - text: Cash
              - generic [ref=e141]: 07:04 PM
          - generic [ref=e142]:
            - generic [ref=e143]:
              - img [ref=e145]
              - generic [ref=e147]:
                - generic [ref=e148]: appointment
                - generic [ref=e149]: General Check-up
            - generic [ref=e151]: ₱500
          - button "Collect Cash" [ref=e153] [cursor=pointer]:
            - img [ref=e154]
            - text: Collect Cash
        - generic [ref=e156]:
          - generic [ref=e158]:
            - checkbox [ref=e160] [cursor=pointer]
            - generic [ref=e162]: C
            - generic [ref=e163]:
              - generic [ref=e164]: CUSTOMER
              - generic [ref=e165]: customer@example.com
            - generic [ref=e166]:
              - generic [ref=e167]:
                - img [ref=e168]
                - text: Cash
              - generic [ref=e170]: 06:57 PM
          - generic [ref=e171]:
            - generic [ref=e172]:
              - img [ref=e174]
              - generic [ref=e176]:
                - generic [ref=e177]: appointment
                - generic [ref=e178]: General Check-up
            - generic [ref=e180]: ₱500
          - button "Collect Cash" [ref=e182] [cursor=pointer]:
            - img [ref=e183]
            - text: Collect Cash
        - generic [ref=e185]:
          - generic [ref=e187]:
            - checkbox [ref=e189] [cursor=pointer]
            - generic [ref=e191]: C
            - generic [ref=e192]:
              - generic [ref=e193]: CUSTOMER
              - generic [ref=e194]: customer@example.com
            - generic [ref=e195]:
              - generic [ref=e196]:
                - img [ref=e197]
                - text: GCash
              - generic [ref=e199]: 12:22 PM
          - generic [ref=e200]:
            - generic [ref=e201]:
              - img [ref=e203]
              - generic [ref=e205]:
                - generic [ref=e206]: Pet Boarding
                - generic [ref=e207]: "Pet Hotel Boarding #4"
            - generic [ref=e208]:
              - generic [ref=e209]: ₱500
              - generic [ref=e210]:
                - text: "Customer ref:"
                - code [ref=e211]: P12B-40537077
              - generic [ref=e212]:
                - img [ref=e213]
                - text: Scan failed — enter manually
              - button "View Proof" [ref=e215] [cursor=pointer]:
                - img [ref=e216]
                - text: View Proof
          - generic [ref=e218]:
            - button "Verify" [ref=e219] [cursor=pointer]:
              - img [ref=e220]
              - text: Verify
            - button "Reject" [ref=e222] [cursor=pointer]:
              - img [ref=e223]
              - text: Reject
        - generic [ref=e225]:
          - generic [ref=e227]:
            - checkbox [ref=e229] [cursor=pointer]
            - generic [ref=e231]: C
            - generic [ref=e232]:
              - generic [ref=e233]: CUSTOMER
              - generic [ref=e234]: customer@example.com
            - generic [ref=e235]:
              - generic [ref=e236]:
                - img [ref=e237]
                - text: GCash
              - generic [ref=e239]: 12:14 PM
          - generic [ref=e240]:
            - generic [ref=e241]:
              - img [ref=e243]
              - generic [ref=e245]:
                - generic [ref=e246]: Pet Boarding
                - generic [ref=e247]: "Pet Hotel Boarding #3"
            - generic [ref=e248]:
              - generic [ref=e249]: ₱500
              - generic [ref=e250]:
                - text: "Customer ref:"
                - code [ref=e251]: P12B-40037794
              - generic [ref=e252]:
                - img [ref=e253]
                - text: Scan failed — enter manually
              - button "View Proof" [ref=e255] [cursor=pointer]:
                - img [ref=e256]
                - text: View Proof
          - generic [ref=e258]:
            - button "Verify" [ref=e259] [cursor=pointer]:
              - img [ref=e260]
              - text: Verify
            - button "Reject" [ref=e262] [cursor=pointer]:
              - img [ref=e263]
              - text: Reject
        - generic [ref=e265]:
          - generic [ref=e267]:
            - checkbox [ref=e269] [cursor=pointer]
            - generic [ref=e271]: C
            - generic [ref=e272]:
              - generic [ref=e273]: CUSTOMER
              - generic [ref=e274]: customer@example.com
            - generic [ref=e275]:
              - generic [ref=e276]:
                - img [ref=e277]
                - text: GCash
              - generic [ref=e279]: 11:59 AM
          - generic [ref=e280]:
            - generic [ref=e281]:
              - img [ref=e283]
              - generic [ref=e285]:
                - generic [ref=e286]: grooming
                - generic [ref=e287]: Basic Bath and Blow Dry Medium Breed
            - generic [ref=e288]:
              - generic [ref=e289]: ₱500
              - generic [ref=e290]:
                - text: "Customer ref:"
                - code [ref=e291]: P12-39125594
              - generic [ref=e292]:
                - img [ref=e293]
                - text: Needs review
              - button "View Proof" [ref=e295] [cursor=pointer]:
                - img [ref=e296]
                - text: View Proof
          - generic [ref=e298]:
            - button "Verify" [ref=e299] [cursor=pointer]:
              - img [ref=e300]
              - text: Verify
            - button "Reject" [ref=e302] [cursor=pointer]:
              - img [ref=e303]
              - text: Reject
```

# Test source

```ts
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
  178 |   const row = receptionistPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
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
  200 |   const approvedRow = receptionistPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
  201 |   await expect(approvedRow).toHaveCount(1, { timeout: 30000 });
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
> 220 |   await expect(card).toHaveCount(1, { timeout: 45000 });
      |                      ^ Error: expect(locator).toHaveCount(expected) failed
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
  243 |   const scheduledRow = checkinPage.locator("tr.booking-row").filter({ hasText: pet.name }).filter({ hasText: room.room_name });
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
  302 | });
  303 | 
  304 | test("Phase 12.2 room race: concurrent same-room submissions allow only one reservation", async ({ request }) => {
  305 |   const unique = Date.now().toString().slice(-8);
  306 |   const customer = await apiLogin(request, "customer");
  307 |   const receptionist = await apiLogin(request, "receptionist");
  308 |   const template = list(await api(request, receptionist, "get", "/receptionist/boarding-rooms")).find((room) => room.room_type === "dog_standard" && room.is_active && room.customer_selectable);
  309 |   const room = (await api(request, receptionist, "post", "/receptionist/boarding-rooms", {
  310 |     room_code: `P12-${unique}`, room_name: `Phase12 Race ${unique}`, room_type: template.room_type,
  311 |     hotel_category: template.hotel_category, allowed_species: template.allowed_species,
  312 |     max_capacity: 1, total_rooms: 1, daily_rate: template.daily_rate,
  313 |     is_active: true, customer_selectable: true, notes: `PHASE12_RACE_${unique}`,
  314 |   })).room;
  315 |   const petA = await existingPet(request, customer, 0);
  316 |   const petB = await existingPet(request, customer, 1);
  317 |   const date = futureDate(31);
  318 |   const submit = (petId, suffix) => request.post(`${apiUrl}/customer/boardings`, {
  319 |     headers: { Accept: "application/json", Authorization: `Bearer ${customer.token}` },
  320 |     multipart: { pet_id: String(petId), room_id: String(room.id), check_in_date: date, number_of_days: "1", notes: `PHASE12_RACE_${suffix}`,
```