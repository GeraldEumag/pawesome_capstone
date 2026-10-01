const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const RECEPTIONIST_ROUTES = [
  '/receptionist',
  '/receptionist/bookings/hotel',
  '/receptionist/bookings/veterinary',
  '/receptionist/bookings/grooming',
  '/receptionist/bookings',
  '/receptionist/appointments',
  '/receptionist/manage-services',
  '/receptionist/walk-ins',
  '/receptionist/customers',
  '/receptionist/customer-profile',
  '/receptionist/orders',
  '/receptionist/history',
  '/receptionist/reports',
  '/receptionist/chatbot',
  '/receptionist/live-chat',
  '/receptionist/payroll',
  '/receptionist/profile',
  '/receptionist/dashboard',
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
  '/receptionist/bookings/hotel',
  '/receptionist/bookings/veterinary',
  '/receptionist/bookings/grooming',
  '/receptionist/manage-services',
  '/receptionist/walk-ins',
  '/receptionist/customers',
  '/receptionist/orders',
]);

async function stubReceptionistApi(page) {
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

    const body = {
      success: true,
      data: [],
      items: [],
      requests: [],
      appointments: [],
      boardings: [],
      boarding_requests: [],
      boarding_rooms: [],
      rooms: [],
      services: [],
      customers: [],
      orders: [],
      transactions: [],
      sessions: [],
      messages: [],
      notifications: [],
      veterinarians: [],
      history: [],
      stats: {},
      summary: {},
    };

    if (url.pathname.endsWith('/public')) {
      body.theme_color = 'cream-white';
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function navigateWithinReceptionistWorkspace(page, route) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test('Receptionist routes remain responsive across supported widths', async ({ page }) => {
  test.setTimeout(240000);
  await mockLoginAs(page, 'receptionist', 'Receptionist Responsive Audit');
  await stubReceptionistApi(page);
  await page.goto('/receptionist/bookings/hotel', { waitUntil: 'domcontentloaded' });

  for (const route of RECEPTIONIST_ROUTES) {
    const viewports = FULL_AUDIT_ROUTES.has(route)
      ? VIEWPORTS
      : VIEWPORTS.filter(({ name }) => ['phone-390', 'laptop-1366'].includes(name));

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinReceptionistWorkspace(page, route);
      await expect(
        page.locator('.app-dashboard.receptionist-layout'),
        `${route} at ${viewport.name} should render the Receptionist shell; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 8000 });
      await expect(page.locator('.app-content').first()).toBeVisible();
      await expect(
        page.locator('.receptionist-sidebar').getByRole('link', { name: /Customer Orders/i })
      ).toHaveCount(0);
      if (route === '/receptionist/orders') {
        await expect(page).toHaveURL(/\/receptionist\/bookings\/hotel$/);
      }

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/receptionist/bookings/hotel' && ['phone-390', 'laptop-1366'].includes(viewport.name)) {
        await test.info().attach(`receptionist-hotel-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
});

test('Receptionist tablet navigation opens and closes the scoped drawer', async ({ page }) => {
  await mockLoginAs(page, 'receptionist', 'Receptionist Drawer Audit');
  await stubReceptionistApi(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/receptionist/bookings/hotel');

  const sidebar = page.locator('.app-sidebar.receptionist-sidebar');
  await expect(page.locator('.mobile-menu-toggle')).toBeVisible();
  await page.locator('.mobile-menu-toggle').click();
  await expect(sidebar).toHaveClass(/mobile-open/);
  await page.getByRole('link', { name: /Walk-ins/i }).click();
  await expect(page).toHaveURL(/\/receptionist\/walk-ins$/);
  await expect(sidebar).not.toHaveClass(/mobile-open/);
});

test('Receptionist styles stay off Super Receptionist and the frozen POS', async ({ page }) => {
  await mockLoginAs(page, 'super_receptionist', 'Composite Scope Audit');
  await stubReceptionistApi(page);
  await page.goto('/super-receptionist/bookings/hotel');
  const superReceptionist = page.locator('.app-dashboard.super-receptionist-layout');
  await expect(superReceptionist).toBeVisible();
  await expect(page.locator('.app-dashboard.receptionist-layout')).toHaveCount(0);
  const receptionistToken = await superReceptionist.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--receptionist-canvas').trim()
  );
  expect(receptionistToken).toBe('');
});

test('Receptionist styling does not alter the cashier POS', async ({ page }) => {
  await mockLoginAs(page, 'admin', 'Receptionist POS Scope Audit');
  await stubReceptionistApi(page);
  await page.goto('/cashier/pos');
  await expect(page.locator('.pos-kiosk')).toBeVisible();
  await expect(page.locator('.app-dashboard.receptionist-layout')).toHaveCount(0);
});
