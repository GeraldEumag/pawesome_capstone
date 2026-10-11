const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

test.describe('Customer UI polish', () => {
  test.beforeEach(async ({ page }) => {
    await mockLoginAs(page, 'customer', 'Customer UI Test');
  });

  test('profile settings display English as a fixed language', async ({ page }) => {
    await mockLoginAs(page, 'receptionist', 'Profile Language Test');
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, name: 'Profile Language Test', email: 'receptionist@example.com', role: 'receptionist' }),
      })
    );
    await page.goto('/receptionist/profile');

    await expect(page.locator('[aria-label="Language set to English"]')).toBeVisible();
    await expect(page.locator('select option[value="es"]')).toHaveCount(0);
    await expect(page.locator('select option[value="fr"]')).toHaveCount(0);
    await expect(page.locator('select option[value="de"]')).toHaveCount(0);
  });

  test('hotel booking shows full selected-pet details', async ({ page }) => {
    await page.route('**/api/customer/pets', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pets: [{
            id: 37,
            name: 'Chuchu',
            species: 'Dog',
            breed: 'Shih Tzu',
            gender: 'Female',
            birthdate: '2024-09-01',
            notes: 'Needs medication with dinner.',
          }],
        }),
      })
    );
    await page.goto('/customer/hotel');
    await page.locator('select[name="pet_id"]').selectOption('37');

    const details = page.locator('.customer-pet-details');
    await expect(details).toBeVisible();
    await expect(details).toContainText('Chuchu');
    await expect(details).toContainText('Dog');
    await expect(details).toContainText('Shih Tzu');
    await expect(details).toContainText('Female');
    await expect(details).toContainText('2 years');
    await expect(details).toContainText('September 1, 2024');
    await expect(details).toContainText('Needs medication with dinner.');
  });

  test('grooming and veterinary bookings show the same selected-pet details', async ({ page }) => {
    await page.route('**/api/customer/pets', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pets: [{
            id: 37,
            name: 'Chuchu',
            species: 'Dog',
            breed: 'Shih Tzu',
            gender: 'Female',
            birthdate: '2024-09-01',
            notes: 'Needs medication with dinner.',
          }],
        }),
      })
    );

    for (const path of ['/customer/grooming', '/customer/vet']) {
      await page.goto(path);
      await page.locator('select[name="pet_id"]').selectOption('37');
      const details = page.locator('.customer-pet-details');
      await expect(details).toBeVisible();
      await expect(details).toContainText('Chuchu');
      await expect(details).toContainText('Dog');
      await expect(details).toContainText('Shih Tzu');
      await expect(details).toContainText('Female');
      await expect(details).toContainText('2 years');
      await expect(details).toContainText('September 1, 2024');
      await expect(details).toContainText('Needs medication with dinner.');
    }
  });

  test('customer chatbot uses a full-width, usable bottom sheet on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/customer/services');
    await page.locator('.rbac-chatbot-toggle').click();

    const panel = page.locator('.rbac-chatbot-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.rbac-chatbot-header')).toHaveCSS('flex-direction', 'row');
    await expect(panel.locator('.rbac-chatbot-form')).toHaveCSS('flex-direction', 'row');
    await expect(panel.locator('.rbac-quick-actions-bar')).toBeVisible();

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const dimensions = await panel.evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: element.getBoundingClientRect().left,
      }));
      expect(dimensions.width).toBeGreaterThanOrEqual(width - 4);
      expect(dimensions.scrollWidth).toBe(dimensions.width);
      expect(dimensions.left).toBe(0);
    }
  });
});
