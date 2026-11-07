const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

const MANAGER_ROUTES = [
  '/manager',
  '/manager/staff',
  '/manager/employees',
  '/manager/payroll',
  '/manager/attendance',
  '/manager/day-offs',
  '/manager/leave',
  '/manager/history',
  '/manager/reports',
  '/manager/services',
  '/manager/id-cards',
  '/manager/holidays',
  '/manager/salary-loans',
  '/manager/thirteenth-month',
  '/manager/remittance-reports',
  '/manager/dtr-report',
  '/manager/receipt-scanner',
  '/manager/my-leave',
  '/manager/my-attendance',
  '/manager/profile',
];

const MANAGER_REDIRECTS = [
  ['/manager/payroll/computation', '/manager/payroll'],
  ['/manager/payroll/compute', '/manager/payroll'],
  ['/manager/attendance/kiosk', '/attendance-kiosk'],
  ['/manager/leaves', '/manager/leave'],
  ['/manager/schedule', '/manager/attendance'],
  ['/manager/reservations', '/manager/reports'],
  ['/manager/payments', '/manager/reports'],
  ['/manager/inventory', '/manager/reports'],
  ['/manager/customers', '/manager/reports'],
];

const trackPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
};

test.describe('Batch 6: manager role', () => {
  test('manager lands on the manager workspace after login', async ({ page }) => {
    await loginAs(page, 'manager');
    await expect(page).toHaveURL(/\/manager/);
  });

  for (const path of MANAGER_ROUTES) {
    test(`manager can open ${path} without redirect or uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'manager');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  for (const [from, to] of MANAGER_REDIRECTS) {
    test(`${from} redirects to ${to}`, async ({ page }) => {
      await loginAs(page, 'manager');
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, '\\/')}$`));
    });
  }

  for (const path of ['/customer', '/admin', '/receptionist', '/cashier', '/veterinary', '/inventory']) {
    test(`manager opening ${path} is sent back to the manager workspace`, async ({ page }) => {
      await loginAs(page, 'manager');
      await page.goto(path);
      await expect(page).toHaveURL(/\/manager/);
    });
  }
});
