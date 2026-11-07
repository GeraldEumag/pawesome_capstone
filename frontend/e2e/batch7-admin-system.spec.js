const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

const ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/users/create',
  '/admin/employees',
  '/admin/reports',
  '/admin/reports/cashier',
  '/admin/reports/inventory',
  '/admin/reports/manager',
  '/admin/reports/veterinary',
  '/admin/reports/customers',
  '/admin/reports/payments',
  '/admin/reports/orders',
  '/admin/reports/services',
  '/admin/reports/logistics',
  '/admin/reports/reception',
  '/admin/reports/attendance',
  '/admin/reports/payroll',
  '/admin/history',
  '/admin/history/logins',
  '/admin/chatbot',
  '/admin/live-chat',
  '/admin/landing-page',
  '/admin/settings',
  '/admin/profile',
];

// Admin is the all-access staff role — it may open every staff portal but is
// blocked from the customer portal.
const ADMIN_ALLOWED_STAFF_PORTALS = [
  '/receptionist',
  '/cashier',
  '/inventory',
  '/manager',
  '/veterinary',
];

const trackPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
};

test.describe('Batch 7: admin role', () => {
  test('admin lands on the admin workspace after login', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/admin/);
  });

  for (const path of ADMIN_ROUTES) {
    test(`admin can open ${path} without redirect or uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'admin');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  for (const path of ADMIN_ALLOWED_STAFF_PORTALS) {
    test(`admin can open the staff portal ${path}`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'admin');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  test('admin opening /customer is sent back to a staff workspace', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/customer');
    await expect(page).not.toHaveURL(/\/customer$/);
  });
});
