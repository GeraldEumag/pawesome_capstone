const { test, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { apiLogin, loginAs } = require("./test-utils");
const { enforceAuditStack } = require("./audit-guard");

const apiUrl = process.env.E2E_API_URL;
const auditDb = process.env.E2E_AUDIT_DATABASE;
const runId = Date.now().toString(36).toUpperCase();

test.beforeEach(async ({ request }) => {
  await enforceAuditStack(request, test, { role: "inventory", apiLogin });
});

function findByBarcode(barcode) {
  const code = '$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=' + auditDb +
    '","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$q=$db->prepare("SELECT id,name,sku,barcode,stock FROM inventory_items WHERE barcode=?");$q->execute([$argv[1]]);echo json_encode($q->fetch(PDO::FETCH_ASSOC));';
  return JSON.parse(execFileSync("php", ["-r", code, barcode], {
    cwd: path.resolve(__dirname, "../../backend"),
    encoding: "utf8",
  }));
}

test("product creation blocks blank barcode and generates blank SKU", async ({ page, request }) => {
  const apiOrigins = new Set();
  const name = `P31 Product ${runId}`;
  const barcode = `P31BC${runId}`;
  const responses = [];
  page.on("request", (requestEvent) => {
    const url = new URL(requestEvent.url());
    if (url.pathname.startsWith("/api/")) apiOrigins.add(url.origin);
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/inventory/items") {
      responses.push({ status: response.status(), method: response.request().method() });
    }
  });

  await loginAs(page, "inventory");
  await page.goto("/inventory/products");
  await page.getByRole("button", { name: /Add New Item/i }).click();
  const modal = page.getByRole("dialog", { name: /Add New Product/i });
  await modal.locator('input[name="name"]').fill(name);
  await modal.locator('select[name="category"]').selectOption("Accessories");
  await modal.getByRole("button", { name: /Next/i }).click();

  await expect(modal.getByText("Barcode is required for new sellable products")).toBeVisible();
  await expect(modal.locator('input[name="barcode"]')).toBeVisible();
  expect(responses.filter((r) => r.method === "POST")).toHaveLength(0);

  await modal.locator('input[name="barcode"]').fill(barcode);
  await modal.locator('input[name="brand"]').fill("Phase 3.1");
  await modal.getByRole("button", { name: /Next/i }).click();
  await modal.locator('input[name="price"]').fill("27");
  await modal.locator('input[name="cost"]').fill("11");
  await modal.getByRole("button", { name: /Next/i }).click();
  const createResponse = page.waitForResponse((r) =>
    r.request().method() === "POST" &&
    new URL(r.url()).pathname === "/api/inventory/items" &&
    r.status() === 201
  );
  await modal.getByRole("button", { name: /Create Product/i }).click();
  const response = await createResponse;
  const body = await response.json();
  const row = findByBarcode(barcode);

  expect(row).toBeTruthy();
  expect(row.name).toBe(name);
  expect(row.sku).toBeTruthy();
  expect(row.barcode).toBe(barcode);
  expect(Number(row.stock)).toBe(0);
  expect(body.item?.sku || body.sku).toBe(row.sku);
  await page.reload();
  await page.getByPlaceholder(/Search by name, SKU, barcode, brand/i).fill(row.sku);
  await expect(page.locator(".ui-table tbody tr", { hasText: name }).first()).toContainText(row.sku);

  const inventory = await apiLogin(request, "inventory");
  const lookup = await request.get(`${apiUrl}/products/barcode/${barcode}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${inventory.token}` },
  });
  expect(lookup.status()).toBe(200);
  expect(JSON.stringify(await lookup.json())).toContain(String(row.id));
  expect([...apiOrigins].every((origin) => origin === new URL(apiUrl).origin)).toBe(true);
});
