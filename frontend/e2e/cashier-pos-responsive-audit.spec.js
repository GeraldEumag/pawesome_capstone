const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 900 },
  { name: 'macbook-1512', width: 1512, height: 982 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const POS_PRODUCTS = [
  { id: 1, name: 'Premium Dog Kibble 2kg', price: 450, category: 'food', stock: 12, barcode: '4800001' },
  { id: 2, name: 'Cat Treats Salmon', price: 120, category: 'food', stock: 4, barcode: '4800002' },
  { id: 3, name: 'Leash and Collar Set', price: 350, category: 'accessories', stock: 8 },
  { id: 4, name: 'Squeaky Bone Toy', price: 180, category: 'toys', stock: 0 },
  { id: 5, name: 'Anti-Tick Shampoo', price: 240, category: 'health', stock: 15 },
  { id: 6, name: 'Paw Balm', price: 160, category: 'grooming', stock: 9 },
];

const POS_SERVICES = [
  { id: 11, name: 'Full Grooming — Small Breed', price: 800, item_type: 'service', category: 'services', service_category: 'Grooming' },
  { id: 12, name: 'Nail Trim', price: 150, item_type: 'service', category: 'services', service_category: 'Grooming' },
];

const POS_PAYMENT_REQUESTS = [
  {
    id: 21,
    customer_name: 'Maria Santos',
    customer_email: 'maria@example.com',
    service_name: 'Hotel Boarding — Deluxe',
    request_type: 'boarding',
    payment_method: 'gcash',
    amount: 1800,
    total_amount: 1800,
    payment_status: 'pending',
    created_at: new Date().toISOString(),
  },
];

async function stubPosApi(page) {
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
        customers: [],
        products: [],
        services: [],
        notifications: [],
      };

      if (url.pathname === '/api/settings/public') {
        body = { theme_color: 'cream-white' };
      } else if (url.pathname === '/api/cashier/inventory/sellable') {
        body = { items: POS_PRODUCTS, products: POS_PRODUCTS };
      } else if (url.pathname === '/api/cashier/pos/services') {
        body = { services: POS_SERVICES, data: POS_SERVICES };
      } else if (url.pathname === '/api/cashier/customers' || url.pathname === '/api/customers') {
        body = { customers: [{ id: 1, name: 'Maria Santos', phone: '09171234567' }] };
      } else if (url.pathname === '/api/cashier/payment-requests') {
        body = { data: POS_PAYMENT_REQUESTS };
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

async function expectNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.documentWidth,
    `${label} should not overflow horizontally: ${JSON.stringify(dimensions)}`
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

test('POS renders without horizontal overflow across all supported viewports', async ({ page }) => {
  test.setTimeout(120000);
  await mockLoginAs(page, 'cashier', 'POS Responsive Audit');
  await stubPosApi(page);
  await page.goto('/cashier/pos', { waitUntil: 'domcontentloaded' });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.locator('.pos-kiosk'), `pos-kiosk at ${viewport.name}`).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pos-tile').first(), `product tiles at ${viewport.name}`).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pos-category-tabs')).toBeVisible();
    await expect(page.locator('.pos-order-panel')).toBeVisible();
    await expectNoHorizontalOverflow(page, `/cashier/pos at ${viewport.name}`);
  }
});

test('POS mobile checkout flow: cart and payment steps fit a 390px phone', async ({ page }) => {
  await mockLoginAs(page, 'cashier', 'POS Mobile Checkout Audit');
  await stubPosApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cashier/pos', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.pos-tile').first()).toBeVisible({ timeout: 10000 });

  // Order panel stacks below the products and spans the viewport width
  const panelBox = await page.locator('.pos-order-panel').boundingBox();
  expect(panelBox.width).toBeGreaterThanOrEqual(389);

  // Add a product and proceed to the payment step
  await page.locator('.pos-tile').first().click();
  await expect(page.locator('.pos-cart-row')).toHaveCount(1);
  await expect(page.locator('.pos-order-count')).toHaveText('1');

  await page.locator('.pos-proceed-btn').click();
  await expect(page.locator('.pos-numpad')).toBeVisible();
  await expect(page.locator('.pos-pm-btn')).toHaveCount(3);
  await expectNoHorizontalOverflow(page, 'POS payment step at 390px');

  // Numpad + bill presets remain tappable
  await page.locator('.pos-bill-btn', { hasText: '500' }).click();
  await expect(page.locator('.pos-numpad-received-value')).toContainText('500');

  // Digital payment path swaps the numpad for a reference input
  await page.locator('.pos-pm-btn', { hasText: 'GCash' }).click();
  await expect(page.locator('.pos-digital-ref-input')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'POS GCash step at 390px');

  // Back to cart still works
  await page.locator('.pos-back-btn').click();
  await expect(page.locator('.pos-cart-row')).toHaveCount(1);
});

test('POS payment approvals route stays responsive at phone and desktop widths', async ({ page }) => {
  await mockLoginAs(page, 'cashier', 'POS Approvals Responsive Audit');
  await stubPosApi(page);

  for (const viewport of VIEWPORTS.filter(({ name }) => ['phone-390', 'tablet-768', 'desktop-1920'].includes(name))) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/cashier/payment-verification', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pos-kiosk')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pos-cat-tab--approvals')).toHaveClass(/active/);
    await expect(page.locator('.pa-header')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pa-card').first()).toBeVisible({ timeout: 10000 });
    await expectNoHorizontalOverflow(page, `/cashier/payment-verification at ${viewport.name}`);
  }
});
