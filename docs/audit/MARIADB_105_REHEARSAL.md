# MariaDB Rehearsal — Capstone B (2026-10-25)

## Headline finding
The dev/test database is **MariaDB 10.4.32** (XAMPP ships MariaDB, labeled "mysql"). Evidence: `SELECT VERSION()` → `10.4.32-MariaDB`. Therefore **all migrations and the entire test suite already run on MariaDB** — the feared MySQL→MariaDB incompatibility was never present.

## Evidence
- `php artisan migrate:status` — all migrations `Ran` (latest batch [15]) on `pawesome` dev DB (MariaDB 10.4).
- `php artisan test` on `pawesome_test` (MariaDB 10.4): **808 passed / 3,812 assertions**.
- 12 flagged migrations (raw SQL/CHECK/json_extract/enum ALTER) all applied successfully on MariaDB 10.4.

## Version delta remaining: 10.4 → 10.5
MariaDB 10.5 is backward-compatible for everything in this schema (it adds features; doesn't remove the CHECK/JSON/enum behaviors used). Residual risk: **LOW** but *unproven on the exact target version*.

## Status: **PASS (10.4) / PARTIAL (10.5)**
- Exact-version 10.5 rehearsal: **BLOCKED** — Docker not installed on this machine.
- Recommended (optional) closure: `docker run -d -p 3307:3306 mariadb:10.5` once Docker Desktop is available, or accept 10.4 evidence + verify `migrate:status` clean on the Hostinger DB before going live (the live run itself is the confirmation, with backup+rollback per runbook).

## Exit criteria
- [x] Isolated DB used (pawesome_test) — [x] full migration chain succeeds — [x] schema verified via suite — [ ] exact 10.5 verified (documented gap, low risk)
