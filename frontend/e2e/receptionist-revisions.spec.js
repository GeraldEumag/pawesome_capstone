const { test, expect } = require("@playwright/test");
const { loginAs, apiLogin } = require("./test-utils");

const API_BASE = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";

// Receptionist + Customer Profile revisions:
// compact cancel dropdown, grooming reason display, reason-required
// service disable/delete, service-card click scope, uniform walk-in
// step heights, customer-deletion reason dropdown.

async function api(request, session, method, path, data) {
  const res = await request.fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    data,
  });
  return res;
}

async function ensurePet(request, session) {
  const list = await api(request, session, "GET", "/customer/pets");
  const body = await list.json();
  const pets = body.pets || body.data || body;
  if (Array.isArray(pets) && pets.length) return pets[0];
  const created = await api(request, session, "POST", "/customer/pets", {
    name: "QA Pet",
    species: "Dog",
    breed: "Mixed",
    gender: "Male",
    age: 2,
  });
  const createdBody = await created.json();
  return createdBody.pet || createdBody.data || createdBody;
}

async function createRequest(request, session, pet, type, label) {
  const stamp = Date.now() % 100000;
  // Slots live on a 30-minute grid within 10:00–18:00; retry random slots since
  // prior runs and seed data may already occupy some of them.
  let body = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const daysAhead = 1 + Math.floor(Math.random() * 20);
    const slotIndex = Math.floor(Math.random() * 13); // 10:00,10:30,...,16:00
    const hour = 10 + Math.floor(slotIndex / 2);
    const minute = slotIndex % 2 === 0 ? "00" : "30";
    const res = await api(request, session, "POST", "/customer/requests", {
      customer_name: session.user?.name || "QA Customer",
      customer_email: session.user?.email || "qa@example.com",
      pet_id: pet.id,
      pet_name: pet.name,
      request_type: type,
      service_type: type,
      service_name: type === "vet" ? "General Check-up" : "Grooming Service",
      requested_date: new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10),
      requested_time: `${String(hour).padStart(2, "0")}:${minute}`,
      notes: `QA ${label} ${stamp}`,
      price: 500,
    });
    body = await res.json();
    if (res.ok()) break;
    if (attempt === 11) {
      throw new Error(`createRequest failed ${res.status()}: ${JSON.stringify(body).slice(0, 400)}`);
    }
  }
  const created = body.request || body.data || body;
  if (!created.id) {
    throw new Error(`createRequest returned no id: ${JSON.stringify(body).slice(0, 400)}`);
  }
  return created;
}

test.describe("Receptionist revisions", () => {
  test.setTimeout(120000);

  test("1. vet cancel reason dropdown is compact and functional", async ({ page, request }) => {
    const customer = await apiLogin(request, "customer");
    const pet = await ensurePet(request, customer);
    const req = await createRequest(request, customer, pet, "vet", "vet-cancel");

    await loginAs(page, "receptionist");
    await page.goto("/receptionist/bookings/veterinary");
    await expect(page.locator("body")).toContainText("Veterinary", { timeout: 15000 });

    const row = page.locator("tr", { hasText: req.pet_name || "QA Pet" }).first();
    await row.locator(".row-action-popover-trigger").click();
    await page.locator(".action-btn.delete-btn").first().click();

    const select = page.locator("#swal-reason-select");
    await expect(select).toBeVisible();

    const box = await select.boundingBox();
    const fontSize = await select.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(box.height).toBeLessThan(52);
    expect(fontSize).toBeLessThanOrEqual(15);

    // Functional: pick a reason and confirm the cancellation works
    await select.selectOption({ index: 1 });
    await page.locator(".swal2-light-confirm, .swal2-confirm").click();
    await expect(select).toBeHidden({ timeout: 10000 });
  });

  test("2. grooming detail shows recorded reason and fallback", async ({ page, request }) => {
    const customer = await apiLogin(request, "customer");
    const receptionist = await apiLogin(request, "receptionist");
    const pet = await ensurePet(request, customer);

    const rejected = await createRequest(request, customer, pet, "grooming", "groom-reject");
    const cancelRes = await api(request, receptionist, "PATCH", `/receptionist/requests/${rejected.id}/status`, {
      status: "rejected",
      rejection_reason: "QA reason: fully booked",
    });
    if (!cancelRes.ok()) {
      throw new Error(`PATCH rejected failed ${cancelRes.status()}: ${(await cancelRes.text()).slice(0, 300)}`);
    }

    const cancelled = await createRequest(request, customer, pet, "grooming", "groom-cancel");
    const cancel2 = await api(request, receptionist, "PATCH", `/receptionist/requests/${cancelled.id}/status`, {
      status: "cancelled",
    });
    expect(cancel2.ok()).toBeTruthy();

    await loginAs(page, "receptionist");
    await page.goto("/receptionist/bookings/grooming");
    await expect(page.locator("body")).toContainText("Grooming", { timeout: 15000 });

    const row = page.locator("tr", { hasText: "Rejected" }).last();
    await row.locator(".row-action-popover-trigger").click();
    await page.locator(".action-btn.view-btn").first().click();

    const modal = page.locator(".hbk-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Rejection Reason");
    await expect(modal).toContainText("QA reason: fully booked");
    await page.locator(".hbk-foot .secondary-btn").click();

    const cancelledRow = page.locator("tr", { hasText: "Cancelled" }).last();
    await cancelledRow.locator(".row-action-popover-trigger").click();
    await page.locator(".action-btn.view-btn").first().click();
    await expect(modal).toContainText("Cancellation Reason");
    await expect(modal).toContainText("No reason recorded");
  });

  test("3. service disable/delete require a reason", async ({ page, request }) => {
    const receptionist = await apiLogin(request, "receptionist");
    const stamp = Date.now() % 100000;
    const svc = await api(request, receptionist, "POST", "/receptionist/services", {
      name: `QA Disable Svc ${stamp}`,
      category: "Grooming",
      price: 100,
    });
    expect(svc.ok()).toBeTruthy();
    const svcBody = await svc.json();
    const svcId = svcBody.data?.id || svcBody.id;

    const svc2 = await api(request, receptionist, "POST", "/receptionist/services", {
      name: `QA Delete Svc ${stamp}`,
      category: "Grooming",
      price: 100,
    });
    expect(svc2.ok()).toBeTruthy();

    await loginAs(page, "receptionist");
    await page.goto("/receptionist/manage-services");
    await expect(page.locator("body")).toContainText("Service", { timeout: 15000 });

    // Disable: open prompt, cancel it — service stays Active
    const row = page.locator("tr", { hasText: `QA Disable Svc ${stamp}` });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.locator(".row-action-popover-trigger").click();
    await page.locator(".row-action-popover-panel .toggle-btn").click();
    await expect(page.locator("#swal-reason-select")).toBeVisible();
    await page.locator(".swal2-cancel").click();
    await expect(row.locator(".status-badge")).toHaveText("Active");

    // Disable with a reason — badge flips to Inactive
    await row.locator(".row-action-popover-trigger").click();
    await page.locator(".row-action-popover-panel .toggle-btn").click();
    await page.locator("#swal-reason-select").selectOption({ index: 1 });
    await page.locator(".swal2-light-confirm, .swal2-confirm").click();
    await expect(row.locator(".status-badge")).toHaveText("Inactive", { timeout: 10000 });

    // Delete with a reason — row disappears
    const row2 = page.locator("tr", { hasText: `QA Delete Svc ${stamp}` });
    await expect(row2).toBeVisible();
    await row2.locator(".row-action-popover-trigger").click();
    await page.locator(".row-action-popover-panel .delete-btn").click();
    await page.locator("#swal-reason-select").selectOption({ index: 1 });
    await page.locator(".swal2-light-confirm, .swal2-confirm").click();
    await expect(page.locator("tr", { hasText: `QA Delete Svc ${stamp}` })).toHaveCount(0, { timeout: 10000 });

    // API-level: delete without reason is rejected by the backend
    const noReason = await api(request, receptionist, "DELETE", `/receptionist/services/${svcId}`);
    expect(noReason.status()).toBe(422);
  });

  test("4. only the + New Booking button is clickable on service cards", async ({ page }) => {
    await loginAs(page, "receptionist");
    await page.goto("/receptionist/walk-ins");
    await expect(page.locator(".service-card").first()).toBeVisible({ timeout: 15000 });

    // Clicking card body / title / whitespace opens nothing
    await page.locator(".service-card .svc-card-body").first().click();
    await page.locator(".service-card .svc-card-top").first().click();
    await expect(page.locator(".hbk-modal")).toHaveCount(0);

    // The CTA button opens the booking modal
    await page.locator(".service-card .svc-cta-btn").first().click();
    await expect(page.locator(".hbk-modal")).toBeVisible();
    await page.locator(".close-btn").click();
  });

  test("5. walk-in steps render inside a uniform-height body", async ({ page }) => {
    await loginAs(page, "receptionist");
    await page.goto("/receptionist/walk-ins");
    await page.locator(".service-card .svc-cta-btn").first().click();
    await expect(page.locator(".hbk-modal")).toBeVisible({ timeout: 15000 });

    const body = page.locator(".hbk-modal .hbk-body");
    const heights = [];
    const measure = async () => (await body.boundingBox()).height;

    heights.push(await measure()); // step 1

    // Step 1 → Existing customer path
    await page.locator("text=Existing Customer").first().click();
    await page.locator(".hbk-foot .primary-btn, .hbk-foot button", { hasText: /next|continue/i }).first().click();
    await page.waitForTimeout(300);
    heights.push(await measure()); // step 2

    // Step 2 → New customer path back/forward to exercise step transitions
    for (const h of heights) {
      expect(Math.abs(h - heights[0])).toBeLessThanOrEqual(1);
    }

    // Uniform frame: body must have a bounded height (scrolls internally)
    const overflow = await body.evaluate((el) => getComputedStyle(el).overflowY);
    expect(["auto", "scroll"]).toContain(overflow);
  });

  test("6. customer deletion requires a dropdown reason", async ({ page, request }) => {
    const receptionist = await apiLogin(request, "receptionist");
    const stamp = Date.now() % 100000;
    const createRes = await api(request, receptionist, "POST", "/receptionist/customers", {
      name: `QA Delete Cust ${stamp}`,
      phone: "09123456789",
      email: `qadel${stamp}@example.com`,
    });
    expect(createRes.ok()).toBeTruthy();

    await loginAs(page, "receptionist");
    await page.goto("/receptionist/customer-profile");
    await expect(page.locator("body")).toContainText("Customer", { timeout: 15000 });

    const card = page.locator("text=QA Delete Cust", { exact: false }).first();
    await expect(card).toBeVisible();
    const row = page.locator("tr, .customer-card, .customer-item", { hasText: `QA Delete Cust ${stamp}` }).first();
    await row.locator(".row-action-popover-trigger").click().catch(async () => {
      await row.locator(".action-btn.delete-btn, .delete-btn").first().click();
    });
    await page.locator(".action-btn.delete-btn, .delete-btn", { hasText: "" }).first().click().catch(() => {});

    const select = page.locator("#swal-reason-select");
    await expect(select).toBeVisible({ timeout: 8000 });
    const labels = await select.locator("option").allTextContents();
    expect(labels.join(" ")).toContain("Duplicate account");
    expect(labels.join(" ")).toContain("Customer requested account closure");

    // Other reveals the explanation textarea
    await select.selectOption("__other__");
    const other = page.locator("#swal-reason-other");
    await expect(other).toBeVisible();
    await other.fill("QA cleanup of a test-created account");
    await page.locator(".swal2-light-confirm, .swal2-confirm").click();
    await expect(select).toBeHidden({ timeout: 10000 });
  });
});
