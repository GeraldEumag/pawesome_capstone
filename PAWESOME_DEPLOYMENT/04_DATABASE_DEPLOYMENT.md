# 04 — Database Pre-Deployment Safety & Migration Execution

Date: 2026-11-28

## Pre-deployment backup (mandatory gate) — COMPLETED

| Step | Result |
|---|---|
| Target DB verified | Railway MySQL `railway` @ `mysql.railway.internal` — the intended production DB (only DB in project) |
| Existing-data check | Production DB contains real operational data (61 `INSERT INTO` batches in dump — users, sales, items, bookings). `migrate --force` is additive/idempotent for already-applied migrations; `migrations` table governs what runs. |
| Backup created | `mysqldump` via Railway → `PAWESOME_DEPLOYMENT/evidence/prod_backup_predeploy_20261128_1808.sql` — **3,087,450 bytes (≈3.0 MB)** |
| Backup integrity | 98 `CREATE TABLE`, 61 `INSERT INTO`, dump footer `Dump completed on 2026-11-28 10:08:40` — **non-empty, complete** |
| Backup accessible | Stored in repo evidence dir + obtainable by recovery operator via same `railway connect` path |
| Storage backup | `storage/app` = 48 MB / 819 files per prior audit; persistent volume `pawesome-volume` — Railway volume snapshots are the recovery path (see report 05) |

## Migration state discovered in backup

The dump's `migrations` inserts show the latest applied migration is `2026_11_24_000002` — i.e. **the production database is already migrated through the newest migration file**. `php artisan migrate --force` on deploy is therefore expected to be a **no-op** (zero pending migrations). This also means the two enum-rebuild and five irreversible-drop migrations ran long ago — no migration-window risk remains for this deployment.

## Migration execution

- Command run: `php artisan migrate --force` via `railway.json` `preDeployCommand` on each deployment.
- Forbidden commands (`migrate:fresh`, `db:wipe`, `migrate:rollback`, blanket seeders): **not run** — confirmed by deploy config and by post-deploy row parity.
- Failure path: not triggered; no partial-migration state to recover.

## Post-deploy verification

- Pending migrations after deploy: **0** (verified via `railway ssh` → `php artisan migrate:status` / row counts — see report 07).
- Row-count spot parity vs backup: `users`, `sales`, `items` unchanged (no destructive ops).

## Recovery procedure (documented, not needed)

1. `railway connect` MySQL → `mysql -u root -p railway < prod_backup_predeploy_20261128_1808.sql`
2. Storage: restore `storage/app` from Railway volume snapshot.
3. Never `migrate:rollback` in production.
