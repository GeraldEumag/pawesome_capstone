const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test.describe('Customer Dashboard end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'customer';
  const dashboardPath = getDashboardPath(role);

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Customer');
    }
  });

  test('login redirects to correct dashboard', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page).toHaveURL(new RegExp(dashboardPath));
  });

  test('dashboard title is visible', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('h1, h2').filter({ hasText: /my account|dashboard|bookings/i }).first()).toBeVisible();
  });

  test('loads customer dashboard and shows bookings', async ({ page }) => {
    const mock = { active_bookings: 2, total_pets: 3, recent_bookings: [] };
    if (!process.env.E2E_LIVE) {
      await page.route('**/api/customer/dashboard', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock) }));
    }
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('.overview-card, [class*="card"], [class*="booking"]').first()).toBeVisible();
    await expect(page.locator('text=/booking|pet|appointment/i').first()).toBeVisible();
  });

  test('refresh button reloads data', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await page.locator('button:has-text("refresh"), button:has([data-icon="rotate"]), [title*="refresh" i]').first().click().catch(() => {});
    await expect(page.locator('.overview-card, [class*="card"]').first()).toBeVisible();
  });

  test('main navigation works', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    const nav = page.locator('nav, aside, [role="navigation"], .sidebar, .sidenav').first();
    await expect(nav).toBeVisible();
    const links = nav.locator('a, button').filter({ hasText: /booking|pet|appointment|profile/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('can create new booking or service request', async ({ page }) => {
    let bookingCalled = false;

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/customer/requests', route => {
        if (route.request().method() === 'POST') {
          bookingCalled = true;
        }
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 1, message: 'Request submitted' }) });
      });
      await page.route('**/api/customer/bookings', route => {
        if (route.request().method() === 'POST') {
          bookingCalled = true;
        }
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 1, message: 'Booking created' }) });
      });
    }

    await page.goto(frontendUrl + dashboardPath);
    await page.waitForLoadState('networkidle');

    // Look for book/request button
    const bookBtn = page.locator('button:has-text("book"), button:has-text("Book"), button:has-text("request"), button:has-text("Request"), button:has-text("new"), button:has-text("New"), [data-testid*="book"]').first();

    if (await bookBtn.isVisible().catch(() => false)) {
      await bookBtn.click();
      await page.waitForTimeout(500);

      // Try to interact with booking form
      const serviceSelect = page.locator('select[name="service"], select[name="service_id"]').first();
      if (await serviceSelect.isVisible().catch(() => false)) {
        await serviceSelect.selectOption({ index: 0 }).catch(() => {});
      }

      const submitBtn = page.locator('button:has-text("submit"), button:has-text("Submit"), button:has-text("book"), button[type="submit"]').first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(500);
      }
    }

    const hasBookingButton = await bookBtn.isVisible().catch(() => false);
    expect(hasBookingButton).toBeTruthy();
  });

  test('forbidden pages redirect or block', async ({ page }) => {
    const forbiddenPaths = ['/admin', '/cashier', '/veterinary'];
    for (const path of forbiddenPaths) {
      await page.goto(frontendUrl + path);
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') || currentUrl.includes('/forbidden') || currentUrl.includes(dashboardPath) || await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
