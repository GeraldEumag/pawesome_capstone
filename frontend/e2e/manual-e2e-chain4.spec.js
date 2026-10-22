// Fourth edge-to-edge verification pass — Phase 4/7 residual flows:
//   D-08 leave self-file -> manager approve -> balance deduction
//        (prerequisite: seed leave_balances for the fixture user via the
//        app's own LeaveBalance::seedForPerson — the bulk /seed endpoint
//        exists but is intentionally not run; it would seed every staff
//        account in the dev DB)
//   attendance correction file -> manager APPROVE (complements the
//        reject path verified in chain3)
//   kiosk PIN unlock -> actual punch (clock-in) for the fixture employee
// All fixtures are scoped to e2e user 73 (e2e-manual-*@example.test).
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const auditDir = path.join(rootDir, "docs", "user-manual", "audit");
const resultsPath = path.join(auditDir, "runtime-verification-chain4.json");
const apiUrl = `${process.env.E2E_API_URL || "http://127.0.0.1:8000"}/api`;

const { apiLogin } = require("./test-utils");
const { execSync } = require("node:child_process");

const results = {};
function record(key, status, note) {
  results[key] = { status, note, at: new Date().toISOString() };
}
const authH = (t) => ({ Accept: "application/json", Authorization: `Bearer ${t}` });
const TEST_USER_ID = 73; // e2e fixture user
const FIXTURE_EMAIL = "e2e-manual-1792675127052@example.test";
const FIXTURE_PW = "E2eTemp!1234";
const FIXTURE_BARCODE = "PAW-0013"; // employee_no on fixture user 73

function tinker(expr) {
  return execSync(`php artisan tinker --execute="${expr}"`, {
    cwd: path.join(rootDir, "backend"),
    stdio: "pipe",
  }).toString().replace(/\x1b\[[0-9;]*m/g, "");
}

test.beforeAll(() => {
  fs.mkdirSync(auditDir, { recursive: true });
  // Provision the kiosk PIN file (same approach as chain3) and seed leave
  // balances for fixture user 73 only — firstOrCreate makes this idempotent.
  const pinFile = path.join(rootDir, ".kiosk-pin.tmp").replace(/\\/g, "/");
  try {
    tinker(`file_put_contents('${pinFile}', (string) \\App\\Models\\SystemSetting::get('attendance_kiosk_pin', env('KIOSK_PIN', '')))`);
  } catch {}
  try {
    tinker(`\\App\\Models\\LeaveBalance::seedForPerson(${TEST_USER_ID}, null, 2026)`);
  } catch {}
});
test.afterAll(() => {
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(resultsPath, "utf8")); } catch {}
  fs.writeFileSync(resultsPath, JSON.stringify({ ...existing, ...results }, null, 2));
  try { fs.unlinkSync(path.join(rootDir, ".kiosk-pin.tmp")); } catch {}
});

test("leave: seeded balance -> employee self-files -> manager approves -> balance deducted", async ({ request }) => {
  const staff = await request.post(`${apiUrl}/auth/login`, {
    data: { login: FIXTURE_EMAIL, password: FIXTURE_PW },
  });
  const staffTok = (await staff.json().catch(() => ({}))).token;
  expect(staffTok, "fixture staff login").toBeTruthy();
  const manager = await apiLogin(request, "manager");

  const balBefore = await request.get(`${apiUrl}/my-leaves/balance`, { headers: authH(staffTok) });
  const balBeforeBody = await balBefore.json().catch(() => ({}));
  const sickBefore = (balBeforeBody.data || balBeforeBody.balances || []).find((b) => b.leave_type === "sick_leave");
  expect(sickBefore, "seeded sick_leave balance must be visible to the employee").toBeTruthy();

  // Self-file (now possible once a balance row exists — D-08 root cause was
  // the missing balance, not a filing defect).
  const d1 = new Date(Date.now() + 34 * 86400000).toISOString().slice(0, 10);
  const d2 = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
  const file = await request.post(`${apiUrl}/my-leaves`, {
    headers: authH(staffTok),
    data: { type: "sick_leave", start_date: d1, end_date: d2, reason: "E2E manual audit self-file" },
  });
  const fileBody = await file.json().catch(() => ({}));
  expect(file.ok(), `self-file leave: ${JSON.stringify(fileBody)}`).toBeTruthy();
  const leaveId = fileBody.leave?.id || fileBody.data?.id || fileBody.id;
  expect(leaveId, "leave id").toBeTruthy();

  const appr = await request.post(`${apiUrl}/manager/leaves/${leaveId}/approve`, {
    headers: authH(manager.token), data: { remarks: "E2E manual audit approve" },
  });
  const apprBody = await appr.json().catch(() => ({}));
  expect(appr.ok(), `leave approve: ${JSON.stringify(apprBody)}`).toBeTruthy();

  const balAfter = await request.get(`${apiUrl}/my-leaves/balance`, { headers: authH(staffTok) });
  const balAfterBody = await balAfter.json().catch(() => ({}));
  const sickAfter = (balAfterBody.data || balAfterBody.balances || []).find((b) => b.leave_type === "sick_leave");
  const dropped = sickAfter && Number(sickAfter.remaining_days) < Number(sickBefore.remaining_days);
  record(
    "leave-self-file-approve",
    dropped ? "VERIFIED" : "TESTED",
    `Leave ${leaveId} self-filed + approved; sick_leave remaining ${sickBefore.remaining_days} -> ${sickAfter?.remaining_days}`
  );
  expect(dropped, "approved leave must deduct the balance").toBeTruthy();
});

test("attendance correction: employee files -> manager approves", async ({ request }) => {
  const staff = await request.post(`${apiUrl}/auth/login`, {
    data: { login: FIXTURE_EMAIL, password: FIXTURE_PW },
  });
  const staffTok = (await staff.json().catch(() => ({}))).token;
  expect(staffTok, "fixture staff login").toBeTruthy();
  const manager = await apiLogin(request, "manager");

  // Use a past date so this never collides with today's kiosk punch row.
  const pastDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const file = await request.post(`${apiUrl}/my-attendance/corrections`, {
    headers: authH(staffTok),
    data: { date: pastDate, requested_check_in: "08:00", reason: "E2E manual audit correction (approve path)" },
  });
  const fileBody = await file.json().catch(() => ({}));
  expect(file.ok(), `correction file: ${JSON.stringify(fileBody)}`).toBeTruthy();
  const corrId = fileBody.correction?.id || fileBody.data?.id || fileBody.id;
  expect(corrId, "correction id").toBeTruthy();

  const appr = await request.post(`${apiUrl}/manager/attendance/corrections/${corrId}/approve`, {
    headers: authH(manager.token), data: { remarks: "E2E manual audit approve" },
  });
  const apprBody = await appr.json().catch(() => ({}));
  record(
    "correction-approve",
    appr.ok() ? "VERIFIED" : "TESTED",
    `Correction ${corrId} filed -> approve HTTP ${appr.status()} ${JSON.stringify(apprBody).slice(0, 200)}`
  );
  expect(appr.ok(), "correction approve must succeed").toBeTruthy();
});

test("manager day-offs: set, clear-all, invalid + unauthorized (D-07)", async ({ request }) => {
  const manager = await apiLogin(request, "manager");
  const cashier = await apiLogin(request, "cashier");
  const url = `${apiUrl}/manager/people/account/${TEST_USER_ID}/day-offs`;

  // Unauthorized: cashier cannot manage day-offs.
  const unauth = await request.put(url, { headers: authH(cashier.token), data: { days: [1] } });
  expect(unauth.ok(), "cashier day-off write must be rejected").toBeFalsy();
  record("dayoffs-unauthorized", "VERIFIED", `cashier PUT day-offs -> HTTP ${unauth.status()}`);

  // Clear-all (was HTTP 422 before the `required` -> `present` validation fix).
  const clear = await request.put(url, { headers: authH(manager.token), data: { days: [] } });
  const clearBody = await clear.json().catch(() => ({}));
  expect(clear.ok(), `clear-all: ${JSON.stringify(clearBody)}`).toBeTruthy();
  const afterClear = tinker(
    `echo \\DB::table('employee_day_offs')->where('user_id', ${TEST_USER_ID})->count()`
  ).trim().split("\n").pop().trim();
  expect(Number(afterClear), "clear-all must remove every day-off row").toBe(0);

  // Invalid day value and duplicates must still be rejected.
  const badDay = await request.put(url, { headers: authH(manager.token), data: { days: [7] } });
  expect(badDay.status(), "weekday 7 must be rejected").toBe(422);
  const dup = await request.put(url, { headers: authH(manager.token), data: { days: [1, 1] } });
  expect(dup.status(), "duplicate weekdays must be rejected").toBe(422);

  // Re-set persists rows.
  const set = await request.put(url, { headers: authH(manager.token), data: { days: [6, 0] } });
  expect(set.ok(), `re-set: ${await set.text()}`).toBeTruthy();
  const afterSet = tinker(
    `echo \\DB::table('employee_day_offs')->where('user_id', ${TEST_USER_ID})->pluck('weekday')->sort()->values()->toJson()`
  ).trim().split("\n").pop().trim();
  record(
    "dayoffs-contract",
    afterSet === "[0,6]" ? "VERIFIED" : "TESTED",
    `Clear-all -> 200 + 0 rows; invalid/duplicate -> 422; re-set -> ${afterSet}`
  );
  expect(afterSet, "re-set must persist [0,6]").toBe("[0,6]");
});

test("kiosk: PIN unlock -> employee barcode punch records attendance", async ({ request }) => {
  const pin = fs.readFileSync(path.join(rootDir, ".kiosk-pin.tmp"), "utf8").trim();
  expect(pin, "kiosk pin provisioned").toBeTruthy();
  const kioskH = { Accept: "application/json", "X-Kiosk-Pin": pin };

  const punch = await request.post(`${apiUrl}/kiosk/punch`, {
    headers: kioskH,
    data: { barcode: FIXTURE_BARCODE },
  });
  const punchBody = await punch.json().catch(() => ({}));
  // Idempotent: a prior run may have completed today's attendance (auto-detect
  // punches check-in, then check-out). A 422 "already completed" IS evidence
  // the punch path ran — verify the attendance row instead of re-punching.
  const alreadyDone = /already completed/i.test(punchBody.message || "");
  if (!punch.ok() && !alreadyDone) {
    expect.unreachable(`kiosk punch unexpectedly failed: ${JSON.stringify(punchBody)}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const rowJson = tinker(
    `echo json_encode(\\DB::table('attendance')->where('user_id', ${TEST_USER_ID})->where('date', '${today}')->first(['id','check_in','check_out','status']))`
  ).trim();
  const row = JSON.parse(rowJson.split("\n").pop());
  const punched = row && (row.check_in || row.check_out);
  record(
    "kiosk-clock-in",
    punched ? "VERIFIED" : "TESTED",
    `Punch ${punchBody.message || "ok"}; attendance row ${rowJson}`
  );
  expect(punched, "kiosk punch must write an attendance check_in/check_out").toBeTruthy();
});
