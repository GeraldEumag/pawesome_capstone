// Phase 7 verification: customer email-notification preference toggle.
// Proves the previously dead "Email Notifications" UI is wired to
// GET/PUT /api/customer/notification-preferences and persists across reload.
const { test, expect } = require('@playwright/test');
const { loginAs, apiLogin } = require('./test-utils');

const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';

function emailToggle(page) {
  // SettingItem = label text ("Email Notifications") + ToggleSwitch input.
  return page
    .getByText('Email Notifications', { exact: true })
    .locator('xpath=..')
    .locator('input[type="checkbox"]');
}

async function putPreference(request, token, email) {
  const res = await request.put(`${apiBase}/customer/notification-preferences`, {
    data: { email },
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe('Customer email-notification preference (live backend)', () => {
  test('toggle persists OFF and ON across reload via the preference API', async ({ page, request }) => {
    test.setTimeout(240000);
    const { token } = await apiLogin(request, 'customer');
    // Persisted value is read from the API, not a response listener, so the
    // check is independent of when the browser's own requests resolve.
    const readPref = async () => (await (await request.get(`${apiBase}/customer/notification-preferences`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })).json()).email;

    // Deterministic baseline: preference ON before browser interaction.
    await putPreference(request, token, true);

    await loginAs(page, 'customer');
    // The profile fetches the preference once on mount. Wait for that GET to settle
    // before interacting, so a late response can't overwrite a user toggle.
    const initialGet = page.waitForResponse(
      (r) => r.url().includes('notification-preferences') && r.request().method() === 'GET',
      { timeout: 90000 }
    );
    await page.goto(`${frontendUrl}/customer/profile`);
    await initialGet;
    await expect(page.getByText('Loading your profile')).toHaveCount(0, { timeout: 60000 });
    const checkbox = emailToggle(page);
    await expect(checkbox).toBeChecked({ timeout: 20000 });

    // OFF: toggle, then assert the server persisted it.
    await checkbox.evaluate((el) => el.click());
    await expect.poll(readPref, { timeout: 90000 }).toBe(false);
    await expect(checkbox).not.toBeChecked({ timeout: 15000 });

    // Reload must come back OFF.
    await page.reload();
    await expect(page.getByText('Loading your profile')).toHaveCount(0, { timeout: 60000 });
    await expect(checkbox).not.toBeChecked({ timeout: 20000 });

    // ON: toggle, assert persisted, reload, assert it stays ON.
    await checkbox.evaluate((el) => el.click());
    await expect.poll(readPref, { timeout: 90000 }).toBe(true);
    await expect(checkbox).toBeChecked({ timeout: 15000 });

    await page.reload();
    await expect(page.getByText('Loading your profile')).toHaveCount(0, { timeout: 60000 });
    await expect(checkbox).toBeChecked({ timeout: 20000 });
  });
});
