const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const VETERINARY_ROUTES = [
  '/veterinary',
  '/veterinary/appointments',
  '/veterinary/appointments/1/edit',
  '/veterinary/appointments/1/consult',
  '/veterinary/appointments/1/billing',
  '/veterinary/services',
  '/veterinary/history',
  '/veterinary/customer-profiles',
  '/veterinary/reports',
  '/veterinary/receipt',
  '/veterinary/current-boarders',
  '/veterinary/medical-confinements',
  '/veterinary/payroll',
  '/veterinary/profile',
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
  '/veterinary',
  '/veterinary/appointments',
  '/veterinary/services',
  '/veterinary/history',
  '/veterinary/customer-profiles',
  '/veterinary/reports',
  '/veterinary/current-boarders',
  '/veterinary/medical-confinements',
]);

async function stubVeterinaryApi(page) {
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
        appointments: [],
        services: [],
        patients: [],
        customers: [],
        boarders: [],
        records: [],
        history: [],
        payrolls: [],
        meta: {},
      };

      if (url.pathname === '/api/settings/public') {
        body = { theme_color: 'cream-white' };
      } else if (url.pathname === '/api/veterinary/dashboard') {
        body = {
          today_appointments: 5,
          total_patients: 24,
          completed_appointments: 17,
          pending_appointments: 3,
          active_treatments: 4,
          new_patients_this_month: 6,
          recent_patients: [],
          upcoming_appointments: [],
        };
      } else if (url.pathname === '/api/veterinary/boardings/current-boarders') {
        body = [];
      } else if (url.pathname === '/api/admin/services') {
        body = { data: [] };
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

async function navigateWithinVeterinary(page, route) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test('Veterinary routes stay responsive and scoped to the Veterinary workspace', async ({ page }) => {
  test.setTimeout(240000);
  await mockLoginAs(page, 'veterinary', 'Veterinary Responsive Audit');
  await stubVeterinaryApi(page);
  await page.goto('/veterinary', { waitUntil: 'domcontentloaded' });

  for (const route of VETERINARY_ROUTES) {
    const viewports = FULL_AUDIT_ROUTES.has(route)
      ? VIEWPORTS
      : VIEWPORTS.filter(({ name }) => ['phone-390', 'laptop-1366'].includes(name));

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinVeterinary(page, route);
      await expect(
        page.locator('.app-dashboard.vet-dashboard'),
        `${route} at ${viewport.name} should render the Veterinary workspace; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 10000 });

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/veterinary' && ['phone-390', 'laptop-1366'].includes(viewport.name)) {
        await test.info().attach(`veterinary-dashboard-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
});

test('Veterinary tablet navigation opens and closes the dashboard drawer', async ({ page }) => {
  await mockLoginAs(page, 'veterinary', 'Veterinary Drawer Audit');
  await stubVeterinaryApi(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/veterinary');

  const sidebar = page.locator('.app-sidebar.veterinary-sidebar');
  await expect(page.locator('.mobile-menu-toggle')).toBeVisible();
  await page.locator('.mobile-menu-toggle').click();
  await expect(sidebar).toHaveClass(/mobile-open/);
  await sidebar.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/veterinary\/reports$/);
  await expect(sidebar).not.toHaveClass(/mobile-open/);
});

test('Veterinary workspace styles do not leak into the Admin dashboard or Cashier POS', async ({ page }) => {
  await mockLoginAs(page, 'super_admin', 'Veterinary Isolation Audit');
  await stubVeterinaryApi(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/veterinary');
  await expect(page.locator('.app-dashboard.vet-dashboard')).toBeVisible();

  await navigateWithinVeterinary(page, '/admin');
  await expect(page.locator('.app-dashboard.admin-dashboard')).toBeVisible();
  await expect(page.locator('.app-dashboard.vet-dashboard')).toHaveCount(0);
  await expect(page.locator('.app-sidebar.veterinary-sidebar')).toHaveCount(0);

  await navigateWithinVeterinary(page, '/cashier/pos');
  await expect(page.locator('.pos-kiosk')).toBeVisible();
  await expect(page.locator('.app-dashboard.vet-dashboard')).toHaveCount(0);
});
