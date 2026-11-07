const { test, expect } = require('@playwright/test');
const { mockLoginAs, mockApiFallback } = require('./test-utils');

test.describe('adviser revision regressions', () => {
  test('guest booking entry offers authentication before exposing booking fields', async ({ page }) => {
    await mockApiFallback(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Book Grooming' }).click();

    await expect(page.getByRole('textbox', { name: 'Pet' })).toHaveValue('Sign in to select your registered pet');
    await expect(page.getByRole('textbox', { name: 'Pet' })).toBeDisabled();
    await expect(page.locator('select[name="pet_type"]').locator('option')).toHaveText(['Select pet type', 'Cat', 'Dog']);
  });

  test('verified customer booking shows a registered-pet selector, not a pet-type picker', async ({ page }) => {
    await mockLoginAs(page, 'customer', 'E2E Customer');
    await page.addInitScript(() => localStorage.setItem('email_verified_at', '2026-10-01T00:00:00Z'));
    await page.goto('/?book=grooming');

    const petSelect = page.locator('select[name="pet_id"]');
    await expect(petSelect).toBeVisible();
    await expect(petSelect.locator('option').first()).toHaveText('Select your pet');
    await expect(page.locator('select[name="pet_type"]')).toHaveCount(0);
  });

  test('one site menu centralizes customer and staff links at desktop width', async ({ page }) => {
    await mockApiFallback(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.locator('.landing-header').getByRole('link', { name: 'Log In' })).toBeVisible();
    await expect(page.locator('.landing-header').getByRole('link', { name: 'Create Account' })).toBeVisible();
    await expect(page.locator('.landing-header').getByRole('link', { name: 'Employee Attendance' })).toBeVisible();
    await expect(page.locator('.landing-header a[href="/login"]')).toHaveCount(1);
  });

  test('customer workspace defaults to Services and account fields remain usable on laptop and phone', async ({ page }) => {
    await mockLoginAs(page, 'customer', 'E2E Customer');
    await page.goto('/customer');
    await expect(page).toHaveURL(/\/customer\/services$/);
    await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();

    await page.goto('/register');
    await expect(page.locator('#dateOfBirth')).toBeVisible();
    await expect(page.locator('#dateOfBirth')).toHaveAttribute('placeholder', 'mm/dd/yyyy');
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

    }
  });
});
