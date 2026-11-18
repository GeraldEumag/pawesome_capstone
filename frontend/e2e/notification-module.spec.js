// Notification module E2E — live stack (:3000 frontend, :8000 API).
//
// Scope: bell badge, dropdown, mark-read / mark-all-read, persistence across
// reload, cross-user authorization, unauthenticated rejection, and the
// frontend error state. The spec seeds its own notifications through the
// admin-only POST /api/notifications endpoint and deletes them on teardown —
// it creates no business data and is safe to re-run.
//
// Ordering note: mark-all-read mutates the whole customer feed, so it runs
// LAST — earlier seeds cannot be swept by it.

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
  expect(res.ok(), `seed notification create failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.notification;
}

async function unreadCount(request, session) {
  const res = await request.get(`${apiBase}/notifications/unread-count`, { headers: authed(session) });
  return (await res.json()).unread_count;
}

// The dev stack is a single-threaded artisan server: browser POSTs can land
// seconds late and sweep freshly-seeded rows (e.g. a straggler mark-all-read
// from a prior test). Wait until the seeded row is CONFIRMED unread before
// driving the browser so assertions target a stable state.
async function waitSeedUnread(request, session, id) {
  await expect.poll(async () => {
    const res = await request.get(`${apiBase}/notifications`, { headers: authed(session) });
    const row = (await res.json()).notifications?.find((x) => x.id === id);
    return row ? row.read : null;
  }, { timeout: 30000 }).toBe(false);
}

test.describe("Notification module — live stack", () => {
  test.describe.configure({ timeout: 120000 });

  let admin;
  let customer;
  let receptionist;
  const seeded = [];

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    admin = await apiLogin(request, "admin");
    customer = await apiLogin(request, "customer");
    receptionist = await apiLogin(request, "receptionist");
    await request.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    for (const { id, session } of seeded) {
      // destroy is owner-scoped: delete each row with the recipient's token.
      await request
        .delete(`${apiBase}/notifications/${id}`, { headers: authed(session) })
        .catch(() => {});
    }
    await request.dispose();
  });

  test("bell badge and dropdown show a seeded notification", async ({ page, request }) => {
    const marker = `E2E-NOTIF-${Date.now()}`;
    const n = await createNotification(request, admin, customer.user.id, marker);
    seeded.push({ id: n.id, session: customer });
    await waitSeedUnread(request, customer, n.id);

    await loginAs(page, "customer");

    const bell = page.locator('button[aria-label="Notifications"]');
    await expect(bell).toBeVisible();
    // Poll interval is 10s — allow generous time for the badge to appear.
    await expect(page.locator(".pawesome-notification-badge")).toBeVisible({ timeout: 30000 });

    await bell.click();
    const panel = page.locator(".pawesome-notifications-panel");
    await expect(panel).toBeVisible();
    const item = panel.locator(".pawesome-notification-item", { hasText: marker });
    await expect(item).toBeVisible();
    await expect(item).toHaveClass(/unread/);
  });

  test("clicking a notification marks it read server-side", async ({ page, request }) => {
    const marker = `E2E-NOTIF-${Date.now()}`;
    const n = await createNotification(request, admin, customer.user.id, marker);
    seeded.push({ id: n.id, session: customer });
    await waitSeedUnread(request, customer, n.id);

    await loginAs(page, "customer");
    await page.locator('button[aria-label="Notifications"]').click();
    const item = page.locator(".pawesome-notification-item", { hasText: marker });
    await expect(item).toBeVisible({ timeout: 30000 });
    await item.click();

    // The click navigates; verify the row is read via the API (owner truth).
    // Generous timeout: artisan serve is single-threaded and the POST queues
    // behind the dashboard's request storm.
    await expect.poll(async () => {
      const res = await request.get(`${apiBase}/notifications`, { headers: authed(customer) });
      const body = await res.json();
      const row = (body.notifications || []).find((x) => x.id === n.id);
      return row ? row.read : null;
    }, { timeout: 30000 }).toBe(true);
  });

  test("cross-user mutation and unauthenticated access are rejected", async ({ playwright, request }) => {
    const api = await playwright.request.newContext();
    const marker = `E2E-NOTIF-${Date.now()}`;
    const n = await createNotification(api, admin, receptionist.user.id, marker);
    seeded.push({ id: n.id, session: receptionist });
    await api.dispose();

    // Customer cannot mark another user's notification read or delete it.
    const readRes = await request.post(`${apiBase}/notifications/${n.id}/read`, { headers: authed(customer) });
    expect(readRes.status()).toBe(404);
    const delRes = await request.delete(`${apiBase}/notifications/${n.id}`, { headers: authed(customer) });
    expect(delRes.status()).toBe(404);

    // Non-admin cannot create notifications.
    const createRes = await request.post(`${apiBase}/notifications`, {
      headers: authed(customer),
      data: { user_id: customer.user.id, title: "spoof", message: "spoof" },
    });
    expect(createRes.status()).toBe(403);

    // Unauthenticated requests are rejected.
    const unauth = await playwright.request.newContext();
    const anonRes = await unauth.get(`${apiBase}/notifications`);
    expect(anonRes.status()).toBe(401);
    await unauth.dispose();
  });

  test("dropdown shows error state with retry when the API fails", async ({ page }) => {
    await mockLoginAs(page, "customer");
    // Match the notifications endpoint on ANY origin — the frontend base is
    // VITE_API_BASE_URL (localhost:8000), which differs from E2E_API_URL.
    await page.route(
      (url) => url.pathname === "/api/notifications",
      (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
    );

    await page.goto("http://127.0.0.1:3000/customer/services");
    await page.locator('button[aria-label="Notifications"]').click();
    const panel = page.locator(".pawesome-notifications-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".pawesome-notification-empty")).toContainText("Couldn't load notifications", { timeout: 10000 });
    await expect(panel.locator("button", { hasText: "Retry" })).toBeVisible();
  });

  test("mark-all-read clears the badge and persists across reload", async ({ page, request }) => {
    const marker = `E2E-NOTIF-${Date.now()}`;
    const n = await createNotification(request, admin, customer.user.id, marker);
    seeded.push({ id: n.id, session: customer });
    await waitSeedUnread(request, customer, n.id);

    await loginAs(page, "customer");
    const bell = page.locator('button[aria-label="Notifications"]');
    await expect(page.locator(".pawesome-notification-badge")).toBeVisible({ timeout: 30000 });

    await bell.click();
    await page.locator(".pawesome-notifications-panel button", { hasText: "Mark all read" }).click();

    // Server-side truth first: all of this user's rows are read.
    await expect.poll(() => unreadCount(request, customer), { timeout: 30000 }).toBe(0);

    // Then the badge catches up on the next fetch.
    await expect(page.locator(".pawesome-notification-badge")).toHaveCount(0, { timeout: 30000 });

    await page.reload();
    await expect(page.locator('button[aria-label="Notifications"]')).toBeVisible();
    // Badge must not come back — read state persisted server-side.
    await expect(page.locator(".pawesome-notification-badge")).toHaveCount(0, { timeout: 30000 });
  });
});
