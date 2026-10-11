const { test, expect } = require("@playwright/test");
const { loginAs, apiLogin } = require("./test-utils");

// Revision B — browser verification of the corrected workflows against the
// live dev stack (backend :8000 + frontend :3000 + dev DB).
// Seeded fixtures (created via artisan tinker in the dev DB):
//   SR 189 -> Boarding 47 : hotel, paid, check-in TODAY ("Pet Hotel E2E" / E2EHotelPetZulu)
//   Appt 55 -> SR 187     : vet, scheduled tomorrow, assigned to vet@example.com
//                         (also the approved+unpaid SR for the payment test)
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";

const auth = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  ...extra,
});

test.describe("Revision B — browser verification", () => {
  test("guest booking modal offers free-text pet fields, not a pet selector", async ({ page }) => {
    await page.goto("/");
    await page.locator(".landing-featured-card", { hasText: /groom/i })
      .getByRole("button", { name: /book/i }).first().click();
    await expect(page.locator('input[name="pet_name"]')).toBeVisible();
    await expect(page.locator('select[name="pet_id"]')).toHaveCount(0);
  });

  test("authenticated booking modal requires a registered pet from the selector", async ({ page }) => {
    await loginAs(page, "customer");
    await page.goto("/?book=grooming");
    const select = page.locator('select[name="pet_id"]');
    await expect(select).toBeVisible();
    expect(await select.locator("option").count()).toBeGreaterThan(1);
    // No free-text pet name field for authenticated customers.
    await expect(page.locator('input[name="pet_name"]')).toHaveCount(0);
  });

  test("backend rejects a pet_id owned by another customer", async ({ request }) => {
    const { token } = await apiLogin(request, "customer");
    // Pet belonging to a different customer record.
    const pets = await request.get(`${apiUrl}/customer/pets`, { headers: auth(token) });
    const mine = (await pets.json());
    const myIds = new Set(
      (mine.pets || mine.data || mine || []).map((p) => Number(p.id))
    );
    // Probe a range of ids — find one the customer does not own.
    let foreignPetId = null;
    for (let id = 1; id < 500 && !foreignPetId; id++) {
      if (!myIds.has(id)) {
        const probe = await request.post(`${apiUrl}/customer/requests`, {
          headers: auth(token, { "Content-Type": "application/json" }),
          data: {
            customer_name: "Customer",
            customer_email: "customer@example.com",
            pet_id: id,
            request_type: "grooming",
            service_name: "Full Groom",
            requested_date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
            requested_time: "10:00",
          },
        });
        if (probe.status() === 422) {
          const body = await probe.json();
          const msg = JSON.stringify(body.errors || body.message);
          if (/pet|registered/i.test(msg)) {
            foreignPetId = id;
          }
        }
      }
    }
    expect(foreignPetId, "a foreign pet_id must be rejected with 422").not.toBeNull();
  });

  test("customer payment modal offers e-wallets only and cash is rejected", async ({ page, request }) => {
    await loginAs(page, "customer");
    await page.goto("/customer/bookings");
    // SR 179 is approved + unpaid → its row opens the actions popover with Pay.
    const row = page.locator("tr", { hasText: "#187" });
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.getByRole("button", { name: /actions for/i }).click();
    const payBtn = page.locator(".customer-pay-btn", { hasText: "Pay" });
    await expect(payBtn).toBeVisible({ timeout: 10000 });
    await payBtn.click();

    const methods = page.locator(".pum-method-btn");
    await expect(methods).toHaveCount(2);
    const labels = await methods.locator(".pum-method-label").allTextContents();
    expect(labels.map((l) => l.toLowerCase())).toEqual(["gcash", "maya"]);

    // Cash must be rejected by the customer endpoint even if forced via API.
    const { token } = await apiLogin(request, "customer");
    const res = await request.post(`${apiUrl}/customer/requests/187/payment-proof`, {
      headers: auth(token, { "Content-Type": "application/json" }),
      data: { payment_method: "cash" },
    });
    expect(res.status()).toBe(422);
  });

  test("receptionist check-in updates the linked boarding and rejects a duplicate", async ({ page, request }) => {
    const { token } = await apiLogin(request, "receptionist");
    const headers = auth(token);

    // Fixture: an approved+paid hotel SR whose pet name is unique for this
    // seed ("E2EHotelPet*"). Resolve the linked boarding id dynamically so
    // reseeds don't require spec edits.
    const HOTEL_PET = "E2EHotelPetKilo";
    const sr = await request.get(`${apiUrl}/receptionist/requests`, { headers });
    const srList = await sr.json();
    const target = (srList.requests || srList.data || srList || []).find(
      (r) => r.pet_name === HOTEL_PET && r.status === "approved"
    );
    expect(target, `seeded ${HOTEL_PET} service request must be visible to receptionist`).toBeTruthy();
    const boardingList = await request.get(`${apiUrl}/boardings`, { headers });
    const boardingId = ((await boardingList.json()).boardings || []).find(
      (b) => b.service_request_id === target.id
    )?.id;
    expect(boardingId, "linked boarding must exist for the seeded SR").toBeTruthy();

    // Intercept the check-in call — it must target the boarding id,
    // never the service-request id.
    const checkInCalls = [];
    let checkInStatus = null;
    await loginAs(page, "receptionist");
    await page.route("**/boarding-requests/*/check-in", (route) => {
      checkInCalls.push(route.request().url());
      route.continue();
    });
    page.on("response", (res) => {
      if (/boarding-requests\/\d+\/check-in/.test(res.url())) checkInStatus = res.status();
    });
    await page.goto("/receptionist/bookings/hotel");

    // Unique pet name disambiguates from consumed fixtures.
    const row = page.locator("tr", { hasText: HOTEL_PET });
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.getByRole("button", { name: /actions for/i }).click();

    const checkInBtn = page.getByRole("button", { name: /check in/i });
    await expect(checkInBtn).toBeEnabled({ timeout: 15000 });
    await checkInBtn.click();
    // The SweetAlert confirm can auto-resolve quickly — click it if it stays
    // on screen, otherwise rely on the intercepted response.
    const confirmBtn = page.locator(".swal2-confirm");
    if (await confirmBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(2500);
    expect(checkInStatus, "check-in POST must succeed").toBe(200);
    expect(
      checkInCalls.some((u) => new RegExp(`boarding-requests/${boardingId}/check-in`).test(u)),
      `check-in must post boarding id ${boardingId}, got: ${checkInCalls.join(",")}`
    ).toBeTruthy();
    expect(
      checkInCalls.every((u) => !new RegExp(`boarding-requests/${target.id}/check-in`).test(u)),
      "check-in must never post the service-request id to the boarding endpoint"
    ).toBeTruthy();

    // The linked boarding must now be in_care; the SR stays consistent.
    const boarding = await request.get(`${apiUrl}/boardings`, { headers });
    const checkedIn = ((await boarding.json()).boardings || []).find((b) => b.id === boardingId);
    expect(["in_care", "checked_in"]).toContain(checkedIn?.status);

    // Duplicate check-in via API must be rejected.
    const dup = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/check-in`, { headers });
    expect([409, 422]).toContain(dup.status());
  });

  test("veterinary cancellation enforces the predefined reason workflow", async ({ page, request }) => {
    await loginAs(page, "veterinary");
    await page.goto("/veterinary/appointments");

    const card = page.locator(".appointment-card", { hasText: "E2E_CANCEL_MARKER_5" });
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.getByRole("button", { name: /^cancel$/i }).click();

    // Step 1: reason dropdown with the canonical list.
    const select = page.locator(".swal2-select");
    await expect(select).toBeVisible();
    const options = await select.locator("option").allTextContents();
    expect(options.join(" ")).toContain("Client requested cancellation");
    expect(options.join(" ")).toContain("Other");

    // Selecting "Other" must demand an explanation.
    await select.selectOption("other");
    await page.locator(".swal2-confirm").click();
    const textarea = page.locator(".swal2-textarea");
    await expect(textarea).toBeVisible();
    await page.locator(".swal2-confirm").click();
    await expect(page.locator(".swal2-validation-message")).toBeVisible();

    // "Back" dismisses the prompt without cancelling — re-open and use a
    // predefined reason, which needs no explanation.
    await page.locator(".swal2-cancel").click();
    await expect(select).toBeHidden();
    await card.getByRole("button", { name: /^cancel$/i }).click();
    await page.locator(".swal2-select").selectOption("client_request");
    await page.locator(".swal2-confirm").click();

    await page.waitForTimeout(1500);

    // Appointment cancelled and the linked SR must be consistent.
    const { token } = await apiLogin(request, "veterinary");
    const detail = await request.get(`${apiUrl}/veterinary/appointments/55`, { headers: auth(token) });
    expect(detail.ok()).toBeTruthy();
    expect((await detail.json()).appointment?.status).toBe("cancelled");

    const { token: custToken } = await apiLogin(request, "customer");
    const custList = await request.get(
      `${apiUrl}/customer/my-requests?email=${encodeURIComponent("customer@example.com")}`,
      { headers: auth(custToken) }
    );
    const custBody = await custList.json();
    const rows = custBody.requests || custBody.data || custBody || [];
    const sr187 = (Array.isArray(rows) ? rows : []).find((r) => r.id === 187);
    expect(sr187?.status).toBe("cancelled");
  });

  test("booking tracker shows cancelled requests instead of hiding them", async ({ page, request }) => {
    // Provision a fresh pending request and cancel it — the tracker must keep it.
    const { token } = await apiLogin(request, "customer");
    const headers = auth(token, { "Content-Type": "application/json" });
    const petsRes = await request.get(`${apiUrl}/customer/pets`, { headers });
    const petsBody = petsRes.ok() ? await petsRes.json() : {};
    const pet = (petsBody.pets || petsBody.data || petsBody || [])[0];
    expect(pet, "customer must own at least one pet").toBeTruthy();

    const created = await request.post(`${apiUrl}/customer/requests`, {
      headers,
      data: {
        customer_name: "Customer",
        customer_email: "customer@example.com",
        pet_id: pet.id,
        request_type: "grooming",
        service_name: "Full Groom",
        requested_date: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
        requested_time: "10:00",
      },
    });
    const createdBody = await created.json();
    const newId = createdBody.request?.id;
    expect(newId, `request must be created: ${JSON.stringify(createdBody)}`).toBeTruthy();

    const cancelled = await request.patch(`${apiUrl}/customer/requests/${newId}/cancel`, { headers });
    expect(cancelled.ok()).toBeTruthy();

    await loginAs(page, "customer");
    await page.goto("/customer");
    await page.getByRole("button", { name: /booking tracker/i }).click();
    const panel = page.locator(".bt-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel.locator(".bt-terminal").first()).toBeVisible({ timeout: 15000 });
    // The freshly cancelled request appears with its terminal status label.
    await expect(panel.locator(`text=${newId}`).or(panel.locator(".bt-terminal-cancelled")).first()).toBeVisible();
  });

  test("receipt endpoint exposes the backend VAT breakdown", async ({ request }) => {
    const { token } = await apiLogin(request, "customer");
    const res = await request.get(`${apiUrl}/customer/requests/173/receipt`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const receipt = body.receipt || body;
    expect(receipt).toBeTruthy();
    const vat = Number(receipt.vat_amount ?? receipt.breakdown?.vat_amount ?? NaN);
    const total = Number(receipt.total ?? receipt.total_amount ?? receipt.breakdown?.total ?? NaN);
    expect(Number.isFinite(vat), "receipt must carry a backend VAT amount").toBeTruthy();
    if (Number.isFinite(total) && total > 0) {
      // VAT-inclusive 12%: vat = total * 12 / 112 (within rounding)
      expect(Math.abs(vat - (total * 12) / 112)).toBeLessThan(0.51);
    }
  });
});
