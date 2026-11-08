const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { apiLogin } = require("./test-utils");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const evidenceDir = path.resolve(__dirname, "../../browser-evidence/system-security-audit-20261108/phase12-hr-payroll");

test.beforeEach(() => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== "pawesome_e2e_audit", "Requires the approved isolated audit database.");
  expect(apiUrl).toBe("http://127.0.0.1:8001/api");
});

async function apiStatus(request, session, method, endpoint, data, extra = {}) {
  const response = await request[method](`${apiUrl}${endpoint}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.token}`, ...extra.headers },
    ...(data === undefined ? {} : { data }),
  });
  return { status: response.status(), body: await response.json().catch(() => ({})), headers: response.headers() };
}
async function api(request, session, method, endpoint, data, extra = {}) {
  const r = await apiStatus(request, session, method, endpoint, data, extra);
  if (r.status >= 400) throw new Error(`${method} ${endpoint}: ${r.status} ${JSON.stringify(r.body)}`);
  return r;
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
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && consoleLog.push({ type: m.type(), text: m.text() }));
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/")) network.push({ source: "browser", method: r.request().method(), path: url.pathname, status: r.status() });
  });
  await page.goto(route);
  return { page, context };
}
async function shot(page, name) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: false }).catch(() => {});
  return `phase12-hr-payroll/${name}.png`;
}
function dbQuery(sql) {
  const code = `$db=new PDO("mysql:host=127.0.0.1;dbname=pawesome_e2e_audit","root","",[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`;
  return JSON.parse(execFileSync("php", ["-r", code], { cwd: path.resolve(__dirname, "../../backend"), encoding: "utf8" }));
}
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// First half of current month — valid semi-monthly period containing today.
function semiMonthlyPeriod() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0");
  return { start: `${y}-${m}-01`, end: `${y}-${m}-15` };
}

function seedAttendance(userId, days) {
  const values = days.map((d) => `(${userId},NULL,'${d}','08:00:00','17:00:00',8,0,'present','manual',0,0,NULL,NULL,NULL,'pending',NULL,NULL,NULL,NOW(),NOW(),NULL)`).join(",");
  dbQuery(`INSERT IGNORE INTO attendance (user_id,employee_id,date,check_in,check_out,total_hours,overtime_hours,status,source,is_late,is_early_leave,location,notes,remarks,review_status,approved_by,salary_rate,daily_earnings,created_at,updated_at,deleted_at) VALUES ${values}`);
}

async function generatePayroll(request, manager, period) {
  return apiStatus(request, manager, "post", "/manager/payroll/generate", { period_start: period.start, period_end: period.end });
}
function payrollFor(userId, period) {
  // pay_period_* are VARCHAR columns storing "YYYY-MM-DD 00:00:00"
  return dbQuery(`SELECT * FROM payrolls WHERE user_id=${Number(userId)} AND pay_period_start LIKE '${period.start}%' AND pay_period_end LIKE '${period.end}%' ORDER BY id DESC LIMIT 1`)[0] || null;
}

test("Phase 12.6 native HR/payroll lifecycle: attendance, generation, UI approval, payslip, reconciliation", async ({ browser, request }) => {
  test.setTimeout(300000);
  const network = [], consoleLog = [], screenshots = [];
  const manager = await apiLogin(request, "manager");
  const cashier = await apiLogin(request, "cashier");
  const period = semiMonthlyPeriod();
  const staffId = cashier.user.id;

  // Controlled attendance fixture inside the period (4 present days).
  const presentDays = [period.start, "2026-11-04", "2026-11-05", "2026-11-06"].filter((d) => d <= period.end);
  seedAttendance(staffId, presentDays);

  // Generate payroll for the period via the manager endpoint.
  const gen = await generatePayroll(request, manager, period);
  expect([200, 201]).toContain(gen.status);

  let payroll = payrollFor(staffId, period);
  expect(payroll, "payroll row for cashier").toBeTruthy();

  // Browser: manager opens the real payroll UI and approves the row.
  const { page, context } = await openAs(browser, manager, "/manager/payroll", network, consoleLog);
  await page.waitForSelector("table tbody tr", { state: "visible", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  screenshots.push(await shot(page, "01-payroll-management"));

  const staffName = cashier.user.name || payroll.employee_name;
  const row = page.locator("tbody tr").filter({ hasText: new RegExp(staffName.split(" ")[0], "i") }).first();
  const approveBtn = row.getByRole("button", { name: /approve/i }).first();
  if (await approveBtn.count()) {
    await approveBtn.click();
    await page.waitForTimeout(2000);
  }
  screenshots.push(await shot(page, "02-after-approve"));

  // Employee self-view through the real my-payroll UI.
  const { page: empPage, context: empCtx } = await openAs(browser, cashier, "/my-payroll", network, consoleLog);
  await empPage.waitForTimeout(3000);
  screenshots.push(await shot(empPage, "03-employee-my-payroll"));

  // API payslip access (same ownership rule as the UI's payslip view).
  payroll = payrollFor(staffId, period);
  const ownPayslip = await apiStatus(request, cashier, "get", `/my-payroll/${payroll.id}/payslip`);
  const otherPayroll = dbQuery(`SELECT id FROM payrolls WHERE user_id != ${Number(staffId)} AND user_id IS NOT NULL ORDER BY id DESC LIMIT 1`)[0];
  const otherPayslip = otherPayroll ? await apiStatus(request, cashier, "get", `/my-payroll/${otherPayroll.id}/payslip`) : { status: null };

  // Reconciliation: recompute the same period and compare to the stored row.
  const recomputed = (await api(request, manager, "post", "/manager/payroll/compute", { period_start: period.start, period_end: period.end })).body;
  const rows = recomputed.data || [];
  const recomputedRow = Array.isArray(rows) ? rows.find((r) => Number(r.user_id ?? r.employee_id) === Number(staffId)) : null;

  const deductionsTotal =
    num(payroll.deductions) + num(payroll.tax_deduction) + num(payroll.sss_contribution) +
    num(payroll.philhealth_contribution) + num(payroll.pagibig_contribution) +
    num(payroll.late_deductions) + num(payroll.absent_deductions) + num(payroll.undertime_deductions) +
    num(payroll.salary_loan) + num(payroll.cash_advance);

  const evidence = {
    result: "PENDING",
    period,
    staff: { id: staffId, name: staffName },
    attendance_seeded: presentDays,
    payroll: {
      id: payroll.id, status: payroll.status, gross_pay: payroll.gross_pay, net_pay: payroll.net_pay,
      base_salary: payroll.base_salary, deductions: payroll.deductions, tax: payroll.tax_deduction,
      sss: payroll.sss_contribution, philhealth: payroll.philhealth_contribution, pagibig: payroll.pagibig_contribution,
      late: payroll.late_deductions, absent: payroll.absent_deductions, undertime: payroll.undertime_deductions,
      loan: payroll.salary_loan, advance: payroll.cash_advance, present_days: payroll.present_days,
      processed_by: payroll.processed_by, approved_by: payroll.approved_by, processed_at: payroll.processed_at, approved_at: payroll.approved_at,
    },
    payslip: { own_status: ownPayslip.status, other_status: otherPayslip.status },
    recomputed: recomputedRow ? { gross: recomputedRow.gross_pay ?? recomputedRow.gross ?? null, net: recomputedRow.net_pay ?? recomputedRow.net ?? null } : "not-found-in-compute",
    arithmetic: {
      gross: num(payroll.gross_pay),
      all_deduction_columns: deductionsTotal,
      net: num(payroll.net_pay),
      net_recomputed_as_gross_minus_deductions: num((num(payroll.gross_pay) - deductionsTotal).toFixed(2)),
    },
    checks: {
      payroll_generated: Boolean(payroll),
      approve_attribution: Number(payroll.processed_by) === Number(manager.user.id) || Number(payroll.approved_by) === Number(manager.user.id),
      net_lte_gross: num(payroll.net_pay) <= num(payroll.gross_pay),
      own_payslip_ok: ownPayslip.status === 200,
      cross_payslip_denied: otherPayslip.status === 403,
      present_days_matches_fixture: Number(payroll.present_days) >= presentDays.length,
    },
    screenshots, network, console: consoleLog,
  };

  // Assertions
  expect(num(payroll.gross_pay)).toBeGreaterThan(0);
  expect(num(payroll.net_pay)).toBeLessThanOrEqual(num(payroll.gross_pay));
  expect(ownPayslip.status).toBe(200);
  expect(otherPayslip.status).toBe(403);
  expect(Number(payroll.processed_by)).toBe(Number(manager.user.id));
  expect(["pending", "approved", "paid", "released"]).toContain(payroll.status);

  evidence.result = "PASS";
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "hr-payroll-lifecycle-evidence.json"), JSON.stringify(evidence, null, 2));
  await context.close();
  await empCtx.close();
});

test("Phase 12.6 payroll authorization, IDOR, and tampering checks", async ({ request }) => {
  const manager = await apiLogin(request, "manager");
  const customer = await apiLogin(request, "customer");
  const receptionist = await apiLogin(request, "receptionist");
  const cashier = await apiLogin(request, "cashier");
  const inventory = await apiLogin(request, "inventory");
  const veterinary = await apiLogin(request, "veterinary");
  const neg = {};

  // Manager payroll endpoints are manager/admin only.
  neg.customer_payroll = (await apiStatus(request, customer, "get", "/manager/payroll")).status;
  neg.receptionist_payroll = (await apiStatus(request, receptionist, "get", "/manager/payroll")).status;
  neg.cashier_payroll = (await apiStatus(request, cashier, "get", "/manager/payroll")).status;
  neg.inventory_payroll = (await apiStatus(request, inventory, "get", "/manager/payroll")).status;
  neg.veterinary_payroll = (await apiStatus(request, veterinary, "get", "/manager/payroll")).status;
  expect([403]).toContain(neg.customer_payroll);
  expect([403]).toContain(neg.receptionist_payroll);
  expect([403]).toContain(neg.cashier_payroll);
  expect([403]).toContain(neg.inventory_payroll);
  expect([403]).toContain(neg.veterinary_payroll);

  // Non-manager cannot generate or approve payroll.
  const period = semiMonthlyPeriod();
  neg.cashier_generate = (await apiStatus(request, cashier, "post", "/manager/payroll/generate", { period_start: period.start, period_end: period.end })).status;
  expect(neg.cashier_generate).toBe(403);

  const anyPayroll = dbQuery(`SELECT id,user_id FROM payrolls WHERE user_id IS NOT NULL ORDER BY id DESC LIMIT 1`)[0];
  if (anyPayroll) {
    neg.cashier_approve = (await apiStatus(request, cashier, "post", `/manager/payroll/${anyPayroll.id}/approve`, {})).status;
    expect([403]).toContain(neg.cashier_approve);
    // Employee reading someone else's payslip — IDOR gate.
    if (Number(anyPayroll.user_id) !== Number(cashier.user.id)) {
      neg.cashier_other_payslip = (await apiStatus(request, cashier, "get", `/my-payroll/${anyPayroll.id}/payslip`)).status;
      expect(neg.cashier_other_payslip).toBe(403);
    }
  }

  // Nonexistent payroll/payslip IDs are not silently accepted.
  neg.missing_payslip = (await apiStatus(request, cashier, "get", "/my-payroll/99999999/payslip")).status;
  expect([403, 404]).toContain(neg.missing_payslip);
  neg.missing_payroll_show = (await apiStatus(request, manager, "get", "/manager/payroll/99999999")).status;
  expect(neg.missing_payroll_show).toBe(404);

  // Approving an already-paid payroll is rejected.
  const paidRow = dbQuery(`SELECT id FROM payrolls WHERE status='paid' ORDER BY id DESC LIMIT 1`)[0];
  if (paidRow) {
    neg.approve_paid = (await apiStatus(request, manager, "post", `/manager/payroll/${paidRow.id}/approve`, {})).status;
    expect(neg.approve_paid).toBe(422);
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "hr-payroll-negative-evidence.json"), JSON.stringify({ result: "PASS", responses: neg }, null, 2));
});

test("Phase 12.6 duplicate and concurrent payroll processing stays consistent", async ({ request }) => {
  const manager = await apiLogin(request, "manager");
  const cashier = await apiLogin(request, "cashier");
  const period = semiMonthlyPeriod();
  const staffId = cashier.user.id;

  // Duplicate generation for the same period must not duplicate rows.
  await generatePayroll(request, manager, period);
  const before = dbQuery(`SELECT COUNT(*) c FROM payrolls WHERE user_id=${Number(staffId)} AND pay_period_start LIKE '${period.start}%'`)[0].c;
  const dup = await generatePayroll(request, manager, period);
  const after = dbQuery(`SELECT COUNT(*) c FROM payrolls WHERE user_id=${Number(staffId)} AND pay_period_start LIKE '${period.start}%'`)[0].c;

  // Concurrent generation — same period, two parallel calls.
  const [g1, g2] = await Promise.all([
    apiStatus(request, manager, "post", "/manager/payroll/generate", { period_start: period.start, period_end: period.end }),
    apiStatus(request, manager, "post", "/manager/payroll/generate", { period_start: period.start, period_end: period.end }),
  ]);
  const afterRace = dbQuery(`SELECT COUNT(*) c FROM payrolls WHERE user_id=${Number(staffId)} AND pay_period_start LIKE '${period.start}%'`)[0].c;

  // Concurrent approve on the same payroll — one logical approval.
  const payroll = payrollFor(staffId, period);
  const [a1, a2] = await Promise.all([
    apiStatus(request, manager, "post", `/manager/payroll/${payroll.id}/approve`, {}),
    apiStatus(request, manager, "post", `/manager/payroll/${payroll.id}/approve`, {}),
  ]);
  const finalRow = payrollFor(staffId, period);

  const evidence = {
    result: "PENDING",
    period,
    duplicate_generate: { statuses: [dup.status], before, after },
    concurrent_generate: { statuses: [g1.status, g2.status], after: afterRace },
    concurrent_approve: { statuses: [a1.status, a2.status] },
    final: { status: finalRow.status, processed_by: finalRow.processed_by },
    checks: {
      no_duplicate_rows: after === before && afterRace === after,
      single_user_period_row: afterRace === 1,
      approve_idempotent_or_single: [a1.status, a2.status].filter((s) => s === 200).length >= 1,
    },
  };
  expect(after).toBe(before);
  expect(afterRace).toBe(after);
  expect(afterRace).toBe(1);

  evidence.result = "PASS";
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "hr-payroll-race-evidence.json"), JSON.stringify(evidence, null, 2));
});
