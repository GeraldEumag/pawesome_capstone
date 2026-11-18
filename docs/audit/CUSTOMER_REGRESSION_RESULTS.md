# Customer Role — Regression Results (Gate 4)

**Audit date:** 2026-11-18 · **Stack:** `pawesome_test` (backend suite) + `pawesome_customer_audit` (e2e stack)

## Results matrix

| Suite | Target | Result | Notes |
| --- | --- | --- | --- |
| `php artisan test` — customer-scoped filter (`Customer\|Payment\|Booking\|Boarding\|WalkIn\|Private`) | `pawesome_test` MySQL | **291/291 pass, 1338 assertions** | incl. CustomerDataIsolation, CustomerBookingRules, CustomerTracking, PrivateConfinementPaymentProof, PrivatePetPhoto, VaccinationCardOwnerAccess, VeterinaryBillingPaymentFlow, ReceptionistCheckInGate, StorageLifecycle, TransactionAtomicity, ServiceBillingRemediation, EmailAuthFlow, AuditLog |
| Baseline e2e (customer specs + linked) | audit stack `:3001`→`:8001` | **52/52** | initial run 44 pass/3 fail → all 3 caused by harness defect CUST-H01 (`/api/api` path), fixed; re-run green |
| Gate-4 e2e re-run (all `e2e/customer-*` specs, 2 workers) | audit stack | **36 pass / 1 fail / 3 serial-skipped → serial re-run 6/6** | the single failure was a 30s `waitForLoaded` timeout under socket-exhaustion load (API responds 200/0.6s standalone); entire spec passes serially — flake, not defect |
| `vitest run` | frontend | **44/44 pass** (9 files) | |
| `vite build` | frontend | **success** (58.6s) | pre-existing chunk-size/import warnings only |
| Live security probes (Gate 2 matrix) | audit API | all denied/verified | see CUSTOMER_SECURITY_AUDIT.md |

## Test-database caveat (as required by scope)

The PHPUnit suite pins `DB_DATABASE=pawesome_test` via `phpunit.xml`, so backend regression numbers are **test-DB evidence**, not audit-stack writes. Audit-stack persistence was proven separately by direct `mysql` inspection of `pawesome_customer_audit` (see CUSTOMER_DATABASE_PERSISTENCE.md) plus the Playwright run against `:8001`.

## Known environment limitations

- **MariaDB 10.4.32 vs CI MySQL 8** — feature parity differences documented; CI workflow remains the authoritative MySQL 8 signal.
- **Windows socket exhaustion** — mitigated with `--workers=2`.
- **Local disks shared across stacks** — `storage/app/{private,public}` are repo-local; file isolation is row-level only (random filenames make collisions nil). Documented, not a defect on this stack.
- `php artisan about` on the `:8001` process reports `.env` URL/timezone (not the overridden launch env) — reporting quirk only; write-probe proved the effective audit connection.

## Gate A–D maintenance scripts

`pawesome_*_audit.php` scripts at `C:/xampp/pawesome-maintenance/` bootstrap `backend/.env` (points at dev `pawesome`). Per the safety checkpoint, they were **not run** against the dev DB; to run them for this audit they must be launched with `DB_DATABASE=pawesome_customer_audit` overrides and an independent `artisan tinker`/`DB::connection()->getDatabaseName()` confirmation first. Customer-module coverage was instead achieved via the direct DB-verified probes documented in this audit (equivalent evidence: RBAC matrix, E2E, reconciliation).
