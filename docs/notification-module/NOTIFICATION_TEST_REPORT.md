# Notification Module — Test Report

**Date:** 2026-11-18 · Environment: XAMPP MySQL `pawesome_test` (backend), live dev stack `php artisan serve` :8000 + Vite :3000 (e2e), Chromium.

## 1. Backend feature tests — `DB_CONNECTION=mysql DB_DATABASE=pawesome_test php artisan test --filter=Notification`

**24 passed / 0 failed (112 assertions, ~83 s)**

| Suite | Tests | Highlights |
|---|---|---|
| `NotificationMatrixTest` (existing) | 11 ✅ | service-submit→receptionist, status→customer, proof→cashier, verify/reject exactly-once, disabled-order gate, low-stock dedup + re-arm, appointment/boarding exactly-once, payroll per-user rows, read/unread + cross-user protection, inactive-user exclusion |
| `NotificationApiTest` (**new**) | 8 ✅ | index envelope + own-only, `?unread`+limit clamp, `getUnread`, unauthenticated→401, `store` 403/422/201, mark-all/clear-all own-only, **broadcast row visible-but-immutable**, removed `booking-status`→404 |
| Related (pulled by filter) | 5 ✅ | `AdminDeepAuditTest` login-alert, `AuditRegressionTest` expiry dedup, `CustomerBatch1SystemTest` prefs round-trip, `InventoryRoleAuthorizationTest` reorder notify, `ProbationaryAlertTest` schema |

## 2. Live-stack E2E — `npx playwright test e2e/notification-module.spec.js` (**new**, 5/5 ✅, ~1.6 min)

| Test | Verifies |
|---|---|
| badge + dropdown show seeded notification | admin `POST /` seeds → bell badge appears (≤10 s poll) → panel shows unread item |
| click marks read server-side | item click → `POST /{id}/read` → API confirms `read=true` + navigation |
| cross-user + unauthenticated | customer→receptionist row `read`/`delete` → 404; customer `POST /` → 403; anon `GET /` → 401 |
| error state with retry | mocked 500 → "Couldn't load notifications" + Retry button |
| mark-all-read clears + persists | `POST /mark-all-read` → server `unread_count=0` → badge gone → **stays gone after reload** |

Cleanup: every seeded row deleted via owner-scoped `DELETE /{id}` in `afterAll`.

## 3. Frontend unit — `npm run test:unit`

**44/44 ✅** (9 files — no notification component tests exist; coverage is via e2e + feature tests).

## 4. Build — `npm run build`

**✅ vite build** (2,371 modules; pre-existing chunk-size warnings only).

## 5. Environment observations (documented, non-defect)

- `php artisan serve` is **single-threaded**; browser POSTs can queue seconds behind dashboard request bursts → e2e uses 30 s server-truth polls. On first runs, a straggler `mark-all-read` swept a later seed — mitigated by pre-assertion `waitSeedUnread` + running mark-all last.
- One mid-run `ECONNRESET`/`ECONNREFUSED` episode on :8000 — matches the documented Windows socket-exhaustion issue (AGENTS.md), not an app defect; clean run passes 5/5.
- Retry worker occasionally hit the `/auth/login` 5/min throttle — `loginAs`/`apiLogin` cache handles it.

## 6. Coverage vs required scenarios

| Prompt scenario | Evidence |
|---|---|
| S1 booking notify→approve→customer | matrix tests (submit→receptionist, status→customer, exactly-once) |
| S2 payment proof→cashier→verify/reject→customer | matrix tests + receipt assertions |
| S3 order flow | disabled-verification gate test + proof-upload test |
| S4 vet schedule→complete | appointment hook tests + confinement/verification code review |
| S5 low-stock dedup | matrix test (dedup + re-arm) |
| S6 cross-role isolation | e2e 404/403/401 + feature tests |
| S7 persistence across reload/login | e2e mark-all + reload |
| S8 failure handling | e2e 500→error state; apiRequest throws on 4xx/5xx/401→clearAuth |

Manual-only aspects not executable in CI: real mailbox delivery (outbox verified, provider not — prior audit `BLOCKED (env)`), pixel-level visual review (documented in UI/UX audit).
