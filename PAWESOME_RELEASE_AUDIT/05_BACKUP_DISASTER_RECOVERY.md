# 05 — Backup and Disaster Recovery

## Verified restore test (performed, not assumed)

Executed against the local XAMPP MySQL on 2026-11-28:

1. **Backup generated:**
   `mysqldump -u root --single-transaction --routines --triggers pawesome`
   → `PAWESOME_RELEASE_AUDIT/pawesome_backup_test.sql` — **6,092,526 bytes
   (~6.1 MB)**, non-blocking (`--single-transaction` = InnoDB-consistent
   snapshot, no table locks).
2. **Restore target:** isolated scratch DB `pawesome_restore_test`
   (created for this test only; live `pawesome` untouched).
3. **Restore:** `mysql -u root pawesome_restore_test < dump.sql` — clean,
   no errors.
4. **Integrity verification** — row counts source vs restored:

   | Table | Source | Restored | Match |
   | --- | --- | --- | --- |
   | users | 102 | 102 | ✓ |
   | sales | 48 | 48 | ✓ |
   | inventory_items | 920 | 920 | ✓ |
   | migrations | 193 | 193 | ✓ |

   ~100 tables restored; `migrations` count parity confirms schema+data
   both came through.
5. **File storage:** `backend/storage/app` = **48 MB / 819 files**
   (`private/` 47 MB: payment-proofs, pet_photos, vaccination_cards,
   inventory-evidence; `public/` 56 KB). Backup = directory archive or
   S3 sync — trivially small at current scale.

**Result: database backup → restore → verify cycle PROVEN end-to-end.**

## Recommended production backup strategy

### Database

| Parameter | Recommendation |
| --- | --- |
| Method | `mysqldump --single-transaction --routines --triggers --hex-blob` (add `--hex-blob` for binary safety) OR provider-native snapshot (Railway MySQL volumes / managed backup) |
| Frequency | **Daily** minimum; **hourly binlog/WAL** if the platform supports point-in-time recovery |
| Retention | Daily ×30, weekly ×12, monthly ×12 |
| Encryption | Encrypt at rest (provider volume encryption) + encrypt backup files before off-site copy |
| Off-site | Copy to second region/object storage (S3/R2) — never keep backups only on the DB host |
| Integrity check | Weekly automated restore to scratch DB + row-count sanity (the procedure proven above) |
| Access | Backup credentials separate from app DB user; least-privilege |

### Files

- `storage/app/private` + `storage/app/public` → nightly archive or
  continuous S3 sync. If `PRIVATE_STORAGE_DRIVER=s3`, provider
  versioning/bucket backup covers it; still snapshot the bucket.
- Include `storage/app` in the same backup window as the DB dump so
  file↔record references stay consistent.

### Recovery objectives

| Metric | Target | Basis |
| --- | --- | --- |
| **RPO** | ≤ 24 h (daily backup); ≤ 1 h if PITR enabled | Business-hours clinic; losing a day of bookings/payments is tolerable, losing a week is not |
| **RTO** | ≤ 4 h | Provision host (~30 min) + restore DB (~10 min at 6 MB) + files (~5 min) + config/deploy (~1 h) + verification (~1 h) |

### Recovery procedure (runbook-level)

1. Provision replacement DB; create empty schema.
2. `mysql <latest_backup>.sql` (or provider restore).
3. Restore `storage/app` archive to the new host's storage path (or
   re-point `PRIVATE/PUBLIC_STORAGE_DRIVER` at the restored S3 bucket).
4. Deploy the **same code commit** that wrote the data (check
   `migrations` table max batch vs code expectations).
5. Set env, `storage:link`, caches, start workers/scheduler.
6. Verify: login, row counts, a POS sale read, an invoice PDF render,
   email outbox drains.
7. Cut DNS/traffic over.

### Responsible operator

Capstone team / whoever holds hosting credentials — must be **two
named people** (primary + backup) per ROLE_SOPS.md convention.

## Gaps / actions

- **No automated backup exists yet** — this is a deploy-time task
  (cron `mysqldump` + off-site copy, or provider snapshots). The
  *procedure* is proven; the *schedule* must be configured.
- Point-in-time recovery (binlog) not evaluated — recommend enabling if
  the chosen MySQL host supports it.
- Backup encryption at rest depends on chosen provider — verify at
  provisioning.
- Quarterly restore drill recommended (the isolated-restore pattern
  used here takes <15 min at current data size).

**Status: PARTIALLY VERIFIED** — restore mechanics proven on real data;
production scheduling/encryption/off-site copy are NOT VERIFIED until
hosting is provisioned (owner actions listed above).
