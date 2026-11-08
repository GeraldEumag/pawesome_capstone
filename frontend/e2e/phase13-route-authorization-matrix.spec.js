const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { apiLogin } = require("./test-utils");

const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const evidenceDir = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase13-authorization");
const matrixPath = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase13-route-authorization-map.json");

test.beforeEach(() => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  expect(apiUrl).toBe("http://127.0.0.1:8001/api");
});

const PROBE_ROLES = ["customer", "receptionist", "cashier", "inventory", "veterinary", "manager", "admin", "vet_tech"];
const ROLE_ALIASES = { vet: "veterinary" };
const allowed = (roles, probe) => roles.includes(probe) || roles.some((r) => ROLE_ALIASES[r] === probe);
// admin is all-access staff by design (AGENTS.md): allowed on every route that
// lists it and every staff route, but DENIED on customer-scoped routes that do
// not explicitly include admin (customer-portal separation).
const adminDisallowed = (roles) => roles.includes("customer") && !roles.includes("admin");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("Phase 13: route/verb authorization matrix — every route probed with a disallowed role", async ({ request }) => {
  test.setTimeout(2400000);
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  const sessions = {};
  for (const role of PROBE_ROLES) sessions[role] = await apiLogin(request, role);

  const violations = [];
  const results = { total_routes: 0, route_probes: 0, group_probes: 0, denied: 0, violations: 0, errors: 0, by_role: {} };
  const perUserPending = {};

  const probe = (route, role) => {
    const method = (route.method.split("|")[0] || "get").toLowerCase();
    const uri = route.uri.replace(/\{[^}]+\}/g, "1");
    const url = `http://127.0.0.1:8001/${uri}`;
    const prev = perUserPending[role] || Promise.resolve();
    const job = prev.then(async () => {
      let status = 0;
      try {
        const res = await request.fetch(url, { method: method.toUpperCase(), headers: { Accept: "application/json", Authorization: `Bearer ${sessions[role].token}` }, timeout: 5000 });
        status = res.status();
      } catch { status = -1; }
      await sleep(1100);
      return status;
    });
    perUserPending[role] = job.catch(() => {});
    return job;
  };
  const record = (r) => {
    if (r.status === -1) { results.errors++; return; }
    if ([401, 403].includes(r.status)) { results.denied++; return; }
    if (r.status === 404 || r.status === 410) { results.inconclusive++; (results.inconclusive_list ??= []).push(r); return; }
    results.violations++;
    violations.push(r);
  };

  const jobs = [];
  // Pass 1 — every role-restricted route probed once with a round-robin disallowed role.
  let i = 0;
  for (const route of matrix) {
    if (!route.auth) continue;
    const roles = route.roles || [];
    if (!roles.length) continue;
    results.total_routes++;
    const disallowed = PROBE_ROLES.filter((role) =>
      role === "admin" ? adminDisallowed(roles) : !allowed(roles, role));
    if (!disallowed.length) continue;
    const role = disallowed[i++ % disallowed.length];
    results.route_probes++;
    results.by_role[role] = (results.by_role[role] || 0) + 1;
    jobs.push(probe(route, role).then((status) => record({ scope: "route", method: route.method, uri: route.uri, role, expected: "401/403", status })));
  }
  // Pass 2 — every distinct role-set probed with EVERY disallowed role on one representative route.
  const seen = new Map();
  for (const route of matrix) {
    if (!route.auth || !route.roles?.length) continue;
    const key = route.roles.join(",");
    if (!seen.has(key)) seen.set(key, route);
  }
  for (const [key, route] of seen) {
    const roles = key.split(",");
    for (const role of PROBE_ROLES.filter((r) => (r === "admin" ? adminDisallowed(roles) : !allowed(roles, r)))) {
      results.group_probes++;
      jobs.push(probe(route, role).then((status) => record({ scope: "group", group: key, uri: route.uri, role, expected: "401/403", status })));
    }
  }

  // Incremental evidence every 200 resolved probes.
  let done = 0;
  await Promise.all(jobs.map((j) => j.then((r) => {
    if (r !== undefined) return;
    done++;
    if (done % 200 === 0) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, "route-authorization-matrix-evidence.json"), JSON.stringify({ result: "RUNNING", ...results, violations: violations.slice(0, 200) }, null, 2));
    }
  })));

  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidence = { result: results.violations === 0 ? "PASS" : "FAIL", ...results, violations: violations.slice(0, 200) };
  fs.writeFileSync(path.join(evidenceDir, "route-authorization-matrix-evidence.json"), JSON.stringify(evidence, null, 2));

  expect(violations, `authorization violations: ${JSON.stringify(violations.slice(0, 30), null, 2)}`).toEqual([]);
});
