// A booking made for a later date must be reachable from the receptionist
// booking pages: the default TODAY view shows an "on later dates" link that
// opens the UPCOMING window, where the booking is listed.
const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./test-utils");

const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;

test("a grooming booking on a later date is reachable from receptionist grooming", async ({ browser, request }) => {
  test.setTimeout(120000);
  const customer = await apiLogin(request, "customer");
  const receptionist = await apiLogin(request, "receptionist");
  const cHeaders = { Accept: "application/json", Authorization: `Bearer ${customer.token}` };

  const petRes = await request.post(`${apiUrl}/pets`, { headers: cHeaders, data: { name: `E2E Later Pet ${Date.now()}`, species: "Dog" } });
  const petBody = await petRes.json();
  const pet = petBody.pet || petBody;
  const pick = Math.floor(Math.random() * 300);
  const date = new Date(Date.now() + (5 + (pick % 40)) * 86400000).toISOString().slice(0, 10);
  const slot = `${String(10 + (pick % 7)).padStart(2, "0")}:00`;
  const reqRes = await request.post(`${apiUrl}/customer/requests`, {
    headers: cHeaders,
    data: {
      customer_name: customer.user.name, customer_email: customer.user.email,
      pet_id: pet.id, pet_name: pet.name, request_type: "grooming", service_type: "grooming",
      service_name: "Standard Grooming", request_date: date, request_time: slot,
      requested_date: date, requested_time: slot, notes: "E2E later date",
    },
  });
  expect(reqRes.ok(), "create grooming request").toBeTruthy();
  const created = (await reqRes.json()).request;

  const context = await browser.newContext({ baseURL: frontendUrl, viewport: { width: 1280, height: 900 } });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || user.email);
    localStorage.setItem("email", user.email);
  }, receptionist);
  const page = await context.newPage();
  await page.goto("/receptionist/bookings/grooming");
  await page.waitForSelector(".bst-tabs", { timeout: 30000 });

  // Default TODAY view does not list the later booking, but says it exists.
  const later = page.locator(".bst-later");
  await expect(later).toBeVisible({ timeout: 30000 });
  await later.click();

  await expect(page.locator(".bdf-option.is-active")).toHaveText("UPCOMING");
  await expect(page.locator(".grooming-table tbody tr", { hasText: pet.name })).toHaveCount(1, { timeout: 30000 });
  await page.locator(".bdf-option").filter({ hasText: "7 DAYS" }).click();
  await page.locator(".bst-tab").filter({ hasText: "TO APPROVE" }).click();
  await expect.poll(() =>
    page.evaluate(() => {
      const params = new URLSearchParams(window.location.search);
      return [params.get("tab"), params.get("range")];
    })
  ).toEqual(["to_approve", "7d"]);
  await context.close();
  expect(created.id).toBeTruthy();
});
