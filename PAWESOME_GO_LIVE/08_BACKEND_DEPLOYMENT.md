# 08 — Backend Deployment

## Status: BLOCKED — awaiting infrastructure provisioning

No Vercel/Railway/MySQL resources exist yet (report 02 — all items
PENDING USER ACTION). I cannot deploy without:

1. Railway project + backend service (root `backend/`, Dockerfile)
2. Railway MySQL service + credentials
3. Persistent volume at `/app/storage/app`
4. All env vars from report 03 set in Railway Variables
5. API public domain
6. Pre-deploy backups (report 05 gate)

## Pre-deploy verification (ready to execute)

- [x] Release commit `8a6ddda6` verified (descends from `b952fa66`)
- [x] Dockerfile reviewed — PHP 8.2, all required exts (gd optional,
      PDF proven working without it)
- [x] `railway.json` reviewed — preDeploy migrate, storage:link,
      schedule:work, healthcheck `/api/health`
- [x] Env var list finalized (report 03)
- [x] Migration plan reviewed — 193 migrations, risk categories documented
- [ ] Docker build on Railway (first deploy will exercise it)
- [ ] Env vars set
- [ ] Volume mounted
- [ ] Backup taken

## Post-deploy verification checklist (prepared, will execute)

- [ ] Container starts; `railway` deployment status = SUCCESS
- [ ] `GET https://<api-domain>/api/health` → 200 `{"status":"ok"}`
- [ ] `GET https://<api-domain>/up` → 200
- [ ] `GET https://<api-domain>/.env` → 404/403
- [ ] `php artisan migrate:status` → 193 Ran / 0 Pending
- [ ] `storage:link` created; `storage/app` writable (upload test)
- [ ] `schedule:work` loop in logs; no fatal errors in `laravel.log`
- [ ] HTTPS valid; `APP_URL` generates https links
- [ ] Queue worker service healthy (if database queue)

**No deployment performed — no authorization/credentials exist.**
