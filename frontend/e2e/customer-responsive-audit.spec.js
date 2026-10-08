const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const CUSTOMER_ROUTES = [
  '/customer',
  '/customer/services',
  '/customer/booking',
  '/customer/bookings',
  '/customer/requests',
  '/customer/pets',
  '/customer/hotel',
  '/customer/grooming',
  '/customer/vet',
  '/customer/medical-confinements',
  '/customer/chatbot',
  '/customer/userinfo',
  '/customer/profile',
  '/customer/history',
  '/customer/notifications',
  '/customer/payments',
  '/customer/reports',
  '/customer/reports/payments',
];

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 900 },
  { name: 'macbook-1512', width: 1512, height: 982 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

async function stubCustomerApi(page, { includeStoredOrder = false } = {}) {
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
    } else if (url.pathname === '/api/customer/store/orders') {
      body = {
        orders: includeStoredOrder
          ? [{ id: 77, order_number: 'CUS-77', status: 'approved', payment_status: 'unpaid', total_amount: 250 }]
          : [],
      };
    } else if (url.pathname === '/api/customer/dashboard') {
      body = {
        total_pets: 2,
        pending_service_requests: 1,
        appointed_appointments: 1,
        payment_pending: 1,
        completed_services: 3,
        payment_paid: 2,
        unread_notifications: 1,
        loyalty_points: 240,
        member_status: 'Standard',
        active_bookings: 1,
        recent_pets: [
          { id: 1, name: 'Milo', species: 'Dog', breed: 'Shih Tzu', created_at: '2026-08-01' },
        ],
        recent_bookings: [
          { id: 1, pet_name: 'Milo', service_name: 'Grooming', status: 'awaiting_payment', scheduled_at: '2026-10-02' },
          { id: 2, pet_name: 'Milo', service_name: 'Veterinary', status: 'approved', scheduled_at: '2026-10-01' },
          { id: 3, pet_name: 'Milo', service_name: 'Hotel Boarding', status: 'completed', scheduled_at: '2026-09-28' },
          { id: 4, pet_name: 'Milo', service_name: 'Grooming', status: 'confirmed', scheduled_at: '2026-09-25' },
          { id: 5, pet_name: 'Milo', service_name: 'Veterinary', status: 'completed', scheduled_at: '2026-09-20' },
        ],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function navigateWithinCustomerWorkspace(page, route) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test('Customer workspace routes remain responsive across supported widths', async ({ page }) => {
  test.setTimeout(180000);
  await mockLoginAs(page, 'customer', 'Responsive Audit Customer');
  await stubCustomerApi(page);
  await page.goto('/customer', { waitUntil: 'domcontentloaded' });

  const viewportsForRoute = (route) => (
    ['/customer', '/customer/services', '/customer/pets', '/customer/payments'].includes(route)
      ? VIEWPORTS
      : VIEWPORTS.filter(({ name }) => ['phone-390', 'laptop-1366'].includes(name))
  );

  for (const route of CUSTOMER_ROUTES) {
    for (const viewport of viewportsForRoute(route)) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinCustomerWorkspace(page, route);
      await expect(
        page.locator('.app-dashboard.customer-dashboard'),
        `${route} at ${viewport.name} should render the Customer shell; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 8000 });
      await expect(page.locator('.app-content').first()).toBeVisible();

      if (route === '/customer/hotel') {
        await expect(page.locator('[name="check_in_time"], [name="check_out_time"]')).toHaveCount(0);
      }

      if (route === '/customer/grooming') {
        const timeSelect = page.locator('select[name="request_time"]');
        await expect(timeSelect).toBeVisible();
        const options = await timeSelect.locator('option').evaluateAll((items) =>
          items.map((item) => ({ value: item.value, label: item.textContent.trim() }))
        );
        expect(options).toEqual([
          { value: '', label: 'Select a time' },
          { value: '09:00', label: '9:00 AM' },
          { value: '10:00', label: '10:00 AM' },
          { value: '11:00', label: '11:00 AM' },
          { value: '12:00', label: '12:00 PM' },
          { value: '13:00', label: '1:00 PM' },
          { value: '14:00', label: '2:00 PM' },
          { value: '15:00', label: '3:00 PM' },
          { value: '16:00', label: '4:00 PM' },
          { value: '17:00', label: '5:00 PM' },
          { value: '18:00', label: '6:00 PM' },
        ]);
      }

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));

      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow the viewport: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/customer') {
        await expect(page).toHaveURL(/\/customer\/services$/);
        await expect(page.locator('.customer-services-page')).toBeVisible();
      }

      if (route === '/customer' && ['phone-390', 'laptop-1366'].includes(viewport.name)) {
        await test.info().attach(`customer-services-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
});

test('Customer styling remains scoped away from Admin and the cashier POS', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Customer Scope Audit');
  await stubCustomerApi(page);
  await page.goto('/customer');
  await expect(page.locator('.app-dashboard.customer-dashboard')).toBeVisible();
  await expect(page.locator('.app-dashboard.admin-dashboard')).toHaveCount(0);
  await expect(page.locator('.pos-kiosk')).toHaveCount(0);
});

test.describe('Customer booking date-only timezone handling', () => {
  test.use({ timezoneId: 'Asia/Manila' });

  test('date picker values round-trip without shifting the selected calendar day', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const dateValues = await page.evaluate(async () => {
      const { formatDateOnly, parseDateOnly } = await import('/src/utils/date.js');
      const selectedDate = new Date(2026, 8, 29);
      return {
        formatted: formatDateOnly(selectedDate),
        parsed: formatDateOnly(parseDateOnly('2026-09-29')),
      };
    });

    expect(dateValues).toEqual({ formatted: '2026-09-29', parsed: '2026-09-29' });
  });
});

test('historical customer store orders remain visible without payment actions', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Read-only Order History Audit');
  await page.addInitScript(() => window.localStorage.setItem('email', 'orders-audit@example.com'));
  await stubCustomerApi(page, { includeStoredOrder: true });
  await page.goto('/customer/bookings');

  await expect(page.locator('.app-dashboard.customer-dashboard')).toBeVisible();
  await expect(page.locator('.customer-status-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.customer-status-table tbody tr').first()).toContainText('Store Order');
  await expect(page.locator('.customer-status-table .customer-pay-btn')).toHaveCount(0);
});
