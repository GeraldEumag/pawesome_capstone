# 05 — Backup Configuration

## Proven capability (from release audit — executed)

- `mysqldump --single-transaction --routines --triggers` → 6.1 MB dump
- Isolated restore → scratch DB → row-count parity verified
- `storage/app` = 48 MB / 819 files inventoried

## Production backup design (to configure — PENDING USER ACTION)

### Database — recommended: Railway-native + scheduled dump

| Layer | Implementation | Status |
| --- | --- | --- |
| Provider snapshots | Railway MySQL volume backups (if plan supports) — enable in dashboard | ⏳ |
| Scheduled logical dump | Cron on a worker/ops box OR Railway cron service: `mysqldump --single-transaction --hex-blob pawesome > backup-$(date +%F).sql.gz` | ⏳ |
| Off-site copy | Upload to S3/R2/Backblaze B2 (separate account/bucket) | ⏳ |
| Encryption | `gpg -c` or provider-side encryption at rest | ⏳ |
| Retention | Daily ×30 → weekly ×12 → monthly ×12 | ⏳ policy |
| Access control | Backup bucket separate credentials; no public access | ⏳ |

### File storage

- `storage/app` (48 MB) → nightly `tar` archive to same off-site bucket,
  OR if `*_STORAGE_DRIVER=s3` later: bucket versioning.
- Keep file backups in the **same window** as DB dumps for referential
  consistency.

### Integrity verification

- Weekly automated restore-to-scratch + row-count check (pattern proven
  in release audit report 05 — script can be adapted).
- First production backup MUST be taken **before** first `migrate`.

### Pre-deployment backups (gate)

| Artifact | Status |
| --- | --- |
| Fresh DB dump stored off-host | ⏳ at deploy time |
| Fresh `storage/app` archive | ⏳ at deploy time |
| Both verified restorable | ✅ procedure proven; re-verify on prod artifact |

### RPO / RTO (carried forward)

- RPO ≤ 24 h (daily dumps; ≤1 h if PITR/binlog enabled)
- RTO ≤ 4 h

### Quarterly drill

Restore latest backup to scratch environment, run smoke queries,
document timing. Assign primary + backup operator (report 11).

**Status: NOT CONFIGURED — procedure proven, schedule pending user action.**
This is a go-live gate: first production migration must not run without
the pre-deploy backup artifacts existing.
