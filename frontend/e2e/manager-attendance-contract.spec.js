const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const attendanceUrl = (url) => url.pathname.endsWith('/api/manager/attendance');

const attendancePayload = {
  success: true,
  count: 1,
  data: [{
    id: 201,
    user_id: 8,
    name: 'Test Staff Member',
    email: 'staff@example.test',
    department: 'Front Desk',
    role: 'receptionist',
    date: '2026-10-13',
    check_in: '09:00:00',
    check_out: '17:00:00',
    status: 'present',
    total_hours: '07:00',
    overtime_hours: '00:00',
    remarks: '',
  }],
};

test.describe('Manager Attendance response handling', () => {
  test('renders the backend data array for an authorized manager', async ({ page }) => {
    await mockLoginAs(page, 'manager');
    await page.route(attendanceUrl, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attendancePayload) })
    );

    await page.goto('/manager/attendance');

    await expect(page.getByRole('heading', { name: 'Attendance Management' })).toBeVisible();
    await expect(page.locator('.attendance-table tbody')).toContainText('Test Staff Member');
  });

  test('renders a safe empty state when the API returns no attendance rows', async ({ page }) => {
    await mockLoginAs(page, 'manager');
    await page.route(attendanceUrl, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, count: 0, data: [] }) })
    );

    await page.goto('/manager/attendance');

    await expect(page.getByRole('heading', { name: 'Attendance Management' })).toBeVisible();
    await expect(page.getByText('No attendance records found')).toBeVisible();
  });
});
