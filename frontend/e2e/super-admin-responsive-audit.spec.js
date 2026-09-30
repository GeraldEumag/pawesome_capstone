const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const SUPER_ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/employees',
  '/admin/reports',
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

async function stubSuperAdminApi(page) {
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
          { role: 'super_admin', count: 1 },
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

async function navigateWithinApp(page, route) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test('Super Admin routes stay responsive and scoped to the Super Admin workspace', async ({ page }) => {
  test.setTimeout(180000);
  await mockLoginAs(page, 'super_admin', 'Super Admin Responsive Audit');
  await stubSuperAdminApi(page);
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });

  for (const route of SUPER_ADMIN_ROUTES) {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinApp(page, route);
      await expect(
        page.locator('.app-dashboard.admin-dashboard.super-admin-dashboard'),
        `${route} at ${viewport.name} should render the Super Admin workspace; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.app-content').first()).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/admin') {
        await expect(page.locator('.super-admin-operations')).toBeVisible();
        await expect(
          page.locator('.super-admin-operations').getByRole('link', { name: /HR \/ Manager/i })
        ).toBeVisible();
        await expect(page.locator('.dashboard-profile-info small')).toHaveText('Super Admin');
      }
    }
  }
});

test('Super Admin tablet navigation opens and closes the dashboard drawer', async ({ page }) => {
  await mockLoginAs(page, 'super_admin', 'Super Admin Drawer Audit');
  await stubSuperAdminApi(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/admin');

  const sidebar = page.locator('.app-sidebar.admin-sidebar');
  await expect(page.locator('.mobile-menu-toggle')).toBeVisible();
  await page.locator('.mobile-menu-toggle').click();
  await expect(sidebar).toHaveClass(/mobile-open/);
  await sidebar.getByRole('link', { name: 'All Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(sidebar).not.toHaveClass(/mobile-open/);
});

test('Super Admin operations hub reaches role workspaces without style leakage', async ({ page }) => {
  await mockLoginAs(page, 'super_admin', 'Super Admin Operations Audit');
  await stubSuperAdminApi(page);
  await page.goto('/admin');

  await expect(page.locator('.super-admin-operations')).toBeVisible();
  await page.locator('.super-admin-operations').getByRole('link', { name: /HR \/ Manager/i }).click();
  await expect(page).toHaveURL(/\/manager$/);
  await expect(page.locator('.app-dashboard.manager-dashboard')).toBeVisible();
  await expect(page.locator('.app-dashboard.admin-dashboard.super-admin-dashboard')).toHaveCount(0);

  await navigateWithinApp(page, '/cashier/pos');
  await expect(page.locator('.pos-kiosk').first()).toBeVisible();
  await expect(page.locator('.app-dashboard.admin-dashboard.super-admin-dashboard')).toHaveCount(0);
});

test('Regular Admin does not receive the Super Admin workspace layer', async ({ page }) => {
  await mockLoginAs(page, 'admin', 'Regular Admin Isolation Audit');
  await stubSuperAdminApi(page);
  await page.goto('/admin');

  await expect(page.locator('.app-dashboard.admin-dashboard')).toBeVisible();
  await expect(page.locator('.app-dashboard.super-admin-dashboard')).toHaveCount(0);
  await expect(page.locator('.super-admin-operations')).toHaveCount(0);
  await expect(page.locator('.sidebar-logo')).toHaveText('Admin Portal');
});
