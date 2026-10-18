// Customer bookings board: tab counts match the API, URL state round-trips,
// the phone layout stacks rows into cards, and a receptionist change reaches
// the customer board without a reload (the board polls every 30 s).
const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./test-utils");

const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;
const TAB_ORDER = ["all", "to_approve", "on_going", "ready_to_pickup", "complete", "canceled"];

const authHeaders = (session) => ({ Accept: "application/json", Authorization: `Bearer ${session.token}` });

async function openBoard(browser, session, route) {
  const context = await browser.newContext({ baseURL: frontendUrl, viewport: { width: 1280, height: 900 } });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || user.email);
    localStorage.setItem("email", user.email);
  }, session);
  const page = await context.newPage();
  await page.goto(route);
  await waitForLoaded(page);
  return { page, context };
}

async function waitForLoaded(page) {
  await page.waitForSelector(".cbb-board", { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".cbb-updated")?.textContent.includes("—"), null, { timeout: 30000 });
}

const tabCounts = (page) =>
  page.locator(".bst-tab").evaluateAll((els) => els.map((el) => Number(el.querySelector(".bst-count")?.textContent || 0)));

test.describe("customer bookings board", () => {
  // Shared customer data: run in order so one test's new booking cannot race another's count check.
  test.describe.configure({ mode: "serial" });

  test("tab counts match the API for the same range", async ({ browser, request }) => {
    test.setTimeout(90000);
    const session = await apiLogin(request, "customer");
    const { page, context } = await openBoard(browser, session, "/customer/bookings?range=all");
    const res = await request.get(`${apiUrl}/customer/bookings?range=all`, { headers: authHeaders(session) });
    const body = await res.json();
    expect(await tabCounts(page)).toEqual(TAB_ORDER.map((key) => body.counts[key]));
    await context.close();
  });

  test("tab and date preset round-trip through the URL", async ({ browser, request }) => {
    const session = await apiLogin(request, "customer");
    const { page, context } = await openBoard(browser, session, "/customer/bookings?tab=to_approve&range=7d");

    const activeTab = page.locator(".bst-tab[aria-selected='true']");
    await expect(activeTab).toContainText("Pending");
    await expect(activeTab).toHaveAttribute("title", "Waiting for approval");
    await expect(page.locator(".bdf-option.is-active")).toHaveText("LAST 7 DAYS");

    await page.reload();
    await waitForLoaded(page);
    const activeTabAfter = page.locator(".bst-tab[aria-selected='true']");
    await expect(activeTabAfter).toContainText("Pending");
    await expect(activeTabAfter).toHaveAttribute("title", "Waiting for approval");
    await expect(page.locator(".bdf-option.is-active")).toHaveText("LAST 7 DAYS");
    await context.close();
  });

  test("phone width stacks each booking into a card without horizontal overflow", async ({ browser, request }) => {
    const session = await apiLogin(request, "customer");
    const { page, context } = await openBoard(browser, session, "/customer/bookings?range=all");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBeFalsy();

    const cards = page.locator(".cbb-card");
    if ((await cards.count()) > 0) {
      await expect(cards.first()).toBeVisible();
    }

    const firstBtn = page.locator(".cbb-btn").first();
    const btnBox = await firstBtn.boundingBox();
    expect(btnBox, "an action button should exist on the board").toBeTruthy();
    // 44px is the global touch-target floor (mobilePolish.css); visual bulk lives in padding/shadows.
    expect(btnBox.height, "action buttons stay compact on phones").toBeLessThanOrEqual(44);
    await context.close();
  });

  test("tablet width keeps the table inside its wrapper and hotel rows stay clean", async ({ browser, request }) => {
    const session = await apiLogin(request, "customer");
    const context = await browser.newContext({ baseURL: frontendUrl, viewport: { width: 768, height: 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("role", user.role);
      localStorage.setItem("name", user.name || user.email);
      localStorage.setItem("email", user.email);
    }, session);
    const page = await context.newPage();
    await page.goto("/customer/hotel?range=all");
    // The board lives behind the My Bookings tab on the hotel page.
    await page.locator(".hotel-tab", { hasText: "My Bookings" }).click();
    await waitForLoaded(page);
    await page.waitForTimeout(300);

    await expect(page.locator(".cbb-row").first(), "the boarding fixture gives the hotel board a row").toBeVisible();
    // The hotel host returns null when there is nothing extra, so no phantom gap rows.
    await expect(page.locator(".cbb-extra-row")).toHaveCount(0);

    const scrollOverflow = await page.evaluate(() => {
      const wrap = document.querySelector(".cbb-table-wrap");
      return wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false;
    });
    expect(scrollOverflow, "the table must not scroll inside its wrapper at 768px").toBeFalsy();
    await context.close();
  });

  test("a receptionist change reaches the customer board without a reload", async ({ browser, request }) => {
    test.setTimeout(120000);
    const customer = await apiLogin(request, "customer");
    const receptionist = await apiLogin(request, "receptionist");

    const petRes = await request.post(`${apiUrl}/pets`, {
      headers: authHeaders(customer),
      data: { name: `E2E Board Pet ${Date.now()}`, species: "Dog" },
    });
    expect(petRes.ok(), "create pet").toBeTruthy();
    const petBody = await petRes.json();
    const pet = petBody.pet || petBody;
  // Random future day and hour so repeated runs never collide on the same slot.
  const pick = Math.floor(Math.random() * 300);
  const date = new Date(Date.now() + (60 + pick) * 86400000).toISOString().slice(0, 10);
  const slot = `${String(10 + (pick % 7)).padStart(2, "0")}:00`;
    const reqRes = await request.post(`${apiUrl}/customer/requests`, {
      headers: authHeaders(customer),
      data: {
        customer_name: customer.user.name, customer_email: customer.user.email,
        pet_id: pet.id, pet_name: pet.name, request_type: "grooming", service_type: "grooming",
        service_name: "Standard Grooming", request_date: date, request_time: slot,
        requested_date: date, requested_time: slot, notes: "E2E board live update",
      },
    });
    expect(reqRes.ok(), "create grooming request").toBeTruthy();
    const requestId = (await reqRes.json()).request.id;

    const { page, context } = await openBoard(browser, customer, "/customer/bookings?range=all");
    const canceledBefore = (await tabCounts(page))[TAB_ORDER.indexOf("canceled")];

    const rejectRes = await request.patch(`${apiUrl}/receptionist/requests/${requestId}/status`, {
      headers: authHeaders(receptionist),
      data: { status: "rejected", rejection_reason: "E2E live update check" },
    });
    expect(rejectRes.ok(), "receptionist rejects").toBeTruthy();

    await expect.poll(async () => (await tabCounts(page))[TAB_ORDER.indexOf("canceled")], {
      timeout: 45000,
      intervals: [2000],
    }).toBe(canceledBefore + 1);
    await context.close();
  });
});
