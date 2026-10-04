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
    const { token } = await apiLogin(request, 'customer');

    // Deterministic baseline: preference ON before browser interaction.
    await putPreference(request, token, true);

    await loginAs(page, 'customer');
    const getResponse = page.waitForResponse(
      (r) => r.url().includes('notification-preferences') && r.request().method() === 'GET'
    );
    await page.goto(`${frontendUrl}/customer/profile`);
    const initial = await getResponse;
    expect((await initial.json()).email).toBe(true);

    const checkbox = emailToggle(page);
    await expect(checkbox).toBeChecked();

    // OFF: toggle → PUT 200 {email:false} → stays off after reload.
    const [putOff] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('notification-preferences') && r.request().method() === 'PUT'
      ),
      checkbox.evaluate((el) => el.click()),
    ]);
    expect((await putOff.json()).email).toBe(false);
    await expect(checkbox).not.toBeChecked();

    const reloadGet = page.waitForResponse(
      (r) => r.url().includes('notification-preferences') && r.request().method() === 'GET'
    );
    await page.reload();
    // Reload refetches the persisted preference — must come back OFF.
    expect((await (await reloadGet).json()).email).toBe(false);
    await expect(checkbox).not.toBeChecked({ timeout: 15000 });
    const persistedOff = await request.get(`${apiBase}/customer/notification-preferences`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    expect((await persistedOff.json()).email).toBe(false);

    // ON: toggle → PUT 200 {email:true} → stays on after reload.
    const [putOn] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('notification-preferences') && r.request().method() === 'PUT'
      ),
      checkbox.evaluate((el) => el.click()),
    ]);
    expect((await putOn.json()).email).toBe(true);
    await expect(checkbox).toBeChecked();

    const reloadGetOn = page.waitForResponse(
      (r) => r.url().includes('notification-preferences') && r.request().method() === 'GET'
    );
    await page.reload();
    expect((await (await reloadGetOn).json()).email).toBe(true);
    await expect(checkbox).toBeChecked({ timeout: 15000 });
  });
});
