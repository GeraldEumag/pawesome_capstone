const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

const INVENTORY_ROUTES = [
  '/inventory',
  '/inventory/products',
  '/inventory/stock',
  '/inventory/history',
  '/inventory/analytics',
  '/inventory/reports',
  '/inventory/monthly-audit',
  '/inventory/monthly-audit-report',
  '/inventory/audit-analytics',
  '/inventory/suppliers',
  '/inventory/barcodes',
  '/inventory/payroll',
  '/inventory/profile',
];

const trackPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
};

test.describe('Batch 5: inventory role', () => {
  test('inventory lands on the inventory workspace after login', async ({ page }) => {
    await loginAs(page, 'inventory');
    await expect(page).toHaveURL(/\/inventory/);
  });

  for (const path of INVENTORY_ROUTES) {
    test(`inventory can open ${path} without redirect or uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'inventory');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  // Legacy aliases intentionally redirect to canonical routes
  // (frontend/src/routes/InventoryRoutes.jsx) — assert the redirect,
  // not URL stability.
  const LEGACY_REDIRECTS = {
    '/inventory/simplified': '/inventory/stock',
    '/inventory/management': '/inventory/products',
    '/inventory/legacy-products': '/inventory/products',
  };
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    test(`inventory opening ${from} redirects to ${to}`, async ({ page }) => {
      await loginAs(page, 'inventory');
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, '\\/')}$`));
    });
  }

  for (const path of ['/customer', '/admin', '/manager', '/receptionist', '/cashier', '/veterinary']) {
    test(`inventory opening ${path} is sent back to the inventory workspace`, async ({ page }) => {
      await loginAs(page, 'inventory');
      await page.goto(path);
      await expect(page).toHaveURL(/\/inventory/);
    });
  }
});
