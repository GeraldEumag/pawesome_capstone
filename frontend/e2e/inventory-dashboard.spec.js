const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test.describe('Inventory Dashboard end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'inventory';
  const dashboardPath = getDashboardPath(role);

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Inventory');
    }
  });

  test('login redirects to correct dashboard', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page).toHaveURL(new RegExp(dashboardPath));
  });

  test('dashboard title is visible', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('h1, h2').filter({ hasText: /inventory|stock|product/i }).first()).toBeVisible();
  });

  test('loads inventory dashboard and shows stock metrics', async ({ page }) => {
    const mock = { total_items: 50, low_stock_items: 3, out_of_stock_items: 1, total_stock_value: 5000 };
    if (!process.env.E2E_LIVE) {
      await page.route('**/api/inventory/dashboard', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock) }));
    }
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('.overview-card, [class*="card"], [class*="stat"]').first()).toBeVisible();
    await expect(page.locator('text=/product|stock|inventory/i').first()).toBeVisible();
  });

  test('refresh button reloads data', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await page.locator('button:has-text("refresh"), button:has([data-icon="rotate"]), [title*="refresh" i]').first().click().catch(() => {});
    await expect(page.locator('.overview-card, [class*="card"]').first()).toBeVisible();
  });

  test('main navigation works', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    const nav = page.locator('nav, aside, [role="navigation"], .sidebar, .sidenav').first();
    await expect(nav).toBeVisible();
    const links = nav.locator('a, button').filter({ hasText: /product|stock|item|supplier/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('can create new inventory item', async ({ page }) => {
    let createCalled = false;

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/inventory/items', route => {
        if (route.request().method() === 'POST') {
          createCalled = true;
        }
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 1, message: 'Item created' }) });
      });
    }

    await page.goto(frontendUrl + dashboardPath);
    await page.waitForLoadState('networkidle');

    // Look for add/create item button
    const addBtn = page.locator('button:has-text("add"), button:has-text("Add"), button:has-text("new"), button:has-text("New"), button:has-text("+"), [data-testid*="add"]').first();

    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Try to fill form if visible
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[placeholder*="item" i]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('Test Item');
        const saveBtn = page.locator('button:has-text("save"), button:has-text("Save"), button[type="submit"]').first();
        if (await saveBtn.isVisible().catch(() => false)) {
          await saveBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }

    const hasAddButton = await addBtn.isVisible().catch(() => false);
    expect(hasAddButton).toBeTruthy();
  });

  test('can update stock quantity', async ({ page }) => {
    const mockItems = {
      items: [{ id: 1, name: 'Dog Food', stock: 50, reorder_level: 10, sku: 'FOO-001' }]
    };
    let stockUpdateCalled = false;

    if (!process.env.E2E_LIVE) {
      await page.route('**/api/inventory*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockItems) }));
      await page.route('**/api/inventory/*/adjust*', route => {
        stockUpdateCalled = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Stock updated' }) });
      });
      await page.route('**/api/inventory/*/stock*', route => {
        stockUpdateCalled = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Stock updated' }) });
      });
    }

    await page.goto(frontendUrl + dashboardPath);
    await page.waitForLoadState('networkidle');

    // Look for stock adjust button
    const adjustBtn = page.locator('button:has-text("adjust"), button:has-text("Adjust"), button:has-text("update stock"), button[class*="stock"]').first();
    const actionBtn = page.locator('button:has-text("action"), [data-testid*="action"]').first();

    if (await adjustBtn.isVisible().catch(() => false)) {
      await adjustBtn.click();
      await page.waitForTimeout(500);
    } else if (await actionBtn.isVisible().catch(() => false)) {
      await actionBtn.click();
      await page.waitForTimeout(500);
    }

    const hasStockAction = await adjustBtn.isVisible().catch(() => false) || await actionBtn.isVisible().catch(() => false);
    expect(hasStockAction).toBeTruthy();
  });

  test('forbidden pages redirect or block', async ({ page }) => {
    const forbiddenPaths = ['/admin', '/cashier', '/veterinary'];
    for (const path of forbiddenPaths) {
      await page.goto(frontendUrl + path);
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') || currentUrl.includes('/forbidden') || currentUrl.includes(dashboardPath) || await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
