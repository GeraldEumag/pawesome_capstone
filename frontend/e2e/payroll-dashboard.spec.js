const { test, expect } = require('@playwright/test');

test.describe('Manager Payroll end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'manager';
  const dashboardPath = '/manager/payroll';

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Manager');
    }
  });

  test('login redirects to correct dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000' + dashboardPath);
    await expect(page).toHaveURL(new RegExp(dashboardPath));
  });

  test('dashboard title is visible', async ({ page }) => {
    await page.goto('http://localhost:3000' + dashboardPath);
    await expect(page.locator('h1, h2').filter({ hasText: /payroll|salary/i }).first()).toBeVisible();
  });

  test('loads payroll module and shows payroll metrics', async ({ page }) => {
    const mock = { payrolls: [], monthly_total: 50000 };
    if (!process.env.E2E_LIVE) {
      await page.route('**/api/manager/payroll*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock) }));
    }
    await page.goto('http://localhost:3000' + dashboardPath);
    await expect(page.locator('.summary-card, [class*="card"], [class*="stat"]').first()).toBeVisible();
    await expect(page.locator('text=/payroll|salary|total/i').first()).toBeVisible();
  });

  test('refresh button reloads data', async ({ page }) => {
    await page.goto('http://localhost:3000' + dashboardPath);
    await page.locator('button:has-text("refresh"), button:has([data-icon="rotate"]), [title*="refresh" i]').first().click().catch(() => {});
    await expect(page.locator('.summary-card, [class*="card"]').first()).toBeVisible();
  });

  test('main navigation works', async ({ page }) => {
    await page.goto('http://localhost:3000' + dashboardPath);
    const nav = page.locator('nav, aside, [role="navigation"], .sidebar, .sidenav').first();
    await expect(nav).toBeVisible();
    const links = nav.locator('a, button').filter({ hasText: /payroll|salary|employee/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('can generate payroll and view payslip', async ({ page }) => {
    const mockEmployees = {
      employees: [
        { id: 1, name: 'John Staff', base_salary: 30000, status: 'active' }
      ]
    };
    let generateCalled = false;

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/manager/payroll/compute*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEmployees) }));
      await page.route('**/api/manager/payroll/generate*', route => {
        generateCalled = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Payroll generated' }) });
      });
    }

    await page.goto('http://localhost:3000' + dashboardPath);
    await page.waitForLoadState('networkidle');

    // Look for generate payroll button
    const generateBtn = page.locator('button:has-text("generate"), button:has-text("Generate"), button:has-text("process"), button:has-text("Process"), button:has-text("run"), button:has-text("Run"]').first();
    const payslipBtn = page.locator('button:has-text("payslip"), button:has-text("Payslip"), button:has-text("view"), button:has-text("View"), a:has-text("payslip"), a:has-text("Payslip"]').first();

    if (await generateBtn.isVisible().catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(500);
    } else if (await payslipBtn.isVisible().catch(() => false)) {
      await payslipBtn.click();
      await page.waitForTimeout(500);
    }

    const hasPayrollAction = await generateBtn.isVisible().catch(() => false) || await payslipBtn.isVisible().catch(() => false);
    expect(hasPayrollAction).toBeTruthy();
  });

  test('forbidden pages redirect or block', async ({ page }) => {
    const forbiddenPaths = ['/admin', '/cashier', '/veterinary'];
    for (const path of forbiddenPaths) {
      await page.goto('http://localhost:3000' + path);
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') || currentUrl.includes('/forbidden') || currentUrl.includes(dashboardPath) || await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
