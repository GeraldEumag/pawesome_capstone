# 04 — Database Deployment & Migration Safety

## Migration-count discrepancy — RESOLVED

Prior reports cited "195 migrations" (a raw `ls | wc -l`) vs "193
records" in the `migrations` table / restored DB. Investigation:

- `database/migrations/` contains **193 `.php` migration files** +
  **2 `.php.bak` backup files** (`2026_04_24_...fix_cascade_delete_risks.php.bak`,
  `2026_05_21_...php.bak`) — inert, never executed (Laravel only loads
  `*.php`).
- `migrations` table: **193 rows**, 1:1 match with the 193 files
  (`comm` diff: zero unmatched either direction).
- Isolated restore test earlier: `migrations` count = **193** —
  consistent.
- CI migrates the same chain on MySQL 8.0 — green.

**Conclusion: no discrepancy. 193 migrations, 193 applied, perfect
parity.** The `.bak` files are harmless clutter (tracked in git);
optional cleanup, not a defect.

## Pre-migration checklist (for Railway MySQL)

| # | Check | Status |
| --- | --- | --- |
| 1 | DB exists & empty (fresh Railway MySQL) or state understood | ⏳ user action |
| 2 | App DB user least-privilege (no DROP/GRANT OPTION ideally) | ⏳ user action |
| 3 | Connectivity from backend (private network host) | ⏳ post-deploy verify |
| 4 | MySQL version — Railway provides MySQL 8 | ⏳ verify at provisioning |
| 5 | Backup mechanism exists BEFORE first migrate | ⏳ see report 05 |
| 6 | Pending migrations reviewed | ✅ done (report below) |
| 7 | Destructive ops reviewed | ✅ done |
| 8 | Lock-window plan | ✅ low-traffic window |

## Migration risk recap (from release audit report 04, re-verified)

- **~180 additive** (`create_*`, nullable `add_*`, indexes) — safe.
- **Enum rebuilds:** `service_requests.status` (raw MODIFY ×2),
  `holidays.type` (`->change()`) — brief table locks on MySQL; run in
  low-traffic window. Tables are small-to-moderate.
- **Data migrations:** holiday-calendar upsert (idempotent), ward-bed
  seed, `retire_vet_appointments`, identity tombstones — reviewed.
- **Irreversible drops (5):** controlled-drug tables, visit
  estimates/dispensations, triage workflow, work_schedules — feature
  removals, `down()` lossy/no-op. One-way by design; fresh prod DB runs
  them once in sequence — correct.
- **Guarded duplicates:** `service_requests` create ×2 (hasTable guard),
  pets profile fields ×2 — safe.

## Execution plan (after approval)

```
# Railway preDeployCommand already runs: php artisan migrate --force
# Manual equivalent if preferred:
php artisan migrate --force        # NEVER migrate:fresh/db:wipe/migrate:refresh
php artisan migrate:status         # expect 193 Ran, 0 Pending
```

- First deploy on empty DB: all 193 run in batch order — expect a few
  minutes (enum rebuilds + indexes on empty tables are instant).
- Recovery = restore verified backup (report 05), NOT `migrate:rollback`.

**Status: READY — pending provisioning + backup gate.**
