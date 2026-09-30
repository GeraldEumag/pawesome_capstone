const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const MANAGER_ROUTES = [
  '/manager',
  '/manager/staff',
  '/manager/employees',
  '/manager/payroll',
  '/manager/attendance',
  '/manager/leave',
  '/manager/history',
  '/manager/reports',
  '/manager/id-cards',
  '/manager/profile',
  '/manager/holidays',
  '/manager/salary-loans',
  '/manager/thirteenth-month',
  '/manager/remittance-reports',
  '/manager/dtr-report',
  '/manager/my-leave',
  '/manager/my-attendance',
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
  '/manager',
  '/manager/staff',
  '/manager/employees',
  '/manager/payroll',
  '/manager/attendance',
  '/manager/leave',
  '/manager/history',
  '/manager/reports',
  '/manager/id-cards',
  '/manager/holidays',
  '/manager/salary-loans',
  '/manager/thirteenth-month',
  '/manager/remittance-reports',
  '/manager/dtr-report',
]);

async function stubManagerApi(page) {
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
        records: [],
        staff: [],
        employees: [],
        attendance: [],
        leaves: [],
        payrolls: [],
        holidays: [],
        loans: [],
        reports: [],
        history: [],
        users: [],
        summary: {},
        meta: {},
      };

      if (url.pathname === '/api/settings/public') {
        body = { theme_color: 'cream-white' };
      } else if (url.pathname === '/api/manager/dashboard') {
        body = {
          sales_total: 125000,
          total_orders: 42,
          pending_orders: 3,
          paid_orders: 25,
          pending_payments: 4,
          rejected_payments: 1,
          total_customers: 120,
          active_customers: 98,
          total_appointments: 56,
          grooming_requests: 18,
          veterinary_appointments: 22,
          boarding_bookings: 16,
          low_stock_count: 5,
          completed_services: 31,
          today_appointments: 7,
          today_revenue: 8500,
          monthly_revenue: 185000,
          approved_orders: 20,
          rejected_orders: 2,
        };
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

async function navigateWithinManager(page, route) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test('Manager routes stay responsive and scoped to the Manager workspace', async ({ page }) => {
  test.setTimeout(240000);
  await mockLoginAs(page, 'manager', 'Manager Responsive Audit');
  await stubManagerApi(page);
  await page.goto('/manager', { waitUntil: 'domcontentloaded' });

  for (const route of MANAGER_ROUTES) {
    const viewports = FULL_AUDIT_ROUTES.has(route)
      ? VIEWPORTS
      : VIEWPORTS.filter(({ name }) => ['phone-390', 'laptop-1366'].includes(name));

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinManager(page, route);
      await expect(
        page.locator('.app-dashboard.manager-dashboard'),
        `${route} at ${viewport.name} should render the Manager workspace; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 10000 });

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/manager' && ['phone-390', 'laptop-1366'].includes(viewport.name)) {
        await test.info().attach(`manager-dashboard-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
});

test('Manager tablet navigation opens and closes the dashboard drawer', async ({ page }) => {
  await mockLoginAs(page, 'manager', 'Manager Drawer Audit');
  await stubManagerApi(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/manager');

  const sidebar = page.locator('.app-sidebar.manager-sidebar');
  await expect(page.locator('.mobile-menu-toggle')).toBeVisible();
  await page.locator('.mobile-menu-toggle').click();
  await expect(sidebar).toHaveClass(/mobile-open/);
  await sidebar.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/manager\/reports$/);
  await expect(sidebar).not.toHaveClass(/mobile-open/);
});

test('Manager workspace styles do not leak into the Admin dashboard or Cashier POS', async ({ page }) => {
  await mockLoginAs(page, 'super_admin', 'Manager Isolation Audit');
  await stubManagerApi(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/manager');
  await expect(page.locator('.app-dashboard.manager-dashboard')).toBeVisible();

  await navigateWithinManager(page, '/admin');
  await expect(page.locator('.app-dashboard.admin-dashboard')).toBeVisible();
  await expect(page.locator('.app-dashboard.manager-dashboard')).toHaveCount(0);
  await expect(page.locator('.app-sidebar.manager-sidebar')).toHaveCount(0);

  await navigateWithinManager(page, '/cashier/pos');
  await expect(page.locator('.pos-kiosk')).toBeVisible();
  await expect(page.locator('.app-dashboard.manager-dashboard')).toHaveCount(0);
});
