# E2E Reliability & Hygiene Audit

Scope: `frontend/e2e/` Playwright suite (chromium project) against the live local
stack (Vite `:3000`, Laravel `:8000`, MySQL). Goal was to fix test/config drift,
make data deterministic, and classify residual failures as **application
defect**, **test defect**, or **environment/load**.

## Result summary

| Run | Outcome |
| --- | --- |
| Baseline (before hygiene pass) | 73 passed / 44 failed / 4 flaky |
| Full suite after fixes (4 workers) | **105 passed / 13 failed / 3 flaky / 3 skipped** |
| Residual set rerun at `--workers=2` | **33 passed / 1 failed / 3 flaky** — the 1 remaining failure (`cashier-inventory-workflow`) was a real spec defect, since fixed and verified green at `--workers=1` |

The dominant failure mode at full parallelism is **load starvation**: pages
stuck in "Loading …" past their wait budgets because Vite transforms + the PHP
dev server + MySQL serialize under 4 workers on Windows. Every such test passes
in isolation or at reduced parallelism.

## Fixed during this pass

### Test/config defects

- **Port drift** — `playwright.config.js` defaulted `baseURL` to `:3002` and ~20
  specs carried stale `frontendUrl` consts defaulting to `:3002`. All now default
  to `:3000` with `E2E_BASE_URL` override.
- **Origin split** — `baseURL` defaulted to `localhost:3000` while spec
  `frontendUrl` defaulted to `127.0.0.1:3000`. Different origins = separate
  `localStorage`, which produced mixed auth state during multi-role tests.
  Config now defaults to `127.0.0.1:3000`.
- **Mock fallback intercepting app modules** — `mockApiFallback` used glob
  `**/api/**`, which also matched `/src/api/client.js`, fulfilling a JS module
  as JSON so the app never mounted (≈36 `mobile-portrait-audit` failures).
  Now scoped to the backend origin / root-relative `/api/*` only.
- **Fake-token dashboard specs** — `mockLoginAs` tokens 401 against the live
  backend → redirect to `/login`. `E2E_LIVE` now defaults to `true` (CI never
  runs Playwright; the suite is live-stack only). Mock mode remains via
  `E2E_LIVE=0`/`false`.
- **Login throttling (429s)** — several specs defined private `apiLogin`
  helpers bypassing the shared token cache, hammering `/auth/login`
  (`throttle:auth` = 5/min per account+IP). All now route through the cached
  `apiLogin`/`loginAs` in `test-utils.js`; `apiLogin` gained a `refresh` option
  for sessions that must be re-issued after UI logout.
- **Token revocation by UI logout** — `cashier-inventory-workflow` and
  `cross-role-main-workflow` call `/logout` (which deletes the Sanctum token),
  then reused the cached session → 401, plus cache poisoning for later specs on
  the same worker. Both specs now refresh the role's token after each logout.
- **`networkidle` waits** — replaced with `domcontentloaded` + locator
  auto-waiting in 8 dashboard specs; notification polling (10s) and Vite
  transforms kept `networkidle` unreachable under load.
- **Seed-state assumptions** — `receptionist-dashboard` approve/reject,
  `customer-my-requests-link`, and `role-deep-links` vet notification now
  provision their own data via API (pet → service request → receptionist
  approval → vet notification).
- **Retry isolation** — `phase4-payment-workflow` fixture moved `beforeAll` →
  `beforeEach` so retries reseed pending state.
- **Racy visibility checks** — customer dashboard quick actions, inventory
  stock controls, and vet appointment rows are now awaited (loading-state
  clears first) instead of `isVisible()` immediately after `domcontentloaded`.
- **Brittle UI-login dependencies** — `manager-payroll-scope` and
  `cashier-inventory-workflow` no longer depend on the SweetAlert login flow;
  they use cached API sessions (login UX is covered by dedicated login specs).

### Application defects found & fixed

- **`CustomerRequestStatus.jsx`** — `Promise.all` over 3 endpoints without
  per-call fallback: any single failure emptied the whole My Requests table.
  Now `.catch(() => [])` per endpoint, matching `CustomerHistory.jsx`.
- **`NotificationDropdown.jsx`** — `notificationRole` defaulted to `"manager"`
  when role was unresolved, so transitional/role-less instances fired
  manager-scoped requests. Default removed; fetch is skipped until a role
  resolves (`DashboardLayout` always passes `role`, so no behavior change for
  real dashboards).

## Residual environment failures (not application defects)

These reproduce only under full 4-worker parallelism on this Windows dev box and
pass at `--workers=1/2` or in isolation:

- **Backend/socket starvation** — `php artisan serve` (even with
  `PHP_CLI_SERVER_WORKERS=8`) plus Vite dev transforms plus MySQL serialize
  requests; heavyweight specs (`cross-role-main-workflow`, `storage-hardening`,
  `cashier-payment-deep-link`, `manager-payroll-scope`, `pawesome-full-workflow`,
  phase2/phase4 flows) can exceed even 90s–5m budgets. Known Windows socket
  exhaustion (documented in `AGENTS.md`) compounds this: `ERR_NETWORK_CHANGED`,
  `ERR_ADDRESS_IN_USE`, Vite crashes mid-run.
- **`throttle:api` 429s** — the global limiter is 60 req/min **per IP** shared
  across all tests. Parallel runs can trip it (observed on the payment-proof
  upload in `storage-hardening`). This is a legitimate production limit, not a
  bug.
- **Chatbot bootstrap timing** — `.rbac-quick-action` renders only after
  `/api/chatbot/welcome` resolves; under load this exceeded 20s. Waits were
  raised (45s) but extreme contention can still starve them.

## Recommendations

- For a reliable full-suite signal on Windows: run with `--workers=2`
  (~25–30 min) or on Linux/Docker.
- If a stable CI lane is ever added for Playwright, provision a production-like
  backend (`php-fpm`/`octane` or a real web server) rather than `artisan serve`,
  and consider raising `throttle:api` for the test environment.
- The `pawesome-full-workflow` per-role UI-login tests intentionally exercise
  real login UX; keep them but treat their flakes as env unless reproducible at
  low parallelism.
