# Cashier Module — Baseline Audit

Date: 2026-11-18 · Auditor: Devin (final-stage system audit) · Scope: Pawesome Cashier module and every directly connected workflow (React → Laravel API → MySQL).

## 1. Environment baseline

| Check | Result | Evidence |
|---|---|---|
| `php artisan --version` | Laravel 12.72 / PHP 8.2.12 | artisan |
| `php artisan migrate:status` | All ~185 migrations `Ran` | artisan |
| `php artisan route:list --path=cashier` | 54 cashier API routes | artisan |
| Composer backend deps | Installed, no audit-blocking issues | composer.json/lock present |
| `npm run build` (frontend) | **PASS** — 32.97s, warnings only (chunk size) | Vite |
| Scoped PHPUnit (cashier/POS/payment/settlement/billing/outbox) | **96 passed / 1 skipped** (GD missing — environmental) | `php artisan test --filter=…` |
| Dev DB (`pawesome`) integrity snapshot | 0 orphans, 0 dup receipt numbers, 0 invalid statuses | read-only SQL |
| Frontend→route cross-check | Every cashier UI API path maps to a real Laravel route | static sweep |

## 2. Isolated audit stack

Per plan, all mutation testing ran on an isolated clone — never on `pawesome`.

| Component | Value |
|---|---|
| Audit DB | `pawesome_cashier_audit` (93 tables, row counts parity-checked against `pawesome`) |
| Audit API | `php artisan serve` on `127.0.0.1:8001`, `.env` → `DB_DATABASE=pawesome_cashier_audit` |
| Audit frontend | Vite on `127.0.0.1:3001`, `VITE_API_BASE_URL=http://127.0.0.1:8001/api` (verified in served bundle) |
| Write probe | API write via :8001 landed in `pawesome_cashier_audit` only; `pawesome` unchanged |
| Reverse check | Dev DB re-queried after probes — no mutations |

## 3. Baseline findings entering the audit

- Prior audit rounds (inventory, payment hardening) were documented in `docs/audit/` — all claims re-verified, none assumed.
- `frontend/src/api/client.js` — `USE_MOCK_DATA = false` (no accidental mock path).
- `CashierRoutes.jsx` maps `/cashier/payment-verification` → `CashierPOS initialTab="payment-approvals"` (live approval UI is `PaymentApprovals`; `CashierPaymentVerification.jsx` is unrouted legacy).
- 62 payable rows in the cashier queue at audit start (approved unpaid + pending proofs); unapproved/rejected correctly excluded.

## 4. Environmental limitations recorded

- `mysql` CLI not on PATH → `C:/xampp/mysql/bin/mysql.exe` and PHP/PDO used instead. No impact.
- Local PHP CLI lacks GD → 1 test skipped (environmental, matches `AGENTS.md`).
- Windows socket exhaustion is a documented flakiness source for Playwright; the executed specs were stable.
- `payment_settlements.payment_method` on pre-fix counter-cash rows shows historical `NULL` (root cause found & fixed — see CHANGELOG).
