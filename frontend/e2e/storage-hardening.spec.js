// Storage hardening browser check:
// customer uploads payment proof in the UI -> DB + private file verified ->
// cashier opens the proof in the UI -> cashier rejects -> customer re-uploads ->
// new proof referenced, rejected proof retained on disk as evidence.
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const privateRoot = path.join(rootDir, "backend", "storage", "app", "private");
const evidenceDir = path.join(rootDir, "browser-evidence", "storage-hardening");
const frontendUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;

const PNG = fs.readFileSync(path.join(__dirname, "..", "src", "assets", "PAWESOME TEST GCASH.png"));

const { apiLogin: sharedApiLogin } = require("./test-utils");

async function login(request, role) {
  return sharedApiLogin(request, role);
}

async function api(request, session, method, endpoint, data) {
  const res = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
    data,
  });
  const body = await res.json().catch(() => ({}));
  expect(res.ok(), `${method.toUpperCase()} ${endpoint}: ${res.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

async function openAs(browser, session, route) {
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || user.email);
    localStorage.setItem("email", user.email);
  }, session);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(route);
  return { page, context, errors };
}

async function customerUploadsProofInUi(browser, session, requestId, reference, shot) {
  const { page, context, errors } = await openAs(browser, session, "/customer/bookings");
  const row = page.locator("tr", { has: page.locator("td.col-id", { hasText: new RegExp(`^#${requestId}$`) }) });
  await row.locator("button.customer-pay-btn").click();
  await page.locator("#pum-file-input").setInputFiles({ name: `${reference}.png`, mimeType: "image/png", buffer: PNG });
  await page.locator(".pum-ref-input").fill(reference);
  const [upload] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/customer/requests/${requestId}/payment-proof`) && r.request().method() === "POST"),
    page.locator(".pum-confirm-btn").click(),
  ]);
  expect(upload.status(), await upload.text()).toBe(200);
  await expect(row.locator(".customer-payment-pill")).toHaveText(/pending/i, { timeout: 15000 });
  await page.screenshot({ path: path.join(evidenceDir, shot) });
  await context.close();
  return errors;
}

test("payment proof storage lifecycle: customer UI -> DB/file -> cashier UI -> resubmit retains evidence", async ({ browser, request }) => {
  test.setTimeout(180000);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const customer = await login(request, "customer");
  const receptionist = await login(request, "receptionist");
  const cashier = await login(request, "cashier");
  const uniquePrice = 400 + (Date.now() % 500);

  // Setup via API: pet + approved grooming request.
  const pet = (await api(request, customer, "post", "/pets", { name: `STORAGE_TEST Pet ${Date.now()}`, species: "Dog" })).pet;
  const date = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const created = await api(request, customer, "post", "/customer/requests", {
    customer_name: customer.user.name, customer_email: customer.user.email,
    pet_id: pet.id, pet_name: pet.name, request_type: "grooming", service_type: "grooming",
    service_name: "Standard Grooming", request_date: date, request_time: "10:00",
    requested_date: date, requested_time: "10:00", price: uniquePrice, notes: "STORAGE_TEST",
  });
  const requestId = created.request.id;
  await api(request, receptionist, "post", `/receptionist/requests/${requestId}/approve`, { receptionist_remarks: "STORAGE_TEST" });

  // 1. Customer uploads via the real UI.
  const consoleErrors = await customerUploadsProofInUi(browser, customer, requestId, `STORAGE-REF-1-${requestId}`, "1-customer-upload.png");

  // 2. Database + private file state.
  const findMine = async () => (await api(request, customer, "get", "/customer/my-requests")).requests.find((r) => r.id === requestId);
  const afterFirst = await findMine();
  expect(afterFirst.payment_status).toBe("pending");
  expect(afterFirst.payment_proof).toMatch(/^payment-proofs\/proof_\d+_[A-Za-z0-9]{10}\.png$/);
  expect(fs.existsSync(path.join(privateRoot, afterFirst.payment_proof)), "proof stored on private disk").toBeTruthy();
  expect(fs.existsSync(path.join(rootDir, "backend", "storage", "app", "public", afterFirst.payment_proof)), "not on public disk").toBeFalsy();

  // 3. Cashier (next role) opens the proof in the live Payment Approvals UI.
  const cashierView = await openAs(browser, cashier, "/cashier/pos");
  const { page } = cashierView;
  await page.locator(".pos-cat-tab--approvals").click();
  const card = page.locator(".pa-card", { hasText: `₱${uniquePrice.toLocaleString("en-PH")}` }).filter({ hasText: "Standard Grooming" });
  await expect(card.first()).toBeVisible({ timeout: 20000 });
  const [proofRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/files/payment-proofs/service-request/${requestId}/view`)),
    card.first().locator(".pa-proof-btn").click(),
  ]);
  expect(proofRes.status()).toBe(200);
  expect(proofRes.headers()["content-type"]).toBe("image/png");
  expect(proofRes.headers()["content-disposition"]).toBe(`inline; filename=payment_proof_${requestId}.png`);
  const img = page.locator("img.pa-proof-image");
  await expect(img).toBeVisible();
  expect(await img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBeTruthy();
  await page.screenshot({ path: path.join(evidenceDir, "2-cashier-views-proof.png") });
  await cashierView.context.close();

  // 4. Cashier rejects; customer re-uploads in the UI; rejected proof is retained.
  await api(request, cashier, "post", `/cashier/payment-requests/${requestId}/reject`, {
    type: "service_request", rejection_reason: "STORAGE_TEST blurry proof",
  });
  consoleErrors.push(...(await customerUploadsProofInUi(browser, customer, requestId, `STORAGE-REF-2-${requestId}`, "3-customer-resubmit.png")));
  const afterSecond = await findMine();
  expect(afterSecond.payment_status).toBe("pending");
  expect(afterSecond.payment_proof).not.toBe(afterFirst.payment_proof);
  expect(fs.existsSync(path.join(privateRoot, afterSecond.payment_proof)), "new proof stored").toBeTruthy();
  expect(fs.existsSync(path.join(privateRoot, afterFirst.payment_proof)), "rejected proof retained as evidence").toBeTruthy();

  fs.writeFileSync(path.join(evidenceDir, "result.json"), JSON.stringify({
    date: new Date().toISOString(), requestId, firstProof: afterFirst.payment_proof, secondProof: afterSecond.payment_proof,
    cashierProofStatus: proofRes.status(), contentDisposition: proofRes.headers()["content-disposition"],
    consoleErrors: consoleErrors.concat(cashierView.errors),
  }, null, 2));
  expect(cashierView.errors.filter((e) => /^5\d\d /.test(e))).toEqual([]);
});
