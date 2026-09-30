const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const { mockLoginAs } = require('./test-utils');

const employeeResponse = {
  success: true,
  data: [{
    id: 17,
    employee_no: 'EMP-017',
    name: 'E2E Staff',
    department: 'Operations',
    position: 'Cashier',
    role: 'cashier',
    base_salary: 24000,
    is_active: true,
    employment_status: 'regular',
    hired_at: '2024-01-15',
  }],
  summary: { total: 1, active: 1, departments: ['Operations'] },
};

test.describe('Shared table row-action popover', () => {
  test('StandardTable action renderers use the compact popover and preserve the action callback', async ({ page }) => {
    await mockLoginAs(page, 'manager', 'E2E Manager');
    await page.route('**/api/manager/employees*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(employeeResponse),
    }));

    await page.goto(`${frontendUrl}/manager/employees`);
    await expect(page.locator('.standard-table tbody tr')).toHaveCount(1);
    const trigger = page.getByRole('button', { name: 'Actions for E2E Staff' });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const panel = page.getByRole('dialog', { name: 'Actions for E2E Staff' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Edit' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.locator('.ed-title').click();
    await expect(panel).toBeHidden();

    await trigger.click();
    await panel.getByRole('button', { name: 'View' }).click();
    await expect(page.getByText('E2E Staff').last()).toBeVisible();
  });

  test('Receptionist hotel actions open in a viewport-safe menu and preserve view behavior', async ({ page }) => {
    await mockLoginAs(page, 'receptionist', 'E2E Receptionist');
    await page.setViewportSize({ width: 360, height: 640 });
    let petPhotoRequest;
    await page.route('**/api/files/pet-photos/1/view*', async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': frontendUrl,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'authorization',
            'Access-Control-Allow-Credentials': 'true',
          },
        });
      }
      petPhotoRequest = request;
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'Access-Control-Allow-Origin': frontendUrl, 'Access-Control-Allow-Credentials': 'true' },
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64'),
      });
    });
    await page.route('**/api/receptionist/boarding-requests*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ boarding_requests: [{
        id: 25,
        pet_name: 'E2E Boarding Pet',
        pet: { name: 'E2E Boarding Pet', species: 'Dog', image_url: '/api/files/pet-photos/1/view?t=cache-buster' },
        customer_name: 'E2E Owner',
        check_in: '2026-09-28',
        check_out: '2026-09-29',
        room_type: 'Standard',
        status: 'pending',
        payment_status: 'unpaid',
      }] }),
    }));
    await page.route('**/api/receptionist/boarding-rooms*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rooms: [] }),
    }));

    await page.goto(`${frontendUrl}/receptionist/bookings/hotel`);
    await expect(page.locator('.bookings-table .pet-avatar-img')).toBeVisible();
    const photoUrl = new URL(petPhotoRequest.url());
    expect(photoUrl.pathname).toBe('/api/files/pet-photos/1/view');
    expect(photoUrl.searchParams.has('token')).toBe(false);
    expect(petPhotoRequest.headers().authorization).toMatch(/^Bearer\s+/i);
    const trigger = page.getByRole('button', { name: 'Actions for E2E Boarding Pet' });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Actions for E2E Boarding Pet' });
    await expect(panel.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Reject' })).toBeVisible();

    const panelBox = await panel.boundingBox();
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(360);

    await panel.getByRole('button', { name: 'View / Manage' }).click();
    await expect(page.getByText('Boarding Details')).toBeVisible();
  });

  test('Veterinary row selection and vet assignment are available inside the popover', async ({ page }) => {
    await mockLoginAs(page, 'receptionist', 'E2E Receptionist');
    await page.route('**/api/receptionist/requests*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ requests: [{
        id: 51,
        type: 'veterinary',
        pet: 'E2E Vet Pet',
        customer: 'E2E Owner',
        date: '2026-10-02',
        time: '09:30',
        service: 'Checkup',
        status: 'pending',
      }] }),
    }));
    await page.route('**/api/receptionist/veterinarians/available*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ veterinarians: [{ id: 9, name: 'Dr. E2E' }] }),
    }));

    await page.goto(`${frontendUrl}/receptionist/bookings/veterinary`);
    const trigger = page.getByRole('button', { name: 'Actions for E2E Vet Pet' });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Actions for E2E Vet Pet' });
    const selection = panel.getByRole('checkbox', { name: 'Select E2E Vet Pet for bulk actions' });
    await selection.check();
    await expect(selection).toBeChecked();

    const assignVet = panel.getByRole('combobox', { name: 'Assign veterinarian to E2E Vet Pet' });
    await assignVet.selectOption('9');
    await expect(assignVet).toHaveValue('9');
    await expect(panel.getByRole('button', { name: 'Approve' })).toBeVisible();
  });

  test('Inventory actions and row selection are grouped in the popover', async ({ page }) => {
    const duplicateKeyWarnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('same key')) duplicateKeyWarnings.push(message.text());
    });
    await mockLoginAs(page, 'inventory', 'E2E Inventory');
    await page.route('**/api/inventory/items*', (route) => {
      const url = new URL(route.request().url());
      const payload = url.pathname.endsWith('/archived')
        ? { items: [] }
        : { items: [{
          id: 9,
          name: 'E2E Kibble',
          sku: 'E2E-009',
          category: 'Food',
          supplier: 'Test Supplier',
          stock: 12,
          reorder_level: 4,
          price: 80,
          cost: 55,
          status: 'active',
        }] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto(`${frontendUrl}/inventory/products`);
    const row = page.locator('.ui-table tbody tr').first();
    await expect(row).toContainText('E2E Kibble');
    const trigger = row.getByRole('button', { name: 'Actions for E2E Kibble' });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Actions for E2E Kibble' });
    await expect(panel.getByRole('button', { name: 'View Info' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Archive' })).toBeVisible();

    const selection = panel.getByRole('checkbox', { name: 'Select E2E Kibble for bulk archive' });
    await selection.check();
    await expect(selection).toBeChecked();
    await expect(page.getByText('1 selected')).toBeVisible();
    expect(duplicateKeyWarnings).toHaveLength(0);
  });

  test('Cashier transaction actions are hidden until opened and retain their detail callback', async ({ page }) => {
    await mockLoginAs(page, 'cashier', 'E2E Cashier');
    await page.route('**/api/cashier/pos/transactions*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{
          id: 77,
          transaction_number: 'TRX-E2E-77',
          customer: { name: 'E2E Cash Customer', email: 'cash@example.test' },
          total_amount: 125,
          items: [{ item_name: 'E2E Snack', quantity: 1, total_price: 125 }],
          payments: [{ payment_method: 'cash' }],
          status: 'completed',
          created_at: new Date().toISOString(),
        }],
        current_page: 1,
        last_page: 1,
        total: 1,
      }),
    }));

    await page.goto(`${frontendUrl}/cashier/transactions`);
    const row = page.locator('.transactions-table tbody tr').first();
    await expect(row).toContainText('TRX-E2E-77');
    const trigger = row.getByRole('button', { name: 'Actions for E2E Cash Customer' });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Actions for E2E Cash Customer' });
    await expect(panel.getByRole('button', { name: 'View Details' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Void' })).toBeVisible();
    await panel.getByRole('button', { name: 'View Details' }).click();
    await expect(page.getByRole('heading', { name: 'Transaction Details' })).toBeVisible();
  });
});
