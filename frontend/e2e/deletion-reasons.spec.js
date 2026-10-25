const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const apiPath = (url, path) => url.pathname.endsWith(path);

test.describe('Deletion reason prompts', () => {
  test('receptionist service deletion submits its reason and surfaces API errors', async ({ page }) => {
    await mockLoginAs(page, 'receptionist');
    let payload = null;
    await page.route((url) => apiPath(url, '/api/receptionist/services'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 71, name: 'Test Grooming', category: 'Grooming', price: 500, is_active: true }] }) })
    );
    await page.route((url) => apiPath(url, '/api/receptionist/hotel-rooms'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [] }) })
    );
    await page.route((url) => apiPath(url, '/api/receptionist/services/71'), async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'Delete blocked by test.' }) });
    });

    await page.goto('/receptionist/manage-services');
    await page.getByRole('button', { name: 'Actions for Test Grooming' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.locator('#swal-reason-select').selectOption('Service permanently discontinued');
    await page.getByRole('button', { name: 'Delete Service' }).click();

    await expect.poll(() => payload).not.toBeNull();
    expect(payload).toEqual({ reason: 'Service permanently discontinued' });
    await expect(page.getByText('Delete blocked by test.')).toBeVisible();
  });

  test('boarding-room deletion collects a reason before calling the API', async ({ page }) => {
    await mockLoginAs(page, 'receptionist');
    let payload = null;
    await page.route((url) => apiPath(url, '/api/receptionist/services'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    );
    await page.route((url) => apiPath(url, '/api/receptionist/boarding-rooms'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [{ id: 72, room_code: 'QS-72', room_name: 'Quiet Suite', room_type: 'cat_condo', allowed_species: ['cat'], max_capacity: 2, total_rooms: 1, available_rooms: 1, daily_rate: 900, is_active: true }] }) })
    );
    await page.route((url) => apiPath(url, '/api/receptionist/boarding-rooms/72'), async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'Room deletion rejected by test.' }) });
    });

    await page.goto('/receptionist/manage-services');
    await page.getByRole('button', { name: 'Rooms', exact: true }).click();
    await page.getByRole('button', { name: 'Actions for Quiet Suite' }).click();
    await page.locator('.row-action-popover-panel').getByRole('button', { name: 'Delete' }).click();
    await page.locator('#swal-reason-other').fill('Room no longer meets facility requirements');
    await page.getByRole('button', { name: 'Delete Room' }).click();

    await expect.poll(() => payload).not.toBeNull();
    expect(payload).toEqual({ reason: 'Room no longer meets facility requirements' });
    await expect(page.getByText('Room deletion rejected by test.')).toBeVisible();
  });

  test('veterinary service deletion submits a required reason to the veterinary API', async ({ page }) => {
    await mockLoginAs(page, 'veterinary');
    let payload = null;
    await page.route((url) => apiPath(url, '/api/veterinary/services'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 73, name: 'Legacy Consultation', category: 'Consultation', price: 500, is_active: true }] }) })
    );
    await page.route((url) => apiPath(url, '/api/veterinary/services/73'), async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Service deleted successfully' }) });
    });

    await page.goto('/veterinary/services');
    await page.getByRole('button', { name: 'Actions for Legacy Consultation' }).click();
    await page.locator('.row-action-popover-panel').getByRole('button', { name: 'Delete' }).click();
    await page.locator('#swal-reason-select').selectOption('Replaced by an updated service');
    await page.getByRole('button', { name: 'Delete Service' }).click();

    await expect.poll(() => payload).not.toBeNull();
    expect(payload).toEqual({ reason: 'Replaced by an updated service' });
    await expect(page.getByText('Deleted successfully.')).toBeVisible();
  });

  test('holiday deletion submits a reason and displays backend failures', async ({ page }) => {
    await mockLoginAs(page, 'manager');
    let payload = null;
    await page.route((url) => apiPath(url, '/api/manager/holidays'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 74, date: '2026-10-21', name: 'Audit Holiday', type: 'regular', is_recurring: false }] }) })
    );
    await page.route((url) => apiPath(url, '/api/manager/holidays/74'), async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'Holiday archive rejected by test.' }) });
    });

    await page.goto('/manager/holidays');
    await page.getByRole('button', { name: 'Actions for Audit Holiday' }).click();
    await page.getByRole('button', { name: 'Archive' }).click();
    await page.locator('#swal-reason-other').fill('Holiday entry was added in error');
    await page.getByRole('button', { name: 'Archive' }).click();

    await expect.poll(() => payload).not.toBeNull();
    expect(payload).toEqual({ reason: 'Holiday entry was added in error' });
    await expect(page.getByText('Holiday archive rejected by test.')).toBeVisible();
    await expect(page.getByText('Audit Holiday')).toBeVisible();
  });
});
