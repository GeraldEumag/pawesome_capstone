// Phase 8 verification: cross-role email lifecycle on the live chain.
// Customer submits → receptionist sees pending + approves → customer uploads
// payment proof → cashier verifies → customer receipt. A real database-queue
// worker runs alongside, consuming email_deliveries intents as they fire.
// Email-side assertions (email_deliveries rows/statuses, rendered mail) are
// verified against the database/log after this spec completes.
const { test, expect } = require('@playwright/test');
const { loginAs, apiLogin } = require('./test-utils');

const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';
const runSeed = Date.now() % 100000;

async function api(request, token, method, path, options = {}) {
  const res = await request[method.toLowerCase()](`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

// Minimal valid PNG (1x1 transparent) for the proof upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

test('customer → receptionist → cashier → receipt (email chain live)', async ({ page, request }) => {
  const customer = await apiLogin(request, 'customer');
  const receptionist = await apiLogin(request, 'receptionist');
  const cashier = await apiLogin(request, 'cashier');
  const stamp = `P8-${runSeed}`;

  // ── CUSTOMER: submit a grooming service request ────────────────────────
  // The endpoint requires an owned pet; create one, then probe open slots.
  const petRes = await api(request, customer.token, 'post', '/pets', {
    data: { name: `E2E Email Pet ${stamp}`, species: 'Dog' },
  });
  const pet = petRes.body.pet || petRes.body;
  let created;
  let chosen = null;
  for (let offset = 2; offset <= 150; offset += 1) {
    const date = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const availability = await api(
      request, customer.token, 'get',
      `/customer/availability/grooming?date=${date}&service_name=${encodeURIComponent('Tick and Flea Bath')}`
    );
    const free = (availability.body.slots || []).find((s) => s.available);
    if (free) {
      chosen = { date, slot: free.time || free.slot || free.requested_time };
      break;
    }
  }
  expect(chosen, 'no free grooming slot for Tick and Flea Bath within 150 days').toBeTruthy();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const date = attempt === 0 ? chosen.date : new Date(Date.now() + (60 + attempt) * 86400000).toISOString().slice(0, 10);
    const slot = attempt === 0 ? chosen.slot : `${String(10 + (attempt % 8)).padStart(2, '0')}:00`;
    created = await api(request, customer.token, 'post', '/customer/requests', {
      data: {
        customer_name: `${customer.user.name} ${stamp}`,
        pet_id: pet.id,
        pet_name: pet.name,
        request_type: 'grooming',
        service_name: 'Tick and Flea Bath',
        requested_date: date,
        requested_time: slot,
        notes: `Phase 8 cross-role email verification ${stamp}`,
      },
    });
    if (created.status === 201) break;
    if (!/overlap|no longer available|conflict|unavailable|public holiday|store is closed/i.test(JSON.stringify(created.body))) break;
  }
  expect(created.status, `request create: ${JSON.stringify(created.body)}`).toBe(201);
  const requestId = created.body.request.id;

  // ── RECEPTIONIST: sees it pending, then approves ───────────────────────
  const pending = await api(request, receptionist.token, 'get', '/receptionist/requests/pending');
  expect(pending.status).toBe(200);
  const pendingList = Array.isArray(pending.body)
    ? pending.body
    : pending.body.requests || pending.body.data || [];
  expect(
    pendingList.some((r) => r.id === requestId),
    `request #${requestId} visible to receptionist`
  ).toBeTruthy();

  const approved = await api(request, receptionist.token, 'post', `/receptionist/requests/${requestId}/approve`, {
    data: { receptionist_remarks: `Approved ${stamp}` },
  });
  expect(approved.status, `approve: ${JSON.stringify(approved.body)}`).toBe(200);

  // ── CUSTOMER: sees approved status, uploads gcash payment proof ────────
  const mine = await api(request, customer.token, 'get', '/customer/my-requests');
  const myRequest = (mine.body.requests || mine.body.data || mine.body || []).find(
    (r) => r.id === requestId
  );
  expect(myRequest?.status, 'customer sees approved status').toBe('approved');

  const proof = await request.post(`${apiBase}/customer/requests/${requestId}/payment-proof`, {
    headers: { Authorization: `Bearer ${customer.token}`, Accept: 'application/json' },
    multipart: {
      payment_method: 'gcash',
      payment_reference: `GCASH-${stamp}`,
      payment_proof: { name: 'proof.png', mimeType: 'image/png', buffer: PNG },
    },
  });
  expect(proof.status(), `proof upload: ${await proof.text()}`).toBe(200);

  // ── CASHIER: sees pending verification, verifies ───────────────────────
  const toVerify = await api(request, cashier.token, 'get', '/cashier/payment-requests');
  expect(toVerify.status).toBe(200);
  const pendingPayments = toVerify.body.requests || toVerify.body.data || toVerify.body || [];
  const isPending = (list) =>
    Array.isArray(list) &&
    list.some((p) => (p.id === requestId || p.service_request_id === requestId));
  // The pending list shape varies; assert the request appears SOMEWHERE in the payload.
  expect(
    JSON.stringify(toVerify.body).includes(String(requestId)) || isPending(pendingPayments),
    `request #${requestId} visible to cashier as pending`
  ).toBeTruthy();

  const verify = await api(
    request,
    cashier.token,
    'put',
    `/cashier/payments/${requestId}/service_request/verify`,
    { data: { cashier_remarks: `Verified ${stamp}` } }
  );
  expect(verify.status, `verify: ${JSON.stringify(verify.body)}`).toBe(200);

  // ── CUSTOMER: receipt is available with authoritative fields ──────────
  const receipt = await api(request, customer.token, 'get', `/customer/requests/${requestId}/receipt`);
  expect(receipt.status).toBe(200);
  expect(receipt.body.receipt?.receipt_number || receipt.body.receipt_number, 'receipt number').toMatch(/^SR-REC-/);
  expect(
    String(receipt.body.receipt?.payment_status || receipt.body.payment_status || '').toLowerCase()
  ).toBe('paid');

  // ── BROWSER: customer sees the verified request in the UI ──────────────
  await loginAs(page, 'customer');
  await page.goto(`${frontendUrl}/customer/payments`);
  await expect(
    page.getByText(/paid|verified|SR-REC-|Tick and Flea/i).first()
  ).toBeVisible({ timeout: 15000 });
});
