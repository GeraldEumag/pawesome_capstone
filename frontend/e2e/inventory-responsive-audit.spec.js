const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const INVENTORY_ROUTES = [
  '/inventory',
  '/inventory/products',
  '/inventory/simplified',
  '/inventory/stock',
  '/inventory/management',
  '/inventory/legacy-products',
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

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 900 },
  { name: 'macbook-1512', width: 1512, height: 982 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const FULL_AUDIT_ROUTES = new Set([
  '/inventory',
  '/inventory/products',
  '/inventory/history',
  '/inventory/reports',
  '/inventory/monthly-audit',
  '/inventory/audit-analytics',
  '/inventory/suppliers',
  '/inventory/barcodes',
]);

async function stubInventoryApi(page) {
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
        inventory: [],
        logs: [],
        movements: [],
        batches: [],
        suppliers: [],
        reports: [],
        audits: [],
        stats: {},
      };

      if (url.pathname === '/api/settings/public') {
        body = { theme_color: 'cream-white' };
      } else if (url.pathname === '/api/inventory/dashboard') {
        body = {
          total_items: 42,
          low_stock_items: 4,
          out_of_stock_items: 1,
          total_inventory_value: 75250,
          expiring_soon: 2,
          inventory_changes_today: 7,
          recent_transactions: [],
          critical_items: [],
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

async function navigateWithinInventory(page, route) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test('Inventory dashboard routes stay responsive and scoped to the Inventory workspace', async ({ page }) => {
  test.setTimeout(240000);
  await mockLoginAs(page, 'inventory', 'Inventory Responsive Audit');
  await stubInventoryApi(page);
  await page.goto('/inventory', { waitUntil: 'domcontentloaded' });

  for (const route of INVENTORY_ROUTES) {
    const viewports = FULL_AUDIT_ROUTES.has(route)
      ? VIEWPORTS
      : VIEWPORTS.filter(({ name }) => ['phone-390', 'laptop-1366'].includes(name));

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinInventory(page, route);
      await expect(
        page.locator('.app-dashboard.inventory-dashboard'),
        `${route} at ${viewport.name} should render the Inventory workspace; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 10000 });

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/inventory' && ['phone-390', 'laptop-1366'].includes(viewport.name)) {
        await test.info().attach(`inventory-dashboard-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
});

test('Inventory tablet navigation opens and closes the dashboard drawer', async ({ page }) => {
  await mockLoginAs(page, 'inventory', 'Inventory Drawer Audit');
  await stubInventoryApi(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/inventory');

  const sidebar = page.locator('.app-sidebar.inventory-sidebar');
  await expect(page.locator('.mobile-menu-toggle')).toBeVisible();
  await page.locator('.mobile-menu-toggle').click();
  await expect(sidebar).toHaveClass(/mobile-open/);
  await sidebar.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/inventory\/reports$/);
  await expect(sidebar).not.toHaveClass(/mobile-open/);
});

test('Inventory overrides do not restyle reused Super Receptionist inventory pages', async ({ page }) => {
  await mockLoginAs(page, 'super_receptionist', 'Inventory Reuse Scope Audit');
  await stubInventoryApi(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/super-receptionist/inventory');

  await expect(page.locator('.app-dashboard.super-receptionist-layout')).toBeVisible();
  await expect(page.locator('.app-dashboard.inventory-dashboard')).toHaveCount(0);
  await expect(page.locator('.unified-inventory')).toBeVisible();
});
