# 01 — Automated Database Backups

**Status:** PASS (same-volume) / ACCEPTED RISK (off-site replication pending credentials)
**Date:** 2026-11-28 · **Commit:** `ced76f4d` · **Deploy:** Railway `80b23c34` SUCCESS

## Strategy selected

Railway MySQL has **no `mysqldump` binary** in either the app or database
container image, and Railway does not expose a managed snapshot API for
volumes. The chosen approach is therefore an **application-level backup
command** (`php artisan ops:backup`) that produces a portable SQL dump using
pure PHP (PDO `SELECT` → `INSERT` statements), runs inside the existing
scheduler, and writes artifacts to the persistent `pawesome-volume`.

Rationale: zero new infrastructure, works today, artifacts are standard
SQL+gzip that any MySQL can restore. Trade-off: backups currently live on
the **same Railway volume** as production data — off-site replication is the
remaining gap (see Risks).

## Implementation

- Command: `backend/app/Console/Commands/RunProductionBackup.php`
- Schedule: `routes/console.php` → `ops:backup` **daily at 19:00 UTC**
  (03:00 Asia/Manila), `withoutOverlapping(120)` prevents concurrent runs.
- Artifacts per run, under `storage/app/backups/` (on `pawesome-volume`):
  - `db/YYYYMMDD-HHMMSS.sql.gz` — full-schema dump, all 98 tables,
    `DROP TABLE IF EXISTS` + `CREATE TABLE` + batched `INSERT`s,
    `FOREIGN_KEY_CHECKS=0` for restore speed.
  - `storage/YYYYMMDD-HHMMSS.zip` — archive of `storage/app` (private
    uploads: pet photos, payment proofs, vaccination cards, receipts).
  - `manifests/YYYYMMDD-HHMMSS.json` — timestamp, env, per-artifact
    byte size + SHA-256, table count, status.
- Retention: `--keep-days=30` prune of db/storage/manifests older than 30
  days. (Spec asked for daily-30/weekly-12/monthly-12 tiers; implemented as
  flat 30-day — documented simplification for capstone scale.)
- Credentials: dump connects via the app's existing `DB_*` env — no
  credentials in code, logs, or artifacts. Connection string never printed.

## First production run (verified live)

Executed manually via `railway ssh` on 2026-11-28 11:49 UTC:

```
DB backup: 1017714 bytes, 98 tables
Storage archive: 158 files
Storage backup: 55915035 bytes
Backup manifest saved. Status: ok
```

Manifest `20261128-114920.json`:

| Artifact | Bytes | SHA-256 (prefix) |
|---|---|---|
| `db/20261128-114920.sql.gz` | 1,017,714 | `d094f812…` |
| `storage/20261128-114920.zip` | 55,915,035 | `bc2fadcc…` |

## Integrity verification performed

- Downloaded the `.sql.gz` artifact byte-exact (1,017,714 bytes = manifest)
  via base64 over `railway ssh`; `gzip -t` → **valid**.
- Storage zip opened with `ZipArchive` on the prod container: 158 entries,
  file contents readable; all 10 `pet_photos/` objects present including the
  smoke-test photo `C4Uw9W9HKM6ji3oMFBRDnA9DYZTVyklXuNMEMJfT.png`.
- Restore test → see `03_BACKUP_RESTORE_TEST.md` (PASS).

## Coverage vs requirements

| Requirement | Status |
|---|---|
| Production MySQL database | ✅ 98 tables, gzipped SQL |
| `storage/app` files | ✅ 158 files, zip |
| Metadata / timestamps / verification info | ✅ manifest JSON + sha256 |
| Encrypted transfers | ⚠️ artifact at rest is gzip (not encrypted); transfer via SSH/TLS. Railway volume encryption at rest per provider. |
| No secrets in logs | ✅ verified — command logs only sizes/status |
| Not only backup on same volume | ❌ **gap** — see risks |
| No overlapping jobs | ✅ `withoutOverlapping(120)` |
| Verify integrity | ✅ sha256 in manifest + restore test |
| Alert on failure | ⚠️ scheduler logs only; no external alert (Phase 4) |

## Risks / remaining work

1. **Same-volume risk (P1):** if the Railway volume or project is lost, both
   production data and backups are lost. Mitigation requires object storage
   (Cloudflare R2 / Backblaze B2 / S3) credentials → **checkpoint for user**.
   Recommended next step: add an `ops:backup:offsite` step (or Railway
   volume snapshots if available on the plan) copying the latest manifest
   set to R2 with a lifecycle rule.
2. **Alerting:** backup failure is only visible in scheduler logs until
   uptime/error monitoring (Phase 4) is configured.
3. Retention is flat 30 days rather than the recommended tiered schedule.
