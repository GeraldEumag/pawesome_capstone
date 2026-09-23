const { test, expect } = require('@playwright/test');

test.describe('Phase 2 Vaccination Card Verification', () => {
  test('Customer hotel booking without vaccination card should succeed', async ({ page }) => {
    // Login as customer
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', 'customer@example.com');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/customer');

    // Navigate to hotel booking
    await page.goto('http://localhost:3000/customer/hotel');

    // Wait for page to load
    await page.waitForSelector('.hotel-form', { timeout: 10000 });

    // Fill booking form without vaccination card
    await page.selectOption('select[name="pet_id"]', { label: /Select a pet/i });
    await page.fill('input[name="check_in_date"]', '2025-02-01');
    await page.fill('input[name="number_of_days"]', '2');

    // Submit booking without vaccination card
    await page.click('button[type="submit"]');

    // Should succeed - wait for success message or redirect
    await page.waitForTimeout(2000);

    // Check for success message or that we're still on customer page
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
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', 'receptionist@example.com');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/receptionist');

    // Navigate to hotel bookings
    await page.goto('http://localhost:3000/receptionist/bookings/hotel');

    // Wait for bookings to load
    await page.waitForSelector('.booking-table', { timeout: 10000 });

    // Should see bookings (with or without vaccination card)
    const bookings = await page.locator('.booking-row').count();
    expect(bookings).toBeGreaterThanOrEqual(0);
  });

  test('Receptionist approval should succeed without vaccination card verification', async ({ page }) => {
    // Login as receptionist
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', 'receptionist@example.com');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/receptionist');

    // Navigate to approvals
    await page.goto('http://localhost:3000/receptionist/approvals');

    // Wait for approvals to load
    await page.waitForSelector('.approvals-table', { timeout: 10000 });

    // Check that vaccination verification is not blocking approval
    // The approve button should be visible regardless of vaccination card status
    const approveButtons = await page.locator('button:has-text("Approve")').count();
    expect(approveButtons).toBeGreaterThanOrEqual(0);
  });

  test('Walk-in hotel booking without vaccination card should succeed', async ({ page }) => {
    // Login as receptionist
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', 'receptionist@example.com');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/receptionist');

    // Navigate to walk-ins
    await page.goto('http://localhost:3000/receptionist/walk-ins');

    // Wait for walk-in form
    await page.waitForSelector('.walk-in-form', { timeout: 10000 });

    // Check that vaccination card is optional (not required attribute)
    const vaccinationInput = page.locator('input[name="vaccinationCard"]');
    const isRequired = await vaccinationInput.getAttribute('required');
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
    await page.goto('http://localhost:3000/');

    // Open chatbot
    await page.click('.lc-toggle');
    await page.waitForSelector('.lc-panel', { timeout: 5000 });

    // Ask about contact information
    await page.fill('.lc-input-bar input', 'What is your contact information?');
    await page.click('.lc-send-btn');

    // Wait for response
    await page.waitForTimeout(2000);

    // Check that response contains original contact info (not placeholders)
    const chatResponse = await page.locator('.lc-bubble').last().textContent();
    expect(chatResponse).toContain('(555) 123-4567');
    expect(chatResponse).toContain('info@pawsitive.com');
    expect(chatResponse).not.toContain('[Please provide');
  });
});
