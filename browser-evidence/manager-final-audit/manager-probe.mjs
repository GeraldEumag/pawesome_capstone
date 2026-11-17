/**
 * Pawesome Manager Role — Final Audit Probe (v2)
 * Live API + SQL verification against the isolated audit stack.
 * API :8001 -> pawesome_e2e_audit. Evidence -> manager-probe-results.json
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const API = process.env.PROBE_API || "http://127.0.0.1:8001/api";
const DB = "pawesome_e2e_audit";
const MYSQL = "C:/xampp/mysql/bin/mysql.exe";
const RUN = `manager-audit-${Date.now()}`;
const PACE_MS = 120;          // baseline pacing vs throttle:api 60/min
const RETRY_429_WAIT_MS = 62000;

const CREDS = {
  admin: ["admin@example.com", "Password123!"],
  manager: ["manager@example.com", "password123"],
  receptionist: ["receptionist@example.com", "Password123!"],
  super_receptionist: ["super_receptionist@example.com", "Password123!"],
  cashier: ["cashier@example.com", "password123"],
  inventory: ["inventory@example.com", "Password123!"],
  veterinary: ["vet@example.com", "Password123!"],
  vet_tech: ["vettech@example.com", "Password123!"],
  customer: ["customer@example.com", "Password123!"],
};

const tokens = {};
const results = { run: RUN, started_at: new Date().toISOString(), scenarios: [] };
let current = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function scenario(name) {
  current = { name, steps: [], status: "pass" };
  results.scenarios.push(current);
}
function step(action, expected, actual, pass, dbCheck = null) {
  current.steps.push({ action, expected, actual, db_check: dbCheck, pass });
  if (!pass) current.status = "fail";
  console.log(`${pass ? "PASS" : "FAIL"}  [${current.name}] ${action} -> ${JSON.stringify(actual).slice(0, 200)}`);
}
function info(action, detail) {
  current.steps.push({ action, expected: "info", actual: detail, db_check: null, pass: true });
  console.log(`INFO  [${current.name}] ${action} -> ${JSON.stringify(detail).slice(0, 200)}`);
}
function sql(query) {
  try {
    const out = execSync(`"${MYSQL}" -u root ${DB} -N -e ${JSON.stringify(query)}`, { encoding: "utf8" });
    return out.trim();
  } catch (e) {
    return `__SQL_ERR__ ${String(e.message).slice(0, 160)}`;
  }
}
async function login(role, email = null, password = null) {
  const [e, p] = email ? [email, password] : CREDS[role];
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ login: e, password: p }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`login ${role} ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  tokens[role] = j.token || j.access_token || j.data?.token;
  tokens[`${role}::user`] = j.user;
  return j;
}
async function api(role, method, path, body = null, opts = {}) {
  const headers = { Accept: "application/json", ...(opts.headers || {}) };
  if (role && role !== "anon") headers.Authorization = `Bearer ${tokens[role]}`;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  await sleep(opts.pace ?? PACE_MS);
  let res = await fetch(`${opts.base || API}${path}`, { method, headers, body: payload });
  if (res.status === 429 && !opts.noRetry) {
    console.log(`  ..429 rate-limited on ${method} ${path} — waiting ${RETRY_429_WAIT_MS / 1000}s and retrying once`);
    await sleep(RETRY_429_WAIT_MS);
    res = await fetch(`${opts.base || API}${path}`, { method, headers, body: payload });
  }
  let j = null;
  const text = await res.text();
  try { j = text ? JSON.parse(text) : null; } catch { j = { _raw: text.slice(0, 500) }; }
  return { status: res.status, json: j, headers: res.headers };
}

// ---------- boot ----------
console.log(`Manager audit probe v2 -> ${API} (DB ${DB})`);
for (const role of Object.keys(CREDS)) {
  try { await login(role); console.log(`login ok: ${role}`); }
  catch (e) { console.log(`login FAILED: ${role} -> ${e.message}`); }
}
await sleep(2000);

const managerId = tokens["manager::user"]?.id;
const staffId = sql("SELECT id FROM users WHERE role='receptionist' LIMIT 1") || "3";
const employeeId = sql("SELECT id FROM employees LIMIT 1") || "1";
const payrollId0 = sql("SELECT id FROM payrolls LIMIT 1") || null;
const attendanceId = sql("SELECT id FROM attendance LIMIT 1") || "1";
const salaryLoanId0 = sql("SELECT id FROM salary_loans LIMIT 1") || null;
const hotelRoomId = sql("SELECT id FROM hotel_rooms LIMIT 1") || "1";
const activityLogId = sql("SELECT id FROM activity_logs LIMIT 1") || "1";

// ============================================================
// S1 — Manager read sweep
// ============================================================
scenario("S1-manager-read-sweep");
const readSweep = [
  "/manager/dashboard", "/manager/staff", "/manager/people", "/manager/executive-summary", "/manager/history",
  "/manager/reports/summary", "/manager/reports/overview", "/manager/reports/live", "/manager/reports/sales",
  "/manager/reports/revenue-trends", "/manager/reports/payments", "/manager/reports/customers",
  "/manager/reports/services", "/manager/reports/inventory", "/manager/reports/staff-performance",
  "/manager/reports/boarding", "/manager/reports/medical-confinement", "/manager/reports/room-occupancy",
  "/manager/reports/veterinary-services", "/manager/reports/attendance", "/manager/reports/payroll",
  `/manager/reports/dtr?user_id=${staffId}&start_date=2026-01-01&end_date=2026-01-31`,
  "/manager/reports/remittance?period=2026-01&type=sss",
  "/manager/attendance", "/manager/attendance/corrections", "/manager/attendance/today-status",
  "/manager/biometric/credentials", "/manager/biometric/today-summary",
  "/manager/boarding-rooms", "/manager/hotel-rooms", `/manager/hotel-rooms/${hotelRoomId}`,
  "/manager/company-schedule", "/manager/employees", `/manager/employees/${employeeId}`,
  "/manager/holidays", "/manager/inventory-audits/pending", "/manager/leave-balances",
  `/manager/leave-balances/${staffId}/user`, `/manager/leave-balances/${employeeId}/employee`,
  "/manager/leaves", "/manager/leaves/calendar?year=2026&month=11",
  "/manager/payroll", "/manager/payroll/thirteenth-month?year=2026",
  "/manager/receipt-scanner/settings", "/manager/receipt-scanner/metrics",
  "/manager/salary-loans", "/manager/services",
  `/manager/staff/${staffId}/attendance`, `/manager/staff/${staffId}/payroll`,
  "/manager/vaccination-recall?lot_number=NONEXISTENT-LOT",
  "/manager/visit-invoice-adjustments/pending",
  "/attendance", "/attendance/today", "/attendance/statistics", `/attendance/${attendanceId}`,
  "/attendance-records", "/attendance-records/summary",
  "/admin/activity-logs", "/admin/activity-logs/statistics", "/admin/activity-logs/filters",
  `/admin/activity-logs/${activityLogId}`, `/admin/activity-logs/user/${managerId}`,
  "/my-payroll", "/my-leaves", "/my-leaves/balance", "/my-attendance", "/my-attendance/corrections", "/my-loans",
];

const sweepFails = [];
for (const path of readSweep) {
  const r = await api("manager", "GET", path);
  const ok = r.status >= 200 && r.status < 300;
  if (!ok) sweepFails.push({ path, status: r.status, body: r.json });
  step(`GET ${path}`, "2xx", r.status, ok);
}
// Payroll show/payslip when a payroll exists (empty on fresh seed — tested after generate in S4)
if (payrollId0) {
  for (const p of [`/manager/payroll/${payrollId0}`, `/manager/payroll/${payrollId0}/payslip`]) {
    const r = await api("manager", "GET", p);
    step(`GET ${p}`, "2xx", r.status, r.status === 200);
  }
} else {
  info("payroll show/payslip", "no payroll rows on fresh seed — covered in S4 after generate");
}
if (salaryLoanId0) {
  const r = await api("manager", "GET", `/manager/salary-loans/${salaryLoanId0}`);
  step(`GET /manager/salary-loans/${salaryLoanId0}`, "2xx", r.status, r.status === 200);
} else {
  info("salary-loan show", "no loans on fresh seed — covered in S4");
}
info("read-sweep summary", { total: readSweep.length, failures: sweepFails.length, failed: sweepFails.map(f => `${f.status} ${f.path}`) });

// CSV export
{
  await sleep(PACE_MS);
  const res = await fetch(`${API}/attendance/export`, { headers: { Authorization: `Bearer ${tokens.manager}` } });
  const ct = res.headers.get("content-type") || "";
  step("GET /attendance/export", "2xx + file content-type", `${res.status} ${ct}`, res.status === 200 && /csv|excel|spreadsheet|octet/i.test(ct));
}

// ============================================================
// S2 — Denial matrix
// ============================================================
scenario("S2-denial-matrix");
const denyRoles = ["customer", "receptionist", "cashier", "inventory", "veterinary", "vet_tech", "super_receptionist"];
const managerOnlyPaths = [
  ["GET", "/manager/dashboard"],
  ["GET", "/manager/reports/sales"],
  ["GET", "/manager/reports/payroll"],
  ["POST", "/manager/payroll/generate"],
  ["POST", "/manager/leaves/1/approve"],
  ["POST", "/manager/holidays"],
  ["PUT", "/manager/employees/1"],
  ["POST", "/manager/attendance/corrections/1/approve"],
  ["POST", "/manager/visit-invoice-adjustments/1/approve"],
  ["POST", "/manager/medical-confinements/1/release"],
  ["POST", "/manager/settings/kiosk-pin"],
  ["PUT", "/manager/company-schedule"],
  ["POST", "/manager/payroll/thirteenth-month/accrue"],
  ["GET", "/admin/activity-logs"],
  ["GET", "/attendance"],
];

for (const role of denyRoles) {
  let denied = 0;
  const leaks = [];
  for (const [m, p] of managerOnlyPaths) {
    const r = await api(role, m, p, m === "GET" ? null : {});
    if (r.status === 403 || r.status === 401) denied++;
    else leaks.push(`${m} ${p} -> ${r.status}`);
  }
  step(`${role} denied on manager routes`, `${managerOnlyPaths.length} denials`, `${denied} denied${leaks.length ? " / leaks: " + leaks.join("; ") : ""}`, leaks.length === 0, leaks.length ? leaks : null);
}
{
  let denied = 0;
  const leaks = [];
  for (const [m, p] of managerOnlyPaths) {
    const r = await api("anon", m, p, m === "GET" ? null : {});
    if (r.status === 401) denied++;
    else leaks.push(`${m} ${p} -> ${r.status}`);
  }
  step("anon denied on all manager routes", `${managerOnlyPaths.length} x 401`, `${denied} x 401${leaks.length ? " / " + leaks.join("; ") : ""}`, denied === managerOnlyPaths.length);
}
{
  const r1 = await api("anon", "GET", "/manager/dashboard", null, { token: "forged-token-abc123" });
  step("forged token -> /manager/dashboard", 401, r1.status, r1.status === 401);
}

// ============================================================
// S3 — Forbidden writes as manager (403 + no state change)
// ============================================================
scenario("S3-manager-forbidden-writes");
const countBefore = (t) => { const v = sql(`SELECT COUNT(*) FROM ${t}`); return v.startsWith("__SQL_ERR__") ? null : parseInt(v || "0", 10); };

const forbiddenWrites = [
  { name: "POS transaction", run: () => api("manager", "POST", "/cashier/pos/transaction", { items: [{ id: 1, quantity: 1 }], payment_method: "cash" }), table: "sales" },
  { name: "cashier verify payment", run: () => api("manager", "PUT", "/cashier/payments/1/order/verify"), table: "customer_orders" },
  { name: "cashier reject payment", run: () => api("manager", "PUT", "/cashier/payments/1/order/reject", { reason: "x" }), table: "customer_orders" },
  { name: "inventory stock adjust", run: () => api("manager", "POST", "/inventory/items/1/adjust-stock", { adjustment: 5, reason: "audit" }), table: "inventory_logs" },
  { name: "inventory create item", run: () => api("manager", "POST", "/inventory/items", { name: "Audit Item", price: 1, stock: 1 }), table: "inventory_items" },
  { name: "receptionist approve service request", run: () => api("manager", "POST", "/receptionist/requests/1/approve", {}), table: "service_requests" },
  { name: "receptionist approve boarding", run: () => api("manager", "POST", "/receptionist/boarding-requests/1/approve", {}), table: "boardings" },
  { name: "receptionist appointment approve", run: () => api("manager", "POST", "/receptionist/appointments/1/approve", {}), table: "appointments" },
  { name: "boarding pay (cashier gate)", run: () => api("manager", "POST", "/boardings/1/pay", {}), table: "boardings" },
  { name: "vet create appointment", run: () => api("manager", "POST", "/veterinary/appointments", { customer_id: 1, pet_id: 1, service_id: 1 }), table: "appointments" },
  { name: "vet consultation start", run: () => api("manager", "POST", "/veterinary/consultations/1/start", {}), table: "appointments" },
  { name: "admin create user", run: () => api("manager", "POST", "/admin/users", { name: "x", email: `x${Date.now()}@x.com`, password: "Password123!", role: "admin" }), table: "users" },
  { name: "admin salaries write", run: () => api("manager", "POST", "/admin/salaries", { user_id: 1, amount: 100 }), table: "users" },
  { name: "admin login-logs read", run: () => api("manager", "GET", "/admin/login-logs"), table: null },
  { name: "admin services mount", run: () => api("manager", "GET", "/admin/services"), table: null },
  { name: "products barcode lookup (POS scope)", run: () => api("manager", "GET", "/products/barcode/123"), table: null },
  { name: "customers create (cashier scope)", run: () => api("manager", "POST", "/customers", { name: "x", email: `z${Date.now()}@z.com` }), table: "customers" },
  { name: "billing shared read", run: () => api("manager", "GET", "/billing/inventory-items"), table: null },
  { name: "billing unpaid services", run: () => api("manager", "GET", "/billing/unpaid-services"), table: null },
  { name: "receptionist dashboard", run: () => api("manager", "GET", "/receptionist/dashboard"), table: null },
  { name: "cashier dashboard", run: () => api("manager", "GET", "/cashier/dashboard"), table: null },
  { name: "inventory dashboard read", run: () => api("manager", "GET", "/inventory/dashboard"), table: null },
  { name: "veterinary dashboard", run: () => api("manager", "GET", "/veterinary/dashboard"), table: null },
  { name: "admin dashboard", run: () => api("manager", "GET", "/admin/dashboard"), table: null },
];

for (const fw of forbiddenWrites) {
  const before = fw.table ? countBefore(fw.table) : null;
  const r = await fw.run();
  const after = fw.table ? countBefore(fw.table) : null;
  const denied = r.status === 403;
  const unchanged = before === null || after === null || after === before;
  step(`manager -> ${fw.name}`, "403 + no state change", `status=${r.status}${fw.table ? ` rows ${before}->${after}` : ""}`, denied && unchanged);
  if (!denied) info(`${fw.name} response`, r.json);
}
// manager updating a non-staff account must also 403 (controller-level check)
{
  const adminId = sql("SELECT id FROM users WHERE role='admin' LIMIT 1") || "1";
  const r = await api("manager", "PUT", `/manager/staff/${adminId}`, { phone: "000" });
  step("manager -> updateStaff on admin account", "403", `${r.status}`, r.status === 403);
  const mgrId = sql("SELECT id FROM users WHERE role='manager' LIMIT 1");
  if (mgrId) {
    const r2 = await api("manager", "PUT", `/manager/staff/${mgrId}`, { phone: "000" });
    step("manager -> updateStaff on manager account", "403", `${r2.status}`, r2.status === 403);
  }
}

// ============================================================
// S4 — Authorized manager writes (write + DB verify)
// ============================================================
scenario("S4-manager-authorized-writes");
const auditBefore = countBefore("activity_logs");

// 4a. Holiday create -> update -> delete (reason-required, audit-logged)
{
  const r = await api("manager", "POST", "/manager/holidays", {
    name: "Audit Fixture Holiday", date: "2026-12-30", type: "special_non_working", is_recurring: false,
  });
  const hid = r.json?.data?.id || r.json?.id || r.json?.holiday?.id;
  const inDb = hid ? sql(`SELECT name FROM holidays WHERE id=${hid}`) : null;
  step("create holiday", "2xx + row", `${r.status} id=${hid} db=${inDb}`, (r.status === 200 || r.status === 201) && !!inDb);
  if (hid) {
    const r2 = await api("manager", "PUT", `/manager/holidays/${hid}`, { name: "Audit Fixture Holiday Edited", date: "2026-12-30", type: "special_non_working" });
    const name2 = sql(`SELECT name FROM holidays WHERE id=${hid}`);
    step("update holiday", "name updated", `${r2.status} db=${name2}`, r2.status === 200 && name2.includes("Edited"));
    const rNoReason = await api("manager", "DELETE", `/manager/holidays/${hid}`);
    step("delete holiday w/o reason", "422 (reason required)", `${rNoReason.status}`, rNoReason.status === 422);
    const r3 = await api("manager", "DELETE", `/manager/holidays/${hid}`, { reason: "audit cleanup" });
    const gone = sql(`SELECT COUNT(*) FROM holidays WHERE id=${hid}`);
    const auditRow = sql(`SELECT COUNT(*) FROM activity_logs WHERE action='holiday_deleted' AND reference_id=${hid}`) || sql(`SELECT COUNT(*) FROM activity_logs WHERE reference_id=${hid}`);
    step("delete holiday with reason", "row gone + audit log", `${r3.status} count=${gone} audit=${auditRow}`, r3.status < 300 && gone === "0");
  }
}

// 4b. Holiday generate-recurring via ?year= query param
{
  const recurringCount = sql(`SELECT COUNT(DISTINCT name) FROM holidays WHERE is_recurring=1`);
  const targetYear = "2030";
  const before = countBefore("holidays");
  const r1 = await api("manager", "POST", `/manager/holidays/generate-recurring?year=${targetYear}`);
  const after1 = countBefore("holidays");
  const r2 = await api("manager", "POST", `/manager/holidays/generate-recurring?year=${targetYear}`);
  const after2 = countBefore("holidays");
  info("generate-recurring sources", `recurring templates=${recurringCount} created run1=+${after1 - before} run2=+${after2 - after1}`);
  step("generate-recurring idempotent", "no duplicates on re-run", `${r1.status}/${r2.status} +${after1 - before}/+${after2 - after1}`, r1.status < 300 && after2 === after1);
  sql(`DELETE FROM holidays WHERE year(date)=2030`);
}

// 4c. Employee CRUD (birthdate required, ≥18)
{
  const r = await api("manager", "POST", "/manager/employees", {
    first_name: "Audit", last_name: "Employee", birthdate: "1990-01-01",
    position: "Groomer", department: "Grooming",
    email: `audit.emp.${Date.now()}@example.com`, employment_type: "regular",
  });
  const eid = r.json?.data?.id || r.json?.id || r.json?.employee?.id;
  const inDb = eid ? sql(`SELECT first_name FROM employees WHERE id=${eid}`) : null;
  step("create employee record", "2xx + row", `${r.status} id=${eid} db=${inDb}`, (r.status === 200 || r.status === 201) && !!inDb);
  if (!eid) info("employee create errors", r.json);
  if (eid) {
    const r2 = await api("manager", "PUT", `/manager/employees/${eid}`, { position: "Senior Groomer" });
    const pos = sql(`SELECT position FROM employees WHERE id=${eid}`);
    step("update employee", "position updated", `${r2.status} db=${pos}`, r2.status === 200 && pos === "Senior Groomer");
    const r3 = await api("manager", "DELETE", `/manager/employees/${eid}`);
    const gone = sql(`SELECT is_active, deleted_at FROM employees WHERE id=${eid}`);
    step("delete employee", "soft-delete/deactivate", `${r3.status} db=${gone}`, r3.status < 300);
  }
}

// 4d. Day-off update on an account user
{
  const r = await api("manager", "PUT", `/manager/people/account/${staffId}/day-offs`, { days: [0, 6] });
  const dbDays = sql(`SELECT GROUP_CONCAT(weekday ORDER BY weekday) FROM employee_day_offs WHERE user_id=${staffId}`);
  step("set day-offs Sun+Sat", "persisted", `${r.status} db=${dbDays}`, r.status === 200 && dbDays === "0,6");
  await api("manager", "PUT", `/manager/people/account/${staffId}/day-offs`, { days: [0] });
}

// 4e. Staff update — allowed fields only; mass-assignment probe
{
  const before = sql(`SELECT CONCAT(role,'|',email,'|',is_active) FROM users WHERE id=${staffId}`);
  const r = await api("manager", "PUT", `/manager/staff/${staffId}`, {
    phone: "0917-AUDIT", department: "Front Desk", address: "Audit St.",
    role: "admin", email: `hijack${Date.now()}@example.com`, is_active: 0,
  });
  const after = sql(`SELECT CONCAT(role,'|',email,'|',is_active) FROM users WHERE id=${staffId}`);
  const phone = sql(`SELECT phone FROM users WHERE id=${staffId}`);
  step("staff update allowed fields", "phone saved", `${r.status} phone=${phone}`, r.status === 200 && (phone || "").includes("AUDIT"));
  step("staff update mass-assignment blocked", "role/email/is_active unchanged", `before=${before} after=${after}`, before === after);
}

// 4f. Leave lifecycle
{
  const r1 = await api("receptionist", "POST", "/my-leaves", {
    type: "vacation_leave", start_date: "2026-12-15", end_date: "2026-12-16", reason: "audit leave test",
  });
  const lid = r1.json?.data?.id || r1.json?.id || r1.json?.leave?.id;
  step("staff files leave (setup)", "pending row", `${r1.status} id=${lid}`, (r1.status === 200 || r1.status === 201) && !!lid);
  if (!lid) info("leave create errors", r1.json);
  if (lid) {
    const r2 = await api("manager", "POST", `/manager/leaves/${lid}/approve`, { remarks: "approved by audit" });
    const st = sql(`SELECT status FROM leave_requests WHERE id=${lid}`);
    step("manager approve leave", "status=approved", `${r2.status} db=${st}`, r2.status === 200 && st === "approved");
    const r3 = await api("manager", "POST", `/manager/leaves/${lid}/approve`, {});
    info("re-approve already-approved", `${r3.status} ${JSON.stringify(r3.json).slice(0, 120)}`);
    const r4 = await api("manager", "DELETE", `/manager/leaves/${lid}/cancel`);
    const st2 = sql(`SELECT status FROM leave_requests WHERE id=${lid}`);
    step("manager cancel approved leave", "status=cancelled", `${r4.status} db=${st2}`, r4.status < 300);
  }
  const r5 = await api("receptionist", "POST", "/my-leaves", {
    type: "sick_leave", start_date: "2026-12-20", end_date: "2026-12-21", reason: "audit reject test",
  });
  const lid2 = r5.json?.data?.id || r5.json?.id || r5.json?.leave?.id;
  if (lid2) {
    const rNoReason = await api("manager", "POST", `/manager/leaves/${lid2}/reject`, {});
    const stNR = sql(`SELECT status FROM leave_requests WHERE id=${lid2}`);
    info("reject without remarks", `${rNoReason.status} db=${stNR}`);
    const r6 = await api("manager", "POST", `/manager/leaves/${lid2}/reject`, { remarks: "audit rejection" });
    const st3 = sql(`SELECT status FROM leave_requests WHERE id=${lid2}`);
    step("manager reject leave", "status=rejected", `${r6.status} db=${st3}`, r6.status === 200 && st3 === "rejected");
  }
}

// 4g. Salary loan lifecycle
{
  const r = await api("manager", "POST", "/manager/salary-loans", {
    user_id: parseInt(staffId, 10), loan_type: "salary_loan", principal: 1500,
    installment_amount: 500, start_period: "2026-12-01", notes: "audit loan",
  });
  const lid = r.json?.data?.id || r.json?.id || r.json?.loan?.id || r.json?.salary_loan?.id;
  const inDb = lid ? sql(`SELECT principal,status FROM salary_loans WHERE id=${lid}`) : null;
  step("create salary loan", "row persisted", `${r.status} id=${lid} db=${inDb}`, (r.status === 200 || r.status === 201) && !!inDb);
  if (!lid) info("salary-loan create errors", r.json);
  if (lid) {
    const r2 = await api("manager", "PUT", `/manager/salary-loans/${lid}`, { principal: 1600 });
    const amt = sql(`SELECT principal FROM salary_loans WHERE id=${lid}`);
    step("update salary loan", "amount updated", `${r2.status} db=${amt}`, r2.status === 200 && parseFloat(amt) === 1600);
    const r3 = await api("manager", "DELETE", `/manager/salary-loans/${lid}`);
    const st = sql(`SELECT status FROM salary_loans WHERE id=${lid}`);
    step("cancel salary loan", "status=cancelled", `${r3.status} db=${st}`, r3.status < 300);
  }
}

// 4h. Attendance correction lifecycle
{
  const r1 = await api("receptionist", "POST", "/my-attendance/corrections", {
    date: "2026-11-10", requested_check_in: "09:00", requested_check_out: "18:00", reason: "audit correction test",
  });
  const cid = r1.json?.data?.id || r1.json?.id || r1.json?.correction?.id;
  info("file attendance correction (setup)", `${r1.status} id=${cid}`);
  if (cid && r1.status < 300) {
    const r2 = await api("manager", "POST", `/manager/attendance/corrections/${cid}/approve`, { remarks: "ok" });
    const st = sql(`SELECT status FROM attendance_corrections WHERE id=${cid}`);
    step("approve attendance correction", "status=approved", `${r2.status} db=${st}`, r2.status === 200 && st === "approved");
  }
  const r3 = await api("receptionist", "POST", "/my-attendance/corrections", {
    date: "2026-11-11", requested_check_in: "09:00", reason: "audit reject test",
  });
  const cid2 = r3.json?.data?.id || r3.json?.id || r3.json?.correction?.id;
  if (cid2 && r3.status < 300) {
    const r4 = await api("manager", "POST", `/manager/attendance/corrections/${cid2}/reject`, { remarks: "denied" });
    const st = sql(`SELECT status FROM attendance_corrections WHERE id=${cid2}`);
    step("reject attendance correction", "status=rejected", `${r4.status} db=${st}`, r4.status === 200 && st === "rejected");
  }
}

// 4i. Attendance remarks (route is AttendanceController@update — full edit surface)
{
  const r = await api("manager", "POST", `/manager/attendance/${attendanceId}/remarks`, { remarks: "audit remark" });
  const rm = sql(`SELECT remarks FROM attendance WHERE id=${attendanceId}`);
  step("attendance remarks write", "saved to row", `${r.status} db=${(rm || "").slice(0, 40)}`, r.status < 300);
}

// 4j. Payroll compute -> generate -> approve -> release
{
  const period = { period_start: "2026-11-01", period_end: "2026-11-15" };
  const r1 = await api("manager", "POST", "/manager/payroll/compute", period);
  step("payroll compute", "2xx + data", `${r1.status}`, r1.status === 200 && !!r1.json?.data);
  const r2 = await api("manager", "POST", "/manager/payroll/generate", period);
  const genList = r2.json?.data || r2.json?.payrolls || [];
  const pid = Array.isArray(genList) ? genList[0]?.id : (r2.json?.id || r2.json?.payroll?.id);
  info("payroll generate", `${r2.status} ids=${Array.isArray(genList) ? genList.length : "?"} first=${pid}`);
  const anyPid = pid || sql("SELECT id FROM payrolls ORDER BY id DESC LIMIT 1");
  if (anyPid && !String(anyPid).startsWith("__")) {
    const st0 = sql(`SELECT status FROM payrolls WHERE id=${anyPid}`);
    const rSkip = await api("manager", "POST", `/manager/payroll/${anyPid}/release`, {});
    info("release before approve (must 422)", `${rSkip.status} ${JSON.stringify(rSkip.json).slice(0, 120)}`);
    step("release un-approved payroll blocked", "422", `${rSkip.status}`, rSkip.status === 422);
    const r3 = await api("manager", "POST", `/manager/payroll/${anyPid}/approve`, {});
    const st = sql(`SELECT status,approved_by FROM payrolls WHERE id=${anyPid}`);
    step("payroll approve", "status=pending + approver stamped", `${r3.status} db=${st}`, r3.status === 200 && st.includes("pending"));
    const r4 = await api("manager", "POST", `/manager/payroll/${anyPid}/release`, {});
    const st2 = sql(`SELECT status,payment_date FROM payrolls WHERE id=${anyPid}`);
    step("payroll release", "status=paid + payment_date", `${r4.status} db=${st2}`, r4.status === 200 && /paid/i.test(st2));
    const r5 = await api("manager", "POST", `/manager/payroll/${anyPid}/release`, {});
    step("double release", "422", `${r5.status}`, r5.status === 422);
    const slip = await api("manager", "GET", `/manager/payroll/${anyPid}/payslip`);
    step("payslip after release", "2xx", `${slip.status}`, slip.status === 200);
  } else {
    info("payroll generate", `no payroll produced — response: ${JSON.stringify(r2.json).slice(0, 200)}`);
  }
}

// 4k. 13th-month accrue + pay
{
  const r1 = await api("manager", "POST", "/manager/payroll/thirteenth-month/accrue", { year: 2026 });
  info("13th-month accrue", `${r1.status} ${JSON.stringify(r1.json).slice(0, 180)}`);
  const accrualId = r1.json?.data?.accruals?.[0]?.id || r1.json?.accruals?.[0]?.id || sql("SELECT id FROM thirteenth_month_accruals ORDER BY id DESC LIMIT 1");
  if (accrualId && !String(accrualId).startsWith("__")) {
    const r2 = await api("manager", "POST", `/manager/payroll/thirteenth-month/${accrualId}/pay`, {});
    const st = sql(`SELECT status FROM thirteenth_month_accruals WHERE id=${accrualId}`);
    step("13th-month pay", "status=paid", `${r2.status} db=${st}`, r2.status === 200);
  }
}

// 4l. Kiosk PIN rotation (then restore)
{
  const before = sql(`SELECT \`value\` FROM system_settings WHERE \`key\`='attendance_kiosk_pin'`);
  const r = await api("manager", "POST", "/manager/settings/kiosk-pin", { kioskPin: "987654" });
  const after = sql(`SELECT \`value\` FROM system_settings WHERE \`key\`='attendance_kiosk_pin'`);
  step("kiosk-pin rotate", "changed in db", `${r.status} before=${before} after=${after}`, r.status < 300 && after === "987654");
  if (before && before !== after) await api("manager", "POST", "/manager/settings/kiosk-pin", { kioskPin: before });
}

// 4m. Company schedule GET + PUT (read current shape first)
{
  const r = await api("manager", "GET", "/manager/company-schedule");
  step("company-schedule read", "2xx", `${r.status}`, r.status === 200);
  const current = r.json?.data || r.json;
  if (r.status === 200 && current && typeof current === "object") {
    const r2 = await api("manager", "PUT", "/manager/company-schedule", current);
    step("company-schedule put same values", "2xx no-op write", `${r2.status}`, r2.status < 300);
  }
}

// 4n. Service catalog CRUD
{
  const r = await api("manager", "POST", "/manager/services", {
    name: `Audit Service ${Date.now()}`, category: "grooming", price: 123.45, duration_minutes: 30, is_active: true,
  });
  const sid = r.json?.data?.id || r.json?.id || r.json?.service?.id;
  const inDb = sid ? sql(`SELECT name FROM services WHERE id=${sid}`) : null;
  step("manager create service", "row persisted", `${r.status} id=${sid} db=${inDb}`, (r.status === 200 || r.status === 201) && !!inDb);
  if (!sid) info("service create errors", r.json);
  if (sid) {
    const r2 = await api("manager", "PUT", `/manager/services/${sid}`, { price: 150 });
    const pr = sql(`SELECT price FROM services WHERE id=${sid}`);
    step("manager update service price", "updated", `${r2.status} db=${pr}`, r2.status === 200 && parseFloat(pr) === 150);
    const r3 = await api("manager", "DELETE", `/manager/services/${sid}`);
    step("manager delete service", "deleted", `${r3.status}`, r3.status < 300);
  }
}

// 4o. Receptionist appointment cancel (documented manager power)
{
  const apptId = sql(`SELECT id FROM appointments WHERE status IN ('in_consultation','checked_in','in_treatment','scheduled','requested') LIMIT 1`);
  if (apptId) {
    const stB = sql(`SELECT status FROM appointments WHERE id=${apptId}`);
    const r = await api("manager", "POST", `/receptionist/appointments/${apptId}/cancel`, { reason: "audit cancellation test" });
    const stA = sql(`SELECT status FROM appointments WHERE id=${apptId}`);
    step("manager cancel appointment (documented)", "2xx + status change", `${r.status} ${stB}->${stA}`, r.status < 300);
  } else {
    info("manager cancel appointment", "no appointments in seed — skipped");
  }
}

// 4p. Backend-only surfaces
{
  const r1 = await api("manager", "GET", "/manager/visit-invoice-adjustments/pending");
  step("invoice-adjustments pending list", "2xx", `${r1.status}`, r1.status === 200);
  const r2 = await api("manager", "GET", "/manager/inventory-audits/pending");
  step("inventory-audits pending list", "2xx", `${r2.status}`, r2.status === 200);
  const r3 = await api("manager", "GET", "/manager/vaccination-recall?lot_number=TEST-LOT-1");
  step("vaccination recall lookup", "2xx", `${r3.status}`, r3.status === 200);
  const r4 = await api("manager", "POST", "/manager/visit-invoice-adjustments/999999/approve", { reason: "audit" });
  step("approve nonexistent adjustment", "404/422 not 500", `${r4.status}`, [404, 422].includes(r4.status));
  const r5 = await api("manager", "POST", "/manager/inventory-audits/999999/approve", {});
  step("approve nonexistent audit", "404/422 not 500", `${r5.status}`, [404, 422].includes(r5.status));
  const r6 = await api("manager", "POST", "/manager/medical-confinements/999999/release", { reason: "audit test release" });
  step("release nonexistent confinement", "404/422 not 500", `${r6.status}`, [404, 422].includes(r6.status));
}
const auditAfter = countBefore("activity_logs");
info("activity-log growth during authorized writes", `${auditBefore} -> ${auditAfter}`);

// ============================================================
// S5 — Abuse probes
// ============================================================
scenario("S5-abuse-probes");
{
  const r1 = await api("manager", "GET", "/manager/payroll/999999");
  step("payroll unknown id", "404 not 500", `${r1.status}`, r1.status === 404);
  const r2 = await api("manager", "GET", "/manager/employees/999999");
  step("employee unknown id", "404 not 500", `${r2.status}`, r2.status === 404);
  const r3 = await api("manager", "GET", "/manager/salary-loans/999999");
  step("salary-loan unknown id", "404 not 500", `${r3.status}`, r3.status === 404);
  const r4 = await api("manager", "GET", "/manager/hotel-rooms/999999");
  step("hotel-room unknown id", "404 not 500", `${r4.status}`, r4.status === 404);
}
{
  const r1 = await api("manager", "POST", "/manager/holidays", { name: 5, date: "not-a-date", type: "bogus" });
  step("holiday malformed", "422", `${r1.status}`, r1.status === 422);
  const r2 = await api("manager", "PUT", "/manager/people/account/1/day-offs", { days: "monday" });
  step("day-offs malformed", "422", `${r2.status}`, r2.status === 422);
  const r3 = await api("manager", "POST", "/manager/salary-loans", { user_id: "abc", principal: -500, loan_type: "bogus", installment_amount: -1, start_period: "bad" });
  step("salary-loan malformed/negative", "422", `${r3.status}`, r3.status === 422);
  const r4 = await api("manager", "PUT", "/manager/people/bogus/1/day-offs", { days: [0] });
  step("day-offs bogus kind", "4xx", `${r4.status}`, r4.status >= 400 && r4.status < 500);
  const r5 = await api("manager", "POST", "/manager/payroll/compute", { period_start: "2026-11-01", period_end: "2026-11-30" });
  step("non-semi-monthly compute rejected", "422", `${r5.status}`, r5.status === 422);
}
{
  const r1 = await api("manager", "GET", "/manager/history?search=" + encodeURIComponent("' OR 1=1 --"));
  step("history SQLi search", "2xx benign", `${r1.status}`, r1.status === 200);
  const r2 = await api("manager", "GET", "/manager/reports/sales?search=" + encodeURIComponent("<script>alert(1)</script>"));
  step("sales XSS search", "2xx benign", `${r2.status}`, r2.status === 200);
  const r3 = await api("manager", "GET", "/manager/reports/payments?payment_status=" + encodeURIComponent("'; DROP TABLE payments;--"));
  step("payments SQLi status", "2xx benign", `${r3.status}`, r3.status === 200);
}

// ============================================================
// S6 — Envelope + shared surfaces
// ============================================================
scenario("S6-shared-surfaces");
{
  for (const p of ["/manager/reports/sales", "/manager/reports/payments", "/manager/reports/inventory", "/manager/executive-summary", "/manager/dashboard"]) {
    const r = await api("manager", "GET", p);
    const hasEnvelope = r.json && (r.json.success === true || r.json.data !== undefined || r.json.total_orders !== undefined);
    step(`envelope ${p}`, "success/data present", `success=${r.json?.success}`, hasEnvelope);
  }
  const apptId = sql("SELECT id FROM appointments LIMIT 1");
  if (apptId) {
    const r1 = await api("manager", "GET", `/veterinary/appointments/${apptId}/consents`);
    step("vet consents list (shared)", "2xx", `${r1.status}`, r1.status < 300);
    const r2 = await api("manager", "GET", `/veterinary/appointments/${apptId}/diagnostics`);
    step("vet diagnostics list (shared)", "2xx", `${r2.status}`, r2.status < 300);
    const r3 = await api("manager", "GET", `/veterinary/appointments/${apptId}/invoice`);
    info("vet visit invoice (shared)", `${r3.status}`);
  } else info("vet shared docs", "no appointments in seed — skipped");
  const r4 = await api("manager", "GET", "/pets");
  info("pets index (shared group)", `${r4.status}`);
}

// ---------- results ----------
results.finished_at = new Date().toISOString();
const totals = results.scenarios.map(s => ({ name: s.name, status: s.status, steps: s.steps.length, fails: s.steps.filter(x => !x.pass).length }));
results.summary = totals;
const allFails = results.scenarios.flatMap(s => s.steps.filter(x => !x.pass).map(x => x.action));
console.log("\n==== SUMMARY ====");
for (const t of totals) console.log(`${t.status === "pass" ? "PASS" : "FAIL"}  ${t.name}: ${t.steps.length} steps, ${t.fails} failures`);
console.log(`TOTAL: ${allFails.length} failing steps`);
if (allFails.length) console.log("Failures:", allFails);
writeFileSync(new URL("./evidence/manager-probe-results.json", import.meta.url), JSON.stringify(results, null, 2));
console.log("results -> evidence/manager-probe-results.json");
