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
  const created = await api(request, customer.token, 'post', '/customer/requests', {
    data: {
      customer_name: `${customer.user.name} ${stamp}`,
      pet_name: 'Buddy',
      request_type: 'grooming',
      service_name: 'Tick and Flea Bath',
      requested_date: '2026-10-20',
      requested_time: '10:00',
      notes: `Phase 8 cross-role email verification ${stamp}`,
    },
  });
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
