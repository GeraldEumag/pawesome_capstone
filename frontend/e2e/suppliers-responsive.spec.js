const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const longValue = 'LongSupplierNameWithoutSpaces'.repeat(8);

const supplierList = (name = longValue) => ({
  success: true,
  suppliers: [{
    id: 91,
    name,
    contact_person: 'A very long contact name that should remain readable',
    phone: '+63 900 123 4567',
    email: 'supplier@example.test',
    address: `${'123 Long Address Without Breaks '.repeat(8)}`,
    notes: 'Inventory source',
    is_active: true,
  }],
});

test.describe('Inventory suppliers responsive layout', () => {
  test('keeps the toolbar and modal usable at desktop, tablet, and mobile widths', async ({ page }) => {
    await mockLoginAs(page, 'inventory');
    await page.route((url) => url.pathname.endsWith('/api/inventory/suppliers'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(supplierList()) })
    );
    await page.goto('/inventory/suppliers');

    for (const width of [1440, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 850 });
      await expect(page.getByRole('heading', { name: 'Suppliers' })).toBeVisible();

      const layout = await page.evaluate(() => {
        const page = document.querySelector('.suppliers-page');
        const toolbar = document.querySelector('.suppliers-toolbar');
        const search = document.querySelector('.suppliers-search');
        const toggle = document.querySelector('.suppliers-toggle');
        const bounds = (element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        };
        return {
          pageWidth: page.clientWidth,
          pageScrollWidth: page.scrollWidth,
          search: bounds(search),
          toggle: bounds(toggle),
          toolbar: bounds(toolbar),
        };
      });
      expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageWidth + 1);
      const separateRows = layout.search.bottom <= layout.toggle.top || layout.toggle.bottom <= layout.search.top;
      const horizontalGap = layout.search.right <= layout.toggle.left || layout.toggle.right <= layout.search.left;
      expect(separateRows || horizontalGap, `search/toggle overlap at ${width}px`).toBeTruthy();

      const tableCard = page.locator('.suppliers-table-card');
      await tableCard.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      const actionsTrigger = tableCard.locator('.row-action-popover-trigger');
      await actionsTrigger.scrollIntoViewIfNeeded();
      await actionsTrigger.click();
      const actionsPanel = page.locator('.row-action-popover-panel');
      const actionsBounds = await actionsPanel.boundingBox();
      expect(actionsBounds).not.toBeNull();
      expect(actionsBounds.x).toBeGreaterThanOrEqual(0);
      expect(actionsBounds.x + actionsBounds.width).toBeLessThanOrEqual(width);
      await expect(actionsPanel.getByRole('button', { name: 'Edit' })).toBeVisible();
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'New Supplier' }).click();
      const modal = await page.locator('.sup-modal').boundingBox();
      expect(modal).not.toBeNull();
      expect(modal.x).toBeGreaterThanOrEqual(0);
      expect(modal.y).toBeGreaterThanOrEqual(0);
      expect(modal.x + modal.width).toBeLessThanOrEqual(width + 1);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
  });

  test('handles an empty supplier list without horizontal overflow', async ({ page }) => {
    await mockLoginAs(page, 'inventory');
    await page.route((url) => url.pathname.endsWith('/api/inventory/suppliers'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, suppliers: [] }) })
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/inventory/suppliers');

    await expect(page.getByText('No suppliers found.')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
