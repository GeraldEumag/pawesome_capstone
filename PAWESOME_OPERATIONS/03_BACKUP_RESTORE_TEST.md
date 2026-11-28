# 03 — Backup Restore Test

**Status:** PASS
**Date:** 2026-11-28
**Artifact tested:** the *actual first production backup*
(`db/20261128-114920.sql.gz`, manifest SHA-256 `d094f812…`)

Per engagement rules: the test was an **isolated restore** — production was
never touched. No `migrate:fresh`/`db:wipe`/rollback was run anywhere.

## Procedure

1. Downloaded `20261128-114920.sql.gz` from the prod container over
   `railway ssh` as base64 (binary-safe), decoded locally.
   - Downloaded size: **1,017,714 bytes — byte-exact match** to manifest.
   - `gzip -t` → valid.
2. Created scratch database `pawesome_restore_check` on local MySQL
   (XAMPP), imported the dump with the mysql client.
3. Compared restored table/row counts against the live production counts
   captured in the Phase-0 baseline.

## Results

| Check | Production | Restored | Match |
|---|---:|---:|---|
| Tables | 98 | 98 | ✅ |
| users | 49 | 49 | ✅ |
| customers | 36 | 36 | ✅ |
| pets | 25 | 25 | ✅ |
| appointments | 31 | 31 | ✅ |
| sales | 21 | 21 | ✅ |
| inventory_items | 846 | 846 | ✅ |
| email_deliveries | 441 | 441 | ✅ |
| jobs | 0 | 0 | ✅ |
| migrations | 193 | 193 | ✅ |

Dump structure verified: header comment with timestamp + source DB,
`SET FOREIGN_KEY_CHECKS=0`, `DROP TABLE IF EXISTS` + `CREATE TABLE` +
`INSERT` batches per table — imports cleanly in a single pass, no errors.

## Storage artifact verification

`storage/20261128-114920.zip` verified on the prod container (ZipArchive):
opens cleanly, 158 entries, contents extractable, all `pet_photos/` objects
present. A full unzip-restore was not performed locally (55.9 MB, same
volume); file-level readability + zip integrity + manifest SHA-256 are the
verification evidence. Restore steps are in the runbook.

## Conclusion

The backup pipeline produces **restorable** artifacts: the database dump
imports into a clean schema with exact row-count parity, and the storage
archive is structurally sound. Combined with the daily 19:00 UTC schedule
and 30-day retention, Phase 1's core requirement — *verified* automated
backups — is met. The outstanding item is **off-site replication** (same
volume today), tracked as an accepted risk pending object-storage
credentials.
