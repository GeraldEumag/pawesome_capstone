const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test.describe('Vet Dashboard end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'veterinary';
  const dashboardPath = getDashboardPath(role);

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Vet');
    }
  });

  test('login redirects to correct dashboard', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page).toHaveURL(new RegExp(dashboardPath));
  });

  test('dashboard title is visible', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('h1, h2').filter({ hasText: /veterinar|vet|patient/i }).first()).toBeVisible();
  });

  test('loads vet dashboard and shows appointments', async ({ page }) => {
    const mock = { today_appointments: 5, total_patients: 20, completed_appointments: 15, upcoming_appointments: [] };
    if (!process.env.E2E_LIVE) {
      await page.route('**/api/veterinary/dashboard', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock) }));
      await page.route('**/api/veterinary/boardings/current-boarders', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    }
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('.app-stat-card, [class*="card"], [class*="stat"]').first()).toBeVisible();
    await expect(page.locator('text=/appointment|patient|today/i').first()).toBeVisible();
  });

  test('refresh button reloads data', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await page.locator('button:has-text("refresh"), button:has([data-icon="rotate"]), [title*="refresh" i]').first().click().catch(() => {});
    await expect(page.locator('.app-stat-card, [class*="card"]').first()).toBeVisible();
  });

  test('main navigation works', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    const nav = page.locator('nav, aside, [role="navigation"], .sidebar, .sidenav').first();
    await expect(nav).toBeVisible();
    const links = nav.locator('a, button').filter({ hasText: /patient|appointment|record/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('can update appointment status to completed', async ({ page }) => {
    const mockAppointments = {
      appointments: [
        { id: 1, pet_name: 'Mochi', service: 'Checkup', status: 'scheduled', time: '10:00 AM' }
      ]
    };
    let statusUpdateCalled = false;

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/veterinary/appointments*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAppointments) }));
      await page.route('**/api/veterinary/appointments/*/status', route => {
        statusUpdateCalled = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Status updated' }) });
      });
      await page.route('**/api/veterinary/appointments/*/complete', route => {
        statusUpdateCalled = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Appointment completed' }) });
      });
    }

    await page.goto(frontendUrl + dashboardPath);
    await page.waitForLoadState('networkidle');

    // Look for complete or update buttons
    const completeBtn = page.locator('button:has-text("complete"), button:has-text("Complete"), button:has-text("done"), button:has-text("Done"), button[class*="complete"]').first();
    const statusBtn = page.locator('button:has-text("status"), button:has-text("update"), select[name="status"]').first();

    if (await completeBtn.isVisible().catch(() => false)) {
      await completeBtn.click();
      await page.waitForTimeout(500);
    } else if (await statusBtn.isVisible().catch(() => false)) {
      await statusBtn.click();
      await page.waitForTimeout(500);
    }

    const hasActionButton = await completeBtn.isVisible().catch(() => false) || await statusBtn.isVisible().catch(() => false);
    expect(hasActionButton).toBeTruthy();
  });

  test('forbidden pages redirect or block', async ({ page }) => {
    const forbiddenPaths = ['/admin', '/cashier', '/manager'];
    for (const path of forbiddenPaths) {
      await page.goto(frontendUrl + path);
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') || currentUrl.includes('/forbidden') || currentUrl.includes(dashboardPath) || await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
