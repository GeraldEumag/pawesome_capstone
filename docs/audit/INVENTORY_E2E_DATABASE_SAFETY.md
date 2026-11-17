# E2E Database Safety — Mutation Guard

**Purpose:** prevent any Playwright spec from mutating the development database
(`pawesome`). A separate API port does NOT prove a separate database — this was
demonstrated when a spec once created a sale on `:8000` (see
`INVENTORY_ROLE_AUDIT.md` §8, since compensated).

## Mechanism — `frontend/e2e/audit-guard.js`

`enforceAuditStack(request, test, { role, apiLogin })` runs three layers:

1. **Environment contract** (`checkAuditEnv`, pure function):
   - Both `E2E_API_URL` and `E2E_AUDIT_DATABASE` unset → **skip** (audit stack
     not configured; nothing is mutated).
   - One set without the other → **hard fail** (no silent fallback to :8000).
   - `E2E_API_URL` on port 8000/80/443 → **hard fail** (dev API).
   - `E2E_AUDIT_DATABASE` in `{pawesome, pawesome_test, mysql, test, sys,
     information_schema, performance_schema}` or missing `*audit*` in the name,
     or equal to `E2E_DEV_DATABASE` (default `pawesome`) → **hard fail**.

2. **Server-side identity proof:** writes a uniquely named probe item THROUGH
   the API under test, then queries MySQL directly (PDO) in both the audit and
   development databases. The run proceeds only when the probe exists in the
   audit DB AND is absent from the dev DB. The probe is deleted from the audit
   DB afterward.

3. **Per-worker cache:** the proof runs once per worker/role, so repeated tests
   do not re-probe.

## Required environment

```powershell
$env:E2E_API_URL="http://127.0.0.1:8001/api"      # isolated Laravel API
$env:E2E_AUDIT_DATABASE="pawesome_inventory_audit" # isolated DB (must contain 'audit')
$env:E2E_BASE_URL="http://127.0.0.1:3001"          # frontend pointed at :8001
```

**UI-mutation warning:** the guard proves the API *endpoint* is isolated. Specs
that mutate through the browser must additionally set `E2E_BASE_URL` to a
frontend whose `VITE_API_BASE_URL` targets the audit API — otherwise UI-driven
writes still reach the dev backend. Read-only/navigation UI is unaffected.

Start the stack (PowerShell):

```powershell
cd backend
$env:DB_DATABASE="pawesome_inventory_audit"; $env:APP_TIMEZONE="Asia/Shanghai"
php artisan serve --host=127.0.0.1 --port=8001
cd ../frontend
$env:VITE_API_BASE_URL="http://127.0.0.1:8001/api"; npx vite --port 3001 --host 127.0.0.1
```

## Wired-in specs

- `phase12-inventory-workflow.spec.js` — `test.beforeEach` → `enforceAuditStack`
- `cashier-inventory-workflow.spec.js` — guard at test start (POS sale mutation)
- `inventory-dashboard.spec.js` — guard inside `can create new inventory item`
  and `can update stock quantity` (live mode only; mock mode unaffected)

## Failure conditions (verified)

| Scenario | Result |
|----------|--------|
| No env configured | skip, no mutation |
| `E2E_API_URL` missing (audit DB set) | hard fail |
| `E2E_AUDIT_DATABASE` missing (API set) | hard fail |
| API on port 8000 | hard fail |
| DB name `pawesome` / `pawesome_test` / system | hard fail |
| Non-`*audit*` name / audit DB == dev DB | hard fail |
| Probe lands in dev DB or neither DB | hard fail |
| Probe in audit DB only | proceed |

## Regression coverage

`e2e/inventory-e2e-database-safety.spec.js` — 9 tests:
8 decision-table cases via subprocess + 1 live probe verification.
Executed 2026-11-18: **8 pass / 1 skip without env; 9/9 pass with the audit
env**; post-run `dev_probe_leaks=0`, `audit_probe_leftovers=0`.
