# Pawesome User Manual Documentation

## Current state (v0.2, 2026-10-22)

`PAWESOME_USER_MANUAL.md` is a **runtime-verified draft**: all principal customer→staff→payment, booking (online, walk-in, hotel), clinical, POS, and user-provisioning chains were executed against the local dev build and 18 genuine screenshots were captured. A third pass (chain3) additionally verified register→verify→reset→login, inactive/role gates, kiosk PIN, manager-filed leave reject, attendance-correction reject, day-offs set, supplier roundtrip, batch receive+dispose, and a full payroll lifecycle on a fixture user. Still not submission-final — some HR/payroll surfaces are partially exercised, email mailbox delivery is unprovable (SMTP accepted, fake domains), and no school template/DOCX export exists yet.

## Files

- `PAWESOME_USER_MANUAL.md` — end-user manual (v0.2)
- `audit/repository-inventory.md` — reviewed project structure and evidence boundary
- `audit/route-and-page-inventory.md` — route/menu inventory (v0.1 source review)
- `audit/role-permission-matrix.md` — role summary (v0.1 source review)
- `audit/feature-verification-matrix.md` — updated 2026-10-22 with runtime statuses
- `audit/workflow-map.md` — updated 2026-10-22 with verified chain outcomes
- `audit/documentation-gaps.md` — updated 2026-10-22
- `audit/documentation-qa-report.md` — updated 2026-10-22
- `audit/first-time-user-checklist.md` — human acceptance walkthrough (PENDING — requires a real unfamiliar tester)
- `audit/screenshot-register.md` — updated 2026-10-22 (all 18 captures recorded; UM-012 recaptured after D-10 spec fix)
- `audit/runtime-verification.json`, `audit/runtime-verification-chain.json`, `audit/runtime-verification-chain2.json`, `audit/runtime-verification-chain3.json`, `audit/runtime-verification-chain4.json` — spec results
- `screenshots/` — 18 genuine captures, privacy-reviewed

## Runtime verification evidence

- `e2e/manual-audit-regressions.spec.js` — 2/2 PASS (cashier Dashboard fix, Create User roles)
- `e2e/manual-verification-pass.spec.js` — 11/11 PASS
- `e2e/manual-e2e-chain.spec.js` — 3/3 PASS
- `e2e/manual-e2e-chain2.spec.js` — 6/6 PASS (walk-in→cash, POS sale+void, rejection, consult cycle, create-user, hotel). Reruns reuse prior fixtures; the hotel test falls back to verifying boarding 60's recorded state when room 1 is occupied by it.
- `e2e/manual-e2e-chain3.spec.js` — 8/8 PASS (auth lifecycle, gates, kiosk, leave/correction rejects, day-offs, supplier/batch, payroll)
- `e2e/manual-e2e-chain4.spec.js` — 4/4 PASS (seeded-balance leave self-file→approve→deduct, correction approve, day-off full contract incl. clear-all, kiosk PIN→actual barcode punch)
- Code fixes applied in v0.2: `CreateUser.jsx` (Payroll option removed), `CashierSidebar.jsx` (Dashboard → `/cashier/dashboard`)

## Maintenance workflow

1. Confirm the current build, repo changes, official school template, and safe test environment before updating.
2. Preserve existing files; do not overwrite without owner authorization.
3. Re-review routes, sidebars, API clients, middleware, controllers, schema/migrations, tests for changed features.
4. Verify user-visible behavior in an approved environment; never use production/shared data or real payments.
5. Update inventories/evidence before revising instructions.
6. Capture genuine screenshots, privacy-review, update `audit/screenshot-register.md`.
7. Refresh `audit/documentation-qa-report.md`; keep unresolved items marked NOT VERIFIED/CODE-REVIEWED/BLOCKED.
8. Bump version/date + revision history.

## Generating DOCX/PDF

No `pandoc`/LibreOffice in this environment; Markdown is the deliverable. When a converter is available, from `docs/user-manual/`:

```powershell
pandoc PAWESOME_USER_MANUAL.md --output PAWESOME_USER_MANUAL.docx
pandoc PAWESOME_USER_MANUAL.md --output PAWESOME_USER_MANUAL.pdf
```

Open and visually check the export (page size, headings, tables, figure placement, TOC) before delivering.
