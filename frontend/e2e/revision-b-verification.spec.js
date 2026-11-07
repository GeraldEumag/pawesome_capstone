const { test, expect } = require("@playwright/test");
const { loginAs, apiLogin } = require("./test-utils");

// Revision B — browser verification of the corrected workflows against the
// live dev stack (backend :8000 + frontend :3000 + dev DB).
// Seeded fixtures (created via artisan tinker in the dev DB):
//   SR 195 -> Boarding 49 : hotel, paid, check-in TODAY ("Pet Hotel E2E" / E2EHotelPetRomeo)
//   Appt 58 -> SR 196     : vet, scheduled tomorrow, assigned to vet@example.com
//                         (also the approved+unpaid SR for the payment test)
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";

const auth = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  ...extra,
});

test.describe("Revision B — browser verification", () => {
  test("guest booking modal requires sign-in — no free-text pet fields or pet selector", async ({ page, request }) => {
    await page.goto("/");
    await page.locator(".landing-featured-card", { hasText: /groom/i })
      .getByRole("button", { name: /book/i }).first().click();
    // Hardened contract: pet identity is authoritative (pet_id required
    // server-side), so guests get no free-text pet fields and no selector —
    // only a sign-in prompt.
    await expect(page.locator('input[name="pet_name"]')).toHaveCount(0);
    await expect(page.locator('select[name="pet_id"]')).toHaveCount(0);
    await expect(page.locator('input[disabled]')).toHaveValue(/sign in to select your registered pet/i);
    // Backend enforcement: a request without a pet_id is never created.
    const res = await request.post(`${apiUrl}/customer/requests`, {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      data: {
        customer_name: "Guest",
        customer_email: "guest@example.com",
        pet_name: "Free Text",
        request_type: "grooming",
        service_name: "Full Groom",
        requested_date: "2099-01-01",
        requested_time: "10:00",
      },
    });
    expect(res.ok()).toBeFalsy();
  });

  test("authenticated booking modal requires a registered pet from the selector", async ({ page, request }) => {
    const customer = await apiLogin(request, "customer");
    const petName = `E2E Selector Pet ${Date.now()}`;
    const petRes = await request.post(`${apiUrl}/pets`, {
      headers: auth(customer.token),
      data: { name: petName, species: "Dog" },
    });
    expect(petRes.ok(), await petRes.text()).toBeTruthy();
    await loginAs(page, "customer");
    await page.goto("/?book=grooming");
    const select = page.locator('select[name="pet_id"]');
    await expect(select).toBeVisible();
    // Options populate asynchronously once the customer's pets load.
    await expect.poll(async () => select.locator("option").count(), { timeout: 30000 }).toBeGreaterThan(1);
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
    const customer = await apiLogin(request, "customer");
    const petName = `E2E Pay Pet ${Date.now()}`;
    const petRes = await request.post(`${apiUrl}/pets`, { headers: auth(customer.token), data: { name: petName, species: "Dog" } });
    const pet = (await petRes.json()).pet || (await petRes.json());
    let srRes;
    let lastBody = "";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const date = new Date(Date.now() + (90 + attempt) * 86400000).toISOString().slice(0, 10);
      const slot = `${String(10 + (attempt % 8)).padStart(2, "0")}:00`;
      srRes = await request.post(`${apiUrl}/customer/requests`, {
        headers: auth(customer.token, { "Content-Type": "application/json" }),
        data: {
          customer_name: customer.user.name, customer_email: customer.user.email,
          pet_id: pet.id, pet_name: petName, request_type: "grooming", service_type: "grooming",
          service_name: "Standard Grooming", request_date: date, request_time: slot,
          requested_date: date, requested_time: slot,
        },
      });
      if (srRes.ok()) break;
      lastBody = await srRes.text();
      if (!lastBody.includes("overlaps") && !lastBody.includes("no longer available")) break;
    }
    expect(srRes.ok(), lastBody).toBeTruthy();
    const srId = ((await srRes.json()).request || {}).id;
    const receptionist = await apiLogin(request, "receptionist");
    await request.post(`${apiUrl}/receptionist/requests/${srId}/approve`, { headers: auth(receptionist.token) });

    await loginAs(page, "customer");
    await page.goto("/customer/bookings?range=all&tab=all");
    const row = page.locator("tr", { hasText: petName });
    await expect(row).toBeVisible({ timeout: 20000 });
    const payNow = row.getByRole("button", { name: /pay now/i });
    if (await payNow.count()) {
      await payNow.first().click();
    } else {
      await row.getByRole("button", { name: /actions for/i }).click();
      await page.locator(".customer-pay-btn", { hasText: "Pay" }).click();
    }

    const methods = page.locator(".pum-method-btn");
    await expect(methods).toHaveCount(2);
    const labels = await methods.locator(".pum-method-label").allTextContents();
    expect(labels.map((l) => l.toLowerCase())).toEqual(["gcash", "maya"]);

    // Cash must be rejected by the customer endpoint even if forced via API.
    const res = await request.post(`${apiUrl}/customer/requests/${srId}/payment-proof`, {
      headers: auth(customer.token, { "Content-Type": "application/json" }),
      data: { payment_method: "cash" },
    });
    expect(res.status()).toBe(422);
  });

  test("receptionist check-in updates the linked boarding and rejects a duplicate", async ({ page, request }) => {
    test.setTimeout(120000);
    // Same-day hotel bookings close at 18:00, so this same-day check-in fixture cannot be created later in the day.
    test.skip(new Date().getHours() >= 18, "Same-day hotel bookings close at 18:00; run before then for this check-in fixture");
    const { token } = await apiLogin(request, "receptionist");
    const headers = auth(token);

    // Fixture created per run: a dog pet with a hotel boarding for today,
    // vaccination verified and approved, so the check-in target is ours.
    // The app timezone is UTC and Carbon::isToday() compares against it, so use the UTC date.
    const today = new Date().toISOString().slice(0, 10);
    const customer = await apiLogin(request, "customer");
    // Earlier runs leave checked-in fixtures that hold today's rooms; check them out first.
    const staleList = await request.get(`${apiUrl}/boardings?per_page=500`, { headers });
    for (const b of (await staleList.json()).boardings || []) {
      if (String(b.pet_name || "").startsWith("E2E Checkin Pet") && b.status === "in_care") {
        await request.post(`${apiUrl}/receptionist/boarding-requests/${b.id}/check-out`, { headers });
      }
    }
    let room = null;
    let species = null;
    for (const candidate of ["Dog", "Cat"]) {
      const roomsRes = await request.get(
        `${apiUrl}/boarding/rooms/available?species=${candidate.toLowerCase()}&check_in_date=${today}&check_out_date=${today}`,
        { headers: auth(token) }
      );
      const found = ((await roomsRes.json()).rooms || []).find((item) => item.available && /^\d+$/.test(String(item.id)));
      if (found) {
        room = found;
        species = candidate;
        break;
      }
    }
    expect(room, "a selectable hotel room must be available today").toBeTruthy();

    const HOTEL_PET = `E2E Checkin Pet ${Date.now()}`;
    const petRes = await request.post(`${apiUrl}/pets`, {
      headers: auth(customer.token),
      data: { name: HOTEL_PET, species },
    });
    const petBody = await petRes.json();
    expect(petRes.ok(), JSON.stringify(petBody)).toBeTruthy();
    const pet = petBody.pet || petBody;

    const boardingRes = await request.post(`${apiUrl}/customer/boardings`, {
      headers: auth(customer.token),
      multipart: {
        pet_id: String(pet.id),
        room_id: String(room.id),
        check_in_date: today,
        number_of_days: "1",
        notes: "Revision B check-in fixture",
        vaccination_card: {
          name: "checkin-vaccination.png",
          mimeType: "image/png",
          buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
        },
      },
    });
    const boardingBody = await boardingRes.json();
    expect(boardingRes.status(), JSON.stringify(boardingBody)).toBe(201);
    const boardingId = boardingBody.boarding?.id;
    const srId = boardingBody.boarding?.service_request_id ?? boardingBody.service_request_id;
    expect(boardingId, "boarding fixture created").toBeTruthy();
    await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/verify-vaccination`, { headers });
    const approveRes = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/approve`, { headers });
    expect(approveRes.ok(), await approveRes.text()).toBeTruthy();

    const reference = `RB-CHECKIN-${Date.now()}`;
    const proofRes = await request.post(`${apiUrl}/customer/boarding-requests/${boardingId}/payment-proof`, {
      headers: auth(customer.token),
      multipart: {
        payment_method: "gcash",
        payment_reference: reference,
        payment_proof: {
          name: "checkin-proof.png",
          mimeType: "image/png",
          buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
        },
      },
    });
    expect(proofRes.ok(), await proofRes.text()).toBeTruthy();
    const cashier = await apiLogin(request, "cashier");
    const verifyRes = await request.post(`${apiUrl}/cashier/payment-requests/${boardingId}/verify`, {
      headers: auth(cashier.token),
      data: { type: "boarding", reference_number: reference, cashier_remarks: "Revision B check-in fixture" },
    });
    expect(verifyRes.ok(), await verifyRes.text()).toBeTruthy();
    const target = { id: srId };

    // Intercept the check-in call — it must target the boarding id,
    // never the service-request id.
    const checkInCalls = [];
    let checkInStatus = null;
    await loginAs(page, "receptionist");
    const checkInResponses = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && /boarding-requests\/\d+\/check-in/.test(req.url())) checkInCalls.push(req.url());
    });
    page.on("response", async (res) => {
      if (/boarding-requests\/\d+\/check-in/.test(res.url())) checkInResponses.push(`${res.status()} ${(await res.text().catch(() => "")).slice(0, 160)}`);
    });
    page.on("response", (res) => {
      if (/boarding-requests\/\d+\/check-in/.test(res.url())) checkInStatus = res.status();
    });
    await page.goto("/receptionist/bookings/hotel?range=all&tab=all");

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
    if (await confirmBtn.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)) {
      await confirmBtn.click();
    }

    await expect.poll(() => checkInCalls.length, { timeout: 20000 }).toBeGreaterThan(0);
    let lastStatus;
    await expect.poll(async () => {
      const list = await request.get(`${apiUrl}/boardings?per_page=500`, { headers });
      lastStatus = ((await list.json()).boardings || []).find((b) => b.id === boardingId)?.status;
      return lastStatus;
    }, { timeout: 60000, message: `boarding ${boardingId} status; calls=${checkInCalls.join(",")}; responses=${checkInResponses.join(" | ")}` }).toBe("in_care");
    expect(
      checkInCalls.some((u) => new RegExp(`boarding-requests/${boardingId}/check-in`).test(u)),
      `check-in must post boarding id ${boardingId}, got: ${checkInCalls.join(",")}`
    ).toBeTruthy();
    expect(
      checkInCalls.every((u) => !new RegExp(`boarding-requests/${target.id}/check-in`).test(u)),
      "check-in must never post the service-request id to the boarding endpoint"
    ).toBeTruthy();

    // The linked boarding must now be in_care; the SR stays consistent.

    // Duplicate check-in via API must be rejected.
    const dup = await request.post(`${apiUrl}/receptionist/boarding-requests/${boardingId}/check-in`, { headers });
    expect([409, 422]).toContain(dup.status());
  });

  test("veterinary cancellation enforces the predefined reason workflow", async ({ page, request }) => {
    test.setTimeout(120000);
    const marker = `E2E_CANCEL_${Date.now()}`;
    const customer = await apiLogin(request, "customer");
    const receptionist = await apiLogin(request, "receptionist");
    const headers = auth(receptionist.token);

    const petRes = await request.post(`${apiUrl}/pets`, {
      headers: auth(customer.token),
      data: { name: marker, species: "Dog" },
    });
    const petBody = await petRes.json();
    expect(petRes.ok(), JSON.stringify(petBody)).toBeTruthy();
    const pet = petBody.pet || petBody;

    const vetsRes = await request.get(`${apiUrl}/receptionist/veterinarians/available`, { headers });
    const vets = (await vetsRes.json()).veterinarians || (await vetsRes.json()) || [];
    const vet = vets.find((v) => v.email === "vet@example.com") || vets[0];
    expect(vet, "a veterinarian must be available").toBeTruthy();

    let srRes;
    let lastBody = "";
    let apptDate;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      apptDate = new Date(Date.now() + (2 + attempt) * 86400000).toISOString().slice(0, 10);
      const slot = `${String(10 + (attempt % 8)).padStart(2, "0")}:00`;
      srRes = await request.post(`${apiUrl}/customer/requests`, {
        headers: auth(customer.token, { "Content-Type": "application/json" }),
        data: {
          customer_name: customer.user.name, customer_email: customer.user.email,
          pet_id: pet.id, pet_name: marker, request_type: "veterinary", service_type: "veterinary",
          service_name: "Consultation", request_date: apptDate, request_time: slot,
          requested_date: apptDate, requested_time: slot, notes: marker,
        },
      });
      if (srRes.ok()) break;
      lastBody = await srRes.text();
      if (!lastBody.includes("overlaps") && !lastBody.includes("no longer available") && !lastBody.includes("conflict")) break;
    }
    expect(srRes.ok(), lastBody).toBeTruthy();
    const srId = ((await srRes.json()).request || {}).id;

    const approveRes = await request.post(`${apiUrl}/receptionist/requests/${srId}/approve`, {
      headers: auth(receptionist.token, { "Content-Type": "application/json" }),
      data: { veterinarian_id: Number(vet.id), request_date: apptDate, request_time: "10:00" },
    });
    expect(approveRes.ok(), await approveRes.text()).toBeTruthy();
    const approveBody = await approveRes.json();
    const appointmentId = approveBody.appointment?.id || approveBody.appointment_id;
    expect(appointmentId, "approval must return the linked appointment id").toBeTruthy();

    await loginAs(page, "veterinary");
    await page.goto("/veterinary/appointments");

    const row = page.locator("tr", { hasText: marker });
    await expect(row).toBeVisible({ timeout: 20000 });
    const openCancel = async () => {
      await row.getByRole("button", { name: /actions for/i }).click();
      await page.getByRole("button", { name: /^cancel$/i }).click();
    };
    await openCancel();

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
    await openCancel();
    await page.locator(".swal2-select").selectOption("client_request");
    await page.locator(".swal2-confirm").click();

    await page.waitForTimeout(1500);

    // Appointment cancelled and the linked SR must be consistent.
    const { token } = await apiLogin(request, "veterinary");
    const detail = await request.get(`${apiUrl}/veterinary/appointments/${appointmentId}`, { headers: auth(token) });
    expect(detail.ok()).toBeTruthy();
    expect((await detail.json()).appointment?.status).toBe("cancelled");

  });

test("booking tracker shows cancelled requests instead of hiding them", async ({ page, request }) => {
    // Provision a fresh pending request and cancel it — the tracker must keep it.
    const { token } = await apiLogin(request, "customer");
    const headers = auth(token, { "Content-Type": "application/json" });
    const markerPet = `E2E Tracker Pet ${Date.now()}`;
    const petRes = await request.post(`${apiUrl}/pets`, {
      headers,
      data: { name: markerPet, species: "Dog" },
    });
    const pet = (await petRes.json()).pet || (await petRes.json());
    expect(pet.id, "tracker pet must be created").toBeTruthy();

    // Grooming slots are shared across customers — earlier runs may hold one,
    // so probe a small set of candidate slots until one is accepted.
    let createdBody;
    const candidates = Array.from({ length: 60 }, (_, i) => [3 + i, i % 2 === 0 ? "10:00" : "14:00"]);
    for (const [days, time] of candidates) {
      const created = await request.post(`${apiUrl}/customer/requests`, {
        headers,
        data: {
          customer_name: "Customer",
          customer_email: "customer@example.com",
          pet_id: pet.id,
          request_type: "grooming",
          service_name: "Full Groom",
          requested_date: new Date(Date.now() + 86400000 * days).toISOString().slice(0, 10),
          requested_time: time,
        },
      });
      if (created.ok()) {
        createdBody = await created.json();
        break;
      }
    }
    const newId = createdBody?.request?.id;
    expect(newId, `request must be created: ${JSON.stringify(createdBody)}`).toBeTruthy();

    const cancelled = await request.patch(`${apiUrl}/customer/requests/${newId}/cancel`, { headers });
    expect(cancelled.ok()).toBeTruthy();

    await loginAs(page, "customer");
    await page.goto("/customer");
    await page.getByRole("button", { name: /booking tracker/i }).click();
    const panel = page.locator(".bt-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    // A cancelled request with an unpaid balance groups under "To Pay" (payment
    // status groups before status); the All tab would show it otherwise.
    for (const tabName of [/^to pay/i, /^all/i]) {
      await panel.getByRole("tab", { name: tabName }).click();
      if (await panel.locator(".bt-card", { hasText: markerPet }).count()) break;
    }
    // The freshly cancelled request appears as a card with a cancelled badge.
    const card = panel.locator(".bt-card", { hasText: markerPet });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.locator(".bt-status-cancelled").or(card.locator(".bt-status-canceled"))).toBeVisible();
  });

  test("receipt endpoint exposes the backend VAT breakdown", async ({ request }) => {
    test.setTimeout(120000);
    const customer = await apiLogin(request, "customer");
    const receptionist = await apiLogin(request, "receptionist");
    const cashier = await apiLogin(request, "cashier");

    const petRes = await request.post(`${apiUrl}/pets`, {
      headers: auth(customer.token),
      data: { name: `E2E VAT Pet ${Date.now()}`, species: "Dog" },
    });
    const pet = (await petRes.json()).pet || (await petRes.json());

    let srRes;
    let lastBody = "";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const date = new Date(Date.now() + (120 + attempt) * 86400000).toISOString().slice(0, 10);
      const slot = `${String(10 + (attempt % 8)).padStart(2, "0")}:00`;
      srRes = await request.post(`${apiUrl}/customer/requests`, {
        headers: auth(customer.token, { "Content-Type": "application/json" }),
        data: {
          customer_name: customer.user.name, customer_email: customer.user.email,
          pet_id: pet.id, pet_name: pet.name, request_type: "grooming", service_type: "grooming",
          service_name: "Standard Grooming", request_date: date, request_time: slot,
          requested_date: date, requested_time: slot,
        },
      });
      if (srRes.ok()) break;
      lastBody = await srRes.text();
      if (!lastBody.includes("overlaps") && !lastBody.includes("no longer available")) break;
    }
    expect(srRes.ok(), lastBody).toBeTruthy();
    const srId = ((await srRes.json()).request || {}).id;

    const approveRes = await request.post(`${apiUrl}/receptionist/requests/${srId}/approve`, { headers: auth(receptionist.token) });
    expect(approveRes.ok(), await approveRes.text()).toBeTruthy();

    const reference = `RB-VAT-${Date.now()}`;
    const proofRes = await request.post(`${apiUrl}/customer/requests/${srId}/payment-proof`, {
      headers: auth(customer.token),
      multipart: {
        payment_method: "gcash",
        payment_reference: reference,
        payment_proof: {
          name: "vat-proof.png",
          mimeType: "image/png",
          buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
        },
      },
    });
    expect(proofRes.ok(), await proofRes.text()).toBeTruthy();
    const verifyRes = await request.post(`${apiUrl}/cashier/payment-requests/${srId}/verify`, {
      headers: auth(cashier.token, { "Content-Type": "application/json" }),
      data: { type: "service_request", reference_number: reference, cashier_remarks: "Revision B VAT fixture" },
    });
    expect(verifyRes.ok(), await verifyRes.text()).toBeTruthy();

    const res = await request.get(`${apiUrl}/customer/requests/${srId}/receipt`, { headers: auth(customer.token) });
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
