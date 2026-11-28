# 12 — Automated Test Results

## Backend (PHPUnit → MySQL `pawesome_test`)

| Run | Result |
| --- | --- |
| Baseline (pre-fix HEAD, changes stashed) | 5 deterministic failures — all proven **pre-existing** date-bombs (see 00) |
| Targeted re-run after fixes (5 affected files + new species test + AdminDeepAudit) | **74/74 pass** |
| **Full suite post-fix** | **1298 passed, 1 skipped, 0 failed** — 6442 assertions, 594s |

Delta vs baseline: +16 passing tests (5 previously-failing now green +
11 new `PetSpeciesEnforcementTest`), 0 regressions.

### Fixes verified by the suite

- Species enforcement across grooming/appointment/chatbot/walk-in/boarding
  channels (`PetSpeciesEnforcementTest`, 11 tests).
- Holiday-safe booking dates via `Tests\TestCase::nextBookableDate()`.
- `PetFactory` deterministic `Dog` default removes fixture flake.
- VAT math alignment (`Sale::calculateTotals`, `ReceiptBreakdown`
  literals) — tax-calculation tests (`tax calculation accuracy`,
  `cashier sale tax calculation in database`, receipt breakdown tests)
  all green.

## Frontend (Vitest)

- `npx vitest run`: **15 files / 75 tests — all pass** (52.6s).

## Build

- `npm run build` (Vite 6.4.5): **PASS** — 2392 modules, built in ~67s.
  Warnings only: chunk-size >500kB notice and mixed static/dynamic
  imports (pre-existing, unrelated to audit changes).

## Static checks

- `php -l` clean on every edited PHP file.
- `git diff` reviewed — changes confined to audit scope (see report 17).
