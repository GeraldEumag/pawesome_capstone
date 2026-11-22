// Notification redesign E2E — live stack (:3000 frontend, :8000 API).
//
// Covers the new dropdown behaviour added by the notification UI/UX redesign:
//   - All/Unread filter tabs (switching must never change read state)
//   - Per-item mark-as-read (no navigation) and failure state integrity
//   - ESC / outside-click close
//   - Responsive panel constraints on small viewports
// The spec seeds its own notifications via POST /api/notifications and deletes
// them on teardown — safe to re-run, creates no business data.

const { test, expect } = require("@playwright/test");
const { loginAs, apiLogin, mockLoginAs } = require("./test-utils");

const apiBase = (process.env.E2E_API_URL || "http://127.0.0.1:8000/api").replace(/\/+$/, "");

const authed = (session) => ({
  Accept: "application/json",
  Authorization: `Bearer ${session.token}`,
});

async function createNotification(request, admin, userId, marker) {
  const res = await request.post(`${apiBase}/notifications`, {
    headers: authed(admin),
    data: {
      user_id: userId,
      title: marker,
      message: `E2E seeded notification ${marker}`,
      type: "info",
      related_type: "e2e",
    },
  });
  expect(res.ok(), `seed failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()).notification;
}

async function getRow(request, session, id) {
  const res = await request.get(`${apiBase}/notifications`, { headers: authed(session) });
  return (await res.json()).notifications?.find((x) => x.id === id);
}

async function waitSeedUnread(request, session, id) {
  await expect.poll(async () => (await getRow(request, session, id))?.read ?? null, { timeout: 30000 }).toBe(false);
}

test.describe("Notification redesign — live stack", () => {
  test.describe.configure({ timeout: 120000 });

  let admin;
  let customer;
  const seeded = [];

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    admin = await apiLogin(request, "admin");
    customer = await apiLogin(request, "customer");
    await request.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    for (const { id, session } of seeded) {
      await request
        .delete(`${apiBase}/notifications/${id}`, { headers: authed(session) })
        .catch(() => {});
    }
    await request.dispose();
  });

  test("All/Unread tabs filter the list without mutating read state", async ({ page, request }) => {
    const stamp = Date.now();
    const nRead = await createNotification(request, admin, customer.user.id, `E2E-READ-${stamp}`);
    const nUnread = await createNotification(request, admin, customer.user.id, `E2E-UNREAD-${stamp}`);
    seeded.push({ id: nRead.id, session: customer }, { id: nUnread.id, session: customer });
    await waitSeedUnread(request, customer, nUnread.id);
    // Make one row read via the API (owner-scoped).
    await request.post(`${apiBase}/notifications/${nRead.id}/read`, { headers: authed(customer) });
    await expect.poll(async () => (await getRow(request, customer, nRead.id))?.read ?? null, { timeout: 30000 }).toBe(true);

    await loginAs(page, "customer");
    await page.locator('button[aria-label="Notifications"]').click();
    const panel = page.locator(".pawesome-notifications-panel");
    await expect(panel).toBeVisible();

    // ALL: both rows visible.
    const allItem = panel.locator(".pawesome-notification-item", { hasText: `E2E-READ-${stamp}` });
    const unreadItem = panel.locator(".pawesome-notification-item", { hasText: `E2E-UNREAD-${stamp}` });
    await expect(allItem).toBeVisible({ timeout: 30000 });
    await expect(unreadItem).toBeVisible();

    // Rapid switching — read state must not be touched by filter changes.
    for (let i = 0; i < 3; i++) {
      await panel.locator("button", { hasText: /^Unread$/ }).click();
      await panel.locator("button", { hasText: /^All$/ }).click();
    }

    // UNREAD tab: wait for the ?unread fetch itself, then only the unread
    // row is listed. (The stale pre-filter list can satisfy a plain
    // visibility wait while the request is still queued behind dashboard
    // hydration on the dev server.)
    const unreadFetch = page.waitForResponse(
      (res) => res.url().includes("/api/notifications") && res.url().includes("unread"),
      { timeout: 30000 }
    );
    await panel.locator("button", { hasText: /^Unread$/ }).click();
    await unreadFetch;
    await expect(unreadItem).toBeVisible({ timeout: 30000 });
    await expect(allItem).toHaveCount(0, { timeout: 15000 });

    // Server-side truth: the read row is still read, unread row still unread —
    // tab switching never fired a mutation.
    expect((await getRow(request, customer, nRead.id))?.read).toBe(true);
    expect((await getRow(request, customer, nUnread.id))?.read).toBe(false);
  });

  test("per-item mark-as-read works without navigating; failed call keeps state", async ({ page }) => {
    await mockLoginAs(page, "customer");

    const payload = {
      success: true,
      unread_count: 1,
      notifications: [{
        id: 987001,
        title: "E2E-MOCK-MARKREAD",
        message: "mocked unread row",
        type: "info",
        read: false,
        time: "just now",
      }],
    };

    // Registered after mockLoginAs' fallback so these win.
    await page.route(
      (url) => url.pathname === "/api/notifications",
      (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );
    let readCalls = 0;
    await page.route(
      (url) => url.pathname === "/api/notifications/987001/read",
      (route) => {
        readCalls += 1;
        route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
    );

    await page.goto("http://127.0.0.1:3000/customer/services");
    await page.locator('button[aria-label="Notifications"]').click();
    const panel = page.locator(".pawesome-notifications-panel");
    const item = panel.locator(".pawesome-notification-item", { hasText: "E2E-MOCK-MARKREAD" });
    await expect(item).toBeVisible({ timeout: 15000 });
    await expect(item).toHaveClass(/unread/);
    await expect(page.locator(".pawesome-notification-badge")).toContainText("1");

    // Non-navigating mark-read affordance; the mocked 500 must NOT flip state.
    await item.locator(".pawesome-notification-markread").click({ force: true });
    await page.waitForTimeout(500);
    expect(readCalls).toBe(1);
    await expect(item).toHaveClass(/unread/);
    await expect(page.locator(".pawesome-notification-badge")).toContainText("1");
    // Still on the same page — the mark-read control must not navigate.
    expect(page.url()).toContain("/customer/services");
  });

  test("panel closes on Escape and outside click", async ({ page }) => {
    await loginAs(page, "customer");
    await page.locator('button[aria-label="Notifications"]').click();
    const panel = page.locator(".pawesome-notifications-panel");
    await expect(panel).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    await page.locator('button[aria-label="Notifications"]').click();
    await expect(panel).toBeVisible();
    await page.locator("body").click({ position: { x: 10, y: 10 } });
    await expect(panel).toHaveCount(0);
  });

  test("panel stays within the viewport on a 390px screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "customer");
    await page.locator('button[aria-label="Notifications"]').click();
    const panel = page.locator(".pawesome-notifications-panel");
    await expect(panel).toBeVisible();

    const box = await panel.boundingBox();
    expect(box, "panel must be measurable").toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    // No horizontal page overflow introduced by the panel.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
