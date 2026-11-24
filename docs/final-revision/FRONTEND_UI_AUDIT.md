# FRONTEND_UI_AUDIT.md

**Date:** 2026-11-24 · Frontend: React 18 + Vite 6.4.5.

## 1. Build & test state (current)

- `npx vitest run`: **75/75 PASS** (15 files).
- `npm run build`: PASS — `index-*.js` 3,711 kB / gzip 1,087 kB; route-level code splitting active for most pages.
- `npm run lint`: **BLOCKED (environment)** — `@eslint/js` missing from `node_modules`; pre-existing dependency-state issue, unrelated to revision changes. No `npm install`/lockfile changes made (repo has no yarn.lock; AGENTS.md requires approval for dependency changes).
- `npm audit`: only `xlsx@0.18.5` advisories — write-only usage, risk-accepted (C-03).

## 2. UI changes this revision

| File | Change |
|---|---|
| `components/inventory/AddProductModal.jsx` | `pack_size`/`box_size`/`unit_options` fields; stock initialized 0 for new products |
| `components/inventory/StockInPage.jsx` / `StockOutPage.jsx` | Unit selector + quantity; `uom.js` converts display unit → base before submit |
| `components/inventory/uom.js` (new) | Shared UOM labels/conversion helpers |
| `components/inventory/AddProductModal.test.jsx` | Updated + passing (2/2) |
| `components/inventory/StockMovement.css` | Minor styling for new fields |

## 3. Design-system compliance

- New UI uses existing `pw-*` form conventions and theme tokens; no new brand hex literals; no bare generic classes added.
- `DatePickerInput` used for report date ranges (SYS-002 fix, pre-existing).
- Dialogs via `utils/alert.jsx`; modals via shared `Modal.jsx` — no regressions introduced.

## 4. UX findings carried over

- Main bundle size (C-04): chunking opportunity; lazy-loading warnings for a few dual-imported modules (`ProfileSettings`, inventory pages) — cosmetic build warnings only.
- SYS-002 report date-range: implemented pre-revision (`AdminLiveReport.jsx` start/end + presets) — classified FIXED, not a new gap.

## 5. Verdict

**PARTIALLY VERIFIED** — vitest + build green; eslint BLOCKED by missing dev dependency (environment, not code); browser-level UI verification in Phase 4.
