# VETERINARY_AUDIT_BASELINE.md

**Audit:** Pawesome Veterinary Role — Final System Audit & Hardening
**Date:** 2026-11-17
**Auditor:** Devin (automated senior-engineering audit per approved plan)
**Scope note:** This baseline was captured **before any source-code modification** (execution rule #1). All findings in sibling reports trace back to this state.

---

## 1. Repository state

| Item | Value |
| --- | --- |
| Repository root | `C:\xampp\htdocs\Pawesome_Capstone` |
| Active branch | `main` |
| HEAD commit | `5fd6c9b` — `docs(audit): final defense-readiness audit + co-researcher handoff` |
| Tracked-file modifications | **None** (`git status --porcelain` shows only untracked `??` files) |
| Untracked content | Browser-evidence JSON reports, `Chapter5_*.docx/pdf` manuscript files — audit artifacts only, no code WIP |

No developer work-in-progress exists that this audit could overwrite.

## 2. Environment

| Component | Version / State | Source |
| --- | --- | --- |
| PHP (CLI) | 8.2.12 (ZTS, VC++ 2019 x64) | `php -v` |
| Laravel | 12.72.0 | `php artisan about` |
| Composer | 2.9.5 | `composer --version` |
| Database server | MariaDB 10.4.32 (XAMPP) listening on `127.0.0.1:3306` | `mysql -e "SELECT VERSION()"` |
| Node | v24.14.1 | `node -v` |
| npm | 11.11.0 | `npm -v` |
| Frontend deps | `node_modules` present (282 entries) | filesystem |
| Vite dev server port | 3000 (configured) | `package.json` / Playwright config |
| Backend serve port | 8000 (APP_URL `http://localhost:8000`) | `.env` |

`php artisan about` highlights: `APP_ENV=local`, **debug ENABLED**, cache=file, queue=sync, mail=smtp, session=file, broadcasting=log, `public/storage` symlink **LINKED**.

## 3. Database connection & isolation

| Database | Purpose | Access policy for this audit |
| --- | --- | --- |
| `pawesome` | Live development database | **READ-ONLY** — `SELECT`/`SHOW` only. No seeds, migrations, or writes. |
| `pawesome_test` | Isolated test database (exists) | Destructive-capable — `RefreshDatabase` tests only |

`phpunit.xml` pins `DB_CONNECTION=mysql`, `DB_DATABASE=pawesome_test`, `DB_USERNAME=root`, empty password — the `.env.testing` sqlite values are overridden. CI (`.github/workflows/ci.yml`) runs the suite on MySQL 8; local MariaDB 10.4 is the documented XAMPP parity target.

`mysql` CLI is **not on PATH**; the XAMPP binary `C:\xampp\mysql\bin\mysql.exe` is used for all read-only inspection.

## 4. Migration & schema state

- `php artisan migrate:status`: **182 migrations, all `Ran`, zero `Pending`**.
- `pawesome` contains **93 tables** (94 `SHOW TABLES` output lines incl. header).
- Veterinary-relevant tables confirmed present:
  - `appointments`, `appointment_status_rollback_map`
  - `medical_records`, `medical_record_addenda`, `medical_attachments`, `medical_progress_notes`
  - `medical_confinements`
  - `prescriptions`, `vaccinations`
  - `diagnostic_orders`, `diagnostic_results`
  - `visit_consents`
- Key lifecycle migrations ran: `2026_10_24_000000_veterinary_visit_flow_phase_b`, `2026_10_25_000000_visit_billing_phase_c`, `2026_10_26_000000_pharmacy_confinement_phase_d`, `2026_10_27_000000_followup_hardening_phase_e`, `2026_10_28_000000_prescription_inventory_link`, `2026_10_29_000000_remove_triage_workflow`.

## 5. Authoritative status lifecycle

Per `docs/veterinary-workflow.md` (Phase B, applied) and `App\Support\VeterinaryStatus`:

```
requested → scheduled → checked_in → in_consultation
    → (in_treatment | awaiting_results) → clinical_complete
    → checkout → completed
terminal side-states: cancelled, rejected, no_show
flag: confinement_recommended (on appointment)
```

Legacy statuses (`pending`, `approved`, `in_progress`, `treated`, `awaiting_payment`, `needs_confinement`) are **retired** — the Phase B migration rewrote live rows and a model saving-hook maps any residual legacy writes forward. This audit verifies the real lifecycle and never reintroduces legacy vocabulary.

## 6. Live dev-DB snapshot (read-only `SELECT`)

| Metric | Count |
| --- | --- |
| `appointments` total | 69 |
| `scheduled` | 19 |
| `in_consultation` | **34** (elevated — candidate stale-visit finding, investigated in DB audit) |
| `checkout` | 7 |
| `completed` | 3 |
| `cancelled` | 6 |
| `requested` / `checked_in` / `clinical_complete` / `rejected` / `no_show` | 0 |
| `medical_records` | 13 |
| `medical_confinements` | 2 |
| `prescriptions` | 0 |
| `vaccinations` | 0 |
| vet-role users (`veterinary`,`vet`,`vet_tech`) | 1 |

## 7. Seed credentials verified present (dev DB)

| Email | Role | Active | Verified |
| --- | --- | --- | --- |
| `vet@example.com` | veterinary | 1 | 1 |
| `receptionist@example.com` | receptionist | 1 | 1 |
| `customer@example.com` | customer | 1 | 1 |
| `admin@example.com` | admin | 1 | 1 |

No `vet_tech` seed account exists — vet_tech paths are verified via PHPUnit factory users and (if needed) e2e API provisioning, per existing `e2e/test-utils.js` patterns.

## 8. Route inventory summary

`php artisan route:list --path=veterinary` → **85 vet-matching routes**, of which ~70 are under `api/veterinary/*` plus vet-reachable routes under `api/customer/*`, `api/admin/reports/*`, `api/manager/*`, `api/availability/*`. Full inventory with middleware/roles is produced in `VETERINARY_BACKEND_API_AUDIT.md`.

Middleware groups observed in `routes/api.php` (line refs):
- `role:veterinary,vet` — clinical core (dashboard, consultations, medical-records, confinement clinical actions, vaccinations, MAR)
- `role:veterinary,vet,vet_tech` — shared appointment board (`GET appointments`)
- `role:receptionist,vet_tech,veterinary` — intake check-in
- `role:veterinary,vet_tech,receptionist,cashier,manager,admin` — shared diagnostics reads
- `role:veterinary,admin` — service catalog (restricted to `Service::VET_CATEGORIES` in controller)
- `role:veterinary` — boarding read-only (`veterinary/boardings/*`)

## 9. Existing test assets

Backend (`backend/tests/Feature/`, 103 files total; `RefreshDatabase` + MySQL `pawesome_test`):

| File | Tests (grep count) |
| --- | --- |
| `VeterinaryWorkflowTest.php` | 24 |
| `AuthorizationMatrixTest.php` | 11 |
| `VetCancellationReasonTest.php` | 7 |
| `VeterinaryBillingPaymentFlowTest.php` | 6 |
| `VetBatch4SystemTest.php` | 5 |
| `VetUxHandoffTest.php` | 5 |
| `VaccinationCardOwnerAccessTest.php` | 2 |
| `MedicalRecordFormPayloadTest.php` | 1 |

Frontend e2e (`frontend/e2e/`, 91 specs; live-mode default `E2E_LIVE=true`, `workers:1`):
`vet-dashboard.spec.js`, `phase12-veterinary-workflow.spec.js`, `batch4-veterinary-system.spec.js`, `veterinary-boarders-room.spec.js`, `veterinary-responsive-audit.spec.js`, `vet-tech-intake-audit.spec.js`.

External audit scripts retained outside the repo at `C:/xampp/pawesome-maintenance/` (per F-01 containment): cross-role E2E, RBAC, DB-readiness, report-reconciliation, route analyzer.

## 10. Prior audit context

`docs/audit/` holds ~35 prior audit reports; `docs/veterinary-workflow.md` is the canonical workflow doc (its Phase A/B update notes are authoritative over its own legacy body text). `AGENTS.md` issue-tracking records multiple already-FIXED items relevant to scope boundaries (storage hardening, payment/booking channel integrity, POS batch stock, cashier deep-link, email outbox). These are treated as baseline truth; this audit re-verifies only where veterinary scope intersects them.

## 11. Initial system health — known risks to watch

1. **34 `in_consultation` appointments** with zero downstream statuses — investigate whether visits can stall indefinitely and whether the vet UI/API surfaces them correctly (possible stale-visit defect vs. legitimate backlog).
2. **0 prescriptions / 0 vaccinations** in dev DB — prescription & vaccination paths have no live data; verification must rely on test-fabricated data.
3. Windows socket-exhaustion is a documented Playwright hazard (AGENTS.md) — e2e runs at `--workers=1`; infrastructure failures are reported BLOCKED, never silently passed.
4. `APP_DEBUG=true`, `QUEUE_CONNECTION=sync`, `MAIL_MAILER=smtp` — local dev posture, expected; production-readiness items are scored separately in the acceptance report.
