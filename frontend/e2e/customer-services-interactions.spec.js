const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const services = [
  { title: 'Pet Hotel / Boarding', route: '/customer/hotel' },
  { title: 'Grooming', route: '/customer/grooming' },
  { title: 'Veterinary', route: '/customer/vet' },
];

test.describe('Customer service card interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockLoginAs(page, 'customer', 'Customer Services Test');
    await page.goto('/customer/services');
  });

  test('service card content is informational and only Book Now is interactive', async ({ page }) => {
    const cards = page.locator('.cs-card');
    await expect(cards).toHaveCount(services.length);

    for (const [index, service] of services.entries()) {
      const card = cards.nth(index);
      await expect(card).not.toHaveAttribute('role', 'button');
      await expect(card).not.toHaveAttribute('tabindex');
      await expect(card.getByRole('button')).toHaveCount(1);
      await expect(card.getByRole('button', { name: 'Book Now' })).toBeVisible();
      await expect(card.getByRole('heading', { name: service.title })).toBeVisible();
    }

    await cards.nth(0).locator('h3').click();
    await cards.nth(1).locator('p').click();
    await expect(page).toHaveURL(/\/customer\/services$/);
  });

  test('Book Now buttons navigate to the matching service, including keyboard activation', async ({ page }) => {
    for (const [index, service] of services.entries()) {
      await page.goto('/customer/services');
      const bookNow = page.locator('.cs-card-action').nth(index);
      await expect(bookNow).toHaveRole('button');
      if (index === 0) {
        await bookNow.focus();
        await page.keyboard.press('Enter');
      } else {
        await bookNow.click();
      }
      await expect(page).toHaveURL(new RegExp(`${service.route.replaceAll('/', '\\/')}$`));
    }
  });
});
