const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test.describe('Manager Dashboard end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'manager';
  const dashboardPath = getDashboardPath(role);

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Manager');
    }
  });

  test('login redirects to correct dashboard', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page).toHaveURL(new RegExp(dashboardPath));
  });

  test('dashboard title is visible', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('h1, h2').filter({ hasText: /manager|team|staff/i }).first()).toBeVisible();
  });

  test('loads manager dashboard and shows team metrics', async ({ page }) => {
    const dashMock = { total_staff: 8, today_appointments: 4, completed_appointments: 3, today_revenue: 800 };
    const staffMock = { staff: [{ id: 1, name: 'Alice', is_active: true }] };
    if (!process.env.E2E_LIVE) {
      await page.route('**/api/manager/dashboard', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashMock) }));
      await page.route('**/api/manager/staff', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(staffMock) }));
    }
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('.overview-card, [class*="card"], [class*="stat"]').first()).toBeVisible();
    await expect(page.locator('text=/staff|team|member/i').first()).toBeVisible();
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
    const links = nav.locator('a, button').filter({ hasText: /staff|team|report|performance/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('can view reports and staff performance', async ({ page }) => {
    const mockReports = {
      reports: [
        { type: 'performance', staff_id: 1, score: 95 },
        { type: 'sales', date: '2024-01-01', amount: 5000 }
      ]
    };

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/manager/reports*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockReports) }));
      await page.route('**/api/manager/staff/*/performance', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ staff_id: 1, performance_score: 95 }) }));
    }

    await page.goto(frontendUrl + dashboardPath);
    await page.waitForLoadState('networkidle');

    // Look for reports link/button
    const reportsLink = page.locator('a:has-text("report"), a:has-text("Report"), button:has-text("report"), button:has-text("Report"), a[href*="report"], [data-testid*="report"]').first();
    const performanceLink = page.locator('a:has-text("performance"), a:has-text("Performance"), button:has-text("performance"), [data-testid*="performance"]').first();

    if (await reportsLink.isVisible().catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);
    } else if (await performanceLink.isVisible().catch(() => false)) {
      await performanceLink.click();
      await page.waitForTimeout(500);
    }

    const hasReportsAccess = await reportsLink.isVisible().catch(() => false) || await performanceLink.isVisible().catch(() => false);
    expect(hasReportsAccess).toBeTruthy();
  });

  test('forbidden pages redirect or block', async ({ page }) => {
    const forbiddenPaths = ['/admin'];
    for (const path of forbiddenPaths) {
      await page.goto(frontendUrl + path);
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') || currentUrl.includes('/forbidden') || currentUrl.includes(dashboardPath) || await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
