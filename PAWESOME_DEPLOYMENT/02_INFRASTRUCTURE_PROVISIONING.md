# 02 — Infrastructure Provisioning (Verified Live)

Date: 2026-11-28 · Status: **COMPLETE — all items verified against live platforms**

## Railway (backend + database)

| Item | Status | Evidence |
|---|---|---|
| Backend service `pawesome` | ✅ Running | `railway deployment list` — deployment `66e2c58f` SUCCESS (commit `c6158980`); `/api/health` → HTTP 200 `{"status":"ok","success":true,"message":"OK"}` |
| Public API domain | ✅ Active + HTTPS | `https://pawesome-production-c73a.up.railway.app` — TLS valid, health endpoint reachable |
| MySQL service | ✅ Running | Internal `mysql.railway.internal:3306`, db `railway`, volume `mysql-volume` at `/var/lib/mysql` |
| Backend storage volume | ✅ Mounted | `RAILWAY_VOLUME_MOUNT_PATH=/app/storage/app`, volume `pawesome-volume` — write/read verification in report 07 |
| Deploy config | ✅ | `backend/Dockerfile` + `backend/railway.json` (preDeploy `migrate --force`, healthcheck `/api/health`, restart ON_FAILURE×5) |
| Git source | ✅ | Repo `llanetageraldrudolph-commits/pawesome`, branch `main`, root `/backend`; deploys gated on GitHub CI check suite |

## Vercel (frontend)

| Item | Status | Evidence |
|---|---|---|
| Project `pawesome` | ✅ | Team `llanetageraldrudolph-2990s-projects` |
| Git source | ✅ | Repo `GeraldEumag/pawesome_capstone`, branch `main` — push triggered production deploy automatically |
| Root/build/output | ✅ | `frontend/`, `npm run build`, output `build/` (`frontend/vercel.json`) |
| Production deploy | ✅ | Deployment `pawesome-k7njvp0c5-…vercel.app` — Ready, 35s build, promoted to production alias |
| Production alias | ✅ | `https://pawesome-iota.vercel.app` serves new bundle (see report 08) |
| `VITE_API_BASE_URL` | ✅ Fixed | Was **empty** (latent defect — frontend had no API target). Set to `https://pawesome-production-c73a.up.railway.app/api`; verified baked into deployed JS bundle |

## Cross-service connectivity

| Check | Result |
|---|---|
| Frontend → backend URL | `https://pawesome-production-c73a.up.railway.app/api` embedded in bundle |
| Backend CORS origin | `CORS_ALLOWED_ORIGINS=https://pawesome-iota.vercel.app` (exact match, credentials=true) |
| Sanctum stateful domain | `pawesome-iota.vercel.app` |
| `FRONTEND_URL` | `https://pawesome-iota.vercel.app` (email links point at frontend) |

## Infrastructure verification results

- Backend service running: **YES** (health 200)
- MySQL reachable from Laravel: **YES** (migrations table populated; see report 04)
- DB credentials work: **YES** (pre-deploy dump succeeded via `railway connect`/mysql client)
- Persistent storage mounted: **YES** (volume env vars present; functional write/read test in report 07)
- HTTPS active: **YES** (both domains, valid TLS)
- `/api/health` reachable: **YES** — HTTP 200
- No localhost/XAMPP dependency in production path: **YES** (API URL is Railway domain; localhost strings in bundle are library internals only)

## Notes

- Railway deploys are **gated on the GitHub CI check suite**. Commit `4a1d4b59` was auto-skipped (`skippedReason: CI check suite failed`) because the `backend` CI job failed at `composer audit`. Resolved by `03bb8024` (see report 00).
- A `redeploy` of the previous deployment was attempted during diagnosis and built stale commit `c6158980`; it succeeded and restored service on old code until the CI-gated deploy of `b6fc14d0` completes.
