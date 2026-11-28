# 05 — Backup and Disaster Recovery Activation

Date: 2026-11-28

## What exists now (verified)

| Asset | State |
|---|---|
| Railway MySQL volume `mysql-volume` (`/var/lib/mysql`) | Persistent — survives redeploys; Railway volume snapshots available in dashboard |
| Backend volume `pawesome-volume` (`/app/storage/app`) | Persistent — pet photos, payment proofs, generated PDFs survive restarts/redeploys |
| Pre-deploy DB backup | `evidence/prod_backup_predeploy_20261128_1808.sql` (3.0 MB, integrity-verified) |
| Prior restore proof | 6.1 MB dump → isolated `pawesome_restore_test` restore → row parity (users 102, sales 48, items 920, migrations 193) — procedure proven end-to-end in earlier engagement |

## Recovery procedure (verified steps)

**Database:**
```bash
railway connect          # opens tunnel to MySQL service
mysql -h 127.0.0.1 -P <port> -u root -p railway < prod_backup_predeploy_*.sql
```
**Storage:** Railway dashboard → project `pawesome` → volume `pawesome-volume` → restore from snapshot, or `railway ssh` + copy from snapshot mount.

## Status vs. requirement

| Requirement | Status |
|---|---|
| Actual backup created and verified | ✅ pre-deploy dump verified (98 tables, complete footer) |
| Backups not only inside disposable container | ✅ Railway volumes persist independently of deploys |
| Database restore instructions documented | ✅ above + prior proven restore |
| Storage files restorable | ✅ via volume snapshots (Railway-native) |
| Scheduled automated backups | ⚠️ **PARTIAL** — Railway volume snapshots are manual/scheduled-per-plan; no off-site encrypted copy configured yet. Recommend: scheduled `mysqldump` → S3/R2/B2 + retention daily×30/weekly×12/monthly×12 |
| Backup-failure alerting | ❌ not configured (no monitoring integration) |
| Recovery responsibility assigned | ⚠️ template in `PAWESOME_GO_LIVE/11` — owner assignment pending |

## Honest assessment

Point-in-time recovery exists (volume snapshots + proven restore path), but **automated scheduled off-site backups are not yet active**. This is a P2 operational gap, not a deployment blocker for initial go-live — but it must be scheduled before real customer data accumulates. Recorded as accepted-risk candidate in report 12.
