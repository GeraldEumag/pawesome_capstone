# 13 — End-to-End Test Results

## Environment

- Backend served via `php-worker-pool.js` round-robin proxy on
  `127.0.0.1:8000` → 8 `php artisan serve` workers on :8001–:8008
  (all 8 started; single `artisan serve` is single-threaded on Windows
  and serializes E2E traffic).
- Frontend Vite dev server on `127.0.0.1:3000` with `/api` proxy → :8000
  (per `playwright.config.js`, `E2E_LIVE` defaults true).
- Playwright 1.59, chromium, `workers: 1`, `retries: 1`.
- MySQL `pawesome` (dev database) — seeded demo accounts per
  `AGENTS.md` test-credentials table.

## Command

```
npx playwright test e2e/batch3-cashier-workflow.spec.js \
  e2e/batch5-inventory-system.spec.js \
  e2e/cross-role-main-workflow.spec.js \
  e2e/pawesome-role-smoke-audit.spec.js \
  --reporter=list
```

## Result: 29 passed / 4 failed (6.6m)

### Passed — evidence the audited fixes hold live

- **cashier workflow (batch3):** login → POS workspace, add item, VAT
  display, checkout, receipt generation — green (tax math fixes hold
  against the live API).
- **inventory routes (batch5):** all 18 canonical `/inventory/*` routes
  load without redirect or uncaught console errors; role-guard redirects
  for customer/admin/manager/receptionist/cashier/veterinary all pass.
- **cross-role main workflow:** full Customer → Receptionist →
  Veterinary → Manager Reports chain, 2.4m, green — the species
  enforcement and booking availability changes do not break the
  end-to-end business day.
- **role smoke audit:** customer, receptionist, cashier, inventory,
  veterinary, manager, admin, super_receptionist dashboards — all load
  without console errors.

### Failed — all 4 pre-existing fixture/spec drift, none caused by audit changes

1. `/inventory/simplified` → E2E spec expects the URL to stay; app
   intentionally `Navigate`s to `/inventory/stock`
   (`frontend/src/routes/InventoryRoutes.jsx:42`). Legacy-alias redirect.
2. `/inventory/legacy-products` → redirects to `/inventory/products`
   (`InventoryRoutes.jsx:44`). Same pattern.
3. `/inventory/management` → same intentional-redirect drift.
4. `vet_tech` login 401 — **no `vet_tech` user exists in the dev
   database** (`User::where('role','vet_tech')` → 0 rows). The
   `pawesome-role-smoke-audit` spec covers a role the dev fixture lacks;
   veterinary coverage is supplied by the `veterinary` role test, which
   passes. Not an application defect — a fixture gap.

### Infra notes during the run

- First E2E attempt showed intermittent 502s — root cause was the worker
  pool proxying to 8 backends while only 4 were running; fixed by
  starting :8005–:8008.
- A login-throttle (429) window was tripped by probing and waited out
  before the clean run; the successful run shows no throttle impact.
