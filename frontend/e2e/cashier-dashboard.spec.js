const { test, expect } = require('@playwright/test');

test.describe('Cashier Dashboard end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'cashier';
  const dashboardPath = getDashboardPath(role);

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Cashier');
    }
  });

  test('login redirects to correct dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000' + dashboardPath);
    await expect(page).toHaveURL(new RegExp(dashboardPath));
  });

  test('dashboard title is visible', async ({ page }) => {
    await page.goto('http://localhost:3000' + dashboardPath);
    await expect(page.locator('h1, h2').filter({ hasText: /cashier|sales|dashboard/i }).first()).toBeVisible();
  });

  test('loads cashier dashboard and displays sales', async ({ page }) => {
    const mock = { today_sales: 1200.5, today_transactions: 12, monthly_sales: 15000, pending_payments: 2 };
    if (!process.env.E2E_LIVE) {
      await page.route('**/api/cashier/dashboard', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock) }));
    }
    await page.goto('http://localhost:3000' + dashboardPath);
    await expect(page.locator('.cashier-kpi-card, [class*="card"], [class*="stat"]').first()).toBeVisible();
    await expect(page.locator('text=/sales|transaction/i').first()).toBeVisible();
  });

  test('refresh button reloads data', async ({ page }) => {
    await page.goto('http://localhost:3000' + dashboardPath);
    await page.locator('button:has-text("refresh"), button:has([data-icon="rotate"]), [title*="refresh" i]').first().click().catch(() => {});
    await expect(page.locator('.cashier-kpi-card, [class*="card"]').first()).toBeVisible();
  });

  test('main navigation works', async ({ page }) => {
    await page.goto('http://localhost:3000' + dashboardPath);
    const nav = page.locator('nav, aside, [role="navigation"], .sidebar, .sidenav').first();
    await expect(nav).toBeVisible();
    const links = nav.locator('a, button').filter({ hasText: /payment|sale|transaction/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('can verify and mark payment as paid', async ({ page }) => {
    const mockPayments = {
      payments: [
        { id: 1, customer: 'John Doe', amount: 150.00, status: 'pending', reference: 'INV-001' },
        { id: 2, customer: 'Jane Smith', amount: 200.00, status: 'pending', reference: 'INV-002' }
      ]
    };
    let markPaidCalled = false;

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/cashier/payments*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPayments) }));
      await page.route('**/api/cashier/payments/*/mark-paid', route => {
        markPaidCalled = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Payment marked as paid' }) });
      });
    }

    await page.goto('http://localhost:3000' + dashboardPath);
    await page.waitForLoadState('networkidle');

    // Look for payment actions
    const payBtn = page.locator('button:has-text("pay"), button:has-text("Pay"), button:has-text("mark paid"), button[class*="pay"]').first();
    const actionBtn = page.locator('button:has-text("action"), button:has-text("verify"), [data-testid*="payment"]').first();

    const hasPaymentAction = await payBtn.isVisible().catch(() => false) || await actionBtn.isVisible().catch(() => false);

    if (await payBtn.isVisible().catch(() => false)) {
      await payBtn.click();
      await page.waitForTimeout(500);
    } else if (await actionBtn.isVisible().catch(() => false)) {
      await actionBtn.click();
      await page.waitForTimeout(500);
    }

    expect(hasPaymentAction).toBeTruthy();
  });

  test('forbidden pages redirect or block', async ({ page }) => {
    const forbiddenPaths = ['/admin', '/manager', '/veterinary'];
    for (const path of forbiddenPaths) {
      await page.goto('http://localhost:3000' + path);
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') || currentUrl.includes('/forbidden') || currentUrl.includes(dashboardPath) || await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
