# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase12-native-ui-workflows.spec.js >> Phase 12.1 customer booking, approval, and cashier verification are native UI submissions
- Location: e2e\phase12-native-ui-workflows.spec.js:87:1

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator:  locator('.pw-modal .pa-btn-verify')
Expected: enabled
Received: disabled
Timeout:  90000ms

Call log:
  - Expect "toBeEnabled" with timeout 90000ms
  - waiting for locator('.pw-modal .pa-btn-verify')
    93 × locator resolved to <button disabled class="pa-btn-verify" title="The receipt scan reported blocking issues — reject or resolve them first">…</button>
       - unexpected value "disabled"

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
      - button "Payment Approvals 3" [ref=e60] [cursor=pointer]:
        - img [ref=e61]
        - generic [ref=e63]: Payment Approvals
        - generic [ref=e64]: "3"
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
              - generic [ref=e83]: "3"
              - generic [ref=e84]: Pending
          - generic [ref=e85]:
            - img [ref=e87]
            - generic [ref=e89]:
              - generic [ref=e90]: ₱1,500
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
            - generic [ref=e124]: 3 results
            - generic [ref=e125]: Updated 08:00 PM
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
                - generic [ref=e199]: 11:59 AM
            - generic [ref=e200]:
              - generic [ref=e201]:
                - img [ref=e203]
                - generic [ref=e205]:
                  - generic [ref=e206]: grooming
                  - generic [ref=e207]: Basic Bath and Blow Dry Medium Breed
              - generic [ref=e208]:
                - generic [ref=e209]: ₱500
                - generic [ref=e210]:
                  - text: "Customer ref:"
                  - code [ref=e211]: P12-39125594
                - generic [ref=e212]:
                  - img [ref=e213]
                  - text: Needs review
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
  - dialog "Verify GCash Payment" [ref=e226]:
    - generic [ref=e227]:
      - img [ref=e229]
      - generic [ref=e231]:
        - heading "Verify GCash Payment" [level=2] [ref=e232]
        - paragraph [ref=e233]: CUSTOMER — Basic Bath and Blow Dry Medium Breed
      - button "Close Verify GCash Payment dialog" [ref=e234] [cursor=pointer]:
        - img [ref=e235]
    - generic [ref=e238]:
      - img "Payment proof" [ref=e240]
      - generic [ref=e241]:
        - generic [ref=e242]:
          - strong [ref=e243]: Receipt scan
          - generic [ref=e244]: Needs review
          - button "Re-read" [ref=e245] [cursor=pointer]:
            - img [ref=e246]
            - text: Re-read
        - list [ref=e248]:
          - listitem [ref=e249]:
            - img [ref=e250]
            - text: This exact image was already used on a confirmed payment.
      - generic [ref=e252]:
        - generic [ref=e253]:
          - generic [ref=e254]: Customer-submitted reference
          - strong [ref=e255]: P12-39125594
        - generic [ref=e256]:
          - strong [ref=e257]: GCash Reference Number
          - generic [ref=e258]: Pre-filled from scan — correct if needed
        - textbox "GCash Reference Number Pre-filled from scan — correct if needed" [active] [ref=e259]:
          - /placeholder: Enter GCash reference number
          - text: P12-39125594
      - generic [ref=e260]:
        - generic [ref=e261]:
          - strong [ref=e262]: Cashier Note
          - generic [ref=e263]: Optional
        - textbox "Cashier Note Optional" [ref=e264]:
          - /placeholder: Note for this payment (optional)
    - generic [ref=e265]:
      - button "Reject" [ref=e266] [cursor=pointer]:
        - img [ref=e267]
        - text: Reject
      - button "Verify Payment" [disabled] [ref=e269]:
        - img [ref=e270]
        - text: Verify Payment
```

# Test source

```ts
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
  175 |   if (await confirmButton.isVisible({ timeout: 10000 }).catch(() => false)) await confirmButton.click();
  176 |   const approveResponse = await approveResponsePromise;
  177 |   expect(approveResponse.status(), await approveResponse.text()).toBe(200);
  178 |   screenshots.push(await shot(receptionistPage, "03-receptionist-approved"));
  179 |   await receptionistView.context.close();
  180 | 
  181 |   // Cashier: find the proof by reference and verify it through Payment Approvals.
  182 |   const cashierView = await openAs(browser, cashier, "/cashier/payment-verification", network, consoleLog);
  183 |   const cashierPage = cashierView.page;
  184 |   const paymentCard = cashierPage.locator(".pa-card").filter({ hasText: reference });
  185 |   await expect(paymentCard).toHaveCount(1, { timeout: 45000 });
  186 |   screenshots.push(await shot(cashierPage, "04-cashier-pending-card"));
  187 |   await paymentCard.locator(".pa-btn-verify").click();
  188 |   await expect(cashierPage.locator("#paRefNum")).toBeVisible({ timeout: 30000 });
  189 |   await cashierPage.locator("#paRefNum").fill(reference);
  190 |   const verifyButton = cashierPage.locator(".pw-modal .pa-btn-verify");
> 191 |   await expect(verifyButton).toBeEnabled({ timeout: 90000 });
      |                              ^ Error: expect(locator).toBeEnabled() failed
  192 |   screenshots.push(await shot(cashierPage, "05-cashier-verify-modal"));
  193 |   const verifyResponsePromise = cashierPage.waitForResponse((response) => {
  194 |     const pathname = new URL(response.url()).pathname;
  195 |     return (pathname === `/api/cashier/payment-requests/${requestId}/verify` || /^\/api\/cashier\/receipts\/\d+\/confirm$/.test(pathname)) && response.request().method() === "POST";
  196 |   });
  197 |   await verifyButton.click();
  198 |   const cashierConfirm = cashierPage.locator(".swal2-confirm");
  199 |   if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  200 |   const verifyResponse = await verifyResponsePromise;
  201 |   expect([200, 201], await verifyResponse.text()).toContain(verifyResponse.status());
  202 |   const verifyBody = await verifyResponse.json();
  203 |   if (await cashierConfirm.isVisible({ timeout: 10000 }).catch(() => false)) await cashierConfirm.click();
  204 |   await expect(cashierPage.locator(".pa-receipt-modal")).toBeVisible({ timeout: 30000 });
  205 |   screenshots.push(await shot(cashierPage, "06-cashier-receipt"));
  206 |   await cashierView.context.close();
  207 | 
  208 |   const db = dbRequest(requestId);
  209 |   const workflow = {
  210 |     requestId,
  211 |     petId: pet.id,
  212 |     service: service.name,
  213 |     date: slot.date,
  214 |     time: slot.time,
  215 |     reference,
  216 |     notes,
  217 |     upload: { status: uploadResponse.status(), body: uploadBody },
  218 |     approveStatus: approveResponse.status(),
  219 |     verify: { status: verifyResponse.status(), body: verifyBody },
  220 |     negativeChecks,
  221 |     database: db,
  222 |     screenshots,
  223 |     network,
  224 |     console: consoleLog,
  225 |   };
  226 |   fs.mkdirSync(evidenceDir, { recursive: true });
  227 |   fs.writeFileSync(path.join(evidenceDir, "customer-booking-payment-evidence.json"), JSON.stringify(workflow, null, 2));
  228 | 
  229 |   expect(db.request.status).toBe("approved");
  230 |   expect(db.request.payment_status).toBe("paid");
  231 |   expect(db.request.booking_channel).toBe("online");
  232 |   expect(db.request.payment_reference || verifyBody.reference_number || reference).toBeTruthy();
  233 |   expect(db.request.receipt_number || verifyBody.receipt_number).toBeTruthy();
  234 |   expect(db.request.verified_by).toBe(cashier.user.id);
  235 |   expect(db.receipts.length).toBeGreaterThan(0);
  236 |   expect(consoleLog.filter((entry) => entry.type === "error")).toEqual([]);
  237 | });
  238 | 
```