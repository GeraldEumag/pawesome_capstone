const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

const VET_ROUTES = [
  '/veterinary',
  '/veterinary/appointments',
  '/veterinary/services',
  '/veterinary/history',
  '/veterinary/customer-profiles',
  '/veterinary/reports',
  '/veterinary/receipt',
  '/veterinary/current-boarders',
  '/veterinary/medical-confinements',
  '/veterinary/payroll',
  '/veterinary/profile',
];

const trackPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
};

test.describe('Batch 4: veterinary role', () => {
  test('veterinary lands on the veterinary workspace after login', async ({ page }) => {
    await loginAs(page, 'veterinary');
    await expect(page).toHaveURL(/\/veterinary/);
  });

  for (const path of VET_ROUTES) {
    test(`veterinary can open ${path} without redirect or uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'veterinary');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  for (const path of ['/customer', '/admin', '/manager', '/receptionist', '/cashier', '/inventory']) {
    test(`veterinary opening ${path} is sent back to the veterinary workspace`, async ({ page }) => {
      await loginAs(page, 'veterinary');
      await page.goto(path);
      await expect(page).toHaveURL(/\/veterinary/);
    });
  }
});
