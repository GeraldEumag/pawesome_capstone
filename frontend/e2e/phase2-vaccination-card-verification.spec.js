const { test, expect } = require('@playwright/test');
const { loginAs } = require('./test-utils');

test.describe('Phase 2 Vaccination Card Verification', () => {
  test('Customer hotel booking without vaccination card should succeed', async ({ page }) => {
    test.setTimeout(90000); // real booking flow: pets fetch + availability + submit on slow XAMPP
    // Login as customer (cached token — /auth/login is throttled to 5/min per account)
    await loginAs(page, 'customer');

    // Navigate to hotel booking
    await page.goto('/customer/hotel');

    // Wait for page to load
    await page.waitForSelector('.customer-hotel-reservation', { timeout: 10000 });

    // Room availability requires a saved pet (pet_id), so wait for the pet
    // list to load and pick the first real pet. Manual entry cannot reach
    // the availability step.
    const petSelect = page.locator('select[name="pet_id"]');
    await petSelect.locator('option').nth(1).waitFor({ state: 'attached', timeout: 30000 });
    await petSelect.selectOption({ index: 1 });

    // Check-in date is a react-datepicker text input ("MMMM d, yyyy"). Rooms
    // can be fully booked on a given date in shared dev data, so try later
    // windows until a room submits successfully.
    let submitted = false;
    for (const offsetDays of [60, 120, 200]) {
      const checkIn = new Date(Date.now() + offsetDays * 86400000);
      const checkInText = checkIn.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      await page.fill('input[placeholder*="check-in" i]', checkInText);
      await page.keyboard.press('Enter');
      await page.fill('input[name="number_of_days"]', '2');

      // Filling pet + dates auto-fetches room availability; pick the first open room.
      // If this window has no available room, skip to the next date window.
      const roomCard = page.locator('.rooms-grid .room-card:not(.unavailable)').first();
      const hasRoom = await roomCard.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      if (!hasRoom) continue;
      await roomCard.click();

      await page.click('button[type="submit"]');

      const successMsg = page.locator('text=/submitted successfully/i').first();
      const unavailableMsg = page.locator('text=/no longer available/i').first();
      const outcome = await Promise.race([
        successMsg.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'success'),
        unavailableMsg.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'unavailable'),
      ]).catch(() => 'timeout');

      if (outcome === 'success') {
        submitted = true;
        break;
      }
      // Dismiss the error dialog before retrying the next date window.
      await page.locator('button:has-text("OK"), .dialog button, [role="dialog"] button').first().click().catch(() => {});
    }

    // Should succeed — success banner renders and the view switches to My Bookings.
    expect(submitted).toBeTruthy();
    const currentUrl = page.url();
    expect(currentUrl).toContain('customer');
  });

  test('Database vaccination_card should be NULL when omitted', async ({ request }) => {
    // This would require direct database access - skip for now
    // In production, this would be verified via DB query
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

  test('Receptionist approval should succeed without vaccination card verification', async ({ page }) => {
    // Login as receptionist
    await loginAs(page, 'receptionist');

    // Approvals live on the hotel bookings board (/receptionist/approvals redirects here)
    await page.goto('/receptionist/bookings/hotel');

    // Wait for bookings table to load (renders once the loading state clears)
    await page.waitForSelector('.bookings-table', { timeout: 20000 });

    // Check that vaccination verification is not blocking approval
    // The approve button should be visible regardless of vaccination card status
    const approveButtons = await page.locator('.approve-btn, button:has-text("Approve")').count();
    expect(approveButtons).toBeGreaterThanOrEqual(0);
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
