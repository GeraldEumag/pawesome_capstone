const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

const CASHIER_ROUTES = [
  '/cashier',
  '/cashier/pos',
  '/cashier/dashboard',
  '/cashier/payment-verification',
  '/cashier/sales',
  '/cashier/transactions',
  '/cashier/analytics',
  '/cashier/history',
  '/cashier/reports',
  '/cashier/payroll',
  '/cashier/profile',
];

const trackPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
};

test.describe('Batch 3: cashier role', () => {
  test('cashier lands on the cashier workspace after login', async ({ page }) => {
    await loginAs(page, 'cashier');
    await expect(page).toHaveURL(/\/cashier/);
  });

  for (const path of CASHIER_ROUTES) {
    test(`cashier can open ${path} without redirect or uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'cashier');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  for (const path of ['/customer', '/admin', '/manager', '/receptionist', '/veterinary', '/inventory']) {
    test(`cashier opening ${path} is sent back to the cashier workspace`, async ({ page }) => {
      await loginAs(page, 'cashier');
      await page.goto(path);
      await expect(page).toHaveURL(/\/cashier/);
    });
  }
});

test.describe('Batch 3: cashier access for composite and admin roles', () => {
  // routeRoleMap allows super_receptionist and admin on /cashier/*.
  for (const [role, path] of [['super_receptionist', '/cashier/pos'], ['admin', '/cashier/pos']]) {
    test(`${role} can open ${path} without redirect`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, role);
      await page.goto(path);
      await expect(page).toHaveURL(/\/cashier\/pos$/);
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  test('customer opening /cashier/pos is sent to the customer portal', async ({ page }) => {
    await loginAs(page, 'customer');
    await page.goto('/cashier/pos');
    await expect(page).toHaveURL(/\/customer/);
  });
});
