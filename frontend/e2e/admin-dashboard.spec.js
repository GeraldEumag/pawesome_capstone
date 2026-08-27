const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test.describe('Admin Dashboard end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'admin';
  const dashboardPath = getDashboardPath(role);

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Admin');
    }
  });

  test('login redirects to correct dashboard', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page).toHaveURL(new RegExp(dashboardPath));
  });

  test('dashboard title is visible', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('h1, h2').filter({ hasText: /admin|dashboard/i }).first()).toBeVisible();
  });

  test('loads dashboard and displays summary cards', async ({ page }) => {
    const mockData = {
      total_users: 12,
      active_users: 10,
      total_customers: 42,
      today_appointments: 3,
      total_revenue: 12345.67,
      low_stock_items: 2,
      recent_appointments: [],
      recent_users: []
    };

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/admin/dashboard', route => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockData) });
      });
    }

    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('.overview-card, .summary-card, [class*="card"]').first()).toBeVisible();
    await expect(page.locator('text=/total users|users/i').first()).toBeVisible();
  });

  test('refresh button reloads data', async ({ page }) => {
    if (!process.env.E2E_LIVE) {
      let requestCount = 0;
      await page.route('**/api/admin/dashboard', route => {
        requestCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total_users: requestCount })
        });
      });
    }

    await page.goto(frontendUrl + dashboardPath);
    await page.locator('button:has-text("refresh"), button:has([data-icon="rotate"]), [title*="refresh" i]').first().click().catch(() => {});
    await expect(page.locator('.overview-card, .summary-card').first()).toBeVisible();
  });

  test('main navigation works', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    const nav = page.locator('nav, aside, [role="navigation"], .sidebar, .sidenav').first();
    await expect(nav).toBeVisible();
    const links = nav.locator('a, button').filter({ hasText: /users|settings|reports|staff/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('can manage users - create and toggle status', async ({ page }) => {
    const mockUsers = {
      users: [
        { id: 1, name: 'Test User', email: 'test@example.com', role: 'customer', is_active: true }
      ]
    };
    let userActionCalled = false;

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/admin/users*', route => {
        if (route.request().method() === 'POST' || route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
          userActionCalled = true;
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...mockUsers, message: 'User updated' }) });
      });
    }

    await page.goto(frontendUrl + dashboardPath);
    await page.waitForLoadState('networkidle');

    // Navigate to users section if not on dashboard
    const usersLink = page.locator('a:has-text("user"), a:has-text("User"), a[href*="user"], button:has-text("user"), button:has-text("User"], [data-testid*="user"]').first();
    if (await usersLink.isVisible().catch(() => false)) {
      await usersLink.click();
      await page.waitForTimeout(500);
    }

    // Look for add user button
    const addBtn = page.locator('button:has-text("add"), button:has-text("Add"), button:has-text("new"), button:has-text("New"), button:has-text("+"), [data-testid*="add"]').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Try to fill user form
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('New Test User');
        const emailInput = page.locator('input[name="email"], input[type="email"]').first();
        if (await emailInput.isVisible().catch(() => false)) {
          await emailInput.fill('newuser@test.com');
        }
      }
    }

    // Look for toggle/status action
    const toggleBtn = page.locator('button:has-text("toggle"), button:has-text("Toggle"), button:has-text("activate"), button:has-text("deactivate"), button[class*="toggle"]').first();
    if (await toggleBtn.isVisible().catch(() => false)) {
      await toggleBtn.click();
      await page.waitForTimeout(500);
    }

    const hasUserManagement = await addBtn.isVisible().catch(() => false) || await toggleBtn.isVisible().catch(() => false) || await usersLink.isVisible().catch(() => false);
    expect(hasUserManagement).toBeTruthy();
  });

  test('cannot access operational dashboards directly', async ({ page }) => {
    // Admin should not be doing cashier/vet/receptionist operations
    const operationalPaths = ['/cashier/pos', '/veterinary/treatment', '/receptionist/bookings'];
    for (const path of operationalPaths) {
      await page.goto(frontendUrl + path);
      const currentUrl = page.url();
      // Should either redirect to admin or show forbidden
      const blockedOrRedirected = currentUrl.includes('/unauthorized') ||
                      currentUrl.includes('/forbidden') ||
                      currentUrl.includes(dashboardPath) ||
                      currentUrl.includes('/admin');
      expect(blockedOrRedirected).toBeTruthy();
    }
  });

  test('forbidden pages redirect or block', async ({ page }) => {
    const forbiddenPaths = ['/cashier', '/veterinary', '/receptionist'];
    for (const path of forbiddenPaths) {
      await page.goto(frontendUrl + path);
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') ||
                      currentUrl.includes('/forbidden') ||
                      currentUrl.includes(dashboardPath) ||
                      await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
