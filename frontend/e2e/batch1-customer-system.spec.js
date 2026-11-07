const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

const CUSTOMER_ROUTES = [
  '/customer/services',
  '/customer/bookings',
  '/customer/pets',
  '/customer/hotel',
  '/customer/grooming',
  '/customer/vet',
  '/customer/medical-confinements',
  '/customer/profile',
  '/customer/history',
  '/customer/notifications',
  '/customer/payments',
  '/customer/reports/payments',
];

const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password'];

const trackPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
};

test.describe('Batch 1: public pages', () => {
  for (const path of PUBLIC_ROUTES) {
    test(`${path} renders without uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await page.goto(path);
      await expect(page.locator('body')).not.toBeEmpty();
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  test('login page is usable at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/login');
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Batch 1: customer role', () => {
  test('customer lands on services after login', async ({ page }) => {
    await loginAs(page, 'customer');
    await expect(page).toHaveURL(/\/customer\/services/);
  });

  for (const path of CUSTOMER_ROUTES) {
    test(`customer can open ${path} without redirect or uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'customer');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  for (const path of ['/admin', '/receptionist', '/manager', '/cashier', '/veterinary']) {
    test(`customer opening ${path} is redirected to the customer portal`, async ({ page }) => {
      await loginAs(page, 'customer');
      await page.goto(path);
      await expect(page).toHaveURL(/\/customer/);
    });
  }
});
