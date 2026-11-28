# 07 — Backend Deployment (Verified Live)

Date: 2026-11-28 · Final live deployment: `688b646c` — commit `20fe0c53`

## Deployment chain executed

| Deployment | Commit | Outcome |
|---|---|---|
| `6291d062` | `4a1d4b59` | **SKIPPED** — `skippedReason: CI check suite failed` (backend CI `composer audit` step: 9 Symfony advisories) |
| `66e2c58f` | `c6158980` | SUCCESS — manual redeploy of stale commit (diagnostic; restored service on old code) |
| `4aebaa60` | `03bb8024` | SUCCESS — Symfony patch bump, CI green |
| `0c7b9d7d`/`471b65e5` | `b6fc14d0` | SUCCESS — railway.json worker loop + `APP_TIMEZONE=UTC` env fix |
| `688b646c` | `20fe0c53` | **CURRENT LIVE** — scheduler-based queue drain |

## Post-deploy verification (all executed against live service)

| Check | Result | Evidence |
|---|---|---|
| Railway healthy | ✅ | deployment `688b646c` SUCCESS; `/api/health` → `{"status":"ok","success":true,"message":"OK"}` HTTP 200 |
| Laravel boots / config loads | ✅ | deploy logs: `Configuration cached successfully`, `Nothing to migrate` |
| `storage:link` | ✅ | deploy logs: `[public/storage] link has been connected` |
| DB connectivity | ✅ | all authenticated API calls + tinker queries succeeded against `mysql.railway.internal` |
| Migrations | ✅ | `Nothing to migrate` — prod DB already at latest migration (verified via pre-deploy dump) |
| HTTPS | ✅ | valid TLS; HTTP→HTTPS 301 |
| Startup errors in logs | ✅ none | deploy logs clean; `LOG_LEVEL=error` |
| Secrets in logs | ✅ none observed | no credential material in deploy/runtime log output |

## Defects found & fixed during deployment

1. **CI gate / composer audit** → `03bb8024` (9 advisories cleared; 1298 tests pass).
2. **`APP_TIMEZONE=Asia/Manila` misconfiguration** → set `APP_TIMEZONE=UTC`. `config/app.php` documents: *"Stored datetimes are UTC; the app timezone must stay UTC so Eloquent hydrates them correctly. Business-local semantics (Asia/Manila) are handled explicitly through `ServiceDurationService::STORE_TIMEZONE`.*" Under Manila, Eloquent hydrated UTC-stored datetimes as Manila → all API datetimes shifted −8h (observed live: booking stored `2026-12-01 02:00` UTC emitted `2026-11-30T18:00:00Z`; after fix emits `2026-12-01T02:00:00Z` = correct). **Correction to earlier go-live recommendation of Asia/Manila — UTC is required.**
3. **Queue worker absent** → Railway service start command is dashboard-managed (`storage:link --force`, no queue loop — overrides railway.json). Fixed via scheduled `queue:work --stop-when-empty` drain in `routes/console.php` (`20fe0c53`); verified executing in deploy logs.

## Process verification (live)

- `schedule:work` running — `email-deliveries:dispatch` every minute, `:reconcile` every 10 min (deploy logs).
- Queue drain running — `queue:work database --queue=emails,receipts,default --stop-when-empty --max-time=55` executed 11:03 (deploy logs).
- Manual `queue:work` via `railway ssh` drained 12-job backlog; `jobs=0`, `failed_jobs=0` after.
- Storage volume `/app/storage/app` = mounted ext4 volume (`/dev/zd28688`, 434M) — write verified (317KB PDF + pet photo PNG).
