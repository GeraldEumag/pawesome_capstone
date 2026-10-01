const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/users/create',
  '/admin/employees',
  '/admin/reports',
  '/admin/reports/cashier',
  '/admin/reports/inventory',
  '/admin/reports/manager',
  '/admin/reports/veterinary',
  '/admin/reports/customers',
  '/admin/reports/payments',
  '/admin/reports/orders',
  '/admin/reports/services',
  '/admin/reports/logistics',
  '/admin/reports/reception',
  '/admin/reports/attendance',
  '/admin/reports/payroll',
  '/admin/history',
  '/admin/history/logins',
  '/admin/chatbot',
  '/admin/live-chat',
  '/admin/landing-page',
  '/admin/settings',
  '/admin/profile',
];

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 900 },
  { name: 'macbook-1512', width: 1512, height: 982 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

async function stubAdminApi(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    let body = {};
    if (url.pathname === '/api/settings/public') {
      body = { theme_color: 'cream-white' };
    } else if (url.pathname === '/api/admin/dashboard') {
      body = {
        total_users: 24,
        active_users: 18,
        total_customers: 12,
        today_appointments: 6,
        total_appointments: 32,
        completed_appointments: 21,
        pending_appointments: 4,
        total_revenue: 64000,
        today_revenue: 4800,
        low_stock_items: 2,
        appointments_by_status: [
          { status: 'Completed', count: 21 },
          { status: 'Pending', count: 4 },
        ],
        users_by_role: [
          { role: 'admin', count: 1 },
          { role: 'cashier', count: 1 },
          { role: 'customer', count: 12 },
          { role: 'inventory', count: 1 },
          { role: 'manager', count: 1 },
          { role: 'receptionist', count: 1 },
          { role: 'super_receptionist', count: 1 },
          { role: 'veterinary', count: 1 },
        ],
        recent_appointments: [],
        recent_users: [],
      };
    } else if (url.pathname === '/api/admin/system-health') {
      body = { api: 'online', database: 'online', storage: 'online' };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('Admin workspace routes remain responsive across device widths', async ({ page }) => {
  test.setTimeout(180000);
  await mockLoginAs(page, 'admin', 'Responsive Audit Admin');
  await stubAdminApi(page);
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });

  const viewportsForRoute = (route) => (
    ['/admin', '/admin/users', '/admin/reports', '/admin/settings'].includes(route)
      ? VIEWPORTS
      : VIEWPORTS.filter(({ name }) => ['phone-390', 'laptop-1366'].includes(name))
  );

  for (const route of ADMIN_ROUTES) {
    for (const viewport of viewportsForRoute(route)) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.evaluate((path) => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await expect(
        page.locator('.app-dashboard.admin-dashboard'),
        `${route} at ${viewport.name} should render the Admin shell; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 8000 });
      await expect(page.locator('.app-content').first()).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));

      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow the viewport: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/admin') {
        await expect(page.locator('.quick-stat-panel')).toBeVisible();
        await expect(page.locator('.user-role-chart-box .recharts-default-legend')).toBeVisible();
        const overviewGeometry = await page.evaluate(() => {
          const chart = document.querySelector('.chart-box');
          const quickStats = document.querySelector('.quick-stat-panel');
          const roleChart = document.querySelector('.user-role-chart-box');
          const legend = roleChart?.querySelector('.recharts-default-legend');
          return {
            chartHeight: chart?.getBoundingClientRect().height,
            statColumns: getComputedStyle(quickStats).gridTemplateColumns.split(' ').filter(Boolean).length,
            legendBottom: legend?.getBoundingClientRect().bottom,
            roleChartBottom: roleChart?.getBoundingClientRect().bottom,
          };
        });
        expect(overviewGeometry.chartHeight).toBeLessThanOrEqual(221);
        expect(overviewGeometry.statColumns).toBe(viewport.width <= 420 ? 1 : 2);
        expect(overviewGeometry.legendBottom).toBeLessThanOrEqual(overviewGeometry.roleChartBottom + 1);
      }

      if (['/admin', '/admin/users', '/admin/reports', '/admin/settings'].includes(route)
        && ['phone-390', 'laptop-1366'].includes(viewport.name)) {
        await test.info().attach(`admin-${route.split('/').filter(Boolean).join('-') || 'home'}-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
});

test('Admin CSS scope does not attach to the cashier POS workspace', async ({ page }) => {
  await mockLoginAs(page, 'admin', 'POS Isolation Audit');
  await stubAdminApi(page);
  await page.goto('/admin');
  await expect(page.locator('.app-dashboard.admin-dashboard')).toBeVisible();
  await page.goto('/cashier/pos');

  await expect(page.locator('.pos-kiosk').first()).toBeVisible();
  await expect(page.locator('.app-dashboard.admin-dashboard')).toHaveCount(0);
});
