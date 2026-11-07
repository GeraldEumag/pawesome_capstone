const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

const RECEPTIONIST_ROUTES = [
  '/receptionist/bookings/hotel',
  '/receptionist/bookings/veterinary',
  '/receptionist/bookings/grooming',
  '/receptionist/walk-ins',
  '/receptionist/customers',
  '/receptionist/manage-services',
  '/receptionist/history',
  '/receptionist/chatbot',
  '/receptionist/live-chat',
  '/receptionist/profile',
  '/receptionist/reports',
];

const SUPER_RECEPTIONIST_ROUTES = [
  '/super-receptionist/bookings/hotel',
  '/super-receptionist/bookings/vet',
  '/super-receptionist/bookings/grooming',
  '/super-receptionist/walk-ins',
  '/super-receptionist/customers',
  '/super-receptionist/manage-services',
  '/super-receptionist/history',
  '/super-receptionist/cashier-payments',
  '/super-receptionist/inventory',
  '/super-receptionist/profile',
];

const trackPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
};

test.describe('Batch 2: receptionist role', () => {
  test('receptionist lands on the hotel bookings queue after login', async ({ page }) => {
    await loginAs(page, 'receptionist');
    await expect(page).toHaveURL(/\/receptionist\/bookings\/hotel/);
  });

  for (const path of RECEPTIONIST_ROUTES) {
    test(`receptionist can open ${path} without redirect or uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'receptionist');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  test('receptionist medical-confinements route redirects to the hotel bookings queue', async ({ page }) => {
    await loginAs(page, 'receptionist');
    await page.goto('/receptionist/medical-confinements');
    await expect(page).toHaveURL(/\/receptionist\/bookings\/hotel$/);
  });

  for (const path of ['/customer', '/manager', '/admin', '/cashier', '/veterinary']) {
    test(`receptionist opening ${path} is sent back to the reception portal`, async ({ page }) => {
      await loginAs(page, 'receptionist');
      await page.goto(path);
      await expect(page).toHaveURL(/\/receptionist/);
    });
  }
});

test.describe('Batch 2: super receptionist role', () => {
  for (const path of SUPER_RECEPTIONIST_ROUTES) {
    test(`super receptionist can open ${path} without redirect or uncaught errors`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await loginAs(page, 'super_receptionist');
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#root')).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }

  for (const path of ['/customer', '/admin', '/manager']) {
    test(`super receptionist opening ${path} is sent back to its own portal`, async ({ page }) => {
      await loginAs(page, 'super_receptionist');
      await page.goto(path);
      await expect(page).toHaveURL(/\/super-receptionist/);
    });
  }
});
