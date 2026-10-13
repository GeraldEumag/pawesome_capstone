const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const baseBoarding = {
  id: 123,
  pet: { id: 7, name: 'Milo', species: 'Dog' },
  customer: { id: 8, name: 'Test Customer', phone: '555-0101' },
  check_in: '2026-10-20',
  check_out: '2026-10-20',
  status: 'approved',
  payment_status: 'unpaid',
  total_amount: 800,
};

const modernRoom = {
  id: 55,
  room_code: 'MOD-55',
  room_name: 'Modern Dog Suite',
  room_type: 'dog_standard',
  allowed_species: ['dog'],
  max_capacity: 1,
  total_rooms: 1,
  available_rooms: 0,
  daily_rate: 800,
  is_active: true,
  customer_selectable: true,
};

const installRoomRoutes = async (page, boarding, scheduledRequests) => {
  await page.route((url) => url.pathname.endsWith('/api/receptionist/boarding-requests'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [boarding], boardings: [boarding] }) })
  );
  await page.route((url) => url.pathname.endsWith(`/api/receptionist/boarding-requests/${boarding.id}/schedule`), async (route) => {
    scheduledRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Boarding request scheduled', boarding }) });
  });
  await page.route((url) => url.pathname.endsWith('/api/receptionist/boarding-rooms'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [modernRoom] }) })
  );
  await page.route((url) => url.pathname.endsWith('/api/receptionist/hotel-rooms'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [{ id: 55, name: 'Legacy Room 55', room_number: 'L-55', status: 'available' }] }) })
  );
};

test.describe('Receptionist room table identity and persistence', () => {
  test('renders a service-request reservation and schedules by boarding-room ID', async ({ page }) => {
    await mockLoginAs(page, 'receptionist');
    const boarding = {
      ...baseBoarding,
      service_request: {
        id: 321,
        boarding_room_id: modernRoom.id,
        room_name: modernRoom.room_name,
        room_reservation: { room: modernRoom },
      },
    };
    const scheduledRequests = [];
    await installRoomRoutes(page, boarding, scheduledRequests);

    await page.goto('/receptionist/bookings/hotel');
    await expect(page.locator('.booking-row .room-cell')).toContainText('Modern Dog Suite');
    await page.locator('.booking-row .row-action-popover-trigger').click();
    await page.getByRole('button', { name: 'View / Manage' }).click();
    await expect(page.locator('.hbk-grid')).toContainText('Modern Dog Suite');
    await expect(page.locator('.hbk-panel select')).toHaveValue('boarding:55');
    await page.getByRole('button', { name: /schedule boarding/i }).click();

    await expect.poll(() => scheduledRequests.length).toBe(1);
    expect(scheduledRequests[0]).toHaveProperty('room_id', 55);
    expect(scheduledRequests[0]).not.toHaveProperty('hotel_room_id');
  });

  test('keeps legacy hotel-room IDs separate when a numeric ID overlaps', async ({ page }) => {
    await mockLoginAs(page, 'receptionist');
    const boarding = {
      ...baseBoarding,
      hotel_room_id: 55,
      hotel_room: { id: 55, name: 'Legacy Room 55', room_number: 'L-55' },
    };
    const scheduledRequests = [];
    await installRoomRoutes(page, boarding, scheduledRequests);

    await page.goto('/receptionist/bookings/hotel');
    await expect(page.locator('.booking-row .room-cell')).toContainText('Legacy Room 55');
    await page.locator('.booking-row .row-action-popover-trigger').click();
    await page.getByRole('button', { name: 'View / Manage' }).click();
    await expect(page.locator('.hbk-panel select')).toHaveValue('hotel:55');
    await page.getByRole('button', { name: /schedule boarding/i }).click();

    await expect.poll(() => scheduledRequests.length).toBe(1);
    expect(scheduledRequests[0]).toHaveProperty('hotel_room_id', 55);
    expect(scheduledRequests[0]).not.toHaveProperty('room_id');
  });
});
