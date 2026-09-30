const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const { mockLoginAs } = require('./test-utils');

const dateOffset = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const earlyDate = dateOffset(1);
const laterDate = dateOffset(4);

const getFirstColumnText = (rows, index = 0) =>
  rows.locator(`td:nth-child(${index + 1})`).allTextContents();

test.describe('Receptionist bookings are listed earliest first', () => {
  test('hotel bookings put the earliest check-in at the top after filtering', async ({ page }) => {
    await mockLoginAs(page, 'receptionist', 'E2E Receptionist');
    await page.route('**/api/receptionist/boarding-requests*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ boarding_requests: [
        { id: 10, pet_name: 'Later Stay', customer_name: 'Owner B', check_in: laterDate, check_out: laterDate, room_type: 'Standard', status: 'pending', payment_status: 'unpaid' },
        { id: 11, pet_name: 'Early Stay', customer_name: 'Owner A', check_in: earlyDate, check_out: earlyDate, room_type: 'Standard', status: 'pending', payment_status: 'unpaid' },
      ] }),
    }));
    await page.route('**/api/receptionist/boarding-rooms*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rooms: [] }),
    }));

    await page.goto(`${frontendUrl}/receptionist/bookings/hotel`);
    const rows = page.locator('.bookings-table tbody tr.booking-row');
    await expect(rows).toHaveCount(2);
    expect(await getFirstColumnText(rows)).toEqual(['Early Stay', 'Later Stay']);
  });

  test('veterinary bookings put the earliest appointment at the top after filtering', async ({ page }) => {
    await mockLoginAs(page, 'receptionist', 'E2E Receptionist');
    await page.route('**/api/receptionist/requests*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ requests: [
        { id: 20, type: 'veterinary', pet: 'Later Vet', customer: 'Owner B', date: laterDate, time: '09:00', service: 'Checkup', status: 'pending' },
        { id: 21, type: 'veterinary', pet: 'Early Vet', customer: 'Owner A', date: earlyDate, time: '11:00', service: 'Checkup', status: 'pending' },
      ] }),
    }));
    await page.route('**/api/receptionist/veterinarians/available*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ veterinarians: [{ id: 1, name: 'Dr. Test' }] }),
    }));

    await page.goto(`${frontendUrl}/receptionist/bookings/veterinary`);
    const rows = page.locator('.vet-table tbody tr');
    await expect(rows).toHaveCount(2);
    expect(await getFirstColumnText(rows, 2)).toEqual(['Early Vet', 'Later Vet']);
  });

  test('grooming bookings put the earliest appointment at the top after filtering', async ({ page }) => {
    await mockLoginAs(page, 'receptionist', 'E2E Receptionist');
    await page.route('**/api/receptionist/requests*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ requests: [
        { id: 30, request_type: 'grooming', pet_name: 'Later Groom', customer_name: 'Owner B', service_name: 'Bath', date: laterDate, time: '09:00', status: 'pending' },
        { id: 31, request_type: 'grooming', pet_name: 'Early Groom', customer_name: 'Owner A', service_name: 'Bath', date: earlyDate, time: '11:00', status: 'pending' },
      ] }),
    }));

    await page.goto(`${frontendUrl}/receptionist/bookings/grooming`);
    const rows = page.locator('.grooming-table tbody tr');
    await expect(rows).toHaveCount(2);
    expect(await getFirstColumnText(rows)).toEqual(['Early Groom', 'Later Groom']);
  });
});
