const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

const FRONTEND = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

test.describe('Transaction Management checks', () => {
  test('search icon does not overlap input text', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.goto(`${FRONTEND}/cashier/transactions`, { waitUntil: 'domcontentloaded' });

    const input = page.locator('.cashier-transactions .search-box input');
    await expect(input).toBeVisible({ timeout: 20000 });

    // Icon must sit inside the input's left padding zone, not over text.
    const metrics = await page.evaluate(() => {
      const box = document.querySelector('.cashier-transactions .search-box');
      const icon = box?.querySelector('svg');
      const inp = box?.querySelector('input');
      if (!box || !icon || !inp) return null;
      const ib = icon.getBoundingClientRect();
      const pb = inp.getBoundingClientRect();
      const pl = parseFloat(getComputedStyle(inp).paddingLeft);
      return { iconLeft: ib.left - pb.left, iconRight: ib.right - pb.left, padLeft: pl };
    });
    expect(metrics, 'search box metrics present').not.toBeNull();
    expect(metrics.iconLeft).toBeGreaterThan(0);
    // Icon right edge must not intrude past the text start (padding-left).
    expect(metrics.iconRight).toBeLessThanOrEqual(metrics.padLeft + 4);

    await input.fill('zzzz-not-a-customer');
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/tx-search-no-overlap.png' });
  });

  test('view details loads authoritative receipt sections', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.goto(`${FRONTEND}/cashier/transactions`, { waitUntil: 'domcontentloaded' });

    // Actions sit inside RowActionPopover — open the first row's menu.
    const trigger = page.locator('.cashier-transactions .row-action-popover-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 20000 });
    await trigger.click();

    const viewBtn = page.locator('.row-action-popover-panel .action-btn.view').first();
    await expect(viewBtn).toBeVisible({ timeout: 5000 });
    await viewBtn.click();

    const modal = page.locator('.transaction-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('text=Net Amount (ex-VAT)')).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('text=VAT (12%, included)')).toBeVisible();
    await expect(modal.locator('text=Amount Paid')).toBeVisible();
    await page.screenshot({ path: 'test-results/tx-details-modal.png' });
  });
});
