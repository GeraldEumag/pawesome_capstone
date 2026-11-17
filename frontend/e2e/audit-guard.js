/**
 * E2E database-safety guard for mutation-based specs.
 *
 * Why: a spec once mutated the development database because a separate API
 * port does NOT prove a separate database. This guard refuses mutation unless
 * the API under test is PROVEN to write into an isolated `*audit*` database —
 * verified by a real write probe located through the API and cross-checked
 * against both the audit and development databases.
 *
 * Usage (mutation specs):
 *   const { enforceAuditStack } = require("./audit-guard");
 *   test.beforeEach(async ({ request }) => {
 *     await enforceAuditStack(request, test, { role: "inventory" });
 *   });
 *
 * Env contract:
 *   E2E_API_URL           — required for mutation specs; must NOT be the dev API
 *   E2E_AUDIT_DATABASE    — required; must look like an audit database name
 *   E2E_DEV_DATABASE      — optional (default "pawesome"); the DB that must NOT
 *                           receive mutations
 */

const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DEV_DB_DEFAULT = "pawesome";
const FORBIDDEN_DB_NAMES = /^(pawesome|pawesome_test|mysql|information_schema|performance_schema|sys|test)$/i;

function auditEnv(env = process.env) {
  const apiUrl = env.E2E_API_URL || "";
  const auditDb = env.E2E_AUDIT_DATABASE || "";
  const devDb = env.E2E_DEV_DATABASE || DEV_DB_DEFAULT;
  return { apiUrl, auditDb, devDb };
}

/**
 * Pure decision function — testable without a browser.
 * Returns { action: "proceed" } when every static check passes,
 * { action: "skip", reason } when the audit stack is simply not configured,
 * or { action: "fail", reason } on any dangerous/mismatched configuration.
 */
function checkAuditEnv(env = process.env) {
  const { apiUrl, auditDb, devDb } = auditEnv(env);

  if (!apiUrl && !auditDb) {
    return { action: "skip", reason: "Audit stack not configured (E2E_API_URL and E2E_AUDIT_DATABASE unset) — refusing to mutate an unknown database." };
  }
  if (!apiUrl) {
    return { action: "fail", reason: "E2E_AUDIT_DATABASE is set but E2E_API_URL is missing — no silent fallback to the development API." };
  }
  if (!auditDb) {
    return { action: "fail", reason: "E2E_API_URL is set but E2E_AUDIT_DATABASE is missing — refusing to mutate an unidentified database." };
  }
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    return { action: "fail", reason: `E2E_API_URL "${apiUrl}" is not a valid URL.` };
  }
  if (["8000", "80", "443", ""].includes(parsed.port)) {
    return { action: "fail", reason: `E2E_API_URL "${apiUrl}" points at the development API port — mutation refused.` };
  }
  if (FORBIDDEN_DB_NAMES.test(auditDb)) {
    return { action: "fail", reason: `E2E_AUDIT_DATABASE "${auditDb}" names the development/test/system database — mutation refused.` };
  }
  if (!/audit/i.test(auditDb)) {
    return { action: "fail", reason: `E2E_AUDIT_DATABASE "${auditDb}" does not satisfy the *audit* naming rule.` };
  }
  if (auditDb === devDb) {
    return { action: "fail", reason: `E2E_AUDIT_DATABASE equals the development database "${devDb}".` };
  }
  return { action: "proceed", apiUrl, auditDb, devDb };
}

/** Direct MySQL query against a named database — bypasses the API entirely. */
function dbQuery(database, sql) {
  const code = `$db=new PDO("mysql:host=127.0.0.1;port=3306;dbname=${database}","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`;
  return JSON.parse(execFileSync("php", ["-r", code], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
}

/**
 * Server-side identity proof: writes a marker row THROUGH the API, then checks
 * which database actually received it. Returns "audit" | "dev" | "neither".
 */
async function proveApiDatabase(request, session, { auditDb, devDb }) {
  const marker = `AUDIT-GUARD-${Date.now()}`;
  const sku = `${marker}-SKU`;
  const barcode = `${marker}-BC`;
  const res = await request.post(`${session.apiUrl}/inventory/items`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
    data: {
      name: marker,
      sku,
      barcode,
      category: "Accessories",
      brand: "audit-guard",
      stock: 0,
      reorder_level: 1,
      price: 1,
      cost: 1,
      is_sellable: false,
    },
  });
  if (!res.ok()) {
    return { db: "unknown", detail: `probe write failed: HTTP ${res.status()} ${await res.text().catch(() => "")}` };
  }
  const body = await res.json().catch(() => ({}));
  const itemId = body.item?.id || body.id || body.data?.id;
  const inAudit = itemId ? dbQuery(auditDb, `SELECT id FROM inventory_items WHERE id=${Number(itemId)} AND sku='${sku}'`) : [];
  const inDev = itemId ? dbQuery(devDb, `SELECT id FROM inventory_items WHERE id=${Number(itemId)} AND sku='${sku}'`) : [];
  // Clean up the probe row inside whichever DB received it (audit only).
  if (itemId && inAudit.length) {
    dbQuery(auditDb, `DELETE FROM inventory_logs WHERE inventory_item_id=${Number(itemId)};`);
    dbQuery(auditDb, `DELETE FROM inventory_batches WHERE inventory_item_id=${Number(itemId)};`);
    dbQuery(auditDb, `DELETE FROM inventory_items WHERE id=${Number(itemId)};`);
  }
  if (inDev.length) return { db: "dev", detail: `probe row ${itemId} landed in the DEVELOPMENT database "${devDb}"` };
  if (inAudit.length) return { db: "audit", detail: `probe row ${itemId} confirmed in "${auditDb}" and absent from "${devDb}"` };
  return { db: "neither", detail: `probe row ${itemId} not found in either "${auditDb}" or "${devDb}"` };
}

/**
 * Enforce the guard inside a spec. `test` is the Playwright test object so the
 * guard can test.skip() for "not configured" and throw for "misconfigured".
 * The positive proof is cached per worker to avoid re-probing every test.
 */
const verified = new Map();
async function enforceAuditStack(request, test, { role = "inventory", apiLogin } = {}) {
  const check = checkAuditEnv();
  if (check.action === "skip") {
    test.skip(true, check.reason);
    return { verified: false, reason: check.reason };
  }
  if (check.action === "fail") {
    throw new Error(`E2E database safety violation: ${check.reason}`);
  }
  const key = `${check.apiUrl}|${check.auditDb}|${role}`;
  if (verified.has(key)) {
    return { verified: true, ...verified.get(key) };
  }
  const session = await apiLogin(request, role);
  session.apiUrl = check.apiUrl.replace(/\/+$/, "");
  const proof = await proveApiDatabase(request, session, check);
  if (proof.db !== "audit") {
    throw new Error(
      `E2E database safety violation: API at ${check.apiUrl} writes to "${proof.db}", not the approved audit database "${check.auditDb}". ${proof.detail}`
    );
  }
  verified.set(key, { apiUrl: check.apiUrl, auditDb: check.auditDb, detail: proof.detail });
  return { verified: true, apiUrl: check.apiUrl, auditDb: check.auditDb, detail: proof.detail };
}

module.exports = { checkAuditEnv, enforceAuditStack, dbQuery, proveApiDatabase };
