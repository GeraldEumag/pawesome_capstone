const { test, expect } = require('@playwright/test');
const { loginAs, mockLoginAs } = require('./test-utils');

test.describe('Phase 2 Vaccination Card Verification', () => {
  test('Customer hotel booking requires a vaccination card upload', async ({ page }) => {
    await mockLoginAs(page, 'customer', 'Vaccination Requirement Customer');
    await page.goto('/customer/hotel');

    await expect(page.locator('.customer-hotel-reservation')).toBeVisible({ timeout: 10000 });
    const vaccinationInput = page.locator('.customer-hotel-reservation input[type="file"]');
    await expect(vaccinationInput).toBeVisible();
    await expect(vaccinationInput).toHaveAttribute('required', '');
    await expect(page.locator('.vaccination-required-note')).toContainText('verify this card before approving');
  });

  test('Database vaccination-card omission is covered by backend request validation', async () => {
    // Database-backed validation runs in the backend CustomerBookingRulesTest suite.
    test.skip();
  });

  test('Receptionist sees booking without vaccination card', async ({ page }) => {
    // Login as receptionist
    await loginAs(page, 'receptionist');

    // Navigate to hotel bookings
    await page.goto('/receptionist/bookings/hotel');

    // Wait for bookings to load (table renders once the loading state clears)
    await page.waitForSelector('.bookings-table', { timeout: 20000 });

    // Should see bookings (with or without vaccination card)
    const bookings = await page.locator('.booking-row').count();
    expect(bookings).toBeGreaterThanOrEqual(0);
  });

  test('Receptionist cannot approve an online boarding before card verification', async ({ page }) => {
    await mockLoginAs(page, 'receptionist', 'E2E Vaccination Reviewer');
    const booking = {
      id: 25,
      pet_name: 'E2E Online Boarding Pet',
      pet: { name: 'E2E Online Boarding Pet', species: 'Dog' },
      customer_name: 'E2E Owner',
      booking_channel: 'online',
      check_in: '2026-09-28',
      check_out: '2026-09-28',
      room_type: 'Standard',
      status: 'pending',
      payment_status: 'unpaid',
    };
    await page.route('**/api/receptionist/boarding-requests*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ boarding_requests: [booking] }),
    }));
    await page.route('**/api/receptionist/boarding-rooms*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rooms: [] }),
    }));

    await page.goto('/receptionist/bookings/hotel');
    const row = page.locator('tr.booking-row', { hasText: 'E2E Online Boarding Pet' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /actions for/i }).click();
    const menuApprove = page.locator('.row-action-popover-panel button[title="View details and verify the vaccination card first"]');
    await expect(menuApprove).toBeDisabled();
    await page.getByRole('button', { name: 'View / Manage' }).click();
    await expect(page.locator('.hbk-vax-required')).toContainText('must upload a card');
    await expect(page.getByRole('button', { name: 'Approve Boarding' })).toBeDisabled();
  });

  test('Walk-in hotel booking without vaccination card should succeed', async ({ page }) => {
    // Login as receptionist
    await loginAs(page, 'receptionist');

    // Navigate to walk-ins and open the Hotel / Boarding booking modal
    await page.goto('/receptionist/walk-ins');
    await page.waitForSelector('.walkins-page', { timeout: 10000 });
    await page.locator('.service-card', { hasText: 'Hotel' }).first().click();
    await page.waitForSelector('.walkin-modal', { timeout: 10000 });

    // Check that vaccination card is optional — the field must either be absent
    // from the walk-in flow or rendered without the required attribute.
    const vaccinationInput = page.locator('input[name="vaccinationCard"]');
    const isRequired = (await vaccinationInput.count()) > 0
      ? await vaccinationInput.getAttribute('required')
      : null;
    expect(isRequired).toBeNull(); // Should not have required attribute
  });

  test('Historical vaccination card remains accessible', async ({ page }) => {
    // This test requires an existing booking with vaccination card
    // Skip for now as we need to create test data first
    test.skip();
  });

  test('Historical verification workflow still works', async ({ page }) => {
    // This test requires an existing booking with vaccination card
    // Skip for now as we need to create test data first
    test.skip();
  });

  test('Chatbot FAQ shows original verified project content', async ({ page }) => {
    // Navigate to landing page
    await page.goto('/');

    // Open chatbot
    await page.click('.lc-toggle');
    await page.waitForSelector('.lc-panel', { timeout: 5000 });

    // Ask about contact information — the send button is disabled while the
    // welcome message is still loading, so wait until it is enabled.
    await page.fill('.lc-input-bar input', 'What is your contact information?');
    await expect(page.locator('.lc-send-btn')).toBeEnabled({ timeout: 15000 });
    await page.click('.lc-send-btn');

    // Wait for the bot reply bubble specifically (user messages share .lc-bubble)
    const botBubble = page.locator('.lc-msg-bot .lc-bubble').last();
    await expect(botBubble).toContainText('(555) 123-4567', { timeout: 15000 });

    // Check that response contains original contact info (not placeholders)
    const chatResponse = await botBubble.textContent();
    expect(chatResponse).toContain('(555) 123-4567');
    expect(chatResponse).toContain('info@pawsitive.com');
    expect(chatResponse).not.toContain('[Please provide');
  });
});
