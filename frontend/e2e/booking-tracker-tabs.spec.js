const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const booking = (id, overrides = {}) => ({
  id,
  kind: 'request',
  service_type: 'grooming',
  service_label: id,
  pet_name: 'Chuchu',
  date: '2026-10-20',
  time: '10:00',
  status: 'pending',
  status_label: 'Pending Approval',
  step_index: 0,
  step_count: 5,
  payment_status: 'paid',
  ...overrides,
});

const sampleItems = [
  booking('upcoming-paid'),
  booking('awaiting-approval-unpaid', { payment_status: 'unpaid' }),
  booking('rejected-payment', { payment_status: 'rejected' }),
  booking('in-progress-unpaid', {
    kind: 'appointment',
    service_type: 'vet',
    status: 'in_progress',
    status_label: 'In Progress',
    payment_status: 'unpaid',
  }),
  booking('grooming-in-progress', {
    kind: 'grooming',
    status: 'in_progress',
    status_label: 'In Progress',
  }),
  booking('ready-unpaid', {
    kind: 'boarding',
    service_type: 'hotel',
    status: 'ready_for_pickup',
    status_label: 'Ready for Pickup',
    payment_status: 'unpaid',
    step_count: 6,
    step_index: 4,
  }),
  booking('completed-unpaid', {
    kind: 'appointment',
    service_type: 'vet',
    status: 'completed',
    status_label: 'Completed',
    payment_status: 'unpaid',
    step_count: 6,
    step_index: 5,
  }),
  booking('picked-up', {
    kind: 'boarding',
    service_type: 'hotel',
    status: 'checked_out',
    status_label: 'Picked Up',
    step_count: 6,
    step_index: 5,
  }),
];

test.describe('Customer booking tracker tabs', () => {
  test.beforeEach(async ({ page }) => {
    await mockLoginAs(page, 'customer', 'Booking Tracker Test');
  });

  test('filters each booking into exactly one tab with the requested precedence', async ({ page }) => {
    await page.route('**/api/customer/tracking', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: sampleItems }),
      })
    );
    await page.goto('/customer/services');
    await page.getByRole('button', { name: 'Open booking tracker' }).click();

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText(['All1', 'To Pay3', 'On Going1', 'Ready for Pickup1', 'Completed2']);

    const cardNames = async () => page.locator('.bt-card-heading strong').allTextContents();
    await expect(page.getByRole('tab', { name: 'All 1' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(cardNames).toEqual(['upcoming-paid']);

    await page.getByRole('tab', { name: 'To Pay 3' }).click();
    await expect.poll(cardNames).toEqual(['awaiting-approval-unpaid', 'rejected-payment', 'in-progress-unpaid']);

    await page.getByRole('tab', { name: 'On Going 1' }).click();
    await expect.poll(cardNames).toEqual(['grooming-in-progress']);

    await page.getByRole('tab', { name: 'Ready for Pickup 1' }).click();
    await expect.poll(cardNames).toEqual(['ready-unpaid']);

    await page.getByRole('tab', { name: 'Completed 2' }).click();
    await expect.poll(cardNames).toEqual(['completed-unpaid', 'picked-up']);

    await page.getByRole('tab', { name: 'All 1' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'To Pay 3' })).toHaveAttribute('aria-selected', 'true');
  });

  test('shows every filter without clipping in the mobile bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/customer/tracking', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: sampleItems }),
      })
    );
    await page.goto('/customer/services');
    await page.getByRole('button', { name: 'Open booking tracker' }).click();

    const tabBar = page.locator('.bt-tabs');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const dimensions = await tabBar.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        tabBounds: Array.from(element.children, (tab) => {
          const { left, right } = tab.getBoundingClientRect();
          return { left, right };
        }),
      }));
      expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
      expect(dimensions.tabBounds.every((tab) => tab.left >= dimensions.left && tab.right <= dimensions.right)).toBe(true);
    }

    await page.getByRole('tab', { name: 'Completed 2' }).click();
    await expect(page.getByRole('tab', { name: 'Completed 2' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.bt-card-heading strong')).toHaveText(['completed-unpaid', 'picked-up']);
  });

  test('keeps the selected tab after refresh and shows its empty state', async ({ page }) => {
    let items = [
      booking('current-grooming', {
        kind: 'grooming',
        status: 'in_progress',
        status_label: 'In Progress',
      }),
    ];
    await page.route('**/api/customer/tracking', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items }),
      })
    );
    await page.goto('/customer/services');
    await page.getByRole('button', { name: 'Open booking tracker' }).click();
    await page.getByRole('tab', { name: 'On Going 1' }).click();
    await expect(page.locator('.bt-card')).toHaveCount(1);

    items = [booking('finished', { status: 'completed', status_label: 'Completed', step_index: 4 })];
    await page.getByRole('button', { name: 'Refresh bookings' }).click();

    await expect(page.getByRole('tab', { name: 'On Going 0' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('status')).toContainText('No services are currently in progress.');
  });
});
