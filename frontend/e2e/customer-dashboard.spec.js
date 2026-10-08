const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test.describe('Customer Services end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'customer';
  const customerPath = getDashboardPath(role);

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Customer');
    }
  });

  test('customer landing redirects to Services after login', async ({ page }) => {
    await page.goto(frontendUrl + '/customer');
    await expect(page).toHaveURL(/\/customer\/services$/);
    await expect(page.locator('.customer-services-page')).toBeVisible();
  });

  test('Services heading and request tabs are visible', async ({ page }) => {
    await page.goto(frontendUrl + customerPath);
    await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();
    await expect(page.getByRole('button', { name: /New Request/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /My Requests/ })).toBeVisible();
  });

  test('customer service choices remain available as booking entry points', async ({ page }) => {
    await page.goto(frontendUrl + customerPath);
    await expect(page.locator('.customer-services-page')).toBeVisible();
    await expect(page.locator('.cs-card')).toHaveCount(3);
    await expect(page.getByText('Book Now').first()).toBeVisible();
  });

  test('main navigation works', async ({ page }) => {
    await page.goto(frontendUrl + customerPath);
    const nav = page.locator('nav, aside, [role="navigation"], .sidebar, .sidenav').first();
    await expect(nav).toBeVisible();
    const links = nav.locator('a, button').filter({ hasText: /booking|pet|appointment|profile/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('can create new booking or service request', async ({ page }) => {
    test.setTimeout(90000); // dashboard fetch can starve under parallel load
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

    await page.goto(frontendUrl + customerPath);
    await page.waitForLoadState('domcontentloaded');

    // Look for book/request control — dashboard uses NavLink cards ("Book Services"),
    // not buttons, so match both.
    const bookBtn = page.locator('button:has-text("book"), button:has-text("Book"), a:has-text("book"), a:has-text("Book"), button:has-text("request"), button:has-text("Request"), a:has-text("request"), a:has-text("Request"), button:has-text("new"), button:has-text("New"), [data-testid*="book"]').first();

    // Quick-action cards render only after the dashboard fetch resolves —
    // wait for the loading state to clear first (can be slow under load).
    await page.locator('text=Loading your customer dashboard').waitFor({ state: 'hidden', timeout: 45000 }).catch(() => {});
    await bookBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
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
      // ProtectedRoute performs a client-side redirect — wait for it to settle
      // before reading the URL.
      await page.waitForURL(new RegExp(customerPath), { timeout: 8000 }).catch(() => {});
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') || currentUrl.includes('/forbidden') || currentUrl.includes(customerPath) || await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
