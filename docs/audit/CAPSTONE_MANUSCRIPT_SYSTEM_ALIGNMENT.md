# Capstone Manuscript & System Alignment

**Date:** 2026-11-17

## Scope

Manuscript/thesis DOCX lives outside the repo; this records what the actual implemented system supports (see `PHASE6_MANUSCRIPT_ALIGNMENT.md` for the apply-it-manually edit list).

## Implemented scope the manuscript may claim

- 7 primary roles (+ `super_receptionist`, `vet_tech` composites) — `admin` merged (no `super_admin`), `payroll` enum unused.
- Modules: customer/pets, receptionist scheduling+rooms, cashier POS+payment verification, inventory/batches/audits, veterinary (visits, diagnostics, prescriptions, confinement, vaccinations, MAR), boarding/hotel, grooming, HR (attendance, leave, day-offs, salary loans, 13th-month), payroll (server-computed, maker-checker for unlinked), reports, notifications + durable email outbox, chatbot/FAQ/live chat, kiosk attendance, receipt scanning.
- 722 API routes, 93 tables, 184 migrations.

## Defense-risk checks

| Risk | State |
| --- | --- |
| Methodology matches actual process | document only the executed process; audit trail in `docs/audit/` |
| ERD ↔ real relationships | 136 FK relationships verified on isolated schema; use that as ERD source |
| DFD ↔ real flows | workflows verified E2E — see `WORKFLOW_INTEGRITY_MATRIX.md` |
| Objectives ↔ features | all claimed modules exist; product-checkout is deliberately disabled — do not claim it |
| Screenshots | `browser-evidence/` has real captures — use these, not mockups |
| Deployment/training | NOT performed — do not claim them |

## Do NOT claim

- Live production deployment, real email delivery, real payment gateway, or customer product-checkout (disabled, 410).
