const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const SUPER_RECEPTIONIST_ROUTES = [
  '/super-receptionist/bookings/hotel',
  '/super-receptionist/bookings/vet',
  '/super-receptionist/bookings/grooming',
  '/super-receptionist/walk-ins',
  '/super-receptionist/customers',
  '/super-receptionist/manage-services',
  '/super-receptionist/history',
  '/super-receptionist/cashier-payments',
  '/super-receptionist/cashier-history',
  '/super-receptionist/cashier-reports',
  '/super-receptionist/inventory',
  '/super-receptionist/inventory/history',
  '/super-receptionist/inventory/reports',
  '/super-receptionist/inventory/audit',
  '/super-receptionist/payroll',
];

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 900 },
  { name: 'macbook-1512', width: 1512, height: 982 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

async function stubSuperReceptionistApi(page) {
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
    } else if (url.pathname.includes('/transactions')) {
      body = { transactions: [], data: [] };
    } else if (url.pathname.includes('/reports') || url.pathname.includes('/report')) {
      body = { data: [], summary: {}, report: {} };
    } else if (url.pathname.includes('/appointments') || url.pathname.includes('/bookings')) {
      body = { appointments: [], data: [], bookings: [] };
    } else if (url.pathname.includes('/customers')) {
      body = { customers: [], data: [] };
    } else if (url.pathname.includes('/services') || url.pathname.includes('/rooms')) {
      body = { data: [], services: [], rooms: [] };
    } else if (url.pathname.includes('/inventory') || url.pathname.includes('/products') || url.pathname.includes('/stock')) {
      body = { data: [], items: [], products: [], summary: {} };
    } else if (url.pathname.includes('/payroll') || url.pathname.includes('/payslip')) {
      body = { payroll: [], data: [], records: [] };
    } else if (url.pathname.includes('/history') || url.pathname.includes('/notifications')) {
      body = { data: [], notifications: [], history: [] };
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

test('Super Receptionist routes stay responsive inside the composite workspace', async ({ page }) => {
  test.setTimeout(300000);
  await mockLoginAs(page, 'super_receptionist', 'Super Receptionist Responsive Audit');
  await stubSuperReceptionistApi(page);
  await page.goto('/super-receptionist', { waitUntil: 'domcontentloaded' });

  for (const route of SUPER_RECEPTIONIST_ROUTES) {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinApp(page, route);
      await expect(
        page.locator('.app-dashboard.super-receptionist-layout'),
        `${route} at ${viewport.name} should render the Super Receptionist workspace; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.app-content').first()).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    }
  }
});

test('Super Receptionist tablet drawer opens and closes on navigation', async ({ page }) => {
  await mockLoginAs(page, 'super_receptionist', 'Super Receptionist Drawer Audit');
  await stubSuperReceptionistApi(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/super-receptionist/bookings/hotel');

  const sidebar = page.locator('.app-sidebar.super-receptionist-sidebar');
  await expect(page.locator('.mobile-menu-toggle')).toBeVisible();
  await page.locator('.mobile-menu-toggle').click();
  await expect(sidebar).toHaveClass(/mobile-open/);
  await sidebar.getByRole('link', { name: 'Grooming', exact: true }).click();
  await expect(page).toHaveURL(/\/super-receptionist\/bookings\/grooming$/);
  await expect(sidebar).not.toHaveClass(/mobile-open/);
});

test('Super Receptionist leaves Admin and Cashier POS untouched in the same session', async ({ page }) => {
  await mockLoginAs(page, 'super_receptionist', 'Super Receptionist Isolation Audit');
  await stubSuperReceptionistApi(page);
  await page.goto('/super-receptionist/bookings/hotel');
  await expect(page.locator('.app-dashboard.super-receptionist-layout')).toBeVisible();

  await navigateWithinApp(page, '/admin');
  await expect(page.locator('.app-dashboard.super-receptionist-layout')).toHaveCount(0);

  await navigateWithinApp(page, '/cashier/pos');
  await expect(page.locator('.pos-kiosk').first()).toBeVisible();
  await expect(page.locator('.app-dashboard.super-receptionist-layout')).toHaveCount(0);
});

test('Super Receptionist sidebar links POS externally and labels the role correctly', async ({ page }) => {
  await mockLoginAs(page, 'super_receptionist', 'Super Receptionist Sidebar Audit');
  await stubSuperReceptionistApi(page);
  await page.goto('/super-receptionist/bookings/hotel');

  const sidebar = page.locator('.app-sidebar.super-receptionist-sidebar');
  await expect(sidebar.locator('.sidebar-logo')).toHaveText('Super Receptionist');
  await expect(sidebar.getByRole('link', { name: /POS \(Full Screen\)/ })).toHaveAttribute('href', '/cashier/pos');
});
