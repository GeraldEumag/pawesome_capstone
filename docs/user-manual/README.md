# Pawesome User Manual Documentation

## Current state (v0.4, 2026-10-25)

`PAWESOME_USER_MANUAL_v0.4.md` is the **current release candidate**: the v0.3 plain-language manual re-audited claim-by-claim against the current working tree (HEAD `3e75be0` + uncommitted changes). v0.4 adds the boarding-care lifecycle (Check In / care logs / Ready for Pickup / Check Out), approval confirmation dialogs, the unique payment-reference rule, pet-photo rules (JPG/PNG/WebP <10 MB), counter GCash/Maya collection, cancel-own-request, vet additional billing, the Controlled Drugs register, and three new manager pages (Invoice Approvals, Receipt Scanner, Controlled Drugs). Verification: 98 backend tests / 493 assertions on `pawesome_test` + mocked browser run + source review; details in `audit/` and `REVISION_SUMMARY_v0.4.md`.

Prior versions preserved unchanged: `PAWESOME_USER_MANUAL_v0.3.*` (plain-language rewrite) and `PAWESOME_USER_MANUAL.md`/`.pdf` (v0.2 runtime-verified draft). Still open: 8 screenshot placeholders, several payroll/report pages unexercised, mailbox delivery unproven, no school template confirmed, and the app tree has uncommitted changes worth a final doc check.

## Files

- `PAWESOME_USER_MANUAL_v0.4.md` / `.pdf` / `.docx` — current release candidate (v0.4)
- `REVISION_SUMMARY_v0.4.md` — v0.4 revision table, coverage, test evidence, release decision
- `audit/BASELINE_AUDIT.md`, `audit/ROLE_FEATURE_MATRIX.md`, `audit/MANUAL_GAP_ANALYSIS.md`, `audit/WORKFLOW_VERIFICATION_MATRIX.md`, `audit/SCREENSHOT_AUDIT.md` — v0.4 internal audit reports
- `PAWESOME_USER_MANUAL_v0.3.md` — prior end-user revision (v0.3)
- `PAWESOME_USER_MANUAL_v0.3.pdf` / `.docx` — generated v0.3 outputs
- `REVISION_SUMMARY.md` — v0.3 revision table and checklist
- `PAWESOME_USER_MANUAL.md` — v0.2 runtime-verified draft (preserved)
- `PAWESOME_USER_MANUAL.pdf` — generated PDF of v0.2
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

## Generating PDF/DOCX

PDF: from the repo root — the script accepts an input markdown and output path (defaults: `PAWESOME_USER_MANUAL.md` → `PAWESOME_USER_MANUAL.pdf`):

```powershell
node frontend/.manual-pdf-build.mjs docs/user-manual/PAWESOME_USER_MANUAL_v0.4.md docs/user-manual/PAWESOME_USER_MANUAL_v0.4.pdf
```

DOCX: built with portable pandoc from the image-injected intermediate the PDF script produces (the plain `.md` references figures by filename, so pandoc needs the injected copy to embed images):

```powershell
node frontend/.manual-pdf-build.mjs docs/user-manual/PAWESOME_USER_MANUAL_v0.4.md docs/user-manual/PAWESOME_USER_MANUAL_v0.4.pdf
cd docs/user-manual
pandoc .manual-injected-PAWESOME_USER_MANUAL_v0.4.md --resource-path . -f gfm --toc --toc-depth=2 -M title="Pawesome User Manual" -o PAWESOME_USER_MANUAL_v0.4.docx
```

Open and visually check the export (page size, headings, tables, figure placement, TOC) before delivering.
