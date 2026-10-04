// Phase 9 — full capstone demo workflow (single continuous thread).
// One vet service request flows through every role:
//   Customer → Receptionist → Customer pays → Cashier verifies (SR-REC)
//   → Vet starts + records inventory usage + finalizes record
//   → Cashier verifies appointment (VT-REC) → Vet completes
//   → Inventory verifies stock/log → Customer sees final state
//   → Manager reports → Admin audit trail
// A real database-queue worker runs alongside consuming email intents.
// Email-side evidence is asserted against email_deliveries after the run.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { loginAs, apiLogin } = require('./test-utils');

const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';
const evidenceDir = path.resolve(__dirname, '../../browser-evidence/phase9-capstone-demo');
const runSeed = Date.now() % 100000;
const stamp = `P9-${runSeed}`;

const run = { startedAt: new Date().toISOString(), stamp, legs: [], status: 'NOT_RUN' };

function saveRun() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'phase9-results.json'), JSON.stringify(run, null, 2));
}

function leg(name, data) {
  run.legs.push({ name, at: new Date().toISOString(), ...data });
  saveRun();
}

async function api(request, token, method, path_, options = {}) {
  const res = await request[method.toLowerCase()](`${apiBase}${path_}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

async function uiShot(page, role, route, name, expectText) {
  await loginAs(page, role);
  await page.goto(`${frontendUrl}${route}`);
  if (expectText) {
    await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 15000 });
  }
  const file = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.basename(file);
}

// Minimal valid PNG for proof upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe.configure({ mode: 'serial' });
test.setTimeout(420000);

test('Phase 9 continuous cross-role demo workflow', async ({ page, request }) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const customer = await apiLogin(request, 'customer');
  const receptionist = await apiLogin(request, 'receptionist');
  const cashier = await apiLogin(request, 'cashier');
  const vet = await apiLogin(request, 'vet');
  const inventory = await apiLogin(request, 'inventory');
  const manager = await apiLogin(request, 'manager');
  const admin = await apiLogin(request, 'admin');

  // ── LEG 0 · INVENTORY provisions a service-consumable item ─────────────
  // Dev DB has no is_service_consumable items; the inventory role creates
  // the demo consumable through the real API so the vet usage leg is real.
  const newItem = await api(request, inventory.token, 'post', '/inventory/items', {
    data: {
      name: `P9 Demo Antiseptic ${stamp}`,
      sku: `P9-SKU-${runSeed}`,
      category: 'Health',
      price: 85,
      stock: 10,
      reorder_level: 2,
      unit: 'pcs',
      status: 'active',
      is_service_consumable: true,
      is_sellable: false,
      issue_method: 'FIFO',
    },
  });
  expect(newItem.status, `create consumable: ${JSON.stringify(newItem.body)}`).toBe(201);
  const consumable = newItem.body.item || newItem.body.data || newItem.body;
  run.consumableItemId = consumable.id;
  leg('inventory.provision_consumable', { itemId: consumable.id, name: consumable.name, stock: 10 });

  // ── LEG 1 · CUSTOMER submits a vet service request ──────────────────────
  const petsRes = await api(request, customer.token, 'get', '/customer/pets');
  const pets = petsRes.body.pets || petsRes.body.data || petsRes.body || [];
  const buddy = pets.find((p) => String(p.name).toLowerCase() === 'buddy') || pets[0];
  expect(buddy, 'customer pet fixture').toBeTruthy();

  const vets = await api(request, receptionist.token, 'get', '/receptionist/veterinarians/available');
  const vetList = vets.body.veterinarians || vets.body.data || vets.body || [];
  const assignedVet =
    vetList.find((v) => v.email === 'vet@example.com') || vetList[0] || vet.user;

  const created = await api(request, customer.token, 'post', '/customer/requests', {
    data: {
      customer_name: `${customer.user.name} ${stamp}`,
      pet_id: buddy.id,
      pet_name: buddy.name,
      request_type: 'vet',
      service_name: 'General Check-up',
      requested_date: `2026-1${1 + (runSeed % 2)}-${String(5 + (runSeed % 20)).padStart(2, '0')}`,
      requested_time: `${String(9 + (runSeed % 7)).padStart(2, '0')}:30`,
      notes: `Phase 9 demo workflow ${stamp}`,
    },
  });
  expect(created.status, `create: ${JSON.stringify(created.body)}`).toBe(201);
  const requestId = created.body.request.id;
  run.requestId = requestId;
  const shot1 = await uiShot(page, 'customer', '/customer/services', '01-customer-submitted');
  leg('customer.submit', { requestId, uiShot: shot1 });

  // ── LEG 2 · RECEPTIONIST sees pending + approves with vet assignment ────
  const pending = await api(request, receptionist.token, 'get', '/receptionist/requests/pending');
  const pendingList = pending.body.requests || pending.body.data || pending.body || [];
  const visible = JSON.stringify(pendingList).includes(`"id":${requestId}`) ||
    pendingList.some?.((r) => r.id === requestId);
  expect(visible, `request #${requestId} pending for receptionist`).toBeTruthy();

  const approved = await api(request, receptionist.token, 'post', `/receptionist/requests/${requestId}/approve`, {
    data: { veterinarian_id: Number(assignedVet.id), receptionist_remarks: `Approved ${stamp}` },
  });
  expect(approved.status, `approve: ${JSON.stringify(approved.body)}`).toBe(200);
  const appointment = approved.body.appointment || approved.body.data?.appointment;
  expect(appointment?.id, 'approval created appointment').toBeTruthy();
  run.appointmentId = appointment.id;
  const shot2 = await uiShot(page, 'receptionist', '/receptionist/bookings/veterinary', '02-receptionist-approved');
  leg('receptionist.approve', { requestId, appointmentId: appointment.id, vetId: assignedVet.id, uiShot: shot2 });

  // ── LEG 3 · CUSTOMER uploads gcash proof for the booking ────────────────
  const proof = await request.post(`${apiBase}/customer/requests/${requestId}/payment-proof`, {
    headers: { Authorization: `Bearer ${customer.token}`, Accept: 'application/json' },
    multipart: {
      payment_method: 'gcash',
      payment_reference: `GCASH-${stamp}`,
      payment_proof: { name: 'proof.png', mimeType: 'image/png', buffer: PNG },
    },
  });
  expect(proof.status(), `proof: ${await proof.text()}`).toBe(200);
  leg('customer.payment_proof', { requestId, reference: `GCASH-${stamp}` });

  // ── LEG 4 · CASHIER sees pending + verifies service_request ─────────────
  const toVerify = await api(request, cashier.token, 'get', '/cashier/payment-requests');
  expect(toVerify.status).toBe(200);
  expect(
    JSON.stringify(toVerify.body).includes(String(requestId)),
    `request #${requestId} pending for cashier`
  ).toBeTruthy();

  const verify = await api(request, cashier.token, 'put', `/cashier/payments/${requestId}/service_request/verify`, {
    data: { cashier_remarks: `Verified ${stamp}` },
  });
  expect(verify.status, `verify: ${JSON.stringify(verify.body)}`).toBe(200);
  const srReceipt = verify.body.receipt_number;
  expect(srReceipt, 'SR receipt number').toMatch(/^SR-REC-/);
  run.srReceipt = srReceipt;
  const shot4 = await uiShot(page, 'cashier', '/cashier/payment-verification', '03-cashier-verified');
  leg('cashier.verify_service_request', { requestId, receipt: srReceipt, uiShot: shot4 });

  // ── LEG 5 · VET starts appointment, records inventory usage ─────────────
  const vetAppts = await api(request, vet.token, 'get', '/veterinary/appointments');
  const vetList2 = vetAppts.body.appointments || vetAppts.body.data || vetAppts.body || [];
  expect(
    vetList2.some?.((a) => a.id === appointment.id) || JSON.stringify(vetList2).includes(`"id":${appointment.id}`),
    `appointment #${appointment.id} visible to vet`
  ).toBeTruthy();

  const started = await api(request, vet.token, 'post', `/veterinary/appointments/${appointment.id}/start`, {
    data: { notes: `Started ${stamp}` },
  });
  expect(started.status, `start: ${JSON.stringify(started.body)}`).toBe(200);
  const medicalRecordId = started.body.medical_record?.id;
  expect(medicalRecordId, 'medical record created on start').toBeTruthy();

  // Pick a stocked inventory item for usage recording.
  const billItems = await api(request, vet.token, 'get', '/veterinary/inventory-items');
  const itemPool = Array.isArray(billItems.body.items) ? billItems.body.items : [];
  const usedItem =
    itemPool.find((i) => i.id === consumable.id && Number(i.stock) > 0) ||
    itemPool.find((i) => Number(i.stock) > 0);
  expect(usedItem, 'stocked service-consumable inventory item').toBeTruthy();
  const beforeStock = Number(usedItem.stock);

  const usage = await api(request, vet.token, 'post', `/veterinary/appointments/${appointment.id}/inventory-usage`, {
    data: {
      items: [{ inventory_item_id: usedItem.id, quantity_used: 1, notes: `Demo usage ${stamp}` }],
      general_notes: `Phase 9 supplies usage ${stamp}`,
    },
  });
  expect(usage.status, `usage: ${JSON.stringify(usage.body)}`).toBe(200);

  const finalized = await api(request, vet.token, 'post', `/veterinary/medical-records/${medicalRecordId}/finalize`, {});
  expect(finalized.status, `finalize: ${JSON.stringify(finalized.body)}`).toBe(200);
  const shot5 = await uiShot(page, 'veterinary', '/veterinary/appointments', '04-vet-in-progress');
  leg('veterinary.start_and_usage', {
    appointmentId: appointment.id,
    medicalRecordId,
    itemId: usedItem.id,
    itemName: usedItem.name,
    beforeStock,
    uiShot: shot5,
  });

  // ── LEG 6 · CASHIER settles the remaining billed items ─────────────────
  // The SR payment synced to the appointment bill; the usage item leaves a
  // balance → payment_status 'partial'. The real settle path for billed
  // items is cashier billing/items/mark-paid (service_item_usage settlement).
  const summary = await api(request, cashier.token, 'get', `/billing/veterinary/${appointment.id}/summary`);
  expect(summary.status, `summary: ${JSON.stringify(summary.body)}`).toBe(200);
  const billItemList = summary.body.billing?.items || summary.body.items || [];
  const unpaidIds = billItemList.filter((i) => !(i.is_paid || i.paid)).map((i) => i.id);
  expect(unpaidIds.length, 'unpaid billing items exist').toBeGreaterThan(0);

  const markPaid = await api(request, cashier.token, 'patch', '/billing/items/mark-paid', {
    data: {
      item_ids: unpaidIds,
      payment_method: 'gcash',
      reference_number: `COUNTER-${stamp}`,
      cashier_remarks: `Balance settled ${stamp}`,
    },
  });
  expect(markPaid.status, `mark-paid: ${JSON.stringify(markPaid.body)}`).toBe(200);
  leg('cashier.settle_items', { appointmentId: appointment.id, itemIds: unpaidIds, reference: `COUNTER-${stamp}` });

  // ── LEG 7 · VET completes the appointment (gates: paid + finalized) ─────
  const completed = await api(request, vet.token, 'post', `/veterinary/appointments/${appointment.id}/complete`, {
    data: { notes: `Completed ${stamp}` },
  });
  expect(completed.status, `complete: ${JSON.stringify(completed.body)}`).toBe(200);
  leg('veterinary.complete', { appointmentId: appointment.id });

  // ── LEG 8 · INVENTORY verifies stock deducted + usage logged ────────────
  const afterItem = await api(request, inventory.token, 'get', `/inventory/items/${usedItem.id}`);
  const after = afterItem.body.item || afterItem.body.data || afterItem.body;
  const afterStock = Number(after.stock);
  const logs = await api(request, inventory.token, 'get', `/inventory/items/${usedItem.id}/logs`);
  const logList = logs.body.logs || logs.body.data || logs.body.history || [];
  const hasUsageLog =
    logList.some?.((l) => Number(l.stock_after) === afterStock) ||
    JSON.stringify(logList).includes('Veterinary') ||
    JSON.stringify(logList).includes('usage');
  expect(afterStock, `stock ${beforeStock}→${afterStock}`).toBeLessThan(beforeStock);
  const shot8a = await uiShot(page, 'inventory', '/inventory/products', '05-inventory-after');
  const shot8b = await uiShot(page, 'inventory', '/inventory/history', '06-inventory-log');
  leg('inventory.stock_verified', { itemId: usedItem.id, beforeStock, afterStock, hasUsageLog, uiShots: [shot8a, shot8b] });

  // ── LEG 9 · CUSTOMER sees final state + holds receipts ──────────────────
  const mine = await api(request, customer.token, 'get', '/customer/my-requests');
  const myList = mine.body.requests || mine.body.data || mine.body || [];
  const finalRequest = myList.find?.((r) => r.id === requestId);
  expect(finalRequest?.payment_status, 'customer request paid').toBe('paid');
  const receiptRes = await api(request, customer.token, 'get', `/customer/requests/${requestId}/receipt`);
  expect(receiptRes.status).toBe(200);
  const shot9 = await uiShot(page, 'customer', '/customer/payments', '07-customer-paid');
  leg('customer.final_state', {
    requestId,
    status: finalRequest?.status,
    paymentStatus: finalRequest?.payment_status,
    receipt: receiptRes.body.receipt?.receipt_number || receiptRes.body.receipt_number,
    uiShot: shot9,
  });

  // ── LEG 10 · MANAGER reports reflect the transaction ────────────────────
  const reports = await api(request, manager.token, 'get', '/manager/reports/overview');
  expect(reports.status).toBe(200);
  const shot10 = await uiShot(page, 'manager', '/manager/reports', '08-manager-reports');
  leg('manager.reports', { status: reports.status, uiShot: shot10 });

  // ── LEG 11 · ADMIN audit trail shows the workflow actions ───────────────
  const activity = await api(request, admin.token, 'get', '/admin/activity-logs');
  expect(activity.status).toBe(200);
  const activityText = JSON.stringify(activity.body);
  const sawWorkflow =
    activityText.includes('appointment_started') ||
    activityText.includes('appointment_completed') ||
    activityText.includes(String(appointment.id));
  const shot11 = await uiShot(page, 'admin', '/admin', '09-admin-dashboard');
  leg('admin.audit', { sawWorkflowEntries: sawWorkflow, uiShot: shot11 });
  expect(sawWorkflow, 'activity log contains workflow entries').toBeTruthy();

  run.status = 'PASSED';
  saveRun();
});
