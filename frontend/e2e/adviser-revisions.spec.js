const { test, expect } = require('@playwright/test');
const { mockLoginAs, mockApiFallback } = require('./test-utils');

test.describe('adviser revision regressions', () => {
  test('guest booking entry offers authentication before exposing booking fields', async ({ page }) => {
    await mockApiFallback(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Book Grooming' }).click();

    await expect(page.locator('.svc-auth-gate')).toBeVisible();
    await expect(page.getByLabel(/Pet Name/)).toHaveCount(0);
    await expect(page.getByLabel(/Pet Type/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/register$/);

    const pendingIntent = await page.evaluate(() => JSON.parse(localStorage.getItem('pawesome_pending_service_intent')));
    expect(pendingIntent.service_type).toBe('grooming');
    expect(pendingIntent.form_data).toBeUndefined();
  });

  test('authenticated landing booking exposes only Cat and Dog pet types', async ({ page }) => {
    await mockLoginAs(page, 'customer', 'E2E Customer');
    await page.addInitScript(() => localStorage.setItem('email_verified_at', '2026-10-01T00:00:00Z'));
    await page.goto('/?book=grooming');

    const petType = page.locator('select[name="pet_type"]');
    await expect(petType).toBeVisible();
    await expect(petType.locator('option')).toHaveText(['Select pet type', 'Cat', 'Dog']);
  });

  test('one site menu centralizes customer and staff links at desktop width', async ({ page }) => {
    await mockApiFallback(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open site menu' }).click();
    await expect(page.locator('.landing-mobile-nav')).toBeVisible();
    await expect(page.locator('.landing-mobile-nav').getByRole('link', { name: 'Log In' })).toBeVisible();
    await expect(page.locator('.landing-mobile-nav').getByRole('link', { name: 'Create Account' })).toBeVisible();
    await expect(page.locator('.landing-mobile-nav-staff').getByRole('link', { name: 'Employee Attendance' })).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toHaveCount(1);
  });

  test('customer workspace defaults to Services and account fields remain usable on laptop and phone', async ({ page }) => {
    await mockLoginAs(page, 'customer', 'E2E Customer');
    await page.goto('/customer');
    await expect(page).toHaveURL(/\/customer\/services$/);
    await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();

    await page.goto('/register');
    await expect(page.locator('#dateOfBirth')).toHaveAttribute('readonly', '');
    await expect(page.locator('.register-phone-input').first().locator('span')).toHaveText('09');
    await page.locator('#contactNumber').fill('09171234567');
    await expect(page.locator('#contactNumber')).toHaveValue('171234567');
    await page.locator('#contactNumber').fill('abc123456789');
    await expect(page.locator('#contactNumber')).toHaveValue('123456789');

    for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
      await expect(page.locator('.register-card')).toBeVisible();
    }
  });

  test('hotel walk-in modals lock page scroll and stay within laptop and phone viewports', async ({ page }) => {
    await mockLoginAs(page, 'receptionist', 'E2E Receptionist');

    for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/receptionist/walk-ins');
      await page.getByRole('button', { name: /New Booking/ }).first().click();
      let modal = page.locator('.hbk-modal');
      await expect(modal).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
      let bounds = await modal.boundingBox();
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
      await modal.locator('.close-btn').click();

      await page.goto('/receptionist/bookings/hotel');
      await page.getByRole('button', { name: /New Walk-in/ }).click();
      modal = page.locator('.hbk-booking-modal');
      await expect(modal).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
      bounds = await modal.boundingBox();
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
      await modal.locator('.close-btn').click();
    }
  });
});
