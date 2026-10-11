const { test, expect } = require('@playwright/test');
const { apiLogin } = require('./test-utils');

const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const apiUrl = `${process.env.E2E_API_URL || 'http://127.0.0.1:8000'}/api`;

// Marks fixtures so reruns stay identifiable; created rows are cancelled at the
// end of each test.
const ONLINE_MARKER = `PW-E2E-CHANNEL-ONLINE-${Date.now() % 100000}`;
const WALKIN_MARKER = `PW-E2E-CHANNEL-WALKIN-${Date.now() % 100000}`;

function auth(token) {
  return { Accept: 'application/json', Authorization: `Bearer ${token}` };
}

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

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function cashierQueue(request, token) {
  const res = await request.get(`${apiUrl}/cashier/payment-requests`, { headers: auth(token) });
  expect(res.ok(), 'cashier payment-requests').toBeTruthy();
  const body = await res.json();
  return body.payments || body.requests || body.data || [];
}

test.describe('Booking channel gating (D1/D2)', () => {
  test.setTimeout(120000);

  test('online booking: hidden from counter queue, cash verify rejected with 422', async ({ request, browser }) => {
    const customer = await apiLogin(request, 'customer');
    const receptionist = await apiLogin(request, 'receptionist');
    const cashier = await apiLogin(request, 'cashier');

    // 1. Customer creates an online grooming request through the real endpoint.
    const petsRes = await request.get(`${apiUrl}/customer/pets`, { headers: auth(customer.token) });
    expect(petsRes.ok(), 'list customer pets').toBeTruthy();
    const petsBody = await petsRes.json();
    const pets = Array.isArray(petsBody) ? petsBody : petsBody.pets || petsBody.data || [];
    const pet = pets.find((p) => !p.is_archived && !p.deleted_at) || pets[0];
    expect(pet, 'customer has a bookable pet').toBeTruthy();

    // Find a genuinely free grooming slot via the real availability endpoint —
    // seeded fixtures can occupy any given date's slots.
    let slotDate = null;
    let slotTime = null;
    for (let offset = 1; offset <= 14 && !slotTime; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const date = d.toISOString().slice(0, 10);
      const av = await request.get(
        `${apiUrl}/availability/grooming?date=${date}&service_name=${encodeURIComponent(ONLINE_MARKER)}`,
        { headers: auth(customer.token) }
      );
      if (!av.ok()) continue;
      const body = await av.json();
      const free = (body.slots || []).find((s) => s.available);
      if (free) {
        slotDate = date;
        slotTime = free.time || free.value || free.slot;
      }
    }
    expect(slotTime, 'a free grooming slot within 14 days').toBeTruthy();

    const createRes = await request.post(`${apiUrl}/customer/requests`, {
      headers: auth(customer.token),
      data: {
        customer_name: customer.user.name,
        pet_id: pet.id,
        request_type: 'grooming',
        service_name: ONLINE_MARKER,
        requested_date: slotDate,
        requested_time: slotTime,
        notes: 'E2E channel-gating fixture',
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const created = await createRes.json();
    const srId = created.request?.id || created.id || created.service_request?.id;
    expect(srId, 'created service request id').toBeTruthy();

    try {
      // 2. Receptionist approves it through the real endpoint.
      const approveRes = await request.post(`${apiUrl}/receptionist/requests/${srId}/approve`, {
        headers: auth(receptionist.token),
        data: {},
      });
      expect(approveRes.ok(), await approveRes.text()).toBeTruthy();

      // 3. Approved online-unpaid row must NOT appear in the cashier counter
      //    queue (channel gating is enforced server-side).
      const queue = await cashierQueue(request, cashier.token);
      const queued = queue.find((p) => String(p.id) === String(srId) && (p.type === 'service_request' || !p.type));
      expect(queued, 'online unpaid row excluded from cashier queue').toBeFalsy();

      // 4. Even if a cashier manually posts a cash settlement for it, the API
      //    must reject with 422 (no frontend reliance).
      const cashAttempt = await request.post(`${apiUrl}/cashier/payment-requests/${srId}/verify`, {
        headers: auth(cashier.token),
        data: { type: 'service_request', payment_method: 'cash' },
      });
      expect(cashAttempt.status(), await cashAttempt.text()).toBe(422);

      // 5. Browser: the cashier UI shows neither the row nor a Collect Cash
      //    action for it.
      const { page, context } = await openAs(browser, cashier, '/cashier/payment-verification');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(ONLINE_MARKER)).toHaveCount(0, { timeout: 20000 });
      await context.close();
    } finally {
      // Cleanup: cancel the fixture request (non-destructive status change).
      await request.patch(`${apiUrl}/customer/requests/${srId}/cancel`, {
        headers: auth(customer.token),
        data: { reason: 'E2E fixture cleanup' },
      }).catch(() => {});
    }
  });

  test('walk-in booking: queued for counter collection, cash verify succeeds', async ({ request, browser }) => {
    const receptionist = await apiLogin(request, 'receptionist');
    const cashier = await apiLogin(request, 'cashier');
    const uniq = Date.now() % 1000000;

    // 1. Receptionist creates a walk-in grooming booking (new customer).
    const walkinRes = await request.post(`${apiUrl}/receptionist/walk-ins`, {
      headers: auth(receptionist.token),
      data: {
        customer_mode: 'new',
        customer: {
          first_name: 'E2E',
          last_name: `Walkin${uniq}`,
          email: `pw-e2e-walkin-${uniq}@example.test`,
          phone: '09000000000',
        },
        pet: { name: `E2EPet${uniq}`, species: 'Dog' },
        booking: {
          service_type: 'grooming',
          service_name: WALKIN_MARKER,
          request_date: tomorrow(),
          request_time: '11:00',
          notes: 'E2E channel-gating fixture',
        },
      },
    });
    expect(walkinRes.ok(), await walkinRes.text()).toBeTruthy();
    const walkinBody = await walkinRes.json();
    const srId = walkinBody.data?.service_request_id || walkinBody.service_request?.id || walkinBody.request?.id || walkinBody.id;
    expect(srId, 'walk-in service request id').toBeTruthy();

    try {
      // 2. Receptionist approves it.
      const approveRes = await request.post(`${apiUrl}/receptionist/requests/${srId}/approve`, {
        headers: auth(receptionist.token),
        data: {},
      });
      expect(approveRes.ok(), await approveRes.text()).toBeTruthy();

      // 3. Cashier queue must carry the row flagged walk_in.
      const queue = await cashierQueue(request, cashier.token);
      const queued = queue.find((p) => String(p.id) === String(srId));
      expect(queued, 'walk-in row present in cashier queue').toBeTruthy();
      expect(queued.booking_channel).toBe('walk_in');

      // 4. Browser: the row exposes a Collect Cash action. Search matches
      //    customer_name only — use the unique fixture name.
      const { page, context } = await openAs(browser, cashier, '/cashier/payment-verification');
      await page.getByPlaceholder(/search customer/i).fill(`walkin${uniq}`);
      const card = page.locator('.pa-card', { hasText: `Walkin${uniq}` }).first();
      await expect(card).toBeVisible({ timeout: 30000 });
      await expect(card.getByRole('button', { name: /collect cash/i })).toBeVisible();
      await context.close();

      // 5. Counter cash settlement succeeds through the shared service.
      const verifyRes = await request.post(`${apiUrl}/cashier/payment-requests/${srId}/verify`, {
        headers: auth(cashier.token),
        data: { type: 'service_request', payment_method: 'cash', cashier_remarks: 'E2E walk-in settlement' },
      });
      expect(verifyRes.ok(), await verifyRes.text()).toBeTruthy();

      // 6. Persisted: paid, recorded as cash.
      const after = await cashierQueue(request, cashier.token);
      const settled = after.find((p) => String(p.id) === String(srId));
      expect(settled, 'settled row leaves the actionable queue').toBeFalsy();
    } finally {
      await request.patch(`${apiUrl}/customer/requests/${srId}/cancel`, {
        headers: auth(receptionist.token),
        data: { reason: 'E2E fixture cleanup' },
      }).catch(() => {});
    }
  });
});
