const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { apiLogin } = require("./test-utils");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const evidenceDir = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase12-inventory");

// The inventory API is currently mounted on one PHP process in the audit stack.
// Parallel requests against :8001 are sufficient to test row-lock serialization.
// Cases are independent: a lifecycle failure must not skip the API checks.
test.beforeEach(() => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  expect(apiUrl).toBe("http://127.0.0.1:8001/api");
});

const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => new Date().toISOString().slice(0, 7);

async function api(request, session, method, endpoint, data, extra = {}) {
  const response = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}`, ...extra.headers },
    ...(extra.multipart ? { multipart: extra.multipart } : data === undefined ? {} : { data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`${method.toUpperCase()} ${endpoint}: ${response.status()} ${JSON.stringify(body)}`);
  return { status: response.status(), headers: response.headers(), body };
}

async function apiStatus(request, session, method, endpoint, data, extra = {}) {
  const response = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}`, ...extra.headers },
    ...(extra.multipart ? { multipart: extra.multipart } : data === undefined ? {} : { data }),
  });
  return { status: response.status(), body: await response.json().catch(() => ({})), headers: response.headers() };
}

async function openAs(browser, session, route, network, consoleLog) {
  const context = await browser.newContext({ baseURL: frontendUrl });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", user.role);
    localStorage.setItem("name", user.name || user.email);
    localStorage.setItem("username", user.username || user.email);
    localStorage.setItem("email", user.email);
  }, session);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      consoleLog.push({ type: msg.type(), text: msg.text(), page: page.url() });
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) {
      network.push({ source: "browser", method: response.request().method(), path: url.pathname, status: response.status(), page: new URL(page.url()).pathname });
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      network.push({ source: "browser", method: request.method(), path: url.pathname, status: "REQUEST_FAILED", failure: request.failure()?.errorText, page: new URL(page.url()).pathname });
    }
  });
  await page.goto(route);
  return { page, context };
}

async function shot(page, name) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false }).catch(() => {});
  return `phase12-inventory/${file}`;
}

function dbQuery(sql) {
  const code = `$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`;
  return JSON.parse(execFileSync("php", ["-r", code], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
}

function dbItem(itemId) {
  const id = Number(itemId);
  const item = dbQuery(`SELECT id,sku,barcode,name,category,brand,supplier,stock,reorder_level,price,cost,status,is_sellable,requires_expiry_tracking,issue_method,archived_at,created_at,updated_at FROM inventory_items WHERE id=${id}`)[0] || null;
  const batches = dbQuery(`SELECT id,inventory_item_id,batch_no,received_date,manufacturing_date,expiration_date,quantity,remaining_quantity,status,supplier,unit_cost,notes,created_at,updated_at FROM inventory_batches WHERE inventory_item_id=${id} ORDER BY id`);
  const logs = dbQuery(`SELECT id,inventory_item_id,delta,quantity,type,movement_type,reference_type,reference_id,stock_before,stock_after,previous_stock,new_stock,reason,performed_by,role,user_id,details,created_at,updated_at FROM inventory_logs WHERE inventory_item_id=${id} ORDER BY id`);
  const audits = dbQuery(`SELECT id,inventory_item_id,system_stock,actual_stock,variance,audit_month,status,approval_status,reason,checked_by,approved_by,approved_at,created_at,updated_at FROM inventory_monthly_audits WHERE inventory_item_id=${id} ORDER BY id`);
  return { item, batches, logs, audits };
}

function dbCreateItem({ name, sku, barcode, stock = 0, batchQuantity = null, batchNo = null }) {
  const stockInt = Number(stock);
  const code = `
$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=pawesome_e2e_audit","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$now=date("Y-m-d H:i:s");
$db->prepare("INSERT INTO inventory_items (sku,barcode,name,category,brand,stock,reorder_level,price,cost,status,is_sellable,is_service_consumable,requires_expiry_tracking,issue_method,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")->execute([$argv[1],$argv[2],$argv[3],"Accessories","Phase12",(int)$argv[6],1,25.00,10.00,"active",1,0,0,"FIFO",$now,$now]);
$id=(int)$db->lastInsertId();
if ($argv[4] !== null && (int)$argv[4] > 0) {
  $db->prepare("INSERT INTO inventory_batches (inventory_item_id,batch_no,received_date,quantity,remaining_quantity,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")->execute([$id,$argv[5],$now,(int)$argv[4],(int)$argv[4],"active","Phase 12 fixture batch",$now,$now]);
}
echo json_encode(["id"=>$id]);`;
  return JSON.parse(execFileSync("php", ["-r", code, sku, barcode, name, String(batchQuantity ?? ""), batchNo ?? `P12-${Date.now()}`, String(stockInt)], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
}

async function findInventoryItem(request, session, sku) {
  const response = await api(request, session, "get", `/inventory/items?search=${encodeURIComponent(sku)}`);
  const item = (response.body.items || response.body.data || []).find((row) => row.sku === sku);
  expect(item, `inventory item ${sku}`).toBeTruthy();
  return item;
}

async function openInventoryRowAction(page, itemName, actionName) {
  const row = page.locator(".ui-table tbody tr", { hasText: itemName }).filter({ has: page.locator("button.row-action-popover-trigger") }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Actions for ${itemName}` }).click();
  await page.getByRole("dialog", { name: `Actions for ${itemName}` }).getByRole("button", { name: actionName }).click();
}

test("Phase 12.3 native inventory lifecycle: product, batch receive, stock-out, audit, reconciliation", async ({ browser, request }) => {
  test.setTimeout(480000);
  const network = [], consoleLog = [], screenshots = [];
  const unique = Date.now().toString().slice(-8);
  const inventory = await apiLogin(request, "inventory");
  const manager = await apiLogin(request, "manager");
  const productName = `0000 Phase12 Inventory ${unique}`;
  const sku = `P12I${unique}`;
  const barcode = `P12BC${unique}`;
  const auditMonth = monthNow();

  const view = await openAs(browser, inventory, "/inventory/stock", network, consoleLog);
  const page = view.page;
  screenshots.push(await shot(page, "01-inventory-overview"));

  // Product creation and its initial batch are real browser submissions.
  await page.getByRole("button", { name: /Add New Item/i }).click();
  const productModal = page.getByRole("dialog", { name: /Add New Product/i });
  await productModal.locator('input[name="name"]').fill(productName);
  await productModal.locator('input[name="sku"]').fill(sku);
  await productModal.locator('input[name="barcode"]').fill(barcode);
  await productModal.locator('select[name="category"]').selectOption("Accessories");
  await productModal.locator('input[name="brand"]').fill("Phase12 Audit");
  await productModal.getByRole("button", { name: /Next/i }).click();
  await productModal.locator('input[name="quantity"]').fill("12");
  await productModal.locator('input[name="reorder_level"]').fill("1");
  await productModal.locator('input[name="price"]').fill("25");
  await productModal.locator('input[name="cost"]').fill("10");
  await productModal.locator('input[name="batch_quantity"]').fill("12");
  await productModal.getByRole("button", { name: /Next/i }).click();
  screenshots.push(await shot(page, "02-product-review"));
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/inventory/items" && r.status() === 201),
    productModal.getByRole("button", { name: /Create Product/i }).click(),
  ]);

  await page.getByPlaceholder(/Search by name, SKU, barcode, brand/i).fill(sku);
  const productRow = page.locator(".ui-table tbody tr", { hasText: productName }).first();
  await expect(productRow).toContainText(sku);
  await expect(productRow.locator(".stock-value")).toHaveText("12");
  screenshots.push(await shot(page, "03-product-created"));

  const created = await findInventoryItem(request, inventory, sku);
  const itemId = created.id;

  // Expand the row and verify the UI-created initial batch.
  await openInventoryRowAction(page, productName, "View Batches");
  const batchPanel = page.locator(".batch-details", { hasText: `Batches for ${productName}` });
  await expect(batchPanel).toContainText("Batch-001");
  await expect(batchPanel).toContainText("12");
  screenshots.push(await shot(page, "04-initial-batch"));

  // Authorized stock-in through the native Adjust Stock modal creates Batch-002.
  await openInventoryRowAction(page, productName, "Adjust Stock");
  const adjustModal = page.getByRole("dialog", { name: /Adjust Stock/i });
  await adjustModal.locator(".quantity-input").fill("5");
  await adjustModal.locator(".reason-select").selectOption("New stock received");
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/inventory/items/${itemId}/batches` && r.status() === 200),
    adjustModal.locator("button.btn-confirm").click(),
  ]);
  await expect(page.locator(".ui-table tbody tr", { hasText: productName }).first().locator(".stock-value")).toHaveText("17");
  screenshots.push(await shot(page, "05-stock-in-batch"));

  // Authorized stock-out through the same UI path deducts FIFO batch stock.
  await openInventoryRowAction(page, productName, "Adjust Stock");
  const removeModal = page.getByRole("dialog", { name: /Adjust Stock/i });
  // The "remove" class only exists once the mode is active; select by role/name.
  await removeModal.getByRole("button", { name: "Remove Stock" }).first().click();
  await removeModal.locator(".quantity-input").fill("3");
  await removeModal.locator(".reason-select").selectOption("Damaged/expired");
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/inventory/items/${itemId}/adjust-stock` && r.status() === 200),
    removeModal.locator("button.btn-confirm").click(),
  ]);
  await expect(page.locator(".ui-table tbody tr", { hasText: productName }).first().locator(".stock-value")).toHaveText("14");

  await openInventoryRowAction(page, productName, "History");
  const historyModal = page.getByRole("dialog", { name: /Stock History/i });
  await expect(historyModal).toContainText("batch restock");
  await expect(historyModal).toContainText("stock adjustment decrement");
  screenshots.push(await shot(page, "06-movement-history"));
  await page.getByRole("button", { name: /Close Stock History dialog/i }).click();

  // Browser-submitted physical count: 13 versus system 14 produces a pending discrepancy.
  await page.goto("/inventory/monthly-audit");
  await page.getByPlaceholder(/Search by name or SKU/i).fill(sku);
  const auditRow = page.locator(".audit-table tbody tr", { hasText: productName }).first();
  await expect(auditRow).toContainText(sku);
  await auditRow.locator('input[type="number"]').fill("13");
  await auditRow.locator("select").selectOption("Counting Error");
  screenshots.push(await shot(page, "07-audit-count"));
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/inventory/monthly-audit" && r.status() === 200),
    page.getByRole("button", { name: /Save Monthly Audit/i }).click(),
  ]);
  await expect(page.locator(".audit-table tbody tr", { hasText: productName }).first()).toContainText(/discrepancy/i);

  let evidence = dbItem(itemId);
  expect(Number(evidence.item.stock)).toBe(13);
  expect(Number(evidence.batches.reduce((sum, batch) => sum + Number(batch.remaining_quantity), 0))).toBe(13);
  expect(evidence.batches.map((batch) => batch.batch_no)).toEqual(expect.arrayContaining(["Batch-001", "Batch-002"]));
  expect(Number(evidence.batches.find((batch) => batch.batch_no === "Batch-001")?.remaining_quantity)).toBe(8);
  expect(Number(evidence.batches.find((batch) => batch.batch_no === "Batch-002")?.remaining_quantity)).toBe(5);
  const audit = evidence.audits.find((row) => row.audit_month === auditMonth);
  expect(audit, "monthly audit row").toBeTruthy();
  expect(Number(audit.system_stock)).toBe(14);
  expect(Number(audit.actual_stock)).toBe(13);
  expect(Number(audit.variance)).toBe(-1);
  expect(audit.status).toBe("discrepancy");
  expect(audit.approval_status).toBe("pending");
  expect(audit.checked_by).toBe(inventory.user.name);

  // There is currently no browser surface for manager approval; exercise the
  // actual manager API boundary and verify attribution independently.
  const approve = await api(request, manager, "post", `/manager/inventory-audits/${audit.id}/approve`, {});
  expect(approve.body.audit.approval_status).toBe("approved");

  evidence = dbItem(itemId);
  const approvedAudit = evidence.audits.find((row) => row.id === audit.id);
  expect(approvedAudit.approval_status).toBe("approved");
  expect(Number(approvedAudit.approved_by)).toBe(Number(manager.user.id));
  expect(approvedAudit.approved_at).toBeTruthy();

  const movements = evidence.logs.map((log) => log.movement_type);
  expect(movements).toEqual(expect.arrayContaining(["batch_restock", "stock_adjustment_decrement", "monthly_audit"]));
  expect(Number(evidence.logs.filter((log) => log.movement_type === "batch_restock").length)).toBeGreaterThanOrEqual(2);
  const auditLog = evidence.logs.find((log) => log.movement_type === "monthly_audit");
  expect(auditLog).toBeTruthy();
  expect(Number(auditLog.delta)).toBe(-1);
  expect(Number(auditLog.stock_before)).toBe(14);
  expect(Number(auditLog.stock_after)).toBe(13);
  expect(Number(auditLog.user_id)).toBe(Number(inventory.user.id));
  expect(auditLog.performed_by).toBe(inventory.user.name);
  expect(auditLog.role).toBe("inventory");
  expect(auditLog.created_at).toBeTruthy();

  // Verify the reports screen's displayed quantity against the persisted item.
  await page.goto("/inventory/reports");
  const reportRow = page.locator(".standard-table tbody tr", { hasText: productName }).first();
  await expect(reportRow).toContainText(productName);
  await expect(reportRow).toContainText("13");
  screenshots.push(await shot(page, "08-report-reconciliation"));

  const result = {
    result: "PASS",
    item_id: itemId,
    product: { name: productName, sku, barcode },
    ui: {
      product_created: true,
      initial_batch: "Batch-001",
      stock_in_batch: "Batch-002",
      stock_out: 3,
      audit_month: auditMonth,
      audit_actual: 13,
      report_stock: 13,
    },
    database: evidence,
    checks: {
      batch_and_item_stock_equal: Number(evidence.item.stock) === Number(evidence.batches.reduce((sum, batch) => sum + Number(batch.remaining_quantity), 0)),
      audit_approval_actor: Number(approvedAudit.approved_by) === Number(manager.user.id),
      movement_actor: Number(auditLog.user_id) === Number(inventory.user.id),
      unauthorized_browser_errors: consoleLog.filter((entry) => entry.type === "error"),
    },
    screenshots,
    network,
    console: consoleLog,
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "inventory-lifecycle-evidence.json"), JSON.stringify(result, null, 2));
  await view.context.close();
});

test("Phase 12.3 inventory rejects unauthorized access, tampering, duplicates, and insufficient stock", async ({ request }) => {
  const unique = Date.now().toString().slice(-8);
  const inventory = await apiLogin(request, "inventory");
  const customer = await apiLogin(request, "customer");
  const cashier = await apiLogin(request, "cashier");
  const manager = await apiLogin(request, "manager");
  const fixture = dbCreateItem({
    name: `Phase12 Negative ${unique}`,
    sku: `P12NEG${unique}`,
    barcode: `P12NBC${unique}`,
    stock: 5,
    batchQuantity: 5,
    batchNo: `P12-DUP-${unique}`,
  });
  const itemId = fixture.id;
  const before = dbItem(itemId);
  const negative = {};

  negative.customer_adjust = await apiStatus(request, customer, "post", `/inventory/items/${itemId}/adjust-stock`, {
    type: "remove", adjustment_type: "decrement", quantity: 1, reason: "unauthorized customer",
  });
  negative.cashier_batch = await apiStatus(request, cashier, "post", `/inventory/items/${itemId}/batches`, {
    received_date: today(), quantity: 1,
  });
  negative.customer_audit_save = await apiStatus(request, customer, "post", "/inventory/monthly-audit", {
    audit_month: monthNow(), items: [{ inventory_item_id: itemId, actual_stock: 4, reason: "unauthorized" }],
  });
  negative.manager_stock_adjust = await apiStatus(request, manager, "post", `/inventory/items/${itemId}/adjust-stock`, {
    type: "remove", adjustment_type: "decrement", quantity: 1, reason: "manager is not inventory",
  });
  expect([403, 404]).toContain(negative.customer_adjust.status);
  expect([403, 404]).toContain(negative.cashier_batch.status);
  expect([403, 404]).toContain(negative.customer_audit_save.status);
  expect([403, 404]).toContain(negative.manager_stock_adjust.status);

  negative.missing_item = await apiStatus(request, inventory, "post", "/inventory/items/999999999/adjust-stock", {
    type: "remove", adjustment_type: "decrement", quantity: 1, reason: "tampered item id",
  });
  negative.invalid_quantity = await apiStatus(request, inventory, "post", `/inventory/items/${itemId}/adjust-stock`, {
    type: "remove", adjustment_type: "decrement", quantity: -1, reason: "tampered quantity",
  });
  negative.insufficient_stock = await apiStatus(request, inventory, "post", `/inventory/items/${itemId}/adjust-stock`, {
    type: "remove", adjustment_type: "decrement", quantity: 99, reason: "insufficient stock test",
  });
  negative.missing_batch = await apiStatus(request, inventory, "post", "/inventory/batches/999999999/adjust", {
    quantity: 1, reason: "tampered batch id",
  });
  expect([404, 422]).toContain(negative.missing_item.status);
  expect(negative.invalid_quantity.status).toBe(422);
  expect(negative.insufficient_stock.status).toBe(422);
  expect([404, 422]).toContain(negative.missing_batch.status);

  // Retry semantics: the same Idempotency-Key and payload must not create a
  // second batch or a second stock deduction.
  const key = `phase12-inventory-${unique}`;
  const batchPayload = {
    batch_no: `P12-IDEM-${unique}`,
    received_date: today(),
    quantity: 2,
    notes: "idempotent receive check",
  };
  negative.idempotent_batch_first = await apiStatus(request, inventory, "post", `/inventory/items/${itemId}/batches`, batchPayload, {
    headers: { "Idempotency-Key": key },
  });
  negative.idempotent_batch_retry = await apiStatus(request, inventory, "post", `/inventory/items/${itemId}/batches`, batchPayload, {
    headers: { "Idempotency-Key": key },
  });
  negative.idempotent_batch_conflict = await apiStatus(request, inventory, "post", `/inventory/items/${itemId}/batches`, { ...batchPayload, quantity: 3 }, {
    headers: { "Idempotency-Key": key },
  });
  expect(negative.idempotent_batch_first.status).toBe(200);
  expect(negative.idempotent_batch_retry.status).toBe(200);
  expect(negative.idempotent_batch_retry.headers["idempotent-replayed"]).toBe("true");
  expect(negative.idempotent_batch_conflict.status).toBe(409);

  const after = dbItem(itemId);
  const batchesByNumber = after.batches.filter((batch) => batch.batch_no === `P12-IDEM-${unique}`);
  expect(batchesByNumber.length).toBe(1);
  expect(Number(after.item.stock)).toBe(Number(before.item.stock) + 2);
  expect(Number(after.batches.reduce((sum, batch) => sum + Number(batch.remaining_quantity), 0))).toBe(Number(after.item.stock));

  negative.duplicate_batch_no = await apiStatus(request, inventory, "post", `/inventory/items/${itemId}/batches`, {
    batch_no: `P12-IDEM-${unique}`,
    received_date: today(),
    quantity: 1,
    notes: "conflicting duplicate batch reference",
  });
  expect(negative.duplicate_batch_no.status).toBe(422);
  const afterDuplicate = dbItem(itemId);
  expect(afterDuplicate.batches.filter((batch) => batch.batch_no === `P12-IDEM-${unique}`).length).toBe(1);
  expect(Number(afterDuplicate.item.stock)).toBe(Number(after.item.stock));

  const result = {
    result: "PASS",
    item_id: itemId,
    before,
    after: afterDuplicate,
    responses: negative,
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "inventory-negative-evidence.json"), JSON.stringify(result, null, 2));
});

test("Phase 12.3 concurrent stock movements cannot oversell or double-deduct inventory", async ({ request }) => {
  const unique = Date.now().toString().slice(-8);
  const inventory = await apiLogin(request, "inventory");
  const fixture = dbCreateItem({
    name: `Phase12 Race ${unique}`,
    sku: `P12RACE${unique}`,
    barcode: `P12RBC${unique}`,
    stock: 5,
    batchQuantity: 5,
    batchNo: `P12-RACE-${unique}`,
  });
  const itemId = fixture.id;
  const before = dbItem(itemId);
  const payload = {
    type: "remove",
    adjustment_type: "decrement",
    quantity: 4,
    reason: `phase12 concurrent stock-out ${unique}`,
  };

  const [first, second] = await Promise.all([
    apiStatus(request, inventory, "post", `/inventory/items/${itemId}/adjust-stock`, payload),
    apiStatus(request, inventory, "post", `/inventory/items/${itemId}/adjust-stock`, payload),
  ]);
  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([200, 422]);

  const after = dbItem(itemId);
  expect(Number(after.item.stock)).toBe(1);
  expect(Number(after.batches.reduce((sum, batch) => sum + Number(batch.remaining_quantity), 0))).toBe(1);
  expect(after.logs.filter((log) => log.movement_type === "stock_adjustment_decrement").length).toBe(1);
  expect(Math.min(...after.batches.map((batch) => Number(batch.remaining_quantity)))).toBeGreaterThanOrEqual(0);
  expect(Number(after.item.stock)).toBeGreaterThanOrEqual(0);

  const result = {
    result: "PASS",
    item_id: itemId,
    before,
    responses: [
      { status: first.status, body: first.body },
      { status: second.status, body: second.body },
    ],
    after,
    checks: {
      one_success_one_rejection: statuses.join("/") === "200/422",
      no_negative_stock: Number(after.item.stock) >= 0,
      no_duplicate_ledger: after.logs.filter((log) => log.movement_type === "stock_adjustment_decrement").length === 1,
      batch_stock_reconciled: Number(after.item.stock) === Number(after.batches.reduce((sum, batch) => sum + Number(batch.remaining_quantity), 0)),
    },
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "inventory-race-evidence.json"), JSON.stringify(result, null, 2));
});
