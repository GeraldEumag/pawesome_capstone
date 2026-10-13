const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const paginatedLeaves = {
  success: true,
  data: {
    current_page: 1,
    data: [{
      id: 41,
      type: 'unpaid_leave',
      start_date: '2026-10-20',
      end_date: '2026-10-20',
      reason: 'Personal leave',
      status: 'pending',
      days_counted: 1,
    }],
    last_page: 1,
    total: 1,
  },
};

test.describe('Manager My Leave API contract', () => {
  test('renders entries from the paginated data.data array', async ({ page }) => {
    await mockLoginAs(page, 'manager');
    await page.route((url) => url.pathname.endsWith('/api/my-leaves'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedLeaves) })
    );
    await page.route((url) => url.pathname.endsWith('/api/my-leaves/balance'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
    );

    await page.goto('/manager/my-leave');

    await expect(page.getByText('Personal leave')).toBeVisible();
    await expect(page.getByText('Unpaid Leave')).toBeVisible();
  });

  test('submits the API field type and reports API validation failures', async ({ page }) => {
    await mockLoginAs(page, 'manager');
    let submitted = null;
    await page.route((url) => url.pathname.endsWith('/api/my-leaves'), async (route) => {
      if (route.request().method() === 'POST') {
        submitted = route.request().postDataJSON();
        await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'Validation failed.', errors: { reason: ['The reason field is required.'] } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { current_page: 1, data: [], last_page: 1, total: 0 } }) });
    });
    await page.route((url) => url.pathname.endsWith('/api/my-leaves/balance'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
    );

    await page.goto('/manager/my-leave');
    await page.getByRole('button', { name: /file leave/i }).click();
    await page.locator('.ml-form select').selectOption('unpaid_leave');
    const dates = page.locator('.ml-form input[placeholder="mm/dd/yyyy"]');
    await dates.nth(0).fill('10/20/2026');
    await dates.nth(0).press('Tab');
    await dates.nth(1).fill('10/20/2026');
    await dates.nth(1).press('Tab');
    await page.locator('.ml-form textarea').fill('Personal leave');
    await page.getByRole('button', { name: 'Submit Request' }).click();

    await expect.poll(() => submitted).not.toBeNull();
    expect(submitted).toHaveProperty('type', 'unpaid_leave');
    expect(submitted).not.toHaveProperty('leave_type');
    await expect(page.getByText(/reason field is required/i)).toBeVisible();
  });

  test('renders an empty state from an empty paginator page', async ({ page }) => {
    await mockLoginAs(page, 'manager');
    await page.route((url) => url.pathname.endsWith('/api/my-leaves'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { current_page: 1, data: [], last_page: 1, total: 0 } }) })
    );
    await page.route((url) => url.pathname.endsWith('/api/my-leaves/balance'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
    );

    await page.goto('/manager/my-leave');

    await expect(page.getByText('No leave requests yet.')).toBeVisible();
  });
});
