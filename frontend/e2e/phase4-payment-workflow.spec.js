const { test, expect } = require('@playwright/test');
const { execSync } = require('node:child_process');
const path = require('node:path');

const frontendUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
const apiUrl = `${process.env.E2E_API_URL || 'http://127.0.0.1:8000'}/api`;
const backendDir = path.resolve(__dirname, '..', '..', 'backend');

// 1x1 PNG used for payment-proof uploads.
const PROOF_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const { apiLogin: sharedApiLogin } = require('./test-utils');

// /api/auth/login is throttled to 5/min per account — reuse one session per role.
async function apiSession(request, role) {
  return sharedApiLogin(request, role);
}

function auth(token) {
  return { Accept: 'application/json', Authorization: `Bearer ${token}` };
}

// Browser session via token injection (same approach as role-deep-links.spec.js).
async function openAs(browser, session, route) {
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', user.role);
    localStorage.setItem('name', user.name || user.email);
    localStorage.setItem('email', user.email);
  }, session);
  const page = await context.newPage();
  await page.goto(route);
  return { page, context };
}

async function findConfinement(request, token, marker) {
  const res = await request.get(`${apiUrl}/customer/medical-confinements`, { headers: auth(token) });
  expect(res.ok(), 'list confinements').toBeTruthy();
  const body = await res.json();
  const records = Array.isArray(body) ? body : body.medical_confinements || body.data || [];
  return records.find((r) => r.diagnosis === marker);
}

test.describe('Phase 4 Payment Workflow E2E', () => {
  // Vite dev-server cold loads and XAMPP are slow; 30s is not enough.
  test.setTimeout(120000);

  // Reseed the two confinement fixtures (payment_status='unpaid') plus the
  // pending boarding fixture so reruns are deterministic. beforeEach (not
  // beforeAll) so Playwright retries also start from a clean fixture state —
  // a failed attempt can leave payment_status='pending'. Requires the local
  // backend + seeded dev DB.
  test.beforeEach(() => {
    execSync(`${process.env.PHP_BINARY || 'php'} pawesome_e2e_payment_fixture_seed.php`, {
      cwd: backendDir,
      stdio: 'inherit',
    });
  });

  test('customer uploads confinement proof → cashier verifies → customer sees paid', async ({ request, browser }) => {
    const customerSession = await apiSession(request, 'customer');
    const customerToken = customerSession.token;
    const fixture = await findConfinement(request, customerToken, 'PW-E2E-VERIFY');
    expect(fixture, 'seeded verify fixture').toBeTruthy();
    expect(['unpaid', 'rejected', 'partial']).toContain(fixture.payment_status);

    // Step 1 — real UI upload through the customer confinements page.
    const { page, context } = await openAs(browser, customerSession, '/customer/medical-confinements');
    const card = page.locator('.confinement-card', { hasText: `Confinement #${fixture.id}` });
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.getByRole('button', { name: 'Upload Payment Proof' }).click();

    await expect(page.locator('.pum-modal')).toBeVisible();
    await page.locator('#pum-file-input').setInputFiles({
      name: 'e2e-proof.png',
      mimeType: 'image/png',
      buffer: PROOF_PNG,
    });
    await page.locator('.pum-ref-input').fill('E2E-REF-100001');
    await page.locator('.pum-confirm-btn').click();
    await expect(page.locator('.pum-modal')).toBeHidden({ timeout: 15000 });

    // Step 2 — persisted state: pending with a stored private proof path.
    const afterUpload = await findConfinement(request, customerToken, 'PW-E2E-VERIFY');
    expect(afterUpload.payment_status).toBe('pending');
    expect(afterUpload.payment_proof).toBeTruthy();

    // Step 3 — non-cashier roles cannot verify payments.
    const receptionistToken = (await apiSession(request, 'receptionist')).token;
    for (const [label, token] of [['customer', customerToken], ['receptionist', receptionistToken]]) {
      const res = await request.post(`${apiUrl}/cashier/confinement-payments/${fixture.id}/verify`, {
        headers: auth(token),
        data: { reference_number: 'E2E-REF-100001' },
      });
      expect(res.status(), `${label} must not verify payments`).toBe(403);
    }

    // Step 4 — cashier sees the pending request and verifies it.
    const cashierToken = (await apiSession(request, 'cashier')).token;
    const pendingRes = await request.get(`${apiUrl}/cashier/confinement-payments/pending`, { headers: auth(cashierToken) });
    expect(pendingRes.ok()).toBeTruthy();
    const pending = (await pendingRes.json()).payments || [];
    expect(
      pending.some((p) => p.payable_type === 'medical_confinement' && p.id === fixture.id),
      'fixture appears in cashier pending queue'
    ).toBeTruthy();

    const verifyRes = await request.post(`${apiUrl}/cashier/confinement-payments/${fixture.id}/verify`, {
      headers: auth(cashierToken),
      data: { reference_number: 'E2E-REF-100001', cashier_remarks: 'E2E verification' },
    });
    expect(verifyRes.ok(), await verifyRes.text()).toBeTruthy();
    expect((await verifyRes.json()).payment_status).toBe('paid');

    // Step 5 — customer-visible status updates to paid.
    await page.reload();
    await expect(card).toContainText('paid', { timeout: 20000 });

    // Step 6 — proof file is served only through the authorized endpoint.
    const ownerView = await request.get(
      `${apiUrl}/files/payment-proofs/medical_confinement/${fixture.id}/view`,
      { headers: auth(customerToken) }
    );
    expect(ownerView.status(), 'owner can view own proof').toBe(200);
    const anonView = await request.get(`${apiUrl}/files/payment-proofs/medical_confinement/${fixture.id}/view`);
    expect(anonView.status(), 'anonymous cannot view proof').toBe(401);

    await context.close();
  });

  test('cashier rejects confinement proof → customer sees rejected and can re-upload', async ({ request, browser }) => {
    const customerSession = await apiSession(request, 'customer');
    const customerToken = customerSession.token;
    const fixture = await findConfinement(request, customerToken, 'PW-E2E-REJECT');
    expect(fixture, 'seeded reject fixture').toBeTruthy();
    expect(['unpaid', 'rejected', 'partial']).toContain(fixture.payment_status);

    // Upload via API (UI upload is covered by the verify test).
    const upload = await request.post(
      `${apiUrl}/customer/medical-confinements/${fixture.id}/payment-proof`,
      {
        headers: auth(customerToken),
        multipart: {
          payment_proof: { name: 'e2e-proof.png', mimeType: 'image/png', buffer: PROOF_PNG },
          payment_reference: 'E2E-REF-200002',
          payment_method: 'GCash',
        },
      }
    );
    expect(upload.ok(), await upload.text()).toBeTruthy();
    expect((await upload.json()).medical_confinement.payment_status).toBe('pending');

    const cashierToken = (await apiSession(request, 'cashier')).token;
    const rejectRes = await request.post(`${apiUrl}/cashier/confinement-payments/${fixture.id}/reject`, {
      headers: auth(cashierToken),
      data: { rejection_reason: 'E2E: illegible receipt image' },
    });
    expect(rejectRes.ok(), await rejectRes.text()).toBeTruthy();
    expect((await rejectRes.json()).payment_status).toBe('rejected');

    // Customer sees rejected status and the re-upload affordance returns.
    const { page, context } = await openAs(browser, customerSession, '/customer/medical-confinements');
    const card = page.locator('.confinement-card', { hasText: `Confinement #${fixture.id}` });
    await expect(card).toContainText('rejected', { timeout: 20000 });
    await expect(card.getByRole('button', { name: 'Upload Payment Proof' })).toBeVisible();
    await context.close();
  });

  test('Vaccination card optional - Customer booking without card', async ({ request, browser }) => {
    const session = await apiSession(request, 'customer');
    const { page, context } = await openAs(browser, session, '/customer/hotel');

    await expect(page.locator('.customer-hotel-reservation')).toBeVisible({ timeout: 20000 });

    // Vaccination card input is optional (no required attribute)
    const vaccinationInput = page.locator('.customer-hotel-reservation input[type="file"]');
    await expect(vaccinationInput).toBeVisible();
    expect(await vaccinationInput.getAttribute('required')).toBeNull();

    // Label shows "(Optional)"
    await expect(page.locator('label:has-text("Vaccination Card")')).toContainText('Optional');
    await context.close();
  });

  test('Receptionist can approve a pending boarding without a vaccination card', async ({ request, browser }) => {
    const session = await apiSession(request, 'receptionist');
    const { page, context } = await openAs(browser, session, '/receptionist/bookings/hotel');

    await expect(page.locator('.hotel-bookings')).toBeVisible({ timeout: 20000 });

    // Isolate the seeded pending boarding (no vaccination card) via search —
    // the bookings haystack includes the notes marker.
    await page.locator('.hotel-search-box input').fill('PW-E2E-APPROVAL');
    const row = page.locator('tr.booking-row', { hasText: 'Buddy' }).first();
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row.locator('.status-badge')).toContainText(/pending/i);

    // Approve is available and enabled despite the missing vaccination card.
    // ReceptionistHotelBookings approves directly via runAction — no modal —
    // and renders .hotel-toast.success / .hotel-toast.error for the outcome.
    const approveBtn = row.locator('button[title="Approve"]');
    await expect(approveBtn).toBeVisible();
    await expect(approveBtn).toBeEnabled();
    await approveBtn.click();
    await expect(page.locator('.hotel-toast.success')).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test('Chatbot FAQ contact information', async ({ page }) => {
    // Navigate to landing page
    await page.goto('/');

    // Open chatbot
    await page.click('.lc-toggle');
    await page.waitForSelector('.lc-panel', { timeout: 5000 });

    // Ask about contact information — the public chatbot endpoint is
    // rule-based and deterministic; send is disabled while the welcome
    // message is still loading.
    await page.fill('.lc-input-bar input', 'What is your contact information?');
    await expect(page.locator('.lc-send-btn')).toBeEnabled({ timeout: 15000 });
    await page.click('.lc-send-btn');

    // Assert on the bot bubble specifically — .lc-bubble also matches the
    // user's own message, which races the reply when using fixed sleeps.
    const botBubble = page.locator('.lc-msg-bot .lc-bubble').last();
    await expect(botBubble).toContainText('(555) 123-4567', { timeout: 15000 });

    const chatResponse = await botBubble.textContent();
    expect(chatResponse).toContain('info@pawsitive.com');
    expect(chatResponse).not.toContain('[Please provide');
  });

  test('Landing page z-index hierarchy', async ({ page }) => {
    await page.goto('/');

    // Get z-index of header
    const headerZIndex = await page.locator('.landing-header').evaluate(el => {
      return window.getComputedStyle(el).zIndex;
    });

    // Get z-index of chatbot toggle
    const chatbotZIndex = await page.locator('.lc-toggle').evaluate(el => {
      return window.getComputedStyle(el).zIndex;
    });

    // Verify chatbot is above header
    expect(parseInt(chatbotZIndex)).toBeGreaterThan(parseInt(headerZIndex));
  });

  test('Registration error messages with examples', async ({ page }) => {
    await page.goto('/register');

    // Test email validation with invalid email
    await page.fill('input[name="emailAddress"]', 'invalid-email');
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');
    await page.click('button:has-text("Next")');

    // Wait for error message
    await page.waitForTimeout(500);

    // Verify error message includes example - use specific selector for error message
    const emailError = page.locator('.register-field-error').filter({ hasText: /email/i });
    if (await emailError.count() > 0) {
      const errorText = await emailError.first().textContent();
      expect(errorText).toMatch(/example\.com/i);
    } else {
      // Alternative: check for any error text containing email
      const errorContainer = page.locator('.register-alert.error');
      if (await errorContainer.count() > 0) {
        const errorText = await errorContainer.textContent();
        expect(errorText).toMatch(/email/i);
      }
    }
  });
});
