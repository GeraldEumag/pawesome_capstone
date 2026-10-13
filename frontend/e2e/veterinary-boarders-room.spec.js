const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

test('veterinary boarders render rooms from the response envelope and reservation relation', async ({ page }) => {
  await mockLoginAs(page, 'veterinary');
  await page.route('**/api/veterinary/boardings/current-boarders', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        boarders: [{
          id: 81,
          status: 'in_care',
          check_out: '2026-10-20',
          pet: { id: 8, name: 'Milo', species: 'Dog', breed: 'Beagle' },
          customer: { id: 9, name: 'Test Owner', phone: '555-0101' },
          service_request: {
            room_name: 'Modern Dog Suite',
            room_reservation: { room: { id: 55, room_name: 'Modern Dog Suite' } },
          },
        }],
      }),
    })
  );

  await page.goto('/veterinary/current-boarders');

  await expect(page.getByRole('heading', { name: 'Pet Hotel Boarders' })).toBeVisible();
  await expect(page.getByText('Modern Dog Suite')).toBeVisible();
});
