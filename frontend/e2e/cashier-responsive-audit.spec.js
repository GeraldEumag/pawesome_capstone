const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const CASHIER_DASHBOARD_ROUTES = [
  '/cashier/dashboard',
  '/cashier/dashboard/sales',
  '/cashier/dashboard/transactions',
  '/cashier/dashboard/analytics',
  '/cashier/dashboard/history',
  '/cashier/dashboard/reports',
  '/cashier/dashboard/payroll',
  '/cashier/dashboard/profile',
  '/cashier/transactions',
  '/cashier/analytics',
  '/cashier/history',
  '/cashier/reports',
  '/cashier/payroll',
  '/cashier/profile',
];

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 900 },
  { name: 'macbook-1512', width: 1512, height: 982 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const FULL_AUDIT_ROUTES = new Set([
  '/cashier/dashboard',
  '/cashier/dashboard/transactions',
  '/cashier/dashboard/reports',
  '/cashier/transactions',
]);

async function stubCashierApi(page) {
  const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';
  const apiOrigin = new URL(apiBase).origin;
  await page.route(
    (url) => url.origin === apiOrigin || url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      let body = {
        success: true,
        data: [],
        items: [],
        transactions: [],
        sales: [],
        reports: [],
        payments: [],
        customers: [],
        products: [],
        services: [],
        notifications: [],
      };

      if (url.pathname === '/api/settings/public') {
        body = { theme_color: 'cream-white' };
      } else if (url.pathname === '/api/cashier/dashboard') {
        body = {
          today_sales: 18250,
          today_transactions: 26,
          monthly_sales: 145000,
          monthly_transactions: 180,
          pending_payments: 2,
          recent_transactions: [
            { id: 'TRX-101', customer: 'Walk-in Customer', amount: '₱850.00', status: 'completed' },
            { id: 'TRX-100', customer: 'Maria Santos', amount: '₱1,250.00', status: 'completed' },
          ],
          sales_by_type: [],
          low_stock_items: [],
          top_selling_products: [],
          pending_orders: [],
          pending_boardings: [],
          pending_appointments: [],
        };
      } else if (url.pathname === '/api/cashier/handover/last') {
        body = { handover: null };
      } else if (url.pathname === '/api/cashier/shift-report/last') {
        body = { shift_report: null };
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

async function navigateWithinCashierDashboard(page, route) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test('Cashier dashboard routes remain responsive without applying dashboard styles to POS', async ({ page }) => {
  test.setTimeout(180000);
  await mockLoginAs(page, 'cashier', 'Cashier Responsive Audit');
  await stubCashierApi(page);
  await page.goto('/cashier/dashboard', { waitUntil: 'domcontentloaded' });

  for (const route of CASHIER_DASHBOARD_ROUTES) {
    const viewports = FULL_AUDIT_ROUTES.has(route)
      ? VIEWPORTS
      : VIEWPORTS.filter(({ name }) => ['phone-390', 'laptop-1366'].includes(name));

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinCashierDashboard(page, route);
      await expect(
        page.locator('.app-dashboard.cashier-workspace'),
        `${route} at ${viewport.name} should render the Cashier dashboard workspace; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 8000 });
      await expect(page.locator('.app-content').first()).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/cashier/dashboard' && ['phone-390', 'laptop-1366'].includes(viewport.name)) {
        await test.info().attach(`cashier-dashboard-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
});

test('Cashier tablet navigation opens and closes the dashboard drawer', async ({ page }) => {
  await mockLoginAs(page, 'cashier', 'Cashier Drawer Audit');
  await stubCashierApi(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/cashier/dashboard');

  const sidebar = page.locator('.app-sidebar.cashier-sidebar');
  await expect(page.locator('.mobile-menu-toggle')).toBeVisible();
  await page.locator('.mobile-menu-toggle').click();
  await expect(sidebar).toHaveClass(/mobile-open/);
  await sidebar.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page).toHaveURL(/\/cashier\/transactions$/);
  await expect(sidebar).not.toHaveClass(/mobile-open/);
});

test('direct and nested full-screen POS routes stay outside the Cashier redesign scope', async ({ page }) => {
  await mockLoginAs(page, 'cashier', 'Cashier POS Scope Audit');
  await stubCashierApi(page);

  for (const path of ['/cashier/pos', '/cashier/dashboard/pos']) {
    await page.goto(path);
    await expect(page.locator('.pos-kiosk')).toBeVisible();
    await expect(page.locator('.app-dashboard.cashier-workspace')).toHaveCount(0);
  }
});
