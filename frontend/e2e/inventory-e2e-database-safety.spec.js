const { test, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { checkAuditEnv, enforceAuditStack } = require("./audit-guard");
const { apiLogin } = require("./test-utils");

/**
 * Regression coverage for the mutation guard itself: proves misconfigurations
 * fail closed, unconfigured envs skip cleanly, and the live API is proven to
 * write into the audit database (not the dev database) before mutations run.
 */

function decision(env) {
  const code = `const {checkAuditEnv}=require(${JSON.stringify(path.resolve(__dirname, "audit-guard.js"))});console.log(JSON.stringify(checkAuditEnv()));`;
  return JSON.parse(execFileSync(process.execPath, ["-e", code], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" }));
}

test.describe("E2E mutation-guard decision table", () => {
  test("no audit env configured -> skip (refuses to mutate unknown DB)", () => {
    expect(decision({}).action).toBe("skip");
  });

  test("missing E2E_API_URL -> hard fail (no silent dev fallback)", () => {
    const d = decision({ E2E_AUDIT_DATABASE: "pawesome_inventory_audit" });
    expect(d.action).toBe("fail");
    expect(d.reason).toMatch(/E2E_API_URL/);
  });

  test("missing E2E_AUDIT_DATABASE -> hard fail", () => {
    const d = decision({ E2E_API_URL: "http://127.0.0.1:8001/api" });
    expect(d.action).toBe("fail");
    expect(d.reason).toMatch(/E2E_AUDIT_DATABASE/);
  });

  test("development API port 8000 -> hard fail", () => {
    const d = decision({ E2E_API_URL: "http://127.0.0.1:8000/api", E2E_AUDIT_DATABASE: "pawesome_inventory_audit" });
    expect(d.action).toBe("fail");
    expect(d.reason).toMatch(/development API port/);
  });

  test("development database name -> hard fail", () => {
    for (const name of ["pawesome", "pawesome_test", "mysql"]) {
      const d = decision({ E2E_API_URL: "http://127.0.0.1:8001/api", E2E_AUDIT_DATABASE: name });
      expect(d.action).toBe("fail");
    }
  });

  test("non-audit database name -> hard fail", () => {
    const d = decision({ E2E_API_URL: "http://127.0.0.1:8001/api", E2E_AUDIT_DATABASE: "pawesome_staging" });
    expect(d.action).toBe("fail");
    expect(d.reason).toMatch(/audit/i);
  });

  test("audit DB name equal to dev DB -> hard fail", () => {
    const d = decision({ E2E_API_URL: "http://127.0.0.1:8001/api", E2E_AUDIT_DATABASE: "pawesome_audit", E2E_DEV_DATABASE: "pawesome_audit" });
    expect(d.action).toBe("fail");
  });

  test("approved audit stack -> proceed", () => {
    const d = decision({ E2E_API_URL: "http://127.0.0.1:8001/api", E2E_AUDIT_DATABASE: "pawesome_inventory_audit" });
    expect(d.action).toBe("proceed");
  });
});

test.describe("E2E mutation-guard live verification", () => {
  test("API under test provably writes to the audit database, not dev", async ({ request }) => {
    // Only meaningful when the audit env is configured — the guard itself
    // enforces that; an unconfigured env skips without mutating anything.
    const result = await enforceAuditStack(request, test, { role: "inventory", apiLogin });
    expect(result.verified).toBe(true);
    expect(result.detail).toMatch(/confirmed in/);
  });
});
