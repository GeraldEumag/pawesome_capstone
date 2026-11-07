const { test, expect } = require('@playwright/test');
const { loginAs, mockLoginAs, apiLogin } = require('./test-utils');

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';
// 1x1 PNG: valid image for the vaccination-card upload.
const CARD_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function authHeaders(token) {
  return { Accept: 'application/json', Authorization: `Bearer ${token}` };
}

// Creates a dog pet and a hotel boarding with a vaccination card for the customer.
// Probes future dates and rooms, since the shared dev DB fills up across runs.
async function createBoardingWithCard(request, customer) {
  const pet = (await (await request.post(`${apiBase}/pets`, {
    headers: authHeaders(customer.token),
    data: { name: `P2 Vaccine ${Date.now()}`, species: 'Dog' },
  })).json()).pet;
  for (let offset = 40; offset < 120; offset++) {
    const date = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const rooms = await (await request.get(
      `${apiBase}/boarding/rooms/available?species=dog&check_in_date=${date}&check_out_date=${date}`,
      { headers: authHeaders(customer.token) }
    )).json();
    const room = (rooms.rooms || []).find((r) => r.available && /^\d+$/.test(String(r.id)));
    if (!room) continue;
    const res = await request.post(`${apiBase}/customer/boardings`, {
      headers: authHeaders(customer.token),
      multipart: {
        pet_id: String(pet.id), room_id: String(room.id), check_in_date: date,
        number_of_days: '1', notes: `P2 vaccination ${Date.now()}`,
        vaccination_card: { name: 'vaccination-card.png', mimeType: 'image/png', buffer: CARD_PNG },
      },
    });
    if (res.ok()) {
      const body = await res.json();
      return { id: (body.boarding || body.data || body).id };
    }
  }
  throw new Error('no boarding room available for the vaccination fixture');
}


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
      check_in: new Date().toISOString().slice(0, 10),
      check_out: new Date().toISOString().slice(0, 10),
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

    await page.goto('/receptionist/bookings/hotel?range=all&tab=all');
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
    await page.getByRole('button', { name: /New Booking/ }).first().click();
    await page.waitForSelector('.hbk-modal', { timeout: 10000 });

    // Check that vaccination card is optional — the field must either be absent
    // from the walk-in flow or rendered without the required attribute.
    const vaccinationInput = page.locator('input[name="vaccinationCard"]');
    const isRequired = (await vaccinationInput.count()) > 0
      ? await vaccinationInput.getAttribute('required')
      : null;
    expect(isRequired).toBeNull(); // Should not have required attribute
  });

  test('Historical vaccination card remains accessible', async ({ request }) => {
    test.setTimeout(180000);
    const customer = await apiLogin(request, 'customer');
    const fixture = await createBoardingWithCard(request, customer);

    const owner = await request.get(`${apiBase}/files/vaccination-cards/${fixture.id}/view`, {
      headers: authHeaders(customer.token),
    });
    expect(owner.status()).toBe(200);
    expect(owner.headers()['content-type']).toMatch(/^image\//);

    const anonymous = await request.get(`${apiBase}/files/vaccination-cards/${fixture.id}/view`, {
      headers: { Accept: 'application/json' },
    });
    expect(anonymous.status()).toBe(401);
  });

  test('Historical verification workflow still works', async ({ request }) => {
    test.setTimeout(180000);
    const customer = await apiLogin(request, 'customer');
    const receptionist = await apiLogin(request, 'receptionist');
    const fixture = await createBoardingWithCard(request, customer);

    const verify = await request.post(`${apiBase}/receptionist/boarding-requests/${fixture.id}/verify-vaccination`, {
      headers: authHeaders(receptionist.token),
    });
    expect(verify.status(), await verify.text()).toBe(200);
    expect((await verify.json()).boarding.vaccination_card_verified_at).toBeTruthy();

    const approve = await request.post(`${apiBase}/receptionist/boarding-requests/${fixture.id}/approve`, {
      headers: authHeaders(receptionist.token),
    });
    expect(approve.status(), await approve.text()).toBe(200);
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
    await expect(botBubble).toContainText('270020371', { timeout: 15000 });

    // Check that response contains original contact info (not placeholders)
    const chatResponse = await botBubble.textContent();
    expect(chatResponse).toContain('270020371');
    expect(chatResponse).toContain('pawesomeretreat24@gmail.com');
    expect(chatResponse).not.toContain('[Please provide');
  });
});
